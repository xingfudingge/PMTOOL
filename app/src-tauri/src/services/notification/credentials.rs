/**
 * PMTool · 消息与通知中心 · 渠道凭证安全存储
 * 2026-09-18 · docs/notification-center-rfc-2026-09-18.md §十八
 *
 * 红线 4：所有 Secret 必须安全存储。
 *   SMTP 密码/授权码、飞书签名密钥、钉钉加签 Secret 只进 OS 安全存储
 *   （Windows Credential Manager / macOS Keychain），绝不落库、绝不进 AI 上下文。
 *
 * 存储项约定（key = (service=com.pmtool, username)）：
 *   username = notif_channel_{channel_id}
 *   value    = 该渠道的机密串（密码 / 签名密钥）
 *
 * 复用授权体系同一套 SecureStorage（services/auth/secure_storage.rs）。
 */

use crate::services::auth::secure_storage::{KeyringStorage, SecureStorage};

/// 渠道凭证在安全存储中的用户名
pub fn channel_secret_key(channel_id: i64) -> String {
    format!("notif_channel_{}", channel_id)
}

/// 写入/覆盖渠道凭证
pub fn save_channel_secret(channel_id: i64, secret: &str) -> Result<(), String> {
    KeyringStorage.store(&channel_secret_key(channel_id), secret)
}

/// 读取渠道凭证（不存在返回 None）
pub fn read_channel_secret(channel_id: i64) -> Option<String> {
    KeyringStorage
        .read(&channel_secret_key(channel_id))
        .ok()
        .flatten()
        .filter(|s| !s.is_empty())
}

/// 删除渠道凭证
pub fn delete_channel_secret(channel_id: i64) -> Result<(), String> {
    KeyringStorage.delete(&channel_secret_key(channel_id))
}

/// 是否已配置凭证
pub fn has_channel_secret(channel_id: i64) -> bool {
    read_channel_secret(channel_id).is_some()
}

// ============================================================
// 单元测试（用内存实现，不触碰真实 OS 凭据库）
// ============================================================
#[cfg(test)]
mod tests {
    use crate::services::auth::secure_storage::{MemoryStorage, SecureStorage};

    #[test]
    fn key_format_is_stable() {
        // 键格式一旦变更，用户已存凭证会「丢失」，此测试守护格式稳定
        assert_eq!(super::channel_secret_key(1), "notif_channel_1");
        assert_eq!(super::channel_secret_key(42), "notif_channel_42");
    }

    #[test]
    fn memory_storage_roundtrip() {
        let s = MemoryStorage::new();
        // 直接验证 SecureStorage 语义（生产用 KeyringStorage 同接口）
        s.store(&super::channel_secret_key(7), "p@ss").unwrap();
        assert_eq!(
            s.read(&super::channel_secret_key(7)).unwrap().as_deref(),
            Some("p@ss")
        );
        s.delete(&super::channel_secret_key(7)).unwrap();
        assert_eq!(s.read(&super::channel_secret_key(7)).unwrap(), None);
    }
}