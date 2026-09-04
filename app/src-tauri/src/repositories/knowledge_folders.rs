/**
 * PMTool · 知识目录数据访问层（2026-09-03 知识中心重构）
 *
 * 对应表：knowledge_folders
 *   - 0009_knowledge_spaces_and_bindings.sql 定义（新增 system_type 字段）
 *
 * 设计变更：
 *   - system_type 字段：USER（用户创建）/ SYSTEM_AI（AI 生成目录）/ PROJECT_ROOT（项目根目录）
 *   - 个人知识中心只有一个 personal 空间（project_id=NULL）
 *   - 项目知识中心每个项目一个 PROJECT 空间（project_id 指向项目）
 *
 * 关注点：纯 SQL 操作，不含业务逻辑。
 * 业务逻辑在 commands/knowledge_folders.rs（前端 invoke 入口）。
 */

use rusqlite::{params, Connection, Row};
use serde::{Deserialize, Serialize};

/// 知识目录（前端 KnowledgeFolder 类型来源）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeFolder {
    pub id: i64,
    pub parent_id: Option<i64>,
    pub space: String,              // 'personal' / 'project'
    pub project_id: Option<i64>,    // 仅当 space=PROJECT 时有效
    pub name: String,
    pub sort_order: i64,
    pub system_type: String,        // USER / SYSTEM_AI / PROJECT_ROOT
    pub created_at: String,
    pub updated_at: String,
}

/// 输入辅助结构
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeFolderInput {
    pub id: Option<i64>,
    pub parent_id: Option<i64>,
    pub space: String,
    pub project_id: Option<i64>,
    pub name: String,
    pub sort_order: Option<i64>,
    pub system_type: Option<String>,
}

/// 共享 SELECT 列顺序
const SELECT_COLS: &str = "id, parent_id, space, project_id, name, sort_order, \
                           system_type, created_at, updated_at";

fn row_to_knowledge_folder(row: &Row) -> rusqlite::Result<KnowledgeFolder> {
    Ok(KnowledgeFolder {
        id: row.get(0)?,
        parent_id: row.get(1)?,
        space: row.get(2)?,
        project_id: row.get(3)?,
        name: row.get(4)?,
        sort_order: row.get(5)?,
        system_type: row.get(6)?,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

/// 列出某个空间下的所有目录
pub fn list_by_space(conn: &Connection, space: &str) -> rusqlite::Result<Vec<KnowledgeFolder>> {
    let sql = format!(
        "SELECT {} FROM knowledge_folders WHERE space = ?1 \
         ORDER BY sort_order ASC, name ASC",
        SELECT_COLS
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![space], row_to_knowledge_folder)?;
    rows.collect()
}

/// 列出某个项目下的所有目录
pub fn list_by_project(conn: &Connection, project_id: i64) -> rusqlite::Result<Vec<KnowledgeFolder>> {
    let sql = format!(
        "SELECT {} FROM knowledge_folders WHERE project_id = ?1 \
         ORDER BY sort_order ASC, name ASC",
        SELECT_COLS
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![project_id], row_to_knowledge_folder)?;
    rows.collect()
}

/// 列出某个知识空间下的所有目录（通过 space_id）
pub fn list_by_space_id(conn: &Connection, space_id: i64) -> rusqlite::Result<Vec<KnowledgeFolder>> {
    let sql = format!(
        "SELECT {} FROM knowledge_folders WHERE space_id = ?1 \
         ORDER BY sort_order ASC, name ASC",
        SELECT_COLS
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![space_id], row_to_knowledge_folder)?;
    rows.collect()
}

/// 获取单个目录
pub fn get_by_id(conn: &Connection, id: i64) -> rusqlite::Result<Option<KnowledgeFolder>> {
    let sql = format!("SELECT {} FROM knowledge_folders WHERE id = ?1", SELECT_COLS);
    let mut stmt = conn.prepare(&sql)?;
    let mut rows = stmt.query(params![id])?;
    match rows.next()? {
        Some(row) => Ok(Some(row_to_knowledge_folder(row)?)),
        None => Ok(None),
    }
}

/// 获取某个空间下的根目录（parent_id=NULL）
pub fn get_root_folder(
    conn: &Connection,
    space: &str,
    project_id: Option<i64>,
) -> rusqlite::Result<Option<KnowledgeFolder>> {
    let sql = if project_id.is_some() {
        format!(
            "SELECT {} FROM knowledge_folders \
             WHERE space = ?1 AND project_id = ?2 AND parent_id IS NULL",
            SELECT_COLS
        )
    } else {
        format!(
            "SELECT {} FROM knowledge_folders \
             WHERE space = ?1 AND project_id IS NULL AND parent_id IS NULL",
            SELECT_COLS
        )
    };

    let mut stmt = conn.prepare(&sql)?;
    let mut rows = if project_id.is_some() {
        stmt.query(params![space, project_id])?
    } else {
        stmt.query(params![space])?
    };

    match rows.next()? {
        Some(row) => Ok(Some(row_to_knowledge_folder(row)?)),
        None => Ok(None),
    }
}

/// 创建或更新目录
pub fn upsert(conn: &Connection, input: KnowledgeFolderInput) -> rusqlite::Result<KnowledgeFolder> {
    let system_type = input.system_type.as_deref().unwrap_or("USER");
    let sort_order = input.sort_order.unwrap_or(0);

    // 先尝试 UPDATE
    if let Some(id) = input.id {
        let n = conn.execute(
            "UPDATE knowledge_folders
             SET parent_id=?2, space=?3, project_id=?4, name=?5, sort_order=?6,
                 system_type=?7, updated_at=CURRENT_TIMESTAMP
             WHERE id=?1",
            params![
                id, input.parent_id, input.space, input.project_id,
                input.name, sort_order, system_type
            ],
        )?;
        if n > 0 {
            return get_by_id(conn, id)?.ok_or(rusqlite::Error::QueryReturnedNoRows);
        }
    }

    // INSERT
    let final_id: i64 = conn.execute(
        "INSERT INTO knowledge_folders
         (parent_id, space, project_id, name, sort_order, system_type, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
        params![
            input.parent_id, input.space, input.project_id,
            input.name, sort_order, system_type
        ],
    )?.try_into().unwrap();

    get_by_id(conn, final_id)?.ok_or(rusqlite::Error::QueryReturnedNoRows)
}

/// 删除目录及其所有子目录和关联知识
/// 通过外键 CASCADE 自动级联删除
pub fn delete(conn: &Connection, id: i64) -> rusqlite::Result<bool> {
    // 记录审计日志
    let _ = conn.execute(
        "INSERT INTO audit_logs (action, target_type, target_id, content, created_at)
         VALUES ('DELETE', 'knowledge_folder', ?1, NULL, CURRENT_TIMESTAMP)",
        params![id],
    );

    let n = conn.execute("DELETE FROM knowledge_folders WHERE id = ?1", params![id])?;
    Ok(n > 0)
}

/// 确保项目根目录存在（PROJECT_ROOT 类型）
/// 项目创建时自动调用，保证项目知识中心有根目录
pub fn ensure_project_root(
    conn: &Connection,
    project_id: i64,
    project_name: &str,
) -> rusqlite::Result<KnowledgeFolder> {
    // 先检查是否已存在
    if let Some(existing) = get_root_folder(conn, "PROJECT", Some(project_id))? {
        return Ok(existing);
    }

    // 创建根目录
    let input = KnowledgeFolderInput {
        id: None,
        parent_id: None,
        space: "PROJECT".to_string(),
        project_id: Some(project_id),
        name: project_name.to_string(),
        sort_order: Some(0),
        system_type: Some("PROJECT_ROOT".to_string()),
    };

    upsert(conn, input)
}

/// 确保 AI 生成目录存在（SYSTEM_AI 类型）
/// 每个空间应该有一个 AI 生成目录
pub fn ensure_ai_folder(
    conn: &Connection,
    space: &str,
    project_id: Option<i64>,
) -> rusqlite::Result<KnowledgeFolder> {
    // 检查是否已存在
    let folders = if project_id.is_some() {
        list_by_project(conn, project_id.unwrap())?
    } else {
        list_by_space(conn, space)?
    };

    if let Some(existing) = folders.iter().find(|f| f.system_type == "SYSTEM_AI") {
        return Ok(existing.clone());
    }

    // 创建 AI 目录
    let input = KnowledgeFolderInput {
        id: None,
        parent_id: None,
        space: space.to_string(),
        project_id,
        name: "AI 生成".to_string(),
        sort_order: Some(0),
        system_type: Some("SYSTEM_AI".to_string()),
    };

    upsert(conn, input)
}
