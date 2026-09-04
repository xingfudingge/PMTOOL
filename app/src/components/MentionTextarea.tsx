/**
 * PMTool V2.0 · MentionTextarea
 * 维护者 2026-08-25 · @ 项目下拉选择（之前说"以后做"，维护者纠正"现在做"）
 *
 * 功能：
 *   - 自动以 "· " 开头（维护者原话：bullet 风格 + 回车续行自动续）
 *   - 输入 @ 弹出项目下拉
 *   - @ 后面继续输入字符 → 实时过滤项目
 *   - Up / Down 切换 · Enter 选中 · Esc 关闭 · 点击外部关闭
 *   - 选中后：在光标处插入 `@项目名`，回调 onMention(project)
 *   - 选中后：光标移到插入文本之后（用户继续打字）
 *
 * 触发规则：
 *   - 光标所在行内，从光标往前找最近的 @
 *   - 若 @ 之前没有空白/换行/开头 → 算触发
 *   - 触发后取 @ 到光标之间的字符作为 query
 *   - query 为空时显示全部项目（最多 8 个）
 *
 * 与 BulletTextarea 的关系：
 *   - MentionTextarea 是 BulletTextarea 的超集
 *   - HomePage 直接换成 MentionTextarea · autoBullet 默认开
 */

import { useEffect, useRef, useState } from 'react'

export interface MentionOption {
  id: number
  name: string
}

interface MentionState {
  active: boolean
  startIdx: number
  query: string
  options: MentionOption[]
  selectedIdx: number
  popupTop: number
  popupLeft: number
}

interface MentionTextareaProps {
  value: string
  onChange: (v: string) => void
  /** 选中项目时回调 · 用于调用方记 projectId / mentions */
  onMention?: (option: MentionOption) => void
  /** 项目列表（一般从 listProjects() 拉）· */
  projects: MentionOption[]
  placeholder?: string
  testid?: string
  /** 是否自动以 "· " 开头（默认 true · 替代 BulletTextarea）*/
  autoBullet?: boolean
  rows?: number
  /** 最大高度（px）· 默认 160 */
  minHeight?: number
  /** 单行模式 · Enter 不插入换行，触发 onEnter · 用于快速收集框 */
  onEnter?: () => void
  /** 透传样式到 textarea（覆盖默认 padding/border/bg） · 用于嵌入其他容器 */
  textareaStyle?: React.CSSProperties
}

/** 计算光标像素位置（基于隐藏 mirror div）· 返回 { top, left } 相对 textarea */
function getCaretCoords(
  ta: HTMLTextAreaElement,
  mirrorStyle: CSSStyleDeclaration,
  cursor: number,
): { top: number; left: number } {
  const mirror = document.createElement('div')
  mirror.style.position = 'absolute'
  mirror.style.visibility = 'hidden'
  mirror.style.whiteSpace = 'pre-wrap'
  mirror.style.wordWrap = 'break-word'
  for (let i = 0; i < mirrorStyle.length; i++) {
    const prop = mirrorStyle.item(i)
    if (prop) mirror.style.setProperty(prop, mirrorStyle.getPropertyValue(prop))
  }
  // 文本 = value 到 cursor · 末尾加 span 占位测坐标
  const before = ta.value.slice(0, cursor)
  mirror.textContent = before
  const marker = document.createElement('span')
  marker.textContent = ''
  mirror.appendChild(marker)
  document.body.appendChild(mirror)
  const markerRect = marker.getBoundingClientRect()
  const mirrorRect = mirror.getBoundingClientRect()
  document.body.removeChild(mirror)
  return {
    top: markerRect.top - mirrorRect.top,
    left: markerRect.left - mirrorRect.left,
  }
}

export function MentionTextarea({
  value,
  onChange,
  onMention,
  projects,
  placeholder,
  testid,
  autoBullet = true,
  rows = 8,
  minHeight = 160,
  onEnter,
  textareaStyle,
}: MentionTextareaProps) {
  const ref = useRef<HTMLTextAreaElement | null>(null)
  const popupRef = useRef<HTMLDivElement | null>(null)
  // 维护者 2026-08-25：标记"上一次变化是否来自用户键入"
  //   - true  → 用户输入（onBeforeInput 触发）· 可以弹下拉
  //   - false → 程序 append（如 appendToTodayWorkNote）· 不弹下拉
  // 解决"完成 todo 自动 append 到工作内容时弹项目下拉"的 bug
  const userInputRef = useRef(false)
  const [mention, setMention] = useState<MentionState>({
    active: false,
    startIdx: 0,
    query: '',
    options: [],
    selectedIdx: 0,
    popupTop: 0,
    popupLeft: 0,
  })

  // 首次挂载时空内容补 "· "
  useEffect(() => {
    if (ref.current && value === '' && autoBullet) {
      onChange('· ')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 检测 @ 触发
  useEffect(() => {
    const ta = ref.current
    if (!ta) return
    // 维护者 2026-08-25：程序触发的 value 变化（appendToTodayWorkNote）· 不要弹下拉
    // 只在用户键入时检测 @ · 标记在 onBeforeInput 那里设置
    if (!userInputRef.current) {
      // 程序变化 · 不弹 · 但保留已经激活的 mention 状态（让用户继续打字时还能用）
      // 实际上这种情况要关闭以防弹窗残留
      if (mention.active) setMention((m) => ({ ...m, active: false }))
      userInputRef.current = false // 重置
      return
    }
    userInputRef.current = false // 消费后重置

    const cursor = ta.selectionStart
    const text = value

    // 从 cursor 往前找 @ （同一条 line 内）
    let i = cursor - 1
    let atIdx = -1
    while (i >= 0) {
      const ch = text[i]
      if (ch === '@') {
        atIdx = i
        break
      }
      if (ch === '\n' || ch === ' ' || ch === '\t') break
      i--
    }

    if (atIdx === -1) {
      if (mention.active) setMention((m) => ({ ...m, active: false }))
      return
    }
    // @ 前必须是行首 / 空白 / 标点 才算合法触发（避免邮箱误触发）
    const prevCh = atIdx > 0 ? text[atIdx - 1] : ' '
    if (prevCh && !/[\s　@]/.test(prevCh) && atIdx > 0) {
      if (mention.active) setMention((m) => ({ ...m, active: false }))
      return
    }

    const query = text.slice(atIdx + 1, cursor)
    const q = query.toLowerCase()
    const filtered = projects
      .filter((p) => (q === '' ? true : p.name.toLowerCase().includes(q)))
      .slice(0, 8)

    if (filtered.length === 0) {
      if (mention.active) setMention((m) => ({ ...m, active: false }))
      return
    }

    // 计算 popup 坐标 · 用 mirror div 拿光标位置
    const cs = window.getComputedStyle(ta)
    const { top: lineTop, left: lineLeft } = getCaretCoords(ta, cs, cursor)
    const lineHeight = parseFloat(cs.lineHeight) || 20
    const taRect = ta.getBoundingClientRect()

    setMention((m) => ({
      active: true,
      startIdx: atIdx,
      query,
      options: filtered,
      selectedIdx: m.active && m.options.length > 0 ? Math.min(m.selectedIdx, filtered.length - 1) : 0,
      // popup 相对 textarea 容器 · 用绝对像素
      popupTop: ta.offsetTop + lineTop + lineHeight - ta.scrollTop,
      popupLeft: Math.min(ta.offsetLeft + lineLeft, taRect.width - 240),
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, projects])

  // 点击外部关闭
  useEffect(() => {
    if (!mention.active) return
    const handler = (e: MouseEvent) => {
      if (
        popupRef.current &&
        !popupRef.current.contains(e.target as Node) &&
        ref.current &&
        !ref.current.contains(e.target as Node)
      ) {
        setMention((m) => ({ ...m, active: false }))
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [mention.active])

  /**
   * 在光标位置插入 @项目名 · 替换掉当前 query 段
   * 例： value = "开 @启明" cursor=4 → atIdx=2 → query=启明 → 插入 "@启明智能印章"
   *  最终 value = "开 @启明智能印章"
   */
  const insertMention = (option: MentionOption) => {
    const ta = ref.current
    if (!ta) return
    const cursor = ta.selectionStart
    const before = value.slice(0, mention.startIdx)
    const after = value.slice(cursor)
    const insert = `@${option.name} `
    const newValue = before + insert + after
    onChange(newValue)
    setMention((m) => ({ ...m, active: false }))
    // 下一帧设置光标
    requestAnimationFrame(() => {
      if (ref.current) {
        const pos = before.length + insert.length
        ref.current.selectionStart = pos
        ref.current.selectionEnd = pos
        ref.current.focus()
      }
    })
    onMention?.(option)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget
    // 维护者 2026-08-25：标记"用户键入"· 程序触发的 value 变化（appendToTodayWorkNote）不弹下拉
    // handleKeyDown 在 value 实际变化之前触发 · 标记后 useEffect 才能区分
    userInputRef.current = true

    // 弹窗打开时拦截导航键
    if (mention.active && mention.options.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setMention((m) => ({
          ...m,
          selectedIdx: (m.selectedIdx + 1) % m.options.length,
        }))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setMention((m) => ({
          ...m,
          selectedIdx: (m.selectedIdx - 1 + m.options.length) % m.options.length,
        }))
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        insertMention(mention.options[mention.selectedIdx])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setMention((m) => ({ ...m, active: false }))
        return
      }
    }

    // Enter 续行加 "· " · 仅在 multi-line + autoBullet 模式下生效
    if (e.key === 'Enter') {
      // 单行模式（有 onEnter 回调） → 触发外部提交，不插入换行
      if (onEnter) {
        e.preventDefault()
        onEnter()
        return
      }
      if (autoBullet) {
        e.preventDefault()
        const start = ta.selectionStart
        const end = ta.selectionEnd
        const before = value.slice(0, start)
        const after = value.slice(end)
        const insert = '\n· '
        const newValue = before + insert + after
        onChange(newValue)
        requestAnimationFrame(() => {
          if (ref.current) {
            const pos = start + insert.length
            ref.current.selectionStart = pos
            ref.current.selectionEnd = pos
            ref.current.focus()
          }
        })
      }
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <textarea
        ref={ref}
        data-testid={testid}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={rows}
        style={{
          width: '100%',
          padding: '12px 14px',
          background: 'var(--color-bg-subtle)',
          border: '1px solid var(--color-border-thin)',
          borderRadius: 'var(--radius)',
          fontSize: '13px',
          color: 'var(--color-text)',
          outline: 'none',
          resize: 'vertical',
          lineHeight: 1.8,
          fontFamily: 'inherit',
          minHeight,
          ...textareaStyle,
        }}
      />
      {mention.active && mention.options.length > 0 && (
        <div
          ref={popupRef}
          data-testid="mention-popup"
          style={{
            position: 'absolute',
            top: mention.popupTop,
            left: mention.popupLeft,
            minWidth: 200,
            maxWidth: 280,
            maxHeight: 240,
            overflowY: 'auto',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 6px 18px rgba(0,0,0,0.12)',
            zIndex: 1000,
            padding: 4,
          }}
        >
          <div
            style={{
              padding: '4px 8px',
              fontSize: '10.5px',
              color: 'var(--color-text-tertiary)',
              borderBottom: '1px solid var(--color-border-thin)',
              marginBottom: 2,
            }}
          >
            选择项目 · ↑↓ 导航 · Enter 选中 · Esc 关闭
          </div>
          {mention.options.map((opt, idx) => {
            const selected = idx === mention.selectedIdx
            return (
              <button
                key={opt.id}
                type="button"
                data-testid={`mention-option-${opt.id}`}
                onMouseDown={(e) => {
                  // mousedown 早于 textarea blur · 阻止 textarea 失去焦点
                  e.preventDefault()
                  insertMention(opt)
                }}
                onMouseEnter={() =>
                  setMention((m) => ({ ...m, selectedIdx: idx }))
                }
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  padding: '6px 10px',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  background: selected ? 'var(--color-accent-subtle)' : 'transparent',
                  color: selected ? 'var(--color-accent)' : 'var(--color-text)',
                  fontSize: '12.5px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontFamily: 'inherit',
                  fontWeight: selected ? 500 : 400,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: selected ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
                    flexShrink: 0,
                  }}
                />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {opt.name}
                </span>
                <span style={{ fontSize: '10px', color: 'var(--color-text-tertiary)' }}>
                  #{opt.id}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}