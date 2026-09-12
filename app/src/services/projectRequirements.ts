/**
 * PMTool V2.0 · Project Requirements WebView 端 Service
 * 2026-09-11 · 需求登记册
 */

import { invoke } from '@tauri-apps/api/core'

export interface ProjectRequirement {
  id: number
  project_id: number
  type: string // NEW/CHANGE/OPTIMIZE/OTHER
  system: string | null
  summary: string
  detail: string | null
  proposed_at: string | null
  proposer: string | null
  status: string // PENDING/EVALUATING/CONFIRMED/IMPLEMENTED/REJECTED
  created_at: string
  updated_at: string
}

export interface NewRequirement {
  project_id: number
  type?: string
  system?: string | null
  summary: string
  detail?: string | null
  proposed_at?: string | null
  proposer?: string | null
  status?: string
}

export async function listProjectRequirements(
  projectId: number,
): Promise<ProjectRequirement[]> {
  return invoke<ProjectRequirement[]>('list_project_requirements', { projectId })
}

export async function getProjectRequirement(id: number): Promise<ProjectRequirement | null> {
  return invoke<ProjectRequirement | null>('get_project_requirement', { id })
}

export async function createProjectRequirement(req: NewRequirement): Promise<number> {
  const full: ProjectRequirement = {
    id: 0,
    project_id: req.project_id,
    type: req.type ?? 'NEW',
    system: req.system ?? null,
    summary: req.summary,
    detail: req.detail ?? null,
    proposed_at: req.proposed_at ?? null,
    proposer: req.proposer ?? null,
    status: req.status ?? 'PENDING',
    created_at: '',
    updated_at: '',
  }
  return invoke<number>('create_project_requirement', { requirement: full })
}

export async function updateProjectRequirement(
  id: number,
  patch: Partial<NewRequirement> & { status?: string },
): Promise<boolean> {
  const existing = await getProjectRequirement(id)
  if (!existing) return false
  const full: ProjectRequirement = {
    ...existing,
    type: patch.type ?? existing.type,
    system: patch.system !== undefined ? patch.system : existing.system,
    summary: patch.summary === undefined ? existing.summary : patch.summary,
    detail: patch.detail !== undefined ? patch.detail : existing.detail,
    proposed_at: patch.proposed_at !== undefined ? patch.proposed_at : existing.proposed_at,
    proposer: patch.proposer !== undefined ? patch.proposer : existing.proposer,
    status: patch.status ?? existing.status,
  }
  return invoke<boolean>('update_project_requirement', { id, requirement: full })
}

export async function deleteProjectRequirement(id: number): Promise<boolean> {
  return invoke<boolean>('delete_project_requirement', { id })
}