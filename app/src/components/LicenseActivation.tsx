/**
 * PMTool V2.0 · License 激活模态框（简化版 - 授权码激活）
 * Phase 1 · T1.4 + T1.5
 *
 * 设计依据：PMTOOL 设置中心 & 授权管理开发设计稿
 *   - 输入授权码（PMT1-XXXX-XXXX-XXXX-XXXX-XXXX）
 *   - 调用 activate_license_simple → Ed25519 验证
 *   - 错误：红色 banner · Loading：spinner · 成功：自动关闭
 */

import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { ActivateLicenseResult } from '@/types/license'

interface LicenseActivationProps {
  onActivated?: () => void
  /** 用户没有授权码时点「试用」的回调（让父组件切回 choice 状态或直接调 start_trial） */
  onSwitchToTrial?: () => void
}

export function LicenseActivation({ onActivated, onSwitchToTrial }: LicenseActivationProps) {
  const [input, setInput] = useState('')
  const [deviceId, setDeviceId] = useState('')
  const [deviceIdCopied, setDeviceIdCopied] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 组件挂载时拉取设备唯一值
  useEffect(() => {
    const load = async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const id = await invoke<string>('get_device_id')
        setDeviceId(id)
      } catch (e) {
        console.error('获取设备唯一值失败:', e)
      }
    }
    load()
  }, [])

  // 复制设备唯一值
  const copyDeviceId = async () => {
    if (!deviceId) return
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('copy_to_clipboard', { text: deviceId })
      setDeviceIdCopied(true)
      setTimeout(() => setDeviceIdCopied(false), 2000)
    } catch {
      try {
        await navigator.clipboard.writeText(deviceId)
        setDeviceIdCopied(true)
        setTimeout(() => setDeviceIdCopied(false), 2000)
      } catch (e2) {
        console.error('复制设备 ID 失败:', e2)
      }
    }
  }

  const handleActivate = async () => {
    if (!input.trim()) {
      setError('请输入授权码')
      return
    }

    setError(null)
    setLoading(true)

    try {
      // 清洗换行/空白（textarea 粘贴常带换行）
      const cleaned = input.replace(/[\s\r\n]+/g, '')
      if (!cleaned) {
        setError('请输入授权码')
        setLoading(false)
        return
      }
      const result = await invoke<ActivateLicenseResult>('activate_license_simple', {
        licenseB64: cleaned,
      })

      if (!result.success) {
        throw new Error(result.reason || '授权失败')
      }

      // 成功 → 回调
      onActivated?.()
    } catch (e: any) {
      const msg =
        typeof e === 'string'
          ? e
          : e?.message || JSON.stringify(e) || '未知错误'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

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
        style={{
          width: '520px',
          maxWidth: '90%',
          background: '#ffffff',
          border: '1px solid var(--color-border-thin)',
          borderRadius: 'var(--radius-md)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
        }}
        data-testid="license-activation-modal"
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px 16px',
            borderBottom: '1px solid var(--color-border-thin)',
          }}
        >
          <h1
            style={{
              fontSize: '18px',
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
            请输入授权管理员提供的授权码
          </p>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px' }}>
          {/* 当前设备 ID（让用户复制给授权管理员生成新授权码） */}
          <div style={{ marginBottom: '16px' }}>
            <div
              style={{
                fontSize: '13px',
                color: 'var(--color-text-secondary)',
                marginBottom: '8px',
              }}
            >
              当前设备
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
              }}
            >
              <code
                style={{
                  flex: 1,
                  padding: '8px 10px',
                  fontSize: '12px',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--color-text)',
                  background: '#ffffff',
                  border: '1px solid var(--color-border-thin)',
                  borderRadius: 'var(--radius)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {deviceId || '加载中…'}
              </code>
              <button
                onClick={copyDeviceId}
                disabled={!deviceId}
                style={{
                  flexShrink: 0,
                  padding: '8px 14px',
                  background: deviceIdCopied ? 'var(--color-success)' : '#ffffff',
                  color: deviceIdCopied ? '#ffffff' : 'var(--color-text)',
                  border: '1px solid ' + (deviceIdCopied ? 'var(--color-success)' : 'var(--color-border-thin)'),
                  borderRadius: 'var(--radius)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: deviceId ? 'pointer' : 'not-allowed',
                  transition: 'all 0.15s',
                }}
              >
                {deviceIdCopied ? '已复制 ✓' : '复制'}
              </button>
            </div>
            <div
              style={{
                fontSize: '11px',
                color: 'var(--color-text-tertiary)',
                marginTop: '6px',
                lineHeight: 1.5,
              }}
            >
              请将此设备唯一值提供给授权管理员，用于生成本设备授权。
            </div>
          </div>

          <div
            style={{
              fontSize: '13px',
              color: 'var(--color-text-secondary)',
              marginBottom: '12px',
            }}
          >
            授权码
          </div>
          <div style={{ position: 'relative', marginBottom: '12px' }}>
            <textarea
              data-testid="license-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="PMT1-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX..."
              rows={4}
              disabled={loading}
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: '12px',
                fontFamily: 'var(--font-mono)',
                border: `1px solid ${error ? 'var(--color-status-error)' : 'var(--color-border-thin)'}`,
                borderRadius: 'var(--radius)',
                background: 'var(--color-bg)',
                color: 'var(--color-text)',
                outline: 'none',
                resize: 'vertical',
                minHeight: '80px',
                wordBreak: 'break-all',
                transition: 'border-color 0.1s',
              }}
              onFocus={(e) => {
                if (!error) e.target.style.borderColor = 'var(--color-accent)'
              }}
              onBlur={(e) => {
                if (!error) e.target.style.borderColor = 'var(--color-border-thin)'
              }}
            />
            <div
              style={{
                position: 'absolute',
                right: '10px',
                bottom: '8px',
                fontSize: '11px',
                color: 'var(--color-text-tertiary)',
                pointerEvents: 'none',
              }}
            >
              {input.length} 字符
            </div>
          </div>

          {error && (
            <div
              data-testid="license-error"
              style={{
                padding: '8px 12px',
                background: 'transparent',
                border: '1px solid var(--color-status-error)',
                borderRadius: 'var(--radius)',
                color: 'var(--color-status-error)',
                fontSize: '12px',
                marginBottom: '12px',
              }}
            >
              {error}
            </div>
          )}

          {/* Footer */}
          <div
            style={{
              display: 'flex',
              gap: '10px',
              paddingTop: '14px',
              borderTop: '1px solid var(--color-border-thin)',
            }}
          >
            <button
              data-testid="license-cancel"
              onClick={() => {
                setInput('')
                setError(null)
              }}
              disabled={loading}
              style={{
                flex: 1,
                padding: '10px 16px',
                background: 'var(--color-surface)',
                color: 'var(--color-text)',
                border: '1px solid var(--color-border-thin)',
                borderRadius: 'var(--radius)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'background-color 0.1s',
              }}
              onMouseEnter={(e) => {
                if (!loading) e.currentTarget.style.background = 'var(--color-bg-active)'
              }}
              onMouseLeave={(e) => {
                if (!loading) e.currentTarget.style.background = 'var(--color-surface)'
              }}
            >
              清空
            </button>
            <button
              data-testid="license-activate"
              onClick={handleActivate}
              disabled={loading || !input.trim()}
              style={{
                flex: 1,
                padding: '10px 16px',
                background: loading || !input.trim() ? 'var(--color-bg-muted)' : 'var(--color-accent)',
                color: loading || !input.trim() ? 'var(--color-text-tertiary)' : 'var(--color-text-on-accent)',
                border: 'none',
                borderRadius: 'var(--radius)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
                transition: 'opacity 0.1s',
              }}
            >
              {loading ? '验证中…' : '激活'}
            </button>
          </div>

          {/* 没有授权码？开始试用 */}
          {onSwitchToTrial && (
            <div
              style={{
                marginTop: '14px',
                textAlign: 'center',
                fontSize: '12px',
                color: 'var(--color-text-secondary)',
              }}
            >
              还没有授权码？
              <button
                data-testid="switch-to-trial"
                onClick={onSwitchToTrial}
                disabled={loading}
                style={{
                  marginLeft: '4px',
                  padding: 0,
                  background: 'transparent',
                  color: 'var(--color-accent)',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  textDecoration: 'underline',
                }}
              >
                开始 7 天免费试用
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
