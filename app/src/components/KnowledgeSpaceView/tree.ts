/**
 * PMTool · 知识中心目录树组装（维护者 2026-08-31）
 *
 * 拆出来独立文件以便 vitest 单元测试（不依赖 React/Tauri）。
 *
 * 行为：
 *   - 输入 folders + notes（DB flat list），输出树状 nodes
 *   - 子目录挂在 parentId 指向的父节点下
 *   - 孤儿节点（parentId 指向不存在的父）退化为根
 *   - 追加 1 个系统虚拟节点「AI 生成知识目录」在最后：
 *     - id=-1 · 所有 isAiGenerated=true 的 notes 聚合
 */

import type {
  KnowledgeNote as DbNote,
  KnowledgeFolder as DbFolder,
} from '@/services/knowledge'

export interface FolderNode extends DbFolder {
  children: FolderNode[]
  notes: DbNote[]
  expanded: boolean
  sortOrder: number              // DbFolder 中已定义，不再冗余
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
    projectId: null,              // AI 目录不属于任何项目
    name: 'AI 生成知识目录',
    sortOrder: 0,
    systemType: 'SYSTEM_AI',      // 系统 AI 目录类型
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
 *
 * 维护者 2026-08-31：
 *   - -1（AI 知识）→ isAiGenerated=true
 *   - 其他真实 id → folderId=id 且 isAiGenerated=false
 *     （AI 笔记只能在 AI 知识虚拟目录展示，不能污染其他目录）
 *   - null → 不展示笔记（根级笔记不再使用”未分类”目录承载）
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
// ProjectKnowledgeBrowser 的树组装 + 笔记过滤纯函数。
// 与 buildFolderTree 不同：多一层「项目」根节点，其下才是目录树（含 AI 知识系统目录）。

/** 浏览模式选中态 */
export interface ProjectSelection {
  projectId: number | null
  folderId: number | null
}

/** 浏览模式树节点 */
export interface BrowseProjectNode {
  key: string // `p${projectId}`
  projectId: number
  name: string
  kind: 'project'
  folderTree: FolderNode[] // 该项目/分组的目录树（buildFolderTree 已含 AI 知识系统目录）
  notes: DbNote[] // 该项目/分组的全部笔记（AI+ 普通）
}

/**
 * 项目知识中心浏览模式：项目 → 目录树（含 AI 知识系统目录）两级结构
 *
 * - 已建库项目（有顶层目录）→ 可展开根节点
 * - 未建库项目不在此展示（走「＋ 新建项目知识」流程）
 * - 维护者 2026-09-01：过滤掉与项目名同名的顶级目录（那是 ensure_project_knowledge_library
 *   创建的系统根目录，不应在树里显示两次）
 */
export function buildProjectBrowseTree(
  projects: { id: number; project_name: string }[],
  folders: DbFolder[],
  notes: DbNote[],
): BrowseProjectNode[] {
  const roots: BrowseProjectNode[] = []
  for (const p of projects) {
    // 维护者 2026-09-01：sysRoot = 该项目 parent_id=NULL 的根目录（任意名字）
    // 不再要求 name=projectName（兼容「绑别人已有的根目录」任意名）·
    // 视觉上它跟"项目虚拟根"重复，必须先 reparent 它的 children 再过滤，
    // 否则孤儿提升到根时会和虚拟根混在一起
    const pfoldersRaw = folders.filter((f) => f.projectId === p.id)
    const sysRoot = pfoldersRaw.find((f) => f.parentId == null)
    const pfolders =
      sysRoot != null
        ? pfoldersRaw
            .filter((f) => f.id !== sysRoot.id)
            .map((f) => (f.parentId === sysRoot.id ? { ...f, parentId: null } : f))
        : pfoldersRaw

    const pnotes = notes.filter((n) => n.spaceId === p.id)
    // 维护者 2026-09-01：未建库项目 = 没有系统根（说明没调过 ensure_project_knowledge_library）
    // + 没有真实目录 + 没有用户笔记 —— 三个条件同时满足才跳过
    // 用户主动建库后会创建系统根（即使还没子目录/笔记）→ 进树，可点 + 加目录
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

/**
 * 浏览模式笔记过滤（按 项目 + 目录 两级选中）
 *
 *   - folderId=-1（AI 知识）→ 该项目的 isAiGenerated=true
 *   - folderId=真实目录 → folderId=id 且非 AI（目录 id 全局唯一，无需再按项目过滤）
 *   - 只选中项目（folderId=null）→ 该项目全部非 AI 笔记（树状浏览：点项目看全部）
 */
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
