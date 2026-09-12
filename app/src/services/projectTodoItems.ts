/**
 * PMTool V2.0 · Project Todo Items WebView 端 Service
 * 2026-09-11 · 其他待办事项登记册
 */

import { invoke } from '@tauri-apps/api/core'

export interface ProjectTodoItem {
  id: number
  project_id: number
  content: string // 代办事项说明（必填）
  related_people: string | null // 涉及人员（软件）
  plan_date: string | null // 计划完成时间
  completion_note: string | null // 当前完成情况说明
  actual_date: string | null // 实际完成时间
  status: string // PENDING/IN_PROGRESS/COMPLETED/DELAYED
  remark: string | null // 备注
  created_at: string
  updated_at: string
}

export interface NewTodoItem {
  project_id: number
  content: string
  related_people?: string | null
  plan_date?: string | null
  completion_note?: string | null
  actual_date?: string | null
  status?: string
  remark?: string | null
}

export async function listProjectTodoItems(
  projectId: number,
): Promise<ProjectTodoItem[]> {
  return invoke<ProjectTodoItem[]>('list_project_todo_items', { projectId })
}

export async function getProjectTodoItem(id: number): Promise<ProjectTodoItem | null> {
  return invoke<ProjectTodoItem | null>('get_project_todo_item', { id })
}

export async function createProjectTodoItem(item: NewTodoItem): Promise<number> {
  const full: ProjectTodoItem = {
    id: 0,
    project_id: item.project_id,
    content: item.content,
    related_people: item.related_people ?? null,
    plan_date: item.plan_date ?? null,
    completion_note: item.completion_note ?? null,
    actual_date: item.actual_date ?? null,
    status: item.status ?? 'PENDING',
    remark: item.remark ?? null,
    created_at: '',
    updated_at: '',
  }
  return invoke<number>('create_project_todo_item', { item: full })
}

export async function updateProjectTodoItem(
  id: number,
  patch: Partial<NewTodoItem> & { status?: string },
): Promise<boolean> {
  const existing = await getProjectTodoItem(id)
  if (!existing) return false
  const full: ProjectTodoItem = {
    ...existing,
    content: patch.content === undefined ? existing.content : patch.content,
    related_people: patch.related_people !== undefined ? patch.related_people : existing.related_people,
    plan_date: patch.plan_date !== undefined ? patch.plan_date : existing.plan_date,
    completion_note: patch.completion_note !== undefined ? patch.completion_note : existing.completion_note,
    actual_date: patch.actual_date !== undefined ? patch.actual_date : existing.actual_date,
    status: patch.status ?? existing.status,
    remark: patch.remark !== undefined ? patch.remark : existing.remark,
  }
  return invoke<boolean>('update_project_todo_item', { id, item: full })
}

export async function deleteProjectTodoItem(id: number): Promise<boolean> {
  return invoke<boolean>('delete_project_todo_item', { id })
}