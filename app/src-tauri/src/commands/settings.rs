/**
 * PMTool · 设置中心 Commands（维护者 2026-09-09）
 *
 * 提供设置 key-value 的读写，以及真实数据目录路径（设置中心「数据」分区用）。
 */

use std::path::PathBuf;
use tauri::State;

use crate::AppState;
use crate::repositories::app_settings as app_settings_repo;

/// 读取全部设置（key -> value）
#[tauri::command]
pub fn get_all_settings(state: State<'_, AppState>) -> Result<std::collections::HashMap<String, String>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    app_settings_repo::get_all_settings(&conn).map_err(|e| e.to_string())
}

/// 读取单个设置（不存在返回 null）
#[tauri::command]
pub fn get_setting(state: State<'_, AppState>, key: String) -> Result<Option<String>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    app_settings_repo::get_setting(&conn, &key).map_err(|e| e.to_string())
}

/// 写入 / 更新设置
#[tauri::command]
pub fn set_setting(state: State<'_, AppState>, key: String, value: String) -> Result<bool, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    app_settings_repo::set_setting(&conn, &key, &value).map_err(|e| e.to_string())
}

/// 真实数据目录（app_data_dir/PMToolData · 设置中心「数据」分区）
/// 返回 (PMToolData 目录, 数据库文件路径) — 前端显示用
#[tauri::command]
pub fn get_data_dir(
    state: State<'_, AppState>,
) -> Result<(String, String), String> {
    let data_dir: PathBuf = state.data_dir.lock().map_err(|e| e.to_string())?.clone();
    let db = data_dir.join("pmtool.db");
    Ok((data_dir.to_string_lossy().to_string(), db.to_string_lossy().to_string()))
}
