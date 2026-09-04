/**
 * PMTool V2.0 · 项目成员 WebView 端 Service
 * Phase 5 · 2026-08-26 维护者拍板
 *
 * 架构：WebView → invoke(...) → commands::project_members → Rust service
 */

import { invoke } from '@tauri-apps/api/core'

export interface ProjectMember {
  id: number
  project_id: number
  party: 'PARTY_A' | 'PARTY_B'
  role: string | null
  name: string
  contact: string | null
  participation: string | null // ★/★★/★★★/★★★★/★★★★★
  impact: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export interface NewProjectMember {
  project_id: number
  party: ProjectMember['party']
  role?: string | null
  name: string
  contact?: string | null
  participation?: string | null
  impact?: string | null
  sort_order?: number
}

export async function listProjectMembers(projectId: number): Promise<ProjectMember[]> {
  return invoke<ProjectMember[]>('list_project_members', { projectId })
}

export async function getProjectMember(id: number): Promise<ProjectMember | null> {
  return invoke<ProjectMember | null>('get_project_member', { id })
}

export async function createProjectMember(input: NewProjectMember): Promise<number> {
  const fullMember: ProjectMember = {
    id: 0,
    project_id: input.project_id,
    party: input.party,
    role: input.role ?? null,
    name: input.name,
    contact: input.contact ?? null,
    participation: input.participation ?? null,
    impact: input.impact ?? null,
    sort_order: input.sort_order ?? 0,
    created_at: '',
    updated_at: '',
  }
  return invoke<number>('create_project_member', { member: fullMember })
}

export async function updateProjectMember(
  id: number,
  patch: Partial<NewProjectMember>,
): Promise<boolean> {
  const existing = await getProjectMember(id)
  if (!existing) return false
  const fullMember: ProjectMember = {
    ...existing,
    party: patch.party ?? existing.party,
    role: patch.role !== undefined ? patch.role : existing.role,
    name: patch.name ?? existing.name,
    contact: patch.contact !== undefined ? patch.contact : existing.contact,
    participation:
      patch.participation !== undefined ? patch.participation : existing.participation,
    impact: patch.impact !== undefined ? patch.impact : existing.impact,
    sort_order: patch.sort_order ?? existing.sort_order,
  }
  return invoke<boolean>('update_project_member', { id, member: fullMember })
}

export async function deleteProjectMember(id: number): Promise<boolean> {
  return invoke<boolean>('delete_project_member', { id })
}