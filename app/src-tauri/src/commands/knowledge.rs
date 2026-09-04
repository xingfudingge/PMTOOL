/**
 * PMTool · 知识中心 Tauri Commands（2026-09-03 知识中心重构）
 *
 * 设计变更：
 *   - 知识笔记现在属于 knowledge_space（通过 space_id 关联）
 *   - 个人知识中心和个人知识空间一一对应
 *   - 项目知识中心通过 project_knowledge_bindings 绑定到项目知识空间
 *
 * 对应 Rust repositories/knowledge_notes.rs：
 *   - list_by_space() / list_by_space_type()
 *   - get_by_id()
 *   - upsert()
 *   - delete()
 *   - search_by_space() / search_by_space_type()
 *
 * 与 attachments / project_files 模块边界：
 *   - attachments：项目受管文件
 *   - project_files：项目本地目录的文件系统操作（不经过 DB）
 *   - knowledge：用户/项目结构化笔记（DB 主存）
 *
 * 删除规则（2026-09-03 设计文档 §2）：
 *   - 所有删除操作必须二次确认
 *   - 真删除：数据库记录 + 知识内容（BlockNote）+ 附件 + 文件关联全部删除
 *   - 不保留回收站、软删除、删除记录（审计日志除外）
 */

use tauri::State;

use crate::AppState;
use crate::repositories::knowledge_notes::{
    self as repo, KnowledgeNote, KnowledgeNoteInput,
};

/// 列出某个知识空间下的所有笔记（按 updated_at 倒序）
/// space_id: 知识空间 ID（knowledge_spaces.id）
#[tauri::command]
pub fn list_knowledge_notes(
    state: State<'_, AppState>,
    space_id: i64,
) -> Result<Vec<KnowledgeNote>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    repo::list_by_space(&conn, space_id).map_err(|e| e.to_string())
}

/// 列出某个空间类型下的所有笔记（兼容旧 API）
/// space: 'personal' | 'project'
#[tauri::command]
pub fn list_knowledge_notes_by_space_type(
    state: State<'_, AppState>,
    space: String,
) -> Result<Vec<KnowledgeNote>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    repo::list_by_space_type(&conn, &space).map_err(|e| e.to_string())
}

/// 按 id 查一条笔记
#[tauri::command]
pub fn get_knowledge_note(
    state: State<'_, AppState>,
    id: i64,
) -> Result<Option<KnowledgeNote>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    repo::get_by_id(&conn, id).map_err(|e| e.to_string())
}

/// Upsert 笔记：id 存在则 UPDATE，不存在则 INSERT（DB 自增 rowid）
/// 返回最终的 KnowledgeNote（含 DB 自动生成的 id / 时间戳）
#[tauri::command]
pub fn upsert_knowledge_note(
    state: State<'_, AppState>,
    note: KnowledgeNoteInput,
) -> Result<KnowledgeNote, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    repo::upsert(&conn, note).map_err(|e| e.to_string())
}

/// 删除一条笔记（二次确认后执行）
#[tauri::command]
pub fn delete_knowledge_note(
    state: State<'_, AppState>,
    id: i64,
) -> Result<bool, String> {
    // 维护者 2026-09-03：拦截非法 id（负数 / 0），避免误删
    if id <= 0 {
        return Ok(false);
    }
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    repo::delete(&conn, id).map_err(|e| e.to_string())
}

/// 全文搜索：按知识空间 ID 筛选（别名）
#[tauri::command]
pub fn search_knowledge_notes(
    state: State<'_, AppState>,
    space_id: i64,
    query: String,
) -> Result<Vec<KnowledgeNote>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    repo::search_by_space(&conn, space_id, &query).map_err(|e| e.to_string())
}

/// 全文搜索：按空间类型筛选（兼容旧 API）
#[tauri::command]
pub fn search_knowledge_notes_by_space_type(
    state: State<'_, AppState>,
    space: String,
    query: String,
) -> Result<Vec<KnowledgeNote>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    repo::search_by_space_type(&conn, &space, &query).map_err(|e| e.to_string())
}
