/**
 * PMTool · Document 元数据数据访问层（2026-09-18 · Document Engine）
 *
 * 对应表：documents（0020_document_engine.sql）
 *   - 设计依据：docs/document-engine-rfc-2026-09-18.md §5
 *   - 一条 = 一个逻辑文档；内容存 document_versions（最新版 = 当前）
 *
 * 关注点：纯 SQL 操作，不含业务逻辑。业务逻辑在 document/service.rs。
 */

use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};

/// 文档元数据行
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentRow {
    pub id: i64,
    pub doc_id: String,
    pub doc_type: String,      // TEXT/MARKDOWN/RICHTEXT/DOCX
    pub title: String,
    pub space_type: Option<String>,  // KNOWLEDGE/REPORT/PROJECT_FILE/TEMPLATE
    pub ref_id: Option<i64>,
    pub current_version: i64,
    pub storage_path: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// 新建文档入参（id 由 DB 自增，doc_id 由 service 生成）
#[derive(Debug, Clone)]
pub struct NewDocument {
    pub doc_id: String,
    pub doc_type: String,
    pub title: String,
    pub space_type: Option<String>,
    pub ref_id: Option<i64>,
    pub storage_path: Option<String>,
}

const SELECT_COLS: &str = "id, doc_id, type, title, space_type, ref_id, current_version, storage_path, created_at, updated_at";

fn row_to_doc(row: &Row) -> rusqlite::Result<DocumentRow> {
    Ok(DocumentRow {
        id: row.get(0)?,
        doc_id: row.get(1)?,
        doc_type: row.get(2)?,
        title: row.get(3)?,
        space_type: row.get(4)?,
        ref_id: row.get(5)?,
        current_version: row.get(6)?,
        storage_path: row.get(7)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
    })
}

/// 新建文档
pub fn create(conn: &Connection, new: &NewDocument) -> rusqlite::Result<DocumentRow> {
    conn.execute(
        "INSERT INTO documents (doc_id, type, title, space_type, ref_id, current_version, storage_path, created_at, updated_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
        params![new.doc_id, new.doc_type, new.title, new.space_type, new.ref_id, new.storage_path],
    )?;
    get_by_id(conn, conn.last_insert_rowid())?
        .ok_or(rusqlite::Error::QueryReturnedNoRows)
}

/// 按内部自增 id 取
pub fn get_by_id(conn: &Connection, id: i64) -> rusqlite::Result<Option<DocumentRow>> {
    let sql = format!("SELECT {} FROM documents WHERE id = ?1", SELECT_COLS);
    conn.query_row(&sql, params![id], row_to_doc).optional()
}

/// 按业务 doc_id 取
pub fn get_by_doc_id(conn: &Connection, doc_id: &str) -> rusqlite::Result<Option<DocumentRow>> {
    let sql = format!("SELECT {} FROM documents WHERE doc_id = ?1", SELECT_COLS);
    conn.query_row(&sql, params![doc_id], row_to_doc).optional()
}

/// 递增当前版本号（生成/保存建新版时用）
/// 返回新的 current_version
pub fn bump_current_version(conn: &Connection, id: i64) -> rusqlite::Result<i64> {
    conn.execute(
        "UPDATE documents SET current_version = current_version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
        params![id],
    )?;
    let row = get_by_id(conn, id)?;
    Ok(row.map(|r| r.current_version).unwrap_or(1))
}

/// 更新标题 + updated_at（编辑调用方更新标题时用）
pub fn update_title(conn: &Connection, id: i64, title: &str) -> rusqlite::Result<bool> {
    let n = conn.execute(
        "UPDATE documents SET title = ?2, updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
        params![id, title],
    )?;
    Ok(n > 0)
}

/// 更新产物路径
pub fn update_storage_path(conn: &Connection, id: i64, path: Option<&str>) -> rusqlite::Result<bool> {
    let n = conn.execute(
        "UPDATE documents SET storage_path = ?2, updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
        params![id, path],
    )?;
    Ok(n > 0)
}

/// 更新文档类型（convert 后 type 变化时用）
pub fn update_type(conn: &Connection, id: i64, doc_type: &str) -> rusqlite::Result<bool> {
    let n = conn.execute(
        "UPDATE documents SET type = ?2, updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
        params![id, doc_type],
    )?;
    Ok(n > 0)
}

/// 按空间 + ref 列出元信息（不含 content）
pub fn list_by_space(
    conn: &Connection,
    space_type: &str,
    ref_id: Option<i64>,
) -> rusqlite::Result<Vec<DocumentRow>> {
    let sql = format!(
        "SELECT {} FROM documents WHERE space_type = ?1 AND ref_id IS ?2 ORDER BY updated_at DESC",
        SELECT_COLS
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![space_type, ref_id], row_to_doc)?;
    rows.collect()
}

/// 列出全部元信息
pub fn list_all(conn: &Connection) -> rusqlite::Result<Vec<DocumentRow>> {
    let sql = format!("SELECT {} FROM documents ORDER BY updated_at DESC", SELECT_COLS);
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([], row_to_doc)?;
    rows.collect()
}

/// 删除文档（当前版本 + 关联版本由外键级联删除）
pub fn delete(conn: &Connection, id: i64) -> rusqlite::Result<bool> {
    let n = conn.execute("DELETE FROM documents WHERE id = ?1", params![id])?;
    Ok(n > 0)
}
