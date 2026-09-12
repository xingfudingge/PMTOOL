/**
 * PMTool · 数据维护 Commands（备份 / 还原 / 数据目录迁移）（维护者 2026-09-09）
 *
 * 复用 services::data_maintenance（纯 fs 拷贝 + SQLite 在线快照）。
 * 还原/迁移因需重建 DB 连接与文件 Provider，均为「拷贝后提示重启生效」。
 */

use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, State};
use serde::Serialize;

use crate::AppState;
use crate::repositories::app_settings as app_settings_repo;
use crate::services::data_maintenance;

#[derive(Serialize)]
pub struct BackupItem {
    pub name: String,
    pub size: u64,
}

fn ensure_parent(dir: &Path) -> std::io::Result<()> {
    if let Some(p) = dir.parent() {
        std::fs::create_dir_all(p)?;
    }
    Ok(())
}

/// 立即备份到 dest_dir/<时间戳>/（含 pmtool.db 一致性快照 + PMToolData 目录）
/// 返回生成的备份目录绝对路径
#[tauri::command]
pub fn backup_data(state: State<'_, AppState>, dest_dir: String) -> Result<String, String> {
    let data_dir = state.data_dir.clone();
    let data_root = data_dir.join("PMToolData");
    let dest = PathBuf::from(&dest_dir);
    let stamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
    let backup_dir = dest.join(&stamp);
    std::fs::create_dir_all(&backup_dir).map_err(|e| format!("创建备份目录失败：{}", e))?;

    // DB 一致性快照（不裸拷热连接）
    {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        data_maintenance::backup_db(&conn, &backup_dir.join("pmtool.db"))
            .map_err(|e| format!("DB 快照失败：{}", e))?;
    }

    // PMToolData 递归拷贝
    if data_root.exists() {
        data_maintenance::copy_dir_recursive(&data_root, &backup_dir.join("PMToolData"))
            .map_err(|e| format!("复制数据目录失败：{}", e))?;
    }

    Ok(backup_dir.to_string_lossy().to_string())
}

/// 用备份目录还原数据（缺 pmtool.db 视为无效；还原前先自动备份当前）
#[tauri::command]
pub fn restore_data(state: State<'_, AppState>, src_dir: String) -> Result<String, String> {
    let src = PathBuf::from(&src_dir);
    if !data_maintenance::is_backup_root(&src) {
        return Err("不是有效的备份目录（缺少 pmtool.db）".to_string());
    }

    let data_dir = state.data_dir.clone();
    let data_root = data_dir.join("PMToolData");

    // 安全性：还原前把当前数据立即备份到 <数据目录>/_restore_backup/<时间戳>/
    let stamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
    let pre = data_dir.join("_restore_backup").join(&stamp);
    std::fs::create_dir_all(&pre).map_err(|e| format!("创建还原前备份失败：{}", e))?;
    {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        data_maintenance::backup_db(&conn, &pre.join("pmtool.db")).map_err(|e| e.to_string())?;
    }
    if data_root.exists() {
        let _ = data_maintenance::copy_dir_recursive(&data_root, &pre.join("PMToolData"));
    }

    // 覆盖当前 DB + 数据目录
    std::fs::copy(src.join("pmtool.db"), data_dir.join("pmtool.db"))
        .map_err(|e| format!("覆盖数据库失败：{}", e))?;
    let src_data = src.join("PMToolData");
    if src_data.exists() {
        // 先清掉目标再拷贝，保证与备份一致
        if data_root.exists() {
            let _ = std::fs::remove_dir_all(&data_root);
        }
        data_maintenance::copy_dir_recursive(&src_data, &data_root)
            .map_err(|e| format!("还原数据目录失败：{}", e))?;
    }

    Ok("已还原，请重启应用生效".to_string())
}

/// 把当前数据目录切换到自选位置（拷贝到目标并写覆盖标记，需重启生效）
#[tauri::command]
pub fn set_data_root(app: AppHandle, state: State<'_, AppState>, path: String) -> Result<String, String> {
    let target = PathBuf::from(&path);
    std::fs::create_dir_all(&target).map_err(|e| format!("目标目录不可写：{}", e))?;

    let cur = state.data_dir.clone();
    if cur != target {
        // 拷贝 db + PMToolData 到目标
        std::fs::copy(cur.join("pmtool.db"), target.join("pmtool.db"))
            .map_err(|e| format!("复制数据库失败：{}", e))?;
        let pm_data = cur.join("PMToolData");
        if pm_data.exists() {
            let _ = data_maintenance::copy_dir_recursive(&pm_data, &target.join("PMToolData"));
        }
    }

    // 覆盖标记写到 OS 默认应用目录（启动时读取，早于 DB 初始化）
    let default_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let override_file = default_dir.join("data_root.override");
    data_maintenance::write_data_root_override(&override_file, path.trim())
        .map_err(|e| format!("写入数据目录标记失败：{}", e))?;

    Ok("数据目录已迁移，请重启应用生效".to_string())
}

/// 读取当前备份位置设置（settings 键 backupDir）
#[tauri::command]
pub fn get_backup_location(state: State<'_, AppState>) -> Result<Option<String>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    app_settings_repo::get_setting(&conn, "backupDir").map_err(|e| e.to_string())
}

/// 设置备份位置
#[tauri::command]
pub fn set_backup_location(state: State<'_, AppState>, path: Option<String>) -> Result<bool, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    match path {
        Some(p) => app_settings_repo::set_setting(&conn, "backupDir", &p).map_err(|e| e.to_string()),
        None => app_settings_repo::set_setting(&conn, "backupDir", "").map_err(|e| e.to_string()),
    }
}

/// 列出备份目录下的备份项（名称 + 大小）
#[tauri::command]
pub fn list_backups(state: State<'_, AppState>, dir: String) -> Result<Vec<BackupItem>, String> {
    let base = PathBuf::from(&dir);
    let mut out = Vec::new();
    let rd = match std::fs::read_dir(&base) {
        Ok(r) => r,
        Err(_) => return Ok(out),
    };
    for entry in rd.flatten() {
        if let Ok(md) = entry.metadata() {
            if md.is_dir() {
                out.push(BackupItem {
                    name: entry.file_name().to_string_lossy().to_string(),
                    size: data_maintenance::dir_size(&entry.path()),
                });
            }
        }
    }
    out.sort_by(|a, b| b.name.cmp(&a.name));
    Ok(out)
}

/// 删除指定备份目录
#[tauri::command]
pub fn delete_backup(dir: String, name: String) -> Result<bool, String> {
    let base = PathBuf::from(&dir);
    let target = base.join(&name);
    if !target.is_dir() { return Err(format!("备份不存在：{}", name)); }
    std::fs::remove_dir_all(&target).map_err(|e| format!("删除备份失败：{}", e))?;
    Ok(true)
}

/// 在系统文件管理器中打开一个路径（Finder / 资源管理器）
#[tauri::command]
pub fn reveal_path(path: String) -> Result<bool, String> {
    let p = PathBuf::from(&path);
    open::that(&p).map_err(|e| format!("打开失败：{}", e))?;
    Ok(true)
}
