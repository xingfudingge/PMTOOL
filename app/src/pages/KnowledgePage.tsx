/**
 * PMTool V2.0 · 知识中心（维护者 2026-09-03 重构）
 *
 * 个人知识中心与项目知识中心完全独立：
 *   - 个人知识中心：独立的目录树和笔记体系
 *   - 项目知识中心：按项目区分，每个项目独立的知识和目录
 *
 * 两者不共用一套数据，业务边界清晰。
 */

import { useState, useEffect, useCallback } from 'react'
import { PersonalKnowledgeCenter } from '@/components/KnowledgeSpaceView/PersonalKnowledgeCenter'
import { ProjectKnowledgeCenter } from '@/components/KnowledgeSpaceView/ProjectKnowledgeCenter'
import { GlobalSearchResults } from '@/components/KnowledgeSpaceView/GlobalSearchResults'
import { BookOpen, Search } from 'lucide-react'
import { listProjects, type Project } from '@/services/project'

export function KnowledgePage() {
  const [space, setSpace] = useState<'personal' | 'project'>('personal')
  const [globalQuery, setGlobalQuery] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [loadingProjects, setLoadingProjects] = useState(true)

  // 加载项目列表
  const loadProjects = useCallback(async () => {
    try {
      const projectList = await listProjects()
      setProjects(projectList)
    } catch (e) {
      console.error('[KnowledgePage] loadProjects failed:', e)
    } finally {
      setLoadingProjects(false)
    }
  }, [])

  useEffect(() => {
    if (space === 'project') {
      void loadProjects()
    }
  }, [space, loadProjects])

  // 全局搜索
  if (globalQuery.trim()) {
    return <GlobalSearchResults query={globalQuery.trim()} onDeleted={() => setGlobalQuery('')} />
  }

  return (
    <div
      data-testid="knowledge-page"
      style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
    >
      {/* 顶部全局搜索 */}
      <div style={{ padding: '12px 24px 0', borderBottom: '1px solid var(--color-border-thin)', background: 'var(--color-bg-subtle)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, height: 28, background: 'var(--color-bg)', border: '1px solid var(--color-border-thin)', borderRadius: 'var(--radius)', padding: '0 10px' }}>
          <Search size={12} strokeWidth={1.75} color="var(--color-text-tertiary)" />
          <input
            type="search"
            value={globalQuery}
            onChange={(e) => setGlobalQuery(e.target.value)}
            placeholder="🔍 搜索全部知识…"
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 12, color: 'var(--color-text)' }}
          />
          {globalQuery && (
            <button
              type="button"
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, background: 'transparent', border: 'none', borderRadius: 4, cursor: 'pointer', color: 'var(--color-text-tertiary)', flexShrink: 0 }}
              onClick={() => setGlobalQuery('')}
              title="清空"
            >
              <BookOpen size={10} />
            </button>
          )}
        </div>
      </div>

      {/* 一级空间切换（个人 / 项目） */}
      <div
        style={{
          display: 'flex',
          gap: 6,
          padding: '12px 24px 0',
          borderBottom: '1px solid var(--color-border-thin)',
          background: 'var(--color-bg-subtle)',
        }}
      >
        <SpaceTab
          active={space === 'personal'}
          onClick={() => setSpace('personal')}
          label="个人知识中心"
          testid="space-personal"
        />
        <SpaceTab
          active={space === 'project'}
          onClick={() => setSpace('project')}
          label="项目知识中心"
          testid="space-project"
        />
      </div>

      {/* 项目选择（仅项目空间显示） */}
      {space === 'project' && (
        <ProjectSelector
          selectedProjectId={selectedProjectId}
          onSelect={setSelectedProjectId}
          projects={projects}
          loading={loadingProjects}
        />
      )}

      {/* 内容区域 */}
      <div style={{ flex: 1, minHeight: 0 }}>
        {space === 'personal' ? (
          <PersonalKnowledgeCenter />
        ) : selectedProjectId ? (
          <ProjectKnowledgeCenterDetail projectId={selectedProjectId} />
        ) : (
          <ProjectList onSelectProject={setSelectedProjectId} projects={projects} loading={loadingProjects} />
        )}
      </div>
    </div>
  )
}

// ============================================================
// 子组件
// ============================================================

function SpaceTab({
  active,
  onClick,
  label,
  testid,
}: {
  active: boolean
  onClick: () => void
  label: string
  testid: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testid}
      style={{
        padding: '8px 14px',
        fontSize: 13,
        fontWeight: active ? 600 : 400,
        color: active ? 'var(--color-text)' : 'var(--color-text-secondary)',
        background: 'transparent',
        border: 'none',
        borderBottom: active ? '2px solid var(--color-accent)' : '2px solid transparent',
        cursor: 'pointer',
        marginBottom: -1,
      }}
    >
      {label}
    </button>
  )
}

function ProjectSelector({
  selectedProjectId,
  onSelect,
  projects,
  loading,
}: {
  selectedProjectId: number | null
  onSelect: (id: number | null) => void
  projects: Project[]
  loading: boolean
}) {
  if (loading) {
    return (
      <div
        style={{
          padding: '8px 24px',
          borderBottom: '1px solid var(--color-border-thin)',
          background: 'var(--color-bg)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>加载中...</span>
      </div>
    )
  }

  return (
    <div
      style={{
        padding: '8px 24px',
        borderBottom: '1px solid var(--color-border-thin)',
        background: 'var(--color-bg)',
        display: 'flex',
        gap: 8,
        alignItems: 'center',
      }}
    >
      <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>选择项目：</span>
      <select
        value={selectedProjectId ?? ''}
        onChange={(e) => onSelect(e.target.value ? Number(e.target.value) : null)}
        style={{
          fontSize: 12,
          padding: '4px 8px',
          border: '1px solid var(--color-border-thin)',
          borderRadius: 'var(--radius)',
          background: 'var(--color-bg)',
          color: 'var(--color-text)',
          minWidth: 200,
        }}
      >
        <option value="">全部项目</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.project_name}
          </option>
        ))}
      </select>
    </div>
  )
}

function ProjectList({
  onSelectProject,
  projects,
  loading,
}: {
  onSelectProject: (id: number) => void
  projects: Project[]
  loading: boolean
}) {
  if (loading) {
    return (
      <div style={{ padding: 32, color: 'var(--color-text-tertiary)', textAlign: 'center' }}>
        加载中...
      </div>
    )
  }

  if (projects.length === 0) {
    return (
      <div style={{ padding: 32, color: 'var(--color-text-tertiary)', textAlign: 'center' }}>
        <div style={{ fontSize: 14, marginBottom: 16 }}>暂无项目</div>
        <div style={{ fontSize: 12 }}>请先创建项目</div>
      </div>
    )
  }

  return (
    <div style={{ padding: 32, color: 'var(--color-text-tertiary)', textAlign: 'center' }}>
      <div style={{ fontSize: 14, marginBottom: 16 }}>请从上方选择项目以查看项目知识中心</div>
      <div style={{ fontSize: 12 }}>选择项目后，将显示该项目的目录树和笔记</div>
      <div style={{ marginTop: 24, textAlign: 'left', maxWidth: 600, margin: '24px auto' }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 8 }}>可用项目:</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {projects.map((p) => (
            <span
              key={p.id}
              style={{
                padding: '4px 12px',
                fontSize: 11,
                background: 'var(--color-bg)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius)',
                color: 'var(--color-text-secondary)',
              }}
            >
              {p.project_name}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

function ProjectKnowledgeCenterDetail({ projectId }: { projectId: number }) {
  const [projectName, setProjectName] = useState('')

  useEffect(() => {
    // 简单模拟：实际应该调用 API
    // 这里简化处理
    setProjectName(`项目 ${projectId}`)
  }, [projectId])

  return <ProjectKnowledgeCenter projectId={projectId} projectName={projectName} />
}
