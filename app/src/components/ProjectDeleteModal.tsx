/**
 * PMTool V2.0 · 项目删除确认弹窗（独立组件 · 维护者 2026-08-27 反馈）
 *
 * 设计：
 *  - 检测该项目下未完成代办（status !== COMPLETED && status !== DELAYED）
 *  - 有则提示 + 勾选"同时删除关联未完成代办"
 *  - 用户取消勾选 → 只删项目（关联代办保留 · 但 project_id 保留）
 *
 * 之所以单独文件：之前内联进 ProjectsPage · TSX 嵌套导致 tsc 解析错。
 */

import { AlertTriangle } from 'lucide-react'
import { useState, useEffect } from 'react'
import { listTodos, deleteTodo } from '@/services/todo'
import { deleteProject, type Project } from '@/services/project'

export interface ProjectDeleteModalProps {
  project: Project | null
  onClose: () => void
  onDeleted: () => void
}

interface RelatedTodo {
  id: number
  title: string
}

export function ProjectDeleteModal({
  project,
  onClose,
  onDeleted,
}: ProjectDeleteModalProps) {
  const [related, setRelated] = useState<RelatedTodo[]>([])
  const [cascadeChecked, setCascadeChecked] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!project) {
      setRelated([])
      setCascadeChecked(true)
      setError(null)
      setBusy(false)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    listTodos({})
      .then((all) => {
        if (cancelled) return
        const filtered = all
          .filter(
            (t) =>
              t.project_id === project.id &&
              t.status !== 'COMPLETED' &&
              t.status !== 'DELAYED',
          )
          .map((t) => ({ id: t.id, title: t.title }))
        setRelated(filtered)
        setCascadeChecked(filtered.length > 0)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [project])

  if (!project) return null

  const handleConfirm = async () => {
    if (!project || busy) return
    setBusy(true)
    setError(null)
    try {
      if (cascadeChecked && related.length > 0) {
        for (const t of related) {
          try {
            await deleteTodo(t.id)
          } catch (err) {
            console.warn('删除关联代办失败', t.id, err)
          }
        }
      }
      await deleteProject(project.id)
      onDeleted()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <div
      data-testid="project-delete-modal"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--glass-overlay)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 300,
      }}
      onClick={busy ? undefined : onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '440px',
          background: 'var(--glass-bg-strong)',
          backdropFilter: 'var(--glass-blur)',
          WebkitBackdropFilter: 'var(--glass-blur)',
          border: '1px solid var(--glass-border)',
          borderRadius: 14,
          padding: '24px',
          boxShadow: 'var(--glass-shadow)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            marginBottom: '16px',
          }}
        >
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: 'rgba(217, 45, 32, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <AlertTriangle size={18} strokeWidth={1.75} color="#d92d20" />
          </div>
          <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>删除项目</h2>
        </div>

        <p
          style={{
            fontSize: '13px',
            color: 'var(--color-text-secondary)',
            lineHeight: 1.6,
            margin: '0 0 16px',
          }}
        >
          确定要删除项目「
          <strong style={{ color: 'var(--color-text)' }}>{project.project_name}</strong>
          」吗？此操作不可撤销。
        </p>

        {loading ? (
          <div
            style={{
              padding: '12px',
              background: 'var(--color-bg-subtle)',
              borderRadius: 'var(--radius)',
              fontSize: '12.5px',
              color: 'var(--color-text-tertiary)',
            }}
          >
            正在检测关联代办…
          </div>
        ) : related.length > 0 ? (
          <div
            data-testid="project-delete-related"
            style={{
              padding: '12px',
              background: 'var(--color-bg-subtle)',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--color-border-thin)',
              marginBottom: '12px',
            }}
          >
            <div
              style={{
                fontSize: '12.5px',
                color: 'var(--color-text-secondary)',
                marginBottom: '8px',
              }}
            >
              检测到该项目下有{' '}
              <strong style={{ color: 'var(--color-status-danger)' }}>
                {related.length}
              </strong>{' '}
              条未完成代办：
            </div>
            <ul
              style={{
                margin: '0 0 12px',
                paddingLeft: '18px',
                fontSize: '12px',
                color: 'var(--color-text-tertiary)',
                maxHeight: '120px',
                overflow: 'auto',
              }}
            >
              {related.slice(0, 10).map((t) => (
                <li key={t.id} style={{ marginBottom: '2px' }}>
                  {t.title}
                </li>
              ))}
              {related.length > 10 && (
                <li style={{ color: 'var(--color-text-tertiary)' }}>
                  …… 等共 {related.length} 条
                </li>
              )}
            </ul>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12.5px',
                cursor: busy ? 'not-allowed' : 'pointer',
                color: 'var(--color-text-secondary)',
              }}
            >
              <input
                type="checkbox"
                data-testid="project-delete-cascade"
                checked={cascadeChecked}
                disabled={busy}
                onChange={(e) => setCascadeChecked(e.target.checked)}
              />
              同时删除这些关联未完成代办
            </label>
          </div>
        ) : (
          <div
            style={{
              padding: '12px',
              background: 'var(--color-bg-subtle)',
              borderRadius: 'var(--radius)',
              fontSize: '12.5px',
              color: 'var(--color-text-tertiary)',
              marginBottom: '12px',
            }}
          >
            该项目下没有未完成的关联代办。
          </div>
        )}

        {error && (
          <div
            data-testid="project-delete-error"
            style={{
              padding: '8px 12px',
              background: 'rgba(217, 45, 32, 0.08)',
              border: '1px solid rgba(217, 45, 32, 0.2)',
              borderRadius: 'var(--radius)',
              color: 'var(--color-status-danger)',
              fontSize: '12.5px',
              marginBottom: '12px',
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            data-testid="project-delete-cancel"
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
            data-testid="project-delete-confirm"
            onClick={handleConfirm}
            disabled={busy || loading}
            style={{
              padding: '6px 14px',
              background: 'var(--color-status-danger, #d92d20)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--radius)',
              fontSize: '13px',
              fontWeight: 500,
              cursor: busy || loading ? 'not-allowed' : 'pointer',
              opacity: busy || loading ? 0.6 : 1,
            }}
          >
            {busy ? '删除中…' : '删除项目'}
          </button>
        </div>
      </div>
    </div>
  )
}