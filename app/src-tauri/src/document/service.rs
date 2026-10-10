/**
 * PMTool · Document Engine 服务层（2026-09-18）
 *
 * 职责：编排 Repository + Model + Storage，暴露统一文档能力：
 *   create / get / update（含版本冲突）/ list / version_list / delete
 *   export（Markdown/RichText → DOCX，走 engine）
 *
 * 边界：本层不实现具体格式转换（Engine 负责），不做业务逻辑（知识/报告由调用方决定）。
 * 依赖方向：业务模块 → Document Service → Document Engine → Format Engine，严禁反向。
 */

use crate::document::adapter;
use crate::document::engine;
use crate::document::model::{
    space_type_as_db, space_type_from_db, DocContent, DocType, PmDocument, PmDocumentMeta,
    PmDocumentVersionMeta, RichBlock, SpaceType,
};
use crate::document::storage::DocumentStorage;
use crate::document::version::SaveOutcome;
use crate::document::version;
use crate::repositories::document as doc_repo;
use crate::repositories::document_versions as ver_repo;
use rusqlite::Connection;

pub struct DocService {
    pub storage: DocumentStorage,
}

impl DocService {
    pub fn new(storage: DocumentStorage) -> Self {
        Self { storage }
    }

    fn gen_doc_id() -> String {
        use std::time::{SystemTime, UNIX_EPOCH};
        // 整秒 + 亚秒纳秒都参与，避免不同秒落在同一亚秒值导致 doc_id 碰撞
        let d = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|x| x.as_nanos())
            .unwrap_or(0);
        format!("doc_{:x}", d)
    }

    // ---------- create ----------
    pub fn create(
        &self,
        conn: &Connection,
        doc_type: DocType,
        title: &str,
        space_type: Option<SpaceType>,
        ref_id: Option<i64>,
        content: &DocContent,
    ) -> Result<PmDocument, String> {
        let doc_id = Self::gen_doc_id();
        let row = doc_repo::create(
            conn,
            &doc_repo::NewDocument {
                doc_id: doc_id.clone(),
                doc_type: doc_type.as_str().to_uppercase(),
                title: title.to_string(),
                space_type: space_type_as_db(space_type),
                ref_id,
                storage_path: None,
            },
        )
        .map_err(|e| format!("创建文档失败：{}", e))?;

        let (db_content, content_type, content_md) = content_to_db(content);
        ver_repo::insert(
            conn,
            &ver_repo::NewVersion {
                document_id: row.id,
                version: 1,
                content: Some(db_content),
                content_type,
                content_md,
                created_by: "USER".to_string(),
            },
        )
        .map_err(|e| format!("写入文档版本失败：{}", e))?;

        self.get(conn, &doc_id)
    }

    // ---------- get ----------
    pub fn get(&self, conn: &Connection, doc_id: &str) -> Result<PmDocument, String> {
        let row = doc_repo::get_by_doc_id(conn, doc_id)
            .map_err(|e| format!("读取文档失败：{}", e))?
            .ok_or_else(|| format!("文档不存在：{}", doc_id))?;
        let ver = ver_repo::latest(conn, row.id)
            .map_err(|e| format!("读取文档版本失败：{}", e))?
            .ok_or_else(|| format!("文档无版本：{}", doc_id))?;
        Ok(to_pm_document(&row, &ver))
    }

    // ---------- update（含版本冲突） ----------
    pub fn update(
        &self,
        conn: &Connection,
        doc_id: &str,
        base_version: Option<u64>,
        content: &DocContent,
        create_new_version: bool,
    ) -> Result<SaveOutcome, String> {
        let row = doc_repo::get_by_doc_id(conn, doc_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| format!("文档不存在：{}", doc_id))?;
        let current = row.current_version as u64;

        // 冲突检测（仅当调用方带 baseVersion）
        if let Some(outcome) = version::check_conflict(base_version, current) {
            return Ok(outcome);
        }

        let (db_content, content_type, content_md) = content_to_db(content);

        if create_new_version {
            let new_version = current + 1;
            ver_repo::insert(
                conn,
                &ver_repo::NewVersion {
                    document_id: row.id,
                    version: new_version as i64,
                    content: Some(db_content),
                    content_type,
                    content_md,
                    created_by: "USER".to_string(),
                },
            )
            .map_err(|e| format!("写入新版本失败：{}", e))?;
            doc_repo::bump_current_version(conn, row.id).map_err(|e| e.to_string())?;
            Ok(SaveOutcome::Saved { new_version })
        } else {
            // 删旧插新用事务包裹：插入失败时回滚，绝不丢失当前版本行
            // （unchecked_transaction：连接由上层 Mutex 独占，无并发风险；transaction() 需要 &mut）
            let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
            ver_repo::delete_version(&tx, row.id, current as i64).map_err(|e| e.to_string())?;
            ver_repo::insert(
                &tx,
                &ver_repo::NewVersion {
                    document_id: row.id,
                    version: current as i64,
                    content: Some(db_content),
                    content_type,
                    content_md,
                    created_by: "USER".to_string(),
                },
            )
            .map_err(|e| format!("更新当前版本失败：{}", e))?;
            tx.commit().map_err(|e| e.to_string())?;
            Ok(SaveOutcome::Saved { new_version: current })
        }
    }

    // ---------- list ----------
    pub fn list(
        &self,
        conn: &Connection,
        space_type: Option<SpaceType>,
        ref_id: Option<i64>,
    ) -> Result<Vec<PmDocumentMeta>, String> {
        let rows = match space_type {
            Some(st) => doc_repo::list_by_space(conn, &space_type_as_db(Some(st)).unwrap_or_default(), ref_id)
                .map_err(|e| e.to_string())?,
            None => doc_repo::list_all(conn).map_err(|e| e.to_string())?,
        };
        Ok(rows.into_iter().map(|r| to_meta(&r)).collect())
    }

    // ---------- version_list ----------
    pub fn version_list(&self, conn: &Connection, doc_id: &str) -> Result<Vec<PmDocumentVersionMeta>, String> {
        let row = doc_repo::get_by_doc_id(conn, doc_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| format!("文档不存在：{}", doc_id))?;
        let vs = ver_repo::list_versions(conn, row.id).map_err(|e| e.to_string())?;
        Ok(vs
            .into_iter()
            .map(|v| PmDocumentVersionMeta {
                version: v.version as u32,
                content_type: v.content_type,
                created_by: v.created_by,
                created_at: v.created_at,
            })
            .collect())
    }

    // ---------- convert（richtext ⇄ markdown · 覆盖当前版本并更新类型） ----------
    pub fn convert(&self, conn: &Connection, doc_id: &str, to_type: &str) -> Result<PmDocument, String> {
        let row = doc_repo::get_by_doc_id(conn, doc_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| format!("文档不存在：{}", doc_id))?;
        let ver = ver_repo::latest(conn, row.id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| format!("文档无版本：{}", doc_id))?;
        let src_type = ver.content_type.as_str();

        // 目标类型归一
        let to = match to_type.to_ascii_lowercase().as_str() {
            "markdown" => "markdown",
            "richtext" => "richtext",
            "md" => "markdown",
            other => return Err(format!("不支持的转换目标：{}", other)),
        };

        // 已是目标类型 → 直接返回
        if src_type == "MARKDOWN" && to == "markdown"
            || src_type == "RICHTEXT" && to == "richtext"
        {
            return self.get(conn, doc_id);
        }

        let (new_content, new_db_type) = match (src_type, to) {
            ("RICHTEXT", "markdown") => {
                let blocks: Vec<RichBlock> = ver
                    .content
                    .as_deref()
                    .map(|j| serde_json::from_str(j).unwrap_or_default())
                    .unwrap_or_default();
                let md = adapter::richtext_to_markdown(&blocks);
                (DocContent::Markdown { markdown: md }, "MARKDOWN".to_string())
            }
            ("MARKDOWN", "richtext") => {
                let md = ver.content.clone().unwrap_or_default();
                let blocks = adapter::markdown_to_richtext(&md);
                (DocContent::RichText { richtext: blocks }, "RICHTEXT".to_string())
            }
            _ => return Err(format!("不支持从 {} 转到 {}", src_type, to)),
        };

        let (db_content, content_type, content_md) = content_to_db(&new_content);
        // 覆盖当前版本（保留版本号）：删旧插新 + 改类型用事务包裹，中途失败即回滚
        let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
        ver_repo::delete_version(&tx, row.id, ver.version).map_err(|e| e.to_string())?;
        ver_repo::insert(
            &tx,
            &ver_repo::NewVersion {
                document_id: row.id,
                version: ver.version,
                content: Some(db_content),
                content_type: content_type.clone(),
                content_md,
                created_by: "USER".to_string(),
            },
        )
        .map_err(|e| format!("转换写入失败：{}", e))?;
        doc_repo::update_type(&tx, row.id, &content_type).map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        self.get(conn, doc_id)
    }

    // ---------- import（外部文件 → PMTool 文档） ----------
    /// .docx → 解析为 Markdown；.md/.markdown → Markdown；其余文本 → Text
    pub fn import_text(
        &self,
        conn: &Connection,
        file_path: &str,
        title: &str,
        space_type: Option<SpaceType>,
        ref_id: Option<i64>,
    ) -> Result<PmDocument, String> {
        let lower = file_path.to_ascii_lowercase();
        let (doc_content, doc_type) = if lower.ends_with(".docx") {
            let md = engine::docx::docx_to_markdown(file_path)
                .map_err(|e| format!("解析 docx 失败：{}", e))?;
            (DocContent::Markdown { markdown: md }, DocType::Markdown)
        } else {
            let content = std::fs::read_to_string(file_path).map_err(|e| format!("读取文件失败：{}", e))?;
            if lower.ends_with(".md") || lower.ends_with(".markdown") {
                (DocContent::Markdown { markdown: content }, DocType::Markdown)
            } else {
                (DocContent::Text { text: content }, DocType::Text)
            }
        };
        self.create(conn, doc_type, title, space_type, ref_id, &doc_content)
    }

    // ---------- delete ----------
    pub fn delete(&self, conn: &Connection, doc_id: &str) -> Result<bool, String> {
        let row = doc_repo::get_by_doc_id(conn, doc_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| format!("文档不存在：{}", doc_id))?;
        ver_repo::delete_for_document(conn, row.id).map_err(|e| e.to_string())?;
        doc_repo::delete(conn, row.id).map_err(|e| e.to_string())?;
        // 连带清理该文档的物理产物目录（source/export/preview），避免"删了库记录、文件残留磁盘"。
        // 先删 DB 记录、成功后再清目录 —— 若 DB 删失败则不碰目录，避免数据不一致。
        let dir = self.storage.doc_dir(doc_id);
        if dir.exists() {
            std::fs::remove_dir_all(&dir)
                .map_err(|e| format!("文档已删除，但清理产物目录失败：{}（下次可手动删除 {}）", e, dir.display()))?;
        }
        Ok(true)
    }

    // ---------- generate（统一生成：DOCX / PPTX / PDF） ----------
    /// 生成文件：内容取自文档当前版本（Markdown/Text/RichText 均先归一为 Markdown）。
    pub fn generate(
        &self,
        conn: &Connection,
        doc_id: &str,
        format: GenerateFormat,
        out_name: &str,
        dest_path: Option<&str>,
    ) -> Result<PmDocument, String> {
        let pm = self.get(conn, doc_id)?;
        let markdown = content_to_markdown(&pm.content);
        let bytes = match format {
            GenerateFormat::Docx => engine::docx::markdown_to_docx(&markdown)
                .map_err(|e| format!("生成 DOCX 失败：{}", e))?,
            GenerateFormat::Pptx => engine::pptx::markdown_to_pptx(&pm.title, &markdown)
                .map_err(|e| format!("生成 PPTX 失败：{}", e))?,
            GenerateFormat::Pdf => engine::pdf::markdown_to_pdf(&pm.title, &markdown)
                .map_err(|e| format!("生成 PDF 失败：{}", e))?,
        };
        let storage_path = match dest_path {
            Some(dest) => {
                std::fs::write(dest, &bytes).map_err(|e| format!("保存失败：{}", e))?;
                dest.to_string()
            }
            None => self
                .storage
                .write_product(&pm.doc_id, "export/pub", out_name, &bytes)?,
        };
        let rid = row_id_by_doc_id(conn, doc_id)?;
        doc_repo::update_storage_path(conn, rid, Some(&storage_path))
            .map_err(|e| e.to_string())?;
        self.get(conn, doc_id)
    }

    // ---------- export（Markdown/RichText/Text → DOCX） ----------
    /// dest_path = 用户另存的目标路径（绝对）；提供则直接写目标，否则归档到 PMToolData
    pub fn export_docx(
        &self,
        conn: &Connection,
        doc_id: &str,
        out_name: &str,
        dest_path: Option<&str>,
    ) -> Result<PmDocument, String> {
        let pm = self.get(conn, doc_id)?;
        let markdown = match &pm.content {
            DocContent::Markdown { markdown } => markdown.clone(),
            DocContent::Text { text } => text.clone(),
            DocContent::RichText { richtext } => adapter::richtext_to_markdown(richtext),
            DocContent::DocxFile { .. } => return Err("文档已是 DOCX".to_string()),
        };
        let docx_bytes = engine::docx::markdown_to_docx(&markdown)
            .map_err(|e| format!("生成 DOCX 失败：{}", e))?;
        let storage_path = match dest_path {
            Some(dest) => {
                std::fs::write(dest, &docx_bytes).map_err(|e| format!("保存失败：{}", e))?;
                dest.to_string()
            }
            None => self
                .storage
                .write_product(&pm.doc_id, "export", out_name, &docx_bytes)?,
        };
        let rid = row_id_by_doc_id(conn, doc_id)?;
        doc_repo::update_storage_path(conn, rid, Some(&storage_path))
            .map_err(|e| e.to_string())?;
        self.get(conn, doc_id)
    }
}

// ============================================================
// 辅助函数
// ============================================================

fn row_id_by_doc_id(conn: &Connection, doc_id: &str) -> Result<i64, String> {
    doc_repo::get_by_doc_id(conn, doc_id)
        .map_err(|e| e.to_string())?
        .map(|r| r.id)
        .ok_or_else(|| format!("文档不存在：{}", doc_id))
}

/// 生成格式（Document Engine → DOCX / PPTX / PDF）
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GenerateFormat {
    Docx,
    Pptx,
    Pdf,
}

impl GenerateFormat {
    pub fn parse(s: &str) -> Option<Self> {
        match s.to_ascii_lowercase().as_str() {
            "docx" | "word" => Some(Self::Docx),
            "pptx" | "ppt" => Some(Self::Pptx),
            "pdf" => Some(Self::Pdf),
            _ => None,
        }
    }

    pub fn ext(&self) -> &'static str {
        match self {
            Self::Docx => "docx",
            Self::Pptx => "pptx",
            Self::Pdf => "pdf",
        }
    }
}

/// 文档内容统一归一为 Markdown（生成/导出共用）
fn content_to_markdown(content: &DocContent) -> String {
    match content {
        DocContent::Markdown { markdown } => markdown.clone(),
        DocContent::Text { text } => text.clone(),
        DocContent::RichText { richtext } => adapter::richtext_to_markdown(richtext),
        DocContent::DocxFile { docxfile } => docxfile.clone(),
    }
}

/// DocContent → (content, content_type, content_md)
fn content_to_db(content: &DocContent) -> (String, String, Option<String>) {
    match content {
        DocContent::Text { text } => (text.clone(), "TEXT".to_string(), Some(text.clone())),
        DocContent::Markdown { markdown } => (markdown.clone(), "MARKDOWN".to_string(), Some(markdown.clone())),
        DocContent::RichText { richtext } => {
            let json = serde_json::to_string(richtext).unwrap_or_else(|_| "[]".to_string());
            let md = adapter::richtext_to_markdown(richtext);
            (json, "RICHTEXT".to_string(), Some(md))
        }
        DocContent::DocxFile { docxfile } => (docxfile.clone(), "DOCX".to_string(), None),
    }
}

fn to_pm_document(row: &doc_repo::DocumentRow, ver: &ver_repo::DocumentVersionRow) -> PmDocument {
    let content = match ver.content_type.as_str() {
        "TEXT" => DocContent::Text { text: ver.content.clone().unwrap_or_default() },
        "MARKDOWN" => DocContent::Markdown { markdown: ver.content.clone().unwrap_or_default() },
        "RICHTEXT" => match &ver.content {
            Some(j) => serde_json::from_str::<Vec<RichBlock>>(j)
                .map(|v| DocContent::RichText { richtext: v })
                .unwrap_or_else(|_| DocContent::Markdown { markdown: String::new() }),
            None => DocContent::RichText { richtext: vec![] },
        },
        "DOCX" => DocContent::DocxFile { docxfile: ver.content.clone().unwrap_or_default() },
        _ => DocContent::Markdown { markdown: ver.content.clone().unwrap_or_default() },
    };
    PmDocument {
        doc_id: row.doc_id.clone(),
        doc_type: DocType::from_db(&row.doc_type),
        title: row.title.clone(),
        version: ver.version as u32,
        content,
        space_type: space_type_from_db(row.space_type.as_deref().unwrap_or("")),
        ref_id: row.ref_id,
        storage_path: row.storage_path.clone(),
        created_at: row.created_at.clone(),
        updated_at: row.updated_at.clone(),
    }
}

fn to_meta(row: &doc_repo::DocumentRow) -> PmDocumentMeta {
    PmDocumentMeta {
        doc_id: row.doc_id.clone(),
        doc_type: DocType::from_db(&row.doc_type),
        title: row.title.clone(),
        version: row.current_version as u32,
        space_type: space_type_from_db(row.space_type.as_deref().unwrap_or("")),
        ref_id: row.ref_id,
        storage_path: row.storage_path.clone(),
        created_at: row.created_at.clone(),
        updated_at: row.updated_at.clone(),
    }
}