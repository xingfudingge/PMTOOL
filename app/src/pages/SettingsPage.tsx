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
  Info,
  Cpu,
  FolderOpen,
  HardDrive,
  CheckCircle2,
  Shield,
  CalendarDays,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { LicenseStatus, ActivateLicenseResult } from '@/types/license'
import { useSettings, SETTING_KEYS } from '@/state/SettingsProvider'
import { getDataDir, backupData, restoreData, listBackups, getBackupLocation, setBackupLocation, setDataRoot, revealPath, syncHolidays, clearHolidays, deleteBackup, type BackupItem } from '@/services/settings'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { pickProjectDirectory } from '@/services/projectFiles'
import { TimePicker } from '@/components/TimePicker'

interface SettingsSection {
  id: string
  label: string
  Icon: LucideIcon
}

/** 把后端存的 UTC 时间戳转成本地时间显示；空/非法 → '从未' */
function formatLocalDateTime(iso: string | null | undefined): string {
  if (!iso) return '从未'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '从未'
  return d.toLocaleString('zh-CN', { hour12: false })
}

const SECTIONS: SettingsSection[] = [
  { id: 'profile', label: '个人', Icon: User },
  { id: 'appearance', label: '外观', Icon: Palette },
  { id: 'data', label: '数据', Icon: Database },
  { id: 'automation', label: '自动化', Icon: Sparkles },
  { id: 'workday', label: '法定节假日', Icon: CalendarDays },
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
        {active === 'automation' && <AutomationSection />}
        {active === 'workday' && <WorkdaySection />}
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
  const { get, save } = useSettings()

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
      <Field label="姓名">
        <Input
          value={get('userName') ?? ''}
          onChange={(v) => save('userName', v)}
          placeholder="你的姓名"
        />
      </Field>
      <Field label="邮箱">
        <Input
          value={get('userEmail') ?? ''}
          onChange={(v) => save('userEmail', v)}
          placeholder="你的邮箱"
        />
      </Field>
      <Field label="角色">
        <Input
          value={get('userRole') ?? ''}
          onChange={(v) => save('userRole', v)}
          placeholder="你的角色"
        />
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
  const { get, save } = useSettings()
  const theme = get('theme') || 'auto'
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
          value={theme}
          onSelect={(v) => save('theme', v)}
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
          value={get('fontSize') || 'default'}
          onSelect={(v) => save('fontSize', v)}
        />
      </Field>
    </>
  )
}

function DataSection() {
  const { get, save } = useSettings()
  const [dirs, setDirs] = useState<[string, string] | null>(null)
  const [backupDir, setBackupDir] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [backups, setBackups] = useState<BackupItem[]>([])
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const loadBackups = async (dir: string) => { try { setBackups(await listBackups(dir)) } catch (e) { console.warn('[设置] 列出备份失败', e) } }
  useEffect(() => {
    getDataDir().then(setDirs).catch(() => {})
    getBackupLocation().then((d) => { setBackupDir(d); if (d) loadBackups(d) }).catch(() => {})
  }, [])
  const backup = get('autoBackup') === '1'
  const pickBackupDir = async () => { const d = await pickProjectDirectory(); if (d) { await setBackupLocation(d); setBackupDir(d); await loadBackups(d) } }
  const doBackup = async () => {
    if (!backupDir) { setMsg('请先选择备份目录'); return }
    setBusy(true); setMsg(null)
    try { const r = await backupData(backupDir); setMsg('已备份到 ' + r); await loadBackups(backupDir) }
    catch (e) { setMsg('备份失败：' + String(e)) }
    finally { setBusy(false) }
  }
  const pickDataRoot = async () => { const d = await pickProjectDirectory(); if (d) { setBusy(true); try { setMsg(await setDataRoot(d)) } catch (e) { setMsg('迁移失败：' + String(e)) } finally { setBusy(false) } } }
  const doRestore = async (item: string) => {
    if (!backupDir) return
    // Tauri webview 拦截 window.confirm → 直接执行（后端还原前会先自动备份当前数据）
    setBusy(true); setMsg('正在还原（还原前已自动备份当前数据，完成后需重启生效）')
    try { setMsg(await restoreData(backupDir + '/' + item)) }
    catch (e) { setMsg('还原失败：' + String(e)) }
    finally { setBusy(false) }
  }
  const doDeleteBackup = async (name: string) => {
    if (!backupDir) return
    // 二次确认：第一次点击仅进入待确认态，第二次才真正删除
    if (confirmDelete !== name) { setConfirmDelete(name); return }
    setConfirmDelete(null)
    setBusy(true)
    try {
      await deleteBackup(backupDir, name)
      setMsg('已删除备份：' + name)
      await loadBackups(backupDir)
    } catch (e) { setMsg('删除失败：' + String(e)) }
    finally { setBusy(false) }
  }
  // 换电脑/迁移：直接选一个备份 .db 文件导入还原，无需先设备份目录/先备份
  const importBackup = async () => {
    const f = await openDialog({
      title: '选择要导入的备份数据库文件',
      multiple: false,
      directory: false,
      filters: [{ name: '数据库文件', extensions: ['db'] }],
    })
    if (!f || typeof f !== 'string') return
    setBusy(true); setMsg(null)
    try { setMsg(await restoreData(f)) }
    catch (e) { setMsg('导入失败：' + String(e)) }
    finally { setBusy(false) }
  }
  return (
    <>
      <SectionHeader title="数据" desc="存储位置 · 备份恢复" />
      <Field label="数据目录">
        <span className="pms-row">
          <ReadonlyRow Icon={FolderOpen} value={dirs ? dirs[0] : '读取中…'} />
          <button type="button" className="pm-btn" onClick={() => dirs && revealPath(dirs[0])}>打开</button>
          <button type="button" className="pm-btn" disabled={busy} onClick={pickDataRoot}>迁移目录…</button>
        </span>
      </Field>
      <Field label="数据库文件"><ReadonlyRow Icon={Database} value={dirs ? dirs[1] : '读取中…'} /></Field>
      <Field label="自动备份">
        <span className="pms-row">
          <Toggle checked={backup} onChange={(v) => save('autoBackup', v ? '1' : '0')} />
          <input type="time" className="pm-time" defaultValue={get('backupTime') ?? '20:00'} onChange={(e) => save('backupTime', e.target.value)} />
        </span>
      </Field>
      <Field label="备份目录">
        <span className="pms-row">
          <ReadonlyRow Icon={FolderOpen} value={backupDir ?? '未设置'} />
          <button type="button" className="pm-btn" onClick={pickBackupDir}>选择…</button>
          <button type="button" className="pm-btn" disabled={busy} onClick={doBackup}>立即备份</button>
          <button type="button" className="pm-btn" disabled={busy} onClick={importBackup} title="选一个备份 .db 文件直接导入还原（换电脑/迁移数据用）">导入备份</button>
        </span>
      </Field>
      {msg && <div className={/重启|还原|迁移/.test(msg) ? 'pms-msg-warn' : 'pms-msg'}>{msg}</div>}
      {backups.length > 0 && (
        <Field label="备份列表">
          <div>
            {backups.map((b) => (
              <span key={b.name} className="pms-row" style={{ justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--color-border-thin)' }}>
                <span style={{ fontSize: 12, color: 'var(--color-text)' }}>{b.name}</span>
                <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button type="button" className="pm-btn" onClick={() => doRestore(b.name)}>从备份还原</button>
                  {confirmDelete === b.name ? (
                    <>
                      <span style={{ fontSize: 12, color: 'var(--color-status-danger)' }}>确认删除？</span>
                      <button type="button" className="pm-btn-danger" onClick={() => doDeleteBackup(b.name)}>确认</button>
                      <button type="button" className="pm-btn" onClick={() => setConfirmDelete(null)}>取消</button>
                    </>
                  ) : (
                    <button type="button" className="pm-btn-danger" onClick={() => doDeleteBackup(b.name)}>删除</button>
                  )}
                </span>
              </span>
            ))}
          </div>
        </Field>
      )}
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
  const [status, setStatus] = useState<string>('loading')

  // 读真实授权状态，避免写死"待激活"
  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const r = await invoke<LicenseStatus>('get_license_status')
        if (!alive) return
        if (r.activated) {
          if (r.license?.expire_date) {
            setStatus(`已激活 · 有效期至 ${r.license.expire_date}`)
          } else {
            setStatus('已激活 · 永久授权')
          }
        } else {
          const trial = await invoke<{ is_trial: boolean; days_remaining: number | null }>('check_trial_status')
          if (!alive) return
          if (trial.is_trial && trial.days_remaining !== null) {
            setStatus(`试用中 · 剩 ${trial.days_remaining} 天`)
          } else {
            setStatus('待激活')
          }
        }
      } catch (e) {
        if (alive) setStatus('待激活')
      }
    }
    load()
    return () => {
      alive = false
    }
  }, [])

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
          <span style={{ color: 'var(--color-text)' }}>版本</span> · 2.0.0
        </div>
        <div style={{ marginBottom: '8px' }}>
          <span style={{ color: 'var(--color-text)' }}>授权</span> · {status === 'loading' ? '读取中…' : status}
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

function WorkdaySection() {
  const { get, save } = useSettings()
  const [sources, setSources] = useState<{ name: string; url: string }[]>(() => {
    try { const v = get('holidaySources'); return v ? JSON.parse(v) : [
      { name: '节假日API(国内)', url: 'https://timor.tech/api/holiday/year/{year}' },
      { name: 'jsDelivr 镜像', url: 'https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/{year}.json' },
      { name: 'GitHub Raw', url: 'https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/{year}.json' },
    ] } catch { return [] }
  })
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const active = parseInt(get('holidayActive') || '0', 10) || 0
  const persist = (list: { name: string; url: string }[]) => { setSources(list); save('holidaySources', JSON.stringify(list)) }
  const addSource = () => persist([...sources, { name: '', url: '' }])
  const updSource = (i: number, k: 'name' | 'url', v: string) => { const l = sources.slice(); l[i] = { ...l[i], [k]: v }; persist(l) }
  const delSource = (i: number) => { const l = sources.filter((_, j) => j !== i); persist(l); if (active >= l.length && active !== 0) save('holidayActive', String(l.length - 1)) }
  const doSync = async () => {
    const src = sources[active] || sources.find((x) => x.url) || sources[0]
    if (!src || !src.url) { setMsg('请先配置一个同步源地址'); return }
    setBusy(true); setMsg(null)
    try { const r = await syncHolidays(src.url, new Date().getFullYear()); setMsg(r); save('holidayLastSync', new Date().toISOString()) }
    catch (e) { setMsg('同步失败：' + String(e)) }
    finally { setBusy(false) }
  }
  const doClear = async () => {
    setBusy(true); setMsg(null)
    try { const n = await clearHolidays(); setMsg('已清除 ' + n + ' 条法定节假日数据') }
    catch (e) { setMsg('清除失败：' + String(e)) }
    finally { setBusy(false) }
  }
  return (
    <>
      <SectionHeader title="法定节假日" desc="法定节假日同步源 · 自动同步周期 · 手动同步" />
      <Field label="同步源">
        <div>
          {sources.map((src, i) => (
            <span key={i} className="pms-row" style={{ marginBottom: 7 }}>
              <button type="button" className={i === active ? 'pm-btn' : 'pm-btn'} style={{ minWidth: 62 }} onClick={() => save('holidayActive', String(i))} title="设为使用源">{i === active ? '● 使用' : '使用'}</button>
              <input className="pm-btn" style={{ width: 120 }} value={src.name} onChange={(e) => updSource(i, 'name', e.target.value)} placeholder="名称" />
              <input className="pm-btn" style={{ flex: 255 }} value={src.url} onChange={(e) => updSource(i, 'url', e.target.value)} placeholder="接口地址(用 {year} 占位年度)" />
              <button type="button" className="pm-btn-danger" onClick={() => delSource(i)}>删除</button>
            </span>
          ))}
          <button type="button" className="pm-btn" onClick={addSource}>+ 添加同步源</button>
        </div>
        {/* 接入规范提示：告诉用户什么样的源可以直接用 */}
        <details style={{ marginTop: 12, fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.8 }}>
          <summary style={{ cursor: 'pointer', color: 'var(--color-text)', fontWeight: 500 }}>
            📋 接入规范：什么样的接口可以直接用？
          </summary>
          <div style={{ padding: '10px 12px', marginTop: 8, background: 'var(--color-bg-muted)', borderRadius: 'var(--radius)', maxWidth: 780 }}>
            接口要求：
            <br />
            · 直接返回 JSON（GET 即可访问，无需登录 / 鉴权 / 请求头）
            <br />
            · 地址中可用 <code>{'{year}'}</code> 占位符表示年份，同步时自动替换（如 {'{year}'}=2026）
            <br />
            支持两种返回结构，任选其一：
            <br />
            &nbsp;&nbsp;① holiday-cn 格式：{'{"year":2026,"days":[{"name":"元旦","date":"2026-01-01","isOffDay":true}]}'}
            <br />
            &nbsp;&nbsp;&nbsp;&nbsp;isOffDay：true 放假 · false 调休上班（默认源 ②③ 即此格式）
            <br />
            &nbsp;&nbsp;② 日期映射格式：{'{"01-01":{"name":"元旦","holiday":true}}'}
            <br />
            &nbsp;&nbsp;&nbsp;&nbsp;键为「月-日」 · holiday/isOffDay：true 放假 · false 调休上班（默认源 ① 即此格式）
            <br />
            · 找不到自己的接口？使用上方三个默认源即可（均为可直接访问的节假日数据）
          </div>
        </details>
      </Field>
      <Field label="自动同步">
        <span className="pms-row">
          <Select
            options={[{ value: '30', label: '每 30 天' }, { value: '90', label: '每季度' }, { value: '180', label: '每半年' }, { value: '365', label: '每年' }]}
            value={get('holidaySyncPeriod') || '30'}
            onSelect={(v) => save('holidaySyncPeriod', v)}
          />
          <button type="button" className="pm-btn" disabled={busy} onClick={doSync}>立即同步</button>
        </span>
      </Field>
      <Field label="清除数据">
        <span className="pms-row">
          <button type="button" className="pm-btn-danger" disabled={busy} onClick={doClear}>清除法定节假日</button>
        </span>
      </Field>
      {msg && <div className="pms-msg">{msg}</div>}
      <Field label="上次同步"><ReadonlyRow value={formatLocalDateTime(get('holidayLastSync'))} /></Field>
    </>
  )
}

function AutomationSection() {
  const { get, save } = useSettings()
  const timeField = (key: string) => (
    <TimePicker value={get(key) ?? '09:00'} onChange={(v) => saveSchedule(key, v)} testid={`${key}-picker`} minuteStep={1} />
  )
  const toggleField = (key: string) => <Toggle checked={get(key) === '1'} onChange={(v) => save(key, v ? '1' : '0')} />
  // 变更调度配置（周几/几号/时间/跳过工作日）时，清掉该任务的 lastRun/ignored。
  // 否则旧时间已触发并写入 lastRun=今天，改新时间后 shouldFire 判定「今天已执行」永不触发。
  const saveSchedule = (key: string, value: string) => {
    const task = key.startsWith('autoWeekly')
      ? 'weekly'
      : key.startsWith('autoMonthly')
        ? 'monthly'
        : key.startsWith('autoDaily')
          ? 'daily'
          : null
    save(key, value)
    if (!task) return
    // 只对报告的调度键（时间/周几/几号/跳过工作日）重置执行记录
    const mainKey = 'auto' + (task === 'daily' ? 'Daily' : task === 'weekly' ? 'Weekly' : 'Monthly') + 'Report'
    const isScheduleKey = key === mainKey || key === mainKey + 'Time' || key === mainKey + 'Day' || key === mainKey + 'Carryover'
    if (!isScheduleKey) return
    void save('autoTask_lastRun_' + task, '')
    void save('autoTask_ignored_' + task, '')
  }

  const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
  const DAY_OPTIONS = ['last', 'lastworkday', ...Array.from({ length: 31 }, (_, i) => String(i + 1))]
  const keyToDayLabel = (k: string) => {
    if (k === 'last') return '每月最后一天'
    if (k === 'lastworkday') return '每月最后一个工作日'
    return `每月 ${parseInt(k, 10)} 日`
  }
  const weekSelect = (
    <select
      className="pm-time"
      value={get('autoWeeklyReportDay') ?? '5'}
      style={{ maxWidth: '140px', flexShrink: 0 }}
      onChange={(e) => saveSchedule('autoWeeklyReportDay', e.target.value)}
    >
      <option value="lastworkday">每周最后一个工作日</option>
      {WEEKDAYS.map((w, i) => (
        <option key={String(i + 1)} value={String(i + 1)}>{w}</option>
      ))}
    </select>
  )
  const daySelect = (
    <select
      className="pm-time"
      value={get('autoMonthlyReportDay') ?? 'last'}
      style={{ maxWidth: '170px', flexShrink: 0 }}
      onChange={(e) => saveSchedule('autoMonthlyReportDay', e.target.value)}
    >
      {DAY_OPTIONS.map((d) => (
        <option key={d} value={d}>{keyToDayLabel(d)}</option>
      ))}
    </select>
  )
  const miniToggle = (key: string, label: string) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
      {toggleField(key)}
      <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{label}</span>
    </span>
  )
  return (
    <>
      <SectionHeader title="自动化" desc="自动顺延 · 自动生成日报/周报/月报" />
<div style={{ display: 'grid', gridTemplateColumns: '120px 56px 56px 150px 110px 80px', alignItems: 'center', gap: '20px', rowGap: '13px', width: '100%', fontSize: '12px' }}>
<span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text)' }}>任务自动顺延</span>
<span style={{ display: 'flex', justifyContent: 'center' }}>{toggleField('autoPostpone')}</span>
<span />
<span />
<span style={{ display: 'flex', justifyContent: 'center' }}>{timeField('postponeTime')}</span>
<span />

<span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text)' }}>报告自动生成</span>
<span style={{ textAlign: 'center', color: 'var(--color-text-secondary)' }}>个人</span>
<span style={{ textAlign: 'center', color: 'var(--color-text-secondary)' }}>项目</span>
<span style={{ textAlign: 'center', color: 'var(--color-text-secondary)' }}>日期</span>
<span style={{ textAlign: 'center', color: 'var(--color-text-secondary)' }}>时间</span>
<span style={{ textAlign: 'center', color: 'var(--color-text-secondary)' }}>跳过工作日</span>

<span style={{ fontWeight: 500, color: 'var(--color-text)' }}>日报</span>
<span style={{ display: 'flex', justifyContent: 'center' }}>{toggleField('autoDailyReportPersonal')}</span>
<span style={{ display: 'flex', justifyContent: 'center' }}>{toggleField('autoDailyReportProject')}</span>
<span style={{ display: 'flex', justifyContent: 'center' }}><span /></span>
<span style={{ display: 'flex', justifyContent: 'center' }}>{timeField('autoDailyReportTime')}</span>
<span style={{ display: 'flex', justifyContent: 'center' }}>{toggleField('autoDailyReportCarryover')}</span>

<span style={{ fontWeight: 500, color: 'var(--color-text)' }}>周报</span>
<span style={{ display: 'flex', justifyContent: 'center' }}>{toggleField('autoWeeklyReportPersonal')}</span>
<span style={{ display: 'flex', justifyContent: 'center' }}>{toggleField('autoWeeklyReportProject')}</span>
<span style={{ display: 'flex', justifyContent: 'center' }}>{weekSelect}</span>
<span style={{ display: 'flex', justifyContent: 'center' }}>{timeField('autoWeeklyReportTime')}</span>
<span style={{ display: 'flex', justifyContent: 'center' }}><span /></span>

<span style={{ fontWeight: 500, color: 'var(--color-text)' }}>月报</span>
<span style={{ display: 'flex', justifyContent: 'center' }}>{toggleField('autoMonthlyReportPersonal')}</span>
<span style={{ display: 'flex', justifyContent: 'center' }}>{toggleField('autoMonthlyReportProject')}</span>
<span style={{ display: 'flex', justifyContent: 'center' }}>{daySelect}</span>
<span style={{ display: 'flex', justifyContent: 'center' }}>{timeField('autoMonthlyReportTime')}</span>
<span style={{ display: 'flex', justifyContent: 'center' }}><span /></span>
</div>
      <Field label="启动补偿提醒">
        <span className="pms-row">
          {toggleField('autoCompensationReminder')}
          <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
            应用开启时，提醒未执行的定时任务（可在弹窗选「不再提醒」关闭本提醒）
          </span>
        </span>
      </Field>
      <div className="pms-msg">
        到点后自动执行对应任务（应用开启时有效）。周报/月报需报告中心已有周期日报数据。
        日报开启「跳过工作日」后，若触发日为节假日/周末，当天不生成日报；周报/月报可在日期中选「最后一个工作日」（参考法定节假日与调休上班日）。应用未开启期间错过的任务，启动时补偿提示。
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

function Input({
  defaultValue,
  type = 'text',
  value,
  onChange,
  placeholder,
}: {
  defaultValue?: string
  type?: string
  value?: string
  onChange?: (v: string) => void
  placeholder?: string
}) {
  return (
    <input
      type={type}
      defaultValue={defaultValue}
      value={value}
      placeholder={placeholder}
      onChange={onChange ? (e) => onChange(e.target.value) : undefined}
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
  value,
  onSelect,
}: {
  options: { value: string; label: string }[]
  default?: string
  value?: string
  onSelect?: (v: string) => void
}) {
  const selected = value ?? defaultValue
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
              o.value === selected ? 'var(--color-accent-subtle)' : 'var(--color-bg-subtle)',
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
            checked={o.value === selected}
            onChange={() => onSelect?.(o.value)}
            style={{ accentColor: 'var(--color-accent)' }}
          />
          {o.label}
        </label>
      ))}
    </div>
  )
}

function Toggle({ defaultChecked, checked, onChange }: { defaultChecked?: boolean; checked?: boolean; onChange?: (v: boolean) => void }) {
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
        checked={checked}
        defaultChecked={defaultChecked}
        onChange={(e) => onChange?.(e.target.checked)}
        style={{ opacity: 0, width: 0, height: 0 }}
      />
      <span
        style={{
          position: 'absolute',
          inset: 0,
          background: (checked ?? defaultChecked) ? 'var(--color-accent)' : 'var(--color-bg-muted)',
          borderRadius: '99px',
          transition: 'background-color 0.15s',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: '2px',
            left: (checked ?? defaultChecked) ? '18px' : '2px',
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
  value,
  onSelect,
  className,
}: {
  options: { value: string; label: string }[]
  value?: string
  onSelect?: (v: string) => void
  className?: string
}) {
  return (
    <select
      className={className}
      value={value}
      onChange={(e) => onSelect?.(e.target.value)}
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
  const { get, save } = useSettings()
  const selected = get('color') || '#5b5ce2'
  const COLORS = ['#5b5ce2', '#0a84ff', '#26a69a', '#ff8c42', '#64748b', '#dc2626']
  return (
    <div className="pms-row">
      {COLORS.map((c) => (
        <button key={c} title={c} onClick={() => save('color', c)} style={{ width: 28, height: 28, borderRadius: '99px', background: c, border: selected === c ? '2px solid var(--color-text)' : '2px solid transparent', outline: selected === c ? '2px solid var(--color-surface)' : 'none', cursor: 'pointer' }} />
      ))}
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
