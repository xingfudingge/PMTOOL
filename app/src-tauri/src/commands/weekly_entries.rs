/**
 * PMTool · 周报条目 Tauri Commands
 * Phase 5 · V2.0 项目中心重构 · 2026-08-26 维护者拍板
 *
 * WebView 调用: invoke('list_weekly_entries', { projectId })
 */

use tauri::State;

use crate::AppState;
use crate::repositories::weekly_entries as repo;

/// 列出项目的所有周报条目
#[tauri::command]
pub fn list_weekly_entries(
    state: State<'_, AppState>,
    project_id: i64,
) -> Result<Vec<repo::WeeklyReportEntry>, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    repo::list_by_project(&pool, project_id).map_err(|e| e.to_string())
}

/// 获取单个周报条目
#[tauri::command]
pub fn get_weekly_entry(
    state: State<'_, AppState>,
    id: i64,
) -> Result<Option<repo::WeeklyReportEntry>, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    repo::get_by_id(&pool, id).map_err(|e| e.to_string())
}

/// 创建周报条目
#[tauri::command]
pub fn create_weekly_entry(
    state: State<'_, AppState>,
    entry: repo::WeeklyReportEntry,
) -> Result<i64, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    repo::create(&pool, &entry).map_err(|e| e.to_string())
}

/// 更新周报条目
#[tauri::command]
pub fn update_weekly_entry(
    state: State<'_, AppState>,
    id: i64,
    entry: repo::WeeklyReportEntry,
) -> Result<bool, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    repo::update(&pool, id, &entry).map_err(|e| e.to_string())
}

/// 删除周报条目
#[tauri::command]
pub fn delete_weekly_entry(state: State<'_, AppState>, id: i64) -> Result<bool, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    repo::delete(&pool, id).map_err(|e| e.to_string())
}