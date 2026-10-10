/**
 * PMTool · 设置中心「通知」分区
 * 2026-09-18 · docs/notification-center-rfc-2026-09-18.md §十六/§十七/§十八/§二十
 *
 * 2026-09-2? 精简（维护者拍板：只留 站内消息 + 邮件）：
 *   - 移除 Windows/macOS 系统弹窗通知、飞书/钉钉/企业微信渠道
 *   - 移除「系统通知权限」区块
 *
 * 结构：
 *   - 基础设置：站内消息开关 + 测试通知
 *   - 通知渠道：站内消息开关
 *   - 外部渠道：邮件（SMTP）配置与测试发送
 *   - 默认通知：内置事件类别的启停 / 渠道勾选 / 优先级（红线 11/12）
 *
 * 安全（红线 4/7）：SMTP 密码只进 OS 安全存储；界面只显示「已保存/未保存」，不回显凭证。
 */

import { useEffect, useState } from 'react'
import { Bell, Send, ChevronDown, ChevronRight } from 'lucide-react'
import {
  listChannels,
  setChannel,
  saveChannel,
  channelHasSecret,
  clearChannelSecret,
  testChannel,
  listRules,
  setRule,
  sendTest,
  type NotificationChannel,
  type NotificationRule,
  type ChannelConfig,
} from '@/services/notification'

/** 渠道显示名（全中文） */
const CHANNEL_LABELS: Record<string, string> = {
  IN_APP: '站内消息',
  EMAIL: '邮件',
}

/** 优先级：值走 DB（英文枚举），界面全中文 */
const PRIORITY_OPTIONS: { value: string; label: string }[] = [
  { value: 'LOW', label: '低' },
  { value: 'NORMAL', label: '普通' },
  { value: 'HIGH', label: '高' },
  { value: 'CRITICAL', label: '紧急' },
]

/** 外部渠道（当前只有邮件） */
const EXTERNAL_TYPES = ['EMAIL']

function ToggleRow({
  label,
  on,
  onToggle,
  hint,
}: {
  label: string
  on: boolean
  onToggle: (v: boolean) => void
  hint?: string
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 0',
        borderBottom: '1px solid var(--color-border-thin)',
      }}
    >
      <div>
        <div style={{ fontSize: '13.5px', fontWeight: 500 }}>{label}</div>
        {hint && <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }}>{hint}</div>}
      </div>
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => onToggle(e.target.checked)}
        style={{ accentColor: 'var(--color-accent)' }}
      />
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '10px 0' }}>
      <div style={{ fontSize: '13.5px', fontWeight: 500 }}>{label}</div>
      {children}
    </div>
  )
}

function SectionTitle({ title, desc }: { title: string; desc: string }) {
  return (
    <div style={{ marginBottom: '18px' }}>
      <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0, marginBottom: '2px' }}>{title}</h2>
      <p style={{ fontSize: '12.5px', color: 'var(--color-text-secondary)', margin: 0 }}>{desc}</p>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  fontSize: '13px',
  padding: '6px 10px',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--color-bg-subtle)',
  color: 'var(--color-text)',
  border: '1px solid var(--color-border-thin)',
}

const btnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  fontSize: '13px',
  padding: '6px 14px',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--color-bg-active)',
  color: 'var(--color-text)',
  cursor: 'pointer',
}

// ============================================================
// 外部渠道配置卡（邮件）
// ============================================================

function ExternalChannelCard({
  ch,
  onSaved,
}: {
  ch: NotificationChannel
  onSaved: () => void
}) {
  const [open, setOpen] = useState(false)
  const [hasSecret, setHasSecret] = useState(false)
  const [cfg, setCfg] = useState<ChannelConfig>({})
  const [secret, setSecret] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    try {
      setCfg(JSON.parse(ch.config || '{}'))
    } catch {
      setCfg({})
    }
    void channelHasSecret(ch.id).then(setHasSecret).catch(() => {})
  }, [ch.id, ch.config])

  const set = (patch: Partial<ChannelConfig>) => setCfg((prev) => ({ ...prev, ...patch }))

  const handleSave = async () => {
    setBusy(true)
    setMsg(null)
    try {
      await saveChannel(ch.id, cfg, secret || undefined)
      setSecret('')
      setHasSecret(await channelHasSecret(ch.id))
      setMsg('已保存')
      onSaved()
    } catch (e) {
      setMsg(`保存失败：${e}`)
    } finally {
      setBusy(false)
    }
  }

  const handleTest = async () => {
    setBusy(true)
    setMsg(null)
    try {
      setMsg(await testChannel(ch.id))
    } catch (e) {
      setMsg(String(e))
    } finally {
      setBusy(false)
    }
  }

  const handleClearSecret = async () => {
    setBusy(true)
    try {
      await clearChannelSecret(ch.id)
      setHasSecret(false)
      setMsg('凭证已删除')
    } catch (e) {
      setMsg(String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      style={{
        border: '1px solid var(--color-border-thin)',
        borderRadius: 'var(--radius)',
        marginBottom: '10px',
        overflow: 'hidden',
      }}
    >
      {/* 卡头：启用开关 + 展开 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 12px',
          background: 'var(--color-bg-subtle)',
        }}
      >
        <button
          onClick={() => setOpen((v) => !v)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '13.5px',
            fontWeight: 500,
            color: 'var(--color-text)',
            background: 'transparent',
            cursor: 'pointer',
          }}
        >
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          {CHANNEL_LABELS[ch.channelType] ?? '邮件'}
          {hasSecret && (
            <span style={{ fontSize: '11px', color: 'var(--success, #16a34a)', fontWeight: 400 }}>
              · 凭证已保存
            </span>
          )}
        </button>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={ch.enabled}
            onChange={async (e) => {
              const next = e.target.checked
              try {
                await setChannel(ch.id, next, ch.config)
                onSaved()
              } catch (err) {
                setMsg(`操作失败：${err}`)
                onSaved()
              }
            }}
            style={{ accentColor: 'var(--color-accent)' }}
          />
          启用
        </label>
      </div>

      {open && (
        <div style={{ padding: '4px 12px 14px' }}>
          <Field label="SMTP 服务器">
            <input
              style={inputStyle}
              value={cfg.smtpHost ?? ''}
              placeholder="如 smtp.qq.com"
              onChange={(e) => set({ smtpHost: e.target.value })}
            />
          </Field>
          <div style={{ display: 'flex', gap: '12px' }}>
            <div style={{ flex: 1 }}>
              <Field label="端口">
                <input
                  style={inputStyle}
                  type="number"
                  value={cfg.smtpPort ?? 465}
                  onChange={(e) => set({ smtpPort: Number(e.target.value) || undefined })}
                />
              </Field>
            </div>
            <div style={{ flex: 1 }}>
              <Field label="加密方式">
                <select
                  style={inputStyle}
                  value={cfg.encryption ?? 'SSL'}
                  onChange={(e) => set({ encryption: e.target.value })}
                >
                  <option value="SSL">SSL（465）</option>
                  <option value="STARTTLS">STARTTLS（587）</option>
                  <option value="NONE">不加密（25）</option>
                </select>
              </Field>
            </div>
          </div>
          <Field label="登录账号">
            <input
              style={inputStyle}
              value={cfg.username ?? ''}
              placeholder="通常与发件邮箱相同"
              onChange={(e) => set({ username: e.target.value })}
            />
          </Field>
          <Field label={hasSecret ? '密码 / 授权码（已保存，留空则不修改）' : '密码 / 授权码'}>
            <input
              style={inputStyle}
              type="password"
              value={secret}
              placeholder={hasSecret ? '••••••••' : '邮箱 SMTP 授权码'}
              onChange={(e) => setSecret(e.target.value)}
            />
          </Field>
          <div style={{ display: 'flex', gap: '12px' }}>
            <div style={{ flex: 1 }}>
              <Field label="发件邮箱">
                <input
                  style={inputStyle}
                  value={cfg.fromEmail ?? ''}
                  placeholder="noreply@example.com"
                  onChange={(e) => set({ fromEmail: e.target.value })}
                />
              </Field>
            </div>
            <div style={{ flex: 1 }}>
              <Field label="发件人名称">
                <input
                  style={inputStyle}
                  value={cfg.fromName ?? ''}
                  placeholder="PMTool"
                  onChange={(e) => set({ fromName: e.target.value })}
                />
              </Field>
            </div>
          </div>
          <Field label="默认收件人">
            <input
              style={inputStyle}
              value={cfg.recipient ?? ''}
              placeholder="多个邮箱用英文逗号分隔"
              onChange={(e) => set({ recipient: e.target.value })}
            />
          </Field>

          {/* 操作区 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
            <button onClick={handleSave} disabled={busy} style={btnStyle}>
              保存配置
            </button>
            <button onClick={handleTest} disabled={busy} style={btnStyle}>
              <Send size={13} strokeWidth={1.75} />
              测试发送
            </button>
            {hasSecret && (
              <button
                onClick={handleClearSecret}
                disabled={busy}
                style={{ ...btnStyle, color: 'var(--danger, #dc2626)' }}
              >
                删除凭证
              </button>
            )}
          </div>
          {msg && (
            <div style={{ fontSize: '12.5px', marginTop: '8px', color: 'var(--color-text-secondary)' }}>
              {msg}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================
// 主面板
// ============================================================

export function NotificationSettingsPanel() {
  const [channels, setChannels] = useState<NotificationChannel[]>([])
  const [rules, setRules] = useState<NotificationRule[]>([])
  const [loading, setLoading] = useState(true)
  const [testResult, setTestResult] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const [chs, rls] = await Promise.all([listChannels(), listRules()])
      setChannels(chs)
      setRules(rls)
    } catch (e) {
      setTestResult(String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const toggleChannel = async (ch: NotificationChannel, enabled: boolean) => {
    setChannels((prev) => prev.map((c) => (c.id === ch.id ? { ...c, enabled } : c)))
    try {
      await setChannel(ch.id, enabled, ch.config)
    } catch (e) {
      setChannels((prev) => prev.map((c) => (c.id === ch.id ? { ...c, enabled: !enabled } : c)))
      setTestResult(`操作失败：${e}`)
    }
  }

  const updateRule = async (r: NotificationRule, patch: Partial<NotificationRule>) => {
    const next = { ...r, ...patch }
    const channelIds = JSON.parse(next.channelIds || '[]') as string[]
    setRules((prev) => prev.map((x) => (x.id === r.id ? next : x)))
    try {
      await setRule(next.id, next.enabled, channelIds, next.priority)
    } catch (e) {
      setRules((prev) => prev.map((x) => (x.id === r.id ? r : x)))
      setTestResult(`操作失败：${e}`)
    }
  }

  const handleTest = async () => {
    setTestResult(null)
    try {
      await sendTest()
      setTestResult('测试通知已发送')
    } catch (e) {
      setTestResult(`发送失败：${e}`)
    }
  }

  /** 可勾选的渠道（站内 + 邮件） */
  const selectableChannels = channels.filter((c) =>
    ['IN_APP', ...EXTERNAL_TYPES].includes(c.channelType),
  )
  const localChannels = channels.filter((c) => ['IN_APP'].includes(c.channelType))
  const externalChannels = channels.filter((c) => EXTERNAL_TYPES.includes(c.channelType))

  return (
    <div style={{ maxWidth: '640px' }}>
      {/* 基础设置 */}
      <SectionTitle title="基础设置" desc="站内消息的总开关" />
      <ToggleRow label="站内消息" on={true} onToggle={() => {}} hint="消息中心的基础能力，始终可用" />
      <Field label="测试通知">
        <button onClick={handleTest} data-testid="notification-test" style={btnStyle}>
          <Send size={13} strokeWidth={1.75} />
          发送测试通知
        </button>
        {testResult && (
          <div style={{ fontSize: '12.5px', marginTop: '8px', color: 'var(--color-text-secondary)' }}>
            {testResult}
          </div>
        )}
      </Field>

      {/* 通知渠道 */}
      <div style={{ marginTop: '28px' }}>
        <SectionTitle title="通知渠道" desc="设置中心配置「有什么渠道」；规则里再选「用哪个渠道」发送" />
        {loading && <div style={{ fontSize: '13px', color: 'var(--color-text-tertiary)' }}>加载中…</div>}
        {localChannels.map((ch) => (
          <ToggleRow
            key={ch.id}
            label={CHANNEL_LABELS[ch.channelType] ?? ch.channelType}
            on={ch.enabled}
            onToggle={(v) => void toggleChannel(ch, v)}
          />
        ))}
      </div>

      {/* 外部渠道 */}
      <div style={{ marginTop: '24px' }}>
        <div style={{ marginBottom: '12px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, margin: 0, marginBottom: '2px' }}>外部渠道</h3>
          <p style={{ fontSize: '12.5px', color: 'var(--color-text-secondary)', margin: 0 }}>
            配置后可将通知发送到邮箱；密码保存在系统安全存储中，不会写入数据库。
          </p>
        </div>
        {externalChannels.map((ch) => (
          <ExternalChannelCard key={ch.id} ch={ch} onSaved={() => void load()} />
        ))}
      </div>

      {/* 默认通知（规则） */}
      <div style={{ marginTop: '28px' }}>
        <SectionTitle title="默认通知" desc="系统内置通知规则 · 可查看 / 修改 / 停用" />
        {rules.map((r) => {
          const ids = JSON.parse(r.channelIds || '[]') as string[]
          return (
            <div key={r.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--color-border-thin)' }}>
              <ToggleRow label={r.name} on={r.enabled} onToggle={(v) => void updateRule(r, { enabled: v })} />
              {r.enabled && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '4px 0 0 0', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    {selectableChannels.map((ch) => {
                      const id = ch.channelType.toLowerCase()
                      const on = ids.includes(id)
                      return (
                        <label
                          key={ch.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '12.5px',
                            color: 'var(--color-text-secondary)',
                            cursor: 'pointer',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={(e) => {
                              const nextIds = e.target.checked
                                ? [...ids, id]
                                : ids.filter((x) => x !== id)
                              void updateRule(r, { channelIds: JSON.stringify(nextIds) })
                            }}
                            style={{ accentColor: 'var(--color-accent)' }}
                          />
                          {CHANNEL_LABELS[ch.channelType] ?? ch.channelType}
                        </label>
                      )
                    })}
                  </div>
                  <select
                    value={r.priority}
                    onChange={(e) => void updateRule(r, { priority: e.target.value })}
                    style={{ fontSize: '12.5px', padding: '3px 6px', borderRadius: 'var(--radius-sm)', background: 'var(--color-bg-subtle)', color: 'var(--color-text)', border: '1px solid var(--color-border-thin)' }}
                  >
                    {PRIORITY_OPTIONS.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* 说明 */}
      <div
        style={{
          marginTop: '24px',
          padding: '12px 14px',
          borderRadius: 'var(--radius)',
          background: 'var(--color-bg-subtle)',
          fontSize: '12.5px',
          color: 'var(--color-text-secondary)',
        }}
      >
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
          <Bell size={14} strokeWidth={1.5} style={{ marginTop: '2px', flexShrink: 0 }} />
          <span>
            当前支持站内消息与邮件通知；Windows / macOS 系统弹窗及其它 IM 渠道已不再提供。
          </span>
        </div>
      </div>
    </div>
  )
}

export default NotificationSettingsPanel