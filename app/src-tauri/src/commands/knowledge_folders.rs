/**
 * PMTool · 知识目录 Tauri Commands（2026-09-03 知识中心重构）
 *
 * 设计变更：
 *   - knowledge_folders 现在关联到 knowledge_spaces（通过 space + project_id）
 *   - AI 生成目录是真实的系统目录（system_type='SYSTEM_AI'），不是虚拟节点
 *   - 项目根目录是 PROJECT_ROOT 类型
 *
 * 对应 Rust repositories/knowledge_folders.rs：
 *   - list_by_space() / list_by_project()
 *   - get_by_id() / get_root_folder()
 *   - upsert()
 *   - delete()
 *   - ensure_project_root()
 *   - ensure_ai_folder()
 *
 * 删除规则（2026-09-03 设计文档 §2）：
 *   - 所有删除操作必须二次确认
 *   - 真删除：目录 + 子目录 + 关联知识 + 所有附件全部删除
 *   - 不保留回收站、软删除
 */

use tauri::State;

use crate::AppState;
use crate::repositories::knowledge_folders::{
    self as repo, KnowledgeFolder, KnowledgeFolderInput,
};

/// 列出某个空间下的所有目录
#[tauri::command]
pub fn list_knowledge_folders(
    state: State<'_, AppState>,
    space: String,
) -> Result<Vec<KnowledgeFolder>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    repo::list_by_space(&conn, &space).map_err(|e| e.to_string())
}

/// 列出某个项目下的所有目录
#[tauri::command]
pub fn list_knowledge_folders_by_project(
    state: State<'_, AppState>,
    project_id: i64,
) -> Result<Vec<KnowledgeFolder>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    repo::list_by_project(&conn, project_id).map_err(|e| e.to_string())
}

/// 列出某个知识空间下的所有目录（一库多项目：目录按空间归属）
#[tauri::command]
pub fn list_knowledge_folders_by_space_id(
    state: State<'_, AppState>,
    space_id: i64,
) -> Result<Vec<KnowledgeFolder>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    repo::list_by_space_id(&conn, space_id).map_err(|e| e.to_string())
}

/// 获取单个目录
#[tauri::command]
pub fn get_knowledge_folder(
    state: State<'_, AppState>,
    id: i64,
) -> Result<Option<KnowledgeFolder>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    repo::get_by_id(&conn, id).map_err(|e| e.to_string())
}

/// 创建或更新目录
#[tauri::command]
pub fn upsert_knowledge_folder(
    state: State<'_, AppState>,
    folder: KnowledgeFolderInput,
) -> Result<KnowledgeFolder, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    repo::upsert(&conn, folder).map_err(|e| e.to_string())
}

/// 创建或取得项目的顶层知识库目录（PROJECT_ROOT 类型）
#[tauri::command]
pub fn ensure_project_knowledge_library(
    state: State<'_, AppState>,
    project_id: i64,
    project_name: String,
) -> Result<KnowledgeFolder, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    repo::ensure_project_root(&conn, project_id, &project_name).map_err(|e| e.to_string())
}

/// 创建或取得 AI 生成目录（SYSTEM_AI 类型）
#[tauri::command]
pub fn ensure_ai_knowledge_folder(
    state: State<'_, AppState>,
    space: String,
    project_id: Option<i64>,
) -> Result<KnowledgeFolder, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    repo::ensure_ai_folder(&conn, &space, project_id).map_err(|e| e.to_string())
}

/// 创建或取得某知识空间（知识库）的独立 AI 生成目录（一库一 AI 目录 · 跟随知识库）
/// 2026-09-09 · 一库多项目：AI 目录按 space_id 归属，不跨库共享。
#[tauri::command]
pub fn ensure_knowledge_ai_folder(
    state: State<'_, AppState>,
    space_id: i64,
) -> Result<KnowledgeFolder, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let space = crate::repositories::knowledge_spaces::get_by_id(&conn, space_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "知识空间不存在".to_string())?;
    repo::ensure_ai_folder_for_space(&conn, space_id, &space.space_type)
        .map_err(|e| e.to_string())
}

/// 删除目录（二次确认后执行）
#[tauri::command]
pub fn delete_knowledge_folder(
    state: State<'_, AppState>,
    id: i64,
) -> Result<bool, String> {
    // 维护者 2026-09-03：系统目录不允许删除
    let mut conn = state.db.lock().map_err(|e| e.to_string())?;
    if let Ok(Some(folder)) = repo::get_by_id(&conn, id) {
        if folder.system_type == "SYSTEM_AI" || folder.system_type == "PROJECT_ROOT" {
            return Ok(false);
        }
    }

    // 维护者 2026-09-04 · 设计文档 §25：递归真删除目录 —— 子目录 + 知识 + 附件记录 + 本地文件
    let file_paths = repo::cascade_delete(&mut conn, id).map_err(|e| e.to_string())?;
    for path in &file_paths {
        let _ = state.file_storage.delete_file(path);
    }
    Ok(true)
}
