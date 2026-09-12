/**
 * PMTool · Project Todo Items Tauri Commands
 * 2026-09-11 · 其他待办事项登记册
 *
 * WebView 调用: invoke('list_project_todo_items', { projectId })
 */

use tauri::State;

use crate::AppState;
use crate::repositories::project_todo_items as todo_repo;

/// 列出项目的其他待办
#[tauri::command]
pub fn list_project_todo_items(
    state: State<'_, AppState>,
    project_id: i64,
) -> Result<Vec<todo_repo::ProjectTodoItem>, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    todo_repo::list_by_project(&pool, project_id).map_err(|e| e.to_string())
}

/// 获取单个待办
#[tauri::command]
pub fn get_project_todo_item(
    state: State<'_, AppState>,
    id: i64,
) -> Result<Option<todo_repo::ProjectTodoItem>, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    todo_repo::get_by_id(&pool, id).map_err(|e| e.to_string())
}

/// 创建待办
#[tauri::command]
pub fn create_project_todo_item(
    state: State<'_, AppState>,
    item: todo_repo::ProjectTodoItem,
) -> Result<i64, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    todo_repo::create(&pool, &item).map_err(|e| e.to_string())
}

/// 更新待办
#[tauri::command]
pub fn update_project_todo_item(
    state: State<'_, AppState>,
    id: i64,
    item: todo_repo::ProjectTodoItem,
) -> Result<bool, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    todo_repo::update(&pool, id, &item).map_err(|e| e.to_string())
}

/// 删除待办
#[tauri::command]
pub fn delete_project_todo_item(state: State<'_, AppState>, id: i64) -> Result<bool, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    todo_repo::delete(&pool, id).map_err(|e| e.to_string())
}