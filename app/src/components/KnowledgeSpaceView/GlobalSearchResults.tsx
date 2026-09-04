/**
 * PMTool · 知识中心全局搜索结果（维护者 2026-09-01）
 *
 * 顶部全局搜索框输入 → 显示跨个人/项目的搜索结果
 *   ┌────────────────────────────────────────────────────────────┐
 *   │ 搜索：全部结果（个人 / 项目）                              │
 *   ├────────────────────────────────────────────────────────────┤
 *   │ [P] 笔记 1 标题                                              │
 *   │   项目 · 项目 A                                              │
 *   │   摘要...                                                  │
 *   │ ───────────────────────────────────────────────────────────  │
 *   │ [P] 笔记 2 标题 (个人知识中心)                                │
 *   │   个人知识中心                                             │
 *   │   摘要...                                                  │
 *   └────────────────────────────────────────────────────────────┘
 *
 * 选中笔记 → 右侧编辑器打开
 */

import { useState, useCallback, useEffect, useMemo } from 'react'
import { BookOpen, FileText, Search, X } from 'lucide-react'
import { listProjects, type Project } from '@/services/project'
import { searchKnowledgeNotesBySpace, searchKnowledgeNotesBySpaceType, type KnowledgeNote as DbNote, type KnowledgeSpace } from '@/services/knowledge'
import { ActiveNoteEditor, EmptyEditor, emptyStyle, iconBtnStyle, titleStyle, headerStyle } from './parts'

interface GlobalSearchResultsProps {
  query: string
  onExported?: (path: string) => void
  onDeleted?: () => void
}

const listPanelStyle: React.CSSProperties = {
  width: 320,
  flexShrink: 0,
  borderRight: '1px solid var(--color-border-thin)',
  background: 'var(--color-bg)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
}

const editorPanelStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
  background: 'var(--color-bg)',
}

export function GlobalSearchResults({ query, onExported = () => {}, onDeleted = () => {} }: GlobalSearchResultsProps) {
  const [personalNotes, setPersonalNotes] = useState<DbNote[]>([])
  const [projectNotes, setProjectNotes] = useState<DbNote[]>([])
  const [loading, setLoading] = useState(true)
  const [activeNoteId, setActiveNoteId] = useState<number | null>(null)
  const [loadingNote, setLoadingNote] = useState<DbNote | null>(null)

  useEffect(() => {
    let cancelled = false
    async function run() {
      setLoading(true)
      try {
        const [pNotes, projNotes] = await Promise.all([
          searchKnowledgeNotesBySpaceType('personal', query),
          searchKnowledgeNotesBySpaceType('project', query),
        ])
        if (!cancelled) {
          setPersonalNotes(pNotes)
          setProjectNotes(projNotes)
        }
      } catch (e) {
        console.error('[GlobalSearchResults] search failed:', e)
        if (!cancelled) {
          setPersonalNotes([])
          setProjectNotes([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    run()
    return () => { cancelled = true }
  }, [query])

  const activeNote = loadingNote && loadingNote.id === activeNoteId ? loadingNote : null

  const openNote = useCallback(async (note: DbNote) => {
    setActiveNoteId(note.id)
    setLoadingNote(note)
  }, [])

  // 合并结果，按空间 + 更新时间排序
  const allNotes = useMemo(() => {
    const merged = [
      ...personalNotes.map((n) => ({ ...n, source: 'personal' as const })),
      ...projectNotes.map((n) => ({ ...n, source: 'project' as const })),
    ]
    return merged.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
  }, [personalNotes, projectNotes])

  // 注意：formatSource 定义在 NoteRow 组件内部使用，不在这里重复

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* 左列：搜索结果 */}
      <div style={listPanelStyle}>
        <div style={headerStyle}>
          <h3 style={titleStyle}>搜索：{query}</h3>
          <button type="button" style={iconBtnStyle} onClick={onDeleted} title="清空">
            <X size={14} strokeWidth={2} />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={emptyStyle}>加载中…</div>
          ) : allNotes.length === 0 ? (
            <div style={emptyStyle}>没有找到匹配的笔记</div>
          ) : (
            allNotes.map((n) => (
              <NoteRow
                key={n.id}
                note={n}
                active={activeNoteId === n.id}
                onClick={() => openNote(n)}
                onDelete={() => {}}
              />
            ))
          )}
        </div>
      </div>

      {/* 右列：编辑器 */}
      <div style={editorPanelStyle}>
        {activeNote ? (
          <ActiveNoteEditor
            activeNote={activeNote}
            onExported={onExported}
            onDeleted={onDeleted}
          />
        ) : (
          <EmptyEditor
            title="全局搜索"
            subtitle="左侧选择笔记开始编辑"
          />
        )}
      </div>
    </div>
  )
}

function NoteRow({
  note,
  active,
  onClick,
  onDelete,
}: {
  note: DbNote & { source?: 'personal' | 'project' }
  active: boolean
  onClick: () => void
  onDelete: () => void
}) {
  const formatSource = (n: DbNote & { source?: 'personal' | 'project' }): string => {
    if (n.source === 'personal') return '个人知识中心'
    if (n.source === 'project') return '项目知识中心'
    return '未知'
  }
  return (
    <div
      onClick={onClick}
      style={{
        padding: '10px 14px',
        borderBottom: '1px solid var(--color-border-thin)',
        background: active ? 'var(--color-bg-subtle)' : 'transparent',
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <FileText
          size={12}
          strokeWidth={1.75}
          color={active ? 'var(--color-accent)' : 'var(--color-text-tertiary)'}
          style={{ flexShrink: 0 }}
        />
        <span
          style={{
            flex: 1,
            fontSize: 12.5,
            fontWeight: 500,
            color: 'var(--color-text)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={note.title || '未命名'}
        >
          {note.title || '未命名'}
        </span>
        <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
          {formatSource(note)}
        </span>
      </div>
      <div
        style={{
          fontSize: 11,
          color: 'var(--color-text-tertiary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {note.contentMd?.trim() ? note.contentMd.slice(0, 80) : '（空白笔记）'}
      </div>
    </div>
  )
}

export default GlobalSearchResults
