/**
 * PMTool · Document Engine 统一文档模型（2026-09-18）
 *
 * 设计依据：docs/document-engine-rfc-2026-09-18.md §6
 *   业务模块面向 PmDocument，不面向 BlockNote JSON 或具体格式库。
 *   未来换编辑器 / 换格式库，上层不重构。
 *
 * 说明：
 *   - DocContent::RichText 用内部稳定结构（RichBlock），经 adapter 与 BlockNote 互转
 *   - DOCX 产物以 storage_path 引用（二进制不落库，落 PMToolData/doc/{doc_id}/）
 *   - serde camelCase 序列化对齐前端（与现有 repositories 约定一致）
 */

use serde::{Deserialize, Serialize};

/// V1 支持的文档类型（pptx/xlsx/pdf 后续）
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum DocType {
    Text,
    Markdown,
    RichText,
    Docx,
}

impl DocType {
    pub fn as_str(&self) -> &'static str {
        match self {
            DocType::Text => "text",
            DocType::Markdown => "markdown",
            DocType::RichText => "richtext",
            DocType::Docx => "docx",
        }
    }

    /// 从 DB 存储的字符串解析（兼容大小写）
    pub fn from_db(s: &str) -> DocType {
        match s.to_ascii_uppercase().as_str() {
            "TEXT" => DocType::Text,
            "MARKDOWN" => DocType::Markdown,
            "RICHTEXT" => DocType::RichText,
            "DOCX" => DocType::Docx,
            _ => DocType::Markdown,
        }
    }
}

/// 归属业务域（可空 = 独立文档）
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum SpaceType {
    Knowledge,
    Report,
    ProjectFile,
    Template,
}

pub fn space_type_as_db(t: Option<SpaceType>) -> Option<String> {
    t.map(|s| match s {
        SpaceType::Knowledge => "KNOWLEDGE".to_string(),
        SpaceType::Report => "REPORT".to_string(),
        SpaceType::ProjectFile => "PROJECT_FILE".to_string(),
        SpaceType::Template => "TEMPLATE".to_string(),
    })
}

pub fn space_type_from_db(s: &str) -> Option<SpaceType> {
    match s.to_ascii_uppercase().as_str() {
        "KNOWLEDGE" => Some(SpaceType::Knowledge),
        "REPORT" => Some(SpaceType::Report),
        "PROJECT_FILE" => Some(SpaceType::ProjectFile),
        "TEMPLATE" => Some(SpaceType::Template),
        _ => None,
    }
}

/// 统一文档内容（V1 四类）
/// 注意：用单字段 struct variant 以配合 #[serde(tag)] —— serde 无法对 newtype variant 使用内部 tag，
/// 多字段 tag 序列化会报错。前端对应形如 {kind:'markdown', markdown:'...'}。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum DocContent {
    Text { text: String },
    Markdown { markdown: String },
    /// 内部稳定 RichText 结构（非 BlockNote 直存）
    RichText { richtext: Vec<RichBlock> },
    /// DOCX 产物 · 引用 storage_path
    DocxFile { docxfile: String },
}

/// 富文本块的稳定字段级结构 —— BlockNote 经 adapter 映射到此处
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data", rename_all = "lowercase")]
pub enum RichBlock {
    Heading { level: u8, text: String },
    Para { text: String },
    List { ordered: bool, items: Vec<String> },
    Code { lang: Option<String>, text: String },
    Quote { text: String },
    Table { header: Vec<String>, rows: Vec<Vec<String>> },
    Link { text: String, href: String },
    Image { src: String, alt: Option<String> },
}

/// 文档元数据 + 当前版本的主内容（Document Service 返回给前端的统一形态）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PmDocument {
    pub doc_id: String,
    pub doc_type: DocType,
    pub title: String,
    pub version: u32,
    pub content: DocContent,
    pub space_type: Option<SpaceType>,
    pub ref_id: Option<i64>,
    pub storage_path: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// 列表用轻量元信息（不带 content）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PmDocumentMeta {
    pub doc_id: String,
    pub doc_type: DocType,
    pub title: String,
    pub version: u32,
    pub space_type: Option<SpaceType>,
    pub ref_id: Option<i64>,
    pub storage_path: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// 版本条目元信息（versionList 用）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PmDocumentVersionMeta {
    pub version: u32,
    pub content_type: String,
    pub created_by: String,
    pub created_at: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn doc_type_roundtrip() {
        assert_eq!(DocType::from_db("RICHTEXT"), DocType::RichText);
        assert_eq!(DocType::from_db("markdown"), DocType::Markdown);
        assert_eq!(DocType::from_db("unknown"), DocType::Markdown);
        assert_eq!(DocType::Text.as_str(), "text");
    }

    #[test]
    fn doc_content_serde_tag() {
        let c = DocContent::RichText { richtext: vec![RichBlock::Para { text: "你好".into() }] };
        let s = serde_json::to_string(&c).unwrap();
        assert!(s.contains("\"kind\":\"richtext\""));
        assert!(s.contains("\"type\":\"para\""));
        let back: DocContent = serde_json::from_str(&s).unwrap();
        assert!(matches!(back, DocContent::RichText { .. }));
    }

    #[test]
    fn pm_document_camel_case() {
        let d = PmDocument {
            doc_id: "doc_1".into(),
            doc_type: DocType::Markdown,
            title: "t".into(),
            version: 1,
            content: DocContent::Markdown { markdown: "# hi".into() },
            space_type: None,
            ref_id: None,
            storage_path: None,
            created_at: String::new(),
            updated_at: String::new(),
        };
        let s = serde_json::to_string(&d).unwrap();
        assert!(s.contains("\"docId\""));
        assert!(s.contains("\"docType\""));
    }
}
