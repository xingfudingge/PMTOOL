/**
 * PMTool · 项目成员 数据访问层
 * Phase 5 · V2.0 项目中心重构 · 2026-08-26 维护者拍板
 *
 * 职责：纯 SQL 操作 project_members 表
 * 业务逻辑（成员去重、合并）在 services 层
 *
 * schema.sql / 0004_weekly_and_members.sql 定义：
 *   id, project_id, party (PARTY_A/PARTY_B), role, name, contact,
 *   participation (★/★★/★★★/★★★★/★★★★★), impact,
 *   sort_order, created_at, updated_at
 */

use rusqlite::{params, Connection, Row};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProjectMember {
    pub id: i64,
    pub project_id: i64,
    pub party: String,        // PARTY_A/PARTY_B
    pub role: Option<String>,
    pub name: String,
    pub contact: Option<String>,
    pub participation: Option<String>,  // ★/★★/★★★/★★★★/★★★★★
    pub impact: Option<String>,
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
}

fn row_to_member(row: &Row) -> rusqlite::Result<ProjectMember> {
    Ok(ProjectMember {
        id: row.get(0)?,
        project_id: row.get(1)?,
        party: row.get(2)?,
        role: row.get(3)?,
        name: row.get(4)?,
        contact: row.get(5)?,
        participation: row.get(6)?,
        impact: row.get(7)?,
        sort_order: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
}

/// 列出项目的所有成员
pub fn list_by_project(conn: &Connection, project_id: i64) -> rusqlite::Result<Vec<ProjectMember>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, party, role, name, contact, participation, impact, sort_order, created_at, updated_at FROM project_members WHERE project_id = ?1 ORDER BY party ASC, sort_order ASC, id ASC",
    )?;
    let rows = stmt.query_map([project_id], row_to_member)?;
    rows.collect()
}

/// 按项目 + 阵营 列出成员
pub fn list_by_project_and_party(conn: &Connection, project_id: i64, party: &str) -> rusqlite::Result<Vec<ProjectMember>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, party, role, name, contact, participation, impact, sort_order, created_at, updated_at FROM project_members WHERE project_id = ?1 AND party = ?2 ORDER BY sort_order ASC, id ASC",
    )?;
    let rows = stmt.query_map(params![project_id, party], row_to_member)?;
    rows.collect()
}

/// 获取单个成员
pub fn get_by_id(conn: &Connection, id: i64) -> rusqlite::Result<Option<ProjectMember>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, party, role, name, contact, participation, impact, sort_order, created_at, updated_at FROM project_members WHERE id = ?1",
    )?;
    let mut rows = stmt.query_map([id], row_to_member)?;
    rows.next().transpose()
}

/// 创建成员
pub fn create(conn: &Connection, member: &ProjectMember) -> rusqlite::Result<i64> {
    conn.execute(
        "INSERT INTO project_members (project_id, party, role, name, contact, participation, impact, sort_order) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            member.project_id,
            member.party,
            member.role,
            member.name,
            member.contact,
            member.participation,
            member.impact,
            member.sort_order,
        ],
    )?;
    Ok(conn.last_insert_rowid())
}

/// 更新成员
pub fn update(conn: &Connection, id: i64, member: &ProjectMember) -> rusqlite::Result<bool> {
    let n = conn.execute(
        "UPDATE project_members SET party=?2, role=?3, name=?4, contact=?5, participation=?6, impact=?7, sort_order=?8, updated_at=CURRENT_TIMESTAMP WHERE id=?1",
        params![
            id,
            member.party,
            member.role,
            member.name,
            member.contact,
            member.participation,
            member.impact,
            member.sort_order,
        ],
    )?;
    Ok(n > 0)
}

/// 删除单个成员
pub fn delete(conn: &Connection, id: i64) -> rusqlite::Result<bool> {
    let n = conn.execute("DELETE FROM project_members WHERE id = ?1", [id])?;
    Ok(n > 0)
}

/// 按项目删除所有成员（项目删除级联 · 但暴露给 service 层做"清空"操作）
pub fn delete_by_project(conn: &Connection, project_id: i64) -> rusqlite::Result<usize> {
    let n = conn.execute("DELETE FROM project_members WHERE project_id = ?1", [project_id])?;
    Ok(n)
}