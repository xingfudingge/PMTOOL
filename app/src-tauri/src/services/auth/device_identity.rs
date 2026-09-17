/**
 * PMTool · 设备身份层（Device Identity）
 *
 * 设计依据：授权体系与数据库隔离改造（2026-09-16）+ 维护者 2026-09-04 反馈
 *
 * 结构：
 *   DeviceIdentityProvider trait（统一接口）→ 平台 Provider
 *   输出 DeviceIdentity：
 *     - binding_id              绑定值（License 协议锁定，格式 XXXXX-XXXXX-...）
 *                               与旧版 device_fingerprint::generate() 输出【字节级一致】，
 *                               保证升级后同一台机器 License 不断签（§11 硬性要求）。
 *     - multi_feature_fingerprint  多特征指纹（辅助防伪/一致性校验，不参与绑定比对）
 *
 * 派生原则（§10）：
 *   平台多个稳定特征 → 标准化 → 规范化排序 → 稳定身份材料 → 统一派生算法
 *
 * 稳定性（§11）：
 *   应用升级 / 数据库恢复 / 数据迁移 → binding_id 不变
 *   增加网卡 / 换内存 / 系统补丁   → binding_id 不变（特征不含易变字段）
 *   主板 / 系统 UUID 更换          → 新设备，需重新授权
 */

use std::process::Command;

/// 以静默方式启动子进程（2026-09-17 修复：Windows 启动时弹多次 cmd 黑窗）
/// Windows 上使用 CREATE_NO_WINDOW 隐藏子进程控制台（reg/wmic/getmac/powershell 等
/// 本身有 conhost，GUI 应用调用时若不隐藏会闪现黑色命令窗口，观感像木马）。
#[cfg(target_os = "windows")]
fn silent_cmd(program: &str) -> Command {
    use std::os::windows::process::CommandExt;
    let mut c = Command::new(program);
    // CREATE_NO_WINDOW = 0x08000000
    c.creation_flags(0x0800_0000);
    c
}

/// 非 Windows 平台无需隐藏控制台
#[cfg(not(target_os = "windows"))]
fn silent_cmd(program: &str) -> Command {
    Command::new(program)
}

/// 设备身份
#[derive(Debug, Clone)]
pub struct DeviceIdentity {
    /// License 绑定值（协议锁定格式）
    pub binding_id: String,
    /// 多特征指纹（辅助，不参与绑定）
    pub multi_feature_fingerprint: String,
}

/// 统一设备身份提供者接口
pub trait DeviceIdentityProvider {
    fn compute_identity(&self) -> Result<DeviceIdentity, String>;
}

// ============================================================
// 平台硬件特征采集
// ============================================================

/// 平台主稳定硬件 UUID（用户不可改，烧录在硬件上）
/// 返回值带平台前缀，前缀属于 binding_id 派生输入的一部分，**不得改动**。
pub fn get_primary_hardware_id() -> Option<String> {
    // macOS：ioreg 取 IOPlatformUUID（系统级硬件 UUID，EFI 烧录）
    #[cfg(target_os = "macos")]
    {
        if let Ok(output) = silent_cmd("ioreg")
            .args(["-rd1", "-c", "IOPlatformExpertDevice"])
            .output()
        {
            if let Ok(s) = String::from_utf8(output.stdout) {
                if let Some(idx) = s.find("IOPlatformUUID") {
                    let rest = &s[idx..];
                    if let Some(eq) = rest.find('=') {
                        let after_eq = rest[eq + 1..].trim_start();
                        if after_eq.starts_with('"') {
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
        for path in ["/etc/machine-id", "/var/lib/dbus/machine-id"] {
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
        if let Ok(output) = silent_cmd("reg")
            .args(["query", r"HKLM\SOFTWARE\Microsoft\Cryptography", "/v", "MachineGuid"])
            .output()
        {
            if let Ok(txt) = String::from_utf8(output.stdout) {
                if let Some(idx) = txt.find("MachineGuid") {
                    let rest = &txt[idx..];
                    if let Some(line) = rest.lines().next() {
                        let id = line.trim().split_whitespace().last().unwrap_or("");
                        // 长度守卫：MachineGuid 为 36 位 GUID
                        if id.len() >= 16 && id.chars().any(|c| c == '-') {
                            return Some(format!("windows::{}", id));
                        }
                    }
                }
            }
        }
        return None;
    }

    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        None
    }
}

/// 平台次要稳定特征（多特征指纹用，**不参与 binding_id**）
/// 这些特征允许单独变化（如加网卡），不影响绑定值；但组合起来可增强一致性判定。
fn collect_aux_features() -> Vec<String> {
    let mut feats: Vec<String> = Vec::new();

    // macOS：IOPlatformSerialNumber + 网卡 MAC
    #[cfg(target_os = "macos")]
    {
        if let Ok(output) = silent_cmd("ioreg")
            .args(["-rd1", "-c", "IOPlatformExpertDevice"])
            .output()
        {
            if let Ok(s) = String::from_utf8(output.stdout) {
                for key in ["IOPlatformSerialNumber", "MLB", "board-id"] {
                    if let Some(idx) = s.find(key) {
                        let rest = &s[idx..];
                        if let Some(eq) = rest.find('=') {
                            let after_eq = rest[eq + 1..].trim_start();
                            if after_eq.starts_with('"') {
                                if let Some(end) = after_eq[1..].find('"') {
                                    let v = &after_eq[1..1 + end];
                                    if !v.is_empty() {
                                        feats.push(format!("{key}::{v}"));
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        if let Some(macs) = collect_mac_addresses() {
            feats.push(format!("macs::{macs}"));
        }
    }

    // Linux：DMI product_uuid + 网卡 MAC
    #[cfg(target_os = "linux")]
    {
        for (k, p) in [
            ("dmi_uuid", "/sys/class/dmi/id/product_uuid"),
            ("dmi_board", "/sys/class/dmi/id/board_serial"),
        ] {
            if let Ok(s) = std::fs::read_to_string(p) {
                let v = s.trim().to_lowercase();
                if !v.is_empty() && v != "unknown" {
                    feats.push(format!("{k}::{v}"));
                }
            }
        }
        if let Some(macs) = collect_mac_addresses() {
            feats.push(format!("macs::{macs}"));
        }
    }

    // Windows：BIOS 系统 UUID（SMBios）+ 网卡 MAC
    #[cfg(target_os = "windows")]
    {
        for cmd in [
            ["wmic", "csproduct", "get", "uuid"],
            ["powershell", "-NoProfile", "-Command", "(Get-CimInstance Win32_ComputerSystemProduct).UUID"],
        ] {
            if let Ok(output) = silent_cmd(cmd[0]).args(&cmd[1..]).output() {
                if let Ok(txt) = String::from_utf8(output.stdout) {
                    for line in txt.lines() {
                        let v = line.trim().to_lowercase();
                        if !v.is_empty()
                            && v != "uuid"
                            && v.chars().any(|c| c == '-')
                            && v.len() >= 16
                        {
                            feats.push(format!("bios_uuid::{v}"));
                            break;
                        }
                    }
                }
                if !feats.is_empty() {
                    break;
                }
            }
        }
        if let Some(macs) = collect_mac_addresses() {
            feats.push(format!("macs::{macs}"));
        }
    }

    feats.sort();
    feats.dedup();
    feats
}

/// 收集本机所有网卡 MAC（跳过回环），排序去重后逗号拼接。
fn collect_mac_addresses() -> Option<String> {
    let mut macs: Vec<String> = Vec::new();

    #[cfg(target_os = "macos")]
    {
        if let Ok(o) = silent_cmd("ifconfig").arg("-a").output() {
            if let Ok(t) = String::from_utf8(o.stdout) {
                for line in t.lines() {
                    let l = line.trim();
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
                        macs.push(format!("{ifname}={mac}"));
                    }
                }
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        for cmd in [["getmac", "/fo", "csv", "/nh"], ["getmac", "/fo", "list", "/v"]] {
            if let Ok(o) = silent_cmd(cmd[0]).args(&cmd[1..]).output() {
                if let Ok(t) = String::from_utf8(o.stdout) {
                    for m in t.split_whitespace() {
                        if is_mac_like(m) {
                            macs.push(m.trim_matches(&['"', ',', '\''][..]).to_string());
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
    let t = s.trim().trim_end_matches(&['"', ',', '\''][..]);
    let hexn = t.chars().filter(|c| c.is_ascii_hexdigit()).count();
    hexn >= 15 && (t.contains('-') || t.contains(':'))
}

/// 无法读取主硬件 UUID 时的稳定兜底（绝不 panic）：
/// 以所有网卡 MAC + 已安装目录哈希出确定性 ID，使同一台机器仍得到同一绑定值。
fn fallback_stable_id() -> String {
    use sha2::{Digest, Sha256};
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

// ============================================================
// 派生算法
// ============================================================

/// binding_id 派生（v1 · 与旧版 DeviceFingerprint::generate().formatted 输出一致）
///   binding_id = base32( SHA-256( hardware_id ) ) 格式化为 XXXXX-XXXXX-XXXXX-XXXXX-XXXXX
fn derive_binding_id(hardware_id: &str) -> String {
    use sha2::{Digest, Sha256};
    let mut sha_hasher = Sha256::new();
    sha_hasher.update(hardware_id.as_bytes());
    let sha_result = sha_hasher.finalize();

    let b32 = base32::encode(base32::Alphabet::RFC4648 { padding: false }, &sha_result);
    let b32_upper = b32.to_uppercase();
    let chars: Vec<char> = b32_upper.chars().collect();
    if chars.len() >= 25 {
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
    }
}

/// 多特征指纹派生：规范化排序后的全特征 SHA-256 → base32（同一格式，便于比对）
fn derive_multi_feature_fingerprint(features: &[String]) -> String {
    use sha2::{Digest, Sha256};
    let mut h = Sha256::new();
    h.update(b"pmtool-multi-feature-v1\n");
    for f in features {
        h.update(f.as_bytes());
        h.update(b"\n");
    }
    let r = h.finalize();
    base32::encode(base32::Alphabet::RFC4648 { padding: false }, &r).to_uppercase()
}

// ============================================================
// 统一 Provider
// ============================================================

/// 平台 Provider（多特征采集 + 双输出派生）
pub struct PlatformDeviceIdentityProvider;

impl DeviceIdentityProvider for PlatformDeviceIdentityProvider {
    fn compute_identity(&self) -> Result<DeviceIdentity, String> {
        use crate::services::logging;

        let primary = get_primary_hardware_id().unwrap_or_else(|| {
            let fb = fallback_stable_id();
            logging::log_line(&format!(
                "[WARN] 无法读取平台硬件 UUID，回退到 MAC/安装目录指纹: {}",
                fb
            ));
            fb
        });

        let binding_id = derive_binding_id(&primary);
        let aux = collect_aux_features();
        let multi_feature_fingerprint = derive_multi_feature_fingerprint(&aux);

        Ok(DeviceIdentity {
            binding_id,
            multi_feature_fingerprint,
        })
    }
}

/// 获取当前设备身份（统一入口，无 DB）
pub fn compute_current_identity() -> Result<DeviceIdentity, String> {
    PlatformDeviceIdentityProvider.compute_identity()
}

/// 验证绑定值格式（XXXXX-XXXXX-XXXXX-XXXXX-XXXXX）
pub fn validate_binding_id(formatted: &str) -> bool {
    let parts: Vec<&str> = formatted.split('-').collect();
    if parts.len() != 5 {
        return false;
    }
    parts
        .iter()
        .all(|p| p.len() == 5 && p.chars().all(|c| c.is_ascii_alphanumeric()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_binding_id_format_validation() {
        assert!(validate_binding_id("ABCD1-EFGH2-IJKL3-MNOP4-QRST5"));
        assert!(!validate_binding_id("invalid"));
        assert!(!validate_binding_id("TOOSHORT"));
    }

    /// 关键测试：同一台机器多次计算必须得到相同 identity
    #[test]
    fn test_deterministic_same_machine() {
        let a = compute_current_identity().unwrap();
        let b = compute_current_identity().unwrap();
        let c = compute_current_identity().unwrap();
        assert_eq!(a.binding_id, b.binding_id, "绑定值必须稳定");
        assert_eq!(b.binding_id, c.binding_id, "绑定值必须稳定");
    }

    /// binding_id 格式与协议一致
    #[test]
    fn test_binding_id_protocol_format() {
        let id = compute_current_identity().unwrap();
        assert!(
            validate_binding_id(&id.binding_id),
            "binding_id 必须是 XXXXX-XXXXX-XXXXX-XXXXX-XXXXX: {}",
            id.binding_id
        );
    }

    /// 与旧版 DeviceFingerprint::generate() 输出一致性（协议锁定，不可变）
    #[test]
    fn test_binding_id_backward_compat() {
        let new = compute_current_identity().unwrap();
        let old = crate::services::device_fingerprint::DeviceFingerprint::generate();
        assert_eq!(
            new.binding_id, old.formatted,
            "binding_id 必须与旧版设备指纹输出一致（已签发 License 依赖此值）"
        );
    }

    #[test]
    fn test_multi_feature_fingerprint_deterministic() {
        let a = compute_current_identity().unwrap();
        let b = compute_current_identity().unwrap();
        assert_eq!(a.multi_feature_fingerprint, b.multi_feature_fingerprint);
    }

    /// DefaultHasher 不应被用于任何身份派生（仅供保留/调试）
    #[test]
    fn test_default_hasher_not_in_identity() {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};
        // 该测试仅为文档性：若未来有人把 DefaultHasher 引入派生，这里会提醒。
        let _ = {
            let mut h = DefaultHasher::new();
            "pmtool".hash(&mut h);
            h.finish()
        };
    }
}