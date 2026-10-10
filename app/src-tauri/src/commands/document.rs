/**
 * PMTool · Document Engine Tauri Commands（2026-09-18）
 *
 * 统一文档能力入口：create/get/update/list/version_list/delete/export_docx
 * 业务模块只能经此调用，不得自实现格式转换（RFC §3 依赖规则）。
 */

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::AppState;
use crate::document::model::{DocContent, DocType, PmDocument, PmDocumentMeta, PmDocumentVersionMeta, SpaceType};
use crate::document::service::DocService;
use crate::document::version::SaveOutcome;

// ============================================================
// DTO
// ============================================================

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateDocumentInput {
    #[serde(rename = "type")]
    pub doc_type: String,             // text/markdown/richtext/docx
    pub title: String,
    pub space_type: Option<String>,   // KNOWLEDGE/REPORT/PROJECT_FILE/TEMPLATE
    pub ref_id: Option<i64>,
    pub content: DocContent,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateDocumentInput {
    pub base_version: Option<u64>,
    pub create_new_version: bool,
    pub title: Option<String>,
    pub content: DocContent,
}

#[derive(Debug, Serialize)]
#[serde(tag = "outcome", rename_all = "lowercase")]
pub enum SaveResultDto {
    Saved { new_version: u64 },
    Conflict { server_version: u64, current_version: u64 },
}

fn service(state: &State<'_, AppState>) -> DocService {
    let storage = state.doc_storage.clone();
    DocService::new(storage)
}

fn space_type_of(s: Option<String>) -> Option<SpaceType> {
    s.and_then(|x| crate::document::model::space_type_from_db(&x))
}

// ============================================================
// Commands
// ============================================================

/// 新建文档 → 返回 PmDocument（含 docId / version / content）
#[tauri::command]
pub fn document_create(
    state: State<'_, AppState>,
    input: CreateDocumentInput,
) -> Result<PmDocument, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    let svc = service(&state);
    svc.create(
        &pool,
        DocType::from_db(&input.doc_type),
        &input.title,
        space_type_of(input.space_type),
        input.ref_id,
        &input.content,
    )
}

/// 获取文档（最新版本内容）
#[tauri::command]
pub fn document_get(
    state: State<'_, AppState>,
    doc_id: String,
) -> Result<PmDocument, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    let svc = service(&state);
    svc.get(&pool, &doc_id)
}

/// 更新文档（含版本冲突检测）
/// baseVersion 与当前 currentVersion 不一致 → conflict；createNewVersion=true 建新版
#[tauri::command]
pub fn document_update(
    state: State<'_, AppState>,
    doc_id: String,
    input: UpdateDocumentInput,
) -> Result<SaveResultDto, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    let svc = service(&state);
    if let Some(t) = &input.title {
        let rid = svc_row_id(&pool, &doc_id)?;
        crate::repositories::document::update_title(&pool, rid, t).map_err(|e| e.to_string())?;
    }
    let outcome = svc.update(&pool, &doc_id, input.base_version, &input.content, input.create_new_version)?;
    Ok(match outcome {
        SaveOutcome::Saved { new_version } => SaveResultDto::Saved { new_version },
        SaveOutcome::Conflict { server_version, current_version } => {
            SaveResultDto::Conflict { server_version, current_version }
        }
    })
}

/// 列出文档元信息（可按 spaceType / refId 过滤）
#[tauri::command]
pub fn document_list(
    state: State<'_, AppState>,
    space_type: Option<String>,
    ref_id: Option<i64>,
) -> Result<Vec<PmDocumentMeta>, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    let svc = service(&state);
    svc.list(&pool, space_type_of(space_type), ref_id)
}

/// 版本列表
#[tauri::command]
pub fn document_version_list(
    state: State<'_, AppState>,
    doc_id: String,
) -> Result<Vec<PmDocumentVersionMeta>, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    let svc = service(&state);
    svc.version_list(&pool, &doc_id)
}

/// 删除文档
#[tauri::command]
pub fn document_delete(
    state: State<'_, AppState>,
    doc_id: String,
) -> Result<bool, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    let svc = service(&state);
    svc.delete(&pool, &doc_id)
}

/// 导入文件建 PMTool 文档：
///   .docx → 解析正文为 Markdown 文档；.md/.markdown → Markdown 文档；其余文本 → Text 文档
/// pptx/xlsx 二进制导入暂不支持（有消费方时再扩展）。
#[tauri::command]
pub fn document_import(
    state: State<'_, AppState>,
    file_path: String,
    title: String,
    space_type: Option<String>,
    ref_id: Option<i64>,
) -> Result<PmDocument, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    let svc = service(&state);
    svc.import_text(&pool, &file_path, &title, space_type_of(space_type), ref_id)
}

/// 生成文件：把文档内容按格式产出 DOCX / PPTX / PDF
/// destPath 提供则直接写到该路径（绝对）；否则归档到 PMToolData/doc/{docId}/export/pub/
#[tauri::command]
pub fn document_generate(
    state: State<'_, AppState>,
    doc_id: String,
    format: String,
    file_name: String,
    dest_path: Option<String>,
) -> Result<PmDocument, String> {
    let fmt = crate::document::service::GenerateFormat::parse(&format)
        .ok_or_else(|| format!("不支持的生成格式：{}（支持 docx / pptx / pdf）", format))?;
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    let svc = service(&state);
    svc.generate(&pool, &doc_id, fmt, &file_name, dest_path.as_deref())
}

/// 直接由 Markdown 内容生成文件（不落 documents 表）—— 项目文件/报告导出用，避免产生垃圾文档
///
/// dest_path 提供 → 写到用户指定位置（用户**主动**导出，如项目文件/报告另存）。
/// dest_path 为空 → 默认落到<工作目录>/PMToolData/documents/（与项目数据/备份同根管理）。
///
/// 返回实际写入的绝对路径（前端据此定位/展示）。
#[tauri::command]
pub fn document_generate_inline(
    state: State<'_, AppState>,
    title: String,
    markdown: String,
    format: String,
    dest_path: Option<String>,
) -> Result<String, String> {
    let fmt = crate::document::service::GenerateFormat::parse(&format)
        .ok_or_else(|| format!("不支持的生成格式：{}（支持 docx / pptx / pdf）", format))?;
    use crate::document::service::GenerateFormat as F;
    let ext = match &fmt {
        F::Docx => "docx",
        F::Pptx => "pptx",
        F::Pdf => "pdf",
    };
    let bytes = match fmt {
        F::Docx => crate::document::engine::docx::markdown_to_docx(&markdown)
            .map_err(|e| format!("生成 DOCX 失败：{}", e))?,
        F::Pptx => crate::document::engine::pptx::markdown_to_pptx(&title, &markdown)
            .map_err(|e| format!("生成 PPTX 失败：{}", e))?,
        F::Pdf => crate::document::engine::pdf::markdown_to_pdf(&title, &markdown)
            .map_err(|e| format!("生成 PDF 失败：{}", e))?,
    };

    let target = match dest_path.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        Some(p) => p.to_string(),
        None => {
            // 默认归档 → 用户工作目录（随项目数据/备份同根）
            let dir = state
                .data_dir
                .lock()
                .map_err(|e| e.to_string())?
                .join("PMToolData")
                .join("documents");
            std::fs::create_dir_all(&dir).map_err(|e| format!("创建输出目录失败：{}", e))?;
            // 标题里 Windows 非法字符（\ / : * ? " < > |）必须清洗
            let safe: String = title
                .chars()
                .map(|c| if "\\/:*?\"<>|".contains(c) { '-' } else { c })
                .collect();
            dir.join(format!("{}.{}", safe, ext))
                .to_string_lossy()
                .to_string()
        }
    };
    std::fs::write(&target, &bytes).map_err(|e| format!("保存失败：{}", e))?;
    Ok(target)
}

/// 转换文档类型：richtext ⇄ markdown（覆盖当前版本并更新 type）
#[tauri::command]
pub fn document_convert(
    state: State<'_, AppState>,
    doc_id: String,
    to: String,
) -> Result<PmDocument, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    let svc = service(&state);
    svc.convert(&pool, &doc_id, &to)
}

/// 导出 DOCX：Markdown/RichText → .docx
/// dest_path 提供时直接写到用户另存位置（绝对路径）；否则归档到 PMToolData/doc/{docId}/export/
/// 返回 PmDocument（含 storagePath）
#[tauri::command]
pub fn document_export_docx(
    state: State<'_, AppState>,
    doc_id: String,
    file_name: String,
    dest_path: Option<String>,
) -> Result<PmDocument, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    let svc = service(&state);
    svc.export_docx(&pool, &doc_id, &file_name, dest_path.as_deref())
}

/// 把前端生成的二进制产物写到用户指定路径（PPTX 等前端生成的格式用）
/// 路径由前端 save 对话框返回，属用户明确选择的目标。
#[tauri::command]
pub fn write_binary_file(path: String, data: Vec<u8>) -> Result<(), String> {
    std::fs::write(&path, data).map_err(|e| format!("保存失败：{}", e))
}

fn svc_row_id(conn: &rusqlite::Connection, doc_id: &str) -> Result<i64, String> {
    crate::repositories::document::get_by_doc_id(conn, doc_id)
        .map_err(|e| e.to_string())?
        .map(|r| r.id)
        .ok_or_else(|| format!("文档不存在：{}", doc_id))
}

