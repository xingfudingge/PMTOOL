/**
 * InlineEditableCell · Excel 式行内可编辑单元格
 * 维护者 2026-08-26 立
 *
 * 交互：单点进入编辑（输入框/日期/数字）· 失焦或回车保存 · Esc 取消
 * 类型：text / date / number / percent / select
 */
import { useEffect, useRef, useState } from 'react'

type CellType = 'text' | 'date' | 'number' | 'percent' | 'select' | 'textarea'

interface InlineEditableCellProps {
  value: string | number | null
  type?: CellType
  options?: string[] // select 类型
  /** select 选项的显示文案（value 用枚举 / label 用中文 · 维护者 2026-08-28） */
  optionLabels?: Record<string, string>
  onCommit?: (value: string) => void
  readonly?: boolean
  align?: 'left' | 'center'
  mono?: boolean
  className?: string
  placeholder?: string
  /** 显示时格式化（只读显示用） */
  displayFormatter?: (raw: string | number | null) => string
  /** 保存中（显示 loading 样式 + 屏蔽重复保存） */
  busy?: boolean
  /** 多行模式（textarea）· text 类型下生效 */
  multiline?: boolean
}

export function InlineEditableCell({
  value,
  type = 'text',
  options,
  optionLabels,
  onCommit,
  readonly = false,
  align = 'left',
  mono = false,
  placeholder,
  displayFormatter,
  busy = false,
  multiline = false,
}: InlineEditableCellProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null)

  // 外部值变化时同步 draft（父级数据刷新后）
  useEffect(() => {
    if (!editing) {
      setDraft(value == null ? '' : String(value))
    }
  }, [value, editing])

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const display = displayFormatter
    ? displayFormatter(value)
    : value == null || value === ''
      ? ''
      : String(value)

  const isCompact = mono || type === 'select'
  const baseStyle: React.CSSProperties = {
    width: '100%',
    minHeight: 22,
    padding: '1px 4px',
    fontSize: 12,
    fontFamily: mono ? 'var(--font-mono)' : 'inherit',
    textAlign: align,
    background: 'transparent',
    border: 'none',
    borderRadius: 3,
    cursor: 'text',
    color: 'var(--color-text)',
    outline: 'none',
    // 维护者 2026-08-31：默认换行（文本）；日期/枚举仍 nowrap 防止溢出到邻格
    whiteSpace: isCompact ? 'nowrap' : 'normal',
    overflowWrap: 'break-word',
    lineHeight: 1.45,
    overflow: 'hidden',
    textOverflow: isCompact ? 'ellipsis' : 'clip',
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    minHeight: 24,
    padding: '2px 6px',
    fontSize: 12,
    fontFamily: mono ? 'var(--font-mono)' : 'inherit',
    textAlign: align,
    border: '1px solid var(--color-accent)',
    borderRadius: 4,
    background: 'var(--color-bg)',
    color: 'var(--color-text)',
    outline: 'none',
    boxShadow: '0 0 0 2px rgba(59,130,246,0.15)',
  }

  const commit = () => {
    const next = draft.trim()
    setEditing(false)
    // 总是触发 onCommit，让父组件去 dedupe（避免输入框因类型转换错过触发）
    if (onCommit) onCommit(next)
  }

  const cancel = () => {
    setDraft(value == null ? '' : String(value))
    setEditing(false)
  }

  if (readonly) {
    return (
      <div
        style={{
          ...baseStyle,
          cursor: 'default',
          color: 'var(--color-text-tertiary)',
        }}
        title="自动计算"
      >
        {display || '—'}
      </div>
    )
  }

  if (!editing) {
    return (
      <div
        style={{ ...baseStyle, cursor: 'text' }}
        onClick={(e) => {
          e.stopPropagation()
          setDraft(value == null ? '' : String(value))
          setEditing(true)
        }}
        title={display || placeholder}
      >
        {display || <span style={{ color: 'var(--color-text-tertiary)' }}>{placeholder ?? '点击编辑'}</span>}
      </div>
    )
  }

  if (type === 'select' && options) {
    return (
      <select
        ref={inputRef as React.Ref<HTMLSelectElement>}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          // 维护者 2026-08-28：中文输入法组合期间按 Enter 选字不应提交
          if (e.nativeEvent.isComposing) return
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') cancel()
        }}
        style={{ ...inputStyle, cursor: 'pointer' }}
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {optionLabels?.[o] ?? o}
          </option>
        ))}
      </select>
    )
  }

  // 多行文本（textarea）· Ctrl+Enter 保存 · Esc 取消
  if (multiline || type === 'textarea') {
    return (
      <textarea
        ref={inputRef as unknown as React.Ref<HTMLTextAreaElement>}
        value={draft}
        disabled={busy}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          // 维护者 2026-08-28：中文输入法组合期间按 Enter 选字不应提交
          if (e.nativeEvent.isComposing) return
          if (e.key === 'Escape') cancel()
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') commit()
        }}
        rows={3}
        style={{
          ...inputStyle,
          minHeight: 60,
          resize: 'vertical',
          fontFamily: 'inherit',
          opacity: busy ? 0.5 : 1,
        }}
      />
    )
  }

  return (
    <input
      ref={inputRef as React.Ref<HTMLInputElement>}
      type={type === 'date' ? 'date' : 'text'}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        // 维护者 2026-08-28：中文输入法组合期间按 Enter 选字不应提交
        if (e.nativeEvent.isComposing) return
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') cancel()
      }}
      style={inputStyle}
      placeholder={placeholder}
    />
  )
}