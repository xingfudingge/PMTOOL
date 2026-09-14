/**
 * PMTool V2.0 · 全局报告覆盖确认弹窗（React Context 版）
 * 维护者 2026-08-25 · "不管在哪里点击" → 主页 + 报告中心共用一个弹窗
 *
 * 之前用模块级 state · 按钮 pendingCount 更新了但 modal pending 没更新（module listener 不触发 React re-render）
 * 现在 useReportGen() 拿到真正的 React Context · setPending 后所有消费者重渲染
 *
 * 2026-09-14 · 接入 GlassModal 玻璃壳样板（Liquid Glass 统一材质）
 */

import { AlertTriangle, FileText } from 'lucide-react'
import { useReportGen } from '@/services/reportGenerator'
import { GlassModal, GlassPrimaryButton, GlassSecondaryButton } from './GlassModal'

export function RegenConfirmModal() {
  const { pending, confirm, cancel } = useReportGen()

  if (!pending) return null

  return (
    <GlassModal
      open
      onClose={cancel}
      testid="regen-confirm-modal"
      maxWidth={520}
      showClose
      title={
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={20} strokeWidth={2} color="var(--color-status-warning)" />
          已存在报告 · 是否替换？
        </span>
      }
    >
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
          background: 'var(--glass-bg-strong)',
          border: '1px solid var(--glass-border)',
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
              borderBottom: '1px solid var(--glass-border)',
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
            <span style={{ fontSize: '10.5px', color: 'var(--color-text-tertiary)' }}>
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
        <GlassSecondaryButton testid="regen-cancel-btn" onClick={cancel}>
          取消
        </GlassSecondaryButton>
        <GlassPrimaryButton testid="regen-confirm-btn" onClick={confirm}>
          确认替换
        </GlassPrimaryButton>
      </div>
    </GlassModal>
  )
}