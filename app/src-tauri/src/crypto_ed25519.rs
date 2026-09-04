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
use std::fs;

/// 签名段固定长度：base64url_no_pad(hex(64 字节签名)) = base64url_no_pad(128 字节) = 171 字符
const SIG_B64_LEN: usize = 171;

/// 授权协议版本
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProtocolVersion {
    V1,
}

impl ProtocolVersion {
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "PMT1" => Some(Self::V1),
            _ => None,
        }
    }

    pub fn to_str(self) -> &'static str {
        "PMT1"
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

/// Ed25519 授权签名验证器
pub struct LicenseVerifier {
    verifying_key: VerifyingKey,
}

impl LicenseVerifier {
    /// 从 SPKI/PEM 格式的公钥初始化验证器
    ///
    /// `generator_public.pem` 为 Ed25519 公钥的 SPKI DER 编码（base64），形如：
    ///   MCowBQYDK2VwAyEA ... （DER = 30 2a 30 05 06 03 2b 65 70 03 21 00 + 32 字节公钥）
    /// 解析时剥离 ASN.1 头，取末尾 32 字节作为 Ed25519 公钥。
    pub fn from_public_pem(pem: &str) -> Result<Self, String> {
        let key_lines: Vec<&str> = pem
            .lines()
            .filter(|line| !line.starts_with("-----"))
            .collect();
        let pem_content = key_lines.join("");

        // 支持两种公钥编码：
        // 1) 生成器 hex PEM：`-----BEGIN ED25519 PUBLIC KEY-----` + hex(32字节)=64 hex 字符
        // 2) 标准 SPKI/DER base64（现有 generator_public.pem 格式）
        if pem_content.chars().all(|c| c.is_ascii_hexdigit()) && pem_content.len() == 64 {
            let bytes = hex::decode(&pem_content)
                .map_err(|e| format!("公钥 hex 解码失败：{}", e))?;
            let public_array: [u8; PUBLIC_KEY_LENGTH] = bytes
                .try_into()
                .map_err(|_| "公钥长度无效（hex 期望 32 字节）".to_string())?;
            let verifying_key = VerifyingKey::from_bytes(&public_array)
                .map_err(|e| format!("公钥格式无效：{}", e))?;
            return Ok(Self { verifying_key });
        }

        // SPKI/DER base64 路径：取末尾 32 字节
        let der = base64::engine::general_purpose::STANDARD
            .decode(&pem_content)
            .map_err(|e| format!("公钥 Base64 解码失败：{}", e))?;
        if der.len() < 12 + PUBLIC_KEY_LENGTH {
            return Err(format!("公钥 DER 长度无效（期望至少 {} 字节）", 12 + PUBLIC_KEY_LENGTH));
        }
        let public_bytes = &der[der.len() - PUBLIC_KEY_LENGTH..];
        let public_array: [u8; PUBLIC_KEY_LENGTH] = public_bytes
            .try_into()
            .map_err(|_| "公钥长度无效（期望 32 字节）".to_string())?;
        let verifying_key = VerifyingKey::from_bytes(&public_array)
            .map_err(|e| format!("公钥格式无效：{}", e))?;

        Ok(Self { verifying_key })
    }

    /// 从文件加载公钥
    pub fn from_public_key_file(path: &str) -> Result<Self, String> {
        let pem = fs::read_to_string(path)
            .map_err(|e| format!("无法读取公钥文件 {}: {}", path, e))?;
        Self::from_public_pem(&pem)
    }

    /// 验证授权字符串 (与 License Generator 主实现一致)
    pub fn verify(&self, license_b64: &str) -> LicenseVerification {
        // 1. 移除分隔符
        let license_clean = license_b64.replace("-", "").replace(" ", "");

        // 2. 检查 PMT1 前缀
        if !license_clean.starts_with("PMT1") {
            return LicenseVerification {
                valid: false,
                reason: Some("授权码格式错误，需要以 PMT1 开头".to_string()),
                payload: None,
            };
        }

        // 3. 提取授权数据部分 (PMT1 后面的所有字符)
        let data_part = &license_clean[4..];

        // 4. 结构：sig_b64(固定171) + encoded(不定长)
        if data_part.len() < SIG_B64_LEN {
            return LicenseVerification {
                valid: false,
                reason: Some("授权码数据不完整".to_string()),
                payload: None,
            };
        }
        let (sig_b64, encoded) = data_part.split_at(SIG_B64_LEN);

        // 5. 解码签名：sig_b64 → base64(hex 字符) → hex → 64 字节签名
        let sig_hex = match base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(sig_b64) {
            Ok(b) => b,
            Err(_) => {
                return LicenseVerification {
                    valid: false,
                    reason: Some("授权码签名格式错误".to_string()),
                    payload: None,
                };
            }
        };
        let signature_bytes = match hex::decode(&sig_hex) {
            Ok(b) => b,
            Err(_) => {
                return LicenseVerification {
                    valid: false,
                    reason: Some("授权码签名格式错误".to_string()),
                    payload: None,
                };
            }
        };

        if signature_bytes.len() != SIGNATURE_LENGTH {
            return LicenseVerification {
                valid: false,
                reason: Some("授权码签名长度错误".to_string()),
                payload: None,
            };
        }

        let signature_array: [u8; SIGNATURE_LENGTH] = signature_bytes.try_into().unwrap();
        let signature = Signature::from_bytes(&signature_array);

        // 6. 解码 JSON 数据 (URL_SAFE_NO_PAD)
        let json_bytes = match base64::engine::general_purpose::URL_SAFE_NO_PAD.decode(encoded) {
            Ok(b) => b,
            Err(e) => {
                return LicenseVerification {
                    valid: false,
                    reason: Some(format!("授权数据 Base64 解码失败：{}", e)),
                    payload: None,
                };
            }
        };

        // 7. 验证签名（对 encoded 的字符串字节验签，与生成端 sign(encoded.as_bytes()) 一致）
        if self.verifying_key.verify(encoded.as_bytes(), &signature).is_err() {
            return LicenseVerification {
                valid: false,
                reason: Some("授权码签名验证失败".to_string()),
                payload: None,
            };
        }

        // 8. 解析 JSON
        let payload: LicensePayload = match serde_json::from_slice(&json_bytes) {
            Ok(p) => p,
            Err(e) => {
                return LicenseVerification {
                    valid: false,
                    reason: Some(format!("授权数据解析失败：{}", e)),
                    payload: None,
                };
            }
        };

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
        if payload.product != "PMTool" {
            return LicenseVerification {
                valid: false,
                reason: Some(format!("授权不适用于 PMTool，适用于：{}", payload.product)),
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
            .join("generator_public.pem");

        if key_path.exists() {
            LicenseVerifier::from_public_key_file(&key_path.to_string_lossy()).unwrap_or_else(|_| {
                LicenseVerifier {
                    verifying_key: VerifyingKey::from_bytes(&[0; 32]).unwrap_or_default(),
                }
            })
        } else {
            LicenseVerifier {
                verifying_key: VerifyingKey::from_bytes(&[0; 32]).unwrap_or_default(),
            }
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
        format!("PMT1{}", b64)
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

        let mut result = String::from("PMT1");
        for (i, c) in license_data.chars().enumerate() {
            if i > 0 && i % 5 == 0 {
                result.push('-');
            }
            result.push(c);
        }
        result
    }

    /// 将 32 字节公钥打包为 SPKI PEM 字符串（匹配 generator_public.pem 格式）
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

    #[test]
    fn test_protocol_version_parsing() {
        assert_eq!(ProtocolVersion::from_str("PMT1"), Some(ProtocolVersion::V1));
        assert_eq!(ProtocolVersion::from_str("PMT2"), None);
    }

    #[test]
    fn test_license_payload_serialization() {
        let payload = LicensePayload {
            product: "PMTool".to_string(),
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
        let verifier = LicenseVerifier {
            verifying_key: VerifyingKey::from_bytes(&[0; 32]).unwrap_or_default(),
        };
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
            product: "PMTool".to_string(),
            license_id: "test-001".to_string(),
            device_id: "device-001".to_string(),
            license_type: "YEAR".to_string(),
            start_time: now.to_rfc3339(),
            expire_time: expire.to_rfc3339(),
        };

        let signing_key = SigningKey::from_bytes(&[42u8; 32]);
        let license = build_license(&payload, &signing_key);

        let public_bytes: [u8; 32] = *signing_key.verifying_key().as_bytes();
        let verifier = LicenseVerifier {
            verifying_key: VerifyingKey::from_bytes(&public_bytes).unwrap(),
        };
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
            product: "PMTool".to_string(),
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
        let verifier = LicenseVerifier {
            verifying_key: VerifyingKey::from_bytes(&public_bytes).unwrap(),
        };
        let result = verifier.verify(&tampered);
        assert!(!result.valid);
    }
}