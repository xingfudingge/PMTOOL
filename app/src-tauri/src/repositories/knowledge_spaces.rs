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

/// 真删除整个知识空间（设计文档 §2 · 2026-09-07）
///
/// 一次性以事务方式清理：解绑关系 → 该空间全部笔记（含其附件记录并收集文件路径）→
/// 全部目录 → 空间本身。返回需由命令层 file_storage 删除的本地文件路径。
///
/// 原因：knowledge_notes.space_id 是 ON DELETE CASCADE（会随空间删笔记），但目录
/// knowledge_folders 只通过 space/project_id 关联、无 space_id 外键，且笔记附件不是
/// 外键级联 —— 直接 DELETE 空间会残留目录/附件记录/磁盘文件。
pub fn cascade_delete_space(
    conn: &mut Connection,
    space_id: i64,
) -> rusqlite::Result<Vec<String>> {
    let tx = conn.transaction()?;

    // 0. 确定该空间的 project_id（用于匹配 knowledge_folders.project_id）
    let project_id: Option<i64> = tx
        .query_row(
            "SELECT project_id FROM knowledge_spaces WHERE id = ?1",
            params![space_id],
            |r| r.get(0),
        )
        .optional()?
        .flatten();

    // 1. 解绑所有项目
    tx.execute(
        "DELETE FROM project_knowledge_bindings WHERE knowledge_space_id = ?1",
        params![space_id],
    )?;

    // 2. 收集该空间全部笔记
    let note_ids: Vec<i64> = {
        let mut stmt = tx.prepare("SELECT id FROM knowledge_notes WHERE space_id = ?1")?;
        let rows = stmt.query_map(params![space_id], |r| r.get::<_, i64>(0))?;
        rows.collect::<Result<Vec<_>, _>>()?
    };

    // 3. 收集笔记附件文件路径 + 删除附件记录
    let mut file_paths: Vec<String> = Vec::new();
    if !note_ids.is_empty() {
        let placeholders = note_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        {
            let sql = format!(
                "SELECT file_path FROM attachments WHERE owner_type = 'KNOWLEDGE' AND owner_id IN ({})",
                placeholders
            );
            let mut stmt = tx.prepare(&sql)?;
            let params = rusqlite::params_from_iter(note_ids.iter());
            let rows = stmt.query_map(params, |r| r.get::<_, String>(0))?;
            for p in rows {
                file_paths.push(p?);
            }
        }
        {
            let sql = format!(
                "DELETE FROM attachments WHERE owner_type = 'KNOWLEDGE' AND owner_id IN ({})",
                placeholders
            );
            tx.execute(&sql, rusqlite::params_from_iter(note_ids.iter()))?;
        }
        {
            let sql = format!("DELETE FROM knowledge_notes WHERE id IN ({})", placeholders);
            tx.execute(&sql, rusqlite::params_from_iter(note_ids.iter()))?;
        }
    }

    // 4. 删除该空间全部目录
    if let Some(pid) = project_id {
        tx.execute(
            "DELETE FROM knowledge_folders WHERE project_id = ?1",
            params![pid],
        )?;
    } else {
        tx.execute("DELETE FROM knowledge_folders WHERE space = 'personal'", [])?;
    }

    // 5. 删除空间本身
    tx.execute("DELETE FROM knowledge_spaces WHERE id = ?1", params![space_id])?;

    tx.commit()?;
    Ok(file_paths)
}
