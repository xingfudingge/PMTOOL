/**
 * PMTool V2.0 · 知识中心（2026-09-04 重构 · 设计文档 §4 · §10 · §31）
 *
 * 顶部一级 tab：个人 / 项目。
 *   - 个人 tab → PersonalKnowledgeCenter（统一两栏树）
 *   - 项目 tab → ProjectBindingList（**以知识库为主**：库列表 + 新建/添加项目/解绑/删除），
 *               点击某个知识库后展示该库 KnowledgeTreeView（按 spaceId 进入）
 */

import { useState } from 'react'
import { Search, ChevronLeft, Library } from 'lucide-react'
import { PersonalKnowledgeCenter } from '@/components/KnowledgeSpaceView/PersonalKnowledgeCenter'
import { KnowledgeTreeView } from '@/components/KnowledgeSpaceView/KnowledgeTreeView'
import { ProjectBindingList } from '@/components/KnowledgeSpaceView/ProjectBindingList'
import { GlobalSearchResults } from '@/components/KnowledgeSpaceView/GlobalSearchResults'
import type { KnowledgeSpace } from '@/services/knowledgeSpaces'

export function KnowledgePage() {
  const [space, setSpace] = useState<'personal' | 'project'>('personal')
  const [globalQuery, setGlobalQuery] = useState('')
  const [selectedSpace, setSelectedSpace] = useState<KnowledgeSpace | null>(null)

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
            setSelectedSpace(null)
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
        ) : selectedSpace != null ? (
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
                onClick={() => setSelectedSpace(null)}
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
                title="返回知识库列表"
              >
                <ChevronLeft size={12} /> 返回知识库列表
              </button>
              <Library size={13} color="var(--color-accent)" />
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text)' }}>
                {selectedSpace.name}
              </div>
            </div>
            <div style={{ flex: 1, minHeight: 0 }}>
              <KnowledgeTreeView
                mode="project"
                spaceId={selectedSpace.id}
                projectName={selectedSpace.name}
                emptyHint="选中知识开始编辑，或点 ⋯ 添加子目录"
              />
            </div>
          </div>
        ) : (
          <ProjectBindingList onSelectSpace={(s) => setSelectedSpace(s)} />
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

export default KnowledgePage
