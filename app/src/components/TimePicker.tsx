/**
 * PMTool V2.0 · 自定义时间选择器 popover
 * 维护者 2026-09-12 反馈：native <input type="time"> 只有手输文本框，没有可选弹窗。
 *
 * 和 DatePicker 同风格：
 *  - 点击输入框弹出「小时 + 分钟」两列选择
 *  - 默认向上展开（上方空间不够才往下）
 *  - 点外部关闭 · 选中即关闭并回调
 *  - createPortal 到 document.body 避免父级 stacking 影响
 *
 * 纯 React + 内联样式，不依赖外部 UI 库
 */

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Clock } from 'lucide-react'

interface TimePickerProps {
  /** HH:mm · 接受 '' */
  value: string
  onChange: (v: string) => void
  testid?: string
  /** 46 小时不变，分钟步长，默认 5 分钟 */
  minuteStep?: number
  /** 输入框宽度 · 默认 96 */
  width?: number
}

export function TimePicker({
  value,
  onChange,
  testid,
  minuteStep = 5,
  width = 96,
}: TimePickerProps) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLSpanElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  const [h, m] = (value ? value.split(':') : ['09', '00']) as [string, string]
  const hour = Number(h) || 0
  const minute = Number(m) || 0

  // 点外部关闭
  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node
      if (wrapRef.current?.contains(t)) return
      if (popRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  const handleOpen = () => {
    if (open) {
      setOpen(false)
      return
    }
    const rect = inputRef.current?.getBoundingClientRect()
    if (rect) {
      const spaceAbove = rect.top
      const spaceBelow = window.innerHeight - rect.bottom
      const above = spaceAbove >= POP_H + 8 || spaceAbove > spaceBelow
      const top = above ? rect.top - POP_H - 4 : rect.bottom + 4
      const left = Math.min(Math.max(rect.left, 8), window.innerWidth - POP_W - 8)
      setPos({ top, left })
    }
    setOpen(true)
  }

  const pick = (nh: number, nm: number) => {
    const s = `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`
    onChange(s)
    setOpen(false)
  }

  const hours = Array.from({ length: 24 }, (_, i) => i)
  const minutes = Array.from({ length: Math.ceil(60 / minuteStep) }, (_, i) => i * minuteStep)

  return (
    <>
      <span ref={wrapRef} style={{ position: 'relative', display: 'inline-flex' }}>
        <input
          ref={inputRef}
          data-testid={testid}
          className="pm-time"
          style={{ width, textAlign: 'center', cursor: 'pointer' }}
          value={value}
          placeholder="HH:mm"
          onChange={(e) => { setOpen(false); onChange(e.target.value) }}
          onClick={handleOpen}
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => e.key === 'Enter' && handleOpen()}
          aria-label="选择时间"
        />
      </span>
      {open &&
        createPortal(
          <div
            ref={popRef}
            data-testid={testid ? `${testid}-panel` : 'time-picker-panel'}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: pos?.top ?? 0,
              left: pos?.left ?? 0,
              zIndex: 2147483600,
              width: POP_W,
              background: 'var(--color-surface)',
              borderRadius: 10,
              border: '1px solid var(--color-border-thin)',
              boxShadow: '0 8px 30px rgba(0,0,0,0.18)',
              display: 'flex',
              gap: 8,
              padding: 10,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: 30,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-text-tertiary)',
                flexShrink: 0,
              }}
            >
              <Clock size={14} strokeWidth={1.75} />
            </div>
            <TimeCol
              label="时"
              values={hours}
              selected={hour}
              width={52}
              onPick={(v) => pick(v, minute)}
            />
            <TimeCol
              label="分"
              values={minutes}
              selected={minute}
              width={52}
              onPick={(v) => pick(hour, v)}
            />
          </div>,
          document.body,
        )}
    </>
  )
}

const POP_H = 220
const POP_W = 176

function TimeCol({
  label,
  values,
  selected,
  width,
  onPick,
}: {
  label: string
  values: number[]
  selected: number
  width: number
  onPick: (v: number) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  // 打开时把选中项滚到可视区
  useEffect(() => {
    const el = ref.current?.querySelector('[data-selected="true"]')
    el?.scrollIntoView?.({ block: 'center' })
  }, [])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        alignItems: 'center',
        width,
        flexShrink: 0,
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: 'var(--color-text-tertiary)',
          textAlign: 'center',
        }}
      >
        {label}
      </div>
      <div
        ref={ref}
        style={{
          overflowY: 'auto',
          maxHeight: 176,
          width: '100%',
          scrollbarWidth: 'thin',
        }}
      >
        {values.map((v) => {
          const isSel = v === selected
          return (
            <button
              key={v}
              type="button"
              data-selected={isSel ? 'true' : 'false'}
              onClick={() => onPick(v)}
              style={{
                display: 'block',
                width: '100%',
                padding: '4px 0',
                fontSize: 13,
                textAlign: 'center',
                background: isSel ? 'var(--color-accent)' : 'transparent',
                color: isSel ? 'var(--color-text-on-accent)' : 'var(--color-text)',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {String(v).padStart(2, '0')}
            </button>
          )
        })}
      </div>
    </div>
  )
}
