/**
 * PMTool V2.0 · 设置
 * Phase A 产品化整改 P4
 *
 * 设计依据：维护者 2026-08-22 反馈
 *   - 设置从 sidebar 一级菜单移走（由头像菜单进入）
 *   - 进入后是面板视图（左分类 + 主区表单）
 *   - 7 个分类：个人 / 外观 / 数据 / AI 配置 / 快捷键 / 授权 / 关于
 *   - 不用 emoji · 统一 Lucide
 */

import { useState, useEffect } from 'react'
import {
  User,
  Palette,
  Database,
  Sparkles,
  Keyboard,
  Info,
  Cpu,
  FolderOpen,
  HardDrive,
  CheckCircle2,
  Shield,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { LicenseStatus, ActivateLicenseResult } from '@/types/license'

interface SettingsSection {
  id: string
  label: string
  Icon: LucideIcon
}

const SECTIONS: SettingsSection[] = [
  { id: 'profile', label: '个人', Icon: User },
  { id: 'appearance', label: '外观', Icon: Palette },
  { id: 'data', label: '数据', Icon: Database },
  { id: 'ai', label: 'AI 配置', Icon: Sparkles },
  { id: 'shortcuts', label: '快捷键', Icon: Keyboard },
  { id: 'license', label: '授权', Icon: Shield },
  { id: 'about', label: '关于', Icon: Info },
]

export function SettingsPage() {
  const [active, setActive] = useState('profile')

  return (
    <div
      style={{
        display: 'flex',
        height: '100%',
      }}
    >
      {/* 左分类导航 */}
      <aside
        style={{
          width: '220px',
          padding: '20px 12px',
          borderRight: '1px solid var(--color-border-thin)',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            fontSize: '11px',
            fontWeight: 600,
            color: 'var(--color-text-tertiary)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            padding: '0 10px 8px',
            marginBottom: '4px',
          }}
        >
          设置
        </div>
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            data-testid={`settings-${s.label}`}
            onClick={() => setActive(s.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              width: '100%',
              padding: '6px 10px',
              marginBottom: '2px',
              borderRadius: 'var(--radius)',
              fontSize: '13px',
              fontWeight: active === s.id ? 500 : 400,
              color:
                active === s.id
                  ? 'var(--color-text)'
                  : 'var(--color-text-secondary)',
              background:
                active === s.id ? 'var(--color-bg-active)' : 'transparent',
              textAlign: 'left',
              transition: 'background-color 0.1s',
            }}
            onMouseEnter={(e) => {
              if (active !== s.id) e.currentTarget.style.background = 'var(--color-bg-hover)'
            }}
            onMouseLeave={(e) => {
              if (active !== s.id) e.currentTarget.style.background = 'transparent'
            }}
          >
            <s.Icon size={14} strokeWidth={1.75} />
            <span style={{ flex: 1 }}>{s.label}</span>
          </button>
        ))}
      </aside>

      {/* 主区 */}
      <main
        style={{
          flex: 1,
          padding: '40px 48px',
          overflowY: 'auto',
          maxWidth: '720px',
        }}
      >
        {active === 'profile' && <ProfileSection />}
        {active === 'appearance' && <AppearanceSection />}
        {active === 'data' && <DataSection />}
        {active === 'ai' && <AISection />}
        {active === 'shortcuts' && <ShortcutsSection />}
        {active === 'license' && <LicenseSection />}
        {active === 'about' && <AboutSection />}
      </main>
    </div>
  )
}

// ============================================================
// 各设置子区
// ============================================================

function ProfileSection() {
  const [deviceId, setDeviceId] = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const id = await invoke<string>('get_device_id')
        setDeviceId(id)
      } catch (e) {
        console.error('获取设备标识失败:', e)
      }
    }
    load()
  }, [])

  return (
    <>
      <SectionHeader title="个人资料" desc="管理你的基本信息和设备标识" />
      <Field label="头像">
        <Avatar />
      </Field>
      <Field label="姓名">
        <Input defaultValue="刘海东" />
      </Field>
      <Field label="邮箱">
        <Input defaultValue="liu.haidong@example.com" />
      </Field>
      <Field label="角色">
        <Input defaultValue="实施经理" />
      </Field>
      <Field label="机器码">
        <ReadonlyRow
          Icon={Cpu}
          value={deviceId || '加载中…'}
        />
      </Field>
    </>
  )
}

function AppearanceSection() {
  return (
    <>
      <SectionHeader title="外观" desc="主题、字体、间距" />
      <Field label="主题">
        <RadioGroup
          options={[
            { value: 'light', label: '浅色' },
            { value: 'dark', label: '深色' },
            { value: 'auto', label: '跟随系统' },
          ]}
          default="auto"
        />
      </Field>
      <Field label="主色">
        <ColorSwatches />
      </Field>
      <Field label="字号">
        <RadioGroup
          options={[
            { value: 'compact', label: '紧凑' },
            { value: 'default', label: '默认' },
            { value: 'large', label: '宽松' },
          ]}
          default="default"
        />
      </Field>
    </>
  )
}

function DataSection() {
  return (
    <>
      <SectionHeader title="数据" desc="存储位置 · 备份恢复" />
      <Field label="数据目录">
        <ReadonlyRow Icon={FolderOpen} value="~/Library/Application Support/PMToolData" />
      </Field>
      <Field label="已用空间">
        <ReadonlyRow Icon={HardDrive} value="2.4 MB / 10 GB" />
      </Field>
      <Field label="自动备份">
        <Toggle defaultChecked />
      </Field>
      <Field label="最近备份">
        <ReadonlyRow
          value="2026-08-22 09:00 · 备份成功"
          Icon={CheckCircle2}
          iconColor="var(--color-status-success)"
        />
      </Field>
    </>
  )
}

function AISection() {
  return (
    <>
      <SectionHeader title="AI 配置" desc="模型选择 · API · 参数" />
      <Field label="默认模型">
        <Select
          options={[
            { value: 'claude', label: 'Claude Sonnet 4' },
            { value: 'gpt', label: 'GPT-4o' },
            { value: 'deepseek', label: 'DeepSeek V3' },
            { value: 'qwen', label: '通义千问' },
            { value: 'ollama', label: 'Ollama（本地）' },
          ]}
        />
      </Field>
      <Field label="API Key">
        <Input type="password" defaultValue="sk-••••••••••••••••" />
      </Field>
      <Field label="温度">
        <ReadonlyRow value="0.3（推荐用于项目分析）" />
      </Field>
    </>
  )
}

function ShortcutsSection() {
  const SHORTCUTS: { action: string; keys: string }[] = [
    { action: '命令面板', keys: '⌘ K' },
    { action: '新建项目', keys: '⌘ ⇧ N' },
    { action: '新建任务', keys: 'T' },
    { action: '折叠侧栏', keys: '⌘ ▾' },
    { action: '切换主题', keys: '⌘ ⇧ L' },
    { action: '跳到首页', keys: '⌘ 1' },
    { action: '跳到任务', keys: '⌘ 2' },
    { action: '跳到项目', keys: '⌘ 3' },
  ]
  return (
    <>
      <SectionHeader title="快捷键" desc="所有快捷键一览" />
      <div
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border-thin)',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
        }}
      >
        {SHORTCUTS.map((s, i) => (
          <div
            key={s.action}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 16px',
              borderBottom:
                i === SHORTCUTS.length - 1 ? 'none' : '1px solid var(--color-border-thin)',
            }}
          >
            <span style={{ fontSize: '13px', color: 'var(--color-text)' }}>{s.action}</span>
            <kbd
              style={{
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                color: 'var(--color-text-secondary)',
                padding: '2px 8px',
                background: 'var(--color-bg-subtle)',
                border: '1px solid var(--color-border-thin)',
                borderRadius: '4px',
              }}
            >
              {s.keys}
            </kbd>
          </div>
        ))}
      </div>
    </>
  )
}

function LicenseSection() {
  const [loading, setLoading] = useState(true)

  // 从 Rust 获取的真实数据
  const [status, setStatus] = useState<'trial' | 'activated' | 'expired'>('trial')
  const [daysRemaining, setDaysRemaining] = useState<number | null>(null)
  const [expireDate, setExpireDate] = useState<string | null>(null)
  const [deviceId, setDeviceId] = useState('')
  const [licenseCode, setLicenseCode] = useState('')
  const [activating, setActivating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // 初始化：获取设备 ID 和授权状态
  const initialize = async () => {
    setLoading(true)
    try {
      const { invoke } = await import('@tauri-apps/api/core')

      // 获取设备 ID
      const deviceIdResult = await invoke<string>('get_device_id')
      setDeviceId(deviceIdResult)

      // 优先检查正式授权（license 表里有记录就直接视为已授权，不看试用）
      const licenseResult = await invoke<LicenseStatus>('get_license_status')
      if (licenseResult.activated) {
        setStatus('activated')
        if (licenseResult.license?.expire_date) {
          setExpireDate(licenseResult.license.expire_date)
          const expire = new Date(licenseResult.license.expire_date)
          const today = new Date()
          const diffDays = Math.floor((expire.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
          setDaysRemaining(diffDays > 0 ? diffDays : null)
        } else {
          setDaysRemaining(null) // 永久授权
        }
      } else {
        // 没有正式授权，回退到试用状态
        const trialResult = await invoke<{
          is_trial: boolean
          days_remaining: number | null
          started_at: string | null
          expire_at: string | null
        }>('check_trial_status')

        if (trialResult.is_trial && trialResult.days_remaining !== null) {
          setStatus('trial')
          setDaysRemaining(trialResult.days_remaining)
        } else {
          setStatus('expired')
        }
      }
    } catch (e) {
      console.error('初始化授权状态失败:', e)
      setError(e instanceof Error ? e.message : '初始化失败')
    } finally {
      setLoading(false)
    }
  }

  // 组件挂载时初始化授权状态
  useEffect(() => {
    initialize()
  }, [])

  // 复制设备 ID（走 Rust 剪贴板命令，保证可靠）
  const copyDeviceId = async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('copy_to_clipboard', { text: deviceId })
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (e) {
      console.error('复制失败:', e)
      // 兜底：浏览器剪贴板
      try {
        await navigator.clipboard.writeText(deviceId)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch (e2) {
        console.error('复制兜底失败:', e2)
      }
    }
  }

  // 激活授权
  const handleActivate = async () => {
    if (!licenseCode.trim()) {
      setError('请输入授权码')
      return
    }

    setActivating(true)
    setError(null)

    // 调用 Rust API
    try {
      const { invoke } = await import('@tauri-apps/api/core')

      // 验证授权码（清洗所有空白/换行，避免 textarea 粘贴带换行导致签名 base64 错位）
      const cleaned = licenseCode.replace(/[\s\r\n]+/g, '').trim()
      if (!cleaned) {
        setError('请输入授权码')
        setActivating(false)
        return
      }
      const result = await invoke<ActivateLicenseResult>('activate_license_simple', {
        licenseB64: cleaned,
      })

      if (result.success) {
        setStatus('activated')
        setLicenseCode('')
        // 重新初始化
        await initialize()
        // 显示成功提示
        const expireText = result.expire_time
          ? new Date(result.expire_time).toLocaleDateString('zh-CN')
          : '永久授权'
        alert(`授权成功\n\n${result.product || 'PMTool'}\n有效期至：${expireText}`)
      } else {
        setError(result.reason || '授权失败（无 reason）')
      }
    } catch (e: any) {
      // 透传 Rust 端真实错误（避免误导性的"授权失败"）
      const msg =
        typeof e === 'string'
          ? e
          : e?.message || JSON.stringify(e) || '未知错误'
      setError(`授权失败：${msg}`)
    } finally {
      setActivating(false)
    }
  }

  // 组件挂载时初始化
  if (loading) {
    return (
      <>
        <SectionHeader title="授权管理" desc="查看当前授权状态，并管理本设备的授权。" />
        <div style={{ padding: '20px', color: 'var(--color-text-secondary)' }}>
          正在加载授权状态…
        </div>
      </>
    )
  }

  return (
    <>
      <SectionHeader title="授权管理" desc="查看当前授权状态，并管理本设备的授权。" />

      {/* 当前授权状态 */}
      <StatusCard status={status} daysRemaining={daysRemaining} expireDate={expireDate} />

      {/* 当前设备 */}
      <div
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border-thin)',
          borderRadius: 'var(--radius-md)',
          padding: '20px',
          marginBottom: '24px',
        }}
      >
        <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '12px' }}>
          当前设备
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '12px',
          }}
        >
          <code
            style={{
              fontSize: '14px',
              color: 'var(--color-text)',
              background: 'var(--color-bg-subtle)',
              padding: '8px 12px',
              borderRadius: '6px',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {deviceId}
          </code>
          <button
            onClick={copyDeviceId}
            style={{
              fontSize: '12px',
              padding: '6px 12px',
              background: copied ? 'var(--color-success)' : 'var(--color-bg-subtle)',
              color: copied ? 'var(--color-text-on-accent)' : 'var(--color-text)',
              border: copied ? '1px solid var(--color-success)' : '1px solid var(--color-border-thin)',
              borderRadius: '6px',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              if (!copied) e.currentTarget.style.background = 'var(--color-border-thin)'
            }}
            onMouseLeave={(e) => {
              if (!copied) e.currentTarget.style.background = 'var(--color-bg-subtle)'
            }}
          >
            {copied ? '已复制 ✓' : '复制'}
          </button>
        </div>
        <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
          此设备唯一值用于生成本设备授权。<br />
          如需获取或更换授权，请将此值提供给授权管理员。
        </div>
      </div>

      {/* 激活授权 */}
      <div
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border-thin)',
          borderRadius: 'var(--radius-md)',
          padding: '20px',
          marginBottom: '20px',
        }}
      >
        <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '12px' }}>
          激活授权
        </div>
        <textarea
          value={licenseCode}
          onChange={(e) => setLicenseCode(e.target.value)}
          placeholder="PMT1-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX..."
          rows={4}
          style={{
            width: '100%',
            padding: '12px 14px',
            fontSize: '12px',
            fontFamily: 'var(--font-mono)',
            border: '1px solid var(--color-border-thin)',
            borderRadius: 'var(--radius)',
            background: 'var(--color-bg-subtle)',
            color: 'var(--color-text)',
            marginBottom: '8px',
            outline: 'none',
            resize: 'vertical',
            minHeight: '80px',
            wordBreak: 'break-all',
          }}
          disabled={activating}
        />
        {error && (
          <div
            style={{
              fontSize: '12px',
              color: 'var(--color-status-error)',
              marginBottom: '12px',
            }}
          >
            {error}
          </div>
        )}
        <button
          onClick={handleActivate}
          disabled={activating || !licenseCode.trim()}
          style={{
            width: '100%',
            padding: '12px 20px',
            background: activating || !licenseCode.trim() ? 'var(--color-bg-muted)' : 'var(--color-accent)',
            color: activating || !licenseCode.trim() ? 'var(--color-text-secondary)' : 'var(--color-text-on-accent)',
            border: 'none',
            borderRadius: 'var(--radius)',
            fontSize: '14px',
            fontWeight: 600,
            cursor: activating || !licenseCode.trim() ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s',
          }}
        >
          {activating ? '激活中...' : '激活授权'}
        </button>
      </div>
    </>
  )
}

function AboutSection() {
  return (
    <>
      <SectionHeader title="关于" desc="PMTool V2.0" />
      <div
        style={{
          padding: '20px',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border-thin)',
          borderRadius: 'var(--radius-md)',
          fontSize: '13px',
          color: 'var(--color-text-secondary)',
          lineHeight: 1.7,
        }}
      >
        <div style={{ marginBottom: '8px' }}>
          <span style={{ color: 'var(--color-text)' }}>版本</span> · 2.0.0 (Phase A)
        </div>
        <div style={{ marginBottom: '8px' }}>
          <span style={{ color: 'var(--color-text)' }}>授权</span> · 待激活
        </div>
        <div
          style={{
            marginTop: '16px',
            paddingTop: '16px',
            borderTop: '1px solid var(--color-border-thin)',
            fontSize: '12px',
          }}
        >
          PMTool · Personal Project Operating System
          <br />
          实施经理的桌面生产力 App
        </div>
      </div>
    </>
  )
}

// ============================================================
// 通用子组件
// ============================================================

function SectionHeader({ title, desc }: { title: string; desc: string }) {
  return (
    <div style={{ marginBottom: '28px' }}>
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
        {title}
      </h1>
      <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>{desc}</p>
    </div>
  )
}

// 授权状态卡片
function StatusCard({ status, daysRemaining, expireDate }: { status: 'trial' | 'activated' | 'expired'; daysRemaining: number | null; expireDate: string | null }) {
  if (status === 'trial') {
    return (
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(56,189,248,0.1) 0%, rgba(14,165,233,0.08) 100%)',
          border: '1px solid rgba(56,189,248,0.3)',
          borderRadius: '12px',
          padding: '18px',
          marginBottom: '24px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <span style={{ fontSize: '18px' }}>●</span>
          <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-text)' }}>免费试用</span>
        </div>
        <div style={{ fontSize: '14px', color: 'var(--color-text-secondary)', marginBottom: '8px' }}>
          PMTool 正处于免费试用期
        </div>
        <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--color-accent)', marginBottom: '8px' }}>
          剩余 {daysRemaining ?? '?'} 天
        </div>
        <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
          试用期结束后，请输入授权码继续使用。
        </div>
      </div>
    )
  }

  if (status === 'activated') {
    return (
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(16,185,129,0.1) 0%, rgba(5,150,105,0.08) 100%)',
          border: '1px solid rgba(16,185,129,0.3)',
          borderRadius: '12px',
          padding: '18px',
          marginBottom: '24px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <span style={{ fontSize: '18px' }}>●</span>
          <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-text)' }}>已授权</span>
        </div>
        <div style={{ fontSize: '14px', color: 'var(--color-text-secondary)', marginBottom: '8px' }}>
          PMTool
        </div>
        {daysRemaining === null || daysRemaining <= 0 ? (
          <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--success)', marginBottom: '8px' }}>
            永久授权
          </div>
        ) : (
          <>
            <div style={{ fontSize: '14px', color: 'var(--color-text-secondary)', marginBottom: '8px' }}>
              有效期至：{expireDate || '2027-09-03'}
            </div>
            <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--success)', marginBottom: '8px' }}>
              剩余 {daysRemaining} 天
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, rgba(239,68,68,0.1) 0%, rgba(220,38,38,0.08) 100%)',
        border: '1px solid rgba(239,68,68,0.3)',
        borderRadius: '12px',
        padding: '18px',
        marginBottom: '24px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <span style={{ fontSize: '18px' }}>●</span>
        <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-text)' }}>授权已过期</span>
      </div>
      <div style={{ fontSize: '14px', color: 'var(--color-text-secondary)', marginBottom: '8px' }}>
        当前授权已失效。
      </div>
      <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
        请输入新的授权码继续使用。
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '24px',
        padding: '14px 0',
        borderBottom: '1px solid var(--color-border-thin)',
      }}
    >
      <div
        style={{
          width: '120px',
          flexShrink: 0,
          fontSize: '13px',
          color: 'var(--color-text-secondary)',
          paddingTop: '6px',
        }}
      >
        {label}
      </div>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  )
}

function Input({ defaultValue, type = 'text' }: { defaultValue?: string; type?: string }) {
  return (
    <input
      type={type}
      defaultValue={defaultValue}
      style={{
        width: '100%',
        maxWidth: '320px',
        padding: '6px 10px',
        background: 'var(--color-bg-subtle)',
        border: '1px solid var(--color-border-thin)',
        borderRadius: 'var(--radius)',
        fontSize: '13px',
        color: 'var(--color-text)',
        outline: 'none',
      }}
    />
  )
}

function ReadonlyRow({
  Icon,
  value,
  iconColor = 'var(--color-text-tertiary)',
}: {
  Icon?: React.ComponentType<{ size?: number; strokeWidth?: number; color?: string }>
  value: string
  iconColor?: string
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '6px 10px',
        background: 'var(--color-bg-subtle)',
        border: '1px solid var(--color-border-thin)',
        borderRadius: 'var(--radius)',
        fontSize: '12.5px',
        color: 'var(--color-text)',
        fontFamily: 'var(--font-mono)',
        width: 'fit-content',
        maxWidth: '100%',
      }}
    >
      {Icon && <Icon size={12} strokeWidth={1.75} color={iconColor} />}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</span>
    </div>
  )
}

function RadioGroup({
  options,
  default: defaultValue,
}: {
  options: { value: string; label: string }[]
  default: string
}) {
  return (
    <div style={{ display: 'flex', gap: '6px' }}>
      {options.map((o) => (
        <label
          key={o.value}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            background:
              o.value === defaultValue ? 'var(--color-accent-subtle)' : 'var(--color-bg-subtle)',
            border: '1px solid var(--color-border-thin)',
            borderRadius: 'var(--radius)',
            fontSize: '12.5px',
            color: 'var(--color-text)',
            cursor: 'pointer',
          }}
        >
          <input
            type="radio"
            name={options[0].label}
            defaultChecked={o.value === defaultValue}
            style={{ accentColor: 'var(--color-accent)' }}
          />
          {o.label}
        </label>
      ))}
    </div>
  )
}

function Toggle({ defaultChecked }: { defaultChecked?: boolean }) {
  return (
    <label
      style={{
        position: 'relative',
        display: 'inline-block',
        width: '36px',
        height: '20px',
        cursor: 'pointer',
      }}
    >
      <input
        type="checkbox"
        defaultChecked={defaultChecked}
        style={{ opacity: 0, width: 0, height: 0 }}
      />
      <span
        style={{
          position: 'absolute',
          inset: 0,
          background: defaultChecked ? 'var(--color-accent)' : 'var(--color-bg-muted)',
          borderRadius: '99px',
          transition: 'background-color 0.15s',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: '2px',
            left: defaultChecked ? '18px' : '2px',
            width: '16px',
            height: '16px',
            background: 'var(--color-surface)',
            borderRadius: '50%',
            transition: 'left 0.15s',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          }}
        />
      </span>
    </label>
  )
}

function Select({
  options,
}: {
  options: { value: string; label: string }[]
}) {
  return (
    <select
      style={{
        padding: '6px 10px',
        background: 'var(--color-bg-subtle)',
        border: '1px solid var(--color-border-thin)',
        borderRadius: 'var(--radius)',
        fontSize: '13px',
        color: 'var(--color-text)',
        outline: 'none',
        minWidth: '180px',
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

function ColorSwatches() {
  const COLORS = [
    { id: 'indigo', color: '#5b5ce2' },
    { id: 'blue', color: '#0a84ff' },
    { id: 'teal', color: '#00b4a6' },
    { id: 'orange', color: '#ff8c42' },
    { id: 'gray', color: '#6b7280' },
  ]
  return (
    <div style={{ display: 'flex', gap: '8px' }}>
      {COLORS.map((c) => (
        <button
          key={c.id}
          title={c.id}
          style={{
            width: '24px',
            height: '24px',
            borderRadius: '50%',
            background: c.color,
            border: c.id === 'indigo' ? '2px solid var(--color-text)' : '2px solid transparent',
            outline: c.id === 'indigo' ? '2px solid var(--color-surface)' : 'none',
            outlineOffset: c.id === 'indigo' ? '-4px' : 0,
          }}
        />
      ))}
    </div>
  )
}

function Avatar() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
      }}
    >
      <div
        style={{
          width: '40px',
          height: '40px',
          borderRadius: '50%',
          background: 'var(--color-accent)',
          color: 'var(--color-text-on-accent)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '15px',
          fontWeight: 600,
        }}
      >
        刘
      </div>
      <button
        style={{
          fontSize: '12px',
          color: 'var(--color-accent)',
        }}
      >
        更换头像
      </button>
    </div>
  )
}

// License activation result type
interface LicenseActivationResult {
  success: boolean
  reason?: string
  license?: {
    product: string
    license_type: string
    expire_time?: string
  }
}
