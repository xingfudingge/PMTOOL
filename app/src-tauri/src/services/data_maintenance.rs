/**
 * PMTool · 数据维护（备份 / 还原 / 数据目录迁移）（维护者 2026-09-09）
 *
 * 与 FileStorageProvider.safe_relative 业务层隔离：这里用纯 std::fs 做整目录拷贝/校验。
 * DB 一致性快照用 rusqlite 在线 Connection::backup，避免裸拷正在写入的热连接 .db。
 */

use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

/// 递归拷贝 src 目录到 dst（dst 不存在则创建）
pub fn copy_dir_recursive(src: &Path, dst: &Path) -> std::io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let path = entry.path();
        let target = dst.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_recursive(&path, &target)?;
        } else {
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::copy(&path, &target)?;
        }
    }
    Ok(())
}

/// 用 SQLite 在线备份 API 把当前连接的一致性快照写到目标 .db 文件
pub fn backup_db(conn: &rusqlite::Connection, dst: &Path) -> rusqlite::Result<()> {
    if let Some(parent) = dst.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let mut dst_conn = rusqlite::Connection::open(dst)?;
    let backup = rusqlite::backup::Backup::new(conn, &mut dst_conn)?;
    backup.run_to_completion(100, Duration::from_millis(10), None::<fn(rusqlite::backup::Progress)>)?;
    Ok(())
}

/// 校验某目录是否像一个备份（含 pmtool.db）
pub fn is_backup_root(dir: &Path) -> bool {
    dir.join("pmtool.db").exists()
}

/// 返回目录下顶层条目（文件名, 是否为目录）供备份列表展示
pub fn list_top_level(dir: &Path) -> Vec<(String, bool)> {
    let mut out = Vec::new();
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return out,
    };
    for entry in entries.flatten() {
        if let Ok(ty) = entry.file_type() {
            out.push((entry.file_name().to_string_lossy().to_string(), ty.is_dir()));
        }
    }
    out.sort();
    out
}

/// 写/清除数据目录覆盖标记（存于默认应用目录，供 run() 启动时读）
pub fn write_data_root_override(override_file: &Path, root: &str) -> std::io::Result<()> {
    if let Some(parent) = override_file.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(override_file, root)
}

/// 读取数据目录覆盖标记
pub fn read_data_root_override(override_file: &Path) -> Option<PathBuf> {
    let s = fs::read_to_string(override_file).ok()?;
    let t = s.trim();
    if t.is_empty() {
        None
    } else {
        Some(PathBuf::from(t))
    }
}

/// 计算目录大小（字节）
pub fn dir_size(dir: &Path) -> u64 {
    let mut total = 0u64;
    let stack = vec![dir.to_path_buf()];
    let mut s = stack;
    while let Some(d) = s.pop() {
        if let Ok(rd) = fs::read_dir(&d) {
            for entry in rd.flatten() {
                let p = entry.path();
                if let Ok(md) = fs::metadata(&p) {
                    if md.is_dir() {
                        s.push(p);
                    } else {
                        total += md.len();
                    }
                }
            }
        }
    }
    total
}
