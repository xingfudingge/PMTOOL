/**
 * PMTool · Project Issues 数据访问层
 * Phase 4 · T4.8
 *
 * 职责：纯 SQL 操作 project_issues 表
 *
 * schema.sql 定义：
 *   id, project_id, title, description, level, owner,
 *   plan_date, actual_date, discovered_at, solution, status, created_at, updated_at
 *
 * 维护者原话字段补充：
 *   - discovered_at 字段（2026-08-26 补 · 与 Excel 风险登记册「发现时间」列对齐）
 *   - planned_resolve_date 字段 → plan_date 字段
 *   - actual_resolve_date 字段 → actual_date 字段
 */

use rusqlite::{params, Connection, Row};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProjectIssue {
    pub id: i64,
    pub project_id: i64,
    pub title: String,
    pub description: Option<String>,
    pub level: String, // LOW / MEDIUM / HIGH / CRITICAL
    pub owner: Option<String>,
    pub plan_date: Option<String>,       // planned_resolve_date 字段
    pub actual_date: Option<String>,     // actual_resolve_date 字段
    pub discovered_at: Option<String>,   // 维护者 2026-08-26 补 · 风险首次发现时间（Excel 列「发现时间」）
    pub solution: Option<String>,
    pub resolution: Option<String>,      // 2026-09-11 补 · 风险登记册「当前风险应对情况说明」
    pub status: String, // OPEN / IN_PROGRESS / RESOLVED / CLOSED
    pub created_at: String,
    pub updated_at: String,
}

fn row_to_issue(row: &Row) -> rusqlite::Result<ProjectIssue> {
    Ok(ProjectIssue {
        id: row.get(0)?,
        project_id: row.get(1)?,
        title: row.get(2)?,
        description: row.get(3)?,
        level: row.get(4)?,
        owner: row.get(5)?,
        plan_date: row.get(6)?,
        actual_date: row.get(7)?,
        discovered_at: row.get(8)?,
        solution: row.get(9)?,
        resolution: row.get(10)?,
        status: row.get(11)?,
        created_at: row.get(12)?,
        updated_at: row.get(13)?,
    })
}

/// 列出项目的问题
pub fn list_by_project(conn: &Connection, project_id: i64) -> rusqlite::Result<Vec<ProjectIssue>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, title, description, level, owner, plan_date, actual_date, discovered_at, solution, resolution, status, created_at, updated_at FROM project_issues WHERE project_id = ?1 ORDER BY id DESC",
    )?;
    let rows = stmt.query_map([project_id], row_to_issue)?;
    rows.collect()
}

/// 获取单个问题
pub fn get_by_id(conn: &Connection, id: i64) -> rusqlite::Result<Option<ProjectIssue>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, title, description, level, owner, plan_date, actual_date, discovered_at, solution, resolution, status, created_at, updated_at FROM project_issues WHERE id = ?1",
    )?;
    let mut rows = stmt.query_map([id], row_to_issue)?;
    rows.next().transpose()
}

/// 创建问题
pub fn create(conn: &Connection, issue: &ProjectIssue) -> rusqlite::Result<i64> {
    conn.execute(
        "INSERT INTO project_issues (project_id, title, description, level, owner, plan_date, actual_date, discovered_at, solution, resolution, status) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![
            issue.project_id,
            issue.title,
            issue.description,
            issue.level,
            issue.owner,
            issue.plan_date,
            issue.actual_date,
            issue.discovered_at,
            issue.solution,
            issue.resolution,
            issue.status,
        ],
    )?;
    Ok(conn.last_insert_rowid())
}

/// 更新问题
pub fn update(conn: &Connection, id: i64, issue: &ProjectIssue) -> rusqlite::Result<bool> {
    let n = conn.execute(
        "UPDATE project_issues SET title=?2, description=?3, level=?4, owner=?5, plan_date=?6, actual_date=?7, discovered_at=?8, solution=?9, resolution=?10, status=?11, updated_at=CURRENT_TIMESTAMP WHERE id=?1",
        params![
            id,
            issue.title,
            issue.description,
            issue.level,
            issue.owner,
            issue.plan_date,
            issue.actual_date,
            issue.discovered_at,
            issue.solution,
            issue.resolution,
            issue.status,
        ],
    )?;
    Ok(n > 0)
}

/// 删除问题
pub fn delete(conn: &Connection, id: i64) -> rusqlite::Result<bool> {
    let n = conn.execute("DELETE FROM project_issues WHERE id = ?1", [id])?;
    Ok(n > 0)
}