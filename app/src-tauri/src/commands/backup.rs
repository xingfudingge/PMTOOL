/**
 * PMTool · 数据维护 Commands（备份 / 还原 / 数据目录迁移）（维护者 2026-09-09）
 *
 * 复用 services::data_maintenance（纯 fs 拷贝 + SQLite 在线快照）。
 * 还备 / 迁移需重建 DB 连接与文件 Provider，均为「拷贝后重启生效」。
 */

use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, State};
use serde::Serialize;

use crate::AppState;
use crate::repositories::app_settings as app_settings_repo;
use crate::services::data_maintenance;
use crate::services::notification::{service as notif_service, NotificationEvent};

/// 发备份相关通知（成功/失败）。通知异常绝不影响备份命令返回（红线 2）。
fn notify_backup(conn: &rusqlite::Connection, ok: bool, detail: &str) {
    let (event_type, title, content) = if ok {
        (
            "BACKUP_COMPLETED",
            "备份完成".to_string(),
            format!("数据已成功备份到：{}", detail),
        )
    } else {
        (
            "BACKUP_FAILED",
            "备份失败".to_string(),
            format!("备份未完成：{}", detail),
        )
    };
    let ev = NotificationEvent {
        event_type: event_type.to_string(),
        source_type: "BACKUP".to_string(),
        source_id: 0,
        project_id: None,
        title,
        content,
        // 幂等键含时间戳：每次备份都是一次新的事实
        dedup_key: format!(
            "backup:{}:{}",
            if ok { "ok" } else { "fail" },
            chrono::Local::now().format("%Y%m%d%H%M%S")
        ),
        payload: None,
    };
    notif_service::emit_business_event(conn, &ev);
}

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

// 当前生效的数据目录（读 AppState.data_dir，Mutex 包裹）
fn current_data_dir(state: &State<'_, AppState>) -> Result<PathBuf, String> {
    state.data_dir.lock().map_err(|e| e.to_string()).map(|g| g.clone())
}

// 把 AppState 内的数据目录热切到新目录，并让 DB 连接改连目标 pmtool.db。
// 2026-09-16 修复：此前首启/迁移只写 data_root.override（启动时生效），
// 而当前会话的 state.db 仍指向默认目录 —— 导致「选目录后新增的数据写进默认库，
// 真正重启后读到的是自选目录的空库」，用户以为数据丢失。
fn hot_switch_root(
    state: &State<'_, AppState>,
    target: &Path,
) -> Result<(), String> {
    // 打开（或创建）目标库并跑幂等迁移
    let new_conn = crate::db::open_and_migrate(&target.to_path_buf())
        .map_err(|e| format!("打开目标数据库失败：{}", e))?;

    // 替换当前连接（Mutex 串行，安全）
    {
        let mut guard = state.db.lock().map_err(|e| e.to_string())?;
        *guard = new_conn;
    }
    // 更新当前数据目录
    {
        let mut guard = state.data_dir.lock().map_err(|e| e.to_string())?;
        *guard = target.to_path_buf();
    }
    Ok(())
}

/// 立即备份到 dest_dir/<时间戳>/（含 pmtool.db 一致性快照 + PMToolData 目录）
/// 返回生成的备份目录绝对路径
#[tauri::command]
pub fn backup_data(state: State<'_, AppState>, dest_dir: String) -> Result<String, String> {
    let result = do_backup(&state, &dest_dir);
    // 备份结果通知（成功/失败）——通知本身失败只记日志，绝不改变备份命令的返回（红线 2）
    if let Ok(pool) = state.db.lock() {
        match &result {
            Ok(path) => notify_backup(&pool, true, path),
            Err(e) => notify_backup(&pool, false, e),
        }
    }
    result
}

/// 备份本体（通知包装在 backup_data）
fn do_backup(state: &State<'_, AppState>, dest_dir: &str) -> Result<String, String> {
    let data_dir = current_data_dir(state)?;
    let data_root = data_dir.join("PMToolData");
    let dest = PathBuf::from(dest_dir);
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

/// 两条路径规范化后是否指向同一位置（Windows 下 canonicalize 可消除大小写/相对路径差异）
fn same_path(a: &Path, b: &Path) -> bool {
    match (std::fs::canonicalize(a), std::fs::canonicalize(b)) {
        (Ok(x), Ok(y)) => x == y,
        _ => false,
    }
}

/// 用备份还原数据（还原前先自动备份当前）
/// 来源兼容两种：① 备份目录（含 pmtool.db）② 直接选中的 .db 文件
/// （2026-09-16：导入备份改为文件选择器，用户直接指定要导入哪个库，避免目录里多个 db 时无法选择）
#[tauri::command]
pub fn restore_data(state: State<'_, AppState>, src_path: String) -> Result<String, String> {
    let src = PathBuf::from(&src_path);
    let (src_db, src_data) = if src.is_file() {
        // 直接选中的数据库文件：校验是真正的 SQLite，附件目录取其同级的 PMToolData（可能没有）
        if !data_maintenance::is_sqlite_db(&src) {
            return Err("所选文件不是有效的数据库文件".to_string());
        }
        let data = src.parent().map(|p| p.join("PMToolData")).unwrap_or_default();
        (src.clone(), data)
    } else if data_maintenance::is_backup_root(&src) {
        (src.join("pmtool.db"), src.join("PMToolData"))
    } else {
        return Err("不是有效的备份（缺少 pmtool.db）".to_string());
    };

    let data_dir = current_data_dir(&state)?;
    let data_root = data_dir.join("PMToolData");
    let cur_db = data_dir.join("pmtool.db");

    // 防呆：来源就是当前正在使用的库时直接拒绝，否则会把当前库拷去"还原"自己
    if same_path(&src_db, &cur_db) {
        return Err("所选文件就是当前正在使用的数据库，无需导入".to_string());
    }
    // 来源附件目录就是当前附件目录时跳过附件还原，避免"删掉自己再从自己拷贝"
    let restore_data_dir = src_data.exists() && !same_path(&src_data, &data_root);

    // 安全性：还原前把当前数据立即备份到 <数据目录>/_restore_backup/<时间戳>/
    let stamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
    let pre = data_dir.join("_restore_backup").join(&stamp);
    std::fs::create_dir_all(&pre).map_err(|e| format!("创建还原前备份失败：{}", e))?;
    {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        data_maintenance::backup_db(&conn, &pre.join("pmtool.db"))
            .map_err(|e| e.to_string())?;
    }
    if data_root.exists() {
        let _ = data_maintenance::copy_dir_recursive(&data_root, &pre.join("PMToolData"));
    }

    // 覆盖当前 DB + 数据目录
    std::fs::copy(&src_db, &cur_db).map_err(|e| format!("覆盖数据库失败：{}", e))?;
    if restore_data_dir {
        // 先清掉目标再拷贝，保证与备份一致
        if data_root.exists() {
            let _ = std::fs::remove_dir_all(&data_root);
        }
        data_maintenance::copy_dir_recursive(&src_data, &data_root)
            .map_err(|e| format!("还原数据目录失败：{}", e))?;
    }

    Ok("已还原，请重启应用生效".to_string())
}

/// 把当前数据目录切换到自选位置（拷贝到目标并写覆盖标记）
/// 2026-09-16：切换后热切连接与 data_dir，无需等待重启，避免数据写入默认库
#[tauri::command]
pub fn set_data_root(app: AppHandle, state: State<'_, AppState>, path: String) -> Result<String, String> {
    let target = PathBuf::from(&path);
    std::fs::create_dir_all(&target).map_err(|e| format!("目标目录不可写：{}", e))?;

    let cur = current_data_dir(&state)?;
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

    // 热切当前会话到目标目录
    hot_switch_root(&state, &target)?;

    Ok("数据目录已切换并生效".to_string())
}

/// 是否已由用户自选过数据目录（首启检测用；读 OS 默认应用目录下的覆盖标记）
#[tauri::command]
pub fn is_data_root_set(app: AppHandle) -> Result<bool, String> {
    let default_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let override_file = default_dir.join("data_root.override");
    Ok(data_maintenance::read_data_root_override(&override_file).is_some())
}

/// 首启：弹出原生目录选择器，用户自选数据存放目录并写入覆盖标记
/// 2026-09-16：选择后热切当前会话到目标目录，数据即刻写入自选库
#[tauri::command]
pub fn pick_data_root(app: AppHandle, state: State<'_, AppState>) -> Result<Option<String>, String> {
    let picked = rfd::FileDialog::new()
        .set_title("选择 PMTool 数据存放目录")
        .pick_folder();
    let Some(p) = picked else {
        return Ok(None);
    };

    let target = PathBuf::from(p.to_string_lossy().to_string());
    std::fs::create_dir_all(&target).map_err(|e| format!("目标目录不可写：{}", e))?;

    // 拷贝 db + PMToolData 到目标（首启时 db 为空，拷贝无副作用）
    let cur = current_data_dir(&state)?;
    if cur != target {
        let _ = std::fs::copy(cur.join("pmtool.db"), target.join("pmtool.db"));
        let pm_data = cur.join("PMToolData");
        if pm_data.exists() {
            let _ = data_maintenance::copy_dir_recursive(&pm_data, &target.join("PMToolData"));
        }
    }

    // 覆盖标记写到 OS 默认应用目录（启动时读取，早于 DB 初始化）
    let default_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let override_file = default_dir.join("data_root.override");
    data_maintenance::write_data_root_override(&override_file, target.to_string_lossy().as_ref())
        .map_err(|e| format!("写入数据目录标记失败：{}", e))?;

    // 热切当前会话到目标目录（不再需要用户重启才发现数据“丢失”）
    hot_switch_root(&state, &target)?;

    Ok(Some(target.to_string_lossy().to_string()))
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

/// 在系统资源管理器中定位并显示文件（「打开位置」语义），而非用默认程序打开文件。
///
/// 修复的 bug（2026-09-29·用户实测「打开位置也是打开文件」）：
///   此前用 `open::that(&p)` —— 对文件会用系统默认程序打开它，与「本地打开」行为撞车，
///   用户点「打开位置」想看到资源管理器里的文件，结果却弹出文件本身。
/// 跨平台：
///   - Windows：`explorer /select,<路径>`（打开资源管理器并选中该文件；对目录直接打开该目录）
///   - macOS ：`open -R <路径>`（在 Finder 中定位）
///   - Linux  ：打开父目录
#[tauri::command]
pub fn reveal_path(path: String) -> Result<bool, String> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err(format!("路径不存在：{}", p.display()));
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        // explorer 的 /select,"<文件>" 参数**不能**交给 Command::arg()（它会重新转义内嵌引号，
        // 导致 explorer 解析失败回退到「此电脑」）。必须用 raw_arg 原样传给命令行。
        // 2026-09-30 用户实测：纯 .arg 弹出「此电脑」而非文件所在目录。
        // 用 spawn 而非 output：explorer 常驻，output 会阻塞等待它退出。
        let line = if p.is_dir() {
            // 目录：直接打开该目录窗口（用 cd 前缀避免 explorer 误解析为文件）
            format!("\"{}\"", p.to_string_lossy())
        } else {
            format!("/select,\"{}\"", p.to_string_lossy())
        };
        std::process::Command::new("explorer")
            .raw_arg(line)
            .spawn()
            .map_err(|e| format!("打开资源管理器失败：{}", e))?;
        return Ok(true);
    }

    #[cfg(target_os = "macos")]
    {
        // 文件：open -R 在 Finder 定位并选中；目录：直接 open 打开该 Finder 窗口
        let args: Vec<&str> = if p.is_dir() {
            vec![p.to_str().unwrap_or("")]
        } else {
            vec!["-R", p.to_str().unwrap_or("")]
        };
        std::process::Command::new("open")
            .args(&args)
            .spawn()
            .map_err(|e| format!("在 Finder 中定位失败：{}", e))?;
        return Ok(true);
    }

    // Linux 等：打开父目录（xdg-open）
    let parent = p.parent().map(|d| d.to_path_buf()).unwrap_or_else(|| p.clone());
    open::that(&parent).map_err(|e| format!("打开位置失败：{}", e))?;
    Ok(true)
}
