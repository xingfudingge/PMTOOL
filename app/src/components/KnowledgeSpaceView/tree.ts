/**
 * PMTool · 知识中心目录树组装（维护者 2026-08-31 / 2026-09-04 重构）
 *
 * 拆出来独立文件以便 vitest 单元测试（不依赖 React/Tauri）。
 *
 * 两栏式重构（设计文档 §31）核心：
 *   - buildUnifiedTree：左侧单棵「统一树」，节点即目录或知识，固定追加 AI 生成系统目录
 *   - UnifiedNode.nodeKind 决定“悬停 ⋯”菜单允许的操作
 *   - 个人知识中心带虚拟根「目录」（不可删/不可改名）
 *
 * 保留的旧函数（buildFolderTree / filterNotesByFolder / buildProjectBrowseTree /
 * filterNotesByProject）供旧组件与既有 vitest 继续使用，本版不破坏。
 */

import type {
  KnowledgeNote as DbNote,
  KnowledgeFolder as DbFolder,
} from '@/services/knowledge'

export interface FolderNode extends DbFolder {
  children: FolderNode[]
  notes: DbNote[]
  expanded: boolean
  sortOrder: number
  /** 维护者 2026-08-31：true 表示系统内置虚拟目录（不可删除） */
  isSystem?: boolean
}

/** 虚拟目录 id · 用负数避免和真实 DB 自增 id 冲突 */
export const SYSTEM_AI_KNOWLEDGE_ID = -1

export function isSystemFolderId(id: number | null | undefined): boolean {
  return id === SYSTEM_AI_KNOWLEDGE_ID
}

export function buildFolderTree(folders: DbFolder[], notes: DbNote[]): FolderNode[] {
  const map = new Map<number, FolderNode>()
  for (const f of folders) {
    map.set(f.id, { ...f, children: [], notes: [], expanded: true })
  }
  for (const n of notes) {
    // 维护者 2026-08-31：AI 笔记只归 AI 知识虚拟目录，不挂真实目录
    if (n.isAiGenerated) continue
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
  // 虚拟系统目录「AI 生成知识目录」——所有 isAiGenerated=true 的笔记
  const aiNotes = notes.filter((n) => n.isAiGenerated)
  const fallbackSpace = roots[0]?.space ?? 'personal'
  roots.push({
    id: SYSTEM_AI_KNOWLEDGE_ID,
    parentId: null,
    space: fallbackSpace,
    spaceId: null,
    projectId: null,
    name: 'AI 知识',
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

/**
 * 根据当前选中目录 id 过滤笔记列表
 */
export function filterNotesByFolder(notes: DbNote[], selectedFolderId: number | null): DbNote[] {
  if (selectedFolderId === SYSTEM_AI_KNOWLEDGE_ID) {
    return notes.filter((n) => n.isAiGenerated)
  }
  if (selectedFolderId == null) return []
  return notes.filter((n) => n.folderId === selectedFolderId && !n.isAiGenerated)
}

// ============================================================
// 项目知识中心 · 浏览模式（维护者 2026-08-31）
// ============================================================

/** 浏览模式选中态 */
export interface ProjectSelection {
  projectId: number | null
  folderId: number | null
}

/** 浏览模式树节点 */
export interface BrowseProjectNode {
  key: string
  projectId: number
  name: string
  kind: 'project'
  folderTree: FolderNode[]
  notes: DbNote[]
}

export function buildProjectBrowseTree(
  projects: { id: number; project_name: string }[],
  folders: DbFolder[],
  notes: DbNote[],
): BrowseProjectNode[] {
  const roots: BrowseProjectNode[] = []
  for (const p of projects) {
    const pfoldersRaw = folders.filter((f) => f.projectId === p.id)
    const sysRoot = pfoldersRaw.find((f) => f.parentId == null)
    const pfolders =
      sysRoot != null
        ? pfoldersRaw
            .filter((f) => f.id !== sysRoot.id)
            .map((f) => (f.parentId === sysRoot.id ? { ...f, parentId: null } : f))
        : pfoldersRaw

    const pnotes = notes.filter((n) => n.spaceId === p.id)
    if (sysRoot == null && pfolders.length === 0 && pnotes.length === 0) continue
    roots.push({
      key: `p${p.id}`,
      projectId: p.id,
      name: p.project_name,
      kind: 'project',
      folderTree: buildFolderTree(pfolders, pnotes),
      notes: pnotes,
    })
  }
  return roots
}

export function filterNotesByProject(notes: DbNote[], sel: ProjectSelection): DbNote[] {
  if (sel.folderId === SYSTEM_AI_KNOWLEDGE_ID) {
    return notes.filter((n) => n.spaceId === sel.projectId && n.isAiGenerated)
  }
  if (sel.folderId != null) {
    return notes.filter((n) => n.folderId === sel.folderId && !n.isAiGenerated)
  }
  if (sel.projectId != null) {
    return notes.filter((n) => n.spaceId === sel.projectId && !n.isAiGenerated)
  }
  return []
}

// ============================================================
// 统一知识树节点模型（2026-09-04 重构 · 设计文档 §31）
// ============================================================
// 两栏式：左侧一棵树，节点可以是「目录」或「知识」，固定系统「AI 生成」目录。
// nodeKind 决定“悬停 ⋯”菜单允许操作：
//   - root         个人知识中心“目录”虚拟根：仅 添加子目录（不可删/不可改名）
//   - project-root 项目根节点：仅 删除 / 添加子目录（不可直接新建知识）
//   - folder       普通目录（无限层级）：删除 / 重命名 / 添加子目录 / 新建知识
//   - note         知识节点：删除 / 重命名
//   - ai           系统 AI 生成目录：添加子目录 / 新建知识（不可删/不可重命名）

export type UnifiedNodeKind = 'root' | 'project-root' | 'folder' | 'note' | 'ai'

export interface UnifiedNode extends DbFolder {
  kind: UnifiedNodeKind
  /** 节点显示名（目录用 name · 知识用 title） */
  name: string
  /** kind==='note' 时携带该知识记录 */
  note?: DbNote
  children: UnifiedNode[]
  expanded: boolean
  isSystem?: boolean
}

/** 个人知识中心顶部虚拟「目录」根 id（与 DB 无对应 · 用 0 不冲突） */
const VIRTUAL_ROOT_ID = 0

function toNoteNode(n: DbNote): UnifiedNode {
  return {
    id: n.id,
    parentId: n.folderId ?? null,
    space: n.space,
    spaceId: n.spaceId ?? null,
    projectId: null,
    name: n.title || '未命名',
    systemType: 'USER',
    sortOrder: 0,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
    kind: 'note',
    note: n,
    children: [],
    expanded: true,
  }
}

/**
 * 组装统一树。
 *
 * @param folders 该空间目录（至少含 SYSTEM_AI 目录与（项目）根目录）
 * @param notes   该空间全部知识
 * @param opts.withVirtualRoot 个人知识中心：在最上插“目录”虚拟根
 */
export function buildUnifiedTree(
  folders: DbFolder[],
  notes: DbNote[],
  opts: { withVirtualRoot?: boolean } = {},
): UnifiedNode[] {
  const isAi = (f: DbFolder) => f.systemType === 'SYSTEM_AI'
  const aiFolder = folders.find(isAi)

  const map = new Map<number, UnifiedNode>()
  for (const f of folders) {
    if (isAi(f)) continue
    map.set(f.id, {
      ...f,
      kind: f.systemType === 'PROJECT_ROOT' ? 'project-root' : 'folder',
      name: f.name,
      children: [],
      expanded: true,
    })
  }

  // 挂普通知识到父目录（AI 知识只归 AI 系统目录）
  for (const n of notes) {
    if (n.isAiGenerated) continue
    const parent = n.folderId != null ? map.get(n.folderId) : undefined
    if (parent) parent.children.push(toNoteNode(n))
  }

  // 组装目录根（parentId=null 或父缺失 → 根）
  const folderRoots: UnifiedNode[] = []
  for (const node of map.values()) {
    if (node.parentId == null) folderRoots.push(node)
    else {
      const p = map.get(node.parentId)
      if (p) p.children.push(node)
      else folderRoots.push(node)
    }
  }

  // AI 生成系统目录（固定放最后）
  if (aiFolder) {
    folderRoots.push({
      ...aiFolder,
      kind: 'ai',
      name: aiFolder.name,
      children: notes.filter((n) => n.isAiGenerated).map((n) => toNoteNode(n)),
      expanded: true,
      isSystem: true,
    })
  }

  // 个人知识中心：最上插“目录”虚拟根
  if (opts.withVirtualRoot) {
    const rootNotes = notes.filter((n) => n.folderId == null && !n.isAiGenerated)
    const virtual: UnifiedNode = {
      id: VIRTUAL_ROOT_ID,
      parentId: null,
      space: folders[0]?.space ?? 'personal',
      spaceId: folders[0]?.spaceId ?? null,
      projectId: null,
      name: '目录',
      systemType: 'ROOT',
      sortOrder: -1,
      createdAt: '',
      updatedAt: '',
      kind: 'root',
      children: [...folderRoots, ...rootNotes.map((n) => toNoteNode(n))],
      expanded: true,
      isSystem: true,
    }
    return [virtual]
  }

  return folderRoots
}

/**
 * 组装「项目知识中心」多项目聚合树（2026-09-09）
 *
 * 以项目为顶层节点（project-root），项目下 = 该项目绑定知识库的目录 + 各库的 AI 生成目录（固定在树底）。
 * M:N：多个项目可绑定同一知识库 —— 每个绑定了该库的项目节点都会展示该库内容（共享）。
 * 一个项目绑定多个知识库时，各库目录与 AI 目录依次并入该项目节点下。
 */
/**
 * 组装「项目知识中心」知识库树（2026-09-09 · 以知识库为顶层，库与库独立）
 *
 * 顶层节点 = 知识空间（知识库），每个库独立挂自己的目录 + AI 生成目录（底部）。
 * 一个库可被多个项目绑定（M:N）——共享只体现在库节点标注的绑定项目上，不改变库内容，
 * 也不会让库内容在多个项目下重复显示（知识库与知识库互不干扰）。
 */
export function buildLibrariesTree(
  spaces: { id: number; name: string; boundText: string }[],
  foldersBySpace: Map<number, DbFolder[]>,
  notesBySpace: Map<number, DbNote[]>,
): UnifiedNode[] {
  const roots: UnifiedNode[] = []
  for (const s of spaces) {
    const folders = foldersBySpace.get(s.id) ?? []
    const notes = notesBySpace.get(s.id) ?? []
    const children = buildUnifiedTree(folders, notes, { withVirtualRoot: false }).filter(
      (c) => c.kind !== 'project-root',
    )
    // 库节点：spaceId 指向该知识库，便于在其下新建目录/知识；name 追加绑定项目标注。
    roots.push({
      id: s.id,
      parentId: null,
      space: 'project',
      spaceId: s.id,
      projectId: null,
      name: s.boundText ? `${s.name}（绑定：${s.boundText}）` : s.name,
      systemType: 'PROJECT_ROOT',
      sortOrder: 0,
      createdAt: '',
      updatedAt: '',
      kind: 'project-root',
      children,
      expanded: true,
      isSystem: true,
    })
  }
  return roots
}

export function buildProjectsAggregateTree(
  projects: { id: number; name: string }[],
  foldersByProject: Map<number, DbFolder[]>,
  notesByProject: Map<number, DbNote[]>,
): UnifiedNode[] {
  const roots: UnifiedNode[] = []
  for (const p of projects) {
    const folders = foldersByProject.get(p.id) ?? []
    const notes = notesByProject.get(p.id) ?? []
    // 该项目绑定知识库的目录+AI 树（去除嵌套的 project-root，防库内含实例根）
    const children = buildUnifiedTree(folders, notes, { withVirtualRoot: false }).filter(
      (c) => c.kind !== 'project-root',
    )
    if (children.length === 0) continue
    roots.push({
      id: p.id,
      parentId: null,
      space: 'project',
      spaceId: null,
      projectId: p.id,
      name: p.name,
      systemType: 'PROJECT_ROOT',
      sortOrder: 0,
      createdAt: '',
      updatedAt: '',
      kind: 'project-root',
      children,
      expanded: true,
      isSystem: true,
    })
  }
  return roots
}