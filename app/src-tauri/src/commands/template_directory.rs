/**
 * PMTool · 模板中心 Tauri Commands（维护者 2026-09-09）
 *
 * 模板中心与项目文件管理逻辑一致，仅模板目录为全局唯一（不属某项目）。
 * 复用 file_browser 的路径级命令（list / read / write / create / delete / rename / copy / open），
 * 这里只新增全局模板目录的读取与设置。
 */

use tauri::State;

use crate::AppState;
use crate::repositories::template_config as template_config_repo;

/// 读取当前绑定的模板目录
#[tauri::command]
pub fn get_template_directory(state: State<'_, AppState>) -> Result<Option<String>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    template_config_repo::get_template_directory(&conn).map_err(|e| e.to_string())
}

/// 设置 / 清除模板目录绑定（path = None 表示清除 · 不会删除磁盘文件）
#[tauri::command]
pub fn set_template_directory(state: State<'_, AppState>, path: Option<String>) -> Result<bool, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    template_config_repo::set_template_directory(&conn, path.as_deref()).map_err(|e| e.to_string())
}
