// Windows release 下禁止额外控制台窗口，不要移除
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use ed25519_dalek::{Signature, Signer, SECRET_KEY_LENGTH, PUBLIC_KEY_LENGTH};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use uuid::Uuid;

mod auth_backup;
mod workdir;

// ============== Key Management ==============

fn get_pmtool_dir() -> PathBuf {
    workdir::pmtool_base_dir()
}

fn get_private_key_path() -> PathBuf {
    get_pmtool_dir().join("license_generator_private.pem")
}

fn get_public_key_path() -> PathBuf {
    get_pmtool_dir().join("license_generator_public.pem")
}

fn create_pmtool_dir() -> std::result::Result<(), String> {
    let pmtool_dir = get_pmtool_dir();
    if !pmtool_dir.exists() {
        fs::create_dir_all(&pmtool_dir)
            .map_err(|e| format!("Failed to create .pmtool directory: {}", e))?;
    }
    Ok(())
}

pub fn generate_key_pair() -> std::result::Result<(ed25519_dalek::SigningKey, ed25519_dalek::VerifyingKey), String> {
    create_pmtool_dir()?;

    let mut csprng = rand::thread_rng();
    let signing_key = ed25519_dalek::SigningKey::generate(&mut csprng);
    let verifying_key = signing_key.verifying_key();

    let private_key_bytes: [u8; SECRET_KEY_LENGTH] = *signing_key.as_bytes();
    let private_pem = format!(
        "-----BEGIN ED25519 PRIVATE KEY-----\n{}\n-----END ED25519 PRIVATE KEY-----",
        hex::encode(private_key_bytes)
    );
    fs::write(get_private_key_path(), &private_pem)
        .map_err(|e| format!("Failed to write private key: {}", e))?;

    let public_key_bytes: [u8; PUBLIC_KEY_LENGTH] = *verifying_key.as_bytes();
    let public_pem = format!(
        "-----BEGIN ED25519 PUBLIC KEY-----\n{}\n-----END ED25519 PUBLIC KEY-----",
        hex::encode(public_key_bytes)
    );
    fs::write(get_public_key_path(), &public_pem)
        .map_err(|e| format!("Failed to write public key: {}", e))?;

    Ok((signing_key, verifying_key))
}

pub fn load_key_pair() -> std::result::Result<(ed25519_dalek::SigningKey, ed25519_dalek::VerifyingKey), String> {
    if !get_private_key_path().exists() || !get_public_key_path().exists() {
        return generate_key_pair();
    }

    let private_pem = fs::read_to_string(get_private_key_path())
        .map_err(|e| format!("Failed to read private key: {}", e))?;
    let private_hex = private_pem
        .lines()
        .filter(|line| !line.starts_with("-----"))
        .collect::<Vec<_>>()
        .join("");
    let private_bytes = hex::decode(&private_hex)
        .map_err(|e| format!("Failed to decode private key hex: {}", e))?;
    let mut private_array = [0u8; SECRET_KEY_LENGTH];
    private_array.copy_from_slice(&private_bytes[..SECRET_KEY_LENGTH]);
    let signing_key = ed25519_dalek::SigningKey::from_bytes(&private_array);

    let public_pem = fs::read_to_string(get_public_key_path())
        .map_err(|e| format!("Failed to read public key: {}", e))?;
    let public_hex = public_pem
        .lines()
        .filter(|line| !line.starts_with("-----"))
        .collect::<Vec<_>>()
        .join("");
    let public_bytes = hex::decode(&public_hex)
        .map_err(|e| format!("Failed to decode public key hex: {}", e))?;
    let mut public_array = [0u8; PUBLIC_KEY_LENGTH];
    public_array.copy_from_slice(&public_bytes[..PUBLIC_KEY_LENGTH]);
    let verifying_key = ed25519_dalek::VerifyingKey::from_bytes(&public_array)
        .map_err(|e| format!("Failed to create verifying key: {}", e))?;

    Ok((signing_key, verifying_key))
}

pub fn key_exists() -> bool {
    get_private_key_path().exists() && get_public_key_path().exists()
}

// ============== Simplified License Payload ==============

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LicensePayload {
    pub product: String,
    pub license_id: String,
    pub device_id: String,
    pub license_type: String,
    pub start_time: String,
    pub expire_time: String,
}

impl LicensePayload {
    pub fn new(
        device_id: String,
        license_type: String,
        start_time: String,
        expire_time: String,
    ) -> Self {
        Self {
            product: "PMTool".to_string(),
            license_id: Uuid::new_v4().to_string(),
            device_id,
            license_type,
            start_time,
            expire_time,
        }
    }
}

// ============== License Generation ==============

fn create_license_payload(
    device_id: String,
    license_type: String,
    start_time: String,
    expire_time: String,
) -> LicensePayload {
    LicensePayload::new(device_id, license_type, start_time, expire_time)
}

fn build_license_string(
    payload: &LicensePayload,
    signing_key: &ed25519_dalek::SigningKey,
) -> std::result::Result<String, String> {
    let json = serde_json::to_string(payload)
        .map_err(|e| format!("Failed to serialize payload: {}", e))?;

    let encoded = URL_SAFE_NO_PAD.encode(json.as_bytes());

    let signature: Signature = signing_key.sign(encoded.as_bytes());

    let sig_hex = hex::encode(signature.to_bytes());
    let sig_b64 = URL_SAFE_NO_PAD.encode(sig_hex);

    let license_data = format!("{}{}", sig_b64, encoded);
    let formatted = format_license_with_dashes(&license_data);

    Ok(format!("PMT1-{}", formatted))
}

fn format_license_with_dashes(data: &str) -> String {
    let chunks: Vec<String> = data
        .chars()
        .collect::<Vec<_>>()
        .chunks(5)
        .map(|c| c.iter().collect::<String>())
        .collect();
    chunks.join("-")
}

// ============== Tauri Commands ==============

#[tauri::command]
fn check_key_status() -> std::result::Result<bool, String> {
    Ok(key_exists())
}

#[tauri::command]
fn generate_license_command(
    device_id: String,
    duration_days: i32,
    startDate: String,
    expireDate: Option<String>,
    order_no: String,
    state: tauri::State<Mutex<()>>,
) -> std::result::Result<String, String> {
    let _guard = state.lock().map_err(|e| e.to_string())?;

    if order_no.trim().is_empty() {
        return Err("请填写订单编号".to_string());
    }

    let (signing_key, _verifying_key) = load_key_pair()?;

    let start_time = chrono::DateTime::parse_from_rfc3339(&startDate)
        .map_err(|e| format!("Invalid start date: {}", e))?;

    let (license_type, expire_time) = if duration_days == 0 {
        // 永久授权
        ("PERPETUAL".to_string(), "".to_string())
    } else {
        match &expireDate {
            Some(e) => {
                // 使用前端真实填写的到期时间（预设自动联动 / 自定义均可）
                let expire = chrono::DateTime::parse_from_rfc3339(e)
                    .map_err(|er| format!("Invalid expire date: {}", er))?;
                let days = (expire - start_time).num_days();
                if days <= 0 {
                    return Err("到期日期需晚于开始日期".to_string());
                }
                (format!("DAYS_{}", days), expire.to_rfc3339())
            }
            None => {
                // 旧调用兜底：按开始 + 天数推算
                let expire = start_time + chrono::Duration::days(duration_days as i64);
                (format!("DAYS_{}", duration_days), expire.to_rfc3339())
            }
        }
    };

    let payload = create_license_payload(
        device_id,
        license_type,
        start_time.to_rfc3339(),
        expire_time,
    );

    let license = build_license_string(&payload, &signing_key)?;

    // 落盘一条授权记录：机器码 / 授权码 / 期限 / 起止 / 生成时间
    let mut records = load_history();
    records.push(LicenseHistoryRecord {
        id: payload.license_id.clone(),
        device_id: payload.device_id.clone(),
        order_no: order_no.trim().to_string(),
        license: license.clone(),
        license_type: payload.license_type.clone(),
        start_time: payload.start_time.clone(),
        expire_time: payload.expire_time.clone(),
        created_at: chrono::Utc::now().to_rfc3339(),
    });
    save_history(&records)?;

    Ok(license)
}

// ============== License Issue History ==============

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LicenseHistoryRecord {
    pub id: String,
    pub device_id: String,
    #[serde(default)]
    pub order_no: String,
    pub license: String,
    pub license_type: String,
    pub start_time: String,
    pub expire_time: String,
    pub created_at: String,
}

fn get_history_path() -> PathBuf {
    get_pmtool_dir().join("issue_history.json")
}

fn load_history() -> Vec<LicenseHistoryRecord> {
    let path = get_history_path();
    if !path.exists() {
        return Vec::new();
    }
    match fs::read_to_string(&path) {
        Ok(s) => serde_json::from_str(&s).unwrap_or_default(),
        Err(_) => Vec::new(),
    }
}

fn save_history(records: &[LicenseHistoryRecord]) -> std::result::Result<(), String> {
    create_pmtool_dir()?;
    let json = serde_json::to_string_pretty(records).map_err(|e| e.to_string())?;
    fs::write(get_history_path(), json).map_err(|e| format!("写入授权历史失败: {}", e))
}

/// 列出全部授权记录（新生成的在前）。
#[tauri::command]
fn list_license_history() -> Vec<LicenseHistoryRecord> {
    let mut records = load_history();
    records.reverse();
    records
}

/// 按 id 删除一条授权记录。
#[tauri::command]
fn delete_license_history(id: String, state: tauri::State<Mutex<()>>) -> std::result::Result<(), String> {
    let _guard = state.lock().map_err(|e| e.to_string())?;
    let mut records = load_history();
    let before = records.len();
    records.retain(|r| r.id != id);
    if records.len() == before {
        return Err("未找到该记录".to_string());
    }
    save_history(&records)
}

// ============== 授权记录导出 / 导入 ==============

/// 弹出保存对话框，返回用户选择的路径（导出授权记录用）
#[tauri::command]
fn pick_save_path(title: String, ext: String, default_name: String) -> Option<String> {
    use rfd::FileDialog;
    let mut dlg = FileDialog::new()
        .set_title(&title)
        .add_filter("授权备份", &[&ext]);
    if !default_name.is_empty() {
        dlg = dlg.set_file_name(&default_name);
    }
    dlg.save_file().map(|p| p.to_string_lossy().to_string())
}

/// 导出授权记录到指定文件路径，返回备份概要
#[tauri::command]
fn export_records_to_file(file_path: String) -> Result<auth_backup::BackupPreview, String> {
    let content = auth_backup::export_to_string()?;
    std::fs::write(&file_path, &content).map_err(|e| format!("写入备份文件失败：{}", e))?;
    auth_backup::preview(&content)
}

/// 预览授权记录备份（导入前恢复确认用）
#[tauri::command]
fn preview_backup(content: String) -> Result<auth_backup::BackupPreview, String> {
    auth_backup::preview(&content)
}

/// 导入授权记录（校验后按 license_id 并集合并，重复跳过、冲突不覆盖）
#[tauri::command]
fn import_records(content: String) -> Result<auth_backup::ImportReport, String> {
    let backup = auth_backup::parse_backup(&content)?;
    auth_backup::import(&backup)
}

// ============== WebDAV 远程备份 ==============

/// 读取 WebDAV 配置（密码只回传「已配置」+ 占位）
#[tauri::command]
fn get_webdav_config() -> Result<auth_backup::WebdavConfigView, String> {
    auth_backup::cfg_view()
}

/// 保存 WebDAV 配置。password: Some(非空)=设新密码, Some("")=清空, None=保持不变
#[tauri::command]
fn set_webdav_config(url: String, username: String, remote_dir: String, auto_backup: bool, password: Option<String>) -> Result<(), String> {
    eprintln!("[DIAG] set_webdav_config called: url_len={} user_len={} dir_len={} auto={} pw={}",
        url.len(), username.len(), remote_dir.len(), auto_backup,
        password.as_deref().map(|p| format!("Some(len={})", p.len())).unwrap_or_else(|| "None".into()));
    let mut cfg = auth_backup::load_cfg();
    cfg.url = url.trim().to_string();
    cfg.username = username.trim().to_string();
    cfg.remote_dir = remote_dir.trim().to_string();
    cfg.auto_backup = auto_backup;
    auth_backup::save_cfg(&cfg)?;

    match password.as_deref() {
        Some(pw) if !pw.is_empty() => auth_backup::credential_set_password(pw)?,
        Some(_) => auth_backup::credential_delete_password().map_err(|e| e.to_string())?,
        None => {}
    }
    Ok(())
}

/// 测试 WebDAV 连接
#[tauri::command]
fn test_webdav_connection() -> Result<auth_backup::TestResult, String> {
    Ok(auth_backup::test_connection())
}

/// 列远程目录下的备份文件
#[tauri::command]
fn list_webdav_backups() -> Result<Vec<auth_backup::RemoteBackupItem>, String> {
    auth_backup::list_remote_backups()
}

/// 立即备份授权记录到 WebDAV
#[tauri::command]
fn backup_to_webdav() -> Result<auth_backup::UploadResult, String> {
    let content = auth_backup::export_to_string()?;
    let stamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
    let filename = format!("pmtool-license-backup-{}.json", stamp);

    // 先测连接，避免把内容发到坏目标
    let test = auth_backup::test_connection();
    if !test.ok {
        return Err(format!("备份前连接检查未通过：{}", test.message));
    }
    let result = auth_backup::upload(&filename, content.as_bytes())?;
    auth_backup::set_last_backup_at(&chrono::Utc::now().to_rfc3339()).ok();
    Ok(result)
}

/// 预览 WebDAV 上的备份（恢复前确认）
#[tauri::command]
fn preview_webdav_backup(filename: String) -> Result<auth_backup::BackupPreview, String> {
    let bytes = auth_backup::download(&filename)?;
    let content = String::from_utf8(bytes).map_err(|e| format!("远程备份不是合法文本：{}", e))?;
    auth_backup::preview(&content)
}

/// 从 WebDAV 恢复（确认后调用，并集合并）
#[tauri::command]
fn restore_from_webdav(filename: String) -> Result<auth_backup::ImportReport, String> {
    let bytes = auth_backup::download(&filename)?;
    let content = String::from_utf8(bytes).map_err(|e| format!("远程备份不是合法文本：{}", e))?;
    let backup = auth_backup::parse_backup(&content)?;
    auth_backup::import(&backup)
}

/// 双向同步：下载远程 → 与本地按 license_id 并集合并 → 写回本地 → 上传合并结果
/// 冲突（同 id 不同内容）不覆盖本地，计数上报。
#[tauri::command]
fn sync_webdav(filename: String) -> Result<auth_backup::ImportReport, String> {
    // 1. 先上传当前，确保远程含本地已有
    let local_content = auth_backup::export_to_string()?;
    {
        let test = auth_backup::test_connection();
        if !test.ok {
            return Err(format!("同步前连接检查未通过：{}", test.message));
        }
    }
    auth_backup::upload(&filename, local_content.as_bytes())?;

    // 2. 下载合并
    let bytes = auth_backup::download(&filename)?;
    let remote_content = String::from_utf8(bytes).map_err(|e| format!("远程数据不是合法文本：{}", e))?;
    let backup = auth_backup::parse_backup(&remote_content)?;
    let report = auth_backup::import(&backup)?;

    // 3. 再把合并结果上传，保证两端一致
    let merged = auth_backup::export_to_string()?;
    auth_backup::upload(&filename, merged.as_bytes())?;

    auth_backup::set_last_backup_at(&chrono::Utc::now().to_rfc3339()).ok();
    Ok(report)
}

// ============== 工作目录（首次打开自选） ==============

#[tauri::command]
fn get_workdir_status() -> (bool, String) {
    let set = workdir::is_workdir_set();
    let dir = workdir::pmtool_base_dir();
    (set, dir.to_string_lossy().to_string())
}

#[tauri::command]
fn pick_workdir() -> Result<Option<String>, String> {
    let dir = rfd::FileDialog::new()
        .set_title("选择 PMTool 授权工作目录")
        .pick_folder();
    Ok(dir.map(|p| p.to_string_lossy().to_string()))
}

#[tauri::command]
fn set_workdir(path: String) -> Result<String, String> {
    let target = PathBuf::from(path.trim());
    std::fs::create_dir_all(&target).map_err(|e| format!("目录不可写：{}", e))?;
    workdir::write_workdir_override(path.trim())
        .map_err(|e| format!("保存工作目录失败：{}", e))?;
    Ok("已设置工作目录".to_string())
}

// ============== Main Entry ==============

fn main() {
    tauri::Builder::default()
        .manage(Mutex::new(()))
        .invoke_handler(tauri::generate_handler![
            check_key_status,
            generate_license_command,
            list_license_history,
            delete_license_history,
            pick_save_path,
            export_records_to_file,
            preview_backup,
            import_records,
            get_webdav_config,
            set_webdav_config,
            test_webdav_connection,
            list_webdav_backups,
            backup_to_webdav,
            preview_webdav_backup,
            restore_from_webdav,
            sync_webdav,
            get_workdir_status,
            pick_workdir,
            set_workdir
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 端到端：加载/生成密钥对 + 用真实 build_license_string 生成授权码
    /// 产物应满足 PMT1 前缀 + 健康长度，并落盘真实密钥对到 ~/.pmtool
    #[test]
    fn test_build_license_end_to_end() {
        // 用隔离 HOME，避免写真实 ~/.pmtool（与 credential 测试避免并行竞争）
        let tmp = std::env::temp_dir().join(format!(
            "lic_e2e_{}_{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&tmp).unwrap();
        let old_home = std::env::var_os("HOME");
        std::env::set_var("HOME", &tmp);

        let result = (|| -> Result<(), String> {
            let (signing_key, _verifying_key) = load_key_pair().map_err(|e| e.to_string())?;

            let payload = create_license_payload(
                "device-test-001".to_string(),
                "DAYS_365".to_string(),
                "2026-09-03T00:00:00+00:00".to_string(),
                "2027-09-03T00:00:00+00:00".to_string(),
            );

            let license = build_license_string(&payload, &signing_key).map_err(|e| e.to_string())?;

            assert!(license.starts_with("PMT1-"), "授权码应以 PMT1- 开头: {}", license);
            let clean = license.replace("-", "");
            assert!(clean.starts_with("PMT1"), "去连字符后应保留 PMT1 前缀");
            assert!(clean.len() > 200, "授权码长度应健康，实际 {}", clean.len());
            Ok(())
        })();

        // 恢复真实 HOME 并清理临时目录
        if let Some(h) = old_home {
            std::env::set_var("HOME", h);
        } else {
            std::env::remove_var("HOME");
        }
        let _ = std::fs::remove_dir_all(&tmp);

        result.expect("授权码端到端生成失败");
    }
}
