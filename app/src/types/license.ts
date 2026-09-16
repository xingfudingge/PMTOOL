/**
 * PMTool V2.0 · License 类型定义（2026-09-16 授权隔离改造）
 *
 * 必须与 Rust 端保持一致
 *
 * 变更记录：
 *   - 2026-08-21：LicenseInput / LicenseVerification / LicenseStatus（RSA 旧版，已废弃）
 *   - 2026-09-16：授权隔离改造 —— 数据库不再存授权，前端只读取后端运行时判定
 *     （get_authorization_state），移除旧 RSA 类型
 */

// ========== 授权状态视图（get_authorization_state 返回）==========
export interface AuthorizationStateView {
  /** licensed | trial | not_authorized */
  state: string
  licensed: boolean
  trial_active: boolean
  /** 试用剩余天数（trial 时） */
  days_remaining: number | null
  /** 到期时间（licensed 时；null = 永久授权） */
  expire_time: string | null
  /** 授权类型（PERPETUAL / DAYS_N） */
  license_type: string | null
  /** 授权 ID（licensed 时） */
  license_id: string | null
  /** 未授权原因码（LICENSE_NOT_FOUND / LICENSE_EXPIRED / ...） */
  reason_code: string | null
  /** 未授权原因（用户可读） */
  reason: string | null
  /** 当前设备绑定值 */
  device_id: string
}

// ========== 授权激活结果（activate_license_simple 返回）==========
export interface ActivateLicenseResult {
  success: boolean
  reason: string | null
  product: string | null
  license_type: string | null
  expire_time: string | null
}

// ========== 试用状态结果（start_trial 返回）==========
export interface TrialStatusResult {
  is_trial: boolean
  days_remaining: number | null
  started_at: string | null
  expire_at: string | null
}