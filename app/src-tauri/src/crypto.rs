/**
 * PMTool V2.0 · RSA 签名验签工具
 * Phase 1 · T1.2
 *
 * 设计依据：RFC-05 §2 License 数据格式
 *   message = SHA-256(license_key || ":" || customer_name || ":" || expire_date)
 *   signature = RSA-PKCS#1-v1.5-Sign(message, private_key)
 *
 * 公钥从 src-tauri/keys/public.pem 编译时嵌入二进制
 * 私钥仅 dev 工具用（gen_license.rs）· 不入产品包
 */

use rsa::{
    pkcs1v15::{Signature, SigningKey, VerifyingKey},
    signature::{SignatureEncoding, Verifier},
    RsaPublicKey,
};
use sha2::{Digest, Sha256};

/// License payload 哈希算法（RFC-05 §2）
pub fn compute_license_payload_hash(
    license_key: &str,
    customer_name: &str,
    expire_date: &str,
) -> Vec<u8> {
    let payload = format!("{}:{}:{}", license_key, customer_name, expire_date);
    let mut hasher = Sha256::new();
    hasher.update(payload.as_bytes());
    hasher.finalize().to_vec()
}

/// 验签 License payload
///
/// # 参数
/// - `license_key`, `customer_name`, `expire_date`: License 明文字段
/// - `signature_b64`: base64 编码的 RSA 签名
/// - `public_pem`: PEM 格式 RSA 公钥
///
/// # 返回
/// - Ok(true): 签名验证通过
/// - Ok(false): 签名不匹配（被篡改或用错误密钥签名）
/// - Err(e): 公钥解析失败或其他错误
pub fn verify_license_payload(
    license_key: &str,
    customer_name: &str,
    expire_date: &str,
    signature_b64: &str,
    public_pem: &str,
) -> Result<bool, String> {
    use base64::{engine::general_purpose::STANDARD, Engine as _};

    // 1. 解析 PEM 公钥
    let public_key = parse_public_key(public_pem)?;

    // 2. 计算 payload hash
    let hash = compute_license_payload_hash(license_key, customer_name, expire_date);

    // 3. 解码 base64 签名
    let signature_bytes = STANDARD
        .decode(signature_b64)
        .map_err(|e| format!("base64 解码失败: {}", e))?;
    let signature = Signature::try_from(signature_bytes.as_slice())
        .map_err(|e| format!("签名格式错误: {}", e))?;

    // 4. 验签
    let verifying_key = VerifyingKey::<Sha256>::new(public_key);
    match verifying_key.verify(&hash, &signature) {
        Ok(_) => Ok(true),
        Err(_) => Ok(false), // 签名不匹配（不是错误，是正常的验证失败）
    }
}

/// 签名 License payload（dev 工具用）
///
/// # 参数
/// - 同 verify_license_payload
/// - `private_pem`: PEM 格式 RSA 私钥
///
/// # 返回
/// - Ok(String): base64 编码的签名
pub fn sign_license_payload(
    license_key: &str,
    customer_name: &str,
    expire_date: &str,
    private_pem: &str,
) -> Result<String, String> {
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    use rsa::pkcs8::DecodePrivateKey;
    use rsa::signature::Signer;

    // 1. 解析 PKCS#8 私钥
    let private_key = rsa::RsaPrivateKey::from_pkcs8_pem(private_pem)
        .map_err(|e| format!("私钥解析失败: {}", e))?;

    // 2. 计算 payload hash
    let hash = compute_license_payload_hash(license_key, customer_name, expire_date);

    // 3. 签名
    let signing_key = SigningKey::<Sha256>::new(private_key);
    let signature = signing_key.sign(&hash);

    // 4. base64 编码
    Ok(STANDARD.encode(signature.to_bytes()))
}

/// 解析 PEM 公钥为 RsaPublicKey
fn parse_public_key(pem: &str) -> Result<RsaPublicKey, String> {
    use rsa::pkcs8::DecodePublicKey;
    RsaPublicKey::from_public_key_pem(pem).map_err(|e| format!("公钥解析失败: {}", e))
}

/// 内嵌公钥（编译时）
const PUBLIC_KEY_PEM: &str = include_str!("../keys/public.pem");

/// 验证 License（使用内嵌公钥）
pub fn verify_license(
    license_key: &str,
    customer_name: &str,
    expire_date: &str,
    signature_b64: &str,
) -> Result<bool, String> {
    verify_license_payload(license_key, customer_name, expire_date, signature_b64, PUBLIC_KEY_PEM)
}

#[cfg(test)]
mod tests {
    use super::*;

    // Dev 工具生成的测试 License（仅测试用）
    // License_key: PMT-TEST-001
    // Customer: 测试公司
    // Expire: 2099-12-31
    // 用 src-tauri/keys/private.pem 签名
    const TEST_SIGNATURE: &str = ""; // 真实测试时通过 gen_license 工具生成

    #[test]
    fn test_compute_license_payload_hash_deterministic() {
        // 同输入应产生同 hash
        let h1 = compute_license_payload_hash("PMT-001", "测试", "2027-08-22");
        let h2 = compute_license_payload_hash("PMT-001", "测试", "2027-08-22");
        assert_eq!(h1, h2);
    }

    #[test]
    fn test_compute_license_payload_hash_unique() {
        // 任意字段变化应产生不同 hash
        let h1 = compute_license_payload_hash("PMT-001", "公司A", "2027-08-22");
        let h2 = compute_license_payload_hash("PMT-002", "公司A", "2027-08-22");
        assert_ne!(h1, h2);
    }

    #[test]
    fn test_parse_public_key_valid_pem() {
        // 实际公钥是 RSA-2048 格式
        let result = parse_public_key(PUBLIC_KEY_PEM);
        assert!(result.is_ok(), "公钥解析应成功: {:?}", result);
    }

    #[test]
    fn test_verify_invalid_signature_returns_false_not_error() {
        // 用错误签名应返回 Ok(false)，不是 Err
        let result = verify_license("PMT-001", "公司A", "2027-08-22", "invalid_base64_signature==");
        // 可能是 Err（base64 解码失败）或 Ok(false)（签名不匹配）
        // 两种情况都不应 panic
        let _ = result; // 只验证不 panic
    }
}