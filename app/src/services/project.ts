/**
 * PMTool V2.0 · Project Service 层
 * Phase 4 · T4.1
 *
 * 架构：复用 Phase 0 commands::projects（list_projects / get_project / create_project /
 *       update_project / delete_project），业务聚合在 WebView 端
 *
 * 严格遵守 PM B1 + RFC-03 §1：禁止 WebView 直 SQL
 *
 * ⚠️ T4.7 / T4.8 已实接：
 *   - listProjectTasks / listProjectLeafTasks → commands::project_tasks
 *   - listProjectIssues → commands::project_issues
 *   - computeProjectOverallProgress → 用 listProjectLeafTasks 加权平均
 */

import { invoke } from '@tauri-apps/api/core'
import type {
  Project,
  ProjectStatus,
  ProjectPriority,
} from '@/database/api'

// 重新导出 Project 类型（services 聚合层 · pages/tests 期望从 @/services/project 引用）
export type { Project, ProjectStatus, ProjectPriority }

// ============================================================
// CRUD（透传到 Phase 0 Rust commands · 已存在）
// ============================================================

export async function listProjects(filter?: { status?: ProjectStatus }): Promise<Project[]> {
  return invoke<Project[]>('list_projects', { status: filter?.status ?? null })
}

export async function getProject(id: number): Promise<Project | null> {
  return invoke<Project | null>('get_project', { id })
}

export async function createProject(input: {
  projectCode: string
  projectName: string
  customerName?: string | null
  status?: ProjectStatus
  priority?: ProjectPriority
  owner?: string | null
  startDate?: string | null
  endDate?: string | null
  contractAmount?: number | null
  background?: string | null
  objective?: string | null
  scope?: string | null
  description?: string | null
}): Promise<number> {
  const project = {
    id: 0,
    project_code: input.projectCode,
    project_name: input.projectName,
    customer_name: input.customerName ?? null,
    status: input.status ?? 'START',
    priority: input.priority ?? 'NORMAL',
    owner: input.owner ?? null,
    start_date: input.startDate ?? null,
    end_date: input.endDate ?? null,
    contract_amount: input.contractAmount ?? null,
    background: input.background ?? null,
    objective: input.objective ?? null,
    scope: input.scope ?? null,
    description: input.description ?? null,
    created_at: '',
    updated_at: '',
  }
  return invoke<number>('create_project', { project })
}

export async function updateProject(
  id: number,
  patch: Partial<{
    projectName: string
    customerName: string | null
    status: ProjectStatus
    priority: ProjectPriority
    owner: string | null
    startDate: string | null
    endDate: string | null
    contractAmount: number | null
    background: string | null
    objective: string | null
    scope: string | null
    description: string | null
  }>,
): Promise<boolean> {
  const existing = await getProject(id)
  if (!existing) return false
  const project = {
    id,
    project_code: existing.project_code,
    project_name: patch.projectName ?? existing.project_name,
    customer_name: patch.customerName ?? existing.customer_name,
    status: patch.status ?? existing.status,
    priority: patch.priority ?? existing.priority,
    owner: patch.owner ?? existing.owner,
    start_date: patch.startDate ?? existing.start_date,
    end_date: patch.endDate ?? existing.end_date,
    contract_amount: patch.contractAmount ?? existing.contract_amount,
    background: patch.background ?? existing.background,
    objective: patch.objective ?? existing.objective,
    scope: patch.scope ?? existing.scope,
    description: patch.description ?? existing.description,
    created_at: existing.created_at,
    updated_at: existing.updated_at,
  }
  return invoke<boolean>('update_project', { id, project })
}

export async function deleteProject(id: number): Promise<boolean> {
  return invoke<boolean>('delete_project', { id })
}

// ============================================================
// 视图数据聚合（RFC-02 §2 项目进度计算）
// ============================================================

export interface ProjectProgress {
  overallProgress: number
  remainingDays: number | null
  status: ProjectStatus
  isOverdue: boolean
}

/**
 * 计算项目整体进度（RFC-02 §2 · 占位版）
 * 真实版本用 listProjectLeafTasks + 加权平均（见 services/projectTasks.computeProjectOverallProgress）
 */
export function computeProjectProgress(
  project: Project,
  today: string,
): ProjectProgress {
  const overallProgress = project.contract_amount ? 50 : 0 // Phase 4 占位
  const remainingDays = computeRemainingDays(project.end_date, today)
  const isOverdue = !!(
    project.end_date &&
    today > project.end_date &&
    project.status !== 'CLOSING'
  )
  return {
    overallProgress,
    remainingDays,
    status: project.status,
    isOverdue,
  }
}

function computeRemainingDays(endDate: string | null, today: string): number | null {
  if (!endDate) return null
  const end = new Date(endDate)
  const t = new Date(today)
  const diff = Math.ceil((end.getTime() - t.getTime()) / (1000 * 60 * 60 * 24))
  return diff >= 0 ? diff : 0
}

// ============================================================
// 项目任务 / 项目问题 · 重新导出（实接在 projectTasks / projectIssues）
// ============================================================

export {
  listProjectTasks,
  listProjectLeafTasks,
  getProjectTask,
  createProjectTask,
  updateProjectTask,
  deleteProjectTask,
  computeProjectOverallProgress,
  buildTaskTree,
  type ProjectTask,
  type NewTask,
  type TaskNode,
} from './projectTasks'

export {
  listProjectIssues,
  getProjectIssue,
  createProjectIssue,
  updateProjectIssue,
  deleteProjectIssue,
  isValidIssueStatusTransition,
  computeIssueStats,
  type ProjectIssue,
  type NewIssue,
  type IssueStats,
} from './projectIssues'
