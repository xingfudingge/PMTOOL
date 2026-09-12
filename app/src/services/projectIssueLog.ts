/**
 * PMTool V2.0 · Project Issue Log WebView 端 Service
 * 2026-09-11 · 问题登记册
 */

import { invoke } from '@tauri-apps/api/core'

export interface ProjectIssueLog {
  id: number
  project_id: number
  title: string // 问题描述（必填）
  proposer: string | null // 提出人
  module: string | null // 涉及系统及模块（参考需规）
  discovered_at: string | null // 发现时间
  plan_date: string | null // 计划解决时间
  plan_solution: string | null // 计划解决方案
  handler: string | null // 问题处理人
  progress_note: string | null // 当前处理进度说明
  actual_date: string | null // 实际处理时间
  status: string // OPEN/IN_PROGRESS/RESOLVED/CLOSED
  created_at: string
  updated_at: string
}

export interface NewIssueLog {
  project_id: number
  title: string
  proposer?: string | null
  module?: string | null
  discovered_at?: string | null
  plan_date?: string | null
  plan_solution?: string | null
  handler?: string | null
  progress_note?: string | null
  actual_date?: string | null
  status?: string
}

export async function listProjectIssueLog(
  projectId: number,
): Promise<ProjectIssueLog[]> {
  return invoke<ProjectIssueLog[]>('list_project_issue_log', { projectId })
}

export async function getProjectIssueLogEntry(id: number): Promise<ProjectIssueLog | null> {
  return invoke<ProjectIssueLog | null>('get_project_issue_log_entry', { id })
}

export async function createProjectIssueLogEntry(issue: NewIssueLog): Promise<number> {
  const full: ProjectIssueLog = {
    id: 0,
    project_id: issue.project_id,
    title: issue.title,
    proposer: issue.proposer ?? null,
    module: issue.module ?? null,
    discovered_at: issue.discovered_at ?? null,
    plan_date: issue.plan_date ?? null,
    plan_solution: issue.plan_solution ?? null,
    handler: issue.handler ?? null,
    progress_note: issue.progress_note ?? null,
    actual_date: issue.actual_date ?? null,
    status: issue.status ?? 'OPEN',
    created_at: '',
    updated_at: '',
  }
  return invoke<number>('create_project_issue_log_entry', { issue: full })
}

export async function updateProjectIssueLogEntry(
  id: number,
  patch: Partial<NewIssueLog> & { status?: string },
): Promise<boolean> {
  const existing = await getProjectIssueLogEntry(id)
  if (!existing) return false
  const full: ProjectIssueLog = {
    ...existing,
    title: patch.title === undefined ? existing.title : patch.title,
    proposer: patch.proposer !== undefined ? patch.proposer : existing.proposer,
    module: patch.module !== undefined ? patch.module : existing.module,
    discovered_at: patch.discovered_at !== undefined ? patch.discovered_at : existing.discovered_at,
    plan_date: patch.plan_date !== undefined ? patch.plan_date : existing.plan_date,
    plan_solution: patch.plan_solution !== undefined ? patch.plan_solution : existing.plan_solution,
    handler: patch.handler !== undefined ? patch.handler : existing.handler,
    progress_note: patch.progress_note !== undefined ? patch.progress_note : existing.progress_note,
    actual_date: patch.actual_date !== undefined ? patch.actual_date : existing.actual_date,
    status: patch.status ?? existing.status,
  }
  return invoke<boolean>('update_project_issue_log_entry', { id, issue: full })
}

export async function deleteProjectIssueLogEntry(id: number): Promise<boolean> {
  return invoke<boolean>('delete_project_issue_log_entry', { id })
}