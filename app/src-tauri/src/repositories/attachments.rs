/**
 * PMTool · Attachments 数据访问层
 * Phase 4 · T4.9 文件管理
 *
 * 职责：纯 SQL 操作 attachments 表
 *
 * schema.sql 第 268 行定义：
 *   id, owner_type, owner_id, file_name, file_path,
 *   file_size, file_type, created_at
 *
 * 维护者原话字段 vs schema 字段映射（不破 Phase 0 schema）：
 *   - 维护者 project_id        → schema owner_type='PROJECT' + owner_id
 *   - 维护者 relative_path     → schema file_path
 *   - 维护者 sha256            → 运行时计算（不存表，按 RFC-03 §2）
 *   - 维护者 mime_type         → schema file_type
 *   - 维护者 file_size         → schema file_size（相同）
 *   - 维护者 file_name         → schema file_name（相同）
 *   - 维护者 id                → schema id（相同）
 *   - 维护者 created_at        → schema created_at（相同）
 *   - 维护者 updated_at        → **未在 schema · 暂用 created_at**
 *
 * 实际文件存在 OS 本地路径（按 RFC-03 §2）：
 *   PMToolData/projects/{project_id}/files/{relative_path}
 */

use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Attachment {
    pub id: i64,
    pub owner_type: String, // 'PROJECT' / 'REPORT' / 'KNOWLEDGE' / 'TEMPLATE'
    pub owner_id: i64,
    pub file_name: String,
    pub file_path: String, // 相对 PMToolData 根的路径
    pub file_size: Option<i64>,
    pub file_type: Option<String>, // MIME 类型
    pub created_at: String,
    /// 运行时计算字段（不在 schema 表里 · 通过 get_metadata 返回）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sha256: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>, // 暂等于 created_at · 未来单独 RFC
}

fn row_to_attachment(row: &Row) -> rusqlite::Result<Attachment> {
    Ok(Attachment {
        id: row.get(0)?,
        owner_type: row.get(1)?,
        owner_id: row.get(2)?,
        file_name: row.get(3)?,
        file_path: row.get(4)?,
        file_size: row.get(5)?,
        file_type: row.get(6)?,
        created_at: row.get(7)?,
        sha256: None,
        updated_at: None,
    })
}

/// 列出 owner 下的所有附件（PROJECT / REPORT 等）
pub fn list_by_owner(
    conn: &Connection,
    owner_type: &str,
    owner_id: i64,
) -> rusqlite::Result<Vec<Attachment>> {
    let mut stmt = conn.prepare(
        "SELECT id, owner_type, owner_id, file_name, file_path, file_size, file_type, created_at FROM attachments WHERE owner_type = ?1 AND owner_id = ?2 ORDER BY created_at DESC",
    )?;
    let rows = stmt.query_map(params![owner_type, owner_id], row_to_attachment)?;
    rows.collect()
}

/// 创建附件记录（文件实际由 FileStorageProvider 存储）
pub fn create(conn: &Connection, att: &Attachment) -> rusqlite::Result<i64> {
    conn.execute(
        "INSERT INTO attachments (owner_type, owner_id, file_name, file_path, file_size, file_type) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            att.owner_type,
            att.owner_id,
            att.file_name,
            att.file_path,
            att.file_size,
            att.file_type,
        ],
    )?;
    Ok(conn.last_insert_rowid())
}

/// 删除附件记录（文件删除由 FileStorageProvider 处理）
pub fn delete(conn: &Connection, id: i64) -> rusqlite::Result<bool> {
    // 先获取 file_path，调用方负责删文件
    let path: Option<String> = conn
        .query_row(
            "SELECT file_path FROM attachments WHERE id = ?1",
            [id],
            |row| row.get(0),
        )
        .optional()?;
    if path.is_none() {
        return Ok(false);
    }
    let n = conn.execute("DELETE FROM attachments WHERE id = ?1", [id])?;
    Ok(n > 0)
}

/// 获取附件记录（用于文件删除前获取路径）
pub fn get_by_id(conn: &Connection, id: i64) -> rusqlite::Result<Option<Attachment>> {
    let mut stmt = conn.prepare(
        "SELECT id, owner_type, owner_id, file_name, file_path, file_size, file_type, created_at FROM attachments WHERE id = ?1",
    )?;
    let mut rows = stmt.query_map([id], row_to_attachment)?;
    rows.next().transpose()
}