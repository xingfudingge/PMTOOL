/**
 * PMTool · 删除确认对话框
 *
 * 设计原则：
 *   - 所有删除操作必须二次确认
 *   - 明确告知用户删除后果（数据永久丢失）
 *   - 不提供回收站/恢复功能
 *   - 真删除（数据库 + 文件 + 关联全部删除）
 *
 * 使用示例：
 *   <DeleteConfirmDialog
 *     open={showConfirm}
 *     onConfirm={handleConfirm}
 *     onCancel={handleCancel}
 *     title="确认删除"
 *     description="删除后数据将被永久删除，无法恢复。"
 *   />
 */

import { X, Trash2, AlertTriangle } from 'lucide-react'

interface DeleteConfirmDialogProps {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
  title?: string
  description?: string
  confirmText?: string
  cancelText?: string
}

const dialogStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(0, 0, 0, 0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 10000,
}

const contentStyle: React.CSSProperties = {
  background: 'var(--color-bg)',
  borderRadius: 'var(--radius-md)',
  padding: 24,
  maxWidth: 400,
  width: '90%',
  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  marginBottom: 16,
}

const iconStyle: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: '50%',
  background: '#fef2f2',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#dc2626',
  flexShrink: 0,
}

const titleStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 600,
  color: 'var(--color-text)',
  margin: 0,
  flex: 1,
}

const descriptionStyle: React.CSSProperties = {
  fontSize: 13,
  color: 'var(--color-text-secondary)',
  lineHeight: 1.5,
  marginBottom: 20,
}

const buttonGroupStyle: React.CSSProperties = {
  display: 'flex',
  gap: 12,
  justifyContent: 'flex-end',
}

const cancelButtonStyle: React.CSSProperties = {
  padding: '8px 16px',
  fontSize: 13,
  border: '1px solid var(--color-border)',
  background: 'var(--color-bg)',
  color: 'var(--color-text)',
  borderRadius: 'var(--radius)',
  cursor: 'pointer',
  fontWeight: 500,
}

const confirmButtonStyle: React.CSSProperties = {
  padding: '8px 16px',
  fontSize: 13,
  border: 'none',
  background: '#dc2626',
  color: '#fff',
  borderRadius: 'var(--radius)',
  cursor: 'pointer',
  fontWeight: 500,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
}

export function DeleteConfirmDialog({
  open,
  onConfirm,
  onCancel,
  title = '确认删除',
  description = '删除后数据将被永久删除，无法恢复。',
  confirmText = '确认删除',
  cancelText = '取消',
}: DeleteConfirmDialogProps) {
  if (!open) return null

  return (
    <div style={dialogStyle} onClick={onCancel}>
      <div style={contentStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <div style={iconStyle}>
            <Trash2 size={20} />
          </div>
          <h3 style={titleStyle}>{title}</h3>
        </div>
        <p style={descriptionStyle}>
          {description}
          <br />
          <strong>此操作不可逆。</strong>
        </p>
        <div style={buttonGroupStyle}>
          <button style={cancelButtonStyle} onClick={onCancel}>
            {cancelText}
          </button>
          <button style={confirmButtonStyle} onClick={onConfirm}>
            <AlertTriangle size={14} />
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
