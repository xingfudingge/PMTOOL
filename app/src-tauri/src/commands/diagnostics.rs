// 诊断/日志命令：前端把 JS 错误传给后端落盘，问题可排查
use crate::services::logging;
use serde::Serialize;

#[derive(Serialize)]
pub struct LogResult {
    pub ok: bool,
}

/// 前端 window.onerror / unhandledrejection 捕获到的 JS 错误，写进 pmtool.log
#[tauri::command]
pub fn log_frontend_error(level: Option<String>, message: String) -> LogResult {
    let lvl = level.unwrap_or_else(|| "error".into());
    logging::log_line(&format!("[frontend:{}] {}", lvl, message));
    LogResult { ok: true }
}
