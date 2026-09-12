/**
 * PMTool · Project Requirements 数据访问层
 * Phase 4 · 2026-09-11 登记册体系
 *
 * 职责：纯 SQL 操作 project_requirements 表（需求登记册）
 *
 * schema.sql 定义：
 *   id, project_id, type, system, summary, detail,
 *   proposed_at, proposer, status, created_at, updated_at
 */

use rusqlite::{params, Connection, Row};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProjectRequirement {
    pub id: i64,
    pub project_id: i64,
    pub r#type: String, // NEW / CHANGE / OPTIMIZE / OTHER
    pub system: Option<String>,
    pub summary: String,
    pub detail: Option<String>,
    pub proposed_at: Option<String>,
    pub proposer: Option<String>,
    pub status: String, // PENDING / EVALUATING / CONFIRMED / IMPLEMENTED / REJECTED
    pub created_at: String,
    pub updated_at: String,
}

fn row_to_requirement(row: &Row) -> rusqlite::Result<ProjectRequirement> {
    Ok(ProjectRequirement {
        id: row.get(0)?,
        project_id: row.get(1)?,
        r#type: row.get(2)?,
        system: row.get(3)?,
        summary: row.get(4)?,
        detail: row.get(5)?,
        proposed_at: row.get(6)?,
        proposer: row.get(7)?,
        status: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
}

/// 列出项目的需求
pub fn list_by_project(conn: &Connection, project_id: i64) -> rusqlite::Result<Vec<ProjectRequirement>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, type, system, summary, detail, proposed_at, proposer, status, created_at, updated_at FROM project_requirements WHERE project_id = ?1 ORDER BY id DESC",
    )?;
    let rows = stmt.query_map([project_id], row_to_requirement)?;
    rows.collect()
}

/// 获取单个需求
pub fn get_by_id(conn: &Connection, id: i64) -> rusqlite::Result<Option<ProjectRequirement>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, type, system, summary, detail, proposed_at, proposer, status, created_at, updated_at FROM project_requirements WHERE id = ?1",
    )?;
    let mut rows = stmt.query_map([id], row_to_requirement)?;
    rows.next().transpose()
}

/// 创建需求
pub fn create(conn: &Connection, req: &ProjectRequirement) -> rusqlite::Result<i64> {
    conn.execute(
        "INSERT INTO project_requirements (project_id, type, system, summary, detail, proposed_at, proposer, status) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            req.project_id,
            req.r#type,
            req.system,
            req.summary,
            req.detail,
            req.proposed_at,
            req.proposer,
            req.status,
        ],
    )?;
    Ok(conn.last_insert_rowid())
}

/// 更新需求
pub fn update(conn: &Connection, id: i64, req: &ProjectRequirement) -> rusqlite::Result<bool> {
    let n = conn.execute(
        "UPDATE project_requirements SET type=?2, system=?3, summary=?4, detail=?5, proposed_at=?6, proposer=?7, status=?8, updated_at=CURRENT_TIMESTAMP WHERE id=?1",
        params![
            id,
            req.r#type,
            req.system,
            req.summary,
            req.detail,
            req.proposed_at,
            req.proposer,
            req.status,
        ],
    )?;
    Ok(n > 0)
}

/// 删除需求
pub fn delete(conn: &Connection, id: i64) -> rusqlite::Result<bool> {
    let n = conn.execute("DELETE FROM project_requirements WHERE id = ?1", [id])?;
    Ok(n > 0)
}