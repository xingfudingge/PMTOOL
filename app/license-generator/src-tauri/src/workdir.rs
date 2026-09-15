/**
 * PMTool · License Generator · 工作目录解析
 * 维护者 2026-09-15
 *
 * 统一「工作目录」基准：默认 ~/.pmtool，支持首次打开由用户自选（写覆盖标记）。
 * 覆盖标记存于固定 OS 数据目录（独立于可选的目录本身，避免鸡生蛋问题）。
 *
 * 覆盖范围：密钥对、授权记录 issue_history.json、WebDAV 配置与凭据、加密切钥。
 */

use std::path::PathBuf;

const OVERRIDE_FILE: &str = "workdir.override";

/// 覆盖标记位置（固定 OS 数据目录，不随用户选择的工作目录变化）
pub fn override_marker_path() -> PathBuf {
    dirs::data_dir()
        .or_else(dirs::home_dir)
        .unwrap_or_default()
        .join("pmtool-license-generator")
        .join(OVERRIDE_FILE)
}

/// 是否已由用户设置过工作目录（首次打开检测用）
pub fn is_workdir_set() -> bool {
    read_workdir_override().is_some()
}

/// 读取用户覆盖的工作目录
pub fn read_workdir_override() -> Option<PathBuf> {
    let s = std::fs::read_to_string(override_marker_path()).ok()?;
    let t = s.trim();
    if t.is_empty() {
        None
    } else {
        Some(PathBuf::from(t))
    }
}

/// 写入用户覆盖的工作目录
pub fn write_workdir_override(dir: &str) -> std::io::Result<()> {
    let p = override_marker_path();
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(p, dir)
}

/// 当前实际使用的工作目录基准（用户覆盖优先，否则默认 ~/.pmtool）
pub fn pmtool_base_dir() -> PathBuf {
    read_workdir_override().unwrap_or_else(|| {
        dirs::home_dir()
            .expect("Home directory not found")
            .join(".pmtool")
    })
}