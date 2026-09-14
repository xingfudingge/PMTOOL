/**
 * PMTool V2.0 · 自定义时间选择器 popover
 * 维护者 2026-09-12 反馈：native <input type="time"> 只有手输文本框，没有可选弹窗。
 *
 * 交互规范（维护者 2026-09-14）：
 *  「小时 → 分钟 → 确定」完整流程，选择与确认彻底分离：
 *   - 点「小时 / 分钟」只改草稿（dH/dM），弹窗不关闭
 *   - 点「确定」才提交并关闭（HH:mm 两位补零）
 *   - 点「取消」或点弹窗外关闭并丢弃草稿，原值不变
 *
 * 和 DatePicker 同风格：
 *  - 点击输入框弹出「小时 + 分钟」两列选择
 *  - 默认向上展开（上方空间不够才往下）
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
  /** 分钟步长，默认 5 分钟 */
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
  // 弹窗内草稿值：选择仅改草稿，点「确定」才提交
  const [dH, setDH] = useState(hour)
  const [dM, setDM] = useState(minute)

  // 点外部关闭（丢弃草稿）
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
    // 打开时把草稿重置为当前保存值
    setDH(hour)
    setDM(minute)
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

  // 确定：提交草稿为最终值（HH:mm 两位补零）
  const confirm = () => {
    const s = `${String(dH).padStart(2, '0')}:${String(dM).padStart(2, '0')}`
    onChange(s)
    setOpen(false)
  }
  // 取消：关闭并丢弃草稿
  const cancel = () => setOpen(false)

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
              flexDirection: 'column',
              padding: 10,
              overflow: 'hidden',
            }}
          >
            {/* 小时 + 分钟两列（仅改草稿，不提交） */}
            <div style={{ display: 'flex', gap: 8 }}>
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
                selected={dH}
                width={52}
                onPick={(v) => setDH(v)}
              />
              <TimeCol
                label="分"
                values={minutes}
                selected={dM}
                width={52}
                onPick={(v) => setDM(v)}
              />
            </div>
            {/* 取消 / 确定 */}
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button
                type="button"
                data-testid={testid ? `${testid}-cancel` : 'time-picker-cancel'}
                onClick={cancel}
                style={{
                  flex: 1,
                  padding: '6px 0',
                  fontSize: 12,
                  color: 'var(--color-text)',
                  background: 'var(--color-bg)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 6,
                  cursor: 'pointer',
                }}
              >
                取消
              </button>
              <button
                type="button"
                data-testid={testid ? `${testid}-confirm` : 'time-picker-confirm'}
                onClick={confirm}
                style={{
                  flex: 1,
                  padding: '6px 0',
                  fontSize: 12,
                  color: 'var(--color-text-on-accent)',
                  background: 'var(--color-accent)',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                }}
              >
                确定
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}

const POP_H = 222
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
