/**
 * PMTool V2.0 · 全局报告覆盖确认弹窗（React Context 版）
 * 维护者 2026-08-25 · "不管在哪里点击" → 主页 + 报告中心共用一个弹窗
 *
 * 之前用模块级 state · 按钮 pendingCount 更新了但 modal pending 没更新（module listener 不触发 React re-render）
 * 现在 useReportGen() 拿到真正的 React Context · setPending 后所有消费者重渲染
 */

import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, FileText, X as XIcon } from 'lucide-react'
import { useReportGen } from '@/services/reportGenerator'

export function RegenConfirmModal() {
  const { pending, confirm, cancel } = useReportGen()

  // Esc 取消
  useEffect(() => {
    if (!pending) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        cancel()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pending !== null, cancel])

  if (!pending) return null

  // createPortal 到 document.body · 逃离任何父级 stacking/transform/overflow 影响
  return createPortal(
    <div
      role="dialog"
      data-testid="regen-confirm-modal"
      onClick={cancel}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2147483647,
        background: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        animation: 'regenFadeIn 0.15s ease-out',
      }}
    >
      <style>{`
        @keyframes regenFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes regenScaleIn { from { transform: scale(0.92); opacity: 0; } to { transform: scale(1); opacity: 1; } }
      `}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--color-surface)',
          borderRadius: 12,
          padding: '20px 24px',
          maxWidth: 520,
          width: '100%',
          boxShadow:
            '0 20px 60px rgba(0, 0, 0, 0.4), 0 0 0 3px var(--color-status-warning)',
          animation: 'regenScaleIn 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 12,
          }}
        >
          <AlertTriangle size={20} strokeWidth={2} color="var(--color-status-warning)" />
          <h3
            style={{
              fontSize: '16px',
              fontWeight: 600,
              color: 'var(--color-text)',
              margin: 0,
              flex: 1,
            }}
          >
            已存在报告 · 是否替换？
          </h3>
          <button
            type="button"
            onClick={cancel}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: 4,
              color: 'var(--color-text-tertiary)',
              borderRadius: 4,
            }}
            aria-label="关闭"
          >
            <XIcon size={16} strokeWidth={1.75} />
          </button>
        </div>

        <div
          style={{
            fontSize: '13px',
            color: 'var(--color-text-secondary)',
            marginBottom: 12,
            lineHeight: 1.6,
          }}
        >
          检测到{' '}
          <strong style={{ color: 'var(--color-status-warning)' }}>
            {pending.existing.length}
          </strong>{' '}
          份「{pending.description}」已存在 · 继续将覆盖原内容
        </div>

        <ul
          style={{
            margin: 0,
            padding: '6px 14px',
            background: 'var(--color-bg-subtle)',
            border: '1px solid var(--color-border-thin)',
            borderRadius: 'var(--radius)',
            listStyle: 'none',
            maxHeight: 180,
            overflowY: 'auto',
            marginBottom: 16,
          }}
        >
          {pending.existing.slice(0, 8).map((r) => (
            <li
              key={r.id}
              data-testid={`regen-confirm-row-${r.id}`}
              style={{
                fontSize: '11.5px',
                color: 'var(--color-text-secondary)',
                padding: '5px 0',
                borderBottom: '1px solid var(--color-border-thin)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <FileText size={11} strokeWidth={1.75} color="var(--color-accent)" />
              <span
                style={{
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {r.title}
              </span>
              <span
                style={{ fontSize: '10.5px', color: 'var(--color-text-tertiary)' }}
              >
                {r.createdAt?.slice(11, 16) ?? ''}
              </span>
            </li>
          ))}
          {pending.existing.length > 8 && (
            <li
              style={{
                fontSize: '11px',
                color: 'var(--color-text-tertiary)',
                padding: '5px 0',
                textAlign: 'center',
              }}
            >
              ··· 还有 {pending.existing.length - 8} 份 ···
            </li>
          )}
        </ul>

        <div
          style={{
            fontSize: '10.5px',
            color: 'var(--color-text-tertiary)',
            textAlign: 'center',
            marginBottom: 12,
          }}
        >
          按 Esc 取消 · 点击背景外也可取消
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            type="button"
            data-testid="regen-cancel-btn"
            onClick={cancel}
            style={{
              padding: '7px 18px',
              background: 'var(--color-bg-subtle)',
              color: 'var(--color-text)',
              border: '1px solid var(--color-border-thin)',
              borderRadius: 6,
              fontSize: '12.5px',
              cursor: 'pointer',
            }}
          >
            取消
          </button>
          <button
            type="button"
            data-testid="regen-confirm-btn"
            onClick={confirm}
            autoFocus
            style={{
              padding: '7px 22px',
              background: 'var(--color-accent)',
              color: 'var(--color-text-on-accent)',
              border: 'none',
              borderRadius: 6,
              fontSize: '12.5px',
              fontWeight: 500,
              cursor: 'pointer',
              boxShadow: '0 0 0 2px var(--color-accent-subtle)',
            }}
          >
            确认替换
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
