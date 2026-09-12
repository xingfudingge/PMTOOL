/**
 * PMTool · Project Issue Log Tauri Commands
 * 2026-09-11 · 问题登记册
 *
 * WebView 调用: invoke('list_project_issue_log', { projectId })
 */

use tauri::State;

use crate::AppState;
use crate::repositories::project_issue_log as log_repo;

/// 列出项目的问题（问题登记册）
#[tauri::command]
pub fn list_project_issue_log(
    state: State<'_, AppState>,
    project_id: i64,
) -> Result<Vec<log_repo::ProjectIssueLog>, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    log_repo::list_by_project(&pool, project_id).map_err(|e| e.to_string())
}

/// 获取单个问题
#[tauri::command]
pub fn get_project_issue_log_entry(
    state: State<'_, AppState>,
    id: i64,
) -> Result<Option<log_repo::ProjectIssueLog>, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    log_repo::get_by_id(&pool, id).map_err(|e| e.to_string())
}

/// 创建问题
#[tauri::command]
pub fn create_project_issue_log_entry(
    state: State<'_, AppState>,
    issue: log_repo::ProjectIssueLog,
) -> Result<i64, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    log_repo::create(&pool, &issue).map_err(|e| e.to_string())
}

/// 更新问题
#[tauri::command]
pub fn update_project_issue_log_entry(
    state: State<'_, AppState>,
    id: i64,
    issue: log_repo::ProjectIssueLog,
) -> Result<bool, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    log_repo::update(&pool, id, &issue).map_err(|e| e.to_string())
}

/// 删除问题
#[tauri::command]
pub fn delete_project_issue_log_entry(state: State<'_, AppState>, id: i64) -> Result<bool, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    log_repo::delete(&pool, id).map_err(|e| e.to_string())
}