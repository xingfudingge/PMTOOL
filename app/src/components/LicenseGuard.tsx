/**
 * PMTool V2.0 · License Route Guard
 *
 * 设计依据：维护者 2026-09-04 反馈
 *   - 启动时检查授权状态
 *   - 三种状态机：
 *     1) 已有正式授权 → 直接渲染主应用
 *     2) 有有效试用（is_trial=true 且 days_remaining>0） → 直接渲染主应用
 *     3) 既无 license 又无试用记录 → 弹出「选择弹窗」（开始试用 / 激活授权）
 *     4) 试用已过期 → 强制激活授权（仅显示激活弹窗）
 */

import { useState, useEffect, type ReactNode } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { LicenseActivation } from './LicenseActivation'

interface TrialStatusResult {
  is_trial: boolean
  days_remaining: number | null
  started_at: string | null
  expire_at: string | null
}

interface LicenseStatus {
  activated: boolean
  license: any | null
  expired: boolean
  reason: string | null
}

type GuardState = 'loading' | 'authorized' | 'choice' | 'activation'

interface LicenseGuardProps {
  children: ReactNode
}

export function LicenseGuard({ children }: LicenseGuardProps) {
  const [state, setState] = useState<GuardState>('loading')
  const [trialInfo, setTrialInfo] = useState<TrialStatusResult | null>(null)
  const [licenseInfo, setLicenseInfo] = useState<LicenseStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  const checkStatus = async () => {
    try {
      setError(null)

      // 0. 先清理过期的 license 记录（status=1 但 expire_date < today → status=0）
      // 这样后续 get_license_status 不会返回过期的"已激活"假象
      try {
        await invoke('expire_overdue_licenses')
      } catch (e) {
        console.warn('清理过期授权失败（不致命）:', e)
      }

      // 1. 先查 license 表
      const licenseResult = await invoke<LicenseStatus>('get_license_status')
      setLicenseInfo(licenseResult)

      // 1.1 license 存在但已过期 → **强制重新激活**（关键：过期不能继续用）
      if (licenseResult.license && licenseResult.expired) {
        setState('activation')
        return
      }

      // 1.2 license 有效且未过期 → 放行
      if (licenseResult.activated) {
        setState('authorized')
        return
      }

      // 2. 无 license，查试用
      const trialResult = await invoke<TrialStatusResult>('check_trial_status')
      setTrialInfo(trialResult)

      // 3. 有有效试用记录（days_remaining > 0）→ 放行
      if (
        trialResult.is_trial &&
        trialResult.days_remaining !== null &&
        trialResult.days_remaining > 0
      ) {
        setState('authorized')
        return
      }

      // 4. 既无 license 也无试用（首次启动）→ 让用户选择
      // 5. 试用过期（is_trial=true 且 days_remaining<=0）→ 强制激活
      if (trialResult.is_trial && trialResult.days_remaining !== null && trialResult.days_remaining <= 0) {
        setState('activation')
      } else {
        setState('choice')
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e)
      setError(errorMsg)
      console.error('License check error:', e)
      setState('choice')
    }
  }

  useEffect(() => {
    checkStatus()
  }, [])

  // 用户点「开始 7 天试用」
  const handleStartTrial = async () => {
    try {
      const result = await invoke<TrialStatusResult>('start_trial')
      setTrialInfo(result)
      setState('authorized')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(`开始试用失败：${msg}`)
    }
  }

  // 用户在选择弹窗里想直接激活授权 → 切到激活页
  const handleChooseActivate = () => {
    setState('activation')
  }

  // LOADING 状态
  if (state === 'loading') {
    return (
      <div
        data-testid="license-guard-loading"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: 'var(--bg)',
          color: 'var(--text-secondary)',
          fontSize: '14px',
        }}
      >
        正在检查授权状态…
      </div>
    )
  }

  // 已授权或试用中 → 渲染主应用
  if (state === 'authorized') {
    return <>{children}</>
  }

  // 首次启动（既无 license 也无试用）→ 选择弹窗
  if (state === 'choice') {
    return (
      <>
        <StartChoiceModal
          error={error}
          onStartTrial={handleStartTrial}
          onActivate={handleChooseActivate}
        />
        {/* 背景占位 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            background: 'var(--bg)',
            color: 'var(--text-secondary)',
            fontSize: '13px',
            padding: '20px',
            textAlign: 'center',
          }}
        >
          <div>
            <p>请选择授权方式以继续</p>
          </div>
        </div>
      </>
    )
  }

  // 试用过期或用户主动选激活 → 强制激活授权
  return (
    <>
      <LicenseActivation
        onActivated={() => {
          setState('authorized')
          checkStatus()
        }}
        onSwitchToTrial={async () => {
          // 直接调 start_trial，跳过回到 choice 中转
          try {
            const result = await invoke<TrialStatusResult>('start_trial')
            setTrialInfo(result)
            setState('authorized')
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            setError(`开始试用失败：${msg}`)
          }
        }}
      />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: 'var(--bg)',
          color: 'var(--text-secondary)',
          fontSize: '13px',
          padding: '20px',
          textAlign: 'center',
        }}
      >
        <div>
          <p>PMTool 需要有效的授权才能使用</p>
          {error && (
            <p style={{ marginTop: '8px', color: '#cf1322', fontSize: '12px' }}>
              {error}
            </p>
          )}
          {trialInfo !== null && trialInfo.days_remaining !== null && trialInfo.days_remaining <= 0 && (
            <p style={{ marginTop: '8px', color: '#cf1322', fontSize: '12px' }}>
              试用已过期
            </p>
          )}
        </div>
      </div>
    </>
  )
}

/**
 * 启动选择弹窗（首次启动，无 license 也无试用时）
 */
function StartChoiceModal({
  error,
  onStartTrial,
  onActivate,
}: {
  error: string | null
  onStartTrial: () => void
  onActivate: () => void
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.15)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
    >
      <div
        data-testid="start-choice-modal"
        style={{
          width: '480px',
          maxWidth: '90%',
          background: '#ffffff',
          border: '1px solid var(--color-border-thin)',
          borderRadius: 'var(--radius-md)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
        }}
      >
        <div style={{ padding: '28px 28px 24px' }}>
          <div style={{ marginBottom: '24px' }}>
            <h1
              style={{
                fontSize: '20px',
                fontWeight: 600,
                color: 'var(--color-text)',
                letterSpacing: '-0.01em',
                margin: 0,
                marginBottom: '4px',
              }}
            >
              授权管理
            </h1>
            <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', margin: 0 }}>
              请选择授权方式以继续使用 PMTool
            </p>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexDirection: 'column' }}>
            {/* 试用选项 */}
            <button
              data-testid="start-trial"
              onClick={onStartTrial}
              style={{
                padding: '14px 16px',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border-thin)',
                borderRadius: 'var(--radius)',
                color: 'var(--color-text)',
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'background-color 0.1s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--color-bg-active)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--color-surface)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '2px' }}>
                    开始 7 天免费试用
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                    完整功能体验 7 天
                  </div>
                </div>
                <div style={{ fontSize: '14px', color: 'var(--color-text-tertiary)' }}>›</div>
              </div>
            </button>

            {/* 激活授权选项 */}
            <button
              data-testid="start-activate"
              onClick={onActivate}
              style={{
                padding: '14px 16px',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border-thin)',
                borderRadius: 'var(--radius)',
                color: 'var(--color-text)',
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'background-color 0.1s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--color-bg-active)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--color-surface)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '2px' }}>
                    激活授权码
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                    已有授权码？立即激活以解锁完整功能
                  </div>
                </div>
                <div style={{ fontSize: '14px', color: 'var(--color-text-tertiary)' }}>›</div>
              </div>
            </button>
          </div>

          {error && (
            <div
              style={{
                marginTop: '14px',
                padding: '10px 14px',
                background: 'var(--color-bg-subtle)',
                border: '1px solid var(--color-status-error)',
                borderRadius: 'var(--radius)',
                color: 'var(--color-status-error)',
                fontSize: '13px',
              }}
            >
              {error}
            </div>
          )}

          <div
            style={{
              marginTop: '18px',
              fontSize: '12px',
              color: 'var(--color-text-tertiary)',
              textAlign: 'center',
              lineHeight: 1.5,
            }}
          >
            授权码请向授权管理员获取 · 试用仅可开始一次
          </div>
        </div>
      </div>
    </div>
  )
}