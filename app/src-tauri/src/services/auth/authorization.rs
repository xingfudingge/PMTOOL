/**
 * PMTool · 授权状态生命周期管理
 *
 * 设计依据：授权体系与数据库隔离改造（2026-09-16）
 *   - 授权状态是【运行时状态】：AuthorizationContext 只存在于当前进程，永不落库（§16）。
 *   - 每次启动都必须基于【当前设备实时计算的 Device Identity】+【本机安全存储中的 License】
 *     独立完成验证（§14/§15）。数据库完全不参与"当前是否授权"的最终判断（Test 10）。
 *   - 更换授权：新 License 验证通过才覆盖旧 License；验证失败不覆盖旧的有效授权（§25）。
 *   - 删除授权：只删安全存储中的 License，不在数据库写 revoked/inactive（§26）。
 *
 * 判定优先级：正式授权 > 试用 > 未授权
 */

use super::license_validator::{
    compute_trial, trial_to_decision, AuthorizationDecision, AuthReasonCode, LicenseValidator,
};
use super::secure_storage::{SecureStorage, USER_LICENSE, USER_TRIAL_STARTED_AT};
use crate::services::logging;

/// 授权上下文（运行时状态）
#[derive(Debug, Clone)]
pub struct AuthorizationContext {
    pub decision: AuthorizationDecision,
    pub device_id: String,
    pub decided_at: String,
}

/// 启动授权检查（§14 完整链路：设备身份 → 安全存储 → 验证流水线 → 判定）
///
/// 绝不读取业务数据库。返回值即当前授权判定。
pub fn startup_check(
    storage: &dyn SecureStorage,
    device_id: &str,
    validator: &LicenseValidator,
) -> AuthorizationContext {
    let decided_at = chrono::Utc::now().to_rfc3339();

    // 1. 读取本机安全存储中的 License
    let license = match storage.read(USER_LICENSE) {
        Ok(v) => v,
        Err(e) => {
            logging::log_line(&format!(
                "[WARN] auth: 安全存储读取失败({})，按未授权处理",
                e
            ));
            return AuthorizationContext {
                decision: AuthorizationDecision::NotAuthorized {
                    reason_code: AuthReasonCode::SecureStorageError,
                    reason: AuthReasonCode::SecureStorageError.message(),
                },
                device_id: device_id.to_string(),
                decided_at,
            };
        }
    };

    // 2. 有 License → 全流水线验证
    if let Some(license_str) = license {
        let result = validator.validate(&license_str, device_id);
        if result.valid {
            if let Some(payload) = result.payload {
                return AuthorizationContext {
                    decision: AuthorizationDecision::Licensed { payload },
                    device_id: device_id.to_string(),
                    decided_at,
                };
            }
        }
        // License 存在但验证失败（过期/设备不匹配/篡改）→ 不进入试用，走未授权
        // 注意：正式授权过期后不得自动回退到试用，用户需重新授权
        let code = result
            .reason_code
            .unwrap_or(AuthReasonCode::LicenseSignatureInvalid);
        logging::log_line(&format!("[WARN] auth: license 验证失败 code={}", code.code()));
        return AuthorizationContext {
            decision: AuthorizationDecision::NotAuthorized {
                reason_code: code,
                reason: code.message(),
            },
            device_id: device_id.to_string(),
            decided_at,
        };
    }

    // 3. 无 License → 检查试用
    match storage.read(USER_TRIAL_STARTED_AT) {
        Ok(Some(started_at)) => {
            match compute_trial(&started_at) {
                Ok(info) => AuthorizationContext {
                    decision: trial_to_decision(info),
                    device_id: device_id.to_string(),
                    decided_at,
                },
                Err(code) => AuthorizationContext {
                    decision: AuthorizationDecision::NotAuthorized {
                        reason_code: code,
                        reason: code.message(),
                    },
                    device_id: device_id.to_string(),
                    decided_at,
                },
            }
        }
        _ => AuthorizationContext {
            decision: AuthorizationDecision::NotAuthorized {
                reason_code: AuthReasonCode::LicenseNotFound,
                reason: AuthReasonCode::LicenseNotFound.message(),
            },
            device_id: device_id.to_string(),
            decided_at,
        },
    }
}

/// 激活授权（§25 更换流程）
///
/// 流程：输入 License → 全流水线验证（格式/签名/Claims/有效期/设备绑定）
///       → 验证通过才写入安全存储（覆盖旧 License）→ 更新运行时上下文
/// 验证失败：不覆盖旧的有效 License。
pub fn activate_license(
    storage: &dyn SecureStorage,
    device_id: &str,
    validator: &LicenseValidator,
    license_b64: &str,
) -> Result<AuthorizationContext, String> {
    // 1. 完整验证
    let result = validator.validate(license_b64, device_id);
    if !result.valid {
        let code = result.reason_code.unwrap_or(AuthReasonCode::LicenseSignatureInvalid);
        logging::log_line(&format!("[WARN] auth: 激活失败 code={}", code.code()));
        return Err(code.message());
    }

    // 2. 验证通过 → 写入安全存储（此时才覆盖旧 License）
    storage
        .store(USER_LICENSE, license_b64)
        .map_err(|e| format!("保存授权失败：{}", e))?;
    logging::log_line("[OK] auth: license 已写入安全存储");

    // 3. 返回更新后的上下文
    let ctx = startup_check(storage, device_id, validator);
    match &ctx.decision {
        AuthorizationDecision::Licensed { .. } => Ok(ctx),
        other => Err(format!("授权已保存，但当前状态异常：{}", other.reason_code().message())),
    }
}

/// 删除授权（§26：只删安全存储，不写数据库任何状态）
pub fn delete_license(storage: &dyn SecureStorage) -> Result<(), String> {
    storage
        .delete(USER_LICENSE)
        .map_err(|e| format!("删除授权失败：{}", e))?;
    logging::log_line("[OK] auth: license 已从安全存储删除");
    Ok(())
}

/// 开始 7 天试用（安全存储记录开始时间；同一设备只能开始一次）
pub fn start_trial(storage: &dyn SecureStorage) -> Result<AuthorizationContext, String> {
    // 已有正式授权时不允许开始试用
    if storage.exists(USER_LICENSE).map_err(|e| e.to_string())? {
        return Err("当前设备已有正式授权，无需试用".to_string());
    }
    // 试用仅可开始一次（含已过期），防止重置 7 天计时器
    if storage.exists(USER_TRIAL_STARTED_AT).map_err(|e| e.to_string())? {
        return Err("试用仅可开始一次".to_string());
    }

    let now = chrono::Utc::now().to_rfc3339();
    storage
        .store(USER_TRIAL_STARTED_AT, &now)
        .map_err(|e| format!("开始试用失败：{}", e))?;
    logging::log_line("[OK] auth: 试用已开始");

    let device_id = super::device_identity::compute_current_identity()
        .map(|d| d.binding_id)
        .unwrap_or_default();
    let validator = LicenseValidator::new().ok();
    match validator {
        Some(v) => Ok(startup_check(storage, &device_id, &v)),
        None => Err("授权验证器初始化失败".to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::super::secure_storage::MemoryStorage;
    use ed25519_dalek::SigningKey;
    use chrono::Utc;

    /// 构造一个 License 验证器 + 生成对应 License
    fn make_validator_and_license(device_id: &str) -> (LicenseValidator, String) {
        use super::super::secure_storage::SecureStorage as _;
        let signing_key = SigningKey::from_bytes(&[11u8; 32]);
        let pub_bytes: [u8; 32] = *signing_key.verifying_key().as_bytes();
        let pem = format!(
            "-----BEGIN ED25519 PUBLIC KEY-----\n{}\n-----END ED25519 PUBLIC KEY-----",
            hex::encode(pub_bytes)
        );
        let verifier = crate::crypto_ed25519::LicenseVerifier::from_public_pem(&pem).unwrap();
        let validator = LicenseValidator { verifier };

        // 构造 License 字符串
        let payload = crate::crypto_ed25519::LicensePayload {
            product: crate::crypto_ed25519::PRODUCT_CODE.to_string(),
            license_id: "auth-test-001".to_string(),
            device_id: device_id.to_string(),
            license_type: "DAYS_365".to_string(),
            start_time: "2026-01-01T00:00:00+00:00".to_string(),
            expire_time: "2099-01-01T00:00:00+00:00".to_string(),
        };
        use base64::Engine;
        use ed25519_dalek::Signer as _;
        let json = serde_json::to_string(&payload).unwrap();
        let encoded = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(json.as_bytes());
        let signature = signing_key.sign(encoded.as_bytes());
        let sig_hex = hex::encode(signature.to_bytes());
        let sig_b64 = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(sig_hex);
        let license = format!("{}{}{}", crate::crypto_ed25519::LICENSE_PREFIX, sig_b64, encoded);
        (validator, license)
    }

    #[test]
    fn test_startup_no_license_not_authorized() {
        let storage = MemoryStorage::new();
        let (v, _) = make_validator_and_license("DEVICE-A");
        let ctx = startup_check(&storage, "DEVICE-A", &v);
        match ctx.decision {
            AuthorizationDecision::NotAuthorized { reason_code, .. } => {
                assert_eq!(reason_code, AuthReasonCode::LicenseNotFound);
            }
            other => panic!("无 License 应未授权: {:?}", other),
        }
    }

    #[test]
    fn test_startup_valid_license_pass() {
        let storage = MemoryStorage::new();
        let (v, license) = make_validator_and_license("DEVICE-A");
        storage.store(USER_LICENSE, &license).unwrap();
        let ctx = startup_check(&storage, "DEVICE-A", &v);
        assert!(matches!(ctx.decision, AuthorizationDecision::Licensed { .. }));
    }

    #[test]
    fn test_startup_device_mismatch_fail() {
        let storage = MemoryStorage::new();
        let (v, license) = make_validator_and_license("DEVICE-A");
        storage.store(USER_LICENSE, &license).unwrap();
        // 当前设备是 B，License 绑定 A → 必须失败
        let ctx = startup_check(&storage, "DEVICE-B", &v);
        assert!(matches!(
            ctx.decision,
            AuthorizationDecision::NotAuthorized { reason_code: AuthReasonCode::LicenseDeviceMismatch, .. }
        ));
    }

    #[test]
    fn test_activate_then_delete() {
        let storage = MemoryStorage::new();
        let (v, license) = make_validator_and_license("DEVICE-A");
        let ctx = activate_license(&storage, "DEVICE-A", &v, &license).unwrap();
        assert!(matches!(ctx.decision, AuthorizationDecision::Licensed { .. }));

        delete_license(&storage).unwrap();
        let after = startup_check(&storage, "DEVICE-A", &v);
        assert!(matches!(
            after.decision,
            AuthorizationDecision::NotAuthorized { .. }
        ));
    }

    #[test]
    fn test_activate_invalid_does_not_overwrite_valid() {
        let storage = MemoryStorage::new();
        let (v, valid_license) = make_validator_and_license("DEVICE-A");
        // 先激活有效 License
        activate_license(&storage, "DEVICE-A", &v, &valid_license).unwrap();

        // 再尝试激活一个无效 License（设备不匹配 B）
        let (_v2, wrong_license) = make_validator_and_license("DEVICE-B");
        let err = activate_license(&storage, "DEVICE-A", &v, &wrong_license).unwrap_err();
        assert!(!err.is_empty());

        // 旧的有效 License 必须保留
        let after = startup_check(&storage, "DEVICE-A", &v);
        assert!(matches!(after.decision, AuthorizationDecision::Licensed { .. }));
    }

    #[test]
    fn test_start_trial_once() {
        let storage = MemoryStorage::new();
        let (_v, _) = make_validator_and_license("DEVICE-A");
        let ctx = start_trial(&storage).unwrap();
        assert!(matches!(ctx.decision, AuthorizationDecision::Trial { .. }));

        // 再次开始试用必须拒绝（试用仅可开始一次，防重置计时器）
        let err = start_trial(&storage).unwrap_err();
        assert!(err.contains("一次"), "第二次开始试用应被拒绝: {}", err);
    }
}