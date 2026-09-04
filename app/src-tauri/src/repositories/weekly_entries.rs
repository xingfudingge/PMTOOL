/**
 * PMTool · 周报条目 数据访问层
 * Phase 5 · V2.0 项目中心重构 · 2026-08-26 维护者拍板
 *
 * 职责：纯 SQL 操作 weekly_report_entries 表
 * 业务逻辑（周切换、本周/下周分组）在 services 层
 *
 * schema.sql / 0004_weekly_and_members.sql 定义：
 *   id, project_id, week_number, week_start_date, week_end_date,
 *   task_name, plan_start_date, plan_end_date, actual_start_date, actual_end_date,
 *   owner_party_a, owner_party_b, completion_note,
 *   is_completed (PENDING/IN_PROGRESS/COMPLETED),
 *   section (CURRENT/NEXT), sort_order, created_at, updated_at
 */

use rusqlite::{params, Connection, Row};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WeeklyReportEntry {
    pub id: i64,
    pub project_id: i64,
    pub week_number: i64,
    pub week_start_date: String,
    pub week_end_date: String,
    pub task_name: String,
    pub plan_start_date: Option<String>,
    pub plan_end_date: Option<String>,
    pub actual_start_date: Option<String>,
    pub actual_end_date: Option<String>,
    pub owner_party_a: Option<String>,
    pub owner_party_b: Option<String>,
    pub completion_note: Option<String>,
    pub is_completed: String, // PENDING/IN_PROGRESS/COMPLETED
    pub section: String,      // CURRENT/NEXT
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
}

fn row_to_entry(row: &Row) -> rusqlite::Result<WeeklyReportEntry> {
    Ok(WeeklyReportEntry {
        id: row.get(0)?,
        project_id: row.get(1)?,
        week_number: row.get(2)?,
        week_start_date: row.get(3)?,
        week_end_date: row.get(4)?,
        task_name: row.get(5)?,
        plan_start_date: row.get(6)?,
        plan_end_date: row.get(7)?,
        actual_start_date: row.get(8)?,
        actual_end_date: row.get(9)?,
        owner_party_a: row.get(10)?,
        owner_party_b: row.get(11)?,
        completion_note: row.get(12)?,
        is_completed: row.get(13)?,
        section: row.get(14)?,
        sort_order: row.get(15)?,
        created_at: row.get(16)?,
        updated_at: row.get(17)?,
    })
}

/// 列出项目的所有周报条目
pub fn list_by_project(conn: &Connection, project_id: i64) -> rusqlite::Result<Vec<WeeklyReportEntry>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, week_number, week_start_date, week_end_date, task_name, plan_start_date, plan_end_date, actual_start_date, actual_end_date, owner_party_a, owner_party_b, completion_note, is_completed, section, sort_order, created_at, updated_at FROM weekly_report_entries WHERE project_id = ?1 ORDER BY week_number ASC, sort_order ASC, id ASC",
    )?;
    let rows = stmt.query_map([project_id], row_to_entry)?;
    rows.collect()
}

/// 获取单个周报条目
pub fn get_by_id(conn: &Connection, id: i64) -> rusqlite::Result<Option<WeeklyReportEntry>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, week_number, week_start_date, week_end_date, task_name, plan_start_date, plan_end_date, actual_start_date, actual_end_date, owner_party_a, owner_party_b, completion_note, is_completed, section, sort_order, created_at, updated_at FROM weekly_report_entries WHERE id = ?1",
    )?;
    let mut rows = stmt.query_map([id], row_to_entry)?;
    rows.next().transpose()
}

/// 创建周报条目
pub fn create(conn: &Connection, entry: &WeeklyReportEntry) -> rusqlite::Result<i64> {
    conn.execute(
        "INSERT INTO weekly_report_entries (project_id, week_number, week_start_date, week_end_date, task_name, plan_start_date, plan_end_date, actual_start_date, actual_end_date, owner_party_a, owner_party_b, completion_note, is_completed, section, sort_order) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
        params![
            entry.project_id,
            entry.week_number,
            entry.week_start_date,
            entry.week_end_date,
            entry.task_name,
            entry.plan_start_date,
            entry.plan_end_date,
            entry.actual_start_date,
            entry.actual_end_date,
            entry.owner_party_a,
            entry.owner_party_b,
            entry.completion_note,
            entry.is_completed,
            entry.section,
            entry.sort_order,
        ],
    )?;
    Ok(conn.last_insert_rowid())
}

/// 更新周报条目
pub fn update(conn: &Connection, id: i64, entry: &WeeklyReportEntry) -> rusqlite::Result<bool> {
    let n = conn.execute(
        "UPDATE weekly_report_entries SET week_number=?2, week_start_date=?3, week_end_date=?4, task_name=?5, plan_start_date=?6, plan_end_date=?7, actual_start_date=?8, actual_end_date=?9, owner_party_a=?10, owner_party_b=?11, completion_note=?12, is_completed=?13, section=?14, sort_order=?15, updated_at=CURRENT_TIMESTAMP WHERE id=?1",
        params![
            id,
            entry.week_number,
            entry.week_start_date,
            entry.week_end_date,
            entry.task_name,
            entry.plan_start_date,
            entry.plan_end_date,
            entry.actual_start_date,
            entry.actual_end_date,
            entry.owner_party_a,
            entry.owner_party_b,
            entry.completion_note,
            entry.is_completed,
            entry.section,
            entry.sort_order,
        ],
    )?;
    Ok(n > 0)
}

/// 删除单个周报条目
pub fn delete(conn: &Connection, id: i64) -> rusqlite::Result<bool> {
    let n = conn.execute("DELETE FROM weekly_report_entries WHERE id = ?1", [id])?;
    Ok(n > 0)
}

/// 按项目删除所有周报条目（项目删除级联 · 但暴露给 service 层做"清空"操作）
pub fn delete_by_project(conn: &Connection, project_id: i64) -> rusqlite::Result<usize> {
    let n = conn.execute("DELETE FROM weekly_report_entries WHERE project_id = ?1", [project_id])?;
    Ok(n)
}