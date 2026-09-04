/**
 * PMTool V2.0 · 周报条目 WebView 端 Service
 * Phase 5 · 2026-08-26 维护者拍板
 *
 * 架构：WebView → invoke(...) → commands::weekly_entries → Rust service
 */

import { invoke } from '@tauri-apps/api/core'

export interface WeeklyReportEntry {
  id: number
  project_id: number
  week_number: number
  week_start_date: string
  week_end_date: string
  task_name: string
  plan_start_date: string | null
  plan_end_date: string | null
  actual_start_date: string | null
  actual_end_date: string | null
  owner_party_a: string | null
  owner_party_b: string | null
  completion_note: string | null
  is_completed: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED'
  section: 'CURRENT' | 'NEXT'
  sort_order: number
  created_at: string
  updated_at: string
}

export interface NewWeeklyEntry {
  project_id: number
  week_number: number
  week_start_date: string
  week_end_date: string
  task_name: string
  plan_start_date?: string | null
  plan_end_date?: string | null
  actual_start_date?: string | null
  actual_end_date?: string | null
  owner_party_a?: string | null
  owner_party_b?: string | null
  completion_note?: string | null
  is_completed?: WeeklyReportEntry['is_completed']
  section?: WeeklyReportEntry['section']
  sort_order?: number
}

export async function listWeeklyEntries(projectId: number): Promise<WeeklyReportEntry[]> {
  return invoke<WeeklyReportEntry[]>('list_weekly_entries', { projectId })
}

export async function getWeeklyEntry(id: number): Promise<WeeklyReportEntry | null> {
  return invoke<WeeklyReportEntry | null>('get_weekly_entry', { id })
}

export async function createWeeklyEntry(input: NewWeeklyEntry): Promise<number> {
  const fullEntry: WeeklyReportEntry = {
    id: 0,
    project_id: input.project_id,
    week_number: input.week_number,
    week_start_date: input.week_start_date,
    week_end_date: input.week_end_date,
    task_name: input.task_name,
    plan_start_date: input.plan_start_date ?? null,
    plan_end_date: input.plan_end_date ?? null,
    actual_start_date: input.actual_start_date ?? null,
    actual_end_date: input.actual_end_date ?? null,
    owner_party_a: input.owner_party_a ?? null,
    owner_party_b: input.owner_party_b ?? null,
    completion_note: input.completion_note ?? null,
    is_completed: input.is_completed ?? 'PENDING',
    section: input.section ?? 'CURRENT',
    sort_order: input.sort_order ?? 0,
    created_at: '',
    updated_at: '',
  }
  return invoke<number>('create_weekly_entry', { entry: fullEntry })
}

export async function updateWeeklyEntry(
  id: number,
  patch: Partial<NewWeeklyEntry>,
): Promise<boolean> {
  const existing = await getWeeklyEntry(id)
  if (!existing) return false
  const fullEntry: WeeklyReportEntry = {
    ...existing,
    week_number: patch.week_number ?? existing.week_number,
    week_start_date: patch.week_start_date ?? existing.week_start_date,
    week_end_date: patch.week_end_date ?? existing.week_end_date,
    task_name: patch.task_name ?? existing.task_name,
    plan_start_date:
      patch.plan_start_date !== undefined ? patch.plan_start_date : existing.plan_start_date,
    plan_end_date: patch.plan_end_date !== undefined ? patch.plan_end_date : existing.plan_end_date,
    actual_start_date:
      patch.actual_start_date !== undefined ? patch.actual_start_date : existing.actual_start_date,
    actual_end_date:
      patch.actual_end_date !== undefined ? patch.actual_end_date : existing.actual_end_date,
    owner_party_a:
      patch.owner_party_a !== undefined ? patch.owner_party_a : existing.owner_party_a,
    owner_party_b:
      patch.owner_party_b !== undefined ? patch.owner_party_b : existing.owner_party_b,
    completion_note:
      patch.completion_note !== undefined ? patch.completion_note : existing.completion_note,
    is_completed: patch.is_completed ?? existing.is_completed,
    section: patch.section ?? existing.section,
    sort_order: patch.sort_order ?? existing.sort_order,
  }
  return invoke<boolean>('update_weekly_entry', { id, entry: fullEntry })
}

export async function deleteWeeklyEntry(id: number): Promise<boolean> {
  return invoke<boolean>('delete_weekly_entry', { id })
}