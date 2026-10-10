/**
 * PMTool · 通用删除/危险操作二次确认弹窗（2026-09-19）
 *
 * 产品规则（维护者定）：**所有删除操作必须二次确认**，不可直接执行。
 *   - 删除不可撤销，必须弹窗明确告知删除对象 + 后果
 *   - 沿用项目既有文案风格（对齐 ProjectDetailPage 的文件删除确认）
 *   - 基于 GlassModal，与全站 Liquid Glass 弹窗材质统一
 *
 * 用法：
 *   const [pending, setPending] = useState<Item | null>(null)
 *   <ConfirmDialog
 *     open={pending !== null}
 *     title="删除会话"
 *     message={<>确定要删除「<strong>{pending?.title}</strong>」？该操作不可撤销。</>}
 *     onCancel={() => setPending(null)}
 *     onConfirm={async () => { await doDelete(pending!.id); setPending(null) }}
 *   />
 */

import type { ReactNode } from 'react'
import { GlassModal } from './GlassModal'

export interface ConfirmDialogProps {
  open: boolean
  /** 弹窗标题，如「删除会话」 */
  title: string
  /** 说明文案（含删除对象名称与后果） */
  message: ReactNode
  /** 确认按钮文案，默认「确认删除」 */
  confirmText?: string
  /** 处理中（禁用按钮，防重复提交） */
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmText = '确认删除',
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <GlassModal open={open} onClose={busy ? () => {} : onCancel} maxWidth={420} testid="confirm-dialog">
      <h3
        style={{
          margin: 0,
          marginBottom: 10,
          fontSize: 15,
          fontWeight: 600,
          color: 'var(--color-text)',
        }}
      >
        {title}
      </h3>
      <p
        style={{
          margin: 0,
          marginBottom: 18,
          fontSize: 13,
          lineHeight: 1.6,
          color: 'var(--color-text-secondary)',
        }}
      >
        {message}
      </p>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          data-testid="confirm-cancel"
          style={{
            padding: '6px 14px',
            fontSize: 13,
            border: '1px solid var(--color-border-thin)',
            background: 'transparent',
            color: 'var(--color-text)',
            borderRadius: 'var(--radius)',
            cursor: busy ? 'not-allowed' : 'pointer',
          }}
        >
          取消
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          data-testid="confirm-ok"
          style={{
            padding: '6px 14px',
            fontSize: 13,
            fontWeight: 500,
            border: 'none',
            background: busy ? 'var(--color-bg-muted)' : 'var(--color-status-danger)',
            color: busy ? 'var(--color-text-tertiary)' : 'var(--color-text-on-accent)',
            borderRadius: 'var(--radius)',
            cursor: busy ? 'not-allowed' : 'pointer',
          }}
        >
          {busy ? '处理中…' : confirmText}
        </button>
      </div>
    </GlassModal>
  )
}
