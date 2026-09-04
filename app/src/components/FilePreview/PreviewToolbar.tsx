/**
 * 预览顶部工具栏（统一：文件名 + 保存状态徽标 + 保存按钮 + 最大化 + 本地打开）
 * 维护者 2026-08-31 · Phase D
 *
 * 维护者 2026-08-31 拍板：
 *   - 「最大化」按钮 = 编辑区占满可见区域（折叠所有 chrome）· 不动 OS 窗口
 *   - 维护者 2026-08-31 重做：不调 Tauri maximize · 只切 body class
 *   - 维护者 2026-08-31 再加：保存状态徽标 + 保存按钮（dirty/error 时显示）
 *     save 回调由 DocumentEditor 通过 onSaveReady 推到外层 saveRef · 这里
 *     用 ref.current?.() 调，避免外层每次状态变化重渲
 */
import {
  ExternalLink,
  AlertCircle,
  Loader2,
  Maximize2,
  Save,
  AlertTriangle,
  Check,
} from 'lucide-react'
import { useState } from 'react'
import type { MutableRefObject, ReactNode } from 'react'
import { useEditingMaximizedHotkeys } from '@/components/DocumentEditor/editingMaximized'
import type { SaveStatus } from '@/components/DocumentEditor/types'

interface PreviewToolbarProps {
  fileName: string
  onOpenExternally: () => void
  loading?: boolean
  error?: string | null
  extra?: ReactNode
  /** 当前保存状态（由 DocumentEditor onStatusChange 推送） */
  saveStatus?: SaveStatus
  /** 最后保存时间（ISO 字符串 · 渲染"已保存 X 分钟前"） */
  lastSavedAt?: string | null
  /** save 函数 ref（DocumentEditor 通过 onSaveReady 推送 · 这里调 ref.current?.()） */
  saveRef?: MutableRefObject<(() => Promise<boolean>) | null>
}

const toolbarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '6px 12px',
  borderBottom: '1px solid var(--color-border)',
  background: 'var(--color-bg-subtle)',
  gap: 12,
  flexShrink: 0,
}

const fileNameStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  color: 'var(--color-text)',
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const btnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '4px 10px',
  fontSize: 12,
  color: 'var(--color-text)',
  background: 'var(--color-bg)',
  border: '1px solid var(--color-border)',
  borderRadius: 4,
  cursor: 'pointer',
  flexShrink: 0,
}

const btnPrimaryStyle: React.CSSProperties = {
  ...btnStyle,
  background: 'var(--color-accent, #2563eb)',
  borderColor: 'var(--color-accent, #2563eb)',
  color: '#fff',
}

const iconBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 26,
  height: 26,
  fontSize: 12,
  color: 'var(--color-text-secondary)',
  background: 'transparent',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
  flexShrink: 0,
}

const errorStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 10px',
  fontSize: 12,
  color: '#dc2626',
  background: '#fef2f2',
  border: '1px solid #fecaca',
  borderRadius: 4,
  flexShrink: 0,
}

const loadingStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  fontSize: 12,
  color: 'var(--color-text-tertiary)',
  flexShrink: 0,
}

const badgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 3,
  padding: '2px 8px',
  fontSize: 11,
  border: '1px solid var(--color-border)',
  borderRadius: 10,
  whiteSpace: 'nowrap',
  flexShrink: 0,
}

function formatSavedAt(iso: string | null | undefined): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    const diff = Date.now() - d.getTime()
    if (diff < 60_000) return '刚刚'
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`
    const today = new Date()
    if (
      d.getFullYear() === today.getFullYear() &&
      d.getMonth() === today.getMonth() &&
      d.getDate() === today.getDate()
    ) {
      return `${d.getHours().toString().padStart(2, '0')}:${d
        .getMinutes()
        .toString()
        .padStart(2, '0')}`
    }
    return `${d.getMonth() + 1}/${d.getDate()}`
  } catch {
    return ''
  }
}

function SaveStatusBadge({
  status,
  lastSavedAt,
}: {
  status: SaveStatus
  lastSavedAt?: string | null
}) {
  if (status === 'loading') {
    return (
      <span style={{ ...badgeStyle, color: 'var(--color-text-tertiary)' }}>
        <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />
        加载中…
      </span>
    )
  }
  if (status === 'saving') {
    return (
      <span style={{ ...badgeStyle, color: 'var(--color-text-tertiary)' }}>
        <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} />
        保存中…
      </span>
    )
  }
  if (status === 'conflict') {
    return (
      <span
        style={{
          ...badgeStyle,
          color: '#b45309',
          background: '#fef3c7',
          borderColor: '#fcd34d',
        }}
      >
        <AlertTriangle size={11} />
        文件被外部修改
      </span>
    )
  }
  if (status === 'error') {
    return (
      <span
        style={{
          ...badgeStyle,
          color: '#b91c1c',
          background: '#fef2f2',
          borderColor: '#fecaca',
        }}
      >
        <AlertTriangle size={11} />
        保存失败
      </span>
    )
  }
  if (status === 'dirty') {
    return (
      <span
        style={{
          ...badgeStyle,
          color: '#92400e',
          background: '#fef3c7',
          borderColor: '#fcd34d',
        }}
      >
        ● 未保存
      </span>
    )
  }
  // clean
  const time = formatSavedAt(lastSavedAt)
  return (
    <span
      style={{ ...badgeStyle, color: '#166534', background: '#f0fdf4' }}
    >
      <Check size={11} />
      {time ? `已保存 ${time}` : '已保存'}
    </span>
  )
}

export function PreviewToolbar({
  fileName,
  onOpenExternally,
  loading,
  error,
  extra,
  saveStatus,
  lastSavedAt,
  saveRef,
}: PreviewToolbarProps) {
  // 维护者 2026-08-31 重做：图标随编辑区最大化状态切换 · 纯 CSS 不动 OS 窗口
  const hot = useEditingMaximizedHotkeys()
  const [isMax, setIsMax] = useState<boolean>(() => hot.isMax)

  const handleMaximize = () => {
    try {
      const v = hot.toggle()
      setIsMax(v)
    } catch (e) {
      console.error('[PreviewToolbar] toggle maximize failed:', e)
    }
  }

  const handleSave = () => {
    const fn = saveRef?.current
    if (!fn) return
    void fn()
  }

  const showSave =
    saveStatus === 'dirty' || saveStatus === 'error' || saveStatus === 'conflict'

  return (
    <div style={toolbarStyle}>
      <div style={fileNameStyle} title={fileName}>
        {fileName}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {saveStatus && <SaveStatusBadge status={saveStatus} lastSavedAt={lastSavedAt} />}
        {showSave && (
          <button
            type="button"
            style={btnPrimaryStyle}
            onClick={handleSave}
            title="保存（⌘/Ctrl+S）"
          >
            <Save size={12} />
            保存
          </button>
        )}
        <button
          type="button"
          style={{ ...iconBtnStyle, width: 'auto', padding: '0 8px', gap: 4, fontSize: 11, fontFamily: 'inherit' }}
          onClick={handleMaximize}
          title={isMax ? '还原' : '最大化'}
        >
          <Maximize2 size={12} />
          {isMax ? '还原' : '最大化'}
        </button>
        {extra}
        {loading && (
          <span style={loadingStyle}>
            <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
            加载中
          </span>
        )}
        {error && (
          <span style={errorStyle}>
            <AlertCircle size={12} />
            {error}
          </span>
        )}
        <button
          type="button"
          style={btnStyle}
          onClick={onOpenExternally}
          title="用系统默认程序打开"
        >
          <ExternalLink size={12} />
          本地编辑器打开
        </button>
      </div>
    </div>
  )
}