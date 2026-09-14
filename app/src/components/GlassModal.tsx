/**
 * PMTool V2.0 · 通用 Liquid Glass 弹窗壳（macOS 液态玻璃）
 * 维护者 2026-09-14 反馈：统一弹窗成 Liquid Glass 材质，先做核心样板，验收后推广。
 *
 * 设计要点：
 *   - 半透明玻璃 + 背景模糊(backdrop-filter) + 饱和
 *   - 背景透射感 · 柔和高光(inset) · 边缘高光描边 · 柔和阴影 · 大圆角
 *   - 淡入 + 缩放打开动画
 *   - 浅色/深色由主题令牌自动适配
 *
 * 颜色一律引用 --glass-* 主题令牌（见 index.css），组件内不出现手写 rgba。
 */

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

export interface GlassModalProps {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  /** 内容最大宽度，默认 520 */
  maxWidth?: number
  /** 测试标识 */
  testid?: string
  /** 关闭按钮（标题栏右上 X），默认不渲染 */
  showClose?: boolean
  /** 标题（显示在顶部），默认不渲染 */
  title?: React.ReactNode
}

/** 去掉标题栏，仅内容 + 底部操作区用 */
export function GlassModal({
  open,
  onClose,
  children,
  maxWidth = 520,
  testid,
  showClose = false,
  title,
}: GlassModalProps) {
  // Esc 关闭
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // 打开时锁定 body 滚动
  const prevOverflow = useRef<string | null>(null)
  useEffect(() => {
    if (open) {
      prevOverflow.current = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = prevOverflow.current ?? '' }
    }
  }, [open])

  if (!open) return null

  return createPortal(
    <div
      role="dialog"
      data-testid={testid}
      onClick={onClose}
      className="pm-glass-root"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2147483647,
        background: 'var(--glass-overlay)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        animation: 'pmGlassOverlayIn 160ms ease-out',
      }}
    >
      {/* 玻璃面板 */}
      <div
        className="pm-glass-panel"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          maxWidth,
          width: '100%',
          maxHeight: 'calc(100vh - 96px)',
          overflow: 'auto',
          background: 'var(--glass-bg)',
          backdropFilter: 'var(--glass-blur)',
          WebkitBackdropFilter: 'var(--glass-blur)',
          border: '1px solid var(--glass-border)',
          borderRadius: 16,
          boxShadow:
            'var(--glass-shadow), inset 0 1px 0 var(--glass-highlight), inset 0 0 0 0.5px var(--glass-highlight)',
          color: 'var(--glass-text)',
          padding: '24px 28px',
          animation: 'pmGlassPanelIn 200ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {title && (
          <div
            style={{
              fontSize: 16,
              fontWeight: 600,
              marginBottom: 14,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {title}
            {showClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="关闭"
                style={{
                  marginLeft: 'auto',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 6,
                  borderRadius: 8,
                  color: 'var(--color-text-tertiary)',
                }}
              >
                ×
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  )
}

/** 玻璃按钮：主按钮（实心） */
export function GlassPrimaryButton({ children, onClick, testid }: { children: React.ReactNode; onClick: () => void; testid?: string }) {
  return (
    <button
      type="button"
      data-testid={testid}
      onClick={onClick}
      style={{
        padding: '9px 22px',
        fontSize: 13,
        fontWeight: 500,
        color: 'var(--color-text-on-accent)',
        background: 'var(--color-accent)',
        border: '1px solid var(--glass-border)',
        borderRadius: 10,
        cursor: 'pointer',
        boxShadow: 'var(--glass-shadow)',
      }}
    >
      {children}
    </button>
  )
}

/** 玻璃按钮：次按钮（描边玻璃） */
export function GlassSecondaryButton({ children, onClick, testid }: { children: React.ReactNode; onClick: () => void; testid?: string }) {
  return (
    <button
      type="button"
      data-testid={testid}
      onClick={onClick}
      style={{
        padding: '9px 20px',
        fontSize: 13,
        color: 'var(--glass-text)',
        background: 'var(--glass-bg-strong)',
        border: '1px solid var(--glass-border)',
        borderRadius: 10,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}
