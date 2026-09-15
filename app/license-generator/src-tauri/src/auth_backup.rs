/**
 * PMTool · License Generator · 授权记录导出/导入 + WebDAV 远程备份
 * 维护者 2026-09-14
 *
 * 授权记录即 ~/.pmtool/issue_history.json 里的 LicenseHistoryRecord 列表。
 * 本模块提供：
 *   1. 导出：把授权记录打包成「版本化 + 校验和」的 JSON 备份
 *   2. 导入：校验格式/版本/校验和 → 按 license_id 并集合并（重复跳过、冲突上报不覆盖）
 *   3. WebDAV：配置（密码应用内加密落盘，不弹系统授权窗）→ 上传备份/下载备份/双向同步
 *
 * 备份文件格式（明文 JSON，需求明确不强加密）：
 * {
 *   "format":      "pmtool-license-generator-backup",
 *   "version":     1,
 *   "exported_at": "...",
 *   "app":         "LicenseGenerator",
 *   "checksum":    "sha256(payload 规范化 JSON)",
 *   "payload":     {"records": [LicenseHistoryRecord, ...]}
 * }
 */

use crate::LicenseHistoryRecord;
use base64::{Engine, engine::general_purpose::STANDARD as BASE64};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::PathBuf;

pub const BACKUP_FORMAT: &str = "pmtool-license-generator-backup";
pub const BACKUP_VERSION: i64 = 1;

/// 授权记录文件路径 <工作目录>/issue_history.json
pub fn history_path() -> PathBuf {
    crate::workdir::pmtool_base_dir().join("issue_history.json")
}

// ============ 备份文件结构 ============

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupPayload {
    pub records: Vec<LicenseHistoryRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LicenseBackup {
    pub format: String,
    pub version: i64,
    pub exported_at: String,
    pub app: String,
    pub checksum: String,
    pub payload: BackupPayload,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportReport {
    pub added: usize,          // 新增合并进来的记录
    pub skipped_duplicates: usize, // 重复（完全一致）跳过
    pub conflicts: usize,      // 同 id 内容不一致，未覆盖
    pub total: usize,          // 合并后本地总记录数
    pub imported_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupPreview {
    pub format: String,
    pub version: i64,
    pub exported_at: String,
    pub record_count: usize,
    pub valid: bool,
    pub reason: Option<String>,
}

// ============ 导出 ============

/// 读取当前全部授权记录
pub fn load_records() -> Vec<LicenseHistoryRecord> {
    let path = history_path();
    if !path.exists() {
        return Vec::new();
    }
    match std::fs::read_to_string(&path) {
        Ok(s) => serde_json::from_str(&s).unwrap_or_default(),
        Err(_) => Vec::new(),
    }
}

pub fn save_records(records: &[LicenseHistoryRecord]) -> Result<(), String> {
    if let Some(dir) = history_path().parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("创建 .pmtool 目录失败：{}", e))?;
    }
    let json = serde_json::to_string_pretty(records).map_err(|e| e.to_string())?;
    std::fs::write(history_path(), json).map_err(|e| format!("写入授权历史失败：{}", e))
}

/// 导出全部授权记录为备份字符串
pub fn export_to_string() -> Result<String, String> {
    let records = load_records();
    let payload = BackupPayload { records };
    let raw = serde_json::to_vec(&payload).map_err(|e| format!("序列化失败：{}", e))?;
    let checksum = checksum_of(&raw);
    let backup = LicenseBackup {
        format: BACKUP_FORMAT.to_string(),
        version: BACKUP_VERSION,
        exported_at: chrono::Utc::now().to_rfc3339(),
        app: "LicenseGenerator".to_string(),
        checksum,
        payload,
    };
    serde_json::to_string_pretty(&backup).map_err(|e| format!("序列化失败：{}", e))
}

// ============ 解析/校验 ============

pub fn parse_backup(content: &str) -> Result<LicenseBackup, String> {
    let backup: LicenseBackup =
        serde_json::from_str(content).map_err(|e| format!("备份文件不是合法 JSON：{}", e))?;

    if backup.format != BACKUP_FORMAT {
        return Err(format!(
            "备份格式不匹配（期望 {}, 实际 {}）",
            BACKUP_FORMAT, backup.format
        ));
    }
    if backup.version > BACKUP_VERSION {
        return Err(format!(
            "备份版本过新（v{} > 支持的 v{}），请升级授权生成器后再导入",
            backup.version, BACKUP_VERSION
        ));
    }
    if backup.version < 1 {
        return Err(format!("备份版本无效：{}", backup.version));
    }
    let raw = serde_json::to_vec(&backup.payload)
        .map_err(|e| format!("重算校验和失败：{}", e))?;
    if checksum_of(&raw) != backup.checksum {
        return Err("备份数据校验和不匹配，文件可能已损坏或被人为修改".to_string());
    }
    Ok(backup)
}

pub fn preview(content: &str) -> Result<BackupPreview, String> {
    let backup = parse_backup(content)?;
    Ok(BackupPreview {
        format: backup.format.clone(),
        version: backup.version,
        exported_at: backup.exported_at.clone(),
        record_count: backup.payload.records.len(),
        valid: true,
        reason: None,
    })
}

/// 按 license_id 判断两条记录业务上是否一致（忽略任何编号差异，这里没有自增 id 需忽略）
fn same_record(a: &LicenseHistoryRecord, b: &LicenseHistoryRecord) -> bool {
    a.id == b.id
        && a.device_id == b.device_id
        && a.order_no == b.order_no
        && a.license == b.license
        && a.license_type == b.license_type
        && a.start_time == b.start_time
        && a.expire_time == b.expire_time
        && a.created_at == b.created_at
}

/// 导入：校验后按 license_id 并集合并进本地记录（重复跳过、冲突不覆盖）
/// 合并结果写回 issue_history.json。返回报告。
pub fn import(backup: &LicenseBackup) -> Result<ImportReport, String> {
    let mut local = load_records();
    let mut added = 0;
    let mut skipped_duplicates = 0;
    let mut conflicts = 0;

    for rec in &backup.payload.records {
        match local.iter().find(|l| l.id == rec.id) {
            None => {
                local.push(rec.clone());
                added += 1;
            }
            Some(existing) => {
                if same_record(existing, rec) {
                    skipped_duplicates += 1;
                } else {
                    conflicts += 1; // 不覆盖，上报
                }
            }
        }
    }

    save_records(&local)?;

    Ok(ImportReport {
        added,
        skipped_duplicates,
        conflicts,
        total: local.len(),
        imported_at: chrono::Utc::now().to_rfc3339(),
    })
}

fn checksum_of(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    hasher.finalize().iter().map(|b| format!("{:02x}", b)).collect()
}

// ============ WebDAV 客户端 ============

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebdavConfig {
    pub url: String,
    pub username: String,
    #[serde(default)]
    pub remote_dir: String,
    #[serde(default)]
    pub auto_backup: bool,
}

/// WebDAV 配置视图（密码仅回传「已配置」，绝不回传真实值）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebdavConfigView {
    pub url: String,
    pub username: String,
    pub remote_dir: String,
    pub auto_backup: bool,
    pub has_password: bool,
    pub last_backup_at: Option<String>,
}

fn cfg_path() -> PathBuf {
    crate::workdir::pmtool_base_dir().join("webdav_config.json")
}

pub fn load_cfg() -> WebdavConfig {
    let p = cfg_path();
    if p.exists() {
        if let Ok(s) = std::fs::read_to_string(&p) {
            if let Ok(c) = serde_json::from_str::<WebdavConfig>(&s) {
                return c;
            }
        }
    }
    WebdavConfig { url: String::new(), username: String::new(), remote_dir: String::new(), auto_backup: false }
}

pub fn save_cfg(cfg: &WebdavConfig) -> Result<(), String> {
    if let Some(dir) = cfg_path().parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("创建 .pmtool 目录失败：{}", e))?;
    }
    std::fs::write(cfg_path(), serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?)
        .map_err(|e| format!("保存 WebDAV 配置失败：{}", e))
}

pub fn cfg_view() -> Result<WebdavConfigView, String> {
    let cfg = load_cfg();
    Ok(WebdavConfigView {
        url: cfg.url.clone(),
        username: cfg.username.clone(),
        remote_dir: cfg.remote_dir.clone(),
        auto_backup: cfg.auto_backup,
        has_password: credential_has_password(),
        last_backup_at: last_backup_at(),
    })
}

fn remote_path(cfg: &WebdavConfig, filename: &str) -> String {
    let base = cfg.url.trim_end_matches('/');
    let dir = cfg.remote_dir.trim_matches('/');
    let mut p = base.to_string();
    if !dir.is_empty() {
        p.push('/');
        p.push_str(dir);
    }
    p.push('/');
    p.push_str(filename);
    p
}

fn agent() -> ureq::Agent {
    ureq::AgentBuilder::new()
        .timeout_connect(std::time::Duration::from_secs(10))
        .timeout(std::time::Duration::from_secs(60))
        .build()
}

fn auth(req: ureq::Request, cfg: &WebdavConfig, password: &str) -> ureq::Request {
    if cfg.username.is_empty() {
        req
    } else {
        let token = BASE64.encode(format!("{}:{}", cfg.username, password));
        req.set("Authorization", &format!("Basic {}", token))
    }
}

/// 测试连接（PROPFIND 目标目录，深度 0）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestResult {
    pub ok: bool,
    pub message: String,
}

pub fn test_connection() -> TestResult {
    let cfg = load_cfg();
    let password = match credential_get_password() {
        Ok(p) => p,
        Err(e) => return TestResult { ok: false, message: format!("未配置密码：{}", e) },
    };
    if cfg.url.is_empty() {
        return TestResult { ok: false, message: "未配置 WebDAV 地址".to_string() };
    }
    let url = format!("{}/", remote_path(&cfg, ""));
    let req = auth(agent().request("PROPFIND", &url).set("Depth", "0"), &cfg, &password);
    match req.call() {
        Ok(resp) => {
            let s = resp.status();
            if (200..300).contains(&s) || s == 207 {
                TestResult { ok: true, message: format!("连接成功（HTTP {}）", s) }
            } else {
                TestResult { ok: false, message: format!("连接失败（HTTP {}）", s) }
            }
        }
        Err(ureq::Error::Status(code, resp)) => {
            let body = resp.into_string().unwrap_or_default();
            let hint = if code == 401 || code == 403 {
                "—— 认证失败，请检查用户名/密码".to_string()
            } else if code == 404 || code == 409 {
                "—— 远程目录可能存在不存在，请确认已创建".to_string()
            } else if code == 429 {
                "—— 服务器限流或误判（Too Many Requests），请稍后重试；若持续请检查鉴权方式".to_string()
            } else {
                String::new()
            };
            eprintln!("[DIAG] PROPFIND HTTP {} body={:.300}", code, body);
            TestResult { ok: false, message: format!("连接失败（HTTP {}）{}", code, hint) }
        },
        Err(e) => TestResult { ok: false, message: format!("连接失败：{}", e) },
    }
}

/// 列出远程目录下的备份文件名（*.json）。用 PROPFIND Depth=1，解析响应里的 href。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteBackupItem {
    pub name: String,
    pub size: u64,
    pub modified: Option<String>,
}

pub fn list_remote_backups() -> Result<Vec<RemoteBackupItem>, String> {
    let cfg = load_cfg();
    let password = credential_get_password().map_err(|e| format!("未配置密码：{}", e))?;
    let url = format!("{}/", remote_path(&cfg, ""));
    let req = auth(agent().request("PROPFIND", &url).set("Depth", "1"), &cfg, &password);
    let resp = req.call().map_err(|e| format!("列出远程备份失败：{}", e))?;
    let status = resp.status();
    if !((200..300).contains(&status) || status == 207) {
        return Err(format!("列出远程备份失败（HTTP {}）", status));
    }
    let body = resp.into_string().unwrap_or_default();
    eprintln!("[DIAG] PROPFIND url={} status={} body_len={} body_snippet={:.900}", url, status, body.len(), body);
    Ok(parse_multistatus(&body))
}

/// 从 PROPFIND 多状态 XML 中解析出远程备份文件列表（容忍 d: 等命名空间前缀）
fn parse_multistatus(body: &str) -> Vec<RemoteBackupItem> {
    let mut items = Vec::new();
    let re = regex::Regex::new(r#"<[^>]*response[^>]*>([\s\S]*?)</[^>]*response>"#).unwrap();
    let re_href = regex::Regex::new(r#"<[^>]*href[^>]*>([\s\S]*?)</[^>]*href>"#).unwrap();
    let re_len = regex::Regex::new(r#"<[^>]*getcontentlength[^>]*>([\s\S]*?)</[^>]*getcontentlength>"#).unwrap();
    let re_mod = regex::Regex::new(r#"<[^>]*getlastmodified[^>]*>([\s\S]*?)</[^>]*getlastmodified>"#).unwrap();

    for cap in re.captures_iter(body) {
        let block = cap.get(1).map(|m| m.as_str()).unwrap_or("");
        let href = re_href.captures(block).and_then(|c| c.get(1)).map(|m| m.as_str().to_string());
        if let Some(href) = href {
            let name = href.trim_end_matches('/').rsplit('/').next().unwrap_or("").to_string();
            let name = url_decode(&name);
            if name.ends_with(".json") {
                let size = re_len.captures(block).and_then(|c| c.get(1)).and_then(|m| m.as_str().trim().parse::<u64>().ok()).unwrap_or(0);
                let modified = re_mod.captures(block).and_then(|c| c.get(1)).map(|m| m.as_str().trim().to_string()).filter(|s| !s.is_empty());
                items.push(RemoteBackupItem { name, size, modified });
            }
        }
    }
    items
}

fn url_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(v) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UploadResult {
    pub remote_path: String,
    pub bytes: usize,
}

pub fn upload(filename: &str, content: &[u8]) -> Result<UploadResult, String> {
    let cfg = load_cfg();
    let password = credential_get_password()?;
    let url = remote_path(&cfg, filename);
    let req = auth(agent().put(&url).set("Content-Type", "application/json"), &cfg, &password);
    match req.send_bytes(content) {
        Ok(resp) => {
            if (200..300).contains(&resp.status()) {
                Ok(UploadResult { remote_path: url, bytes: content.len() })
            } else {
                Err(format!("上传失败（HTTP {}）", resp.status()))
            }
        }
        Err(ureq::Error::Status(code, _)) => Err(format!("上传失败（HTTP {}）", code)),
        Err(e) => Err(format!("上传请求失败：{}", e)),
    }
}

pub fn download(filename: &str) -> Result<Vec<u8>, String> {
    let cfg = load_cfg();
    let password = credential_get_password()?;
    let url = remote_path(&cfg, filename);
    let req = auth(agent().get(&url), &cfg, &password);
    match req.call() {
        Ok(resp) => {
            if !(200..300).contains(&resp.status()) {
                return Err(format!("下载失败（HTTP {}）", resp.status()));
            }
            let mut buf = Vec::new();
            std::io::Read::read_to_end(&mut resp.into_reader(), &mut buf)
                .map_err(|e| format!("读取远程内容失败：{}", e))?;
            Ok(buf)
        }
        Err(ureq::Error::Status(code, _)) => Err(format!("下载失败（HTTP {}）—— 远程文件可能不存在", code)),
        Err(e) => Err(format!("下载请求失败：{}", e)),
    }
}

// ============ WebDAV 密码存储（应用内加密落盘，不走系统钥匙串） ============
// 维护者 2026-09-14：不弹系统钥匙串授权窗，密码加密后存本软件自己的隐藏配置里。
// 用 chaCha20-Poly1305 AEAD；随机 key + 随机 nonce，密文与 key 均落盘到 ~/.pmtool/。
// 密码绝不明文落盘；本地加密层（防裸奔），不是强密钥管理体系。

use chacha20poly1305::aead::{Aead, KeyInit};
use chacha20poly1305::{ChaCha20Poly1305, Key, Nonce};

const WEBDAV_KEY_FILE: &str = "webdav_cred.key";
const WEBDAV_CRED_FILE: &str = "webdav_cred.json";

#[derive(Debug, serde::Serialize, serde::Deserialize)]
struct EncCred {
    nonce: String, // base64 12 字节
    ciphertext: String, // base64
}

fn pmtool_dir() -> PathBuf {
    crate::workdir::pmtool_base_dir()
}

/// 读取（或首次生成）加密密钥
fn load_or_create_key() -> Result<[u8; 32], String> {
    let key_path = pmtool_dir().join(WEBDAV_KEY_FILE);
    if key_path.exists() {
        if let Ok(s) = std::fs::read_to_string(&key_path) {
            let hex = s.trim();
            let bytes = hex::decode(hex).map_err(|e| format!("解密密钥格式错误：{}", e))?;
            if bytes.len() == 32 {
                let mut arr = [0u8; 32];
                arr.copy_from_slice(&bytes);
                return Ok(arr);
            }
        }
    }
    // 首次生成
    let mut key = [0u8; 32];
    use rand::RngCore;
    rand::rngs::OsRng.fill_bytes(&mut key);
    std::fs::create_dir_all(pmtool_dir()).map_err(|e| format!("创建 .pmtool 目录失败：{}", e))?;
    std::fs::write(key_path, hex::encode(key)).map_err(|e| format!("写入密钥文件失败：{}", e))?;
    Ok(key)
}

pub fn credential_set_password(password: &str) -> Result<(), String> {
    if password.is_empty() {
        return Err("密码不能为空".to_string());
    }
    let key = load_or_create_key()?;
    let cipher = ChaCha20Poly1305::new(Key::from_slice(&key));
    let mut nonce_arr = [0u8; 12];
    use rand::RngCore;
    rand::rngs::OsRng.fill_bytes(&mut nonce_arr);
    let ciphertext = cipher
        .encrypt(Nonce::from_slice(&nonce_arr), password.as_bytes())
        .map_err(|e| format!("加密密码失败：{}", e))?;

    let cred = EncCred {
        nonce: BASE64.encode(nonce_arr),
        ciphertext: BASE64.encode(&ciphertext),
    };
    std::fs::create_dir_all(pmtool_dir()).map_err(|e| format!("创建 .pmtool 目录失败：{}", e))?;
    std::fs::write(
        pmtool_dir().join(WEBDAV_CRED_FILE),
        serde_json::to_string_pretty(&cred).map_err(|e| e.to_string())?,
    )
    .map_err(|e| format!("写入凭据文件失败：{}", e))
}

pub fn credential_get_password() -> Result<String, String> {
    let cred_path = pmtool_dir().join(WEBDAV_CRED_FILE);
    if !cred_path.exists() {
        return Err("未配置密码".to_string());
    }
    let s = std::fs::read_to_string(&cred_path).map_err(|e| format!("读取凭据文件失败：{}", e))?;
    let cred: EncCred = serde_json::from_str(&s).map_err(|e| format!("凭据文件格式错误：{}", e))?;
    let nonce = BASE64.decode(&cred.nonce).map_err(|e| format!("nonce 解码失败：{}", e))?;
    let ciphertext = BASE64.decode(&cred.ciphertext).map_err(|e| format!("密文解码失败：{}", e))?;
    let key = load_or_create_key()?;
    let cipher = ChaCha20Poly1305::new(Key::from_slice(&key));
    let plain = cipher
        .decrypt(Nonce::from_slice(&nonce), ciphertext.as_ref())
        .map_err(|_| "密码解密失败（密钥不匹配）".to_string())?;
    String::from_utf8(plain).map_err(|e| format!("密码不是合法 UTF-8：{}", e))
}

pub fn credential_has_password() -> bool {
    pmtool_dir().join(WEBDAV_CRED_FILE).exists()
}

pub fn credential_delete_password() -> Result<(), String> {
    let p = pmtool_dir().join(WEBDAV_CRED_FILE);
    if p.exists() {
        std::fs::remove_file(&p).map_err(|e| format!("删除凭据文件失败：{}", e))?;
    }
    Ok(())
}

fn last_backup_at() -> Option<String> {
    let p = crate::workdir::pmtool_base_dir().join("webdav_last_backup.json");
    p.exists().then(|| std::fs::read_to_string(&p).unwrap_or_default())
}

pub fn set_last_backup_at(ts: &str) -> Result<(), String> {
    let p = crate::workdir::pmtool_base_dir().join("webdav_last_backup.json");
    if let Some(dir) = p.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("创建工作目录失败：{}", e))?;
    }
    std::fs::write(p, ts).map_err(|e| format!("记录备份时间失败：{}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_record(id: &str) -> LicenseHistoryRecord {
        LicenseHistoryRecord {
            id: id.to_string(),
            device_id: "device-001".to_string(),
            order_no: "ORD-1".to_string(),
            license: "PMT1-XXXX-XXXX".to_string(),
            license_type: "DAYS_365".to_string(),
            start_time: "2026-01-01T00:00:00+00:00".to_string(),
            expire_time: "2027-01-01T00:00:00+00:00".to_string(),
            created_at: "2026-01-01T00:00:00+00:00".to_string(),
        }
    }

    #[test]
    fn parse_multistatus_extracts_backup_files() {
        // 模拟 WebDAV PROPFIND (Depth=1) 的多状态 XML 响应，带 d: 命名空间前缀
        let xml = r#"<?xml version="1.0"?>
<d:multistatus xmlns:d="DAV:">
  <d:response>
    <d:href>/dav/Sync/pmtool/</d:href>
    <d:propstat><d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop></d:propstat>
  </d:response>
  <d:response>
    <d:href>/dav/Sync/pmtool/pmtool-license-backup-20260914144951.json</d:href>
    <d:propstat><d:prop>
      <d:getcontentlength>273</d:getcontentlength>
      <d:getlastmodified>Tue, 14 Sep 2026 21:49:51 GMT</d:getlastmodified>
    </d:prop></d:propstat>
  </d:response>
  <d:response>
    <d:href>/dav/Sync/pmtool/pmtool-license-backup-20260914_223650.json</d:href>
    <d:propstat><d:prop>
      <d:getcontentlength>1156</d:getcontentlength>
      <d:getlastmodified>Tue, 14 Sep 2026 22:36:50 GMT</d:getlastmodified>
    </d:prop></d:propstat>
  </d:response>
</d:multistatus>"#;

        // 复用解析核心：从一个字符串解析出远程文件列表
        let items = parse_multistatus(xml);
        assert_eq!(items.len(), 2, "应解析出 2 个备份文件，实际 {:?}", items.iter().map(|i| &i.name).collect::<Vec<_>>());
        assert_eq!(items[0].name, "pmtool-license-backup-20260914144951.json");
        assert_eq!(items[0].size, 273);
        assert_eq!(items[1].name, "pmtool-license-backup-20260914_223650.json");
        assert_eq!(items[1].size, 1156);
        assert!(items[0].modified.is_some(), "应带修改时间");
    }

    #[test]
    fn export_contains_full_records() {
        // 直接构造 payload 校验导出结构，避免写真实 home 目录
        let records = vec![sample_record("id-1")];
        let payload = BackupPayload { records: records.clone() };
        let raw = serde_json::to_vec(&payload).unwrap();
        let checksum = checksum_of(&raw);
        let backup = LicenseBackup {
            format: BACKUP_FORMAT.to_string(),
            version: BACKUP_VERSION,
            exported_at: "now".to_string(),
            app: "LicenseGenerator".to_string(),
            checksum: checksum.clone(),
            payload,
        };
        let json = serde_json::to_string(&backup).unwrap();
        let parsed = parse_backup(&json).expect("应通过格式/版本/校验和校验");
        assert_eq!(parsed.payload.records.len(), 1);
        assert_eq!(parsed.payload.records[0].id, "id-1");
        assert_eq!(parsed.checksum, checksum);
    }

    #[test]
    fn import_merges_by_id_and_dedups() {
        // 先在本地放一条 id-1；再用含 id-1(重复) + id-2(新增) 的备份合并
        // 因 import 写真实 ~/.pmtool，这里直接测 same_record / 策略逻辑
        let a = sample_record("id-1");
        let b = sample_record("id-1");
        assert!(same_record(&a, &b), "同 id 同内容应为重复");

        let mut b2 = sample_record("id-1");
        b2.license = "CHANGED".to_string();
        assert!(!same_record(&a, &b2), "同 id 不同内容应为冲突");

        let c = sample_record("id-2");
        assert!(!same_record(&a, &c), "不同 id 应为新增");
    }

    #[test]
    fn server_a_to_b_migration_restores_records() {
        // 场景：授权生成器 A 生成记录 → 导出 → 授权生成器 B 导入 → 完整恢复，并对重复导入去重
        // 用隔离的 HOME 目录模拟两台服务器
        let tmp = std::env::temp_dir().join(format!("lg_e2e_{}_{}", std::process::id(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        std::fs::create_dir_all(&tmp).unwrap();

        // A：写入一条记录，导出
        let home_a = tmp.join("a");
        std::env::set_var("HOME", &home_a);
        std::fs::create_dir_all(&home_a).unwrap();
        let rec_a = sample_record("mig-1");
        save_records(&[rec_a]).expect("A 写入记录");

        let exported = export_to_string().expect("A 导出");
        let parsed = parse_backup(&exported).expect("A 导出应通过校验");
        assert_eq!(parsed.payload.records.len(), 1);

        // B：空环境，导入
        let home_b = tmp.join("b");
        std::env::set_var("HOME", &home_b);
        std::fs::create_dir_all(&home_b).unwrap();
        let report = import(&parsed).expect("B 导入");
        assert_eq!(report.added, 1);
        assert_eq!(report.skipped_duplicates, 0);
        assert_eq!(report.conflicts, 0);

        // B 记录完整恢复
        let b_records = load_records();
        assert_eq!(b_records.len(), 1);
        assert_eq!(b_records[0].id, "mig-1");
        assert_eq!(b_records[0].device_id, "device-001");
        assert_eq!(b_records[0].license_type, "DAYS_365");

        // 重复导入：不产生重复
        let r2 = import(&parsed).expect("B 重复导入");
        assert_eq!(r2.added, 0);
        assert_eq!(r2.skipped_duplicates, 1);
        assert_eq!(load_records().len(), 1, "重复导入不得产生多余记录");

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn invalid_backups_rejected() {
        assert!(parse_backup("not json").is_err(), "非法 JSON 必须拒绝");

        let wrong_format = r#"{"format":"other","version":1,"exported_at":"x","app":"g","checksum":"","payload":{"records":[]}}"#;
        assert!(parse_backup(wrong_format).is_err(), "错误格式签名必须拒绝");

        let too_new = r#"{"format":"pmtool-license-generator-backup","version":999,"exported_at":"x","app":"g","checksum":"","payload":{"records":[]}}"#;
        assert!(parse_backup(too_new).is_err(), "过新版本必须拒绝");

        // 校验和篡改：先构造合法备份，改 content 但保留旧 checksum
        let payload = BackupPayload { records: vec![sample_record("id-1")] };
        let raw = serde_json::to_vec(&payload).unwrap();
        let checksum = checksum_of(&raw);
        let mut backup = LicenseBackup {
            format: BACKUP_FORMAT.to_string(),
            version: BACKUP_VERSION,
            exported_at: "now".to_string(),
            app: "LicenseGenerator".to_string(),
            checksum: checksum.clone(),
            payload,
        };
        backup.payload.records.clear(); // 篡改内容，保留旧校验和
        let json = serde_json::to_string(&backup).unwrap();
        assert!(parse_backup(&json).is_err(), "校验和不匹配必须拒绝");
    }

    #[test]
    fn credential_encrypted_roundtrip() {
        // 用隔离 HOME,避免写真实 ~/.pmtool
        let tmp = std::env::temp_dir().join(format!("cred_rt_{}_{}", std::process::id(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        std::fs::create_dir_all(&tmp).unwrap();
        std::env::set_var("HOME", &tmp);

        assert!(!credential_has_password(), "初始不应有密码");
        credential_set_password("super-secret-123").expect("设置密码失败");
        assert!(credential_has_password());
        assert_eq!(credential_get_password().unwrap(), "super-secret-123", "roundtrip 失败");

        // 密文文件不得含明文
        let cred = std::fs::read_to_string(tmp.join(".pmtool").join("webdav_cred.json")).unwrap();
        assert!(!cred.contains("super-secret-123"), "密文不得含明文: {}", cred);

        credential_delete_password().unwrap();
        assert!(!credential_has_password(), "删除后不应再有密码");

        let _ = std::fs::remove_dir_all(&tmp);
    }
}