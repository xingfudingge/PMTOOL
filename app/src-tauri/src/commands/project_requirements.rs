/**
 * PMTool · Project Requirements Tauri Commands
 * 2026-09-11 · 需求登记册
 *
 * WebView 调用: invoke('list_project_requirements', { projectId })
 */

use tauri::State;

use crate::AppState;
use crate::repositories::project_requirements as req_repo;

/// 列出项目的需求
#[tauri::command]
pub fn list_project_requirements(
    state: State<'_, AppState>,
    project_id: i64,
) -> Result<Vec<req_repo::ProjectRequirement>, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    req_repo::list_by_project(&pool, project_id).map_err(|e| e.to_string())
}

/// 获取单个需求
#[tauri::command]
pub fn get_project_requirement(
    state: State<'_, AppState>,
    id: i64,
) -> Result<Option<req_repo::ProjectRequirement>, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    req_repo::get_by_id(&pool, id).map_err(|e| e.to_string())
}

/// 创建需求
#[tauri::command]
pub fn create_project_requirement(
    state: State<'_, AppState>,
    requirement: req_repo::ProjectRequirement,
) -> Result<i64, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    req_repo::create(&pool, &requirement).map_err(|e| e.to_string())
}

/// 更新需求
#[tauri::command]
pub fn update_project_requirement(
    state: State<'_, AppState>,
    id: i64,
    requirement: req_repo::ProjectRequirement,
) -> Result<bool, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    req_repo::update(&pool, id, &requirement).map_err(|e| e.to_string())
}

/// 删除需求
#[tauri::command]
pub fn delete_project_requirement(state: State<'_, AppState>, id: i64) -> Result<bool, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    req_repo::delete(&pool, id).map_err(|e| e.to_string())
}