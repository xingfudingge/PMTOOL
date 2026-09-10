/**
 * PMTool · Project Tasks Tauri Commands
 * Phase 4 · T4.7
 *
 * WebView 调用: invoke('list_project_tasks', { projectId })
 *
 * 设计依据：RFC-03 §1（业务命名 · 不暴露通用 SQL）
 */

use tauri::State;

use crate::AppState;
use crate::repositories::project_tasks as tasks_repo;

/// 列出项目所有任务（含父子）
#[tauri::command]
pub fn list_project_tasks(
    state: State<'_, AppState>,
    project_id: i64,
) -> Result<Vec<tasks_repo::ProjectTask>, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    tasks_repo::list_by_project(&pool, project_id).map_err(|e| e.to_string())
}

/// 列出项目叶子任务（用于加权平均进度计算）
#[tauri::command]
pub fn list_project_leaf_tasks(
    state: State<'_, AppState>,
    project_id: i64,
) -> Result<Vec<tasks_repo::ProjectTask>, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    tasks_repo::list_leaf_by_project(&pool, project_id).map_err(|e| e.to_string())
}

/// 获取单个任务
#[tauri::command]
pub fn get_project_task(
    state: State<'_, AppState>,
    id: i64,
) -> Result<Option<tasks_repo::ProjectTask>, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    tasks_repo::get_by_id(&pool, id).map_err(|e| e.to_string())
}

/// 创建任务
#[tauri::command]
pub fn create_project_task(
    state: State<'_, AppState>,
    task: tasks_repo::ProjectTask,
) -> Result<i64, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;

    // RFC-02 §2：父任务约束（禁止循环 + 跨项目）
    if let Some(parent_id) = task.parent_id {
        if parent_id == task.id {
            return Err("不能设置自己为父任务".to_string());
        }
        // 检查父任务是否属于同一项目
        let parent = tasks_repo::get_by_id(&pool, parent_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "父任务不存在".to_string())?;
        if parent.project_id != task.project_id {
            return Err("父任务必须属于同一项目".to_string());
        }
        // 检查是否形成循环
        if tasks_repo::would_create_cycle(&pool, task.id, parent_id)
            .map_err(|e| e.to_string())?
        {
            return Err("不能形成循环：父任务是自身的祖先".to_string());
        }
    }

    tasks_repo::create(&pool, &task).map_err(|e| e.to_string())
}

/// 更新任务
#[tauri::command]
pub fn update_project_task(
    state: State<'_, AppState>,
    id: i64,
    task: tasks_repo::ProjectTask,
) -> Result<bool, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;

    // RFC-02 §2：父任务约束（更新时也检查）
    if let Some(parent_id) = task.parent_id {
        if parent_id == id {
            return Err("不能设置自己为父任务".to_string());
        }
        if tasks_repo::would_create_cycle(&pool, id, parent_id)
            .map_err(|e| e.to_string())?
        {
            return Err("不能形成循环".to_string());
        }
    }

    tasks_repo::update(&pool, id, &task).map_err(|e| e.to_string())
}

/// 删除任务（级联删除子任务）
#[tauri::command]
pub fn delete_project_task(state: State<'_, AppState>, id: i64) -> Result<bool, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    // 级联：删除任务及其所有子孙
    tasks_repo::delete_with_children(&pool, id).map_err(|e| e.to_string())
}

/// 批量导入任务（整体事务）：父先落库 -> 子映射真实 id -> 全部成功 COMMIT / 任一失败 ROLLBACK
#[tauri::command]
pub fn import_project_tasks_bulk(
    state: State<'_, AppState>,
    project_id: i64,
    tasks: Vec<tasks_repo::ProjectTask>,
) -> Result<Vec<i64>, String> {
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    tasks_repo::import_bulk(&mut conn, project_id, &tasks).map_err(|e| e.to_string())
}

