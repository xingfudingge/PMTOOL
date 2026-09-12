/**
 * PMTool · Project Issue Log 数据访问层
 * Phase 2026-09-11 · 问题登记册
 *
 * 职责：纯 SQL 操作 project_issue_log 表（问题登记册）
 *
 * schema.sql 定义：
 *   id, project_id, title, proposer, module, discovered_at,
 *   plan_date, plan_solution, handler, progress_note, actual_date,
 *   status, created_at, updated_at
 */

use rusqlite::{params, Connection, Row};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProjectIssueLog {
    pub id: i64,
    pub project_id: i64,
    pub title: String,          // 问题描述（必填）
    pub proposer: Option<String>, // 提出人
    pub module: Option<String>, // 涉及系统及模块（参考需规）
    pub discovered_at: Option<String>, // 发现时间
    pub plan_date: Option<String>, // 计划解决时间
    pub plan_solution: Option<String>, // 计划解决方案
    pub handler: Option<String>, // 问题处理人
    pub progress_note: Option<String>, // 当前处理进度说明
    pub actual_date: Option<String>, // 实际处理时间
    pub status: String,         // OPEN / IN_PROGRESS / RESOLVED / CLOSED
    pub created_at: String,
    pub updated_at: String,
}

fn row_to_issue(row: &Row) -> rusqlite::Result<ProjectIssueLog> {
    Ok(ProjectIssueLog {
        id: row.get(0)?,
        project_id: row.get(1)?,
        title: row.get(2)?,
        proposer: row.get(3)?,
        module: row.get(4)?,
        discovered_at: row.get(5)?,
        plan_date: row.get(6)?,
        plan_solution: row.get(7)?,
        handler: row.get(8)?,
        progress_note: row.get(9)?,
        actual_date: row.get(10)?,
        status: row.get(11)?,
        created_at: row.get(12)?,
        updated_at: row.get(13)?,
    })
}

/// 列出项目的问题
pub fn list_by_project(conn: &Connection, project_id: i64) -> rusqlite::Result<Vec<ProjectIssueLog>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, title, proposer, module, discovered_at, plan_date, plan_solution, handler, progress_note, actual_date, status, created_at, updated_at FROM project_issue_log WHERE project_id = ?1 ORDER BY id DESC",
    )?;
    let rows = stmt.query_map([project_id], row_to_issue)?;
    rows.collect()
}

/// 获取单个问题
pub fn get_by_id(conn: &Connection, id: i64) -> rusqlite::Result<Option<ProjectIssueLog>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, title, proposer, module, discovered_at, plan_date, plan_solution, handler, progress_note, actual_date, status, created_at, updated_at FROM project_issue_log WHERE id = ?1",
    )?;
    let mut rows = stmt.query_map([id], row_to_issue)?;
    rows.next().transpose()
}

/// 创建问题
pub fn create(conn: &Connection, issue: &ProjectIssueLog) -> rusqlite::Result<i64> {
    conn.execute(
        "INSERT INTO project_issue_log (project_id, title, proposer, module, discovered_at, plan_date, plan_solution, handler, progress_note, actual_date, status) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![
            issue.project_id,
            issue.title,
            issue.proposer,
            issue.module,
            issue.discovered_at,
            issue.plan_date,
            issue.plan_solution,
            issue.handler,
            issue.progress_note,
            issue.actual_date,
            issue.status,
        ],
    )?;
    Ok(conn.last_insert_rowid())
}

/// 更新问题
pub fn update(conn: &Connection, id: i64, issue: &ProjectIssueLog) -> rusqlite::Result<bool> {
    let n = conn.execute(
        "UPDATE project_issue_log SET title=?2, proposer=?3, module=?4, discovered_at=?5, plan_date=?6, plan_solution=?7, handler=?8, progress_note=?9, actual_date=?10, status=?11, updated_at=CURRENT_TIMESTAMP WHERE id=?1",
        params![
            id,
            issue.title,
            issue.proposer,
            issue.module,
            issue.discovered_at,
            issue.plan_date,
            issue.plan_solution,
            issue.handler,
            issue.progress_note,
            issue.actual_date,
            issue.status,
        ],
    )?;
    Ok(n > 0)
}

/// 删除问题
pub fn delete(conn: &Connection, id: i64) -> rusqlite::Result<bool> {
    let n = conn.execute("DELETE FROM project_issue_log WHERE id = ?1", [id])?;
    Ok(n > 0)
}