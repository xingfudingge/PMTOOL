/**
 * PMTool · 知识空间数据访问层
 *
 * 对应表：knowledge_spaces
 *   - 0009_knowledge_spaces_and_bindings.sql 定义
 *
 * 知识空间是知识中心的独立容器：
 *   - 'personal'：个人知识中心（只有一个，project_id=NULL）
 *   - 'project'：项目知识中心（每个项目一个，project_id 指向项目）
 *
 * 关注点：纯 SQL 操作，不含业务逻辑。
 */

use rusqlite::{params, Connection, Row};
use serde::{Deserialize, Serialize};

/// 知识空间 (对应 knowledge_spaces 表)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeSpace {
    pub id: i64,
    pub space_type: String,  // 'personal' / 'project'
    pub project_id: Option<i64>,
    pub name: String,
    pub created_at: String,
    pub updated_at: String,
}

/// 输入辅助结构
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeSpaceInput {
    pub space_type: String,
    pub project_id: Option<i64>,
    pub name: String,
}

/// 共享 SELECT 列顺序
const SELECT_COLS: &str = "id, space_type, project_id, name, created_at, updated_at";

fn row_to_knowledge_space(row: &Row) -> rusqlite::Result<KnowledgeSpace> {
    Ok(KnowledgeSpace {
        id: row.get(0)?,
        space_type: row.get(1)?,
        project_id: row.get(2)?,
        name: row.get(3)?,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
    })
}

/// 列出所有个人知识空间（通常只有一个）
pub fn list_personal(conn: &Connection) -> rusqlite::Result<Vec<KnowledgeSpace>> {
    let sql = format!(
        "SELECT {} FROM knowledge_spaces WHERE space_type = ?1",
        SELECT_COLS
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params!["personal"], row_to_knowledge_space)?;
    rows.collect()
}

/// 列出某项目的所有知识空间（通常也是一个）
pub fn list_by_project(conn: &Connection, project_id: i64) -> rusqlite::Result<Vec<KnowledgeSpace>> {
    let sql = format!(
        "SELECT {} FROM knowledge_spaces WHERE space_type = ?1 AND project_id = ?2",
        SELECT_COLS
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params!["project", project_id], row_to_knowledge_space)?;
    rows.collect()
}

/// 获取单个知识空间
pub fn get_by_id(conn: &Connection, id: i64) -> rusqlite::Result<Option<KnowledgeSpace>> {
    let sql = format!("SELECT {} FROM knowledge_spaces WHERE id = ?1", SELECT_COLS);
    let mut stmt = conn.prepare(&sql)?;
    let mut rows = stmt.query(params![id])?;
    match rows.next()? {
        Some(row) => Ok(Some(row_to_knowledge_space(row)?)),
        None => Ok(None),
    }
}

/// 创建新的知识空间
pub fn create(conn: &Connection, input: KnowledgeSpaceInput) -> rusqlite::Result<KnowledgeSpace> {
    let sql = format!(
        "INSERT INTO knowledge_spaces (space_type, project_id, name, created_at, updated_at)
         VALUES (?1, ?2, ?3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    );
    conn.execute(&sql, params![input.space_type, input.project_id, input.name])?;
    get_by_id(conn, conn.last_insert_rowid())?
        .ok_or(rusqlite::Error::QueryReturnedNoRows)
}

/// 删除知识空间（需要先解绑所有项目）
pub fn delete(conn: &Connection, id: i64) -> rusqlite::Result<bool> {
    let n = conn.execute("DELETE FROM knowledge_spaces WHERE id = ?1", params![id])?;
    Ok(n > 0)
}
