/**
 * PMTool · 个人知识中心（维护者 2026-09-02 重构）
 *
 * 独立于项目知识中心，完全独立的个人知识体系：
 *   个人知识中心
 *   ├─ 目录 1
 *   │  ├─ 子目录
 *   │  └─ 笔记
 *   ├─ 目录 2
 *   │  └─ 笔记
 *   ├─ 笔记（根级，不属于任何目录）
 *   └─ AI 生成
 *      ├─ 笔记
 *      └─ 笔记
 *
 * 功能：
 *   - 新建目录/子目录
 *   - 新建笔记
 *   - 编辑/重命名/删除
 *   - 展开/折叠
 *   - 搜索
 *   - 保存
 *   - Markdown 导入/导出
 */

import { useEffect, useState, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import {
  Plus,
  Search,
  FileUp,
  Folder,
  FolderOpen,
  Trash2,
  Pencil,
  X,
  Check,
  ChevronRight,
  ChevronDown,
  FolderPlus,
  Sparkles,
  BookOpen,
} from 'lucide-react'
import {
  listPersonalKnowledgeSpaces,
  listKnowledgeNotesBySpaceType,
  upsertKnowledgeNote,
  deleteKnowledgeNote,
  searchKnowledgeNotesBySpaceType,
  getKnowledgeNote,
  listKnowledgeFolders,
  upsertKnowledgeFolder,
  deleteKnowledgeFolder,
  ensureAiKnowledgeFolder,
  type KnowledgeNote as DbNote,
  type KnowledgeFolder as DbFolder,
  type KnowledgeSpace,
} from '@/services/knowledge'
import { DeleteConfirmDialog } from './DeleteConfirmDialog'
import { DocumentEditor } from '@/components/DocumentEditor'
import type { Block } from '@blocknote/core'
import { importMarkdownFile } from './importMarkdown'

interface FolderNode extends DbFolder {
  children: FolderNode[]
  notes: DbNote[]
  expanded: boolean
  systemType: string
  isSystem?: boolean
}

const SYSTEM_AI_KNOWLEDGE_ID = -1

// ============================================================
// 样式
// ============================================================

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
  padding: '4px 8px',
  background: 'var(--color-accent)',
  color: 'var(--color-text-on-accent)',
  borderRadius: 'var(--radius)',
  fontSize: 12,
  fontWeight: 500,
  border: 'none',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

const iconBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 20,
  height: 20,
  background: 'transparent',
  border: 'none',
  borderRadius: 3,
  cursor: 'pointer',
  color: 'var(--color-text-tertiary)',
  flexShrink: 0,
  padding: 0,
}

const folderRowStyle = (active: boolean, depth: number): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: `4px 8px 4px ${6 + depth * 14}px`,
  fontSize: 12.5,
  fontWeight: active ? 500 : 400,
  color: active ? 'var(--color-text)' : 'var(--color-text-secondary)',
  background: active ? 'var(--color-bg-active)' : 'transparent',
  border: 'none',
  cursor: 'pointer',
  textAlign: 'left',
  width: '100%',
  borderRadius: 'var(--radius)',
})

// ============================================================
// 树组装
// ============================================================

function buildFolderTree(folders: DbFolder[], notes: DbNote[]): FolderNode[] {
  const map = new Map<number, FolderNode>()

  // 创建所有文件夹节点
  for (const f of folders) {
    map.set(f.id, { ...f, children: [], notes: [], expanded: true })
  }

  // 将笔记归类到对应文件夹
  for (const n of notes) {
    if (n.isAiGenerated) continue // AI 笔记单独处理
    if (n.folderId != null && map.has(n.folderId)) {
      map.get(n.folderId)!.notes.push(n)
    }
  }

  // 组装树
  const roots: FolderNode[] = []
  for (const node of map.values()) {
    if (node.parentId == null) {
      roots.push(node)
    } else {
      const parent = map.get(node.parentId)
      if (parent) {
        parent.children.push(node)
      } else {
        roots.push(node) // 孤儿节点提升到根
      }
    }
  }

  // 添加未分类（folderId=null 的笔记）
  const rootNotes = notes.filter((n) => n.folderId == null && !n.isAiGenerated)
  roots.push({
    id: 0,
    parentId: null,
    space: 'personal',
    projectId: null,
    name: '未分类',
    sortOrder: 0,
    systemType: 'USER',
    createdAt: '',
    updatedAt: '',
    children: [],
    notes: rootNotes,
    expanded: true,
    isSystem: false,
  })

  // 添加 AI 知识虚拟目录
  const aiNotes = notes.filter((n) => n.isAiGenerated)
  roots.push({
    id: SYSTEM_AI_KNOWLEDGE_ID,
    parentId: null,
    space: 'personal',
    projectId: null,
    name: 'AI 生成',
    sortOrder: 0,
    systemType: 'SYSTEM_AI',
    createdAt: '',
    updatedAt: '',
    children: [],
    notes: aiNotes,
    expanded: true,
    isSystem: true,
  })

  return roots
}

// ============================================================
// 目录树行组件
// ============================================================

function FolderTreeRow({
  node,
  depth,
  activeId,
  onSelect,
  onDeleteFolder,
  onCreateChild,
  onRenameFolder,
}: {
  node: FolderNode
  depth: number
  activeId: number | null
  onSelect: (id: number) => void
  onDeleteFolder: (id: number) => void
  onCreateChild: (id: number) => void
  onRenameFolder: (id: number, name: string) => void
}) {
  const [expanded, setExpanded] = useState(node.expanded)
  const [confirming, setConfirming] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(node.name)
  const hasChildren = node.children.length > 0
  const isActive = activeId === node.id
  const isSystem = node.isSystem === true

  const submitRename = () => {
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== node.name) {
      onRenameFolder(node.id, trimmed)
    }
    setRenaming(false)
  }

  return (
    <div>
      {renaming && !isSystem ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: `4px 8px 4px ${6 + depth * 14}px`,
            fontSize: 12.5,
            background: 'var(--color-bg-active)',
            borderRadius: 'var(--radius)',
            flex: 1,
            minWidth: 0,
          }}
        >
          <Folder size={11} strokeWidth={1.5} color="var(--color-accent)" style={{ flexShrink: 0 }} />
          <input
            autoFocus
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                submitRename()
              }
              if (e.key === 'Escape') {
                e.preventDefault()
                setRenameValue(node.name)
                setRenaming(false)
              }
            }}
            onBlur={submitRename}
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
          <button type="button" style={iconBtnStyle} onClick={submitRename} title="确认 (Enter)">
            <Check size={10} />
          </button>
          <button type="button" style={iconBtnStyle} onClick={() => { setRenameValue(node.name); setRenaming(false) }} title="取消 (Esc)">
            <X size={10} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          style={folderRowStyle(isActive, depth)}
          onClick={() => onSelect(node.id)}
          onDoubleClick={() => {
            if (!isSystem) {
              setRenameValue(node.name)
              setRenaming(true)
            }
          }}
          title={isSystem ? `${node.name}（系统目录·不允许删除）` : node.name}
        >
          {hasChildren ? (
            <span
              onClick={(e) => {
                e.stopPropagation()
                setExpanded((v) => !v)
              }}
              style={{ display: 'inline-flex' }}
            >
              {expanded ? (
                <ChevronDown size={10} strokeWidth={2} color="var(--color-text-tertiary)" />
              ) : (
                <ChevronRight size={10} strokeWidth={2} color="var(--color-text-tertiary)" />
              )}
            </span>
          ) : (
            <span style={{ width: 10, display: 'inline-block' }} />
          )}

          {isSystem ? (
            <Sparkles size={11} strokeWidth={1.75} color={isActive ? 'var(--color-accent)' : '#9333ea'} />
          ) : isActive ? (
            <FolderOpen size={11} strokeWidth={1.75} color="var(--color-accent)" />
          ) : (
            <Folder size={11} strokeWidth={1.5} color="var(--color-text-tertiary)" />
          )}

          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {node.name}
          </span>

          {node.notes.length > 0 && (
            <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>
              {node.notes.length}
            </span>
          )}
        </button>
      )}

      {!isSystem && node.id > 0 && !renaming && (
        <>
          {confirming ? (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setConfirming(false)
                }}
                style={{
                  ...iconBtnStyle,
                  fontSize: 9,
                  color: 'var(--color-text-tertiary)',
                  padding: 0,
                }}
                title="取消"
              >
                取消
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onDeleteFolder(node.id)
                }}
                style={{
                  ...iconBtnStyle,
                  fontSize: 9,
                  color: '#fff',
                  background: '#dc2626',
                  padding: '0 4px',
                  fontWeight: 500,
                }}
                title="确认删除"
              >
                确认
              </button>
            </>
          ) : (
            <>
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
              <button
                type="button"
                style={iconBtnStyle}
                onClick={(e) => {
                  e.stopPropagation()
                  onCreateChild(node.id)
                }}
                title="新建子目录"
              >
                <FolderPlus size={10} />
              </button>
              <button
                type="button"
                style={iconBtnStyle}
                onClick={(e) => {
                  e.stopPropagation()
                  setConfirming(true)
                }}
                title="删除"
              >
                <Trash2 size={10} />
              </button>
            </>
          )}
        </>
      )}

      {expanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <FolderTreeRow
              key={child.id}
              node={child}
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
// 主组件
// ============================================================

export function PersonalKnowledgeCenter() {
  const [notes, setNotes] = useState<DbNote[]>([])
  const [folders, setFolders] = useState<DbFolder[]>([])
  const [search, setSearch] = useState('')
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(0)
  const [activeNoteId, setActiveNoteId] = useState<number | null>(null)
  const [loadingNote, setLoadingNote] = useState<DbNote | null>(null)
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)

  // 二次确认对话框状态
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    type: 'note' | 'folder'
    id: number
  }>({ open: false, type: 'note', id: 0 })

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      // 确保 AI 生成目录存在
      const aiFolder = await ensureAiKnowledgeFolder('personal', null)

      const q = search.trim()
      const noteData = q
        ? await searchKnowledgeNotesBySpaceType('personal', q)
        : await listKnowledgeNotesBySpaceType('personal')
      const folderData = await listKnowledgeFolders('personal')

      // 将 AI 目录合并到文件夹列表
      const allFolders = [...folderData, aiFolder]

      const filtNotes = noteData
      const filtFolders = allFolders

      setNotes(filtNotes)
      setFolders(filtFolders)
    } catch (e) {
      console.error('[PersonalKnowledgeCenter] refresh failed:', e)
      setNotes([])
      setFolders([])
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const listNotes = useMemo(() => {
    if (search.trim()) return notes
    if (selectedFolderId == null || selectedFolderId === 0) return notes.filter((n) => n.folderId == null)
    if (selectedFolderId === SYSTEM_AI_KNOWLEDGE_ID) return notes.filter((n) => n.isAiGenerated)
    return notes.filter((n) => n.folderId === selectedFolderId && !n.isAiGenerated)
  }, [notes, selectedFolderId, search])

  const tree = useMemo(() => buildFolderTree(folders, notes), [folders, notes])

  const [initialBlocks, setInitialBlocks] = useState<Block[] | undefined>(undefined)

  const openNote = useCallback(async (note: DbNote) => {
    setActiveNoteId(note.id)
    setLoadingNote(note)
    setInitialBlocks(undefined)
    try {
      const fresh = await getKnowledgeNote(note.id)
      if (!fresh) {
        alert('笔记不存在或已被删除')
        setActiveNoteId(null)
        return
      }
      setLoadingNote(fresh)
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
      console.error('[PersonalKnowledgeCenter] openNote failed:', e)
      alert(`打开笔记失败：${e instanceof Error ? e.message : String(e)}`)
      setActiveNoteId(null)
    }
  }, [])

  const handleNewNote = useCallback(async () => {
    try {
      // 获取个人知识空间 ID（假设只有一个个人空间）
      const spaces = await listPersonalKnowledgeSpaces()
      const personalSpace = spaces[0]
      if (!personalSpace) {
        throw new Error('未找到个人知识空间')
      }

      const created = await upsertKnowledgeNote({
        spaceId: personalSpace.id,
        space: 'personal',
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
      console.error('[PersonalKnowledgeCenter] new note failed:', e)
      alert(`新建笔记失败：${e instanceof Error ? e.message : String(e)}`)
    }
  }, [selectedFolderId, refresh, openNote])

  const handleDeleteNote = useCallback(
    async (id: number) => {
      // 打开二次确认对话框
      setConfirmDialog({ open: true, type: 'note', id })
    },
    [],
  )

  const handleDeleteNoteConfirm = useCallback(async () => {
    const { id } = confirmDialog
    try {
      await deleteKnowledgeNote(id)
      await refresh()
      if (activeNoteId === id) setActiveNoteId(null)
      toast.success('笔记已删除')
    } catch (e) {
      console.error('[PersonalKnowledgeCenter] delete note failed:', e)
      toast.error(`删除失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setConfirmDialog({ open: false, type: 'note', id: 0 })
    }
  }, [confirmDialog, activeNoteId, refresh])

  const handleDeleteNoteCancel = useCallback(() => {
    setConfirmDialog({ open: false, type: 'note', id: 0 })
  }, [])

  const handleNewFolder = useCallback(async (parentId?: number) => {
    const name = window.prompt('请输入新目录名称')
    if (!name || !name.trim()) return
    try {
      // 获取个人知识空间 ID
      const spaces = await listPersonalKnowledgeSpaces()
      const personalSpace = spaces[0]
      if (!personalSpace) {
        throw new Error('未找到个人知识空间')
      }

      await upsertKnowledgeFolder({
        spaceId: personalSpace.id,
        space: 'personal',
        parentId: parentId != null ? parentId : (selectedFolderId && selectedFolderId > 0 ? selectedFolderId : null),
        name: name.trim(),
        systemType: 'USER',
      })
      await refresh()
    } catch (e) {
      window.alert(`新建目录失败：${e instanceof Error ? e.message : String(e)}`)
    }
  }, [selectedFolderId, refresh])

  const handleDeleteFolder = useCallback(
    async (id: number) => {
      // 打开二次确认对话框
      setConfirmDialog({ open: true, type: 'folder', id })
    },
    [],
  )

  const handleDeleteFolderConfirm = useCallback(async () => {
    const { id } = confirmDialog
    try {
      await deleteKnowledgeFolder(id)
      await refresh()
      if (selectedFolderId === id) setSelectedFolderId(0)
      toast.success('目录已删除')
    } catch (e) {
      console.error('[PersonalKnowledgeCenter] delete folder failed:', e)
      toast.error(`删除失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setConfirmDialog({ open: false, type: 'folder', id: 0 })
    }
  }, [confirmDialog, selectedFolderId, refresh])

  const handleDeleteFolderCancel = useCallback(() => {
    setConfirmDialog({ open: false, type: 'folder', id: 0 })
  }, [])

  const handleImport = useCallback(async () => {
    setImporting(true)
    try {
      const created = await importMarkdownFile({
        space: 'personal',
        projectId: null,
      })
      if (created) {
        await refresh()
        openNote(created)
      }
    } catch (e) {
      console.error('[PersonalKnowledgeCenter] import failed:', e)
      alert(`导入失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setImporting(false)
    }
  }, [refresh, openNote])

  const handleRenameFolder = useCallback(
    async (id: number, newName: string) => {
      if (!newName || !newName.trim()) return
      try {
        const target = folders.find((f) => f.id === id)
        if (!target) return
        await upsertKnowledgeFolder({
          id,
          parentId: target.parentId,
          space: 'personal',
          projectId: null,
          name: newName.trim(),
        })
        await refresh()
      } catch (e) {
        console.error('[PersonalKnowledgeCenter] rename folder failed:', e)
        alert(`重命名失败：${e instanceof Error ? e.message : String(e)}`)
      }
    },
    [folders, refresh],
  )

  const handleNoteSaved = useCallback(
    async (_note: DbNote) => {
      await refresh()
    },
    [refresh],
  )

  const activeNote = loadingNote && loadingNote.id === activeNoteId ? loadingNote : null

  if (loading && folders.length === 0) {
    return <div style={{ padding: 32, color: 'var(--color-text-tertiary)' }}>加载中...</div>
  }

  return (
    <div style={rootStyle}>
      {/* 左侧：目录树 */}
      <aside style={treePanelStyle}>
        <div style={headerStyle}>
          <h3 style={titleStyle}>目录</h3>
          <button
            type="button"
            style={iconBtnStyle}
            onClick={() => handleNewFolder()}
            title="新建目录"
          >
            <Plus size={12} strokeWidth={2} />
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

      {/* 二次确认对话框 */}
      <DeleteConfirmDialog
        open={confirmDialog.open}
        onConfirm={() => {
          if (confirmDialog.type === 'note') {
            handleDeleteNoteConfirm()
          } else {
            handleDeleteFolderConfirm()
          }
        }}
        onCancel={() => {
          if (confirmDialog.type === 'note') {
            handleDeleteNoteCancel()
          } else {
            handleDeleteFolderCancel()
          }
        }}
        title={
          confirmDialog.type === 'note' ? '确认删除笔记' : '确认删除目录'
        }
        description={
          confirmDialog.type === 'note'
            ? '删除后笔记内容（包括 BlockNote 编辑内容）将被永久删除，无法恢复。'
            : '删除后目录、所有子目录、以及目录内的所有笔记都将被永久删除，无法恢复。'
        }
        confirmText="确认删除"
        cancelText="取消"
      />

      {/* 中间：笔记列表 */}
      <aside style={listPanelStyle}>
        <div style={headerStyle}>
          <h3 style={titleStyle}>
            {search.trim()
              ? `搜索：${search}`
              : selectedFolderId == null || selectedFolderId === 0
                ? '未分类'
                : selectedFolderId === SYSTEM_AI_KNOWLEDGE_ID
                  ? 'AI 生成'
                  : folders.find((f) => f.id === selectedFolderId)?.name ?? '目录'}
          </h3>
          <button
            type="button"
            onClick={handleImport}
            disabled={importing}
            title="导入本地 .md"
            style={{ ...iconBtnStyle, padding: 0 }}
          >
            <FileUp size={12} />
          </button>
          <button
            type="button"
            onClick={handleNewNote}
            title="新建笔记"
            style={btnPrimaryStyle}
          >
            <Plus size={10} strokeWidth={2} />
            新建
          </button>
        </div>
        <div style={searchWrapStyle}>
          <Search size={11} strokeWidth={1.75} color="var(--color-text-tertiary)" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索标题 / 正文…"
            style={searchInputStyle}
          />
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: 16, color: 'var(--color-text-tertiary)', fontSize: 12 }}>加载中...</div>
          ) : listNotes.length === 0 ? (
            <div style={{ padding: 16, color: 'var(--color-text-tertiary)', fontSize: 12, textAlign: 'center' }}>
              暂无笔记
            </div>
          ) : (
            listNotes.map((note) => (
              <div
                key={note.id}
                style={noteRowStyle(activeNoteId === note.id)}
                onClick={() => openNote(note)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {note.pinned && (
                    <span style={{ fontSize: 9, color: 'var(--color-accent)' }}>P</span>
                  )}
                  <span style={{
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontSize: 12.5,
                    color: activeNoteId === note.id ? 'var(--color-text)' : 'var(--color-text-secondary)',
                  }}>
                    {note.title}
                  </span>
                  {note.sourceType === 'AI' && (
                    <Sparkles size={9} color="#9333ea" />
                  )}
                </div>
                <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 3 }}>
                  {note.updatedAt ? `更新于 ${note.updatedAt.slice(5, 16).replace('T', ' ')}` : ''}
                </div>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* 右侧：编辑器 */}
      <div style={editorPanelStyle}>
        {activeNote ? (
          <DocumentEditor
            initialTitle={activeNote.title}
            initialBlocks={initialBlocks}
            source={{ kind: 'knowledge' as const, noteId: activeNote.id }}
          />
        ) : (
          <div style={{ ...emptyEditorStyle, flex: 1 }}>
            <BookOpen size={32} color="var(--color-text-tertiary)" />
            <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>
              选择或新建笔记开始编辑
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function noteRowStyle(active: boolean): React.CSSProperties {
  return {
    padding: '10px 14px',
    borderBottom: '1px solid var(--color-border-thin)',
    background: active ? 'var(--color-bg-subtle)' : 'transparent',
    cursor: 'pointer',
  }
}

const emptyEditorStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  color: 'var(--color-text-tertiary)',
  fontSize: 13,
  gap: 12,
}
