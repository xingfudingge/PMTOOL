/**
 * PMTool · Attachments Tauri Commands
 * Phase 4 · T4.9
 *
 * WebView 调用:
 *   invoke('list_attachments', { ownerType, ownerId })
 *   invoke('upload_attachment', { ownerType, ownerId, fileName, contentBase64 })
 *   invoke('delete_attachment', { id })
 *   invoke('get_attachment_path', { id })
 *
 * 设计依据：维护者 T4.9 决策 + RFC-03 §2
 */

use base64::{engine::general_purpose::STANDARD, Engine as _};
use tauri::State;

use crate::AppState;
use crate::repositories::attachments as att_repo;
use crate::services::file_storage::FileStorageProvider;

/// 列出附件
#[tauri::command]
pub fn list_attachments(
    state: State<'_, AppState>,
    owner_type: String,
    owner_id: i64,
) -> Result<Vec<att_repo::Attachment>, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    let mut atts = att_repo::list_by_owner(&pool, &owner_type, owner_id).map_err(|e| e.to_string())?;
    // 计算 SHA-256（按 RFC-03 §2）
    for att in atts.iter_mut() {
        let abs = state
            .file_storage
            .absolute_path(&att.file_path)
            .ok();
        if let Some(abs) = abs {
            if abs.exists() {
                if let Ok(content) = std::fs::read(&abs) {
                    att.sha256 = Some(state.file_storage.compute_sha256(&content));
                }
            }
        }
    }
    Ok(atts)
}

/// 上传附件
#[tauri::command]
pub fn upload_attachment(
    state: State<'_, AppState>,
    owner_type: String,
    owner_id: i64,
    file_name: String,
    content_base64: String,
) -> Result<att_repo::Attachment, String> {
    // 1. Base64 解码
    let content = STANDARD
        .decode(&content_base64)
        .map_err(|e| format!("Base64 解码失败：{}", e))?;

    // 2. 文件存储（FileStorageProvider）
    let stored = state
        .file_storage
        .save(&owner_type, owner_id, &file_name, &content)?;

    // 3. 写数据库记录
    let att = att_repo::Attachment {
        id: 0,
        owner_type,
        owner_id,
        file_name: file_name.clone(),
        file_path: stored.relative_path.clone(),
        file_size: Some(stored.file_size as i64),
        file_type: Some(stored.mime_type.clone()),
        created_at: chrono::Utc::now().to_rfc3339(),
        sha256: Some(stored.sha256.clone()),
        updated_at: None,
    };

    let pool = state.db.lock().map_err(|e| e.to_string())?;
    let id = att_repo::create(&pool, &att).map_err(|e| e.to_string())?;
    Ok(att_repo::Attachment {
        id,
        ..att
    })
}

/// 删除附件（先删文件，再删记录）
#[tauri::command]
pub fn delete_attachment(state: State<'_, AppState>, id: i64) -> Result<bool, String> {
    // 1. 获取路径
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    let att = att_repo::get_by_id(&pool, id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("附件不存在：{}", id))?;

    // 2. 删数据库记录
    let deleted = att_repo::delete(&pool, id).map_err(|e| e.to_string())?;

    // 3. 删文件（失败不致命 · 记录可能已删）
    state.file_storage.delete(&att.file_path).ok();

    Ok(deleted)
}

/// 获取附件绝对路径（OS 默认程序打开用）
#[tauri::command]
pub fn get_attachment_path(
    state: State<'_, AppState>,
    id: i64,
) -> Result<String, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    let att = att_repo::get_by_id(&pool, id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("附件不存在：{}", id))?;
    let abs = state.file_storage.absolute_path(&att.file_path)?;
    Ok(abs.to_string_lossy().to_string())
}

/// 用 OS 默认程序打开附件（Phase 4 T4.9c · 核心场景）
/// PMTool 流程：项目 → 附件 → 点击 → 调用系统程序打开 → 用户编辑 → 保存回原文件
#[tauri::command]
pub fn open_attachment(state: State<'_, AppState>, id: i64) -> Result<String, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    let att = att_repo::get_by_id(&pool, id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("附件不存在：{}", id))?;
    state.file_storage.open_file(&att.file_path)
}

/// 刷新附件元信息（检测外部修改）
/// 返回最新的 mtime + file_size（不重算 sha256）
#[tauri::command]
pub fn refresh_attachment(
    state: State<'_, AppState>,
    id: i64,
) -> Result<att_repo::Attachment, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    let att = att_repo::get_by_id(&pool, id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("附件不存在：{}", id))?;
    // 重新读取文件元信息（检测 mtime 是否变化）
    let info = state.file_storage.get_file_info(&att.file_path)?;
    Ok(att_repo::Attachment {
        // 保留数据库原值（file_name / file_path / file_size 创建时记录）
        // 仅更新运行时元信息（created_at 是数据库原值）
        file_size: Some(info.file_size as i64),
        ..att
    })
}