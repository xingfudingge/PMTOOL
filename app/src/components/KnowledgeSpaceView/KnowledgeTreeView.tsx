/**
 * PMTool · 统一知识树视图（2026-09-04 重构 · 设计文档 §31）
 *
 * 两栏布局（替代原三栏"树 + 中间列表 + 编辑区"）：
 *   ┌────────────────┬──────────────────────────────┐
 *   │ 左侧单棵树      │ 右侧 BlockNote 编辑区          │
 *   │ ├ 目录（USER） │                              │
 *   │ │  ├ 目录       │  标题                          │
 *   │ │  ├ 📄 知识    │  BlockNote                    │
 *   │ │  └ 📄 知识    │                              │
 *   │ ├ 项目根(PROJECT_ROOT, 仅项目模式)               │
 *   └────────────────┴──────────────────────────────┘
 *
 * 节点操作（悬停 ⋯ 菜单）按 nodeKind 控制：
 *   - root         个人「目录」虚拟根：仅 添加子目录
 *   - project-root 项目根：删除 + 添加子目录（不可直接建知识）
 *   - folder       普通目录：删除 / 重命名 / 添加子目录 / 新建知识
 *   - note         知识节点：删除 / 重命名
 *
 * 删除一律走 DeleteConfirmDialog（设计文档 §2）。
 * 真删除在后端已级联（数据库 + BlockNote 内容 + 附件记录 + 本地文件）。
 *
 * 拖拽移动（2026-09-16 · 文件管理器式）：
 *   - 知识节点可拖起（HTML5 DnD · WebView 需 tauri.conf dragDropEnabled:false）
 *   - 放置目标：目录行 / 真实根目录行 / 聚合模式知识库行（= 该库顶层）/ 树空白区「松开：移动到顶层」（非聚合）
 *   - 跨知识库不开放移动（space_id 涉及附件/绑定语义）；后端 move_knowledge_note 二次校验同库
 *   - 移动只改 folder_id，不动 updated_at（避免打乱列表排序、避免编辑器 remount）
 */

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileText,
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  FolderPlus,
  Library,
  BookOpen,
} from 'lucide-react'
import { toast } from 'sonner'
import type { Block } from '@blocknote/core'

import { DocumentEditor } from '@/components/DocumentEditor'
import { useEditingMaximized } from '@/components/DocumentEditor/editingMaximized'
import type { SaveStatus } from '@/components/DocumentEditor/types'
import { DeleteConfirmDialog } from './DeleteConfirmDialog'
import { resolveInitialBlocks } from '@/components/DocumentEditor/useBlockNoteSetup'
import {
  buildUnifiedTree,
  buildLibrariesTree,
  type UnifiedNode,
} from './tree'
import {
  listKnowledgeNotes,
  listKnowledgeFolders,
  listKnowledgeFoldersByProject,
  listKnowledgeFoldersBySpaceId,
  listPersonalKnowledgeSpaces,
  upsertKnowledgeFolder,
  upsertKnowledgeNote,
  deleteKnowledgeFolder,
  deleteKnowledgeNote,
  moveKnowledgeNote,
  getKnowledgeNote,
  type KnowledgeNote as DbNote,
  type KnowledgeFolder as DbFolder,
} from '@/services/knowledge'
import {
  listProjectKnowledgeSpaces,
  listAllProjectSpaces,
  listSpaceBindings,
  deleteKnowledgeSpace,
  createKnowledgeSpace,
} from '@/services/knowledgeSpaces'
import { listProjects } from '@/services/project'

export interface KnowledgeTreeViewProps {
  mode: 'personal' | 'project'
  /** 项目聚合模式：项目知识中心直接展示「所有项目」聚合树（M:N） */
  aggregate?: boolean
  /** project 模式必填 */
  projectId?: number
  projectName?: string
  /** 一库多项目：直接指定知识空间（优先于 projectId 解析，目录/笔记/创建均按空间归属） */
  spaceId?: number
  /** 右侧初始空状态文案 */
  emptyHint?: string
}

// ============================================================
// 样式
// ============================================================

const rootStyle: React.CSSProperties = {
  display: 'flex',
  height: '100%',
  background: 'var(--color-bg)',
}

const treePanelStyle: React.CSSProperties = {
  width: 280,
  flexShrink: 0,
  borderRight: '1px solid var(--color-border-thin)',
  background: 'var(--color-bg-subtle)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  // 「松开：移动到顶层」落点用绝对定位常驻在面板底部（见下）——
  // 拖拽期间不得改动 DOM 结构，否则 Chromium 会取消拖拽，详见该元素的注释
  position: 'relative',
}

const editorPanelStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
  background: 'var(--color-bg)',
}

const headerStyle: React.CSSProperties = {
  padding: '12px 14px',
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

const iconBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 22,
  height: 22,
  background: 'transparent',
  border: 'none',
  borderRadius: 3,
  cursor: 'pointer',
  color: 'var(--color-text-tertiary)',
  flexShrink: 0,
  padding: 0,
}

const rowContainerStyle: React.CSSProperties = {
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
}

const rowStyle = (active: boolean, depth: number): React.CSSProperties => ({
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
  flex: 1,
  minWidth: 0,
  borderRadius: 'var(--radius)',
})

const emptyEditorStyle: React.CSSProperties = {
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

// ============================================================
// 主组件
// ============================================================

export function KnowledgeTreeView({
  mode,
  aggregate,
  projectId,
  projectName,
  spaceId,
  emptyHint,
}: KnowledgeTreeViewProps) {
  const [notes, setNotes] = useState<DbNote[]>([])
  const [folders, setFolders] = useState<DbFolder[]>([])
  const [loading, setLoading] = useState(true)
  const editingMaximized = useEditingMaximized()
  const [activeNoteId, setActiveNoteId] = useState<number | null>(null)
  const [activeNote, setActiveNote] = useState<DbNote | null>(null)
  const [initialBlocks, setInitialBlocks] = useState<Block[] | undefined>(undefined)

  // 二次确认弹窗
  const [confirm, setConfirm] = useState<{
    open: boolean
    type: 'note' | 'folder' | 'library'
    id: number
    name: string
  }>({ open: false, type: 'note', id: 0, name: '' })

  // 命名弹窗（Tauri WebView 不支持 window.prompt，用内嵌弹窗替代）
  const [namePrompt, setNamePrompt] = useState<{
    open: boolean
    title: string
    initialValue: string
    resolve: (v: string | null) => void
  } | null>(null)

  const [aggSpaces, setAggSpaces] = useState<{ id: number; name: string; boundText: string }[]>([])
  const [aggFolders, setAggFolders] = useState<Map<number, DbFolder[]>>(new Map())
  const [aggNotes, setAggNotes] = useState<Map<number, DbNote[]>>(new Map())

  const askName = useCallback((title: string, initialValue: string) => {
    return new Promise<string | null>((resolve) => {
      setNamePrompt({ open: true, title, initialValue, resolve })
    })
  }, [])

  // ───────── 数据加载 ─────────
  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      if (mode === 'project' && aggregate) {
        // 项目知识中心：以「知识库」为顶层，每个库独立挂目录；库间互不干扰。
        const projects = await listProjects()
        const pMap = new Map(projects.map((p) => [p.id, p.project_name]))
        const spaces = await listAllProjectSpaces()
        const fm = new Map<number, DbFolder[]>()
        const nm = new Map<number, DbNote[]>()
        const meta: { id: number; name: string; boundText: string }[] = []
        for (const s of spaces) {
          fm.set(s.id, await listKnowledgeFoldersBySpaceId(s.id))
          nm.set(s.id, await listKnowledgeNotes(s.id))
          const binds = await listSpaceBindings(s.id)
          const boundText = binds.map((b) => pMap.get(b.projectId)).filter(Boolean).join('、')
          meta.push({ id: s.id, name: s.name, boundText })
        }
        setAggSpaces(meta)
        setAggFolders(fm)
        setAggNotes(nm)
      } else {
        let resolvedFolders: DbFolder[] = []
        let resolvedNotes: DbNote[] = []
        if (mode === 'personal') {
          const spaces = await listPersonalKnowledgeSpaces()
          const spaceId = spaces[0]?.id
          if (spaceId != null) {
            resolvedNotes = await listKnowledgeNotes(spaceId)
            resolvedFolders = await listKnowledgeFoldersBySpaceId(spaceId)
          }
        } else {
          // 一库多项目：目录/笔记按 space_id 归属。优先用传入的 spaceId（共享空间），
          // 否则按项目取绑定的第一个空间（旧路径，兼容 ProjectKnowledgeCenter 直用）。
          let targetSpaceId = spaceId
          if (targetSpaceId == null) {
            if (projectId == null) return
            const spaces = await listProjectKnowledgeSpaces(projectId)
            targetSpaceId = spaces[0]?.id
          }
          if (targetSpaceId != null) {
            resolvedNotes = await listKnowledgeNotes(targetSpaceId)
            resolvedFolders = await listKnowledgeFoldersBySpaceId(targetSpaceId)
          }
        }
        setNotes(resolvedNotes)
        setFolders(resolvedFolders)
      }
    } catch (e) {
      console.error('[KnowledgeTreeView] refresh failed:', e)
      toast.error(`加载失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setLoading(false)
    }
  }, [mode, aggregate, projectId, projectName, spaceId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // ───────── 拖拽移动（文件管理器式：拖动知识 → 悬停目标高亮 → 落下移动） ─────────
  const [drag, setDrag] = useState<{ note: DbNote } | null>(null)
  const [dropKey, setDropKey] = useState<string | null>(null)

  const resetDrag = useCallback(() => {
    setDrag(null)
    setDropKey(null)
  }, [])

  /**
   * 计算某节点的放置目标；null = 不可放置（知识节点自身 / 跨知识库目录）。
   * - folder / 真实根目录行 → 移入该目录（folderId = node.id）
   * - 聚合模式的知识库行（node.id 即 spaceId，非目录 id）→ 移到该库顶层（folderId = null）
   * - 跨知识库不允许（数据按空间归属，移动 space_id 涉及附件/绑定语义，暂不开放）
   */
  const dropTargetOf = useCallback(
    (node: UnifiedNode): DropTarget | null => {
      if (!drag) return null
      if (node.kind === 'note') return null
      if (node.spaceId != null && node.spaceId !== drag.note.spaceId) return null
      if (node.kind === 'folder') {
        return { key: `f:${node.id}`, folderId: node.id, label: node.name }
      }
      // project-root / root：聚合模式下 id 是知识库 spaceId → 顶层；否则是真实根目录 → 移入该目录
      if (aggregate) {
        return { key: `r:${node.id}`, folderId: null, label: node.name }
      }
      return { key: `r:${node.id}`, folderId: node.id, label: node.name }
    },
    [drag, aggregate],
  )

  /** 执行移动（同位置 no-op；成功后 toast + 刷新树） */
  const moveNoteTo = useCallback(
    async (target: DropTarget) => {
      const note = drag?.note
      if (!note) return
      if ((note.folderId ?? null) === target.folderId) {
        resetDrag()
        return
      }
      try {
        await moveKnowledgeNote(note.id, target.folderId)
        toast.success(
          target.folderId == null
            ? `已将「${note.title || '未命名'}」移动到顶层`
            : `已将「${note.title || '未命名'}」移动到「${target.label}」`,
        )
        await refresh()
      } catch (e) {
        toast.error(`移动失败：${e instanceof Error ? e.message : String(e)}`)
      } finally {
        resetDrag()
      }
    },
    [drag, refresh, resetDrag],
  )

  const dnd = useMemo<TreeDnd>(
    () => ({
      dragging: drag != null,
      draggingNoteId: drag?.note.id ?? null,
      dropKey,
      setHover: setDropKey,
      onNoteDragStart: (n, e) => {
        e.dataTransfer.effectAllowed = 'move'
        try {
          e.dataTransfer.setData('text/plain', String(n.id))
        } catch {
          /* WebView 个别情况下 setData 受限，不影响组件内状态拖拽 */
        }
        setDrag({ note: n })
      },
      onDragEnd: resetDrag,
      dropTargetOf,
      drop: (t) => {
        void moveNoteTo(t)
      },
    }),
    [drag, dropKey, dropTargetOf, moveNoteTo, resetDrag],
  )

  // ───────── 树组装 ─────────
  const tree = useMemo(
    () =>
      mode === 'project' && aggregate
        ? buildLibrariesTree(aggSpaces, aggFolders, aggNotes)
        : buildUnifiedTree(folders, notes, { withVirtualRoot: mode === 'personal' }),
    [mode, aggregate, aggSpaces, aggFolders, aggNotes, folders, notes],
  )

  // ───────── 打开知识 ─────────
  const openNote = useCallback(async (note: DbNote) => {
    setActiveNoteId(note.id)
    setActiveNote(note)
    setInitialBlocks(undefined)
    try {
      const fresh = await getKnowledgeNote(note.id)
      if (!fresh) {
        toast.error('笔记不存在或已被删除')
        setActiveNoteId(null)
        setActiveNote(null)
        return
      }
      setActiveNote(fresh)
      const blocks = resolveInitialBlocks(
        fresh.contentType,
        fresh.content ?? '',
        fresh.contentMd ?? '',
        undefined as any,
      )
      setInitialBlocks(blocks)
    } catch (e) {
      console.error('[KnowledgeTreeView] openNote failed:', e)
      toast.error(`打开失败：${e instanceof Error ? e.message : String(e)}`)
    }
  }, [])

  // ───────── 知识保存回填 ─────────
  const handleNoteSaved = useCallback(async () => {
    await refresh()
    if (activeNoteId != null) {
      const fresh = await getKnowledgeNote(activeNoteId)
      if (fresh) setActiveNote(fresh)
    }
  }, [refresh, activeNoteId])

  // 保存状态变化回调（useCallback 稳定引用，避免每次渲染注入新回调导致子组件 effect 反复触发）
  // 知识保存成功后：重新拉取并重算 initialBlocks → content 指纹驱动 key 变化 → remount 重载最新内容。
  const handleStatusChange = useCallback(
    (status: SaveStatus, lastSavedAt: string | null) => {
      if (status === 'clean' && lastSavedAt && activeNoteId != null) {
        void (async () => {
          await refresh() // 重新拉取树：知识标题/更新时间保存后实时同步
          const fresh = await getKnowledgeNote(activeNoteId)
          if (!fresh) return
          setActiveNote(fresh)
          setInitialBlocks(
            resolveInitialBlocks(
              fresh.contentType,
              fresh.content ?? '',
              fresh.contentMd ?? '',
              undefined as any,
            ),
          )
        })()
      }
    },
    [activeNoteId, refresh],
  )

  // ───────── 重命名知识 ─────────
  const renameNote = useCallback(
    async (note: DbNote, newName: string) => {
      try {
        await upsertKnowledgeNote({
          id: note.id,
          spaceId: note.spaceId,
          space: note.space,
          title: newName.trim(),
          content: note.content ?? '[]',
          contentType: note.contentType,
          contentMd: note.contentMd ?? '',
          pinned: note.pinned,
          folderId: note.folderId,
          category: note.category,
          sourceType: note.sourceType,
          createdBy: note.createdBy,
          systemType: note.systemType,
        })
        toast.success('已重命名')
        await refresh()
        if (activeNoteId === note.id) {
          const fresh = await getKnowledgeNote(note.id)
          if (fresh) setActiveNote(fresh)
        }
      } catch (e) {
        toast.error(`重命名失败：${e instanceof Error ? e.message : String(e)}`)
      }
    },
    [refresh, activeNoteId],
  )

  // ───────── 解析空间信息（创建知识 / 目录需要 spaceId） ─────────
  const resolveSpaceId = useCallback(async (): Promise<number> => {
    if (mode === 'personal') {
      const spaces = await listPersonalKnowledgeSpaces()
      if (!spaces[0]) throw new Error('个人知识空间未初始化')
      return spaces[0].id
    }
    // 聚合模式（项目知识中心·知识库树）：顶层新建目录/知识落在第一个知识库
    if (aggregate) {
      if (aggSpaces[0]) return aggSpaces[0].id
      throw new Error('尚无可用的知识库，请先在「管理知识库绑定」新建')
    }
    // 一库多项目：直用传入的共享空间；否则按项目取绑定第一个空间
    if (spaceId != null) return spaceId
    const spaces = await listProjectKnowledgeSpaces(projectId!)
    if (!spaces[0]) throw new Error('项目知识空间未初始化')
    return spaces[0].id
  }, [mode, projectId, spaceId, aggregate, aggSpaces])

  // ───────── 聚aggregate模式：取某项目绑定知识库的 spaceId（项目根下新建目录/知识） ─────────
  const spaceIdForProject = useCallback(
    async (pid: number): Promise<number> => {
      const spaces = await listProjectKnowledgeSpaces(pid)
      if (!spaces[0]) throw new Error('该项目尚未绑定知识库')
      const lib = spaces[0]
      return lib.id
    },
    [],
  )

  // ───────── 按目录自身 spaceId 解析（聚合下优先；顶层回退 resolveSpaceId） ─────────
  const folderSpaceId = useCallback(
    async (folderId: number | null): Promise<number> => {
      if (folderId != null) {
        for (const fs of aggFolders.values()) {
          const f = fs.find((x) => x.id === folderId)
          if (f?.spaceId != null) return f.spaceId
        }
        const f = folders.find((x) => x.id === folderId)
        if (f?.spaceId != null) return f.spaceId
      }
      return resolveSpaceId()
    },
    [mode, aggregate, spaceId, projectId, folders, aggFolders, resolveSpaceId],
  )

  // 知识库根节点：在该库顶层新建目录（spaceId 即库 id）
  const addProjectFolder = useCallback(
    async (spaceId: number) => {
      const name = await askName('新建目录', '')
      if (!name || !name.trim()) return
      try {
        await upsertKnowledgeFolder({
          spaceId,
          parentId: null,
          space: 'project',
          projectId: null,
          name: name.trim(),
          systemType: 'USER',
        })
        await refresh()
      } catch (e) {
        toast.error(`新建目录失败：${e instanceof Error ? e.message : String(e)}`)
      }
    },
    [askName, refresh],
  )

  // 项目根节点：在该项目绑定库顶层新建知识
  const addProjectNote = useCallback(
    async (spaceId: number) => {
      try {
        const created = await upsertKnowledgeNote({
          spaceId,
          space: 'project',
          title: '未命名知识',
          content: '[]',
          contentType: 'BLOCKNOTE_JSON',
          contentMd: '',
          pinned: false,
          folderId: null,
          sourceType: 'USER',
        })
        await refresh()
        await openNote(created)
      } catch (e) {
        toast.error(`新建知识失败：${e instanceof Error ? e.message : String(e)}`)
      }
    },
    [refresh, openNote],
  )

  // ───────── 创建目录 ─────────
  const createFolder = useCallback(
    async (parentId: number | null) => {
      const name = await askName('新建目录', '')
      if (!name || !name.trim()) return null
      try {
        // 无可用知识库时 folderSpaceId 会抛错，须在 try 内捕获，避免未处理 rejection
        const spaceId = await folderSpaceId(parentId)
        const created = await upsertKnowledgeFolder({
          spaceId,
          parentId,
          space: mode,
          projectId: null, // 一库多项目：目录归属空间，不锁单项目
          name: name.trim(),
          systemType: 'USER',
        })
        await refresh()
        return created
      } catch (e) {
        toast.error(`新建目录失败：${e instanceof Error ? e.message : String(e)}`)
        return null
      }
    },
    [mode, projectId, spaceId, refresh, resolveSpaceId, folderSpaceId, askName],
  )

  // ───────── 创建知识 ─────────
  const createNote = useCallback(
    async (folderId: number | null) => {
      try {
        const spaceId = await folderSpaceId(folderId)
        const created = await upsertKnowledgeNote({
          spaceId,
          space: mode,
          title: '未命名知识',
          content: '[]',
          contentType: 'BLOCKNOTE_JSON',
          contentMd: '',
          pinned: false,
          folderId,
          sourceType: 'USER',
        })
        await refresh()
        await openNote(created)
      } catch (e) {
        toast.error(`新建知识失败：${e instanceof Error ? e.message : String(e)}`)
      }
    },
    [mode, refresh, resolveSpaceId, folderSpaceId, openNote],
  )

  // ───────── 新建知识库（聚合视图顶层是一级「知识库」，新建≠在建目录内加一层） ─────────
  const createLibrary = useCallback(async () => {
    const name = await askName('新建知识库', '')
    if (!name || !name.trim()) return
    try {
      await createKnowledgeSpace({ spaceType: 'project', projectId: null, name: name.trim() })
      toast.success(`已新建知识库「${name.trim()}」`)
      await refresh()
    } catch (e) {
      toast.error(`新建知识库失败：${e instanceof Error ? e.message : String(e)}`)
    }
  }, [askName, refresh])

  // ───────── 重命名 ─────────
  const renameFolder = useCallback(
    async (folder: DbFolder, newName: string) => {
      try {
        const spaceId = await resolveSpaceId()
        await upsertKnowledgeFolder({
          id: folder.id,
          spaceId,
          parentId: folder.parentId,
          space: mode,
          projectId: mode === 'project' ? projectId ?? null : null,
          name: newName.trim(),
          systemType: folder.systemType,
        })
        await refresh()
      } catch (e) {
        toast.error(`重命名失败：${e instanceof Error ? e.message : String(e)}`)
      }
    },
    [mode, projectId, refresh, resolveSpaceId],
  )

  // ───────── 删除（确认后真删） ─────────
  const doDelete = useCallback(async () => {
    try {
      if (confirm.type === 'library') {
        await deleteKnowledgeSpace(confirm.id)
        toast.success('知识库已删除')
      } else if (confirm.type === 'folder') {
        await deleteKnowledgeFolder(confirm.id)
        toast.success('目录已删除')
      } else {
        await deleteKnowledgeNote(confirm.id)
        toast.success('知识已删除')
        if (activeNoteId === confirm.id) {
          setActiveNoteId(null)
          setActiveNote(null)
          setInitialBlocks(undefined)
        }
      }
      await refresh()
    } catch (e) {
      toast.error(`删除失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setConfirm({ open: false, type: 'note', id: 0, name: '' })
    }
  }, [confirm, refresh, activeNoteId])

  // ───────── 渲染树 ─────────
  return (
    <div style={rootStyle}>
      <aside style={editingMaximized ? { ...treePanelStyle, width: 0, padding: 0, overflow: 'hidden', borderRight: 'none' } : treePanelStyle}>
        <div style={headerStyle}>
          <h3 style={titleStyle}>
            {mode === 'personal' ? '目录' : (projectName ?? '项目知识')}
          </h3>
          {/* 项目模式：新建目录/知识需要目标知识库。聚合模式且无库时隐藏（引导去建库） */}
          {/* 聚合视图：顶层=知识库，新增一级项即新建一个知识库 */}
          {aggregate ? (
            <button
              type="button"
              style={iconBtnStyle}
              onClick={() => void createLibrary()}
              title="新建知识库（顶层一级目录）"
            >
              <Library size={14} strokeWidth={2} />
            </button>
          ) : (
            <>
              {mode === 'project' && (
                <button
                  type="button"
                  style={iconBtnStyle}
                  onClick={async () => {
                    // 项目知识库（单库）：新建该库顶层目录
                    await createFolder(null)
                  }}
                  title="新建目录"
                >
                  <FolderPlus size={14} strokeWidth={2} />
                </button>
              )}
              {mode === 'project' && (
                <button
                  type="button"
                  style={iconBtnStyle}
                  onClick={async () => {
                    // 项目知识库：新建顶层知识
                    await createNote(null)
                  }}
                  title="新建知识"
                >
                  <Plus size={14} strokeWidth={2} />
                </button>
              )}
            </>
          )}
          {mode === 'personal' && (
            <button
              type="button"
              style={iconBtnStyle}
              onClick={async () => {
                // 个人虚拟根加一级目录：parentId=null
                await createFolder(null)
              }}
              title="添加一级目录"
            >
              <Plus size={14} strokeWidth={2} />
            </button>
          )}
        </div>
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '6px 6px 16px',
            ...(drag && !aggregate && dropKey === 'container'
              ? { background: 'rgba(127, 127, 127, 0.08)' }
              : null),
          }}
          onDragOver={(e) => {
            // 空白处 = 当前知识空间顶层（聚合视图顶层有多个库，禁用此语义）
            if (!drag || aggregate) return
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
            if (dropKey !== 'container') setDropKey('container')
          }}
          onDrop={(e) => {
            if (!drag || aggregate) return
            e.preventDefault()
            void moveNoteTo({ key: 'container', folderId: null, label: '顶层' })
          }}
        >
          {/* 「松开：移动到顶层」落点已改为面板底部常驻浮层（见 </aside> 前的块）。
              原因：它原先在拖拽开始时才插入列表，DOM 结构突变会让 Chromium 直接取消整个拖拽
              （dragstart 后立即 dragend，dragenter/dragover/drop 全部不再触发）——
              真机表现为「个人知识中心完全拖不动（连虚化都没有）」，而聚合模式没有这个节点所以正常。 */}
          {loading && folders.length === 0 ? (
            <div style={{ padding: 16, fontSize: 12, color: 'var(--color-text-tertiary)' }}>加载中…</div>
          ) : tree.length === 0 ? (
            <div style={{ padding: 16, fontSize: 12, color: 'var(--color-text-tertiary)', textAlign: 'center' }}>
              暂无内容
            </div>
          ) : (
            tree.map((node) => (
              <TreeNodeRow
                key={`${node.kind}:${node.id}`}
                node={node}
                depth={0}
                dnd={dnd}
                activeNoteId={activeNoteId}
                onOpenNote={openNote}
                onCreateChildFolder={(parentId) => createFolder(parentId)}
                onCreateNote={(folderId) => createNote(folderId)}
                onRenameFolder={renameFolder}
                onRenameNote={renameNote}
                onRenameNotePrompt={(n) => {
                  void (async () => {
                    const next = await askName('重命名知识', n.title)
                    if (next && next.trim() && next !== n.title) {
                      await renameNote(n, next)
                    }
                  })()
                }}
                onAddProjectFolder={addProjectFolder}
                onAddProjectNote={addProjectNote}
                onAskDelete={(type, id, name) => setConfirm({ open: true, type, id, name })}
                onDeleteLibrary={
                  mode === 'project' && aggregate
                    ? (spaceId, name) =>
                        setConfirm({
                          open: true,
                          type: 'library',
                          id: spaceId,
                          name: name.replace(/（绑定：.*）$/, ''),
                        })
                    : undefined
                }
              />
            ))
          )}
        </div>

        {/* 「松开：移动到顶层」落点（非聚合：聚合视图顶层有多个库，无单一顶层语义）
            ⚠️ 必须常驻 DOM，只切换样式显示/隐藏。
            2026-09-16 真机根因：此前用 `{drag && (...)}` 在拖拽开始时才插入该节点，
            Chromium 判定拖拽源所在树发生结构突变，直接取消整个原生拖拽
            （事件序列只有 dragstart → dragend，后续 dragenter/dragover/drop 全无），
            表现为个人知识中心「完全拖不动、连虚化都没有」，而聚合模式（无此节点）一切正常。
            另：浮层不动布局，列表不会因拖拽开始而跳动。 */}
        {!aggregate && (
          <div
            style={{
              position: 'absolute',
              left: 8,
              right: 8,
              bottom: 10,
              zIndex: 20,
              padding: '5px 8px',
              fontSize: 12,
              textAlign: 'center',
              borderRadius: 'var(--radius)',
              border: `1px dashed ${dropKey === 'container' ? 'var(--color-accent)' : 'var(--color-border)'}`,
              color: dropKey === 'container' ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
              background: 'var(--color-bg)',
              boxShadow: '0 2px 10px rgba(0,0,0,0.12)',
              visibility: drag ? 'visible' : 'hidden',
              pointerEvents: drag ? 'auto' : 'none',
            }}
            onDragOver={(e) => {
              e.preventDefault()
              e.stopPropagation()
              e.dataTransfer.dropEffect = 'move'
              if (dropKey !== 'container') setDropKey('container')
            }}
            onDrop={(e) => {
              e.preventDefault()
              e.stopPropagation()
              void moveNoteTo({ key: 'container', folderId: null, label: '顶层' })
            }}
          >
            松开：移动到顶层
          </div>
        )}
      </aside>

      <main style={editorPanelStyle}>
        {activeNote ? (
          <DocumentEditor
            // key 纳入 initialBlocks 就绪标志：打开知识先以(空)挂载，initialBlocks 加载完成即 remount，
            // 让 useCreateBlockNote(initialContent) 直接载入最新块 —— 取代 setContent 二次注入。
            key={`${activeNote.id}-${initialBlocks ? 'c' + initialBlocks.length : 'l'}-${activeNote.updatedAt ?? ''}`}
            source={{ kind: 'knowledge', noteId: activeNote.id }}
            initialTitle={activeNote.title}
            initialUpdatedAt={activeNote.updatedAt}
            initialNote={activeNote}
            initialBlocks={initialBlocks}
            onStatusChange={handleStatusChange}
            onDeleted={() => {
              setActiveNoteId(null)
              setActiveNote(null)
              setInitialBlocks(undefined)
              void refresh()
            }}
            onExported={(path) => toast.success(`已导出到：${path}`)}
          />
        ) : (
          <div style={emptyEditorStyle}>
            <BookOpen size={32} color="var(--color-text-tertiary)" />
            <div style={{ fontSize: 13 }}>
              {aggregate && aggSpaces.length === 0
                ? '尚未新建知识库，请点击右上「新建知识库」'
                : emptyHint ?? (mode === 'personal'
                  ? '选中知识节点开始编辑，或点 ⋯ 新建'
                  : '选中项目目录中的知识开始编辑')}
            </div>
          </div>
        )}
      </main>

      <DeleteConfirmDialog
        open={confirm.open}
        title={confirm.type === 'library' ? `删除知识库「${confirm.name || '未知'}」？` : confirm.type === 'folder' ? '确认删除目录' : '确认删除知识'}
        description={
          confirm.type === 'library'
            ? '将真删整个知识库及其中的所有目录、知识、附件与项目绑定关系，不可恢复。'
            : confirm.type === 'folder'
              ? '删除后目录、所有子目录、其中全部知识与附件将被永久删除，无法恢复。'
              : '删除后知识内容（BlockNote 正文）与附件将被永久删除，无法恢复。'
        }
        onConfirm={doDelete}
        onCancel={() => setConfirm({ open: false, type: 'note', id: 0, name: '' })}
      />

      {/* 命名弹窗（新建目录 / 重命名知识 · 替代 Tauri 不支持的 window.prompt） */}
      {namePrompt && (
        <NamePromptDialog
          title={namePrompt.title}
          initialValue={namePrompt.initialValue}
          onSubmit={(v) => { namePrompt.resolve(v); setNamePrompt(null) }}
          onCancel={() => { namePrompt.resolve(null); setNamePrompt(null) }}
        />
      )}

      {/* 隐藏的 ref 用于在保存回调里触发刷新（DocumentEditor 不暴露 save ref 也可） */}
      <SaveBridge onSaved={handleNoteSaved} />
    </div>
  )
}

/**
 * 命名弹窗（Tauri WebView 不支持 window.prompt，用内嵌弹窗替代）。
 * 用于新建目录、重命名知识/目录。
 */
function NamePromptDialog({
  title,
  initialValue,
  onSubmit,
  onCancel,
}: {
  title: string
  initialValue: string
  onSubmit: (v: string) => void
  onCancel: () => void
}) {
  const [val, setVal] = useState(initialValue)
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
          width: '90%',
          maxWidth: 380,
          boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        }}
      >
        <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 12px', color: 'var(--color-text)' }}>
          {title}
        </h3>
        <input
          autoFocus
          type="text"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); onSubmit(val) }
            if (e.key === 'Escape') { e.preventDefault(); onCancel() }
          }}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '8px 10px',
            fontSize: 13,
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius)',
            background: 'var(--color-bg)',
            color: 'var(--color-text)',
            outline: 'none',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
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
            onClick={() => onSubmit(val)}
            style={{
              padding: '6px 14px',
              fontSize: 12,
              border: 'none',
              background: 'var(--color-accent)',
              color: 'var(--color-text-on-accent, #fff)',
              borderRadius: 'var(--radius)',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            确定
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * 占位组件：把 handleNoteSaved 暴露给 DocumentEditor 内部 onExported/onSaved 等钩子。
 * 实际 DocumentEditor 保存后无需外部触发刷新（自身状态机内会写库），这里留空置即可。
 */
function SaveBridge(_props: { onSaved: () => void | Promise<void> }): null {
  return null
}

// ============================================================
// TreeNodeRow（递归 · 悬停 ⋯ 菜单按 nodeKind 决定）
// ============================================================

/** 拖拽放置目标（由 dropTargetOf 计算） */
interface DropTarget {
  key: string
  /** null = 移到顶层 */
  folderId: number | null
  label: string | null
}

/** 拖拽上下文（主组件 → 递归 TreeNodeRow 透传） */
interface TreeDnd {
  dragging: boolean
  draggingNoteId: number | null
  dropKey: string | null
  setHover: (key: string | null) => void
  onNoteDragStart: (n: DbNote, e: React.DragEvent) => void
  onDragEnd: () => void
  dropTargetOf: (node: UnifiedNode) => DropTarget | null
  drop: (t: DropTarget) => void
}

interface TreeNodeRowProps {
  node: UnifiedNode
  depth: number
  dnd: TreeDnd
  activeNoteId: number | null
  onOpenNote: (n: DbNote) => void
  onCreateChildFolder: (parentId: number | null) => Promise<DbFolder | null>
  onCreateNote: (folderId: number | null) => Promise<void>
  onRenameFolder: (f: DbFolder, newName: string) => Promise<void>
  onRenameNote: (n: DbNote, newName: string) => Promise<void>
  /** 触发知识重命名（由父组件用命名弹窗取新名，再调 onRenameNote） */
  onRenameNotePrompt: (n: DbNote) => void
  onAskDelete: (type: 'note' | 'folder', id: number, name: string) => void
  /** 项目根节点：在该项目绑定知识库顶层新建目录/知识（聚合模式） */
  onAddProjectFolder?: (projectId: number) => void
  onAddProjectNote?: (projectId: number) => void
  /** 聚合模式下的顶层知识库节点：删除整个知识库（spaceId 为该库 id，name 已去绑定标注） */
  onDeleteLibrary?: (spaceId: number, name: string) => void
}

function TreeNodeRow({
  node,
  depth,
  dnd,
  activeNoteId,
  onOpenNote,
  onCreateChildFolder,
  onCreateNote,
  onRenameFolder,
  onRenameNote,
  onRenameNotePrompt,
  onAskDelete,
  onAddProjectFolder,
  onAddProjectNote,
  onDeleteLibrary,
}: TreeNodeRowProps) {
  const [expanded, setExpanded] = useState(true)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(node.name)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [menuOpen])

  const isActive = node.kind === 'note' && node.note?.id === activeNoteId
  const isSystem = node.kind === 'root'
  const isProjectRoot = node.kind === 'project-root'
  const isFolder = node.kind === 'folder'
  const hasChildren = node.children.length > 0

  // ── 拖拽：note 可拖起；目录/根/知识库行是放置目标 ──
  const isNote = node.kind === 'note'
  const draggingSelf = isNote && dnd.draggingNoteId === node.id
  const target = dnd.dragging ? dnd.dropTargetOf(node) : null
  const isHover = !!target && dnd.dropKey === target.key

  const submitRename = () => {
    const v = renameValue.trim()
    if (v && v !== node.name && isFolder) {
      onRenameFolder(node as unknown as DbFolder, v)
    }
    setRenaming(false)
  }

  // 节点图标
  const icon = (() => {
    if (node.kind === 'note') return <FileText size={11} color={isActive ? 'var(--color-accent)' : 'var(--color-text-tertiary)'} />
    if (node.kind === 'root') return <Folder size={11} color="var(--color-text-tertiary)" />
    if (isProjectRoot) return <FolderOpen size={11} color="var(--color-text-tertiary)" />
    return isActive
      ? <FolderOpen size={11} color="var(--color-accent)" />
      : <Folder size={11} color="var(--color-text-tertiary)" />
  })()

  return (
    <div>
      <div
        style={rowContainerStyle}
        // 维护者 2026-09-16 修复：拖拽源必须挂在 div 上，不能挂 <button>。
        // Blink/WebView2（旧版本）对表单控件（button 等）无视 draggable="true"，
        // dragstart 永远不触发 → 真机「完全拖不动」，而 jsdom 测试绕过原生门控全部通过。
        // FileTree 的行本来就是 div，所以它没问题。详见 wpt 47a8c17（按钮 draggable 规范变更）。
        draggable={isNote}
        onDragStart={(e) => {
          if (isNote && node.note) dnd.onNoteDragStart(node.note, e)
        }}
        onDragEnd={() => {
          if (isNote) dnd.onDragEnd()
        }}
        onDragOver={(e) => {
          if (!dnd.dragging) return
          // 行内吃掉事件，阻止冒泡到树容器（否则拖到知识/无效目标上会误触发「移到顶层」）
          e.stopPropagation()
          if (target) {
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
            if (dnd.dropKey !== target.key) dnd.setHover(target.key)
          } else if (dnd.dropKey) {
            dnd.setHover(null)
          }
        }}
        onDrop={(e) => {
          if (!dnd.dragging) return
          e.stopPropagation()
          if (!target) return
          e.preventDefault()
          dnd.drop(target)
        }}
      >
        {renaming && isFolder ? (
          <input
            autoFocus
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); submitRename() }
              if (e.key === 'Escape') { e.preventDefault(); setRenameValue(node.name); setRenaming(false) }
            }}
            onBlur={submitRename}
            style={{
              ...rowStyle(false, depth),
              flex: 1,
              paddingTop: 2,
              paddingBottom: 2,
              outline: 'none',
              background: 'var(--color-bg-active)',
            }}
          />
        ) : (
          <button
            type="button"
            style={{
              ...rowStyle(isActive, depth),
              ...(isHover
                ? { background: 'var(--color-bg-active)', boxShadow: 'inset 0 0 0 1.5px var(--color-accent)' }
                : null),
              ...(draggingSelf ? { opacity: 0.45 } : null),
            }}
            onClick={() => {
              if (node.kind === 'note' && node.note) onOpenNote(node.note)
              else if (hasChildren) setExpanded((v) => !v)
            }}
            onDoubleClick={() => {
              if (isFolder) {
                setRenameValue(node.name)
                setRenaming(true)
              }
            }}
          >
            <span
              onClick={(e) => {
                e.stopPropagation()
                if (hasChildren) setExpanded((v) => !v)
              }}
              style={{ display: 'inline-flex', width: 12, justifyContent: 'center' }}
            >
              {hasChildren ? (
                expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />
              ) : null}
            </span>
            {icon}
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {node.name}
            </span>
          </button>
        )}

        {/* 悬停 ⋯ 按钮（始终保留占位 · hover 显示） */}
        {!renaming && (
          <button
            type="button"
            style={{ ...iconBtnStyle, marginRight: 4, opacity: menuOpen ? 1 : 0.5 }}
            onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v) }}
            title="操作"
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
            onMouseLeave={(e) => { if (!menuOpen) e.currentTarget.style.opacity = '0.5' }}
          >
            <MoreHorizontal size={12} />
          </button>
        )}

        {menuOpen && (
          <div
            ref={menuRef}
            style={{
              position: 'absolute',
              top: '100%',
              right: 4,
              zIndex: 50,
              minWidth: 160,
              background: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius)',
              boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
              padding: 4,
              fontSize: 12,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 按 nodeKind 决定菜单项（设计文档 §31） */}
            {isProjectRoot && (
              <MenuItem
                icon={<FolderPlus size={11} />}
                label="添加子目录"
                onClick={async () => {
                  setMenuOpen(false)
                  await onAddProjectFolder?.(node.spaceId!)
                }}
              />
            )}
            {isProjectRoot && (
              <MenuItem
                icon={<Plus size={11} />}
                label="新建知识"
                onClick={async () => {
                  setMenuOpen(false)
                  await onAddProjectNote?.(node.spaceId!)
                }}
              />
            )}
            {/* 聚合模式：顶层知识库（space）可删除整个库（目录+知识+附件+绑定） */}
            {isProjectRoot && onDeleteLibrary && (
              <MenuItem
                icon={<Trash2 size={11} />}
                label="删除知识库"
                danger
                onClick={() => {
                  setMenuOpen(false)
                  onDeleteLibrary(node.spaceId!, node.name)
                }}
              />
            )}
            {(node.kind === 'folder' || node.kind === 'root') && (
              <MenuItem
                icon={<FolderPlus size={11} />}
                label="添加子目录"
                onClick={async () => {
                  setMenuOpen(false)
                  await onCreateChildFolder(node.kind === 'root' ? null : node.id)
                }}
              />
            )}
            {node.kind === 'folder' && (
              <MenuItem
                icon={<Plus size={11} />}
                label="新建知识"
                onClick={async () => {
                  setMenuOpen(false)
                  await onCreateNote(node.kind === 'root' ? null : node.id)
                }}
              />
            )}
            {(node.kind === 'folder') && (
              <MenuItem
                icon={<Pencil size={11} />}
                label="重命名"
                onClick={() => {
                  setMenuOpen(false)
                  setRenameValue(node.name)
                  setRenaming(true)
                }}
              />
            )}
            {(node.kind === 'note') && (
              <MenuItem
                icon={<Pencil size={11} />}
                label="重命名"
                onClick={() => {
                  setMenuOpen(false)
                  if (!node.note) return
                  onRenameNotePrompt(node.note)
                }}
              />
            )}
            {/* 删除：folder（除 PROJECT_ROOT） 与 note 均可 */}
            {(node.kind === 'folder' || node.kind === 'note') && (
              <MenuItem
                icon={<Trash2 size={11} />}
                label="删除"
                danger
                onClick={() => {
                  setMenuOpen(false)
                  const t = node.kind === 'note' ? 'note' : 'folder'
                  onAskDelete(t, node.id, node.name)
                }}
              />
            )}
            {/* ai 系统目录不可删 / 不可改名 · 不显示 */}
            {/* root 虚拟根不可删 / 不可改名 · 不显示 */}
          </div>
        )}
      </div>

      {expanded && hasChildren && (
        <div>
          {node.children.map((c) => (
            <TreeNodeRow
              key={`${c.kind}:${c.id}`}
              node={c}
              depth={depth + 1}
              dnd={dnd}
              activeNoteId={activeNoteId}
              onOpenNote={onOpenNote}
              onCreateChildFolder={onCreateChildFolder}
              onCreateNote={onCreateNote}
              onRenameFolder={onRenameFolder}
              onRenameNote={onRenameNote}
              onRenameNotePrompt={onRenameNotePrompt}
              onAskDelete={onAskDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function MenuItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        width: '100%',
        padding: '6px 8px',
        background: 'transparent',
        border: 'none',
        borderRadius: 3,
        cursor: 'pointer',
        color: danger ? '#dc2626' : 'var(--color-text)',
        fontSize: 12,
        textAlign: 'left',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg-subtle)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

export default KnowledgeTreeView
