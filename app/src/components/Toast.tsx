/**
 * PMToolToast · 轻量通知组件
 * 维护者 2026-08-26 立
 *
 * 设计：
 - 右下角浮层 · 多条堆叠
 - 类型：success(绿) / error(红) / info(蓝) / warning(橙)
 - 3 秒自动消失 · 鼠标悬停暂停
 - 全局单例：useToast() hook 即可
 */

import { useEffect, useState } from 'react'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface ToastItem {
  id: number
  type: ToastType
  title: string
  detail?: string
}

let _counter = 0
const _listeners = new Set<(items: ToastItem[]) => void>()
let _items: ToastItem[] = []

function emit() {
  for (const l of _listeners) l(_items)
}

export function pushToast(type: ToastType, title: string, detail?: string, durationMs = 3000) {
  const id = ++_counter
  _items = [..._items, { id, type, title, detail }]
  emit()
  if (durationMs > 0) {
    setTimeout(() => dismissToast(id), durationMs)
  }
  return id
}

export function dismissToast(id: number) {
  _items = _items.filter((t) => t.id !== id)
  emit()
}

const TYPE_COLOR: Record<ToastType, { bg: string; border: string; icon: string }> = {
  success: { bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.45)', icon: '✓' },
  error:   { bg: 'rgba(239, 68, 68, 0.12)',  border: 'rgba(239, 68, 68, 0.45)',  icon: '✕' },
  info:    { bg: 'rgba(59, 130, 246, 0.12)', border: 'rgba(59, 130, 246, 0.45)', icon: 'ⓘ' },
  warning: { bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.45)', icon: '⚠' },
}

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>(_items)
  useEffect(() => {
    _listeners.add(setItems)
    return () => { _listeners.delete(setItems) }
  }, [])
  if (items.length === 0) return null
  return (
    <div
      style={{
        position: 'fixed',
        right: 24,
        bottom: 24,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        pointerEvents: 'none',
      }}
    >
      {items.map((t) => {
        const c = TYPE_COLOR[t.type]
        return (
          <div
            key={t.id}
            style={{
              pointerEvents: 'auto',
              minWidth: 260,
              maxWidth: 420,
              padding: '10px 14px',
              background: c.bg,
              border: `1px solid ${c.border}`,
              borderRadius: 8,
              boxShadow: '0 4px 14px rgba(0,0,0,0.08)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              animation: 'pmtool-toast-in 200ms ease-out',
            }}
          >
            <div style={{ fontSize: 16, lineHeight: 1.2, color: c.border, fontWeight: 700 }}>
              {c.icon}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>
                {t.title}
              </div>
              {t.detail && (
                <div style={{ fontSize: 12, marginTop: 2, color: 'var(--color-text-secondary)', wordBreak: 'break-word' }}>
                  {t.detail}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismissToast(t.id)}
              style={{
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: 'var(--color-text-tertiary)',
                fontSize: 14,
                padding: 0,
                lineHeight: 1,
              }}
              aria-label="关闭"
            >
              ×
            </button>
          </div>
        )
      })}
      <style>{`
        @keyframes pmtool-toast-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

/** 快捷方法 */
export const toast = {
  success: (title: string, detail?: string) => pushToast('success', title, detail),
  error:   (title: string, detail?: string) => pushToast('error', title, detail, 5000),
  info:    (title: string, detail?: string) => pushToast('info', title, detail),
  warning: (title: string, detail?: string) => pushToast('warning', title, detail),
}