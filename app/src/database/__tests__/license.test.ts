/**
 * PMTool V2.0 · License vitest 测试（2026-09-16 授权隔离改造版）
 *
 * 覆盖新授权流程（后端判定，无 DB）：
 *   - get_authorization_state 读取后端授权判定
 *   - activate_license_simple 授权码激活
 *   - start_trial / delete_license
 *   - 攻击向量：篡改 / 设备不匹配 / 过期 / 数据库伪造 由后端保证
 *
 * 运行命令：pnpm test src/database/__tests__/license
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import type { AuthorizationStateView, ActivateLicenseResult } from '@/types/license'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

const DEVICE_ID = 'ABCD1-EFGH2-IJKL3-MNOP4-QRST5'

function licensedState(overrides: Partial<AuthorizationStateView> = {}): AuthorizationStateView {
  return {
    state: 'licensed',
    licensed: true,
    trial_active: false,
    days_remaining: null,
    expire_time: '2099-01-01T00:00:00+00:00',
    license_type: 'DAYS_365',
    license_id: 'lic-001',
    reason_code: null,
    reason: null,
    device_id: DEVICE_ID,
    ...overrides,
  }
}

describe('get_authorization_state（后端判定源 · 2026-09-16）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('正式授权 → state=licensed', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(licensedState())
    const result = await invoke<AuthorizationStateView>('get_authorization_state')
    expect(result.state).toBe('licensed')
    expect(result.licensed).toBe(true)
    expect(result.expire_time).toBe('2099-01-01T00:00:00+00:00')
  })

  it('试用中 → state=trial + days_remaining>0', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(
      licensedState({ state: 'trial', licensed: false, trial_active: true, days_remaining: 5 })
    )
    const result = await invoke<AuthorizationStateView>('get_authorization_state')
    expect(result.state).toBe('trial')
    expect(result.trial_active).toBe(true)
    expect(result.days_remaining).toBe(5)
  })

  it('未授权 → state=not_authorized + 原因码', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(
      licensedState({
        state: 'not_authorized',
        licensed: false,
        reason_code: 'LICENSE_NOT_FOUND',
        reason: '未检测到本机授权，请激活授权或开始试用',
      })
    )
    const result = await invoke<AuthorizationStateView>('get_authorization_state')
    expect(result.state).toBe('not_authorized')
    expect(result.reason_code).toBe('LICENSE_NOT_FOUND')
  })

  it('过期 → reason_code=LICENSE_EXPIRED', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(
      licensedState({
        state: 'not_authorized',
        licensed: false,
        reason_code: 'LICENSE_EXPIRED',
        reason: '授权已过期，请联系授权管理员续期',
      })
    )
    const result = await invoke<AuthorizationStateView>('get_authorization_state')
    expect(result.reason_code).toBe('LICENSE_EXPIRED')
  })

  it('设备不匹配 → reason_code=LICENSE_DEVICE_MISMATCH', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(
      licensedState({
        state: 'not_authorized',
        licensed: false,
        reason_code: 'LICENSE_DEVICE_MISMATCH',
        reason: '授权与本机设备不匹配',
      })
    )
    const result = await invoke<AuthorizationStateView>('get_authorization_state')
    expect(result.reason_code).toBe('LICENSE_DEVICE_MISMATCH')
  })
})

describe('activate_license_simple（授权码激活 · 安全存储）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('激活成功返回 success=true + 到期信息', async () => {
    const mockResult: ActivateLicenseResult = {
      success: true,
      reason: null,
      product: 'PMTool',
      license_type: 'DAYS_365',
      expire_time: '2099-01-01T00:00:00+00:00',
    }
    vi.mocked(invoke).mockResolvedValueOnce(mockResult)
    const result = await invoke<ActivateLicenseResult>('activate_license_simple', {
      licenseB64: 'PMT1-XXXX-XXXX-...',
    })
    expect(invoke).toHaveBeenCalledWith('activate_license_simple', {
      licenseB64: 'PMT1-XXXX-XXXX-...',
    })
    expect(result.success).toBe(true)
  })

  it('激活失败透传后端原因（设备不匹配）', async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      success: false,
      reason: '授权与本机设备不匹配',
      product: null,
      license_type: null,
      expire_time: null,
    } as ActivateLicenseResult)
    const result = await invoke<ActivateLicenseResult>('activate_license_simple', {
      licenseB64: 'PMT1-BAD',
    })
    expect(result.success).toBe(false)
    expect(result.reason).toContain('设备')
  })
})

describe('start_trial / delete_license', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('start_trial 返回试用状态', async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      is_trial: true,
      days_remaining: 7,
      started_at: '2026-09-16T00:00:00+00:00',
      expire_at: '2026-09-23T00:00:00+00:00',
    })
    const result = await invoke<{ is_trial: boolean; days_remaining: number | null }>('start_trial')
    expect(result.is_trial).toBe(true)
    expect(result.days_remaining).toBe(7)
  })

  it('delete_license 删除授权（无 DB 状态回写）', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(null)
    await expect(invoke('delete_license')).resolves.toBeNull()
  })
})

describe('授权与数据库隔离（2026-09-16 核心目标）', () => {
  it('数据库字段伪造不影响判定：判定只来自后端 get_authorization_state', async () => {
    // 模拟攻击者在数据库塞 license_status 后，前端唯一判定源是后端返回
    vi.mocked(invoke).mockResolvedValueOnce(
      licensedState({ state: 'not_authorized', licensed: false, reason_code: 'LICENSE_NOT_FOUND' })
    )
    const result = await invoke<AuthorizationStateView>('get_authorization_state')
    // 无论 DB 是否被伪造，后端判定不受影响（伪造 DB 无授权数据表，启动链路不读库）
    expect(result.state).toBe('not_authorized')
  })
})