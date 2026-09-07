/**
 * PMTool · 项目知识中心绑定列表（2026-09-04 重构 · 设计文档 §13 · §14）
 *
 * 设计要点：
 *   - 项目中心只是“访问入口”，不持有知识数据；项目知识归 knowledge_spaces（绑定关系）
 *   - 「添加项目」= 创建项目知识空间（如不存在）+ 创建 binding 关系
 *   - 「解绑」= 删除 binding 关系；项目知识空间的目录 / 知识 / 附件 全部保留
 *   - 删除项目知识空间本身（真删）需走知识中心 → 选中项目 → 删除入口（不在此处）
 *
 * 列出当前所有已绑定项目，并提供「添加项目」下拉（仅显示尚未绑定的项目）。
 * 点击项目进入该项目的 KnowledgeTreeView（由父组件 KnowledgePage 控制切换）。
 */

import { useEffect, useState, useCallback } from 'react'
import { Plus, X, BookOpen, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { listProjects, type Project } from '@/services/project'
import {
  listProjectBindings,
  createBinding,
  deleteBinding,
  listProjectKnowledgeSpaces,
  createKnowledgeSpace,
  deleteKnowledgeSpace,
} from '@/services/knowledgeSpaces'

interface ProjectBindingListProps {
  /** 点击项目后由父组件切换到该项目的 KnowledgeTreeView */
  onSelectProject: (projectId: number) => void
}

interface BoundRow {
  project: Project
  spaceId: number
}

export function ProjectBindingList({ onSelectProject }: ProjectBindingListProps) {
  const [allProjects, setAllProjects] = useState<Project[]>([])
  const [bound, setBound] = useState<BoundRow[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [confirmUnbind, setConfirmUnbind] = useState<BoundRow | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const projects = await listProjects()
      setAllProjects(projects)

      // 对每个项目查询 binding + 知识空间（空间 id 用于解绑定位）
      const rows: BoundRow[] = []
      for (const p of projects) {
        const bindings = await listProjectBindings(p.id)
        if (bindings.length === 0) continue
        const spaces = await listProjectKnowledgeSpaces(p.id)
        if (spaces.length === 0) continue
        rows.push({ project: p, spaceId: spaces[0].id })
      }
      setBound(rows)
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

  const unboundProjects = allProjects.filter(
    (p) => !bound.some((b) => b.project.id === p.id),
  )

  const handleAdd = async (projectId: number) => {
    try {
      const project = allProjects.find((p) => p.id === projectId)
      // 每个项目一个知识空间；不存在则自动创建（项目知识归属在知识中心，新建/删除都在这）
      let spaces = await listProjectKnowledgeSpaces(projectId)
      let spaceId = spaces[0]?.id
      if (!spaceId) {
        const created = await createKnowledgeSpace({
          spaceType: 'PROJECT',
          projectId,
          name: project?.project_name ?? `项目 ${projectId} 知识库`,
        })
        spaceId = created.id
        spaces = [created]
      }
      // 解绑后再重新添加：允许匿名给同一个项目建多个空间，这里始终复用第一个
      const bindings = await listProjectBindings(projectId)
      const already = bindings.some((b) => b.knowledgeSpaceId === spaceId)
      if (!already) {
        await createBinding({ projectId, knowledgeSpaceId: spaceId })
      }
      toast.success('已添加项目知识库')
      setAdding(false)
      await reload()
      void onSelectProject(projectId)
    } catch (e) {
      toast.error(`添加失败：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const handleUnbind = async () => {
    if (!confirmUnbind) return
    try {
      // 知识中心·项目知识中心 = 知识库的创建/删除归属地。删除 = 真删整个项目知识库
      // （解绑 + 目录/知识/附件记录 + 磁盘文件）。解绑（仅移除访问入口）在项目详情知识 tab。
      await deleteKnowledgeSpace(confirmUnbind.spaceId)
      toast.success('已删除项目知识库')
      setConfirmUnbind(null)
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
          项目知识中心
        </h3>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          disabled={unboundProjects.length === 0 && !adding}
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
            cursor: unboundProjects.length === 0 && !adding ? 'not-allowed' : 'pointer',
            opacity: unboundProjects.length === 0 && !adding ? 0.5 : 1,
          }}
        >
          <Plus size={12} strokeWidth={2} /> 添加项目
        </button>
      </div>

      {adding && (
        <div
          style={{
            marginBottom: 16,
            padding: 12,
            background: 'var(--color-bg-subtle)',
            border: '1px solid var(--color-border-thin)',
            borderRadius: 'var(--radius)',
          }}
        >
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 8 }}>
            选择尚未绑定的项目：
          </div>
          {unboundProjects.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>所有项目都已绑定</div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {unboundProjects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleAdd(p.id)}
                  style={{
                    padding: '5px 10px',
                    fontSize: 12,
                    background: 'var(--color-bg)',
                    color: 'var(--color-text)',
                    border: '1px solid var(--color-border-thin)',
                    borderRadius: 'var(--radius)',
                    cursor: 'pointer',
                  }}
                >
                  {p.project_name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>加载中…</div>
      ) : bound.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>
          尚未绑定任何项目。点击右上「添加项目」开始。
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {bound.map((row) => (
            <div
              key={row.project.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 14px',
                background: 'var(--color-bg-subtle)',
                border: '1px solid var(--color-border-thin)',
                borderRadius: 'var(--radius)',
              }}
            >
              <BookOpen size={14} color="var(--color-accent)" />
              <button
                type="button"
                onClick={() => onSelectProject(row.project.id)}
                style={{
                  flex: 1,
                  textAlign: 'left',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 13,
                  color: 'var(--color-text)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                {row.project.project_name}
                <ChevronRight size={12} />
              </button>
              <button
                type="button"
                onClick={() => setConfirmUnbind(row)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '4px 10px',
                  fontSize: 11,
                  background: 'transparent',
                  color: 'var(--color-text-tertiary)',
                  border: '1px solid var(--color-border-thin)',
                  borderRadius: 'var(--radius)',
                  cursor: 'pointer',
                }}
                title="删除（真删整个项目知识库：目录+知识+附件，不可恢复）"
              >
                <X size={11} /> 删除
              </button>
            </div>
          ))}
        </div>
      )}

      {confirmUnbind && (
        <ConfirmUnbindDialog
          projectName={confirmUnbind.project.project_name}
          onConfirm={handleUnbind}
          onCancel={() => setConfirmUnbind(null)}
        />
      )}
    </div>
  )
}

function ConfirmUnbindDialog({
  projectName,
  onConfirm,
  onCancel,
}: {
  projectName: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--color-bg)',
          borderRadius: 'var(--radius-md)',
          padding: 24,
          maxWidth: 420,
          width: '90%',
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        }}
      >
        <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 12px', color: 'var(--color-text)' }}>
          删除「{projectName}」的项目知识库？
        </h3>
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.6, margin: '0 0 16px' }}>
          此操作将<strong>真删</strong>该项目整个知识库（目录、知识、附件及磁盘文件），<strong>不可恢复</strong>。
          <br />
          若仅想移除项目中心入口、保留知识，请去「项目中心 → 项目知识库」解绑。
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '6px 14px',
              fontSize: 12,
              border: '1px solid var(--color-border)',
              background: 'var(--color-bg)',
              color: 'var(--color-text)',
              borderRadius: 'var(--radius)',
              cursor: 'pointer',
            }}
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              padding: '6px 14px',
              fontSize: 12,
              border: 'none',
              background: '#dc2626',
              color: '#fff',
              borderRadius: 'var(--radius)',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            删除
          </button>
        </div>
      </div>
    </div>
  )
}

export default ProjectBindingList
