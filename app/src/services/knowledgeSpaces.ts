/**
 * PMTool · 知识空间前端服务
 *
 * 对应 Rust commands/knowledge_spaces.rs：
 *   - list_knowledge_spaces
 *   - get_knowledge_space
 *   - create_knowledge_space
 *   - delete_knowledge_space
 *
 * 设计原则：
 *   - 个人知识中心和个人知识空间一一对应
 *   - 项目知识中心通过绑定关系访问项目知识空间
 *   - 项目中心不持有知识数据，只持有绑定关系
 */

import { invoke } from '@tauri-apps/api/core'

/** 知识空间类型 */
export type KnowledgeSpaceType = 'PERSONAL' | 'PROJECT'

/** 知识空间 */
export interface KnowledgeSpace {
  id: number
  spaceType: KnowledgeSpaceType
  projectId: number | null
  name: string
  createdAt: string
  updatedAt: string
}

/** 知识空间输入 */
export interface KnowledgeSpaceInput {
  spaceType: KnowledgeSpaceType
  projectId?: number | null
  name: string
}

/** 项目知识绑定 */
export interface ProjectKnowledgeBinding {
  id: number
  projectId: number
  knowledgeSpaceId: number
  createdAt: string
  updatedAt: string
}

/** 项目知识绑定输入 */
export interface ProjectKnowledgeBindingInput {
  projectId: number
  knowledgeSpaceId: number
}

// ============================================================
// 知识空间 API
// ============================================================

/** 列出个人知识空间（通常只有一个） */
export async function listPersonalKnowledgeSpaces(): Promise<KnowledgeSpace[]> {
  return await invoke<KnowledgeSpace[]>('list_personal_knowledge_spaces')
}

/** 列出某项目对应的知识空间 */
export async function listProjectKnowledgeSpaces(
  projectId: number,
): Promise<KnowledgeSpace[]> {
  return await invoke<KnowledgeSpace[]>('list_project_knowledge_spaces', {
    projectId,
  })
}

/** 获取单个知识空间 */
export async function getKnowledgeSpace(id: number): Promise<KnowledgeSpace | null> {
  return await invoke<KnowledgeSpace | null>('get_knowledge_space', { id })
}

/** 创建新的知识空间 */
export async function createKnowledgeSpace(
  input: KnowledgeSpaceInput,
): Promise<KnowledgeSpace> {
  return await invoke<KnowledgeSpace>('create_knowledge_space', { input })
}

/** 删除知识空间（需要先解绑所有项目） */
export async function deleteKnowledgeSpace(id: number): Promise<boolean> {
  return await invoke<boolean>('delete_knowledge_space', { id })
}

// ============================================================
// 项目知识绑定 API
// ============================================================

/** 列出某项目的所有绑定 */
export async function listProjectBindings(
  projectId: number,
): Promise<ProjectKnowledgeBinding[]> {
  return await invoke<ProjectKnowledgeBinding[]>('list_project_bindings', {
    projectId,
  })
}

/** 列出某知识空间的所有绑定 */
export async function listSpaceBindings(
  spaceId: number,
): Promise<ProjectKnowledgeBinding[]> {
  return await invoke<ProjectKnowledgeBinding[]>('list_space_bindings', {
    spaceId,
  })
}

/** 创建绑定 */
export async function createBinding(
  input: ProjectKnowledgeBindingInput,
): Promise<ProjectKnowledgeBinding> {
  return await invoke<ProjectKnowledgeBinding>('create_binding', { input })
}

/** 解绑项目与知识空间 */
export async function deleteBinding(
  projectId: number,
  spaceId: number,
): Promise<boolean> {
  return await invoke<boolean>('delete_binding', { projectId, spaceId })
}

/** 解绑项目的所有绑定 */
export async function deleteAllProjectBindings(
  projectId: number,
): Promise<boolean> {
  return await invoke<boolean>('delete_all_project_bindings', { projectId })
}
