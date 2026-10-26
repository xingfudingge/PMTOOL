/**
 * PMTool · 授权数据验证工具 (Ed25519)
 *
 * 功能:
 * 1. 授权字符串解码
 * 2. Ed25519 签名验证
 * 3. 授权数据解析
 * 4. 设备 ID 匹配验证
 * 5. 有效期验证
 *
 * 格式（与 license-generator/src-tauri/src/main.rs 对齐）:
 *   license = "PMT1" + sig_b64 + encoded，每 5 字符加 "-"
 *   sig_b64 = base64url_no_pad( hex( signature ) )   长度固定 171 字符
 *   encoded = base64url_no_pad( json(payload) )
 *   签名对象 = encoded 的字符串字节（与生成端 sign(encoded.as_bytes()) 一致）
 */

use base64::Engine;
use ed25519_dalek::{Signature, VerifyingKey, PUBLIC_KEY_LENGTH, SIGNATURE_LENGTH, Verifier};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;

/// 签名段固定长度：base64url_no_pad(hex(64 字节签名)) = base64url_no_pad(128 字节) = 171 字符
const SIG_B64_LEN: usize = 171;

/// 本软件的产品码 —— 必须与授权管理平台里创建的产品码一致。
/// 授权码签名里带 product 字段，校验时做第二道比对：
/// 即使别的软件的私钥泄露、被拿来给本软件的授权码签名，产品码不符也会被拒绝。
pub const PRODUCT_CODE: &str = "PMTOOL";

/// 授权码前缀（授权管理平台 v1 协议：LC1 = License Center 1）
pub const LICENSE_PREFIX: &str = "LC1";

/// 旧前缀（原 PMTool License Generator 签发，已停用；仅用于兼容解析/错误提示）
pub const LEGACY_PREFIX: &str = "PMT1";

/// 旧单 PEM 路径专用的占位 kid。
///
/// `from_public_pem` 仍保留给历史测试/迁移代码使用；这些调用方构造的授权码
/// 没有 `kid` 字段，解析后 kid 为空串，因此把 PEM 公钥登记在空 kid 下。
/// 生产路径（`from_keys_json`）不会登记空 kid，缺失/未知 kid 一律拒绝。
const LEGACY_KID: &str = "";

/// 公钥清单中的一把公钥（授权平台导出的公开信息）
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ProductKeyEntry {
    /// 密钥 ID，形如 `PMTOOL-2026-01`；写进授权码 claims.kid
    pub kid: String,
    /// Ed25519 公钥的 32 字节 hex（64 位）
    pub public_hex: String,
}

/// `product_keys.json` 的顶层结构
#[derive(Debug, Deserialize)]
struct ProductKeyManifest {
    product: String,
    keys: Vec<ProductKeyEntry>,
}

/// 授权协议版本
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProtocolVersion {
    V1,
}

impl ProtocolVersion {
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            LICENSE_PREFIX | LEGACY_PREFIX => Some(Self::V1),
            _ => None,
        }
    }

    pub fn to_str(self) -> &'static str {
        LICENSE_PREFIX
    }
}

/// 授权数据结构 (内部表示) - 与 License Generator 保持一致
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct LicensePayload {
    pub product: String,
    pub license_id: String,
    pub device_id: String,
    pub license_type: String,
    pub start_time: String,
    pub expire_time: String,
}

/// 授权验证结果
#[derive(Debug, Clone)]
pub struct LicenseVerification {
    pub valid: bool,
    pub reason: Option<String>,
    pub payload: Option<LicensePayload>,
}

/// Ed25519 授权签名验证器（持有 kid → 公钥的密钥环，支持轮换）
pub struct LicenseVerifier {
    keys: HashMap<String, VerifyingKey>,
}

impl LicenseVerifier {
    /// 空密钥环（任何 kid 都无法验签；仅用于无可信公钥时的降级构造）
    fn empty() -> Self {
        Self {
            keys: HashMap::new(),
        }
    }

    /// 从产品公钥清单 JSON 初始化验证器
    ///
    /// 清单格式（由授权平台导出，必须入库）：
    /// ```json
    /// {"product":"PMTOOL","keys":[{"kid":"PMTOOL-2026-01","public_hex":"<64 hex>"}]}
    /// ```
    ///
    /// 校验规则：JSON 可解析、product 与 `PRODUCT_CODE` 一致、keys 非空、
    /// 每把 public_hex 为 64 位 hex、kid 以 `{PRODUCT_CODE}-` 开头且不重复。
    /// 任一不满足 → `Err("公钥清单不合法：…")`。
    pub fn from_keys_json(json: &str) -> Result<Self, String> {
        let manifest: ProductKeyManifest = serde_json::from_str(json)
            .map_err(|e| format!("公钥清单不合法：JSON 解析失败（{e}）"))?;

        if manifest.product != PRODUCT_CODE {
            return Err(format!(
                "公钥清单不合法：product 为 {}，期望 {}",
                manifest.product, PRODUCT_CODE
            ));
        }
        if manifest.keys.is_empty() {
            return Err("公钥清单不合法：keys 为空".to_string());
        }

        let kid_prefix = format!("{PRODUCT_CODE}-");
        let mut keys = HashMap::new();
        for entry in manifest.keys {
            let kid = entry.kid.trim();
            if !kid.starts_with(&kid_prefix) {
                return Err(format!("公钥清单不合法：kid {kid} 必须以 {kid_prefix} 开头"));
            }
            if entry.public_hex.len() != 64
                || !entry.public_hex.chars().all(|c| c.is_ascii_hexdigit())
            {
                return Err(format!(
                    "公钥清单不合法：kid {kid} 的 public_hex 必须是 64 位 hex"
                ));
            }

            let bytes = hex::decode(&entry.public_hex).map_err(|e| {
                format!("公钥清单不合法：kid {kid} 的 public_hex 解码失败（{e}）")
            })?;
            let public_array: [u8; PUBLIC_KEY_LENGTH] = bytes
                .try_into()
                .map_err(|_| format!("公钥清单不合法：kid {kid} 的公钥长度无效"))?;
            let verifying_key = VerifyingKey::from_bytes(&public_array)
                .map_err(|e| format!("公钥清单不合法：kid {kid} 的公钥格式无效（{e}）"))?;

            if keys.insert(kid.to_string(), verifying_key).is_some() {
                return Err(format!("公钥清单不合法：kid {kid} 重复"));
            }
        }

        Ok(Self { keys })
    }

    /// 按 kid 取公钥（None = 该 kid 不在可信清单中）
    pub fn key_for_kid(&self, kid: &str) -> Option<&VerifyingKey> {
        self.keys.get(kid)
    }

    /// 从 SPKI/PEM 格式的公钥初始化验证器（兼容旧调用方，生产路径已不再使用）
    ///
    /// `generator_public.pem` 为 Ed25519 公钥的 SPKI DER 编码（base64），形如：
    ///   MCowBQYDK2VwAyEA ... （DER = 30 2a 30 05 06 03 2b 65 70 03 21 00 + 32 字节公钥）
    /// 解析时剥离 ASN.1 头，取末尾 32 字节作为 Ed25519 公钥。
    /// 由于旧 PEM 授权码没有 kid，公钥登记在 `LEGACY_KID`（空串）下。
    pub fn from_public_pem(pem: &str) -> Result<Self, String> {
        let key_lines: Vec<&str> = pem
            .lines()
            .filter(|line| !line.starts_with("-----"))
            .collect();
        let pem_content = key_lines.join("");

        // 支持两种公钥编码：
        // 1) 生成器 hex PEM：`-----BEGIN ED25519 PUBLIC KEY-----` + hex(32字节)=64 hex 字符
        // 2) 标准 SPKI/DER base64（旧 generator_public.pem 格式）
        let verifying_key = if pem_content.chars().all(|c| c.is_ascii_hexdigit())
            && pem_content.len() == 64
        {
            let bytes = hex::decode(&pem_content)
                .map_err(|e| format!("公钥 hex 解码失败：{}", e))?;
            let public_array: [u8; PUBLIC_KEY_LENGTH] = bytes
                .try_into()
                .map_err(|_| "公钥长度无效（hex 期望 32 字节）".to_string())?;
            VerifyingKey::from_bytes(&public_array)
                .map_err(|e| format!("公钥格式无效：{}", e))?
        } else {
            let der = base64::engine::general_purpose::STANDARD
                .decode(&pem_content)
                .map_err(|e| format!("公钥 Base64 解码失败：{}", e))?;
            if der.len() < 12 + PUBLIC_KEY_LENGTH {
                return Err(format!(
                    "公钥 DER 长度无效（期望至少 {} 字节）",
                    12 + PUBLIC_KEY_LENGTH
                ));
            }
            let public_bytes = &der[der.len() - PUBLIC_KEY_LENGTH..];
            let public_array: [u8; PUBLIC_KEY_LENGTH] = public_bytes
                .try_into()
                .map_err(|_| "公钥长度无效（期望 32 字节）".to_string())?;
            VerifyingKey::from_bytes(&public_array)
                .map_err(|e| format!("公钥格式无效：{}", e))?
        };

        let mut keys = HashMap::new();
        keys.insert(LEGACY_KID.to_string(), verifying_key);
        Ok(Self { keys })
    }

    /// 从文件加载公钥（兼容旧调用方；生产路径请用 `from_keys_json`）
    pub fn from_public_key_file(path: &str) -> Result<Self, String> {
        let pem = fs::read_to_string(path)
            .map_err(|e| format!("无法读取公钥文件 {}: {}", path, e))?;
        Self::from_public_pem(&pem)
    }

    /// 验证授权字符串 (与 License Generator 主实现一致)
    ///
    /// 按 `claims.kid` 从密钥环选公钥验签；kid 缺失/不在清单 → 失败。
    pub fn verify(&self, license_b64: &str) -> LicenseVerification {
        // 拆解（格式/签名数据/payload/kid）
        let parsed = match parse_license_with_kid(license_b64) {
            Ok(p) => p,
            Err(e) => {
                return LicenseVerification {
                    valid: false,
                    reason: Some(e),
                    payload: None,
                };
            }
        };

        // 按 kid 选公钥；未知 kid 直接拒绝（不做单钥回退）
        let Some(verifying_key) = self.keys.get(&parsed.kid) else {
            return LicenseVerification {
                valid: false,
                reason: Some(format!(
                    "授权码使用了未知密钥（kid={}）",
                    display_kid(&parsed.kid)
                )),
                payload: Some(parsed.payload),
            };
        };

        // 验签（对 encoded 的字符串字节验签，与生成端 sign(encoded.as_bytes()) 一致）
        if !Self::verify_with_key(verifying_key, &parsed.encoded, &parsed.signature_bytes) {
            return LicenseVerification {
                valid: false,
                reason: Some("授权码签名验证失败".to_string()),
                payload: None,
            };
        }

        let payload = parsed.payload;

        // 9. 检查有效期
        use chrono::Utc;
        let now = Utc::now();
        if !payload.expire_time.is_empty() {
            if let Ok(expire_time) = chrono::DateTime::parse_from_rfc3339(&payload.expire_time) {
                let expire_time_utc = expire_time.with_timezone(&now.timezone());
                if expire_time_utc < now {
                    return LicenseVerification {
                        valid: false,
                        reason: Some("授权已过期".to_string()),
                        payload: Some(payload),
                    };
                }
            } else {
                return LicenseVerification {
                    valid: false,
                    reason: Some("授权有效期格式错误".to_string()),
                    payload: None,
                };
            }
        }

        // 10. 验证产品
        if payload.product != PRODUCT_CODE {
            return LicenseVerification {
                valid: false,
                reason: Some(format!(
                    "授权不适用于本软件（当前软件 {PRODUCT_CODE}，授权产品 {}）",
                    payload.product
                )),
                payload: Some(payload),
            };
        }

        LicenseVerification {
            valid: true,
            reason: None,
            payload: Some(payload),
        }
    }
}

impl LicenseVerifier {
    /// 对 encoded 字节验签（旧单 PEM 流水线用；kid 为空串）
    pub fn verify_signature_bytes(&self, encoded: &str, signature_bytes: &[u8]) -> bool {
        match self.keys.get(LEGACY_KID) {
            Some(key) => Self::verify_with_key(key, encoded, signature_bytes),
            None => false,
        }
    }

    /// 按 kid 对 encoded 字节验签。
    ///
    /// - `None`：kid 不在可信密钥清单中（调用方应回报 LICENSE_KEY_UNKNOWN）
    /// - `Some(true/false)`：签名有效/无效
    pub fn verify_signature_bytes_by_kid(
        &self,
        kid: &str,
        encoded: &str,
        signature_bytes: &[u8],
    ) -> Option<bool> {
        self.keys
            .get(kid)
            .map(|key| Self::verify_with_key(key, encoded, signature_bytes))
    }

    fn verify_with_key(key: &VerifyingKey, encoded: &str, signature_bytes: &[u8]) -> bool {
        if signature_bytes.len() != SIGNATURE_LENGTH {
            return false;
        }
        let mut arr = [0u8; SIGNATURE_LENGTH];
        arr.copy_from_slice(signature_bytes);
        let signature = Signature::from_bytes(&arr);
        key.verify(encoded.as_bytes(), &signature).is_ok()
    }
}

/// 授权字符串拆解结果（含 claims.kid，供按密钥选择）
#[derive(Debug, Clone)]
pub struct ParsedLicense {
    pub encoded: String,
    pub signature_bytes: Vec<u8>,
    pub payload: LicensePayload,
    /// 签发密钥 ID；旧 PMT1 码没有该字段，为空串
    pub kid: String,
}

fn display_kid(kid: &str) -> &str {
    if kid.is_empty() {
        "<缺失>"
    } else {
        kid
    }
}

/// 拆解授权字符串为（encoded, 签名原始字节, payload, kid）
/// 供授权验证器拆分流水线复用（格式校验/签名校验/Claims/过期/设备绑定 分步判定）
///
/// # 返回
/// - Ok(ParsedLicense)
/// - Err(中文错误信息)
pub fn parse_license_with_kid(license_b64: &str) -> Result<ParsedLicense, String> {
    // 1. 移除分隔符
    let license_clean = license_b64.replace("-", "").replace(" ", "");

    // 2. 检查前缀（LC1 = 授权管理平台；PMT1 = 旧生成器，仅兼容解析）
    let data_part = if let Some(rest) = license_clean.strip_prefix(LICENSE_PREFIX) {
        rest
    } else if let Some(rest) = license_clean.strip_prefix(LEGACY_PREFIX) {
        rest
    } else {
        return Err(format!("授权码格式错误，需要以 {LICENSE_PREFIX} 开头"));
    };

    // 4. 结构：sig_b64(固定171) + encoded(不定长)
    if data_part.len() < SIG_B64_LEN {
        return Err("授权码数据不完整".to_string());
    }
    let (sig_b64, encoded) = data_part.split_at(SIG_B64_LEN);

    // 5. 解码签名：sig_b64 → base64(hex 字符) → hex → 64 字节签名
    let sig_hex = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(sig_b64)
        .map_err(|_| "授权码签名格式错误".to_string())?;
    let signature_bytes = hex::decode(&sig_hex).map_err(|_| "授权码签名格式错误".to_string())?;
    if signature_bytes.len() != SIGNATURE_LENGTH {
        return Err("授权码签名长度错误".to_string());
    }

    // 6. 解码 JSON 数据 (URL_SAFE_NO_PAD)
    let json_bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(encoded)
        .map_err(|e| format!("授权数据 Base64 解码失败：{}", e))?;

    // 7. 解析 payload + kid
    //    先用 Value 取 kid（旧码无该字段 → 空串），再按既有结构解析 payload；
    //    serde 默认忽略未知字段，因此 proto 等新增字段不影响兼容性。
    let claims_value: serde_json::Value = serde_json::from_slice(&json_bytes)
        .map_err(|e| format!("授权数据解析失败：{}", e))?;
    let kid = claims_value
        .get("kid")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string();
    let payload: LicensePayload = serde_json::from_value(claims_value)
        .map_err(|e| format!("授权数据解析失败：{}", e))?;

    Ok(ParsedLicense {
        encoded: encoded.to_string(),
        signature_bytes,
        payload,
        kid,
    })
}

/// 兼容旧调用方的三元组拆解（不含 kid）。
pub fn parse_license_string(
    license_b64: &str,
) -> Result<(String, Vec<u8>, LicensePayload), String> {
    let parsed = parse_license_with_kid(license_b64)?;
    Ok((parsed.encoded, parsed.signature_bytes, parsed.payload))
}

/// LicenseSigner (简化版：签名由 License Generator 工具完成)
pub struct LicenseSigner {
    // 签名密钥存储在 License Generator 工具中，不在 PMTool 应用中
}

impl LicenseSigner {
    pub fn generate() -> Self {
        Self {}
    }

    pub fn sign(&self, _payload: &LicensePayload) -> Result<LicensePayloadWithSignature, String> {
        Err("License generation is done by License Generator tool".to_string())
    }

    pub fn get_verifier(&self) -> LicenseVerifier {
        let app_dir = std::env::current_dir().unwrap_or_default();
        let key_path = app_dir
            .join("src-tauri")
            .join("keys")
            .join("product_keys.json");

        if key_path.exists() {
            match fs::read_to_string(&key_path) {
                Ok(json) => {
                    LicenseVerifier::from_keys_json(&json).unwrap_or_else(|_| LicenseVerifier::empty())
                }
                Err(_) => LicenseVerifier::empty(),
            }
        } else {
            LicenseVerifier::empty()
        }
    }
}

/// 带签名的授权数据
#[derive(Debug, Clone)]
pub struct LicensePayloadWithSignature {
    pub payload: LicensePayload,
}

impl LicensePayloadWithSignature {
    pub fn to_license_string(&self) -> String {
        let payload_json = serde_json::to_string(&self.payload).unwrap();
        let b64 = base64::engine::general_purpose::STANDARD.encode(payload_json);
        format!("{LICENSE_PREFIX}{b64}")
    }

    pub fn to_formatted_string(&self) -> String {
        let b64 = self.to_license_string();
        let chars: Vec<char> = b64.chars().collect();

        let mut result = String::new();
        let mut i = 0;
        let len = chars.len();

        while i < len {
            if i > 0 && i % 5 == 0 && i < len - 1 {
                result.push('-');
            }
            result.push(chars[i]);
            i += 1;
        }

        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 构造一段与生成端一致的授权码字符串（用于端到端验证 verify() 解析/验签）
    fn build_license(
        payload: &LicensePayload,
        signing_key: &ed25519_dalek::SigningKey,
    ) -> String {
        use base64::Engine as _;
        use ed25519_dalek::Signer;

        let json = serde_json::to_string(payload).unwrap();
        let encoded = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(json.as_bytes());
        let signature = signing_key.sign(encoded.as_bytes());
        let sig_hex = hex::encode(signature.to_bytes());
        let sig_b64 = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(sig_hex);
        let license_data = format!("{}{}", sig_b64, encoded);

        let mut result = String::from(LICENSE_PREFIX);
        for (i, c) in license_data.chars().enumerate() {
            if i > 0 && i % 5 == 0 {
                result.push('-');
            }
            result.push(c);
        }
        result
    }

    /// 将 32 字节公钥打包为 SPKI PEM 字符串（匹配旧 generator_public.pem 格式）
    fn public_key_to_spki_pem(public_bytes: &[u8; 32]) -> String {
        // 前缀 DER：30 2a 30 05 06 03 2b 65 70 03 21 00
        let prefix = hex::decode("302a300506032b6570032100").unwrap();
        let mut der = prefix.clone();
        der.extend_from_slice(public_bytes);
        let der_b64 = base64::engine::general_purpose::STANDARD.encode(&der);
        let mut pem = String::from("-----BEGIN PUBLIC KEY-----\n");
        for chunk in der_b64.as_bytes().chunks(64) {
            pem.push_str(std::str::from_utf8(chunk).unwrap());
            pem.push('\n');
        }
        pem.push_str("-----END PUBLIC KEY-----\n");
        pem
    }

    /// 构造单把公钥的产品清单 JSON
    fn manifest_json(kid: &str, signing_key: &ed25519_dalek::SigningKey) -> String {
        format!(
            r#"{{"product":"{}","keys":[{{"kid":"{}","public_hex":"{}"}}]}}"#,
            PRODUCT_CODE,
            kid,
            hex::encode(signing_key.verifying_key().as_bytes())
        )
    }

    /// 构造带 claims.kid 的授权码；`tamper_signature` 用于翻转签名首字节
    fn build_license_with_kid(
        payload: &LicensePayload,
        kid: &str,
        signing_key: &ed25519_dalek::SigningKey,
        tamper_signature: bool,
    ) -> String {
        use base64::Engine as _;
        use ed25519_dalek::Signer;

        let mut value = serde_json::to_value(payload).unwrap();
        value["kid"] = serde_json::Value::String(kid.to_string());
        let json = serde_json::to_string(&value).unwrap();
        let encoded = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(json.as_bytes());

        let mut signature = signing_key.sign(encoded.as_bytes()).to_bytes();
        if tamper_signature {
            signature[0] ^= 0x01;
        }
        let sig_hex = hex::encode(signature);
        let sig_b64 = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(sig_hex);
        format!("{LICENSE_PREFIX}{sig_b64}{encoded}")
    }

    fn future_payload(license_id: &str) -> LicensePayload {
        use chrono::{Duration, Utc};
        let now = Utc::now();
        LicensePayload {
            product: PRODUCT_CODE.to_string(),
            license_id: license_id.to_string(),
            device_id: "device-001".to_string(),
            license_type: "YEAR".to_string(),
            start_time: now.to_rfc3339(),
            expire_time: (now + Duration::days(365)).to_rfc3339(),
        }
    }

    #[test]
    fn test_protocol_version_parsing() {
        assert_eq!(ProtocolVersion::from_str(LICENSE_PREFIX), Some(ProtocolVersion::V1));
        assert_eq!(ProtocolVersion::from_str("PMT1"), Some(ProtocolVersion::V1));
        assert_eq!(ProtocolVersion::from_str("LC2"), None);
    }

    #[test]
    fn test_license_payload_serialization() {
        let payload = LicensePayload {
            product: PRODUCT_CODE.to_string(),
            license_id: "test-001".to_string(),
            device_id: "device-001".to_string(),
            license_type: "YEAR".to_string(),
            start_time: "2024-01-01T00:00:00+00:00".to_string(),
            expire_time: "2025-01-01T00:00:00+00:00".to_string(),
        };

        let json = serde_json::to_string(&payload).unwrap();
        let decoded: LicensePayload = serde_json::from_str(&json).unwrap();
        assert_eq!(payload, decoded);
    }

    #[test]
    fn test_from_public_pem_spki() {
        use ed25519_dalek::SigningKey;

        let signing_key = SigningKey::from_bytes(&[42u8; 32]);
        let public_bytes: [u8; 32] = *signing_key.verifying_key().as_bytes();
        let pem = public_key_to_spki_pem(&public_bytes);

        let verifier = LicenseVerifier::from_public_pem(&pem);
        assert!(verifier.is_ok(), "SPKI PEM 公钥解析应成功: {:?}", verifier.err());
    }

    #[test]
    fn test_from_public_pem_hex() {
        let pub_hex = "7aca5d50b11cfbfbc73e5a5006e34cdfa6dd9550b6b008e58096e1f0e5da30bb";
        let pem = format!(
            "-----BEGIN ED25519 PUBLIC KEY-----\n{}\n-----END ED25519 PUBLIC KEY-----",
            pub_hex
        );

        let verifier = LicenseVerifier::from_public_pem(&pem);
        assert!(verifier.is_ok(), "hex PEM 公钥解析应成功: {:?}", verifier.err());
    }

    #[test]
    fn test_verification_invalid_format() {
        let verifier = LicenseVerifier::empty();
        let result = verifier.verify("INVALID-STRING");
        assert!(!result.valid);
        assert!(result.reason.is_some());
    }

    #[test]
    fn test_verification_success() {
        use chrono::{Duration, Utc};
        use ed25519_dalek::SigningKey;

        let now = Utc::now();
        let expire = now + Duration::days(365);

        let payload = LicensePayload {
            product: PRODUCT_CODE.to_string(),
            license_id: "test-001".to_string(),
            device_id: "device-001".to_string(),
            license_type: "YEAR".to_string(),
            start_time: now.to_rfc3339(),
            expire_time: expire.to_rfc3339(),
        };

        let signing_key = SigningKey::from_bytes(&[42u8; 32]);
        let license = build_license(&payload, &signing_key);

        let public_bytes: [u8; 32] = *signing_key.verifying_key().as_bytes();
        let verifier =
            LicenseVerifier::from_public_pem(&public_key_to_spki_pem(&public_bytes)).unwrap();
        let result = verifier.verify(&license);
        assert!(result.valid, "授权验证应成功: {:?}", result.reason);
        assert_eq!(result.payload.unwrap().license_id, "test-001");
    }

    #[test]
    fn test_verification_tampered_signature() {
        use chrono::{Duration, Utc};
        use ed25519_dalek::SigningKey;

        let now = Utc::now();
        let expire = now + Duration::days(365);

        let payload = LicensePayload {
            product: PRODUCT_CODE.to_string(),
            license_id: "test-002".to_string(),
            device_id: "device-001".to_string(),
            license_type: "YEAR".to_string(),
            start_time: now.to_rfc3339(),
            expire_time: expire.to_rfc3339(),
        };

        let signing_key = SigningKey::from_bytes(&[42u8; 32]);
        let mut license = build_license(&payload, &signing_key).into_bytes();

        // 篡改 payload 数据区（最后一段 base64 的第一个字符替换）
        let last = license.len() - 1;
        license[last] = if license[last] == b'A' { b'B' } else { b'A' };
        let tampered = String::from_utf8(license).unwrap();

        let public_bytes: [u8; 32] = *signing_key.verifying_key().as_bytes();
        let verifier =
            LicenseVerifier::from_public_pem(&public_key_to_spki_pem(&public_bytes)).unwrap();
        let result = verifier.verify(&tampered);
        assert!(!result.valid);
    }

    // ---- 多公钥清单（kid 选择 / 轮换） ----

    #[test]
    fn test_from_keys_json_ok_and_kid_lookup() {
        let signing_key = ed25519_dalek::SigningKey::from_bytes(&[9u8; 32]);
        let verifier =
            LicenseVerifier::from_keys_json(&manifest_json("PMTOOL-2026-01", &signing_key))
                .expect("合法清单应解析成功");

        assert!(verifier.key_for_kid("PMTOOL-2026-01").is_some());
        assert!(verifier.key_for_kid("PMTOOL-2026-02").is_none());
        // 生产清单不登记空 kid
        assert!(verifier.key_for_kid(LEGACY_KID).is_none());
    }

    #[test]
    fn test_from_keys_json_rejects_invalid_manifests() {
        let signing_key = ed25519_dalek::SigningKey::from_bytes(&[9u8; 32]);
        let public_hex = hex::encode(signing_key.verifying_key().as_bytes());

        let cases = [
            // product 不匹配
            r#"{"product":"OTHER","keys":[{"kid":"PMTOOL-2026-01","public_hex":"PUB"}]}"#
                .replace("PUB", &public_hex),
            // keys 为空
            r#"{"product":"PMTOOL","keys":[]}"#.to_string(),
            // public_hex 长度不是 64
            r#"{"product":"PMTOOL","keys":[{"kid":"PMTOOL-2026-01","public_hex":"abcd"}]}"#
                .to_string(),
            // kid 前缀不是产品码
            r#"{"product":"PMTOOL","keys":[{"kid":"NOTE-2026-01","public_hex":"PUB"}]}"#
                .replace("PUB", &public_hex),
            // JSON 本身不可解析
            "{not-json".to_string(),
        ];

        for case in cases {
            let err = LicenseVerifier::from_keys_json(&case)
                .err()
                .unwrap_or_else(|| panic!("非法清单必须报错：{case}"));
            assert!(
                err.starts_with("公钥清单不合法："),
                "错误信息应以「公钥清单不合法：」开头，实际：{err}"
            );
        }
    }

    #[test]
    fn test_manifest_key_verifies_license_with_kid() {
        let signing_key = ed25519_dalek::SigningKey::from_bytes(&[9u8; 32]);
        let verifier =
            LicenseVerifier::from_keys_json(&manifest_json("PMTOOL-2026-01", &signing_key))
                .unwrap();
        let payload = future_payload("kid-hit-001");
        let license = build_license_with_kid(&payload, "PMTOOL-2026-01", &signing_key, false);

        let result = verifier.verify(&license);
        assert!(result.valid, "清单公钥应验签通过: {:?}", result.reason);
        assert_eq!(result.payload.unwrap().license_id, "kid-hit-001");
    }

    #[test]
    fn test_manifest_key_rejects_unknown_kid() {
        let signing_key = ed25519_dalek::SigningKey::from_bytes(&[9u8; 32]);
        let verifier =
            LicenseVerifier::from_keys_json(&manifest_json("PMTOOL-2026-01", &signing_key))
                .unwrap();
        let payload = future_payload("kid-miss-001");
        let license = build_license_with_kid(&payload, "PMTOOL-1999-99", &signing_key, false);

        let result = verifier.verify(&license);
        assert!(!result.valid);
        let reason = result.reason.unwrap();
        assert!(reason.contains("未知密钥"), "实际原因：{reason}");
    }

    #[test]
    fn test_manifest_key_rejects_tampered_signature_bit() {
        let signing_key = ed25519_dalek::SigningKey::from_bytes(&[9u8; 32]);
        let verifier =
            LicenseVerifier::from_keys_json(&manifest_json("PMTOOL-2026-01", &signing_key))
                .unwrap();
        let payload = future_payload("kid-tamper-001");
        let license = build_license_with_kid(&payload, "PMTOOL-2026-01", &signing_key, true);

        let result = verifier.verify(&license);
        assert!(!result.valid);
        assert_eq!(result.reason.as_deref(), Some("授权码签名验证失败"));
    }
}