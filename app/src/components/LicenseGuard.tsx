/**
 * PMTool V2.0 · License Route Guard（2026-09-16 授权隔离改造版）
 *
 * 设计依据：
 *   - 启动授权判定由【后端】完成（Device Identity + 安全存储 License 独立验证），
 *     前端只读取 get_authorization_state 结果并渲染，不再自行查询数据库判定。
 *   - 状态机：
 *     1) licensed            → 渲染主应用
 *     2) trial 且剩余天数>0   → 渲染主应用
 *     3) not_authorized      → 首次启动（无授权记录）→ 选择弹窗（开始试用 / 激活授权）
 *     4) trial 过期 / License 失效 → 强制激活授权（仅显示激活弹窗）
 */

import { useState, useEffect, type ReactNode } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { LicenseActivation } from './LicenseActivation'
import type { AuthorizationStateView, TrialStatusResult } from '@/types/license'

type GuardState = 'loading' | 'authorized' | 'choice' | 'activation'

interface LicenseGuardProps {
  children: ReactNode
}

export function LicenseGuard({ children }: LicenseGuardProps) {
  const [state, setState] = useState<GuardState>('loading')
  const [auth, setAuth] = useState<AuthorizationStateView | null>(null)
  const [trialInfo, setTrialInfo] = useState<TrialStatusResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const checkStatus = async () => {
    try {
      setError(null)
      // 后端启动时已计算授权判定（安全存储 + 设备绑定 + 验签，无 DB）
      const result = await invoke<AuthorizationStateView>('get_authorization_state')
      setAuth(result)

      // 1. 正式授权有效 → 放行
      if (result.state === 'licensed') {
        setState('authorized')
        return
      }

      // 2. 试用中 → 放行
      if (
        result.state === 'trial' &&
        result.days_remaining !== null &&
        result.days_remaining > 0
      ) {
        setTrialInfo({
          is_trial: true,
          days_remaining: result.days_remaining,
          started_at: null,
          expire_at: result.expire_time,
        })
        setState('authorized')
        return
      }

      // 3. 试用已过期 → 强制激活
      if (result.state === 'trial' && result.days_remaining !== null && result.days_remaining <= 0) {
        setState('activation')
        return
      }

      // 4. 未授权：区分首次启动与授权失效
      if (result.state === 'not_authorized') {
        // 曾有 License 但失效（过期/设备不匹配/篡改）→ 强制激活
        // 从未有 License（LICENSE_NOT_FOUND）→ 选择弹窗
        if (result.reason_code && result.reason_code !== 'LICENSE_NOT_FOUND') {
          setError(result.reason || '当前授权已失效，请重新激活')
          setState('activation')
        } else {
          setState('choice')
        }
        return
      }

      // 5. 未知状态兜底
      setError(result.reason || '授权状态异常')
      setState('activation')
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

  // 首次启动（无授权无试用）→ 选择弹窗
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
        background: 'var(--glass-overlay)',
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
          background: 'var(--glass-bg-strong)',
          backdropFilter: 'var(--glass-blur)',
          WebkitBackdropFilter: 'var(--glass-blur)',
          border: '1px solid var(--glass-border)',
          borderRadius: 'var(--glass-radius)',
          boxShadow: 'var(--glass-shadow)',
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