/**
 * PMTool · License Generator · 工作目录 & 密钥目录
 * 维护者 2026-09-15
 *
 * 密钥与工作目录“解耦”——这是授权体系稳定的关键：
 * - 工作目录（pmtool_base_dir）：只存业务数据（授权记录 issue_history.json、WebDAV 配置、加密切钥）。
 *   首次打开可由用户自选，可随用户迁移、可删改，绝不影响授权签发能力。
 * - 密钥目录（key_dir）：存放官方 Ed25519 签发密钥对，是稳定、永久、全局唯一的授权资产。
 *   不随工作目录/首次启动/重装/换机而变化，绝不自动“新造一套”。
 *
 * 官方密钥来源（方案 A）：GitHub Actions 构建时从 secret LG_PRIVATE_KEY 注入，备一次后永久固化。
 * 若固定密钥目录缺失且环境变量 LG_PRIVATE_KEY 有值，则首次落地并固化；
 * 之后一律沿用，绝不覆盖、绝不静默重新生成。
 */

use std::path::PathBuf;

const OVERRIDE_FILE: &str = "workdir.override";
const PRIVATE_KEY_ENV: &str = "LG_PRIVATE_KEY";

/// 工作目录覆盖标记位置（固定 OS 数据目录，不随用户选择的工作目录变化）
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
/// 仅存放业务数据，不存放授权签发密钥。
pub fn pmtool_base_dir() -> PathBuf {
    read_workdir_override().unwrap_or_else(|| {
        dirs::home_dir()
            .expect("Home directory not found")
            .join(".pmtool")
    })
}

/// 授权签发密钥目录：固定、独立于工作目录。
/// 使用用户 home 下的独立目录（或系统数据目录），永不受工作目录切换影响。
pub fn key_dir() -> PathBuf {
    dirs::data_dir()
        .or_else(dirs::home_dir)
        .unwrap_or_default()
        .join("pmtool-license-key")
}

pub fn private_key_path() -> PathBuf {
    key_dir().join("license_generator_private.pem")
}

pub fn public_key_path() -> PathBuf {
    key_dir().join("license_generator_public.pem")
}

/// 确保密钥目录存在
pub fn ensure_key_dir() -> std::io::Result<()> {
    let d = key_dir();
    if !d.exists() {
        std::fs::create_dir_all(&d)?;
    }
    Ok(())
}

/// 官方密钥是否已就位（私钥公钥都存在且非空）
pub fn official_key_ready() -> bool {
    private_key_path().exists() && public_key_path().exists()
}

/// 首次（且仅首次）从环境变量 LG_PRIVATE_KEY 落地官方私钥并固化。
/// 已经存在则忽略，绝不覆盖、绝不重新生成一套新的。
/// 返回是否发生了首次落地。
pub fn bootstrap_private_key_from_env() -> bool {
    // 已有密钥 → 直接忽略，绝不覆盖
    if official_key_ready() {
        return false;
    }
    let Ok(env_value) = std::env::var(PRIVATE_KEY_ENV) else {
        return false; // 无注入源，不做任何静默生成
    };
    let env_value = env_value.trim();
    if env_value.is_empty() {
        return false;
    }
    let _ = ensure_key_dir();
    // 只写私钥；公钥由构建时一并写入（见 bootstrap_public_key）
    if std::fs::write(private_key_path(), env_value).is_ok() {
        true
    } else {
        false
    }
}

/// 首次从环境变量 LG_PUBLIC_KEY 落地官方公钥并固化（与私钥配对，供本地校验/参考）。
/// 已经存在则忽略。
pub fn bootstrap_public_key_from_env() -> bool {
    if official_key_ready() {
        return false;
    }
    let Ok(env_value) = std::env::var("LG_PUBLIC_KEY") else {
        return false;
    };
    let env_value = env_value.trim();
    if env_value.is_empty() {
        return false;
    }
    let _ = ensure_key_dir();
    std::fs::write(public_key_path(), env_value).is_ok()
}
