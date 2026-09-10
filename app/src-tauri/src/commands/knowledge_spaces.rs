/**
 * PMTool · 知识空间 Tauri Commands
 *
 * 对应 Rust repositories/knowledge_spaces.rs：
 *   - list_personal()
 *   - list_by_project()
 *   - get_by_id()
 *   - create()
 *   - delete()
 *
 * 设计原则：
 *   - 个人知识中心和个人知识空间一一对应
 *   - 项目知识中心通过绑定关系访问项目知识空间
 *   - 删除知识空间前必须先解绑所有项目
 */

use tauri::State;

use crate::AppState;
use crate::repositories::knowledge_spaces::{
    self as repo, KnowledgeSpace, KnowledgeSpaceInput,
};

/// 列出个人知识空间（通常只有一个）
#[tauri::command]
pub fn list_personal_knowledge_spaces(
    state: State<'_, AppState>,
) -> Result<Vec<KnowledgeSpace>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    repo::list_personal(&conn).map_err(|e| e.to_string())
}

/// 列出某项目通过绑定可访问的所有知识空间
#[tauri::command]
pub fn list_project_knowledge_spaces(
    state: State<'_, AppState>,
    project_id: i64,
) -> Result<Vec<KnowledgeSpace>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    repo::list_by_project(&conn, project_id).map_err(|e| e.to_string())
}

/// 列出所有项目型知识空间（供「以知识库为主」列表）
#[tauri::command]
pub fn list_all_project_spaces(
    state: State<'_, AppState>,
) -> Result<Vec<KnowledgeSpace>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    repo::list_all_project_spaces(&conn).map_err(|e| e.to_string())
}

/// 获取单个知识空间
#[tauri::command]
pub fn get_knowledge_space(
    state: State<'_, AppState>,
    id: i64,
) -> Result<Option<KnowledgeSpace>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    repo::get_by_id(&conn, id).map_err(|e| e.to_string())
}

/// 创建新的知识空间（知识库）
/// 2026-09-09 · 新建知识库时自动为该库创建独立的 AI 生成目录（一库一 AI 目录 · 不跨库共享）。
#[tauri::command]
pub fn create_knowledge_space(
    state: State<'_, AppState>,
    input: KnowledgeSpaceInput,
) -> Result<KnowledgeSpace, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let created = repo::create(&conn, input).map_err(|e| e.to_string())?;
    // 新建知识库即自动创建该库的 AI 生成目录（失败不阻断建库，仅提示）
    if let Err(e) = crate::repositories::knowledge_folders::ensure_ai_folder_for_space(
        &conn,
        created.id,
        &created.space_type,
    ) {
        return Err(format!(
            "知识库「{}」已创建，但初始化 AI 生成目录失败：{}",
            created.name, e
        ));
    }
    Ok(created)
}

/// 删除知识空间（2026-09-07 改为级联真删：解绑 + 空间内目录/知识/附件记录 + 磁盘文件）
#[tauri::command]
pub fn delete_knowledge_space(
    state: State<'_, AppState>,
    id: i64,
) -> Result<bool, String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    // 个人知识空间不允许删除
    if let Ok(Some(space)) = repo::get_by_id(&conn, id) {
        if space.space_type == "personal" {
            return Err("个人知识空间不允许删除".to_string());
        }
    }
    let file_paths = repo::cascade_delete_space(&mut conn, id).map_err(|e| e.to_string())?;
    for path in &file_paths {
        let _ = state.file_storage.delete_file(path);
    }
    Ok(true)
}
