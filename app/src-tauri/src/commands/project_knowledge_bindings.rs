/**
 * PMTool · 项目知识绑定 Tauri Commands
 *
 * 对应 Rust repositories/project_knowledge_bindings.rs：
 *   - list_by_project()
 *   - list_by_space()
 *   - get_by_id()
 *   - create()
 *   - delete()
 *   - delete_all_by_project()
 *
 * 设计原则：
 *   - 项目中心只是项目知识空间的访问入口
 *   - 绑定关系由项目中心创建，解绑时只删除绑定，不删除知识空间
 *   - 删除知识空间时会级联删除所有绑定
 */

use tauri::State;

use crate::AppState;
use crate::repositories::project_knowledge_bindings::{
    self as repo, ProjectKnowledgeBinding, ProjectKnowledgeBindingInput,
};

/// 列出某项目的所有绑定
#[tauri::command]
pub fn list_project_bindings(
    state: State<'_, AppState>,
    project_id: i64,
) -> Result<Vec<ProjectKnowledgeBinding>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    repo::list_by_project(&conn, project_id).map_err(|e| e.to_string())
}

/// 列出某知识空间的所有绑定
#[tauri::command]
pub fn list_space_bindings(
    state: State<'_, AppState>,
    space_id: i64,
) -> Result<Vec<ProjectKnowledgeBinding>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    repo::list_by_space(&conn, space_id).map_err(|e| e.to_string())
}

/// 获取单个绑定
#[tauri::command]
pub fn get_binding(
    state: State<'_, AppState>,
    id: i64,
) -> Result<Option<ProjectKnowledgeBinding>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    repo::get_by_id(&conn, id).map_err(|e| e.to_string())
}

/// 创建绑定
#[tauri::command]
pub fn create_binding(
    state: State<'_, AppState>,
    input: ProjectKnowledgeBindingInput,
) -> Result<ProjectKnowledgeBinding, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    repo::create(&conn, input).map_err(|e| e.to_string())
}

/// 解绑项目与知识空间
#[tauri::command]
pub fn delete_binding(
    state: State<'_, AppState>,
    project_id: i64,
    space_id: i64,
) -> Result<bool, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    repo::delete(&conn, project_id, space_id).map_err(|e| e.to_string())
}

/// 解绑项目的所有绑定
#[tauri::command]
pub fn delete_all_project_bindings(
    state: State<'_, AppState>,
    project_id: i64,
) -> Result<bool, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    repo::delete_all_by_project(&conn, project_id).map_err(|e| e.to_string())
}
