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

/// JOIN 查询用：加 `ks.` 前缀避免 project_knowledge_bindings 同名列歧义
const SELECT_COLS_KS: &str = "ks.id, ks.space_type, ks.project_id, ks.name, ks.created_at, ks.updated_at";

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

/// 列出某项目通过绑定可访问的所有知识空间（多对多：一个空间可被多个项目共享）
/// 走 project_knowledge_bindings 关联，而非空间自带 project_id（后者已改为一库多项目共享模型）
pub fn list_by_project(conn: &Connection, project_id: i64) -> rusqlite::Result<Vec<KnowledgeSpace>> {
    let sql = format!(
        "SELECT {} FROM knowledge_spaces ks \
         JOIN project_knowledge_bindings pb ON pb.knowledge_space_id = ks.id \
         WHERE pb.project_id = ?1 \
         ORDER BY ks.id ASC",
        SELECT_COLS_KS
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![project_id], row_to_knowledge_space)?;
    rows.collect()
}

/// 列出所有项目型知识空间（供「知识库为主」列表：每行一个空间）
pub fn list_all_project_spaces(conn: &Connection) -> rusqlite::Result<Vec<KnowledgeSpace>> {
    let sql = format!(
        "SELECT {} FROM knowledge_spaces WHERE space_type = ?1 ORDER BY id ASC",
        SELECT_COLS
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params!["project"], row_to_knowledge_space)?;
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
/// 2026-09-07 一库多项目共享：project 型空间不再锁单项目，project_id 强制 NULL，
/// space_type 统一小写存储。项目↔空间完全由 project_knowledge_bindings 关联。
pub fn create(conn: &Connection, input: KnowledgeSpaceInput) -> rusqlite::Result<KnowledgeSpace> {
    let space_type = input.space_type.to_lowercase();
    let project_id: Option<i64> = if space_type == "project" { None } else { input.project_id };
    let sql = format!(
        "INSERT INTO knowledge_spaces (space_type, project_id, name, created_at, updated_at)
         VALUES (?1, ?2, ?3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    );
    conn.execute(&sql, params![space_type, project_id, input.name])?;
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

    // 4. 删除该空间全部目录（2026-09-07 改按 space_id，不再按 project_id / 空间字符串）
    //    注意：knowledge_folders.parent_id 是 ON DELETE RESTRICT（自引用树）。
    //    必须逐层删叶子（子先于父），否则一条 DELETE 删全部目录时 SQLite 按行序删父先于子，
    //    会触发 FOREIGN KEY constraint failed（含嵌套目录的库会删失败）。
    loop {
        let n = tx.execute(
            "DELETE FROM knowledge_folders \
             WHERE space_id = ?1 \
               AND id NOT IN (SELECT parent_id FROM knowledge_folders \
                              WHERE space_id = ?1 AND parent_id IS NOT NULL)",
            params![space_id],
        )?;
        if n == 0 {
            break;
        }
    }

    // 5. 删除空间本身
    tx.execute("DELETE FROM knowledge_spaces WHERE id = ?1", params![space_id])?;

    tx.commit()?;
    Ok(file_paths)
}
