/**
 * PMTool V2.0 · Project Issues WebView 端 Service
 * Phase 4 · T4.8
 */

import { invoke } from '@tauri-apps/api/core'

export interface ProjectIssue {
  id: number
  project_id: number
  title: string
  description: string | null
  level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  owner: string | null
  plan_date: string | null // planned_resolve_date
  actual_date: string | null // actual_resolve_date
  discovered_at: string | null // 2026-08-26 补 · 风险首次发现时间（Excel 列「发现时间」）
  solution: string | null
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'
  created_at: string
  updated_at: string
}

export interface NewIssue {
  project_id: number
  title: string
  description?: string | null
  level?: ProjectIssue['level']
  owner?: string | null
  plan_date?: string | null
  actual_date?: string | null
  discovered_at?: string | null
  solution?: string | null
  status?: ProjectIssue['status']
}

export async function listProjectIssues(projectId: number): Promise<ProjectIssue[]> {
  return invoke<ProjectIssue[]>('list_project_issues', { projectId })
}

export async function getProjectIssue(id: number): Promise<ProjectIssue | null> {
  return invoke<ProjectIssue | null>('get_project_issue', { id })
}

export async function createProjectIssue(issue: NewIssue): Promise<number> {
  const fullIssue: ProjectIssue = {
    id: 0,
    project_id: issue.project_id,
    title: issue.title,
    description: issue.description ?? null,
    level: issue.level ?? 'MEDIUM',
    owner: issue.owner ?? null,
    plan_date: issue.plan_date ?? null,
    actual_date: issue.actual_date ?? null,
    discovered_at: issue.discovered_at ?? null,
    solution: issue.solution ?? null,
    status: issue.status ?? 'OPEN',
    created_at: '',
    updated_at: '',
  }
  return invoke<number>('create_project_issue', { issue: fullIssue })
}

export async function updateProjectIssue(
  id: number,
  patch: Partial<NewIssue> & { status?: ProjectIssue['status'] },
): Promise<boolean> {
  const existing = await getProjectIssue(id)
  if (!existing) return false
  const fullIssue: ProjectIssue = {
    ...existing,
    title: patch.title ?? existing.title,
    description: patch.description !== undefined ? patch.description : existing.description,
    level: patch.level ?? existing.level,
    owner: patch.owner !== undefined ? patch.owner : existing.owner,
    plan_date: patch.plan_date !== undefined ? patch.plan_date : existing.plan_date,
    actual_date: patch.actual_date !== undefined ? patch.actual_date : existing.actual_date,
    discovered_at: patch.discovered_at !== undefined ? patch.discovered_at : existing.discovered_at,
    solution: patch.solution !== undefined ? patch.solution : existing.solution,
    status: patch.status ?? existing.status,
  }
  return invoke<boolean>('update_project_issue', { id, issue: fullIssue })
}

export async function deleteProjectIssue(id: number): Promise<boolean> {
  return invoke<boolean>('delete_project_issue', { id })
}

/** 状态迁移合法性检查（RFC-02 §2）*/
export function isValidIssueStatusTransition(
  from: ProjectIssue['status'],
  to: ProjectIssue['status'],
): boolean {
  const transitions: Record<ProjectIssue['status'], ProjectIssue['status'][]> = {
    OPEN: ['IN_PROGRESS', 'RESOLVED'],
    IN_PROGRESS: ['RESOLVED'],
    RESOLVED: ['CLOSED', 'IN_PROGRESS'],
    CLOSED: [],
  }
  return transitions[from]?.includes(to) ?? false
}

/** 计算问题按状态统计*/
export interface IssueStats {
  open: number
  inProgress: number
  resolved: number
  closed: number
  total: number
}

export function computeIssueStats(issues: ProjectIssue[]): IssueStats {
  const stats: IssueStats = { open: 0, inProgress: 0, resolved: 0, closed: 0, total: 0 }
  for (const i of issues) {
    stats.total++
    if (i.status === 'OPEN') stats.open++
    else if (i.status === 'IN_PROGRESS') stats.inProgress++
    else if (i.status === 'RESOLVED') stats.resolved++
    else if (i.status === 'CLOSED') stats.closed++
  }
  return stats
}