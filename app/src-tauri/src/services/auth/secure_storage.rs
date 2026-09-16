/**
 * PMTool · 授权安全存储抽象层
 *
 * 设计依据：授权体系与数据库隔离改造（2026-09-16）
 *   - 授权核心凭证（License / 试用开始时间 / 迁移标记）只能放在 OS 安全存储，
 *     不允许落在业务数据库或可复制的普通文件（复制数据目录/配置/备份都不能复制授权）。
 *   - 上层授权逻辑只调用统一 SecureStorage 接口，不直接触碰平台 API。
 *
 * 平台后端：
 *   Windows → Credential Manager（keyring windows-native）
 *   macOS   → Keychain（keyring apple-native）
 *   Linux   → Secret Service（keyring sync-secret-service）
 *
 * 存储项约定（key = (service, username)）：
 *   service = com.pmtool
 *   username: license          → 已激活的授权码全文
 *             trial_started_at → 7 天试用开始时间（RFC3339）
 *             auth_migrated_at → 旧数据库授权迁移标记（RFC3339）
 */

/// 统一安全存储接口
pub trait SecureStorage {
    fn store(&self, username: &str, value: &str) -> Result<(), String>;
    fn read(&self, username: &str) -> Result<Option<String>, String>;
    fn delete(&self, username: &str) -> Result<(), String>;
    fn exists(&self, username: &str) -> Result<bool, String>;
}

/// keyring crate 后端（三平台统一）
pub struct KeyringStorage;

/// 存储用户名常量
pub const USER_LICENSE: &str = "license";
pub const USER_TRIAL_STARTED_AT: &str = "trial_started_at";
pub const USER_AUTH_MIGRATED_AT: &str = "auth_migrated_at";

/// 服务名（凭据条目作用域：按 Windows 用户隔离）
const SERVICE: &str = "com.pmtool";

#[allow(deprecated)] // keyring 3.x 的 Entry::new 已弃用，但仍是稳定公共 API
impl SecureStorage for KeyringStorage {
    fn store(&self, username: &str, value: &str) -> Result<(), String> {
        keyring::Entry::new(SERVICE, username)
            .map_err(|e| format!("安全存储初始化失败: {}", e))?
            .set_password(value)
            .map_err(|e| format!("安全存储写入失败: {}", e))
    }

    fn read(&self, username: &str) -> Result<Option<String>, String> {
        let entry = keyring::Entry::new(SERVICE, username)
            .map_err(|e| format!("安全存储初始化失败: {}", e))?;
        match entry.get_password() {
            Ok(v) => Ok(Some(v)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(format!("安全存储读取失败: {}", e)),
        }
    }

    fn delete(&self, username: &str) -> Result<(), String> {
        let entry = keyring::Entry::new(SERVICE, username)
            .map_err(|e| format!("安全存储初始化失败: {}", e))?;
        match entry.delete_credential() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(format!("安全存储删除失败: {}", e)),
        }
    }

    fn exists(&self, username: &str) -> Result<bool, String> {
        Ok(self.read(username)?.is_some())
    }
}

/// 内存实现（测试/演示用 · 不依赖真实 OS 凭据库）
/// 集成测试无法访问 cfg(test) 项，故保持常驻公开。
#[doc(hidden)]
pub struct MemoryStorage {
    map: std::sync::Mutex<std::collections::HashMap<String, String>>,
}

#[doc(hidden)]
impl MemoryStorage {
    pub fn new() -> Self {
        Self {
            map: std::sync::Mutex::new(std::collections::HashMap::new()),
        }
    }
}

impl SecureStorage for MemoryStorage {
    fn store(&self, username: &str, value: &str) -> Result<(), String> {
        self.map
            .lock()
            .map_err(|e| e.to_string())?
            .insert(username.to_string(), value.to_string());
        Ok(())
    }

    fn read(&self, username: &str) -> Result<Option<String>, String> {
        Ok(self
            .map
            .lock()
            .map_err(|e| e.to_string())?
            .get(username)
            .cloned())
    }

    fn delete(&self, username: &str) -> Result<(), String> {
        self.map
            .lock()
            .map_err(|e| e.to_string())?
            .remove(username);
        Ok(())
    }

    fn exists(&self, username: &str) -> Result<bool, String> {
        Ok(self
            .map
            .lock()
            .map_err(|e| e.to_string())?
            .contains_key(username))
    }
}