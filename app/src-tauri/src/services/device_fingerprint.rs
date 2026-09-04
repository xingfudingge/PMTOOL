/**
 * PMTool · 设备指纹生成服务（确定版）
 *
 * 设计依据：维护者 2026-09-04 反馈
 *   - 设备指纹必须**纯确定性**：仅基于稳定硬件标识
 *   - **不能**含随机数 / 当前时间 / 启动时间 / hostname（hostname 用户可改）
 *   - **不能**含 hostname（用户可改名"刘海东的 MacBook"））
 *   - 重装系统、清理授权 DB → 同一台机器仍生成同一指纹
 *
 * 当前实现（按平台）：
 *  - macOS: IOPlatformUUID（EFI 烧录，重装系统不变）
 *  - Linux: /etc/machine-id（系统级，重装不变）
 *  - Windows: 注册表 MachineGuid
 */

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::process::Command;

/// 设备指纹
#[derive(Debug, Clone)]
pub struct DeviceFingerprint {
    pub formatted: String,
    pub hardware_hash: String,
}

/// 获取平台级硬件 UUID（**用户不可改，烧录在硬件上**）
fn get_stable_hardware_id() -> Option<String> {
    // macOS：ioreg 取 IOPlatformUUID（系统级硬件 UUID，EFI 烧录）
    #[cfg(target_os = "macos")]
    {
        if let Ok(output) = Command::new("ioreg")
            .args(&["-rd1", "-c", "IOPlatformExpertDevice"])
            .output()
        {
            if let Ok(s) = String::from_utf8(output.stdout) {
                // 找 "IOPlatformUUID" = "<uuid>"
                if let Some(idx) = s.find("IOPlatformUUID") {
                    let rest = &s[idx..];
                    if let Some(eq) = rest.find('=') {
                        let after_eq = rest[eq + 1..].trim_start();
                        if after_eq.starts_with('"') {
                            // 跳过前导引号，找结束引号
                            if let Some(end) = after_eq[1..].find('"') {
                                let uuid = &after_eq[1..1 + end];
                                if !uuid.is_empty() {
                                    return Some(format!("macos::{}", uuid));
                                }
                            }
                        }
                    }
                }
            }
        }
        return None;
    }

    // Linux：读 /etc/machine-id（系统级，初始化时生成，重装不变）
    #[cfg(target_os = "linux")]
    {
        for path in &["/etc/machine-id", "/var/lib/dbus/machine-id"] {
            if let Ok(s) = std::fs::read_to_string(path) {
                let id = s.trim();
                if !id.is_empty() {
                    return Some(format!("linux::{}", id));
                }
            }
        }
        return None;
    }

    // Windows：注册表 MachineGuid（系统安装时生成）
    #[cfg(target_os = "windows")]
    {
        if let Ok(output) = Command::new("reg")
            .args(&["query", r"HKLM\SOFTWARE\Microsoft\Cryptography", "/v", "MachineGuid"])
            .output()
        {
            if let Ok(txt) = String::from_utf8(output.stdout) {
                if let Some(idx) = txt.find("MachineGuid") {
                    let rest = &txt[idx..];
                    if let Some(line) = rest.lines().nth(1) {
                        let id = line.trim().split_whitespace().last().unwrap_or("");
                        if !id.is_empty() {
                            return Some(format!("windows::{}", id));
                        }
                    }
                }
            }
        }
        return None;
    }
}

impl DeviceFingerprint {
    /// 生成设备指纹（**纯确定性**，仅基于平台硬件 UUID）
    /// **绝不含**：随机数、时间戳、hostname（用户可改）、CPU 型号等可能漂移的字段
    pub fn generate() -> Self {
        use sha2::{Sha256, Digest};

        let hardware_id = get_stable_hardware_id()
            .expect("无法获取硬件 UUID（IOPlatformUUID / machine-id / MachineGuid）");

        // 直接对硬件 UUID 做 SHA-256，无任何额外输入
        let mut sha_hasher = Sha256::new();
        sha_hasher.update(hardware_id.as_bytes());
        let sha_result = sha_hasher.finalize();

        // Base32 编码并格式化为 XXXXX-XXXXX-XXXXX-XXXXX-XXXXX
        let b32 = base32::encode(base32::Alphabet::RFC4648 { padding: false }, &sha_result);
        let b32_upper = b32.to_uppercase();
        let chars: Vec<char> = b32_upper.chars().collect();
        let formatted = if chars.len() >= 25 {
            format!(
                "{}-{}-{}-{}-{}",
                &chars[0..5].iter().collect::<String>(),
                &chars[5..10].iter().collect::<String>(),
                &chars[10..15].iter().collect::<String>(),
                &chars[15..20].iter().collect::<String>(),
                &chars[20..25].iter().collect::<String>(),
            )
        } else {
            b32_upper
        };

        Self {
            formatted,
            hardware_hash: format!("{:x}", sha_result),
        }
    }

    /// 验证格式
    pub fn validate(formatted: &str) -> bool {
        let parts: Vec<&str> = formatted.split('-').collect();
        if parts.len() != 5 {
            return false;
        }
        parts.iter().all(|p| p.len() == 5 && p.chars().all(|c| c.is_ascii_alphanumeric()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_validation() {
        assert!(DeviceFingerprint::validate("ABCD1-EFGH2-IJKL3-MNOP4-QRST5"));
        assert!(!DeviceFingerprint::validate("invalid"));
        assert!(!DeviceFingerprint::validate("TOOSHORT"));
    }

    /// **关键测试**：同一台机器多次调用 generate() 必须得到相同指纹
    #[test]
    fn test_deterministic_same_machine() {
        let a = DeviceFingerprint::generate();
        let b = DeviceFingerprint::generate();
        let c = DeviceFingerprint::generate();
        assert_eq!(a.formatted, b.formatted, "设备指纹必须稳定");
        assert_eq!(b.formatted, c.formatted, "设备指纹必须稳定");
    }
}
