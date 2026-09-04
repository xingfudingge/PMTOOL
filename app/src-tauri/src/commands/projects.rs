/**
 * PMTool · Project Tauri Commands（业务命名）
 * Phase 0 · T0.4e
 *
 * 设计依据：RFC-03 §1 分层架构
 *   React Page → Feature Service → Tauri Typed Command → Rust Service → Repository → SQLite
 *
 * 本模块职责：
 *   - 提供业务语义 Tauri commands（如 list_projects / create_project）
 *   - 不暴露通用 execute_sql / query_sql 接口
 *   - WebView 端通过 invoke('list_projects', {...}) 调用
 *
 * Phase 0 范围：
 *   - Project CRUD（list / get / create / update / delete）
 *   - Todo CRUD 优先级最高（Phase 3 基础）
 *   - 其他表 command 留到对应 Phase 实现
 */

use tauri::State;

use crate::AppState;
use crate::repositories::projects as projects_repo;

/// 列出项目（按状态过滤）
/// WebView 调用: invoke('list_projects', { status: 'IN_PROGRESS' })
#[tauri::command]
pub fn list_projects(
    state: State<'_, AppState>,
    status: Option<String>,
) -> Result<Vec<projects_repo::Project>, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    projects_repo::list_by_status(&pool, status.as_deref())
        .map_err(|e| e.to_string())
}

/// 获取单个项目
#[tauri::command]
pub fn get_project(
    state: State<'_, AppState>,
    id: i64,
) -> Result<Option<projects_repo::Project>, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    projects_repo::get_by_id(&pool, id).map_err(|e| e.to_string())
}

/// 创建项目
#[tauri::command]
pub fn create_project(
    state: State<'_, AppState>,
    project: projects_repo::Project,
) -> Result<i64, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    projects_repo::create(&pool, &project).map_err(|e| e.to_string())
}

/// 更新项目
#[tauri::command]
pub fn update_project(
    state: State<'_, AppState>,
    id: i64,
    project: projects_repo::Project,
) -> Result<bool, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    projects_repo::update(&pool, id, &project).map_err(|e| e.to_string())
}

/// 删除项目
#[tauri::command]
pub fn delete_project(
    state: State<'_, AppState>,
    id: i64,
) -> Result<bool, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    projects_repo::delete(&pool, id).map_err(|e| e.to_string())
}