/**
 * PMTool · Project Todo Items 数据访问层
 * Phase 2026-09-11 · 其他待办事项登记册
 *
 * 职责：纯 SQL 操作 project_todo_items 表（其他待办事项）
 *
 * schema.sql 定义：
 *   id, project_id, content, related_people, plan_date,
 *   completion_note, actual_date, status, remark, created_at, updated_at
 */

use rusqlite::{params, Connection, Row};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProjectTodoItem {
    pub id: i64,
    pub project_id: i64,
    pub content: String,           // 代办事项说明（必填）
    pub related_people: Option<String>, // 涉及人员（软件）
    pub plan_date: Option<String>, // 计划完成时间
    pub completion_note: Option<String>, // 当前完成情况说明
    pub actual_date: Option<String>, // 实际完成时间
    pub status: String,            // PENDING / IN_PROGRESS / COMPLETED / DELAYED
    pub remark: Option<String>,    // 备注
    pub created_at: String,
    pub updated_at: String,
}

fn row_to_item(row: &Row) -> rusqlite::Result<ProjectTodoItem> {
    Ok(ProjectTodoItem {
        id: row.get(0)?,
        project_id: row.get(1)?,
        content: row.get(2)?,
        related_people: row.get(3)?,
        plan_date: row.get(4)?,
        completion_note: row.get(5)?,
        actual_date: row.get(6)?,
        status: row.get(7)?,
        remark: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
}

/// 列出项目的其他待办
pub fn list_by_project(conn: &Connection, project_id: i64) -> rusqlite::Result<Vec<ProjectTodoItem>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, content, related_people, plan_date, completion_note, actual_date, status, remark, created_at, updated_at FROM project_todo_items WHERE project_id = ?1 ORDER BY id DESC",
    )?;
    let rows = stmt.query_map([project_id], row_to_item)?;
    rows.collect()
}

/// 获取单个待办
pub fn get_by_id(conn: &Connection, id: i64) -> rusqlite::Result<Option<ProjectTodoItem>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, content, related_people, plan_date, completion_note, actual_date, status, remark, created_at, updated_at FROM project_todo_items WHERE id = ?1",
    )?;
    let mut rows = stmt.query_map([id], row_to_item)?;
    rows.next().transpose()
}

/// 创建待办
pub fn create(conn: &Connection, item: &ProjectTodoItem) -> rusqlite::Result<i64> {
    conn.execute(
        "INSERT INTO project_todo_items (project_id, content, related_people, plan_date, completion_note, actual_date, status, remark) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            item.project_id,
            item.content,
            item.related_people,
            item.plan_date,
            item.completion_note,
            item.actual_date,
            item.status,
            item.remark,
        ],
    )?;
    Ok(conn.last_insert_rowid())
}

/// 更新待办
pub fn update(conn: &Connection, id: i64, item: &ProjectTodoItem) -> rusqlite::Result<bool> {
    let n = conn.execute(
        "UPDATE project_todo_items SET content=?2, related_people=?3, plan_date=?4, completion_note=?5, actual_date=?6, status=?7, remark=?8, updated_at=CURRENT_TIMESTAMP WHERE id=?1",
        params![
            id,
            item.content,
            item.related_people,
            item.plan_date,
            item.completion_note,
            item.actual_date,
            item.status,
            item.remark,
        ],
    )?;
    Ok(n > 0)
}

/// 删除待办
pub fn delete(conn: &Connection, id: i64) -> rusqlite::Result<bool> {
    let n = conn.execute("DELETE FROM project_todo_items WHERE id = ?1", [id])?;
    Ok(n > 0)
}