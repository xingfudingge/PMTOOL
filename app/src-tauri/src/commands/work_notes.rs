/**
 * PMTool · 主工作区工作notes Tauri Commands
 * 2026-09-08 维护者反馈「仅本地保存显示不全」 → 改入库
 *
 * WebView 调用:
 *   invoke('get_work_note', { noteDate })      → WorkNote | null
 *   invoke('save_work_note', { noteDate, todayContent, nextWorkday, nextContent }) → WorkNote
 */

use tauri::State;

use crate::AppState;
use crate::repositories::work_notes as repo;
use crate::repositories::work_notes::WorkNote;

/// 按日期取工作note
#[tauri::command]
pub fn get_work_note(
    state: State<'_, AppState>,
    note_date: String,
) -> Result<Option<WorkNote>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    repo::get_by_date(&conn, &note_date).map_err(|e| e.to_string())
}

/// 按日期 upsert 工作note（今日工作内容 / 下个工作日计划）
#[tauri::command]
pub fn save_work_note(
    state: State<'_, AppState>,
    note_date: String,
    today_content: String,
    next_workday: String,
    next_content: String,
) -> Result<WorkNote, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    repo::upsert_by_date(&conn, &note_date, &today_content, &next_workday, &next_content)
        .map_err(|e| e.to_string())
}
