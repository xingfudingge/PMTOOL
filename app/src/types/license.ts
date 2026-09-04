/**
 * PMTool V2.0 · License 类型定义
 * Phase 1 · T1.2 + T1.3 + T1.4
 *
 * 必须与 Rust 端保持一致
 */

// 旧版 LicenseInput (向后兼容)
export interface LicenseInput {
  license_key: string
  customer_name: string
  expire_date: string // YYYY-MM-DD
  signature: string // base64 RSA-2048 signature
}

// 旧版 LicenseVerification (向后兼容)
export interface LicenseVerification {
  valid: boolean
  reason: string | null
}

// License (数据库记录)
export interface License {
  id: number
  license_key: string
  customer_name: string | null
  expire_date: string
  status: number // 0=无效 1=有效
  signature: string
  created_at: string
}

// 旧版 LicenseStatus (向后兼容)
export interface LicenseStatus {
  activated: boolean
  license: License | null
  expired: boolean
  reason: string | null
}

// ========== 新接口 ==========\n\n// 授权激活结果
export interface ActivateLicenseResult {
  success: boolean
  reason: string | null
  product: string | null
  license_type: string | null
  expire_time: string | null
}

// 试用状态结果
export interface TrialStatusResult {
  is_trial: boolean
  days_remaining: number | null
  started_at: string | null
  expire_at: string | null
}

// ========== UI 组件状态 ==========\n\n// LicenseSection 组件使用的状态
export type LicenseStatusDisplay = 'trial' | 'activated' | 'expired'

export interface LicenseActivationResult {
  success: boolean
  reason: string | null
  product: string | null
  license_type: string | null
  expire_time: string | null
}
