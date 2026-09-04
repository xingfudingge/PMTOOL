/**
 * PMTool V2.0 · 自定义日期选择器 popover
 * 维护者 2026-08-25 反馈：native <input type="date"> 在 TodoRow 编辑态底部时
 * popover 会跑到软件窗口外面，看不见。
 *
 * 自己实现一个：
 *  - 点击 input 弹日历
 *  - 默认向上展开（智能：上方空间不够才往下）
 *  - 月份切换 + 日期网格 + 选中关 popover
 *  - 用 createPortal 到 document.body 避免父级 stacking 影响
 *
 * 不依赖任何外部 UI 库（纯 React + 内联样式）
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react'
import { formatLocalDate } from '@/services/datetime'

interface DatePickerProps {
  value: string // YYYY-MM-DD · 接受 ''
  onChange: (v: string) => void
  testid?: string
  /** 输入框宽度 · 默认 130 */
  width?: number
  /** 占位文字 */
  placeholder?: string
}

export function DatePicker({
  value,
  onChange,
  testid,
  width = 130,
  placeholder = '选择日期',
}: DatePickerProps) {
  const [open, setOpen] = useState(false)
  // 打开日历时的显示月份 · 默认当前选中的日期的月份（无选中则为今天）
  const [viewYear, setViewYear] = useState(() => {
    if (value) return Number(value.slice(0, 4))
    return new Date().getFullYear()
  })
  const [viewMonth, setViewMonth] = useState(() => {
    if (value) return Number(value.slice(5, 7)) - 1
    return new Date().getMonth()
  })
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  // popover 位置（绝对定位）· null = 未计算
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  // 点击外部关闭
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

  // 打开时计算 popover 位置 + 智能向上/向下
  const handleOpen = () => {
    if (open) {
      setOpen(false)
      return
    }
    // 用 input 的位置计算
    const rect = inputRef.current?.getBoundingClientRect()
    if (rect) {
      const POP_H = 280 // popover 预估高度
      const POP_W = 248
      const spaceAbove = rect.top
      const spaceBelow = window.innerHeight - rect.bottom
      const above = spaceAbove >= POP_H + 8 || spaceAbove > spaceBelow
      const top = above
        ? rect.top - POP_H - 4 // input 上方
        : rect.bottom + 4 // input 下方
      // 左右：尽量贴着 input 左对齐，但不超过视口右边界
      const left = Math.min(
        Math.max(rect.left, 8),
        window.innerWidth - POP_W - 8,
      )
      setPos({ top, left })
    }
    // 同步显示月份到 value
    if (value) {
      setViewYear(Number(value.slice(0, 4)))
      setViewMonth(Number(value.slice(5, 7)) - 1)
    }
    setOpen(true)
  }

  // 月份切换
  const goPrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11)
      setViewYear(viewYear - 1)
    } else {
      setViewMonth(viewMonth - 1)
    }
  }
  const goNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0)
      setViewYear(viewYear + 1)
    } else {
      setViewMonth(viewMonth + 1)
    }
  }

  // 生成日历网格
  const grid = useMemo(
    () => buildMonthGrid(viewYear, viewMonth),
    [viewYear, viewMonth],
  )
  const todayLocal = formatLocalDate(new Date())

  return (
    <div
      ref={wrapRef}
      style={{ position: 'relative', display: 'inline-flex' }}
    >
      <input
        ref={inputRef}
        type="text"
        readOnly
        value={value}
        placeholder={placeholder}
        data-testid={testid}
        onClick={handleOpen}
        style={{
          width,
          fontSize: '11.5px',
          padding: '3px 8px',
          border: '1px solid var(--color-border-thin)',
          borderRadius: 'var(--radius)',
          background: 'var(--color-bg)',
          color: value ? 'var(--color-text)' : 'var(--color-text-tertiary)',
          cursor: 'pointer',
          outline: 'none',
          fontFamily: 'inherit',
          fontVariantNumeric: 'tabular-nums',
          paddingRight: 22,
        }}
        aria-label="修改到期日"
      />
      <Calendar
        size={11}
        strokeWidth={1.75}
        color="var(--color-text-tertiary)"
        style={{
          position: 'absolute',
          right: 6,
          top: '50%',
          transform: 'translateY(-50%)',
          pointerEvents: 'none',
        }}
      />
      {open && pos &&
        createPortal(
          <div
            ref={popRef}
            data-testid={`${testid ?? 'date-picker'}-popover`}
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              width: 248,
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border-thin)',
              borderRadius: 'var(--radius-md)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
              zIndex: 2147483647,
              padding: 10,
              fontFamily: 'inherit',
              color: 'var(--color-text)',
            }}
          >
            {/* 月份切换 + 标题 */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                marginBottom: 8,
              }}
            >
              <button
                type="button"
                onClick={goPrevMonth}
                aria-label="上一月"
                style={{
                  width: 22,
                  height: 22,
                  background: 'var(--color-bg-subtle)',
                  border: '1px solid var(--color-border-thin)',
                  borderRadius: 4,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--color-text-secondary)',
                }}
              >
                <ChevronLeft size={12} strokeWidth={1.75} />
              </button>
              <div
                style={{
                  flex: 1,
                  textAlign: 'center',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {viewYear} 年 {viewMonth + 1} 月
              </div>
              <button
                type="button"
                onClick={goNextMonth}
                aria-label="下一月"
                style={{
                  width: 22,
                  height: 22,
                  background: 'var(--color-bg-subtle)',
                  border: '1px solid var(--color-border-thin)',
                  borderRadius: 4,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--color-text-secondary)',
                }}
              >
                <ChevronRight size={12} strokeWidth={1.75} />
              </button>
            </div>

            {/* 周标题 */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
                gap: 2,
                marginBottom: 4,
              }}
            >
              {['一', '二', '三', '四', '五', '六', '日'].map((w, i) => (
                <div
                  key={w}
                  style={{
                    fontSize: '10px',
                    color: i >= 5 ? 'var(--color-status-warning)' : 'var(--color-text-tertiary)',
                    textAlign: 'center',
                    padding: '2px 0',
                    fontWeight: 500,
                  }}
                >
                  {w}
                </div>
              ))}
            </div>

            {/* 日期网格 */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, 1fr)',
                gap: 2,
              }}
            >
              {grid.map((d, i) => {
                if (!d.date) {
                  return <div key={`empty-${i}`} style={{ height: 30 }} />
                }
                const isSelected = d.date === value
                const isToday = d.date === todayLocal
                return (
                  <button
                    key={d.date}
                    type="button"
                    onClick={() => {
                      onChange(d.date!)
                      setOpen(false)
                    }}
                    style={{
                      height: 30,
                      background: isSelected
                        ? 'var(--color-accent)'
                        : isToday
                          ? 'var(--color-accent-subtle)'
                          : 'transparent',
                      border: isToday && !isSelected
                        ? '1px solid var(--color-accent)'
                        : 'none',
                      borderRadius: 4,
                      cursor: 'pointer',
                      color: isSelected
                        ? 'var(--color-text-on-accent)'
                        : d.type === 'holiday'
                          ? 'var(--color-status-danger)'
                          : d.type === 'weekend'
                            ? 'var(--color-status-warning)'
                            : 'var(--color-text)',
                      fontSize: '11.5px',
                      fontVariantNumeric: 'tabular-nums',
                      fontWeight: isToday ? 600 : 400,
                      fontFamily: 'inherit',
                      padding: 0,
                    }}
                  >
                    {d.day}
                  </button>
                )
              })}
            </div>

            {/* 清除按钮 */}
            <div
              style={{
                marginTop: 8,
                paddingTop: 8,
                borderTop: '1px solid var(--color-border-thin)',
                display: 'flex',
                justifyContent: 'space-between',
                gap: 8,
              }}
            >
              <button
                type="button"
                onClick={() => {
                  onChange('')
                  setOpen(false)
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: '11px',
                  color: 'var(--color-text-tertiary)',
                  cursor: 'pointer',
                  padding: '2px 6px',
                  fontFamily: 'inherit',
                }}
              >
                清除
              </button>
              <button
                type="button"
                onClick={() => {
                  onChange(todayLocal)
                  setOpen(false)
                }}
                style={{
                  background: 'var(--color-bg-subtle)',
                  border: '1px solid var(--color-border-thin)',
                  fontSize: '11px',
                  color: 'var(--color-text)',
                  cursor: 'pointer',
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontFamily: 'inherit',
                }}
              >
                今天
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}

/**
 * 生成月份网格（6 行 × 7 列 · 周一到周日）
 * 返回 { date, day, type } 数组 · type: 'workday' | 'weekend' | 'holiday' | 'adjusted-workday'
 */
function buildMonthGrid(year: number, month: number): GridCell[] {
  const firstDay = new Date(year, month, 1)
  // 周一开头：(0=周日, 1=周一, ...) → 0=周一
  const firstWeekday = (firstDay.getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: GridCell[] = []
  for (let i = 0; i < firstWeekday; i++) {
    cells.push({ date: '', day: 0, type: 'workday' })
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const wd = new Date(dateStr + 'T00:00:00').getDay()
    const isWeekend = wd === 0 || wd === 6
    cells.push({
      date: dateStr,
      day: d,
      type: isWeekend ? 'weekend' : 'workday',
    })
  }
  // 补全到 6 行 = 42 格
  while (cells.length < 42) {
    cells.push({ date: '', day: 0, type: 'workday' })
  }
  return cells
}

interface GridCell {
  date: string
  day: number
  type: 'workday' | 'weekend' | 'holiday' | 'adjusted-workday'
}