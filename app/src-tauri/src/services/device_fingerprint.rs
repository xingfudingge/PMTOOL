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
                    // 值行形如: MachineGuid    REG_SZ    <guid>（同一行），取行内最后一个非空 token
                    let rest = &txt[idx..];
                    if let Some(line) = rest.lines().next() {
                        let id = line.trim().split_whitespace().last().unwrap_or("");
                        // 长度守卫：防止误取 REG_SZ 等字段，MachineGuid 为 36 位 GUID
                        if id.len() >= 16 && id.chars().any(|c| c == '-') {
                            return Some(format!("windows::{}", id));
                        }
                    }
                }
            }
        }
        return None;
    }
}

/// 无法读取硬件 UUID 时的**稳定兜底**（绝不 panic）：
/// 以所有网卡 MAC + 已安装目录哈希出确定性 ID，使同一台机器仍得到同一指纹。
fn fallback_stable_id() -> String {
    use sha2::{Sha256, Digest};
    let mut h = Sha256::new();
    h.update(b"pmtool-device-fallback-v1");

    if let Some(macs) = collect_mac_addresses() {
        h.update(b"mac:");
        h.update(macs.as_bytes());
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            h.update(b"exe:");
            h.update(parent.to_string_lossy().as_bytes());
        }
    }

    let r = h.finalize();
    format!("fallback::{}", hex::encode(&r[..16]))
}

/// 收集本机所有网卡 MAC（跳过回环），排序去重后逗号拼接。
fn collect_mac_addresses() -> Option<String> {
    let mut macs: Vec<String> = Vec::new();

    // macOS：ifconfig -a 里的 ether 行
    #[cfg(target_os = "macos")]
    {
        if let Ok(o) = Command::new("ifconfig").arg("-a").output() {
            if let Ok(t) = String::from_utf8(o.stdout) {
                for line in t.lines() {
                    let l = line.trim();
                    if l.starts_with("ether ") {
                        if let Some(e) = l.strip_prefix("ether ") {
                            let mac = e.split_whitespace().next().unwrap_or("");
                            if !mac.is_empty() {
                                macs.push(mac.to_string());
                            }
                        }
                    }
                }
            }
        }
    }

    // Linux：读 /sys/class/net/*/address（跳过 lo 与全零）
    #[cfg(target_os = "linux")]
    {
        if let Ok(rd) = std::fs::read_dir("/sys/class/net") {
            for e in rd.flatten() {
                let ifname = e.file_name().to_string_lossy().into_owned();
                if ifname == "lo" {
                    continue;
                }
                if let Ok(s) = std::fs::read_to_string(e.path().join("address")) {
                    let mac = s.trim();
                    if !mac.is_empty() && mac != "00:00:00:00:00:00" {
                        macs.push(format!("{}={}", ifname, mac));
                    }
                }
            }
        }
    }

    // Windows：getmac 输出（MAC 形如 aa-bb-cc-dd-ee-ff）
    #[cfg(target_os = "windows")]
    {
        for cmd in [["getmac", "/fo", "csv", "/nh"], ["getmac", "/fo", "list", "/v"]] {
            if let Ok(o) = Command::new(cmd[0]).args(&cmd[1..]).output() {
                if let Ok(t) = String::from_utf8(o.stdout) {
                    for m in t.split_whitespace() {
                        if is_mac_like(m) {
                            macs.push(m.trim_matches(&['\"', ',', '\''][..]).to_string());
                        }
                    }
                }
            }
            if !macs.is_empty() {
                break;
            }
        }
    }

    macs.sort();
    macs.dedup();
    if macs.is_empty() {
        None
    } else {
        Some(macs.join(","))
    }
}

/// 粗略判断一段文本是否像 MAC（>=12 个十六进制字符，且含 - 或 :）
fn is_mac_like(s: &str) -> bool {
    let t = s.trim().trim_end_matches(&['\"', ',', '\''][..]);
    let hexn = t.chars().filter(|c| c.is_ascii_hexdigit()).count();
    hexn >= 15 && (t.contains('-') || t.contains(':'))
}

impl DeviceFingerprint {
    /// 生成设备指纹（**纯确定性**，仅基于平台硬件 UUID）
    /// **绝不含**：随机数、时间戳、hostname（用户可改）、CPU 型号等可能漂移的字段
    pub fn generate() -> Self {
        use sha2::{Sha256, Digest};

        let hardware_id = get_stable_hardware_id().unwrap_or_else(|| {
            let fb = fallback_stable_id();
            crate::services::logging::log_line(&format!(
                "[WARN] 无法读取平台硬件 UUID，回退到 MAC/安装目录指纹: {}",
                fb
            ));
            fb
        });

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
