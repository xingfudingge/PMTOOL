/**
 * PMTool · 项目知识绑定数据访问层
 *
 * 对应表：project_knowledge_bindings
 *   - 0009_knowledge_spaces_and_bindings.sql 定义
 *
 * 绑定关系说明：
 *   - 项目中心只是项目知识空间的访问入口
 *   - 绑定关系由项目中心创建，解绑时只删除绑定，不删除知识空间
 *   - 删除知识空间时会级联删除所有绑定
 *
 * 关注点：纯 SQL 操作，不含业务逻辑。
 */

use rusqlite::{params, Connection, Row};
use serde::{Deserialize, Serialize};

/// 项目知识绑定（对应 project_knowledge_bindings 表）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectKnowledgeBinding {
    pub id: i64,
    pub project_id: i64,
    pub knowledge_space_id: i64,
    pub created_at: String,
    pub updated_at: String,
}

/// 输入辅助结构
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectKnowledgeBindingInput {
    pub project_id: i64,
    pub knowledge_space_id: i64,
}

/// 共享 SELECT 列顺序
const SELECT_COLS: &str = "id, project_id, knowledge_space_id, created_at, updated_at";

fn row_to_binding(row: &Row) -> rusqlite::Result<ProjectKnowledgeBinding> {
    Ok(ProjectKnowledgeBinding {
        id: row.get(0)?,
        project_id: row.get(1)?,
        knowledge_space_id: row.get(2)?,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
    })
}

/// 列出某项目的所有绑定
pub fn list_by_project(conn: &Connection, project_id: i64) -> rusqlite::Result<Vec<ProjectKnowledgeBinding>> {
    let sql = format!(
        "SELECT {} FROM project_knowledge_bindings WHERE project_id = ?1",
        SELECT_COLS
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![project_id], row_to_binding)?;
    rows.collect()
}

/// 列出某知识空间的所有绑定
pub fn list_by_space(conn: &Connection, space_id: i64) -> rusqlite::Result<Vec<ProjectKnowledgeBinding>> {
    let sql = format!(
        "SELECT {} FROM project_knowledge_bindings WHERE knowledge_space_id = ?1",
        SELECT_COLS
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![space_id], row_to_binding)?;
    rows.collect()
}

/// 获取单个绑定
pub fn get_by_id(conn: &Connection, id: i64) -> rusqlite::Result<Option<ProjectKnowledgeBinding>> {
    let sql = format!("SELECT {} FROM project_knowledge_bindings WHERE id = ?1", SELECT_COLS);
    let mut stmt = conn.prepare(&sql)?;
    let mut rows = stmt.query(params![id])?;
    match rows.next()? {
        Some(row) => Ok(Some(row_to_binding(row)?)),
        None => Ok(None),
    }
}

/// 创建绑定
pub fn create(conn: &Connection, input: ProjectKnowledgeBindingInput) -> rusqlite::Result<ProjectKnowledgeBinding> {
    let sql = format!(
        "INSERT INTO project_knowledge_bindings (project_id, knowledge_space_id, created_at, updated_at)
         VALUES (?1, ?2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    );
    conn.execute(&sql, params![input.project_id, input.knowledge_space_id])?;
    get_by_id(conn, conn.last_insert_rowid())?
        .ok_or(rusqlite::Error::QueryReturnedNoRows)
}

/// 删除某项目与某知识空间的绑定
pub fn delete(conn: &Connection, project_id: i64, space_id: i64) -> rusqlite::Result<bool> {
    let n = conn.execute(
        "DELETE FROM project_knowledge_bindings WHERE project_id = ?1 AND knowledge_space_id = ?2",
        params![project_id, space_id]
    )?;
    Ok(n > 0)
}

/// 解绑项目的所有绑定（用于项目删除等场景）
pub fn delete_all_by_project(conn: &Connection, project_id: i64) -> rusqlite::Result<bool> {
    let n = conn.execute(
        "DELETE FROM project_knowledge_bindings WHERE project_id = ?1",
        params![project_id]
    )?;
    Ok(n > 0)
}
