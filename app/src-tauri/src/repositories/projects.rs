/**
 * PMTool · Project 数据访问层
 * Phase 0 · T0.4e
 *
 * 职责：纯 SQL 操作，不含业务逻辑。
 * 业务逻辑在 services 层（待 Phase 1+ 补充）。
 *
 * 对应表：projects
 */

use rusqlite::{params, Row};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Project {
    pub id: i64,
    pub project_code: String,
    pub project_name: String,
    pub customer_name: Option<String>,
    pub status: String,
    pub priority: String,
    pub owner: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub contract_amount: Option<f64>,
    pub background: Option<String>,
    pub objective: Option<String>,
    pub scope: Option<String>,
    pub description: Option<String>,
    /// 维护者 2026-08-31：项目绑定的本地目录路径（用于 FilesTab 浏览项目文件）
    #[serde(default)]
    pub local_directory_path: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

fn row_to_project(row: &Row) -> rusqlite::Result<Project> {
    Ok(Project {
        id: row.get(0)?,
        project_code: row.get(1)?,
        project_name: row.get(2)?,
        customer_name: row.get(3)?,
        status: row.get(4)?,
        priority: row.get(5)?,
        owner: row.get(6)?,
        start_date: row.get(7)?,
        end_date: row.get(8)?,
        contract_amount: row.get(9)?,
        background: row.get(10)?,
        objective: row.get(11)?,
        scope: row.get(12)?,
        description: row.get(13)?,
        local_directory_path: row.get(14)?,
        created_at: row.get(15)?,
        updated_at: row.get(16)?,
    })
}

/// 列出项目（按状态过滤）
pub fn list_by_status(
    conn: &rusqlite::Connection,
    status: Option<&str>,
) -> rusqlite::Result<Vec<Project>> {
    let mut sql = "SELECT id, project_code, project_name, customer_name, status, priority, owner, start_date, end_date, contract_amount, background, objective, scope, description, local_directory_path, created_at, updated_at FROM projects".to_string();
    if let Some(s) = status {
        sql.push_str(" WHERE status = ?1");
    }
    sql.push_str(" ORDER BY start_date DESC, id DESC");

    let mut stmt = conn.prepare(&sql)?;
    let rows = if let Some(s) = status {
        stmt.query_map([s], row_to_project)?
    } else {
        stmt.query_map([], row_to_project)?
    };
    rows.collect()
}

/// 获取单个项目
pub fn get_by_id(conn: &rusqlite::Connection, id: i64) -> rusqlite::Result<Option<Project>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_code, project_name, customer_name, status, priority, owner, start_date, end_date, contract_amount, background, objective, scope, description, local_directory_path, created_at, updated_at FROM projects WHERE id = ?1",
    )?;
    let mut rows = stmt.query_map([id], row_to_project)?;
    rows.next().transpose()
}

/// 创建项目
pub fn create(
    conn: &rusqlite::Connection,
    project: &Project,
) -> rusqlite::Result<i64> {
    conn.execute(
        "INSERT INTO projects (project_code, project_name, customer_name, status, priority, owner, start_date, end_date, contract_amount, background, objective, scope, description, local_directory_path) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
        params![
            project.project_code,
            project.project_name,
            project.customer_name,
            project.status,
            project.priority,
            project.owner,
            project.start_date,
            project.end_date,
            project.contract_amount,
            project.background,
            project.objective,
            project.scope,
            project.description,
            project.local_directory_path,
        ],
    )?;
    Ok(conn.last_insert_rowid())
}

/// 更新项目
pub fn update(
    conn: &rusqlite::Connection,
    id: i64,
    project: &Project,
) -> rusqlite::Result<bool> {
    let n = conn.execute(
        "UPDATE projects SET project_name=?2, customer_name=?3, status=?4, priority=?5, owner=?6, start_date=?7, end_date=?8, contract_amount=?9, background=?10, objective=?11, scope=?12, description=?13, local_directory_path=?14, updated_at=CURRENT_TIMESTAMP WHERE id=?1",
        params![
            id,
            project.project_name,
            project.customer_name,
            project.status,
            project.priority,
            project.owner,
            project.start_date,
            project.end_date,
            project.contract_amount,
            project.background,
            project.objective,
            project.scope,
            project.description,
            project.local_directory_path,
        ],
    )?;
    Ok(n > 0)
}

/// 维护者 2026-08-31：单独更新项目的本地目录路径（FilesTab 选择目录时用）
pub fn update_local_directory(
    conn: &rusqlite::Connection,
    id: i64,
    path: Option<&str>,
) -> rusqlite::Result<bool> {
    let n = conn.execute(
        "UPDATE projects SET local_directory_path=?2, updated_at=CURRENT_TIMESTAMP WHERE id=?1",
        params![id, path],
    )?;
    Ok(n > 0)
}

/// 删除项目
pub fn delete(conn: &rusqlite::Connection, id: i64) -> rusqlite::Result<bool> {
    // 项目删除不应删除知识沉淀：先解除知识记录与项目表的外键关联，再删除项目。
    // 已归档知识仍保留在“项目知识中心”，根目录继续使用原项目名称。
    let tx = conn.unchecked_transaction()?;
    // 知识笔记已从 project_id 迁移为 space_id（经 knowledge_spaces 绑定），故通过 project_knowledge_bindings 解绑，而非直接改 notes.project_id。
    tx.execute("DELETE FROM project_knowledge_bindings WHERE project_id = ?1", [id])?;
    tx.execute("UPDATE knowledge_folders SET project_id = NULL WHERE project_id = ?1", [id])?;
    let n = tx.execute("DELETE FROM projects WHERE id = ?1", [id])?;
    tx.commit()?;
    Ok(n > 0)
}
