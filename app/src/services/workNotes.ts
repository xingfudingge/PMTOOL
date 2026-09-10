/**
 * PMTool V2.0 · 主工作区工作notes Service
 * 2026-09-08 维护者反馈「仅本地保存显示不全」 → 改 SQLite 入库
 *
 * WebView → invoke('get_work_note' / 'save_work_note', ...) → commands::work_notes → repository
 *
 * 设计：优点 `invoke` 同步保存到数据库；localStorage 仅作本地回显缓存（不改调用方同步 API）
 */

import { invoke } from '@tauri-apps/api/core'

export interface WorkNote {
  id: number
  note_date: string      // YYYY-MM-DD
  today_content: string
  next_workday: string
  next_content: string
  created_at: string
  updated_at: string
}

/** 按日期取工作note（无则返回 null，前端回退到 localStorage 缓存）*/
export async function getWorkNote(noteDate: string): Promise<WorkNote | null> {
  return await invoke<WorkNote | null>('get_work_note', { noteDate })
}

/** 按日期保存（upsert）工作note，返回落库后的最新行 */
export async function saveWorkNote(
  noteDate: string,
  todayContent: string,
  nextWorkday: string,
  nextContent: string,
): Promise<WorkNote> {
  return await invoke<WorkNote>('save_work_note', {
    noteDate,
    todayContent,
    nextWorkday,
    nextContent,
  })
}