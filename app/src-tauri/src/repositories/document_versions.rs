/**
 * PMTool · Document 版本数据访问层（2026-09-18 · Document Engine）
 *
 * 对应表：document_versions（0020_document_engine.sql）
 *   - 一个文档多版本；生成默认建新版（version+1），不覆盖旧版
 *
 * 关注点：纯 SQL 操作，不含业务逻辑。
 */

use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};

/// 文档版本行
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentVersionRow {
    pub id: i64,
    pub document_id: i64,
    pub version: i64,
    pub content: Option<String>,
    pub content_type: String,  // TEXT/MARKDOWN/BLOCKNOTE_JSON/PROTO
    pub content_md: Option<String>,
    pub created_by: String,    // USER/AI/AUTO
    pub created_at: String,
}

#[derive(Debug, Clone)]
pub struct NewVersion {
    pub document_id: i64,
    pub version: i64,
    pub content: Option<String>,
    pub content_type: String,
    pub content_md: Option<String>,
    pub created_by: String,
}

const SELECT_COLS: &str = "id, document_id, version, content, content_type, content_md, created_by, created_at";

fn row_to_version(row: &Row) -> rusqlite::Result<DocumentVersionRow> {
    Ok(DocumentVersionRow {
        id: row.get(0)?,
        document_id: row.get(1)?,
        version: row.get(2)?,
        content: row.get(3)?,
        content_type: row.get(4)?,
        content_md: row.get(5)?,
        created_by: row.get(6)?,
        created_at: row.get(7)?,
    })
}

/// 新增版本
pub fn insert(conn: &Connection, v: &NewVersion) -> rusqlite::Result<DocumentVersionRow> {
    conn.execute(
        "INSERT INTO document_versions (document_id, version, content, content_type, content_md, created_by, created_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, CURRENT_TIMESTAMP)",
        params![v.document_id, v.version, v.content, v.content_type, v.content_md, v.created_by],
    )?;
    let id = conn.last_insert_rowid();
    let sql = format!("SELECT {} FROM document_versions WHERE id = ?1", SELECT_COLS);
    conn.query_row(&sql, params![id], row_to_version)
}

/// 取指定版本
pub fn get_version(
    conn: &Connection,
    document_id: i64,
    version: i64,
) -> rusqlite::Result<Option<DocumentVersionRow>> {
    let sql = format!(
        "SELECT {} FROM document_versions WHERE document_id = ?1 AND version = ?2",
        SELECT_COLS
    );
    conn.query_row(&sql, params![document_id, version], row_to_version)
        .optional()
}

/// 取最新版本号（无版本返回 0）
fn latest_version_number(conn: &Connection, document_id: i64) -> rusqlite::Result<i64> {
    conn.query_row(
        "SELECT MAX(version) FROM document_versions WHERE document_id = ?1",
        params![document_id],
        |r| r.get::<_, i64>(0),
    )
}

/// 取最新版本行
pub fn latest(conn: &Connection, document_id: i64) -> rusqlite::Result<Option<DocumentVersionRow>> {
    let v = latest_version_number(conn, document_id)?;
    if v == 0 {
        return Ok(None);
    }
    get_version(conn, document_id, v)
}

/// 列出所有版本（version 升序）
pub fn list_versions(conn: &Connection, document_id: i64) -> rusqlite::Result<Vec<DocumentVersionRow>> {
    let sql = format!(
        "SELECT {} FROM document_versions WHERE document_id = ?1 ORDER BY version ASC",
        SELECT_COLS
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![document_id], row_to_version)?;
    rows.collect()
}

/// 删除指定版本
pub fn delete_version(conn: &Connection, document_id: i64, version: i64) -> rusqlite::Result<bool> {
    conn.execute(
        "DELETE FROM document_versions WHERE document_id = ?1 AND version = ?2",
        params![document_id, version],
    )?;
    Ok(true)
}

/// 删除文档的全部版本（级联删除文档时使用；也可显式调用）
pub fn delete_for_document(conn: &Connection, document_id: i64) -> rusqlite::Result<bool> {
    conn.execute(
        "DELETE FROM document_versions WHERE document_id = ?1",
        params![document_id],
    )?;
    Ok(true)
}
