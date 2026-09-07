/**
 * PMTool V2.0 · 知识中心（2026-09-04 重构 · 设计文档 §4 · §10 · §31）
 *
 * 顶部一级 tab：个人 / 项目。
 *   - 个人 tab → PersonalKnowledgeCenter（统一两栏树）
 *   - 项目 tab → ProjectBindingList（项目绑定列表 + 添加 / 解绑），
 *               选中项目后展示该项目 KnowledgeTreeView（两栏）
 */

import { useState, useCallback, useEffect } from 'react'
import { Search, ChevronLeft } from 'lucide-react'
import { PersonalKnowledgeCenter } from '@/components/KnowledgeSpaceView/PersonalKnowledgeCenter'
import { KnowledgeTreeView } from '@/components/KnowledgeSpaceView/KnowledgeTreeView'
import { ProjectBindingList } from '@/components/KnowledgeSpaceView/ProjectBindingList'
import { GlobalSearchResults } from '@/components/KnowledgeSpaceView/GlobalSearchResults'
import { listProjects, type Project } from '@/services/project'

export function KnowledgePage() {
  const [space, setSpace] = useState<'personal' | 'project'>('personal')
  const [globalQuery, setGlobalQuery] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null)
  const [projectName, setProjectName] = useState('')
  const [loadingName, setLoadingName] = useState(false)

  // 选中项目后拉取项目名（绑定列表的 Project 对象需另查一次 · 此处简化为直接走 listProjects）
  const loadProjectName = useCallback(async (id: number) => {
    setLoadingName(true)
    try {
      const all = await listProjects()
      const p = all.find((x) => x.id === id)
      if (p) setProjectName(p.project_name)
      else setProjectName(`项目 ${id}`)
    } catch {
      setProjectName(`项目 ${id}`)
    } finally {
      setLoadingName(false)
    }
  }, [])

  useEffect(() => {
    if (selectedProjectId != null) {
      void loadProjectName(selectedProjectId)
    } else {
      setProjectName('')
    }
  }, [selectedProjectId, loadProjectName])

  // 全局搜索优先
  if (globalQuery.trim()) {
    return <GlobalSearchResults query={globalQuery.trim()} onDeleted={() => setGlobalQuery('')} />
  }

  return (
    <div data-testid="knowledge-page" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          padding: '12px 24px 0',
          borderBottom: '1px solid var(--color-border-thin)',
          background: 'var(--color-bg-subtle)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            height: 28,
            background: 'var(--color-bg)',
            border: '1px solid var(--color-border-thin)',
            borderRadius: 'var(--radius)',
            padding: '0 10px',
          }}
        >
          <Search size={12} strokeWidth={1.75} color="var(--color-text-tertiary)" />
          <input
            type="search"
            value={globalQuery}
            onChange={(e) => setGlobalQuery(e.target.value)}
            placeholder="🔍 搜索全部知识…"
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontSize: 12,
              color: 'var(--color-text)',
            }}
          />
          {globalQuery && (
            <button
              type="button"
              onClick={() => setGlobalQuery('')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 18,
                height: 18,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--color-text-tertiary)',
              }}
              title="清空"
            >
              ×
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
          onClick={() => {
            setSpace('personal')
            setSelectedProjectId(null)
          }}
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

      {/* 内容区 */}
      <div style={{ flex: 1, minHeight: 0 }}>
        {space === 'personal' ? (
          <PersonalKnowledgeCenter />
        ) : selectedProjectId != null ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 16px',
                borderBottom: '1px solid var(--color-border-thin)',
                background: 'var(--color-bg)',
                flexShrink: 0,
              }}
            >
              <button
                type="button"
                onClick={() => setSelectedProjectId(null)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '4px 10px',
                  background: 'transparent',
                  border: '1px solid var(--color-border-thin)',
                  borderRadius: 'var(--radius)',
                  fontSize: 12,
                  color: 'var(--color-text-secondary)',
                  cursor: 'pointer',
                }}
                title="返回项目列表"
              >
                <ChevronLeft size={12} /> 返回项目列表
              </button>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text)' }}>
                {loadingName ? '加载中…' : projectName}
              </div>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              <KnowledgeTreeView
                mode="project"
                projectId={selectedProjectId}
                projectName={projectName}
                emptyHint="选中项目目录中的知识开始编辑，或点 ⋯ 添加子目录"
              />
            </div>
          </div>
        ) : (
          <ProjectBindingList onSelectProject={(id) => setSelectedProjectId(id)} />
        )}
      </div>
    </div>
  )
}

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
