/**
 * PMTool · 通用右键菜单（维护者 2026-09-16）
 *
 * 用于文件树 / 模板中心树的「像资源管理器一样右键操作」。
 *
 * 设计要点：
 *   - position: fixed + 视口夹取：树容器是 overflow:auto，用 absolute 会被裁掉
 *   - 关闭时机：点外部 / Esc / 滚动 / 窗口尺寸变化 / 失焦（避免菜单"飘"在错位置）
 *   - 纯展示组件：不关心业务，item.onSelect 由调用方决定做什么
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

export interface ContextMenuItem {
  key: string
  label: string
  icon?: ReactNode
  /** 危险操作（删除等）· 红字 */
  danger?: boolean
  /** 不可用（置灰 · 仍展示，便于用户理解此处有此能力） */
  disabled?: boolean
  /** 在此项之前画一条分隔线 */
  dividerBefore?: boolean
  onSelect: () => void
}

interface FileContextMenuProps {
  /** 鼠标位置（视口坐标） */
  x: number
  y: number
  items: ContextMenuItem[]
  onClose: () => void
}

const MENU_MIN_WIDTH = 176

export function FileContextMenu({ x, y, items, onClose }: FileContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [hoverKey, setHoverKey] = useState<string | null>(null)
  const [pos, setPos] = useState({ left: x, top: y })

  // 量出真实尺寸后夹取到视口内（首帧先按鼠标位置渲染，避免闪烁）
  useLayoutEffect(() => {
    const el = menuRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const margin = 6
    const left = Math.max(margin, Math.min(x, window.innerWidth - rect.width - margin))
    const top = Math.max(margin, Math.min(y, window.innerHeight - rect.height - margin))
    setPos({ left, top })
  }, [x, y, items.length])

  useEffect(() => {
    const onDocDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    // 滚动 / 缩放 / 失焦 → 菜单位置即失效，直接关闭
    const onScroll = () => onClose()
    document.addEventListener('mousedown', onDocDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onScroll)
    window.addEventListener('blur', onScroll)
    // capture: 树容器内部滚动也能收到
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onDocDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onScroll)
      window.removeEventListener('blur', onScroll)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [onClose])

  return (
    <div
      ref={menuRef}
      role="menu"
      style={{
        position: 'fixed',
        left: pos.left,
        top: pos.top,
        zIndex: 3000,
        minWidth: MENU_MIN_WIDTH,
        padding: 4,
        fontSize: 12.5,
        background: 'var(--color-surface, #fff)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md, 6px)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.16)',
        userSelect: 'none',
      }}
    >
      {items.map((item) => (
        <div key={item.key}>
          {item.dividerBefore && (
            <div
              style={{
                height: 1,
                margin: '4px 6px',
                background: 'var(--color-border-thin, var(--color-border))',
              }}
            />
          )}
          <button
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onMouseEnter={() => setHoverKey(item.key)}
            onMouseLeave={() => setHoverKey((prev) => (prev === item.key ? null : prev))}
            onClick={() => {
              if (item.disabled) return
              onClose()
              item.onSelect()
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              padding: '6px 8px',
              border: 'none',
              borderRadius: 4,
              textAlign: 'left',
              font: 'inherit',
              color: item.disabled
                ? 'var(--color-text-tertiary)'
                : item.danger
                  ? 'var(--color-status-danger, #dc2626)'
                  : 'var(--color-text)',
              background:
                !item.disabled && hoverKey === item.key ? 'var(--color-bg-active)' : 'transparent',
              cursor: item.disabled ? 'default' : 'pointer',
              opacity: item.disabled ? 0.55 : 1,
            }}
          >
            <span
              style={{
                display: 'inline-flex',
                width: 14,
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {item.icon}
            </span>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.label}
            </span>
          </button>
        </div>
      ))}
    </div>
  )
}
