/**
 * PMTool V2.0 · 项目概况编辑 Modal（维护者 2026-08-26 反馈：编辑项目概况按钮无效）
 *
 * 改动：
 *  - 把 ProjectDetailPage 的 onEditOverview 接通
 *  - 编辑字段：项目名称 / 客户 / 负责人 / 合同金额 / 项目背景 / 项目目标 / 项目范围
 *  - 启动 / 结束日期不放在这里（属于计划管理）
 *
 * 独立文件：之前内联进 ProjectDetailPage 总是触发 tsc 解析错。
 */

import { useEffect, useState } from 'react'
import { X, Pencil } from 'lucide-react'
import type { Project } from '@/services/project'
import { updateProject } from '@/services/project'

export interface ProjectOverviewEditModalProps {
  open: boolean
  project: Project | null
  onClose: () => void
  onSaved: () => Promise<void> | void
}

export function ProjectOverviewEditModal({
  open,
  project,
  onClose,
  onSaved,
}: ProjectOverviewEditModalProps) {
  const [name, setName] = useState('')
  const [customer, setCustomer] = useState('')
  const [owner, setOwner] = useState('')
  const [amount, setAmount] = useState('')
  const [background, setBackground] = useState('')
  const [objective, setObjective] = useState('')
  const [scope, setScope] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!project) return
    setName(project.project_name ?? '')
    setCustomer(project.customer_name ?? '')
    setOwner(project.owner ?? '')
    setAmount(
      project.contract_amount !== null ? String(project.contract_amount) : '',
    )
    setBackground(project.background ?? '')
    setObjective(project.objective ?? '')
    setScope(project.scope ?? '')
    setError(null)
    setBusy(false)
  }, [project])

  if (!open || !project) return null

  const handleSave = async () => {
    if (busy || !project) return
    setBusy(true)
    setError(null)
    try {
      await updateProject(project.id, {
        projectName: name.trim() || project.project_name,
        customerName: customer.trim() || null,
        owner: owner.trim() || null,
        contractAmount: amount.trim() ? Number(amount) : null,
        background: background.trim() || null,
        objective: objective.trim() || null,
        scope: scope.trim() || null,
      })
      await onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      data-testid="project-overview-edit-modal"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--glass-overlay)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 250,
      }}
      onClick={busy ? undefined : onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '520px',
          maxHeight: '88vh',
          background: 'var(--glass-bg-strong)',
          backdropFilter: 'var(--glass-blur)',
          WebkitBackdropFilter: 'var(--glass-blur)',
          border: '1px solid var(--glass-border)',
          borderRadius: 14,
          boxShadow: 'var(--glass-shadow)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* 标题栏 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '14px 18px',
            borderBottom: '1px solid var(--color-border-thin)',
          }}
        >
          <Pencil size={14} strokeWidth={1.75} color="var(--color-accent)" />
          <h2
            style={{
              fontSize: '15px',
              fontWeight: 600,
              margin: 0,
              flex: 1,
            }}
          >
            编辑项目概况
          </h2>
          <button
            onClick={onClose}
            disabled={busy}
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              border: '1px solid var(--color-border-thin)',
              background: 'transparent',
              color: 'var(--color-text-secondary)',
              cursor: busy ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={14} strokeWidth={1.75} />
          </button>
        </div>

        {/* 表单 */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '18px',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <Field
            label="项目名称"
            testid="edit-overview-name"
            value={name}
            onChange={setName}
            required
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field
              label="客户"
              testid="edit-overview-customer"
              value={customer}
              onChange={setCustomer}
            />
            <Field
              label="项目负责人"
              testid="edit-overview-owner"
              value={owner}
              onChange={setOwner}
            />
          </div>
          <Field
            label="合同金额（元）"
            testid="edit-overview-amount"
            value={amount}
            onChange={setAmount}
            type="number"
            placeholder="例：500000"
          />

          <Textarea
            label="项目背景"
            testid="edit-overview-background"
            value={background}
            onChange={setBackground}
            placeholder="项目的起因 / 客户为什么需要 / 商业背景"
          />
          <Textarea
            label="项目目标"
            testid="edit-overview-objective"
            value={objective}
            onChange={setObjective}
            placeholder="衡量成功的关键指标 / 客户期望达成什么"
          />
          <Textarea
            label="项目范围"
            testid="edit-overview-scope"
            value={scope}
            onChange={setScope}
            placeholder="包含什么 / 不包含什么"
          />

          {error && (
            <div
              data-testid="edit-overview-error"
              style={{
                padding: '8px 12px',
                background: 'rgba(217, 45, 32, 0.08)',
                border: '1px solid rgba(217, 45, 32, 0.2)',
                borderRadius: 'var(--radius)',
                color: 'var(--color-status-danger)',
                fontSize: '12.5px',
              }}
            >
              {error}
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            justifyContent: 'flex-end',
            padding: '12px 18px',
            borderTop: '1px solid var(--color-border-thin)',
          }}
        >
          <button
            onClick={onClose}
            disabled={busy}
            style={{
              padding: '6px 14px',
              background: 'transparent',
              color: 'var(--color-text-secondary)',
              border: '1px solid var(--color-border-thin)',
              borderRadius: 'var(--radius)',
              fontSize: '13px',
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            取消
          </button>
          <button
            data-testid="edit-overview-save"
            onClick={handleSave}
            disabled={busy || !name.trim()}
            style={{
              padding: '6px 14px',
              background: 'var(--color-accent)',
              color: 'var(--color-text-on-accent)',
              border: 'none',
              borderRadius: 'var(--radius)',
              fontSize: '13px',
              fontWeight: 500,
              cursor: busy || !name.trim() ? 'not-allowed' : 'pointer',
              opacity: busy || !name.trim() ? 0.6 : 1,
            }}
          >
            {busy ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// 表单字段
// ============================================================

function Field({
  label,
  value,
  onChange,
  type,
  placeholder,
  testid,
  required,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: 'text' | 'number'
  placeholder?: string
  testid?: string
  required?: boolean
}) {
  return (
    <div>
      <label
        style={{
          display: 'block',
          fontSize: '11.5px',
          color: 'var(--color-text-secondary)',
          marginBottom: 4,
        }}
      >
        {label}
        {required && (
          <span style={{ color: 'var(--color-status-danger)', marginLeft: 2 }}>
            *
          </span>
        )}
      </label>
      <input
        type={type ?? 'text'}
        data-testid={testid}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%',
          padding: '7px 10px',
          background: 'var(--color-bg-subtle)',
          border: '1px solid var(--color-border-thin)',
          borderRadius: 'var(--radius)',
          fontSize: '13px',
          color: 'var(--color-text)',
          outline: 'none',
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = 'var(--color-accent)'
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = 'var(--color-border-thin)'
        }}
      />
    </div>
  )
}

function Textarea({
  label,
  value,
  onChange,
  placeholder,
  testid,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  testid?: string
}) {
  return (
    <div>
      <label
        style={{
          display: 'block',
          fontSize: '11.5px',
          color: 'var(--color-text-secondary)',
          marginBottom: 4,
        }}
      >
        {label}
      </label>
      <textarea
        data-testid={testid}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        style={{
          width: '100%',
          padding: '7px 10px',
          background: 'var(--color-bg-subtle)',
          border: '1px solid var(--color-border-thin)',
          borderRadius: 'var(--radius)',
          fontSize: '13px',
          color: 'var(--color-text)',
          outline: 'none',
          resize: 'vertical',
          fontFamily: 'inherit',
          lineHeight: 1.5,
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = 'var(--color-accent)'
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = 'var(--color-border-thin)'
        }}
      />
    </div>
  )
}