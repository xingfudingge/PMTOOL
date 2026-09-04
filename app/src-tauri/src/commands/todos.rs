/**
 * PMTool · Todo Tauri Commands（业务命名）
 * Phase 0 · T0.4e
 *
 * 优先级最高（PM 决策 B1）：待办 command 必须先完成
 *
 * 注意：自动顺延业务规则（RFC-02 §4）由 services 层处理，
 *       本模块只调 Repository 层。
 */

use tauri::State;

use crate::AppState;
use crate::repositories::todos as todos_repo;

/// 列出待办（按 status + source_type 过滤）
/// WebView 调用: invoke('list_todos', { status: 'PENDING', sourceType: 'MANUAL' })
#[tauri::command]
pub fn list_todos(
    state: State<'_, AppState>,
    status: Option<String>,
    source_type: Option<String>,
) -> Result<Vec<todos_repo::Todo>, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    todos_repo::list(&pool, status.as_deref(), source_type.as_deref())
        .map_err(|e| e.to_string())
}

/// 获取单个待办
#[tauri::command]
pub fn get_todo(
    state: State<'_, AppState>,
    id: i64,
) -> Result<Option<todos_repo::Todo>, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    todos_repo::get_by_id(&pool, id).map_err(|e| e.to_string())
}

/// 创建待办
#[tauri::command]
pub fn create_todo(
    state: State<'_, AppState>,
    todo: todos_repo::Todo,
) -> Result<i64, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    todos_repo::create(&pool, &todo).map_err(|e| e.to_string())
}

/// 更新待办
#[tauri::command]
pub fn update_todo(
    state: State<'_, AppState>,
    id: i64,
    todo: todos_repo::Todo,
) -> Result<bool, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    todos_repo::update(&pool, id, &todo).map_err(|e| e.to_string())
}

/// 标记完成（RFC-02 §4: completed_at = UTC ISO 8601）
#[tauri::command]
pub fn complete_todo(
    state: State<'_, AppState>,
    id: i64,
) -> Result<bool, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    todos_repo::complete(&pool, id).map_err(|e| e.to_string())
}

/// 取消完成（status → PENDING · completed_at 清空）
/// 单独命令，避开 update_todo 传 todo 对象时字段命名不一致的坑
#[tauri::command]
pub fn uncomplete_todo(
    state: State<'_, AppState>,
    id: i64,
) -> Result<bool, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    todos_repo::uncomplete(&pool, id).map_err(|e| e.to_string())
}

/// 删除待办
#[tauri::command]
pub fn delete_todo(
    state: State<'_, AppState>,
    id: i64,
) -> Result<bool, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    todos_repo::delete(&pool, id).map_err(|e| e.to_string())
}