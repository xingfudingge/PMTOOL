/**
 * PMTool · Todo 数据访问层
 * Phase 0 · T0.4e
 *
 * 职责：纯 SQL 操作，不含业务逻辑。
 * 业务规则（自动顺延、is_overdue）在 services 层。
 *
 * 对应表：todos
 */

use rusqlite::{params, Row};
use serde::{Deserialize, Serialize};

// 维护者 2026-08-25 修复：webview 端 create_todo 不传 status
// 给 status 一个"业务默认值" · 不能直接 #[serde(default)]（会变成空串）
fn default_status() -> String { "PENDING".to_string() }

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Todo {
    // 维护者 2026-08-25 修复：webview 端 create_todo 不传 id/completed_at/created_at/updated_at
    // 用 #[serde(default)] 让这些字段在 webview 缺省时走默认值（create() 不读这些字段）
    #[serde(default)]
    pub id: i64,
    pub title: String,
    #[serde(default)]
    pub content: Option<String>,
    pub priority: String,
    // 维护者 2026-08-25 修复：missing field `status` · 走业务默认值 PENDING
    #[serde(default = "default_status")]
    pub status: String,
    #[serde(default)]
    pub start_date: Option<String>,
    #[serde(default)]
    pub due_date: Option<String>,
    #[serde(default)]
    pub completed_at: Option<String>, // RFC-02 §4: UTC ISO 8601
    pub source_type: String,          // RFC-02 §4: MANUAL / WEEKLY only
    #[serde(default)]
    pub source_id: Option<i64>,
    #[serde(default)]
    pub project_id: Option<i64>,      // 维护者 2026-08-25：关联项目 · 日报按项目分组
    #[serde(default)]
    pub mentions: Option<String>,     // JSON 数组 · @ 提名 project_id 列表
    #[serde(default)]
    pub remind_time: Option<String>,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
}

fn row_to_todo(row: &Row) -> rusqlite::Result<Todo> {
    Ok(Todo {
        id: row.get(0)?,
        title: row.get(1)?,
        content: row.get(2)?,
        priority: row.get(3)?,
        status: row.get(4)?,
        start_date: row.get(5)?,
        due_date: row.get(6)?,
        completed_at: row.get(7)?,
        source_type: row.get(8)?,
        source_id: row.get(9)?,
        project_id: None,        // TODO: 数据库没有 project_id 字段，暂返回 None
        mentions: None,          // TODO: 数据库没有 mentions 字段，暂返回 None
        remind_time: row.get(10)?,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
    })
}

/// 列出待办（按 status + source_type 过滤）
pub fn list(
    conn: &rusqlite::Connection,
    status: Option<&str>,
    source_type: Option<&str>,
) -> rusqlite::Result<Vec<Todo>> {
    let mut sql = String::from("SELECT id, title, content, priority, status, start_date, due_date, completed_at, source_type, source_id, remind_time, created_at, updated_at FROM todos WHERE 1=1");
    if status.is_some() { sql.push_str(" AND status = ?"); }
    if source_type.is_some() { sql.push_str(" AND source_type = ?"); }
    sql.push_str(" ORDER BY due_date ASC, id ASC");

    let mut stmt = conn.prepare(&sql)?;
    let rows = match (status, source_type) {
        (Some(s), Some(t)) => stmt.query_map(params![s, t], row_to_todo)?,
        (Some(s), None) => stmt.query_map(params![s], row_to_todo)?,
        (None, Some(t)) => stmt.query_map(params![t], row_to_todo)?,
        (None, None) => stmt.query_map(params![], row_to_todo)?,
    };
    rows.collect()
}

/// 获取单个待办
pub fn get_by_id(conn: &rusqlite::Connection, id: i64) -> rusqlite::Result<Option<Todo>> {
    let mut stmt = conn.prepare(
        "SELECT id, title, content, priority, status, start_date, due_date, completed_at, source_type, source_id, remind_time, created_at, updated_at FROM todos WHERE id = ?1",
    )?;
    let mut rows = stmt.query_map([id], row_to_todo)?;
    rows.next().transpose()
}

/// 创建待办
pub fn create(conn: &rusqlite::Connection, todo: &Todo) -> rusqlite::Result<i64> {
    conn.execute(
        "INSERT INTO todos (title, content, priority, status, start_date, due_date, source_type, source_id, remind_time) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            todo.title,
            todo.content,
            todo.priority,
            todo.status,
            todo.start_date,
            todo.due_date,
            todo.source_type,
            todo.source_id,
            todo.remind_time,
        ],
    )?;
    Ok(conn.last_insert_rowid())
}

/// 更新待办
pub fn update(conn: &rusqlite::Connection, id: i64, todo: &Todo) -> rusqlite::Result<bool> {
    let n = conn.execute(
        "UPDATE todos SET title=?2, content=?3, priority=?4, status=?5, start_date=?6, due_date=?7, source_type=?8, source_id=?9, remind_time=?10, updated_at=CURRENT_TIMESTAMP WHERE id=?1",
        params![
            id,
            todo.title,
            todo.content,
            todo.priority,
            todo.status,
            todo.start_date,
            todo.due_date,
            todo.source_type,
            todo.source_id,
            todo.remind_time,
        ],
    )?;
    Ok(n > 0)
}

/// 标记完成（写入 completed_at = UTC NOW）
pub fn complete(conn: &rusqlite::Connection, id: i64) -> rusqlite::Result<bool> {
    let n = conn.execute(
        "UPDATE todos SET status='COMPLETED', completed_at=datetime('now'), updated_at=CURRENT_TIMESTAMP WHERE id=?1",
        [id],
    )?;
    Ok(n > 0)
}

/// 取消完成（status → PENDING · completed_at 清空）
/// 专门命令，避免 update_todo 传 todo 对象时 camelCase/snake_case 字段不匹配的坑
pub fn uncomplete(conn: &rusqlite::Connection, id: i64) -> rusqlite::Result<bool> {
    let n = conn.execute(
        "UPDATE todos SET status='PENDING', completed_at=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=?1",
        [id],
    )?;
    Ok(n > 0)
}

/// 删除待办
pub fn delete(conn: &rusqlite::Connection, id: i64) -> rusqlite::Result<bool> {
    let n = conn.execute("DELETE FROM todos WHERE id=?1", [id])?;
    Ok(n > 0)
}