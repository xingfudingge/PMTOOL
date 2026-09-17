/**
 * PMTool · License Tauri Commands（授权隔离改造版 · 2026-09-16）
 *
 * WebView 调用:
 * - get_device_id()                → 当前设备绑定值（纯计算，无 DB）
 * - get_authorization_state()      → 当前授权状态（读取运行时 AuthorizationContext，无 DB）
 * - activate_license_simple(code)  → 授权码激活（验证通过才写入安全存储）
 * - start_trial()                  → 开始 7 天试用（开始时间写入安全存储）
 * - delete_license()               → 删除授权（只删安全存储，不写数据库）
 *
 * 设计依据：授权体系与数据库隔离改造
 *   - 数据库不保存任何授权数据；授权判定只来源于
 *     Current Device Identity + 本机安全存储 License + 完整验证流水线。
 *   - 授权状态是运行时状态（AuthorizationContext），进程结束即消亡。
 */

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::services::auth::authorization;
use crate::services::auth::license_validator::{AuthorizationDecision, LicenseValidator};
use crate::services::auth::secure_storage::KeyringStorage;
use crate::AppState;

/// 授权状态视图（前端展示用）
/// 注意：字段输出为 snake_case（与项目其余命令返回值一致，Tauri invoke 返回值不做字段名转换）
#[derive(Debug, Serialize, Deserialize)]
pub struct AuthorizationStateView {
    pub state: String, // "licensed" | "trial" | "not_authorized"
    pub licensed: bool,
    pub trial_active: bool,
    pub days_remaining: Option<i32>,
    pub expire_time: Option<String>,
    pub license_type: Option<String>,
    pub license_id: Option<String>,
    pub reason_code: Option<String>,
    pub reason: Option<String>,
    pub device_id: String,
}

fn decision_to_view(decision: &AuthorizationDecision, device_id: &str) -> AuthorizationStateView {
    match decision {
        AuthorizationDecision::Licensed { payload } => AuthorizationStateView {
            state: "licensed".to_string(),
            licensed: true,
            trial_active: false,
            days_remaining: None,
            expire_time: if payload.expire_time.is_empty() {
                None
            } else {
                Some(payload.expire_time.clone())
            },
            license_type: Some(payload.license_type.clone()),
            license_id: Some(payload.license_id.clone()),
            reason_code: None,
            reason: None,
            device_id: device_id.to_string(),
        },
        AuthorizationDecision::Trial {
            started_at,
            days_remaining,
            expire_at,
            time_tampered,
        } => {
            let _ = started_at;
            let _ = time_tampered;
            AuthorizationStateView {
                state: "trial".to_string(),
                licensed: false,
                trial_active: true,
                days_remaining: Some(*days_remaining),
                expire_time: expire_at.clone(),
                license_type: None,
                license_id: None,
                reason_code: None,
                reason: None,
                device_id: device_id.to_string(),
            }
        }
        AuthorizationDecision::NotAuthorized { reason_code, reason } => {
            let code = reason_code.code();
            AuthorizationStateView {
                state: "not_authorized".to_string(),
                licensed: false,
                trial_active: false,
                days_remaining: None,
                expire_time: None,
                license_type: None,
                license_id: None,
                reason_code: Some(code.to_string()),
                reason: Some(reason.clone()),
                device_id: device_id.to_string(),
            }
        }
    }
}

/// 获取当前授权状态（启动时由后端判定，前端只读取展示）
#[tauri::command]
pub fn get_authorization_state(state: State<'_, AppState>) -> AuthorizationStateView {
    let guard = state.authorization.lock().map_err(|e| e.to_string());
    match guard {
        Ok(ctx) => decision_to_view(&ctx.decision, &ctx.device_id),
        Err(_) => AuthorizationStateView {
            state: "not_authorized".to_string(),
            licensed: false,
            trial_active: false,
            days_remaining: None,
            expire_time: None,
            license_type: None,
            license_id: None,
            reason_code: Some("SECURE_STORAGE_ERROR".to_string()),
            reason: Some("授权状态读取失败".to_string()),
            device_id: state.device_id.clone(),
        },
    }
}

/// 获取设备唯一值（绑定值 · 纯计算，无 DB）
#[tauri::command]
pub fn get_device_id(state: State<'_, AppState>) -> Result<String, String> {
    Ok(state.device_id.clone())
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

/// 通过授权码激活（Ed25519 完整验证通过后才写入安全存储）
#[tauri::command]
pub fn activate_license_simple(
    state: State<'_, AppState>,
    license_b64: String,
) -> Result<ActivateLicenseResult, String> {
    // 1. 清洗（去空白/连字符保留在验证层）
    let cleaned = license_b64.replace(['\r', '\n', ' '], "");

    // 2. 初始化验证器
    let validator = LicenseValidator::new()?;
    let storage = KeyringStorage;

    // 3. 激活（验证通过才覆盖旧 License）
    let ctx = authorization::activate_license(&storage, &state.device_id, &validator, &cleaned)?;

    // 4. 更新运行时状态
    *state.authorization.lock().map_err(|e| e.to_string())? = ctx.clone();

    // 5. 返回结果
    match &ctx.decision {
        AuthorizationDecision::Licensed { payload } => Ok(ActivateLicenseResult {
            success: true,
            reason: None,
            product: Some("PMTool".to_string()),
            license_type: Some(payload.license_type.clone()),
            expire_time: if payload.expire_time.is_empty() {
                None
            } else {
                Some(payload.expire_time.clone())
            },
        }),
        other => Ok(ActivateLicenseResult {
            success: false,
            reason: Some(other.reason_code().message()),
            product: None,
            license_type: None,
            expire_time: None,
        }),
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

/// 开始 7 天试用（开始时间写入安全存储；试用仅可开始一次）
#[tauri::command]
pub fn start_trial(state: State<'_, AppState>) -> Result<TrialStatusResult, String> {
    let storage = KeyringStorage;
    let ctx = authorization::start_trial(&storage)?;

    // 更新运行时状态
    *state.authorization.lock().map_err(|e| e.to_string())? = ctx.clone();

    match &ctx.decision {
        AuthorizationDecision::Trial {
            started_at,
            days_remaining,
            expire_at,
            ..
        } => Ok(TrialStatusResult {
            is_trial: true,
            days_remaining: Some(*days_remaining),
            started_at: Some(started_at.clone()),
            expire_at: expire_at.clone(),
        }),
        _ => Ok(TrialStatusResult {
            is_trial: false,
            days_remaining: None,
            started_at: None,
            expire_at: None,
        }),
    }
}

/// 删除授权（只删安全存储中的 License，不写数据库任何状态）
#[tauri::command]
pub fn delete_license(state: State<'_, AppState>) -> Result<(), String> {
    let storage = KeyringStorage;
    authorization::delete_license(&storage)?;

    // 重建运行时状态（删除后重新判定 → 未授权或试用）
    let validator = LicenseValidator::new()?;
    let ctx = authorization::startup_check(&storage, &state.device_id, &validator);
    *state.authorization.lock().map_err(|e| e.to_string())? = ctx;
    Ok(())
}