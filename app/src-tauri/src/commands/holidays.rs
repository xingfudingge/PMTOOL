/**
 * PMTool · Holidays Tauri Commands
 * Phase 4.5 · 节假日 Provider 补全（维护者 2026-08-25 反馈）
 *
 * WebView 调用: invoke('list_holidays')
 *
 * 背景：
 *   - lib.rs 之前 generate_handler! 没注册 list_holidays
 *   - WebView 端 LocalHolidayProvider.load() 调 invoke('list_holidays') 抛错
 *   - try/catch 静默吞错 · cache 永远空 · 日历只显示默认工作日/周末
 *   - 维护者手动 INSERT 的节假日数据无法显示
 *
 * 修复（2026-08-25）：
 *   - 本模块实现 list_holidays 命令
 *   - lib.rs generate_handler! 注册
 *   - commands/mod.rs pub mod holidays;
 *   - repositories/mod.rs pub mod holidays;
 */

use tauri::State;

use crate::AppState;
use crate::repositories::holidays as holidays_repo;

/// 列出全部节假日（一次性加载）
#[tauri::command]
pub fn list_holidays(
    state: State<'_, AppState>,
) -> Result<Vec<holidays_repo::HolidayEntry>, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    holidays_repo::list_all(&pool).map_err(|e| e.to_string())
}
