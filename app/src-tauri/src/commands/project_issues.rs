/**
 * PMTool · Project Issues Tauri Commands
 * Phase 4 · T4.8
 *
 * WebView 调用: invoke('list_project_issues', { projectId })
 */

use tauri::State;

use crate::AppState;
use crate::repositories::project_issues as issues_repo;

/// 列出项目的问题
#[tauri::command]
pub fn list_project_issues(
    state: State<'_, AppState>,
    project_id: i64,
) -> Result<Vec<issues_repo::ProjectIssue>, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    issues_repo::list_by_project(&pool, project_id).map_err(|e| e.to_string())
}

/// 获取单个问题
#[tauri::command]
pub fn get_project_issue(
    state: State<'_, AppState>,
    id: i64,
) -> Result<Option<issues_repo::ProjectIssue>, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    issues_repo::get_by_id(&pool, id).map_err(|e| e.to_string())
}

/// 创建问题
#[tauri::command]
pub fn create_project_issue(
    state: State<'_, AppState>,
    issue: issues_repo::ProjectIssue,
) -> Result<i64, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    let id = issues_repo::create(&pool, &issue).map_err(|e| e.to_string())?;

    // 通知：新增高风险（level = HIGH / CRITICAL）
    let level = issue.level.to_uppercase();
    if level == "HIGH" || level == "CRITICAL" {
        let ev = crate::services::notification::NotificationEvent {
            event_type: "HIGH_RISK_CREATED".to_string(),
            source_type: "ISSUE".to_string(),
            source_id: id,
            project_id: Some(issue.project_id),
            title: format!("新增{}风险：{}", if level == "CRITICAL" { "严重" } else { "高" }, issue.title),
            content: format!("「{}」已被登记为{}风险，请关注。", issue.title, if level == "CRITICAL" { "严重" } else { "高" }),
            dedup_key: format!("issue:{}:high_risk", id),
            payload: None,
        };
        crate::services::notification::service::emit_business_event(&pool, &ev);
    }

    Ok(id)
}

/// 更新问题
#[tauri::command]
pub fn update_project_issue(
    state: State<'_, AppState>,
    id: i64,
    issue: issues_repo::ProjectIssue,
) -> Result<bool, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    issues_repo::update(&pool, id, &issue).map_err(|e| e.to_string())
}

/// 删除问题
#[tauri::command]
pub fn delete_project_issue(state: State<'_, AppState>, id: i64) -> Result<bool, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    issues_repo::delete(&pool, id).map_err(|e| e.to_string())
}