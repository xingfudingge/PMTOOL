/**
 * PMTool · KnowledgeSpaceView 共享组件（维护者 2026-08-31 · Phase C 三栏布局）
 *
 * 「知识中心」页和项目内「知识中心」tab 共用的视图（Phase C）：
 *   ┌──────────────┬──────────────────┬──────────────────────────────┐
 *   │ 目录树        │ 笔记列表          │ 知识编辑区（全宽 · 不抽屉）     │
 *   │ - 工作笔记    │ [置顶] 标题       │ 标题 + 状态徽标 + BlockNote    │
 *   │   - 经验      │ [P] 经验1 摘要     │                              │
 *   │   - 模板      │ [P] 经验2 摘要     │                              │
 *   │ + 新建目录    │                  │                              │
 *   └──────────────┴──────────────────┴──────────────────────────────┘
 *
 * - KnowledgePage 顶部还有「个人 / 项目」一级 tab 切换
 * - KnowledgeTab（ProjectDetailPage 内）只显示当前项目的树
 *
 * 编辑器走 DocumentEditor，source.kind='knowledge'，initialBlocks 由外层预 load
 * 后传入（避免 setBlocks 不触发 editor 重初始化的 bug）。
 *
 * 模块命名锁定：必须是「知识中心」「项目文件管理」，禁止"知识库"等替代名。
 */

import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  BookOpen,
  CirclePlus,
  ChevronRight,
  ChevronDown,
  FileUp,
  FileText,
  Folder,
  FolderOpen,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  X,
  Pencil,
} from 'lucide-react'
import {
  listKnowledgeNotes,
  upsertKnowledgeNote,
  deleteKnowledgeNote,
  searchKnowledgeNotesBySpaceType,
  getKnowledgeNote,
  listKnowledgeFolders,
  listKnowledgeFoldersByProject,
  upsertKnowledgeFolder,
  deleteKnowledgeFolder,
  type KnowledgeNote as DbNote,
  type KnowledgeFolder as DbFolder,
} from '@/services/knowledge'
import type { KnowledgeSpace } from '@/services/knowledge'
import { DocumentEditor } from '@/components/DocumentEditor'
import { resolveInitialBlocks } from '@/components/DocumentEditor/useBlockNoteSetup'
import type { Block } from '@blocknote/core'
import { importMarkdownFile } from './importMarkdown'
import type { SaveStatus } from '@/components/DocumentEditor/types'

interface KnowledgeSpaceViewProps {
  space: KnowledgeSpace
  /** project 空间必填 · 关联到 knowledge_spaces 的 ID */
  spaceId?: number
  projectId?: number
  title?: string
  subtitle?: string
}

const rootStyle: React.CSSProperties = {
  display: 'flex',
  height: '100%',
  background: 'var(--color-bg)',
}

const treePanelStyle: React.CSSProperties = {
  width: 240,
  flexShrink: 0,
  borderRight: '1px solid var(--color-border-thin)',
  background: 'var(--color-bg-subtle)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
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

const headerStyle: React.CSSProperties = {
  padding: '14px 16px',
  borderBottom: '1px solid var(--color-border-thin)',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexShrink: 0,
}

const titleStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: 'var(--color-text)',
  flex: 1,
  margin: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const subtitleStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--color-text-tertiary)',
  padding: '0 16px 10px',
  borderBottom: '1px solid var(--color-border-thin)',
  flexShrink: 0,
}

const searchWrapStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  margin: '0 16px 10px',
  padding: '0 10px',
  height: 28,
  background: 'var(--color-bg)',
  border: '1px solid var(--color-border-thin)',
  borderRadius: 'var(--radius)',
}

const searchInputStyle: React.CSSProperties = {
  flex: 1,
  border: 'none',
  outline: 'none',
  background: 'transparent',
  fontSize: 12,
  color: 'var(--color-text)',
}

const btnPrimaryStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '5px 10px',
  background: 'var(--color-accent)',
  color: 'var(--color-text-on-accent, #fff)',
  borderRadius: 'var(--radius)',
  fontSize: 12,
  fontWeight: 500,
  border: 'none',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

const btnGhostStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '5px 10px',
  background: 'transparent',
  color: 'var(--color-text-secondary)',
  border: '1px solid var(--color-border-thin)',
  borderRadius: 'var(--radius)',
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

const iconBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 18,
  height: 18,
  background: 'transparent',
  border: 'none',
  borderRadius: 2,
  cursor: 'pointer',
  color: 'var(--color-text-tertiary)',
  flexShrink: 0,
  padding: 0,
  margin: '0 0 0 1px',
}

const iconBtnStyleHover: React.CSSProperties = {
  background: 'var(--color-bg-subtle)',
  color: 'var(--color-text)',
}

const folderRowStyle = (active: boolean, depth: number): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  padding: `5px 10px 5px ${12 + depth * 12}px`,
  fontSize: 12.5,
  fontWeight: active ? 500 : 400,
  color: active ? 'var(--color-text)' : 'var(--color-text-secondary)',
  background: active ? 'var(--color-bg-active)' : 'transparent',
  border: 'none',
  cursor: 'pointer',
  textAlign: 'left',
  width: '100%',
})

const noteRowStyle = (active: boolean): React.CSSProperties => ({
  display: 'block',
  padding: '10px 14px',
  borderBottom: '1px solid var(--color-border-thin)',
  background: active ? 'var(--color-bg-subtle)' : 'transparent',
  cursor: 'pointer',
  position: 'relative',
})

const emptyStyle: React.CSSProperties = {
  padding: '40px 16px',
  textAlign: 'center',
  fontSize: 12,
  color: 'var(--color-text-tertiary)',
}

const editorEmptyStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  color: 'var(--color-text-tertiary)',
  fontSize: 13,
  gap: 12,
  padding: 32,
  textAlign: 'center',
}

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const now = Date.now()
  const diff = Math.floor((now - t) / 60000)
  if (diff < 1) return '刚刚'
  if (diff < 60) return `${diff} 分钟前`
  if (diff < 60 * 24) return `${Math.floor(diff / 60)} 小时前`
  const days = Math.floor(diff / (60 * 24))
  if (days < 30) return `${days} 天前`
  return new Date(iso).toLocaleDateString('zh-CN')
}

// ============================================================
// FolderNode（前端树组装）
// ============================================================

interface FolderNode extends DbFolder {
  children: FolderNode[]
  notes: DbNote[]
  expanded: boolean
  systemType: string
  isSystem?: boolean
}

function buildFolderTree(folders: DbFolder[], notes: DbNote[]): FolderNode[] {
  const map = new Map<number, FolderNode>()
  for (const f of folders) {
    map.set(f.id, { ...f, children: [], notes: [], expanded: true })
  }
  for (const n of notes) {
    if (n.folderId != null && map.has(n.folderId)) {
      map.get(n.folderId)!.notes.push(n)
    }
  }
  const roots: FolderNode[] = []
  for (const node of map.values()) {
    if (node.parentId == null) {
      roots.push(node)
    } else {
      const parent = map.get(node.parentId)
      if (parent) parent.children.push(node)
      else roots.push(node)
    }
  }
  // 根目录 notes 收集：folderId=null
  const rootNotes = notes.filter((n) => n.folderId == null)
  roots.push({
    id: 0,
    parentId: null,
    space: roots[0]?.space ?? 'personal',
    spaceId: roots[0]?.spaceId ?? null,
    projectId: roots[0]?.projectId ?? null,
    name: '未分类',
    sortOrder: 0,
    createdAt: '',
    updatedAt: '',
    children: [],
    notes: rootNotes,
    expanded: true,
    systemType: 'USER',
    isSystem: false, // 未分类不是系统目录
  })
  return roots
}

// ============================================================
// 主组件
// ============================================================

export function KnowledgeSpaceView({
  space,
  projectId,
  title,
  subtitle,
}: KnowledgeSpaceViewProps) {
  const [notes, setNotes] = useState<DbNote[]>([])
  const [folders, setFolders] = useState<DbFolder[]>([])
  const [search, setSearch] = useState('')
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(0) // 0 = 未分类
  const [activeNoteId, setActiveNoteId] = useState<number | null>(null)
  const [loadingNote, setLoadingNote] = useState<DbNote | null>(null)
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const q = search.trim()
      // 搜索时不限制目录，但 list 时按 space
      const noteData = q
        ? await searchKnowledgeNotesBySpaceType(space, q)
        : await listKnowledgeNotes(0)
      const folderData =
        space === 'project' && projectId != null
          ? await listKnowledgeFoldersByProject(projectId)
          : await listKnowledgeFolders(space)
      setNotes(noteData)
      setFolders(folderData)
    } catch (e) {
      console.error('[KnowledgeSpaceView] refresh failed:', e)
      setNotes([])
      setFolders([])
    } finally {
      setLoading(false)
    }
  }, [space, projectId, search])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // 笔记列表：当前选中目录的笔记（搜索时跨目录）
  const listNotes = useMemo(() => {
    if (search.trim()) return notes // 搜索结果全显示
    if (selectedFolderId == null) return notes.filter((n) => n.folderId == null)
    if (selectedFolderId === 0) return notes.filter((n) => n.folderId == null)
    return notes.filter((n) => n.folderId === selectedFolderId)
  }, [notes, selectedFolderId, search])

  // 树
  const tree = useMemo(() => buildFolderTree(folders, notes), [folders, notes])

  // 当前激活笔记的初始 blocks
  const [initialBlocks, setInitialBlocks] = useState<Block[] | undefined>(undefined)

  const openNote = useCallback(async (note: DbNote) => {
    setActiveNoteId(note.id)
    setLoadingNote(note)
    setInitialBlocks(undefined)
    try {
      // 拿到最新版本（避免列表 stale）
      const fresh = await getKnowledgeNote(note.id)
      if (!fresh) {
        alert('笔记不存在或已被删除')
        setActiveNoteId(null)
        return
      }
      setLoadingNote(fresh)
      // 解析 blocks
      if (fresh.contentType === 'BLOCKNOTE_JSON' && fresh.content) {
        const content = fresh.content
        if (content.trim()) {
          try {
            const parsed = JSON.parse(content)
            if (Array.isArray(parsed) && parsed.length > 0) {
              setInitialBlocks(parsed)
            } else {
              setInitialBlocks(undefined)
            }
          } catch {
            setInitialBlocks(undefined)
          }
        } else {
          setInitialBlocks(undefined)
        }
      } else if (fresh.contentMd) {
        const contentMd = fresh.contentMd
        if (contentMd.trim()) {
          setInitialBlocks(undefined)
        } else {
          setInitialBlocks(undefined)
        }
      } else {
        setInitialBlocks(undefined)
      }
    } catch (e) {
      console.error('[KnowledgeSpaceView] openNote failed:', e)
      alert(`打开笔记失败：${e instanceof Error ? e.message : String(e)}`)
      setActiveNoteId(null)
    }
  }, [space, refresh])

  const handleNewNote = useCallback(async () => {
    try {
      const created = await upsertKnowledgeNote({
        id: undefined,
        spaceId: 0,
        space,
        title: '未命名笔记',
        content: '[]',
        contentType: 'BLOCKNOTE_JSON',
        contentMd: '',
        pinned: false,
        folderId: selectedFolderId && selectedFolderId > 0 ? selectedFolderId : null,
        sourceType: 'USER',
        isAiGenerated: false,
      })
      await refresh()
      openNote(created)
    } catch (e) {
      console.error('[KnowledgeSpaceView] new note failed:', e)
      alert(`新建笔记失败：${e instanceof Error ? e.message : String(e)}`)
    }
  }, [space, projectId, selectedFolderId, refresh, openNote])

  const handleDeleteNote = useCallback(
    async (id: number) => {
      if (!window.confirm('确定删除这个笔记？')) return
      try {
        await deleteKnowledgeNote(id)
        await refresh()
        if (activeNoteId === id) setActiveNoteId(null)
      } catch (e) {
        console.error('[KnowledgeSpaceView] delete note failed:', e)
        alert(`删除失败：${e instanceof Error ? e.message : String(e)}`)
      }
    },
    [activeNoteId, refresh],
  )

  const handleNewFolder = useCallback(async (parentId?: number) => {
    const name = window.prompt('请输入新目录名称')
    if (!name || !name.trim()) return
    try {
      await upsertKnowledgeFolder({
        parentId: parentId != null ? parentId : (selectedFolderId && selectedFolderId > 0 ? selectedFolderId : null),
        space,
        name: name.trim(),
      })
      await refresh()
    } catch (e) {
      window.alert(`新建目录失败：${e instanceof Error ? e.message : String(e)}`)
    }
  }, [space, projectId, selectedFolderId, refresh])

  const handleDeleteFolder = useCallback(
    async (id: number) => {
      const ok = window.confirm('确定要删除这个目录吗？')
      if (!ok) return
      try {
        await deleteKnowledgeFolder(id)
        await refresh()
        if (selectedFolderId === id) setSelectedFolderId(0)
      } catch (e) {
        window.alert(`删除失败：${e instanceof Error ? e.message : String(e)}`)
      }
    },
    [selectedFolderId, refresh, setSelectedFolderId],
  )

  const handleImport = useCallback(async () => {
    setImporting(true)
    try {
      const created = await importMarkdownFile({
        space,
        projectId: space === 'project' ? projectId ?? null : null,
      })
      if (created) {
        await refresh()
        openNote(created)
      }
    } catch (e) {
      console.error('[KnowledgeSpaceView] import failed:', e)
      alert(`导入失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setImporting(false)
    }
  }, [space, projectId, refresh, openNote])

  const handleExported = useCallback((path: string) => {
    alert(`已导出到：${path}`)
  }, [])

  const handleRenameFolder = useCallback(
    async (id: number, newName: string) => {
      if (!newName || !newName.trim()) return
      try {
        const target = folders.find((f) => f.id === id)
        if (!target) return
        await upsertKnowledgeFolder({
          id,
          parentId: target.parentId,
          space,
          projectId: space === 'project' ? projectId ?? null : null,
          name: newName.trim(),
        })
        await refresh()
      } catch (e) {
        console.error('[KnowledgeSpaceView] rename folder failed:', e)
        alert(`重命名失败：${e instanceof Error ? e.message : String(e)}`)
      }
    },
    [space, projectId, folders, refresh],
  )

  // 笔记保存后回填刷新列表
  const handleNoteSaved = useCallback(
    async (_note: DbNote) => {
      await refresh()
    },
    [refresh],
  )

  // 当前激活笔记的初始内容（从 loadingNote 派生）
  const activeNote = loadingNote && loadingNote.id === activeNoteId ? loadingNote : null

  return (
    <div style={rootStyle}>
      {/* ========== 左侧：目录树 ========== */}
      <aside style={treePanelStyle}>
        <div style={headerStyle}>
          <h3 style={titleStyle}>目录</h3>
          <button
            type="button"
            style={iconBtnStyle}
            onClick={() => handleNewFolder()}
            title="新建目录"
          >
            <Plus size={14} strokeWidth={2} />
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 6px 16px' }}>
          {tree.map((node) => (
            <FolderTreeRow
              key={node.id || 'root'}
              node={node}
              depth={0}
              activeId={selectedFolderId}
              onSelect={setSelectedFolderId}
              onDeleteFolder={handleDeleteFolder}
              onCreateChild={handleNewFolder}
              onRenameFolder={handleRenameFolder}
            />
          ))}
        </div>
      </aside>

      {/* ========== 中间：笔记列表 ========== */}
      <aside style={listPanelStyle}>
        <div style={headerStyle}>
          <h3 style={titleStyle}>
            {search.trim()
              ? `搜索：${search}`
              : selectedFolderId == null || selectedFolderId === 0
                ? '未分类'
                : folders.find((f) => f.id === selectedFolderId)?.name ?? '目录'}
          </h3>
          <button
            type="button"
            onClick={handleImport}
            disabled={importing}
            title="导入本地 .md"
            style={{ ...btnGhostStyle, padding: '4px 8px' }}
          >
            <FileUp size={12} />
          </button>
          <button
            type="button"
            onClick={handleNewNote}
            title="新建笔记"
            style={{ ...btnPrimaryStyle, padding: '4px 8px' }}
          >
            <Plus size={12} strokeWidth={2} />
          </button>
        </div>
        <div style={searchWrapStyle}>
          <Search size={12} strokeWidth={1.75} color="var(--color-text-tertiary)" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索标题 / 正文…"
            style={searchInputStyle}
          />
          {search && (
            <button
              type="button"
              style={{ ...iconBtnStyle, width: 16, height: 16 }}
              onClick={() => setSearch('')}
              title="清空"
            >
              <X size={10} />
            </button>
          )}
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={emptyStyle}>加载中…</div>
          ) : listNotes.length === 0 ? (
            <div style={emptyStyle}>
              {search.trim() ? '没有匹配的笔记' : '空目录 · 点 + 新建笔记'}
            </div>
          ) : (
            listNotes.map((n) => (
              <NoteListRow
                key={n.id}
                note={n}
                active={activeNoteId === n.id}
                onClick={() => openNote(n)}
                onDelete={() => handleDeleteNote(n.id)}
              />
            ))
          )}
        </div>
      </aside>

      {/* ========== 右侧：编辑器 ========== */}
      <main style={editorPanelStyle}>
        {activeNote ? (
          <DocumentEditor
            key={`${activeNote.id}-${initialBlocks?.length || 0}`}
            source={{ kind: 'knowledge', noteId: activeNote.id }}
            initialTitle={activeNote.title}
            initialUpdatedAt={activeNote.updatedAt}
            initialNote={activeNote}
            initialBlocks={initialBlocks}
            onExported={handleExported}
            onDeleted={() => {
              setActiveNoteId(null)
              void refresh()
            }}
            onSaveReady={(fn: () => Promise<boolean>) => {
              // DocumentEditor 内部通过 ref 暴露 save 方法
            }}
            onStatusChange={(status: SaveStatus, lastSavedAt: string | null) => {
              // 状态由 DocumentEditor 内部维护
            }}
          />
        ) : (
          <div style={editorEmptyStyle}>
            <BookOpen size={36} strokeWidth={1.25} opacity={0.5} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
                {title ?? (space === 'personal' ? '个人知识中心' : '项目知识中心')}
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                {subtitle ?? '选个笔记开始编辑，或点 + 新建'}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

// ============================================================
// FolderTreeRow（递归）
// ============================================================

interface FolderTreeRowProps {
  node: FolderNode
  depth: number
  activeId: number | null
  onSelect: (id: number) => void
  onDeleteFolder: (id: number) => void
  onCreateChild?: (id: number) => void
  onRenameFolder?: (id: number, name: string) => void
}

function FolderTreeRow({
  node,
  depth,
  activeId,
  onSelect,
  onDeleteFolder,
  onCreateChild,
  onRenameFolder,
}: FolderTreeRowProps) {
  const [expanded, setExpanded] = useState(true)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(node.name)
  const hasChildren = node.children.length > 0
  const isActive = activeId === node.id

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {renaming ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: `5px 10px 5px ${8 + depth * 14}px`,
              fontSize: 12.5,
              background: 'var(--color-bg-subtle)',
              borderRadius: 'var(--radius)',
              flex: 1,
              minWidth: 0,
            }}
          >
            <input
              autoFocus
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  const trimmed = renameValue.trim()
                  if (trimmed && trimmed !== node.name && onRenameFolder) {
                    onRenameFolder(node.id, trimmed)
                  }
                  setRenaming(false)
                }
                if (e.key === 'Escape') {
                  e.preventDefault()
                  setRenameValue(node.name)
                  setRenaming(false)
                }
              }}
              onBlur={() => {
                const trimmed = renameValue.trim()
                if (trimmed && trimmed !== node.name && onRenameFolder) {
                  onRenameFolder(node.id, trimmed)
                }
                setRenaming(false)
              }}
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                background: 'transparent',
                fontSize: 12.5,
                color: 'var(--color-text)',
                minWidth: 0,
                padding: 0,
              }}
            />
            {node.id > 0 && (
              <>
                <button
                  type="button"
                  style={iconBtnStyle}
                  onClick={() => {
                    setRenameValue(node.name)
                    setRenaming(false)
                  }}
                  title="取消"
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg-subtle)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <X size={11} />
                </button>
                <button
                  type="button"
                  style={iconBtnStyle}
                  onClick={() => {
                    const trimmed = renameValue.trim()
                    if (trimmed && trimmed !== node.name && onRenameFolder) {
                      onRenameFolder(node.id, trimmed)
                    }
                    setRenaming(false)
                  }}
                  title="确定"
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg-subtle)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <ChevronRight size={11} />
                </button>
              </>
            )}
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              width: '100%',
              padding: `5px 10px 5px ${8 + depth * 14}px`,
              fontSize: 12.5,
              fontWeight: isActive ? 500 : 400,
              color: isActive ? 'var(--color-text)' : 'var(--color-text-secondary)',
              background: isActive ? 'var(--color-bg-active)' : 'transparent',
              cursor: 'pointer',
              position: 'relative',
            }}
            onClick={() => onSelect(node.id)}
          >
            {/* 展开/收起箭头 */}
            {hasChildren ? (
              <span
                onClick={(e) => {
                  e.stopPropagation()
                  setExpanded((v) => !v)
                }}
                style={{ display: 'inline-flex', marginRight: 4, width: 16 }}
              >
                {expanded ? (
                  <ChevronDown size={11} strokeWidth={2} color="var(--color-text-tertiary)" />
                ) : (
                  <ChevronRight size={11} strokeWidth={2} color="var(--color-text-tertiary)" />
                )}
              </span>
            ) : (
              <span style={{ width: 16, display: 'inline-block', marginRight: 4 }} />
            )}

            {/* 文件夹图标 */}
            <span style={{ display: 'inline-flex', marginRight: 4 }}>
              {isActive ? (
                <FolderOpen size={12} strokeWidth={1.75} color="var(--color-accent)" />
              ) : (
                <Folder size={12} strokeWidth={1.5} color="var(--color-text-tertiary)" />
              )}
            </span>

            {/* 目录名称 */}
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {node.name}
            </span>

            {/* 笔记数量 */}
            {node.notes.length > 0 && (
              <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginLeft: 4 }}>
                {node.notes.length}
              </span>
            )}

            {/* 右侧操作按钮 - 始终显示 */}
            {node.id > 0 && (
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 4 }}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  style={iconBtnStyle}
                  onClick={(e) => {
                    e.stopPropagation()
                    onDeleteFolder(node.id)
                  }}
                  title="删除目录"
                >
                  <Trash2 size={10} />
                </button>
                {onCreateChild && (
                  <button
                    type="button"
                    style={iconBtnStyle}
                    onClick={(e) => {
                      e.stopPropagation()
                      onCreateChild(node.id)
                    }}
                    title="新建子目录"
                  >
                    <CirclePlus size={10} />
                  </button>
                )}
                {onRenameFolder && (
                  <button
                    type="button"
                    style={iconBtnStyle}
                    onClick={(e) => {
                      e.stopPropagation()
                      setRenameValue(node.name)
                      setRenaming(true)
                    }}
                    title="重命名"
                  >
                    <Pencil size={10} />
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      {hasChildren && expanded && (
        <div>
          {node.children.map((c) => (
            <FolderTreeRow
              key={c.id}
              node={c}
              depth={depth + 1}
              activeId={activeId}
              onSelect={onSelect}
              onDeleteFolder={onDeleteFolder}
              onCreateChild={onCreateChild}
              onRenameFolder={onRenameFolder}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================
// NoteListRow
// ============================================================

function NoteListRow({
  note,
  active,
  onClick,
  onDelete,
}: {
  note: DbNote
  active: boolean
  onClick: () => void
  onDelete: () => void
}) {
  return (
    <div style={noteRowStyle(active)} onClick={onClick}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 4,
        }}
      >
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
        <button
          type="button"
          style={iconBtnStyle}
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          title="删除"
        >
          <Trash2 size={10} />
        </button>
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
      <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
        {formatRelative(note.updatedAt)}
      </div>
    </div>
  )
}

// 触发 handleNoteSaved 调用（暂时保留 hook 给未来用）
void handleNoteSavedShim
function handleNoteSavedShim() {}

export default KnowledgeSpaceView
