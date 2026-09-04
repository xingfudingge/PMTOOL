/**
 * PMTool V2.0 · Reports Service 层（WebView）
 * 维护者 2026-08-25 · 报告中心重构
 *
 * 数据源：reports 表（schema 0003 + period 列）
 *  - type: 'DAILY' | 'WEEKLY' | 'MONTHLY'
 *  - project_id: NULL = 个人报告，有值 = 项目报告
 *  - period: 'YYYY-MM-DD' | 'YYYY-Www' | 'YYYY-MM'
 *  - generate_type: 'MANUAL' | 'AUTO' | 'AI'
 *  - status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
 */

import { invoke } from '@tauri-apps/api/core'
import type { Report, ReportType, ReportGenerateType } from '@/database/api'

/**
 * 列出报告（按 type / projectId 过滤 · 不带 period）
 *  - projectId === undefined：全部
 *  - projectId === null：仅个人报告
 *  - projectId === number：仅该项目报告
 */
export async function listReports(filter?: {
  reportType?: ReportType
  projectId?: number | null
}): Promise<Report[]> {
  return invoke<Report[]>('list_reports', {
    reportType: filter?.reportType ?? null,
    projectId: filter?.projectId === undefined ? null : filter.projectId,
  })
}

/**
 * 获取单个报告
 */
export async function getReport(id: number): Promise<Report | null> {
  return invoke<Report | null>('get_report', { id })
}

/**
 * 创建或覆盖报告（同 type+project_id+period 已存在则 UPDATE）
 *  - 维护者原话："一天一个日报 · 重新生成就覆盖之前的"
 */
export async function createReport(input: {
  reportType: ReportType
  projectId?: number | null
  title: string
  content: string
  generateType?: ReportGenerateType
  period: string
}): Promise<number> {
  return invoke<number>('create_report', {
    report: {
      reportType: input.reportType,
      projectId: input.projectId ?? null,
      title: input.title,
      content: input.content,
      generateType: input.generateType ?? 'MANUAL',
      period: input.period,
    },
  })
}

/**
 * 更新报告（编辑时用）
 */
export async function updateReport(
  id: number,
  title: string,
  content: string,
): Promise<boolean> {
  return invoke<boolean>('update_report', { id, title, content })
}

/**
 * 删除报告
 */
export async function deleteReport(id: number): Promise<boolean> {
  return invoke<boolean>('delete_report', { id })
}