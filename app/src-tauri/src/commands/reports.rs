/**
 * PMTool · Reports Tauri Commands
 * 维护者 2026-08-25 · 报告中心重构（常规 + AI）
 *
 * 数据源：reports 表（schema 0003 + period 列）
 *  - type: 'DAILY' | 'WEEKLY' | 'MONTHLY'
 *  - project_id: NULL = 个人报告，有值 = 项目报告
 *  - period: 'YYYY-MM-DD' | 'YYYY-Www' | 'YYYY-MM' · 同一 (type, project_id, period) 只一条
 *  - generate_type: 'MANUAL' | 'AUTO' | 'AI'
 *  - status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
 *
 * 报告 content 是完整 Markdown · 含维护者原话模板（1、xxx 2、xxx ...）
 */

use tauri::State;

use crate::AppState;
use crate::repositories::reports as reports_repo;

#[derive(Debug, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportInput {
    pub report_type: String,
    pub project_id: Option<i64>,
    pub title: String,
    pub content: String,
    pub generate_type: Option<String>,
    /// 周期键：daily='YYYY-MM-DD' · weekly='YYYY-Www' · monthly='YYYY-MM'
    pub period: String,
}

/// 列出报告
#[tauri::command]
pub fn list_reports(
    state: State<'_, AppState>,
    report_type: Option<String>,
    project_id: Option<i64>,
) -> Result<Vec<reports_repo::Report>, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    reports_repo::list(&pool, report_type.as_deref(), project_id, None)
        .map_err(|e| e.to_string())
}

/// 创建或覆盖报告（同 type+project_id+period 已存在则 UPDATE）
/// 维护者原话："一天一个日报 · 重新生成就覆盖之前的"
#[tauri::command]
pub fn create_report(
    state: State<'_, AppState>,
    report: ReportInput,
) -> Result<i64, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    reports_repo::upsert(
        &pool,
        &report.report_type,
        report.project_id,
        &report.title,
        &report.content,
        report.generate_type.as_deref().unwrap_or("MANUAL"),
        &report.period,
    )
    .map_err(|e| e.to_string())
}

/// 更新报告（编辑时用）
#[tauri::command]
pub fn update_report(
    state: State<'_, AppState>,
    id: i64,
    title: String,
    content: String,
) -> Result<bool, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    reports_repo::update(&pool, id, &title, &content).map_err(|e| e.to_string())
}

/// 删除报告
#[tauri::command]
pub fn delete_report(
    state: State<'_, AppState>,
    id: i64,
) -> Result<bool, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    reports_repo::delete(&pool, id).map_err(|e| e.to_string())
}

/// 获取单个报告
#[tauri::command]
pub fn get_report(
    state: State<'_, AppState>,
    id: i64,
) -> Result<Option<reports_repo::Report>, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    reports_repo::get_by_id(&pool, id).map_err(|e| e.to_string())
}