/**
 * PMTool · 知识笔记数据访问层（2026-09-03 知识中心重构）
 *
 * 对应表：knowledge_notes
 *   - 0009_knowledge_spaces_and_bindings.sql 定义（新增 space_id 字段）
 *
 * 设计变更：
 *   - 原 project_id 字段（区分个人/项目）改为 space_id（指向 knowledge_spaces.id）
 *   - 冗余 space 字段（'personal'/'project'）用于快速查询
 *   - 删除时级联删除所有关联数据（BlockNote 内容、附件等）
 *
 * 关注点：纯 SQL 操作，不含业务逻辑。
 * 业务逻辑在 commands/knowledge.rs（前端 invoke 入口）。
 */

use rusqlite::{params, Connection, Row};
use serde::{Deserialize, Serialize};

/// 知识笔记（前端 KnowledgeNote 类型来源）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeNote {
    pub id: i64,
    pub space_id: i64,                // 新增：知识空间 ID
    pub space: String,                // 冗余：PERSONAL/PROJECT，方便前端筛选
    pub title: String,
    /// BlockNote JSON 主内容（content_type='BLOCKNOTE_JSON'）或 Markdown/纯文本
    pub content: Option<String>,
    /// 'MARKDOWN' | 'TEXT' | 'BLOCKNOTE_JSON'
    pub content_type: String,
    /// Markdown 快照（搜索/项目文件 .md 写回用）
    pub content_md: Option<String>,
    pub pinned: bool,
    /// 所属目录 · NULL = 根节点（0009）
    pub folder_id: Option<i64>,
    pub category: Option<String>,
    pub source_type: String,
    pub created_by: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// 输入辅助结构（id 可选 — None 时 INSERT 自增；Some 时 UPDATE）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeNoteInput {
    pub id: Option<i64>,
    pub space_id: i64,
    pub space: String,
    pub title: String,
    pub content: Option<String>,
    pub content_type: String,
    pub content_md: Option<String>,
    pub pinned: Option<bool>,
    pub folder_id: Option<i64>,
    pub category: Option<String>,
    pub source_type: Option<String>,
    pub created_by: Option<String>,
}

/// 共享 SELECT 列顺序 · 所有 SELECT 必须按这个顺序
const SELECT_COLS: &str = "id, space_id, space, title, content, content_type, \
                           content_md, pinned, folder_id, category, source_type, \
                           created_by, created_at, updated_at";

fn row_to_knowledge_note(row: &Row) -> rusqlite::Result<KnowledgeNote> {
    Ok(KnowledgeNote {
        id: row.get(0)?,
        space_id: row.get(1)?,
        space: row.get(2)?,
        title: row.get(3)?,
        content: row.get(4)?,
        content_type: row.get(5)?,
        content_md: row.get(6)?,
        pinned: row.get::<_, i64>(7)? != 0,
        folder_id: row.get(8)?,
        category: row.get(9)?,
        source_type: row.get(10)?,
        created_by: row.get(11)?,
        created_at: row.get(12)?,
        updated_at: row.get(13)?,
    })
}

/// 列出某个知识空间下的所有笔记（按 updated_at 倒序）
pub fn list_by_space(conn: &Connection, space_id: i64) -> rusqlite::Result<Vec<KnowledgeNote>> {
    let sql = format!(
        "SELECT {} FROM knowledge_notes WHERE space_id = ?1 \
         ORDER BY pinned DESC, updated_at DESC",
        SELECT_COLS
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![space_id], row_to_knowledge_note)?;
    rows.collect()
}

pub fn get_by_id(conn: &Connection, id: i64) -> rusqlite::Result<Option<KnowledgeNote>> {
    let sql = format!("SELECT {} FROM knowledge_notes WHERE id = ?1", SELECT_COLS);
    let mut stmt = conn.prepare(&sql)?;
    let mut rows = stmt.query(params![id])?;
    match rows.next()? {
        Some(row) => Ok(Some(row_to_knowledge_note(row)?)),
        None => Ok(None),
    }
}

/// Upsert：id 存在则 UPDATE，不存在则 INSERT（DB 自增 rowid）
pub fn upsert(conn: &Connection, input: KnowledgeNoteInput) -> rusqlite::Result<KnowledgeNote> {
    let pinned_int: i64 = if input.pinned.unwrap_or(false) { 1 } else { 0 };
    let source_type = input.source_type.as_deref().unwrap_or("USER");

    let final_id: i64 = match input.id {
        Some(id) if id > 0 => {
            let n = conn.execute(
                "UPDATE knowledge_notes
                 SET space_id=?2, space=?3, title=?4, content=?5, content_type=?6,
                     content_md=?7, pinned=?8, folder_id=?9, category=?10, source_type=?11,
                     created_by=?12, updated_at=CURRENT_TIMESTAMP
                 WHERE id=?1",
                params![
                    id,
                    input.space_id,
                    input.space,
                    input.title,
                    input.content,
                    input.content_type,
                    input.content_md,
                    pinned_int,
                    input.folder_id,
                    input.category,
                    source_type,
                    input.created_by,
                ],
            )?;
            if n == 0 {
                conn.execute(
                    "INSERT INTO knowledge_notes
                     (id, space_id, space, title, content, content_type,
                      content_md, pinned, folder_id, category, source_type,
                      created_by, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12,
                             CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
                    params![
                        id,
                        input.space_id,
                        input.space,
                        input.title,
                        input.content,
                        input.content_type,
                        input.content_md,
                        pinned_int,
                        input.folder_id,
                        input.category,
                        source_type,
                        input.created_by,
                    ],
                )?;
            }
            id
        }
        _ => {
            conn.execute(
                "INSERT INTO knowledge_notes
                 (space_id, space, title, content, content_type,
                  content_md, pinned, folder_id, category, source_type,
                  created_by, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11,
                         CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
                params![
                    input.space_id,
                    input.space,
                    input.title,
                    input.content,
                    input.content_type,
                    input.content_md,
                    pinned_int,
                    input.folder_id,
                    input.category,
                    source_type,
                    input.created_by,
                ],
            )?;
            conn.last_insert_rowid()
        }
    };

    get_by_id(conn, final_id)?.ok_or(rusqlite::Error::QueryReturnedNoRows)
}

/// 移动笔记到另一目录（folder_id=None 表示移到顶层）· 仅改归属，不动 updated_at
/// 原因：移动不是内容编辑 —— updated_at 驱动列表排序与前端编辑器 key，
/// 刷新它会连带打乱列表顺序并导致编辑器 remount。
pub fn move_to_folder(conn: &Connection, id: i64, folder_id: Option<i64>) -> rusqlite::Result<bool> {
    let n = conn.execute(
        "UPDATE knowledge_notes SET folder_id = ?2 WHERE id = ?1",
        params![id, folder_id],
    )?;
    Ok(n > 0)
}

/// 删除知识笔记及其关联的附件（级联删除由外键约束处理）
pub fn delete(conn: &Connection, id: i64) -> rusqlite::Result<bool> {
    // 记录审计日志（仅用于审计，不保留业务数据）
    let _ = conn.execute(
        "INSERT INTO audit_logs (action, target_type, target_id, content, created_at)
         VALUES ('DELETE', 'knowledge_note', ?1, NULL, CURRENT_TIMESTAMP)",
        params![id],
    );

    let n = conn.execute("DELETE FROM knowledge_notes WHERE id = ?1", params![id])?;
    Ok(n > 0)
}

/// 全文搜索：title LIKE %query% OR content_md LIKE %query%
/// space_id 参数用于精确到某个知识空间
pub fn search_by_space(
    conn: &Connection,
    space_id: i64,
    query: &str,
) -> rusqlite::Result<Vec<KnowledgeNote>> {
    let pattern = format!("%{}%", query);
    // 正文三处都搜：content_md(旧富文本) / content(BlockNote JSON 正文)，否则 BlockNote 笔记正文匹配不到
    let sql = format!(
        "SELECT {} FROM knowledge_notes \
         WHERE space_id = ?1 AND (title LIKE ?2 OR IFNULL(content_md, '') LIKE ?2 OR IFNULL(content, '') LIKE ?2) \
         ORDER BY pinned DESC, updated_at DESC",
        SELECT_COLS
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![space_id, pattern], row_to_knowledge_note)?;
    rows.collect()
}

/// 全文搜索：按空间类型筛选（'personal'/'project'）
/// 用于前端兼容旧 API
pub fn search_by_space_type(
    conn: &Connection,
    space: &str,
    query: &str,
) -> rusqlite::Result<Vec<KnowledgeNote>> {
    let pattern = format!("%{}%", query);
    // 正文三处都搜：content_md / content(BlockNote JSON 正文)，否则 BlockNote 笔记正文匹配不到
    let sql = format!(
        "SELECT {} FROM knowledge_notes \
         WHERE space = ?1 AND (title LIKE ?2 OR IFNULL(content_md, '') LIKE ?2 OR IFNULL(content, '') LIKE ?2) \
         ORDER BY pinned DESC, updated_at DESC",
        SELECT_COLS
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![space, pattern], row_to_knowledge_note)?;
    rows.collect()
}
