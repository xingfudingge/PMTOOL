/**
 * PMTool · DocumentEditor 顶部工具栏（维护者 2026-08-31 · Phase D）
 *
 * 维护者 2026-08-31 拍板：
 *   - 「最大化」按钮 = 真窗口 maximize（调 Tauri command）· 不是隐藏侧栏
 *   - 笔记标题输入 + 空间标签 + 保存状态徽标 + 保存按钮 + 导出 + 关闭
 *
 * 不展示：
 *   - 文件名（外层 PreviewToolbar 已显示）
 *   - 块数 / 字数 / 快捷键提示（EditorStatusBar 已删 · 用户不需要）
 */

import { useEffect, useState } from 'react'
import { Save, Download, X, AlertTriangle, Loader2, Check, Maximize2 } from 'lucide-react'
import { useEditingMaximizedHotkeys } from './editingMaximized'
import type { SaveStatus } from './types'

interface EditorToolbarProps {
  title: string
  onTitleChange: (next: string) => void
  status: SaveStatus
  lastSavedAt: string | null
  onSave: () => void
  onExportMarkdown?: () => void
  onClose?: () => void
  /** knowledge 模式 · 空间标识（个人笔记 / 项目笔记） */
  spaceLabel?: string | null
}

const toolbarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 10px',
  borderBottom: '1px solid var(--color-border)',
  background: 'var(--color-bg-subtle)',
  flexShrink: 0,
  minHeight: 32,
}

const titleInputStyle: React.CSSProperties = {
  flex: 1,
  fontSize: 14,
  fontWeight: 600,
  border: 'none',
  background: 'transparent',
  color: 'var(--color-text)',
  outline: 'none',
  padding: '2px 4px',
  borderRadius: 4,
  minWidth: 0,
}

const badgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 3,
  padding: '1px 8px',
  fontSize: 11,
  color: 'var(--color-text-tertiary)',
  background: 'var(--color-bg)',
  border: '1px solid var(--color-border)',
  borderRadius: 10,
  whiteSpace: 'nowrap',
  flexShrink: 0,
}

const spaceBadgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '1px 8px',
  fontSize: 10,
  color: 'var(--color-text-tertiary)',
  background: 'var(--color-bg)',
  border: '1px solid var(--color-border)',
  borderRadius: 10,
  whiteSpace: 'nowrap',
  flexShrink: 0,
}

const btnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '5px 12px',
  fontSize: 12,
  color: 'var(--color-text)',
  background: 'var(--color-bg)',
  border: '1px solid var(--color-border)',
  borderRadius: 4,
  cursor: 'pointer',
  flexShrink: 0,
  whiteSpace: 'nowrap',
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
  width: 28,
  height: 28,
  fontSize: 12,
  color: 'var(--color-text-secondary)',
  background: 'transparent',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
  flexShrink: 0,
}

function StatusBadge({ status, lastSavedAt }: { status: SaveStatus; lastSavedAt: string | null }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])

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
  const time = lastSavedAt ? formatTime(lastSavedAt, now) : ''
  return (
    <span style={{ ...badgeStyle, color: '#166534' }}>
      <Check size={11} />
      {time ? `已保存 ${time}` : '已保存'}
    </span>
  )
}

function formatTime(iso: string, now: number): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    const diff = now - d.getTime()
    if (diff < 60_000) return '刚刚'
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`
    // 当天
    const today = new Date(now)
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

export function EditorToolbar({
  title,
  onTitleChange,
  status,
  lastSavedAt,
  onSave,
  onExportMarkdown,
  onClose,
  spaceLabel,
}: EditorToolbarProps) {
  // 维护者 2026-08-31 重做：最大化 = 编辑区占满可见区域（不动 OS 窗口）
  const hot = useEditingMaximizedHotkeys()
  const [isMax, setIsMax] = useState<boolean>(() => hot.isMax)
  const handleMaximize = () => {
    try {
      const v = hot.toggle()
      setIsMax(v)
    } catch (e) {
      console.error('[EditorToolbar] toggle maximize failed:', e)
    }
  }
  const showSave = true  // 维护者 2026-09-02：知识中心模式始终显示保存按钮
  return (
    <div style={toolbarStyle}>
      {spaceLabel && <span style={spaceBadgeStyle}>{spaceLabel}</span>}
      <input
        type="text"
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        placeholder="无标题"
        style={titleInputStyle}
        spellCheck={false}
      />
      <StatusBadge status={status} lastSavedAt={lastSavedAt} />
      <button
        type="button"
        style={{ ...iconBtnStyle, width: 'auto', padding: '0 8px', gap: 4, fontSize: 11, fontFamily: 'inherit' }}
        onClick={handleMaximize}
        title={isMax ? '还原' : '最大化'}
      >
        <Maximize2 size={12} />
        {isMax ? '还原' : '最大化'}
      </button>
      {showSave && (
        <button
          type="button"
          style={btnPrimaryStyle}
          onClick={onSave}
          title="保存（⌘/Ctrl+S）"
        >
          <Save size={12} />
          保存
        </button>
      )}
      {onExportMarkdown && (
        <button
          type="button"
          style={btnStyle}
          onClick={onExportMarkdown}
          title="导出为 .md 文件"
        >
          <Download size={12} />
          导出 .md
        </button>
      )}
      {onClose && (
        <button type="button" style={iconBtnStyle} onClick={onClose} title="关闭">
          <X size={16} />
        </button>
      )}
    </div>
  )
}
