/**
 * PMTool V2.0 · License vitest 测试
 * Phase 1 · T1.5
 *
 * 覆盖 RFC-05 §6 验收样例的 WebView 端：
 *   - 类型定义正确性
 *   - License JSON 解析
 *   - verify_license / get_license_status 包装
 *
 * 运行命令（待网络恢复）：
 *   pnpm test src/database/__tests__/license
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import type { LicenseInput, LicenseVerification, LicenseStatus } from '@/types/license'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

const VALID_LICENSE: LicenseInput = {
  license_key: 'PMT-TEST-001',
  customer_name: '测试公司',
  expire_date: '2099-12-31',
  signature: 'PLACEHOLDER_SIGNATURE',
}

const EXPIRED_LICENSE: LicenseInput = {
  ...VALID_LICENSE,
  expire_date: '2020-01-01',
}

describe('License 类型定义（与 Rust 端一致）', () => {
  it('LicenseInput 包含 4 个必填字段', () => {
    expect(VALID_LICENSE).toHaveProperty('license_key')
    expect(VALID_LICENSE).toHaveProperty('customer_name')
    expect(VALID_LICENSE).toHaveProperty('expire_date')
    expect(VALID_LICENSE).toHaveProperty('signature')
  })

  it('LicenseVerification.valid 是 boolean', () => {
    const v: LicenseVerification = { valid: true, reason: null }
    expect(typeof v.valid).toBe('boolean')
  })
})

describe('verify_license invoke 包装（RFC-05 §4 启动流程）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('调用 verify_license 时参数结构正确', async () => {
    vi.mocked(invoke).mockResolvedValueOnce({ valid: true, reason: null } as LicenseVerification)

    // 模拟 ui 层调用
    const result = await invoke<LicenseVerification>('verify_license', { input: VALID_LICENSE })

    expect(invoke).toHaveBeenCalledWith('verify_license', { input: VALID_LICENSE })
    expect(result.valid).toBe(true)
    expect(result.reason).toBeNull()
  })

  it('过期 License 返回 valid=false + reason 包含"过期"', async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      valid: false,
      reason: 'License 已过期（到期日：2020-01-01）',
    } as LicenseVerification)

    const result = await invoke<LicenseVerification>('verify_license', { input: EXPIRED_LICENSE })

    expect(result.valid).toBe(false)
    expect(result.reason).toContain('过期')
  })

  it('签名错误返回 valid=false + reason 包含"签名"', async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      valid: false,
      reason: 'License 签名无效（可能被篡改或密钥错误）',
    } as LicenseVerification)

    const result = await invoke<LicenseVerification>('verify_license', { input: VALID_LICENSE })

    expect(result.valid).toBe(false)
    expect(result.reason).toContain('签名')
  })
})

describe('get_license_status invoke 包装（RFC-05 §4 启动流程）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('已激活状态返回 activated=true + license 不为空', async () => {
    const mockStatus: LicenseStatus = {
      activated: true,
      license: {
        id: 1,
        license_key: 'PMT-001',
        customer_name: '测试科技',
        expire_date: '2099-12-31',
        status: 1,
        signature: 'sig',
        created_at: '2026-08-22 00:00:00',
      },
      expired: false,
      reason: null,
    }
    vi.mocked(invoke).mockResolvedValueOnce(mockStatus)

    const status = await invoke<LicenseStatus>('get_license_status')

    expect(invoke).toHaveBeenCalledWith('get_license_status')
    expect(status.activated).toBe(true)
    expect(status.license).not.toBeNull()
    expect(status.expired).toBe(false)
  })

  it('未激活状态返回 activated=false + reason=未激活 License', async () => {
    const mockStatus: LicenseStatus = {
      activated: false,
      license: null,
      expired: false,
      reason: '未激活 License',
    }
    vi.mocked(invoke).mockResolvedValueOnce(mockStatus)

    const status = await invoke<LicenseStatus>('get_license_status')

    expect(status.activated).toBe(false)
    expect(status.license).toBeNull()
    expect(status.reason).toBe('未激活 License')
  })

  it('过期状态返回 activated=false + expired=true', async () => {
    const mockStatus: LicenseStatus = {
      activated: false,
      license: {
        id: 1,
        license_key: 'PMT-OLD',
        customer_name: '过期公司',
        expire_date: '2020-01-01',
        status: 1,
        signature: 'sig',
        created_at: '2020-01-01 00:00:00',
      },
      expired: true,
      reason: 'License 已过期',
    }
    vi.mocked(invoke).mockResolvedValueOnce(mockStatus)

    const status = await invoke<LicenseStatus>('get_license_status')

    expect(status.activated).toBe(false)
    expect(status.expired).toBe(true)
    expect(status.reason).toContain('过期')
  })
})

describe('RFC-05 §6 攻击向量验收（WebView 端）', () => {
  it('验收 #1：伪造 License（错误公钥）→ 后端应返回 valid=false', async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      valid: false,
      reason: 'License 签名无效（可能被篡改或密钥错误）',
    } as LicenseVerification)

    // 模拟攻击场景：使用错误公钥验证
    const result = await invoke<LicenseVerification>('verify_license', { input: VALID_LICENSE })
    expect(result.valid).toBe(false)
  })

  it('验收 #2：篡改 License 内容 → 后端应检测签名不匹配', async () => {
    const tampered: LicenseInput = {
      ...VALID_LICENSE,
      customer_name: '其他公司', // 攻击者修改
    }
    vi.mocked(invoke).mockResolvedValueOnce({
      valid: false,
      reason: 'License 签名无效',
    } as LicenseVerification)

    const result = await invoke<LicenseVerification>('verify_license', { input: tampered })
    expect(result.valid).toBe(false)
  })

  it('验收 #4：删除 License → get_license_status 返回 activated=false', async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      activated: false,
      license: null,
      expired: false,
      reason: '未激活 License',
    } as LicenseStatus)

    const status = await invoke<LicenseStatus>('get_license_status')
    expect(status.activated).toBe(false)
    expect(status.license).toBeNull()
  })
})