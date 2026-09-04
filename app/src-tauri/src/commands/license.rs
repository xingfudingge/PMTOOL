/**
 * PMTool · License Tauri Commands (重构版)
 * Phase 1 · T1.2 + T1.3 + T1.4
 *
 * WebView 调用:
 * - verify_license(input) - 验证并激活 License（旧版，保留向后兼容）
 * - get_license_status() - 获取 License 状态（旧版，保留向后兼容）
 * - deactivate_license() - 停用 License
 * - get_device_id() - 获取设备唯一值
 * - activate_license_simple(license_code) - 通过授权码激活（新接口）
 * - check_trial_status() - 检查试用状态
 *
 * 设计依据：RFC-05 + RFC-03 §1 业务命名层
 */

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::AppState;
use crate::repositories::license as license_repo;
use crate::services::license as license_service;
use crate::services::license::{LicenseInput, LicenseStatus as LicenseStatusOld, LicenseVerification};
use crate::services::trial;

/// 验证并激活 License（旧版，保留用于向后兼容）
#[tauri::command]
pub fn verify_license(
    state: State<'_, AppState>,
    input: LicenseInput,
) -> Result<LicenseVerification, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    license_service::verify_and_activate(&pool, &input)
}

/// 获取 License 状态（旧版，保留用于向后兼容）
#[tauri::command]
pub fn get_license_status(state: State<'_, AppState>) -> LicenseStatusOld {
    let pool = match state.db.lock() {
        Ok(p) => p,
        Err(_) => {
            return LicenseStatusOld {
                activated: false,
                license: None,
                expired: false,
                reason: Some("DB 锁失败".to_string()),
            }
        }
    };
    license_service::get_status(&pool)
}

/// 手动停用 License
#[tauri::command]
pub fn deactivate_license(state: State<'_, AppState>) -> Result<bool, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    let n = crate::repositories::license::deactivate_all(&pool).map_err(|e| e.to_string())?;
    Ok(n > 0)
}

/// 获取设备唯一值
#[tauri::command]
pub fn get_device_id(state: State<'_, AppState>) -> Result<String, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    trial::get_or_create_device_fingerprint(&pool).map_err(|e| e.to_string())
}

/// 授权码激活结果
#[derive(Debug, Serialize, Deserialize)]
pub struct ActivateLicenseResult {
    pub success: bool,
    pub reason: Option<String>,
    pub product: Option<String>,
    pub license_type: Option<String>,
    pub expire_time: Option<String>,
}

/// 通过授权码激活（新接口，Ed25519 验证）
#[tauri::command]
pub fn activate_license_simple(
    state: State<'_, AppState>,
    license_b64: String,
) -> Result<ActivateLicenseResult, String> {
    use crate::crypto_ed25519;

    let pool = state.db.lock().map_err(|e| e.to_string())?;

    // 1. 获取设备 ID
    let device_id = trial::get_or_create_device_fingerprint(&pool)
        .map_err(|e| format!("获取设备 ID 失败：{}", e))?;

    // 2. 加载公钥验证器
    const PUBLIC_KEY_PEM: &str = include_str!("../../keys/generator_public.pem");
    let verifier = crypto_ed25519::LicenseVerifier::from_public_pem(PUBLIC_KEY_PEM)
        .map_err(|e| format!("授权验证器初始化失败：{}", e))?;

    // 3. 验证授权码
    let verification = verifier.verify(&license_b64);

    // 4. 检查验证结果（透传验证器返回的中文 reason）
    if !verification.valid {
        let reason = verification
            .reason
            .unwrap_or_else(|| "授权码无效，请检查后重试。".to_string());
        return Ok(ActivateLicenseResult {
            success: false,
            reason: Some(reason),
            product: None,
            license_type: None,
            expire_time: None,
        });
    }

    // 5. 检查设备匹配
    if let Some(ref payload) = verification.payload {
        if payload.device_id != device_id {
            return Ok(ActivateLicenseResult {
                success: false,
                reason: Some(format!(
                    "授权设备不匹配（当前设备：{}, 授权设备：{}）",
                    device_id, payload.device_id
                )),
                product: None,
                license_type: None,
                expire_time: None,
            });
        }
    }

    // 6. 保存授权信息（Ed25519 验证通过后直接写库，不走 RSA 链路）
    if let Some(ref payload) = verification.payload {
        // **关键修复**：先删除所有 license_key != 新码 的旧记录
        // （之前只 UPDATE status=0 但旧记录还在，触发 UNIQUE constraint）
        license_repo::delete_other_keys(&pool, &license_b64)
            .map_err(|e| format!("清理旧授权记录失败：{}", e))?;
        // 停用剩下的（即同 key 的旧记录，置为失效再覆盖）
        license_repo::deactivate_all(&pool).map_err(|e| e.to_string())?;
        license_repo::insert(
            &pool,
            &license_repo::License {
                id: 0, // DB 自动生成
                license_key: license_b64.clone(),
                customer_name: None,
                expire_date: payload.expire_time.split('T').next().unwrap_or("").to_string(),
                status: 1,
                signature: license_b64.clone(),
                created_at: chrono::Utc::now().to_rfc3339(),
            },
        )
        .map_err(|e| format!("保存授权信息失败：{}", e))?;
    }

    // 7. 更新试用期状态（标记试用结束）
    trial::update_trial_status(&pool, &device_id).ok();

    // 8. 返回成功结果
    let license_type = verification.payload.as_ref()
        .map(|p| p.license_type.clone());
    let expire_time = verification.payload.as_ref()
        .map(|p| p.expire_time.clone());

    Ok(ActivateLicenseResult {
        success: true,
        reason: None,
        product: Some("PMTool".to_string()),
        license_type,
        expire_time,
    })
}

/// 检查试用状态
#[tauri::command]
pub fn check_trial_status(state: State<'_, AppState>) -> Result<TrialStatusResult, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;

    // 获取设备 ID
    let device_id = trial::get_or_create_device_fingerprint(&pool)
        .map_err(|e| e.to_string())?;

    // 获取试用状态
    match trial::get_trial_status(&pool, &device_id) {
        Ok(Some(status)) => {
            Ok(TrialStatusResult {
                is_trial: true,
                days_remaining: Some(status.days_remaining),
                started_at: status.started_at,
                expire_at: status.expire_at,
            })
        }
        Ok(None) => {
            // 没有试用记录：返回 is_trial=false，由前端决定是开始试用还是激活授权
            // 关键：这里不再自动激活试用，避免用户没同意就被静默记录
            Ok(TrialStatusResult {
                is_trial: false,
                days_remaining: None,
                started_at: None,
                expire_at: None,
            })
        }
        Err(e) => Err(format!("检查试用状态失败：{}", e)),
    }
}

/// 试用状态结果
#[derive(Debug, Serialize, Deserialize)]
pub struct TrialStatusResult {
    pub is_trial: bool,
    pub days_remaining: Option<i32>,
    pub started_at: Option<String>,
    pub expire_at: Option<String>,
}

/// 用户主动开始 7 天试用（不再静默激活）
#[tauri::command]
pub fn start_trial(state: State<'_, AppState>) -> Result<TrialStatusResult, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    let device_id = trial::get_or_create_device_fingerprint(&pool)
        .map_err(|e| format!("获取设备 ID 失败：{}", e))?;

    match trial::activate_trial(&pool, &device_id) {
        Ok(status) => Ok(TrialStatusResult {
            is_trial: true,
            days_remaining: Some(status.days_remaining),
            started_at: status.started_at,
            expire_at: status.expire_at,
        }),
        Err(e) => Err(format!("开始试用失败：{}", e)),
    }
}

/// 启动时清理过期 license：把所有 status=1 && expire_date < today 的记录置为 0
/// 返回清理条数，供前端日志/调试
#[tauri::command]
pub fn expire_overdue_licenses(state: State<'_, AppState>) -> Result<usize, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
    let n = pool
        .execute(
            "UPDATE license SET status = 0 WHERE status = 1 AND expire_date != '' AND expire_date < ?1",
            rusqlite::params![today],
        )
        .map_err(|e| format!("清理过期授权失败：{}", e))?;
    Ok(n)
}
