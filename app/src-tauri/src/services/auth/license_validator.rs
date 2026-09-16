/**
 * PMTool · License 验证器（拆分职责 · 无单点 isLicensed() 门）
 *
 * 设计依据：授权体系与数据库隔离改造（2026-09-16）§20
 *   授权判定拆分为多个独立验证器，任何单一环节被绕过都不能通过整个流水线：
 *     LicenseFormatValidator → LicenseParser → SignatureValidator
 *     → ClaimsValidator → ExpirationValidator → DeviceBindingValidator → AuthorizationDecision
 *
 * 原因码（§24 日志只记码，不记完整 License / 设备敏感信息）：
 *   LICENSE_NOT_FOUND / LICENSE_FORMAT_INVALID / LICENSE_SIGNATURE_INVALID
 *   LICENSE_CLAIMS_INVALID / LICENSE_EXPIRED / LICENSE_DEVICE_MISMATCH
 *   SECURE_STORAGE_ERROR / DEVICE_ID_GENERATION_ERROR
 */

use crate::crypto_ed25519::{self, LicensePayload, LicenseVerifier};

/// 授权判定原因码（机器可读 · 稳定不可改）
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AuthReasonCode {
    Licensed,
    TrialActive,
    LicenseNotFound,
    LicenseFormatInvalid,
    LicenseSignatureInvalid,
    LicenseClaimsInvalid,
    LicenseExpired,
    LicenseDeviceMismatch,
    SecureStorageError,
    DeviceIdError,
}

impl AuthReasonCode {
    /// 稳定原因码（日志/前端展示用）
    pub fn code(self) -> &'static str {
        match self {
            AuthReasonCode::Licensed => "LICENSED",
            AuthReasonCode::TrialActive => "TRIAL_ACTIVE",
            AuthReasonCode::LicenseNotFound => "LICENSE_NOT_FOUND",
            AuthReasonCode::LicenseFormatInvalid => "LICENSE_FORMAT_INVALID",
            AuthReasonCode::LicenseSignatureInvalid => "LICENSE_SIGNATURE_INVALID",
            AuthReasonCode::LicenseClaimsInvalid => "LICENSE_CLAIMS_INVALID",
            AuthReasonCode::LicenseExpired => "LICENSE_EXPIRED",
            AuthReasonCode::LicenseDeviceMismatch => "LICENSE_DEVICE_MISMATCH",
            AuthReasonCode::SecureStorageError => "SECURE_STORAGE_ERROR",
            AuthReasonCode::DeviceIdError => "DEVICE_ID_GENERATION_ERROR",
        }
    }

    /// 用户可读信息（中文）
    pub fn message(self) -> String {
        match self {
            AuthReasonCode::Licensed => "已激活正式授权".to_string(),
            AuthReasonCode::TrialActive => "试用中".to_string(),
            AuthReasonCode::LicenseNotFound => "未检测到本机授权，请激活授权或开始试用".to_string(),
            AuthReasonCode::LicenseFormatInvalid => "授权码格式错误，请检查后重试".to_string(),
            AuthReasonCode::LicenseSignatureInvalid => {
                "授权码无效（签名验证失败，可能被篡改或密钥错误）".to_string()
            }
            AuthReasonCode::LicenseClaimsInvalid => "授权码内容不符合 PMTool 授权规范".to_string(),
            AuthReasonCode::LicenseExpired => "授权已过期，请联系授权管理员续期".to_string(),
            AuthReasonCode::LicenseDeviceMismatch => "授权与本机设备不匹配".to_string(),
            AuthReasonCode::SecureStorageError => "系统安全存储异常，无法完成授权验证".to_string(),
            AuthReasonCode::DeviceIdError => "无法识别当前设备身份".to_string(),
        }
    }
}

/// License 单次验证结果（保留结构信息供上层展示）
#[derive(Debug, Clone)]
pub struct LicenseValidation {
    pub valid: bool,
    pub reason_code: Option<AuthReasonCode>,
    pub reason: Option<String>,
    pub payload: Option<LicensePayload>,
}

/// 授权最终判定
#[derive(Debug, Clone)]
pub enum AuthorizationDecision {
    /// 正式授权有效
    Licensed { payload: LicensePayload },
    /// 试用中
    Trial {
        started_at: String,
        days_remaining: i32,
        expire_at: Option<String>,
        time_tampered: bool,
    },
    /// 未授权
    NotAuthorized { reason_code: AuthReasonCode, reason: String },
}

impl AuthorizationDecision {
    pub fn reason_code(&self) -> AuthReasonCode {
        match self {
            AuthorizationDecision::Licensed { .. } => AuthReasonCode::Licensed,
            AuthorizationDecision::Trial { .. } => AuthReasonCode::TrialActive,
            AuthorizationDecision::NotAuthorized { reason_code, .. } => *reason_code,
        }
    }
}

/// 授权验证器（持有 Ed25519 公钥验证器）
/// `verifier` 为 pub：跨模块/集成测试需用测试密钥构造（仅公钥，无泄密风险）
pub struct LicenseValidator {
    pub verifier: LicenseVerifier,
}

impl LicenseValidator {
    /// 使用内嵌公钥初始化
    pub fn new() -> Result<Self, String> {
        const PUBLIC_KEY_PEM: &str = include_str!("../../../keys/generator_public.pem");
        let verifier = LicenseVerifier::from_public_pem(PUBLIC_KEY_PEM)
            .map_err(|e| format!("授权验证器初始化失败：{}", e))?;
        Ok(Self { verifier })
    }

    /// 启动/激活共用：完整验证流水线（§14）
    pub fn validate(&self, license_b64: &str, current_binding_id: &str) -> LicenseValidation {
        // 1. 格式校验 + 解析
        let (encoded, signature_bytes, payload) =
            match crypto_ed25519::parse_license_string(license_b64) {
                Ok(p) => p,
                Err(e) => {
                    return LicenseValidation {
                        valid: false,
                        reason_code: Some(AuthReasonCode::LicenseFormatInvalid),
                        reason: Some(e),
                        payload: None,
                    };
                }
            };

        // 2. 签名验证（对 encoded 字节验签 · 与生成端 sign(encoded.as_bytes()) 一致）
        if !self.verifier.verify_signature_bytes(&encoded, &signature_bytes) {
            return LicenseValidation {
                valid: false,
                reason_code: Some(AuthReasonCode::LicenseSignatureInvalid),
                reason: Some(AuthReasonCode::LicenseSignatureInvalid.message()),
                payload: Some(payload),
            };
        }

        // 3. Claims 验证（产品 / License ID）
        if let Err(code) = claims_valid(&payload) {
            return LicenseValidation {
                valid: false,
                reason_code: Some(code),
                reason: Some(code.message()),
                payload: Some(payload),
            };
        }

        // 4. 有效期验证
        if let Err(code) = expiration_valid(&payload) {
            return LicenseValidation {
                valid: false,
                reason_code: Some(code),
                reason: Some(code.message()),
                payload: Some(payload),
            };
        }

        // 5. 设备绑定验证
        if payload.device_id != current_binding_id {
            return LicenseValidation {
                valid: false,
                reason_code: Some(AuthReasonCode::LicenseDeviceMismatch),
                reason: Some(AuthReasonCode::LicenseDeviceMismatch.message()),
                payload: Some(payload),
            };
        }

        LicenseValidation {
            valid: true,
            reason_code: None,
            reason: None,
            payload: Some(payload),
        }
    }
}

/// 3. Claims 验证器（产品 / License ID 完整性）
fn claims_valid(payload: &LicensePayload) -> Result<(), AuthReasonCode> {
    if payload.product != "PMTool" {
        return Err(AuthReasonCode::LicenseClaimsInvalid);
    }
    if payload.license_id.is_empty() {
        return Err(AuthReasonCode::LicenseClaimsInvalid);
    }
    Ok(())
}

/// 4. 有效期验证器（空 = 永久授权；否则 RFC3339 到期时间必须晚于当前时间）
fn expiration_valid(payload: &LicensePayload) -> Result<(), AuthReasonCode> {
    if payload.expire_time.is_empty() {
        return Ok(()); // PERPETUAL
    }
    use chrono::Utc;
    let now = Utc::now();
    match chrono::DateTime::parse_from_rfc3339(&payload.expire_time) {
        Ok(expire) => {
            let expire_utc = expire.with_timezone(&Utc);
            if expire_utc < now {
                Err(AuthReasonCode::LicenseExpired)
            } else {
                Ok(())
            }
        }
        Err(_) => Err(AuthReasonCode::LicenseClaimsInvalid),
    }
}

// ============================================================
// 试用期计算（7 天 · 独立于 DB · 开始时间来自安全存储）
// ============================================================

pub const TRIAL_DAYS: i32 = 7;

/// 试用信息
#[derive(Debug, Clone)]
pub struct TrialInfo {
    pub started_at: String,
    pub expire_at: Option<String>,
    pub days_used: i32,
    pub days_remaining: i32,
    pub is_active: bool,
    pub time_tampered: bool,
}

/// 由开始时间计算试用状态（自然日差 · 时间回拨检测）
pub fn compute_trial(started_at: &str) -> Result<TrialInfo, AuthReasonCode> {
    let started = chrono::DateTime::parse_from_rfc3339(started_at)
        .map_err(|_| AuthReasonCode::SecureStorageError)?
        .with_timezone(&chrono::Utc);
    let now = chrono::Utc::now();
    let days_elapsed = (now.date_naive() - started.date_naive())
        .num_days()
        .max(0) as i32;
    let days_remaining = TRIAL_DAYS - days_elapsed;
    let time_tampered = now < started;
    let expire_at = (started + chrono::Duration::days(TRIAL_DAYS as i64)).to_rfc3339();

    Ok(TrialInfo {
        started_at: started_at.to_string(),
        expire_at: Some(expire_at),
        days_used: days_elapsed.max(0),
        days_remaining,
        is_active: days_remaining > 0 && !time_tampered,
        time_tampered,
    })
}

/// 将 TrialInfo 转为授权判定
pub fn trial_to_decision(info: TrialInfo) -> AuthorizationDecision {
    if info.is_active {
        AuthorizationDecision::Trial {
            started_at: info.started_at,
            days_remaining: info.days_remaining,
            expire_at: info.expire_at,
            time_tampered: info.time_tampered,
        }
    } else {
        AuthorizationDecision::NotAuthorized {
            reason_code: AuthReasonCode::LicenseNotFound,
            reason: AuthReasonCode::LicenseNotFound.message(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;

    fn build_signed_license(
        payload: &LicensePayload,
        signing_key: &ed25519_dalek::SigningKey,
    ) -> String {
        use base64::Engine;
        use ed25519_dalek::Signer as _;
        let json = serde_json::to_string(payload).unwrap();
        let encoded = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(json.as_bytes());
        let signature = signing_key.sign(encoded.as_bytes());
        let sig_hex = hex::encode(signature.to_bytes());
        let sig_b64 = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(sig_hex);
        let license_data = format!("{sig_b64}{encoded}");

        let mut result = String::from("PMT1");
        for (i, c) in license_data.chars().enumerate() {
            if i > 0 && i % 5 == 0 {
                result.push('-');
            }
            result.push(c);
        }
        result
    }

    fn validator_with_signing_key(
        signing_key: &ed25519_dalek::SigningKey,
    ) -> LicenseValidator {
        let pub_bytes: [u8; 32] = *signing_key.verifying_key().as_bytes();
        // 构造 hex PEM 供 from_public_pem 解析
        let pem = format!(
            "-----BEGIN ED25519 PUBLIC KEY-----\n{}\n-----END ED25519 PUBLIC KEY-----",
            hex::encode(pub_bytes)
        );
        let verifier = LicenseVerifier::from_public_pem(&pem).unwrap();
        LicenseValidator { verifier }
    }

    fn base_payload(device_id: &str) -> LicensePayload {
        LicensePayload {
            product: "PMTool".to_string(),
            license_id: "test-lic-001".to_string(),
            device_id: device_id.to_string(),
            license_type: "DAYS_365".to_string(),
            start_time: "2026-01-01T00:00:00+00:00".to_string(),
            expire_time: "2099-01-01T00:00:00+00:00".to_string(),
        }
    }

    #[test]
    fn test_valid_license_passes() {
        let signing_key = ed25519_dalek::SigningKey::from_bytes(&[7u8; 32]);
        let payload = base_payload("DEVICE-A");
        let license = build_signed_license(&payload, &signing_key);
        let v = validator_with_signing_key(&signing_key);
        let result = v.validate(&license, "DEVICE-A");
        assert!(result.valid, "正常 License 应通过: {:?}", result.reason);
        assert_eq!(result.payload.unwrap().license_id, "test-lic-001");
    }

    #[test]
    fn test_device_mismatch_fails() {
        let signing_key = ed25519_dalek::SigningKey::from_bytes(&[7u8; 32]);
        let payload = base_payload("DEVICE-A");
        let license = build_signed_license(&payload, &signing_key);
        let v = validator_with_signing_key(&signing_key);
        let result = v.validate(&license, "DEVICE-B");
        assert!(!result.valid, "设备不匹配必须失败");
        assert_eq!(result.reason_code, Some(AuthReasonCode::LicenseDeviceMismatch));
    }

    #[test]
    fn test_expired_license_fails() {
        let signing_key = ed25519_dalek::SigningKey::from_bytes(&[7u8; 32]);
        let mut payload = base_payload("DEVICE-A");
        payload.expire_time = "2020-01-01T00:00:00+00:00".to_string();
        let license = build_signed_license(&payload, &signing_key);
        let v = validator_with_signing_key(&signing_key);
        let result = v.validate(&license, "DEVICE-A");
        assert!(!result.valid);
        assert_eq!(result.reason_code, Some(AuthReasonCode::LicenseExpired));
    }

    #[test]
    fn test_tampered_license_fails_signature() {
        use base64::Engine;
        use ed25519_dalek::Signer as _;
        let signing_key = ed25519_dalek::SigningKey::from_bytes(&[7u8; 32]);
        let payload = base_payload("DEVICE-A");

        // 先构造合法 license（记录原签名）
        let json = serde_json::to_string(&payload).unwrap();
        let encoded = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(json.as_bytes());
        let signature = signing_key.sign(encoded.as_bytes());
        let sig_hex = hex::encode(signature.to_bytes());
        let sig_b64 = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(sig_hex);

        // 攻击者篡改 payload 字段（保持 base64 合法）→ encoded 变化 → 原签名失配
        let mut tampered = payload.clone();
        tampered.expire_time = "2098-01-01T00:00:00+00:00".to_string();
        let t_json = serde_json::to_string(&tampered).unwrap();
        let t_encoded = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(t_json.as_bytes());
        let license = format!("PMT1{}{}", sig_b64, t_encoded);

        let v = validator_with_signing_key(&signing_key);
        let result = v.validate(&license, "DEVICE-A");
        assert!(!result.valid);
        assert_eq!(result.reason_code, Some(AuthReasonCode::LicenseSignatureInvalid));
    }

    #[test]
    fn test_format_invalid_fails() {
        let signing_key = ed25519_dalek::SigningKey::from_bytes(&[7u8; 32]);
        let v = validator_with_signing_key(&signing_key);
        let result = v.validate("NOT-A-LICENSE", "DEVICE-A");
        assert!(!result.valid);
        assert_eq!(result.reason_code, Some(AuthReasonCode::LicenseFormatInvalid));
    }

    #[test]
    fn test_wrong_product_fails() {
        let signing_key = ed25519_dalek::SigningKey::from_bytes(&[7u8; 32]);
        let mut payload = base_payload("DEVICE-A");
        payload.product = "OTHER".to_string();
        let license = build_signed_license(&payload, &signing_key);
        let v = validator_with_signing_key(&signing_key);
        let result = v.validate(&license, "DEVICE-A");
        assert!(!result.valid);
        assert_eq!(result.reason_code, Some(AuthReasonCode::LicenseClaimsInvalid));
    }

    // ---- 试用期 ----

    #[test]
    fn test_trial_7_days() {
        let started = Utc::now().to_rfc3339();
        let info = compute_trial(&started).unwrap();
        assert_eq!(info.days_remaining, 7);
        assert!(info.is_active);
        assert!(!info.time_tampered);
    }

    #[test]
    fn test_trial_expired() {
        let started = (Utc::now() - chrono::Duration::days(10)).to_rfc3339();
        let info = compute_trial(&started).unwrap();
        assert!(!info.is_active);
        assert!(info.days_remaining <= 0);
    }

    #[test]
    fn test_trial_time_tampered() {
        let started = (Utc::now() + chrono::Duration::days(1)).to_rfc3339();
        let info = compute_trial(&started).unwrap();
        assert!(info.time_tampered);
        assert!(!info.is_active, "时间回拨的试用不得生效");
    }
}