use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use ed25519_dalek::{Signature, Signer, SECRET_KEY_LENGTH, PUBLIC_KEY_LENGTH};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use uuid::Uuid;

// ============== Key Management ==============

fn get_pmtool_dir() -> PathBuf {
    dirs::home_dir()
        .expect("Home directory not found")
        .join(".pmtool")
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
    state: tauri::State<Mutex<()>>,
) -> std::result::Result<String, String> {
    let _guard = state.lock().map_err(|e| e.to_string())?;

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

// ============== Main Entry ==============

fn main() {
    tauri::Builder::default()
        .manage(Mutex::new(()))
        .invoke_handler(tauri::generate_handler![
            check_key_status,
            generate_license_command,
            list_license_history,
            delete_license_history
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
        let (signing_key, _verifying_key) = load_key_pair().expect("密钥对加载/生成失败");

        let payload = create_license_payload(
            "device-test-001".to_string(),
            "DAYS_365".to_string(),
            "2026-09-03T00:00:00+00:00".to_string(),
            "2027-09-03T00:00:00+00:00".to_string(),
        );

        let license = build_license_string(&payload, &signing_key).expect("授权码生成失败");

        assert!(license.starts_with("PMT1-"), "授权码应以 PMT1- 开头: {}", license);
        let clean = license.replace("-", "");
        assert!(clean.starts_with("PMT1"), "去连字符后应保留 PMT1 前缀");
        assert!(clean.len() > 200, "授权码长度应健康，实际 {}", clean.len());
    }
}
