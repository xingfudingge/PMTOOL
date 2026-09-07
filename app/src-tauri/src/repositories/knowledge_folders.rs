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

/// 递归级联真删除目录（设计文档 §2 · §25）
///
/// 一次性以事务方式：收集整棵子树（含自身）→ 收集子目录下所有笔记 → 收集这些
/// 笔记的附件（owner_type='KNOWLEDGE'）文件路径并删除其记录 → 删除笔记 → 从叶子
/// 向上删除所有目录。返回需由命令层调用 file_storage 删除的本地文件路径。
///
/// 原因：knowledge_folders.parent_id 是 ON DELETE RESTRICT（有子目录时会阻止删除），
/// 且 knowledge_notes.folder_id 是 ON DELETE SET NULL（不会级联删笔记）。因此必须
/// 显式递归，否则删含内容的目录会失败或留下孤儿笔记，违背“目录→知识→附件全部真删”。
pub fn cascade_delete(conn: &mut Connection, id: i64) -> rusqlite::Result<Vec<String>> {
    let tx = conn.transaction()?;

    // 1. 递归收集子树 folder id（含自身）
    let folder_ids: Vec<i64> = {
        let mut stmt = tx.prepare(
            "WITH RECURSIVE subtree(id) AS (\n                 SELECT id FROM knowledge_folders WHERE id = ?1\n                 UNION ALL\n                 SELECT kf.id FROM knowledge_folders kf\n                 JOIN subtree s ON kf.parent_id = s.id\n             )\n             SELECT id FROM subtree",
        )?;
        let rows = stmt.query_map(params![id], |r| r.get::<_, i64>(0))?;
        rows.collect::<Result<Vec<_>, _>>()?
    };
    if folder_ids.is_empty() {
        return Ok(Vec::new());
    }

    // 2. 收集子目录下所有笔记
    let note_ids: Vec<i64> = {
        let placeholders = folder_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = format!(
            "SELECT id FROM knowledge_notes WHERE folder_id IN ({}) ",
            placeholders
        );
        let mut stmt = tx.prepare(&sql)?;
        let params = rusqlite::params_from_iter(folder_ids.iter());
        let rows = stmt.query_map(params, |r| r.get::<_, i64>(0))?;
        rows.collect::<Result<Vec<_>, _>>()?
    };

    // 3. 收集这些笔记的附件文件路径 + 删除附件记录
    let mut file_paths: Vec<String> = Vec::new();
    if !note_ids.is_empty() {
        let placeholders = note_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        // 记录下附件路径供命令层删文件
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
        // 删除附件记录（文件由命令层删）
        {
            let sql = format!(
                "DELETE FROM attachments WHERE owner_type = 'KNOWLEDGE' AND owner_id IN ({})",
                placeholders
            );
            tx.execute(&sql, rusqlite::params_from_iter(note_ids.iter()))?;
        }
        // 删除笔记
        {
            let sql = format!("DELETE FROM knowledge_notes WHERE id IN ({})", placeholders);
            tx.execute(&sql, rusqlite::params_from_iter(note_ids.iter()))?;
        }
    }

    // 4. 从叶子向上删除所有目录（子先于父，规避 RESTRICT）
    {
        let placeholders = folder_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = format!("DELETE FROM knowledge_folders WHERE id IN ({})", placeholders);
        tx.execute(&sql, rusqlite::params_from_iter(folder_ids.iter()))?;
    }

    tx.commit()?;
    Ok(file_paths)
}

/// 列出指定目录下（不含子目录）的所有笔记
pub fn list_notes_below(conn: &Connection, folder_id: i64) -> rusqlite::Result<Vec<i64>> {
    let mut stmt = conn.prepare("SELECT id FROM knowledge_notes WHERE folder_id = ?1")?;
    let rows = stmt.query_map(params![folder_id], |r| r.get::<_, i64>(0))?;
    rows.collect()
}

/// 确保项目根目录存在（PROJECT_ROOT 类型）
/// 项目创建时自动调用，保证项目知识中心有根目录
pub fn ensure_project_root(
    conn: &Connection,
    project_id: i64,
    project_name: &str,
) -> rusqlite::Result<KnowledgeFolder> {
    // 先检查是否已存在
    if let Some(existing) = get_root_folder(conn, "project", Some(project_id))? {
        return Ok(existing);
    }

    // 创建根目录
    let input = KnowledgeFolderInput {
        id: None,
        parent_id: None,
        space: "project".to_string(),
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
