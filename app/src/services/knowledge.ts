/**
 * PMTool · 知识中心前端服务（2026-09-03 知识中心重构）
 *
 * 设计变更：
 *   - 知识笔记现在属于 knowledge_space（通过 space_id 关联）
 *   - 个人知识中心和个人知识空间一一对应
 *   - 项目知识中心通过 project_knowledge_bindings 绑定到项目知识空间
 *
 * 对应 Rust commands/knowledge.rs：
 *   - list_knowledge_notes(space_id)
 *   - list_knowledge_notes_by_space_type(space)  // 兼容旧 API
 *   - get_knowledge_note(id)
 *   - upsert_knowledge_note(note)
 *   - delete_knowledge_note(id)
 *   - search_knowledge_notes_by_space(space_id, query)
 *   - search_knowledge_notes_by_space_type(space, query)  // 兼容旧 API
 */

import { invoke } from '@tauri-apps/api/core'

// ============================================================
// 类型
// ============================================================

export type KnowledgeContentType = 'BLOCKNOTE_JSON' | 'MARKDOWN' | 'TEXT'

/**
 * 知识笔记 · id 是 number（DB INTEGER PRIMARY KEY · 后端 rowid）。
 */
export interface KnowledgeNote {
  id: number
  spaceId: number              // 新增：知识空间 ID
  space: KnowledgeSpace        // 'personal' | 'project'
  title: string
  /** BlockNote JSON / Markdown / 纯文本 */
  content: string | null
  contentType: KnowledgeContentType
  contentMd: string | null
  pinned: boolean
  /** 所属目录 · null = 根节点 */
  folderId: number | null
  category: string | null
  sourceType: string
  isAiGenerated: boolean
  createdBy: string | null
  createdAt: string
  updatedAt: string
  systemType?: string          // 可选，默认 USER
}

export interface KnowledgeNoteInput {
  id?: number | null
  spaceId: number
  space: KnowledgeSpace
  title: string
  content?: string | null
  contentType: KnowledgeContentType
  contentMd?: string | null
  pinned?: boolean
  folderId?: number | null
  category?: string | null
  sourceType?: string
  isAiGenerated?: boolean
  createdBy?: string | null
  systemType?: string          // 可选，默认 USER
}

/** 获取个人知识空间列表（向后兼容） */
export { listPersonalKnowledgeSpaces } from './knowledgeSpaces'

/** 知识空间类型（向后兼容） */
export type KnowledgeSpace = 'personal' | 'project'

/** 知识目录节点（树状） */
export interface KnowledgeFolder {
  id: number
  parentId: number | null
  space: KnowledgeSpace
  projectId: number | null
  name: string
  sortOrder: number
  systemType: string           // USER / SYSTEM_AI / PROJECT_ROOT
  createdAt: string
  updatedAt: string
}

export interface KnowledgeFolderInput {
  id?: number | null
  spaceId?: number
  parentId?: number | null
  space: KnowledgeSpace
  projectId?: number | null
  name: string
  sortOrder?: number | null
  systemType?: string          // USER / SYSTEM_AI / PROJECT_ROOT
}

// ============================================================
// 笔记 API
// ============================================================

/**
 * 列出某个知识空间下的所有笔记
 * @param spaceId 知识空间 ID（knowledge_spaces.id）
 */
export async function listKnowledgeNotes(
  spaceId: number,
): Promise<KnowledgeNote[]> {
  return await invoke<KnowledgeNote[]>('list_knowledge_notes', { spaceId })
}

/**
 * 列出某个空间类型下的所有笔记（兼容旧 API）
 * @param space 'personal' | 'project'
 */
export async function listKnowledgeNotesBySpaceType(
  space: KnowledgeSpace,
): Promise<KnowledgeNote[]> {
  return await invoke<KnowledgeNote[]>('list_knowledge_notes_by_space_type', { space })
}

/**
 * 获取单个知识笔记
 * @deprecated 使用 listKnowledgeNotes 代替
 */
export async function getKnowledgeNote(
  id: number,
): Promise<KnowledgeNote | null> {
  return await invoke<KnowledgeNote | null>('get_knowledge_note', { id })
}

/**
 * 创建或更新知识笔记
 */
export async function upsertKnowledgeNote(
  note: KnowledgeNoteInput,
): Promise<KnowledgeNote> {
  return await invoke<KnowledgeNote>('upsert_knowledge_note', { note })
}

/**
 * 删除知识笔记（前端必须先二次确认）
 */
export async function deleteKnowledgeNote(id: number): Promise<boolean> {
  return await invoke<boolean>('delete_knowledge_note', { id })
}

/**
 * 全文搜索：按知识空间 ID 筛选
 */
export async function searchKnowledgeNotesBySpace(
  spaceId: number,
  query: string,
): Promise<KnowledgeNote[]> {
  return await invoke<KnowledgeNote[]>('search_knowledge_notes_by_space', {
    spaceId,
    query,
  })
}

/**
 * 全文搜索：按空间类型筛选（兼容旧 API）
 */
export async function searchKnowledgeNotesBySpaceType(
  space: KnowledgeSpace,
  query: string,
): Promise<KnowledgeNote[]> {
  return await invoke<KnowledgeNote[]>('search_knowledge_notes_by_space_type', {
    space,
    query,
  })
}

// ============================================================
// 目录 API
// ============================================================

/**
 * 列出某个空间下的所有目录
 */
export async function listKnowledgeFolders(
  space: KnowledgeSpace,
): Promise<KnowledgeFolder[]> {
  return await invoke<KnowledgeFolder[]>('list_knowledge_folders', { space })
}

/**
 * 列出某个项目下的所有目录
 */
export async function listKnowledgeFoldersByProject(
  projectId: number,
): Promise<KnowledgeFolder[]> {
  return await invoke<KnowledgeFolder[]>('list_knowledge_folders_by_project', {
    projectId,
  })
}

/**
 * 获取单个目录
 */
export async function getKnowledgeFolder(
  id: number,
): Promise<KnowledgeFolder | null> {
  return await invoke<KnowledgeFolder | null>('get_knowledge_folder', { id })
}

/**
 * 创建或更新目录
 */
export async function upsertKnowledgeFolder(
  folder: KnowledgeFolderInput,
): Promise<KnowledgeFolder> {
  return await invoke<KnowledgeFolder>('upsert_knowledge_folder', { folder })
}

/**
 * 为项目创建（或取回）顶层知识库目录
 */
export async function ensureProjectKnowledgeLibrary(
  projectId: number,
  projectName: string,
): Promise<KnowledgeFolder> {
  return await invoke<KnowledgeFolder>('ensure_project_knowledge_library', {
    projectId,
    projectName,
  })
}

/**
 * 确保 AI 生成目录存在
 */
export async function ensureAiKnowledgeFolder(
  space: KnowledgeSpace,
  projectId: number | null,
): Promise<KnowledgeFolder> {
  return await invoke<KnowledgeFolder>('ensure_ai_knowledge_folder', {
    space,
    projectId,
  })
}

/**
 * 删除目录（前端必须先二次确认）
 */
export async function deleteKnowledgeFolder(id: number): Promise<boolean> {
  return await invoke<boolean>('delete_knowledge_folder', { id })
}
