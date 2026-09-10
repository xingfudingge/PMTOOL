/**
 * PMTool · 项目知识中心 · 以知识库为主的列表（2026-09-07 一库多项目重构 · 设计文档 §14）
 *
 * 设计要点：
 *   - 列表每行 = 一个知识空间（知识库），显示「库名 + 已绑定的项目名」。
 *   - 一个知识库可被多个项目共享（M:N），绑定关系存在 project_knowledge_bindings。
 *   - 「新建知识库」= createKnowledgeSpace(spaceType:'project', projectId:null)，不自动绑定项目。
 *   - 「添加项目」= 把已有知识库绑定给项目（可多选）。
 *   - 「解绑」= 删除某项目↔该库的 binding（仅移除访问入口，知识保留在知识中心）。
 *   - 「删除」= 真删整个知识库（级联：解绑 + 目录/知识/附件记录 + 磁盘文件，不可恢复）。
 *   - 点击行 → 进入该知识库的 KnowledgeTreeView（按 spaceId 进入）。
 */

import { useEffect, useState, useCallback } from 'react'
import { Plus, X, ChevronRight, Trash2, UserPlus, Library } from 'lucide-react'
import { toast } from 'sonner'
import { listProjects, type Project } from '@/services/project'
import {
  listAllProjectSpaces,
  listSpaceBindings,
  createBinding,
  deleteBinding,
  createKnowledgeSpace,
  deleteKnowledgeSpace,
  type KnowledgeSpace,
} from '@/services/knowledgeSpaces'

interface ProjectBindingListProps {
  /** 返回项目目录树 */
  onBack: () => void
}

interface SpaceRow {
  space: KnowledgeSpace
  boundProjects: Project[]
  loading: boolean
}

export function ProjectBindingList({ onBack }: ProjectBindingListProps) {
  const [allProjects, setAllProjects] = useState<Project[]>([])
  const [rows, setRows] = useState<SpaceRow[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const projects = await listProjects()
      setAllProjects(projects)

      const spaces = await listAllProjectSpaces()
      const projectMap = new Map(projects.map((p) => [p.id, p]))

      const rowList: SpaceRow[] = await Promise.all(
        spaces.map(async (space) => {
          const bindings = await listSpaceBindings(space.id)
          const boundProjects = bindings
            .map((b) => projectMap.get(b.projectId))
            .filter((p): p is Project => !!p)
          return { space, boundProjects, loading: false }
        }),
      )
      setRows(rowList)
    } catch (e) {
      console.error('[ProjectBindingList] reload failed:', e)
      toast.error(`加载失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  // ───────── 新建知识库（不自动绑定项目） ─────────
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)

  const handleCreateSpace = async () => {
    const name = newName.trim()
    if (!name) return
    setSaving(true)
    try {
      const created = await createKnowledgeSpace({
        spaceType: 'project',
        projectId: null,
        name,
      })
      toast.success(`已创建知识库「${created.name}」`)
      setNewName('')
      setCreating(false)
      await reload()
    } catch (e) {
      toast.error(`创建失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSaving(false)
    }
  }

  // ───────── 添加项目（把已有库绑定给项目 · 可多选） ─────────
  const [addingSpace, setAddingSpace] = useState<SpaceRow | null>(null)
  const [checkSet, setCheckSet] = useState<Set<number>>(new Set())
  const [binding, setBinding] = useState(false)

  const addCandidateProjects = allProjects.filter(
    (p) => !(addingSpace && addingSpace.boundProjects.some((b) => b.id === p.id)),
  )

  const toggleCheck = (id: number) => {
    setCheckSet((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleConfirmAddProjects = async () => {
    if (!addingSpace) return
    const ids = Array.from(checkSet)
    if (ids.length === 0) {
      toast.error('请至少选择一个项目')
      return
    }
    setBinding(true)
    try {
      for (const pid of ids) {
        await createBinding({ projectId: pid, knowledgeSpaceId: addingSpace.space.id })
      }
      toast.success(`已将 ${ids.length} 个项目绑定到「${addingSpace.space.name}」`)
      setAddingSpace(null)
      setCheckSet(new Set())
      await reload()
    } catch (e) {
      toast.error(`绑定失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBinding(false)
    }
  }

  // ───────── 解绑项目（仅移除访问入口） ─────────
  const [confirmUnbind, setConfirmUnbind] = useState<{ space: KnowledgeSpace; project: Project } | null>(null)

  const handleUnbind = async () => {
    if (!confirmUnbind) return
    try {
      await deleteBinding(confirmUnbind.project.id, confirmUnbind.space.id)
      toast.success(`已解绑「${confirmUnbind.project.project_name}」（知识保留在知识中心）`)
      setConfirmUnbind(null)
      await reload()
    } catch (e) {
      toast.error(`解绑失败：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // ───────── 删除整个知识库（真删） ─────────
  const [confirmDelete, setConfirmDelete] = useState<SpaceRow | null>(null)

  const handleDelete = async () => {
    if (!confirmDelete) return
    try {
      await deleteKnowledgeSpace(confirmDelete.space.id)
      toast.success(`已删除知识库「${confirmDelete.space.name}」`)
      setConfirmDelete(null)
      await reload()
    } catch (e) {
      toast.error(`删除失败：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return (
    <div style={{ padding: '24px 32px', height: '100%', overflowY: 'auto' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 16,
        }}
      >
        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)', margin: 0, flex: 1 }}>
          项目知识中心 · 知识库
        </h3>
        <button
          type="button"
          onClick={onBack}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '6px 12px', fontSize: 12, color: 'var(--color-text-secondary)',
            background: 'transparent', border: '1px solid var(--color-border-thin)',
            borderRadius: 'var(--radius)', cursor: 'pointer',
          }}
          title="返回目录树"
        >
          返回目录树
        </button>
        <button
          type="button"
          onClick={() => setCreating(true)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '6px 12px',
            background: 'var(--color-accent)',
            color: 'var(--color-text-on-accent, #fff)',
            border: 'none',
            borderRadius: 'var(--radius)',
            fontSize: 12,
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          <Plus size={12} strokeWidth={2} /> 新建知识库
        </button>
      </div>

      {/* 新建知识库弹窗 */}
      {creating && (
        <div
          onClick={() => setCreating(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--color-bg)', borderRadius: 'var(--radius-md)', padding: 24,
              maxWidth: 400, width: '90%', boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            }}
          >
            <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 12px', color: 'var(--color-text)' }}>
              新建知识库
            </h3>
            <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', lineHeight: 1.5, margin: '0 0 12px' }}>
              创建后<b>不自动绑定</b>任何项目；可稍后在行内点「添加项目」绑定（支持一个库绑定多个项目）。
            </p>
            <input
              autoFocus
              type="text"
              placeholder="知识库名称，如：集团合同知识库"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleCreateSpace() }}
              style={{
                width: '100%', boxSizing: 'border-box', padding: '8px 10px', fontSize: 13,
                border: '1px solid var(--color-border)', borderRadius: 'var(--radius)',
                background: 'var(--color-bg)', color: 'var(--color-text)', outline: 'none',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button
                type="button"
                onClick={() => setCreating(false)}
                style={{
                  padding: '6px 14px', fontSize: 12, border: '1px solid var(--color-border)',
                  background: 'var(--color-bg)', color: 'var(--color-text)', borderRadius: 'var(--radius)', cursor: 'pointer',
                }}
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void handleCreateSpace()}
                disabled={saving || !newName.trim()}
                style={{
                  padding: '6px 14px', fontSize: 12, border: 'none',
                  background: 'var(--color-accent)', color: 'var(--color-text-on-accent, #fff)',
                  borderRadius: 'var(--radius)', cursor: saving || !newName.trim() ? 'not-allowed' : 'pointer',
                  fontWeight: 500, opacity: saving || !newName.trim() ? 0.5 : 1,
                }}
              >
                {saving ? '创建中…' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>加载中…</div>
      ) : rows.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>
          还没有知识库。点击右上「新建知识库」开始，或去「项目中心 → 项目知识库」查看已绑定的库。
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rows.map((row) => (
            <div
              key={row.space.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                padding: '12px 14px',
                background: 'var(--color-bg-subtle)',
                border: '1px solid var(--color-border-thin)',
                borderRadius: 'var(--radius)',
              }}
            >
              {/* 行头：库名 + 进入 + 添加项目 + 删除 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Library size={14} color="var(--color-accent)" />
                <span
                  style={{ flex: 1, textAlign: 'left', fontSize: 13, color: 'var(--color-text)', fontWeight: 500 }}
                >
                  {row.space.name}
                </span>
                <button
                  type="button"
                  onClick={() => { setAddingSpace(row); setCheckSet(new Set()) }}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px',
                    fontSize: 11, background: 'transparent', color: 'var(--color-text-secondary)',
                    border: '1px solid var(--color-border-thin)', borderRadius: 'var(--radius)', cursor: 'pointer',
                  }}
                  title="把此知识库绑定给项目（可多选）"
                >
                  <UserPlus size={11} /> 添加项目
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(row)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px',
                    fontSize: 11, background: 'transparent', color: '#dc2626',
                    border: '1px solid rgba(220,38,38,0.3)', borderRadius: 'var(--radius)', cursor: 'pointer',
                  }}
                  title="删除（真删整个知识库：目录+知识+附件，不可恢复）"
                >
                  <Trash2 size={11} /> 删除
                </button>
              </div>

              {/* 已绑定项目列表 */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>绑定项目：</span>
                {row.boundProjects.length === 0 ? (
                  <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>（尚未绑定任何项目）</span>
                ) : (
                  row.boundProjects.map((p) => (
                    <span
                      key={p.id}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '2px 4px 2px 8px', fontSize: 11,
                        background: 'var(--color-bg)', color: 'var(--color-text-secondary)',
                        border: '1px solid var(--color-border-thin)', borderRadius: 999,
                      }}
                    >
                      {p.project_name}
                      <button
                        type="button"
                        onClick={() => setConfirmUnbind({ space: row.space, project: p })}
                        style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: 14, height: 14, background: 'transparent', border: 'none',
                          cursor: 'pointer', color: 'var(--color-text-tertiary)', padding: 0,
                        }}
                        title={`解绑 ${p.project_name}（知识保留在知识中心）`}
                      >
                        <X size={11} />
                      </button>
                    </span>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 添加项目弹窗 */}
      {addingSpace && (
        <div
          onClick={() => setAddingSpace(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--color-bg)', borderRadius: 'var(--radius-md)', padding: 24,
              maxWidth: 440, width: '90%', boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            }}
          >
            <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 12px', color: 'var(--color-text)' }}>
              添加项目 · {addingSpace.space.name}
            </h3>
            {addCandidateProjects.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>
                所有项目都已绑定此知识库，无需再添加。
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 300, overflowY: 'auto' }}>
                {addCandidateProjects.map((p) => {
                  const checked = checkSet.has(p.id)
                  return (
                    <label
                      key={p.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px',
                        borderRadius: 'var(--radius)', cursor: 'pointer', fontSize: 13,
                        color: 'var(--color-text)', background: checked ? 'var(--color-bg-active)' : 'transparent',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleCheck(p.id)}
                      />
                      {p.project_name}
                    </label>
                  )
                })}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
              <button
                type="button"
                onClick={() => setAddingSpace(null)}
                style={{
                  padding: '6px 14px', fontSize: 12, border: '1px solid var(--color-border)',
                  background: 'var(--color-bg)', color: 'var(--color-text)', borderRadius: 'var(--radius)', cursor: 'pointer',
                }}
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmAddProjects()}
                disabled={binding || checkSet.size === 0}
                style={{
                  padding: '6px 14px', fontSize: 12, border: 'none',
                  background: 'var(--color-accent)', color: 'var(--color-text-on-accent, #fff)',
                  borderRadius: 'var(--radius)', cursor: binding || checkSet.size === 0 ? 'not-allowed' : 'pointer',
                  fontWeight: 500, opacity: binding || checkSet.size === 0 ? 0.5 : 1,
                }}
              >
                {binding ? '绑定中…' : `绑定 ${checkSet.size} 个项目`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 解绑确认 */}
      {confirmUnbind && (
        <ConfirmDialog
          title={`解绑「${confirmUnbind.project.project_name}」？`}
          description={
            <>
              仅移除该项目的<b>访问入口</b>，知识库「{confirmUnbind.space.name}」及其中知识<b>保留</b>在知识中心。
              <br />可在项目中心 → 项目知识库里看到结果，也可在此重新添加。
            </>
          }
          confirmText="解绑"
          onConfirm={handleUnbind}
          onCancel={() => setConfirmUnbind(null)}
        />
      )}

      {/* 删除确认（真删） */}
      {confirmDelete && (
        <ConfirmDialog
          title={`删除「${confirmDelete.space.name}」知识库？`}
          description={
            <>
              此操作将<b>真删</b>整个知识库（绑定关系、目录、知识、附件及磁盘文件），<b>不可恢复</b>。
              <br />若仅想移除某项目入口、保留知识，请改用行内的「解绑」。
            </>
          }
          confirmText="删除"
          danger
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}

function ConfirmDialog({
  title,
  description,
  confirmText,
  onConfirm,
  onCancel,
  danger,
}: {
  title: string
  description: React.ReactNode
  confirmText: string
  onConfirm: () => void
  onCancel: () => void
  danger?: boolean
}) {
  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--color-bg)', borderRadius: 'var(--radius-md)', padding: 24,
          maxWidth: 440, width: '90%', boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        }}
      >
        <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 12px', color: 'var(--color-text)' }}>
          {title}
        </h3>
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.6, margin: '0 0 16px' }}>
          {description}
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '6px 14px', fontSize: 12, border: '1px solid var(--color-border)',
              background: 'var(--color-bg)', color: 'var(--color-text)', borderRadius: 'var(--radius)', cursor: 'pointer',
            }}
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              padding: '6px 14px', fontSize: 12, border: 'none',
              background: danger ? '#dc2626' : 'var(--color-accent)',
              color: '#fff', borderRadius: 'var(--radius)', cursor: 'pointer', fontWeight: 500,
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ProjectBindingList
