/**
 * PMTool · 主工作区工作notes 数据访问层
 * 2026-09-08 维护者反馈「今日工作内容仅本地保存显示不全」
 *
 * 职责：纯 SQL 操作 work_notes 表（按 note_date 一天一条）
 * 取代原 localStorage 存储 · 彻底入库（WebView 缓存清理不丢）
 *
 * 00013 migration 定义：
 *   id, note_date(UNIQUE), today_content, next_workday, next_content,
 *   created_at, updated_at
 */

use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WorkNote {
    pub id: i64,
    pub note_date: String,      // YYYY-MM-DD
    pub today_content: String,  // 今日工作内容（多行）
    pub next_workday: String,   // 下个工作日标题/日期
    pub next_content: String,   // 下个工作日计划（多行）
    pub created_at: String,
    pub updated_at: String,
}

fn row_to_note(row: &Row) -> rusqlite::Result<WorkNote> {
    Ok(WorkNote {
        id: row.get(0)?,
        note_date: row.get(1)?,
        today_content: row.get(2)?,
        next_workday: row.get(3)?,
        next_content: row.get(4)?,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
    })
}

/// 按日期取一条工作note（不存在返回 None)
pub fn get_by_date(conn: &Connection, note_date: &str) -> rusqlite::Result<Option<WorkNote>> {
    let mut stmt = conn.prepare(
        "SELECT id, note_date, today_content, next_workday, next_content, created_at, updated_at FROM work_notes WHERE note_date = ?1",
    )?;
    let mut rows = stmt.query_map([note_date], row_to_note)?;
    rows.next().transpose()
}

/// 按日期 upsert（存在则更新，否则插入）
/// 返回最新行（供前端立即拿到 id/时间戳）
pub fn upsert_by_date(
    conn: &Connection,
    note_date: &str,
    today_content: &str,
    next_workday: &str,
    next_content: &str,
) -> rusqlite::Result<WorkNote> {
    // 用 SQLite 的 ON CONFLICT 原子 upsert，避免先查后插的竞态
    conn.execute(
        "INSERT INTO work_notes (note_date, today_content, next_workday, next_content) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(note_date) DO UPDATE SET today_content=excluded.today_content, next_workday=excluded.next_workday, next_content=excluded.next_content, updated_at=CURRENT_TIMESTAMP",
        params![note_date, today_content, next_workday, next_content],
    )?;
    get_by_date(conn, note_date)?.ok_or(rusqlite::Error::QueryReturnedNoRows)
}
