/**
 * Ed25519 授权端到端集成测试
 *
 * 覆盖：hex PEM 公钥分支（跟真实 generator_public.pem 一致）+ 用真实密钥对
 * 完成「生成授权码 → 主应用 verify() 验证签名 → 解析 payload → 设备/产品校验」闭环。
 *
 * 说明：本测试依赖 `~/.pmtool` 真实 Ed25519 密钥对。若不存在，先运行
 * license-generator 的 `cargo test test_build_license_end_to_end` 生成。
 */

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use ed25519_dalek::Signer;
use serde::{Deserialize, Serialize};

/// 与 license-generator/src-tauri/src/main.rs 对齐的 LicensePayload
#[derive(Debug, Clone, Serialize, Deserialize)]
struct LicensePayload {
    product: String,
    license_id: String,
    device_id: String,
    license_type: String,
    start_time: String,
    expire_time: String,
}

/// 读取真实公钥来自 ~/.pmtool（hex PEM，跟主应用 generator_public.pem 同值）
fn read_public_key_pem() -> Option<String> {
    let home = std::env::home_dir().expect("home dir");
    let path = home.join(".pmtool").join("license_generator_public.pem");
    std::fs::read_to_string(path).ok()
}

/// 密钥对是否可用（未运行过 generator 的机器上跳过该端到端测试）
fn keypair_available() -> bool {
    read_public_key_pem().is_some()
}

/// 复刻主应用 verify()：去连字符 + PMT1 前缀 + 固定 171 切分 + 对 encoded 字节验签
fn verify_via_pem(pem: &str, license: &str) -> Result<LicensePayload, String> {
    use ed25519_dalek::{Signature, VerifyingKey};

    let key_lines: Vec<&str> = pem
        .lines()
        .filter(|l| !l.starts_with("-----"))
        .collect();
    let content = key_lines.join("");

    // hex PEM 分支（真实格式）
    assert!(
        content.chars().all(|c| c.is_ascii_hexdigit()) && content.len() == 64,
        "预期 hex PEM 公钥，实际: {}",
        content
    );
    let key_bytes = hex::decode(&content).expect("hex 解码");
    let key_arr: [u8; 32] = key_bytes.try_into().expect("32 字节公钥");
    let vk = VerifyingKey::from_bytes(&key_arr).expect("VerifyingKey");

    let clean = license.replace("-", "").replace(" ", "");
    assert!(clean.starts_with("PMT1"), "缺少 PMT1 前缀");
    let data_part = &clean[4..];
    assert!(data_part.len() >= 171, "数据不完整");

    let (sig_b64, encoded) = data_part.split_at(171);
    let sig_hex = URL_SAFE_NO_PAD
        .decode(sig_b64)
        .map_err(|e| format!("sig b64 解码: {}", e))?;
    let sig_bytes = hex::decode(&sig_hex).map_err(|e| format!("sig hex 解码: {}", e))?;
    let sig_arr: [u8; 64] = sig_bytes.try_into().map_err(|_| "签名非 64 字节")?;
    let signature = Signature::from_bytes(&sig_arr);

    // 关键：对 encoded 字符串字节验签（与生成端 sign(encoded.as_bytes()) 一致）
    use ed25519_dalek::Verifier;
    vk.verify(encoded.as_bytes(), &signature)
        .map_err(|e| format!("验签失败: {}", e))?;

    let json_bytes = URL_SAFE_NO_PAD
        .decode(encoded)
        .map_err(|e| format!("encoded b64 解码: {}", e))?;
    serde_json::from_slice::<LicensePayload>(&json_bytes).map_err(|e| format!("JSON 解析: {}", e))
}

#[test]
fn test_ed25519_e2e_real_keypair() {
    // 从 ~/.pmtool 读取真实公钥 + 私钥（私钥仅测试内造授权码用）
    // 未运行过 generator 的机器上跳过（环境依赖，非逻辑失败）
    if !keypair_available() {
        eprintln!("[SKIP] ~/.pmtool 密钥对不存在，跳过端到端测试");
        return;
    }
    let home = std::env::home_dir().expect("home dir");
    let private_path = home.join(".pmtool").join("license_generator_private.pem");
    let public_pem = read_public_key_pem().expect("读公钥");

    let private_pem = std::fs::read_to_string(&private_path).expect("读私钥");
    let private_hex: String = private_pem
        .lines()
        .filter(|l| !l.starts_with("-----"))
        .collect();
    let private_bytes = hex::decode(&private_hex).expect("私钥 hex 解码");
    let seed: [u8; 32] = private_bytes[..32].try_into().expect("私钥 32 字节");
    let signing_key = ed25519_dalek::SigningKey::from_bytes(&seed);

    // 构造 payload（主应用设备 ID + 365 天）
    let payload = LicensePayload {
        product: "PMTool".to_string(),
        license_id: "e2e-test-0001".to_string(),
        device_id: "device-e2e-001".to_string(),
        license_type: "DAYS_365".to_string(),
        start_time: "2026-09-03T00:00:00+00:00".to_string(),
        expire_time: "2027-09-03T00:00:00+00:00".to_string(),
    };

    // 生成授权码（复刻生成端）
    let json = serde_json::to_string(&payload).unwrap();
    let encoded = URL_SAFE_NO_PAD.encode(json.as_bytes());
    let signature = signing_key.sign(encoded.as_bytes());
    let sig_hex = hex::encode(signature.to_bytes());
    let sig_b64 = URL_SAFE_NO_PAD.encode(sig_hex);
    let license_data = format!("{}{}", sig_b64, encoded);
    let license = format!("PMT1-{}", license_data);

    // 端到端：主应用格式解析 + 验签 + payload 校验
    let parsed = verify_via_pem(&public_pem, &license).expect("主应用验签应成功");
    assert_eq!(parsed.product, "PMTool");
    assert_eq!(parsed.device_id, "device-e2e-001");
    assert_eq!(parsed.license_type, "DAYS_365");
    assert_eq!(parsed.expire_time, "2027-09-03T00:00:00+00:00");
}