/**
 * PMTool · 项目成员 Tauri Commands
 * Phase 5 · V2.0 项目中心重构 · 2026-08-26 维护者拍板
 *
 * WebView 调用: invoke('list_project_members', { projectId })
 */

use tauri::State;

use crate::AppState;
use crate::repositories::project_members as repo;

/// 列出项目的所有成员
#[tauri::command]
pub fn list_project_members(
    state: State<'_, AppState>,
    project_id: i64,
) -> Result<Vec<repo::ProjectMember>, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    repo::list_by_project(&pool, project_id).map_err(|e| e.to_string())
}

/// 获取单个成员
#[tauri::command]
pub fn get_project_member(
    state: State<'_, AppState>,
    id: i64,
) -> Result<Option<repo::ProjectMember>, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    repo::get_by_id(&pool, id).map_err(|e| e.to_string())
}

/// 创建成员
#[tauri::command]
pub fn create_project_member(
    state: State<'_, AppState>,
    member: repo::ProjectMember,
) -> Result<i64, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    repo::create(&pool, &member).map_err(|e| e.to_string())
}

/// 更新成员
#[tauri::command]
pub fn update_project_member(
    state: State<'_, AppState>,
    id: i64,
    member: repo::ProjectMember,
) -> Result<bool, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    repo::update(&pool, id, &member).map_err(|e| e.to_string())
}

/// 删除成员
#[tauri::command]
pub fn delete_project_member(state: State<'_, AppState>, id: i64) -> Result<bool, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    repo::delete(&pool, id).map_err(|e| e.to_string())
}