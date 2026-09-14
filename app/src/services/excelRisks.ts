/**
 * PMTool V2.0 · 项目风险登记册 sheet ↔ project_issues Excel 导入导出
 * 2026-09-11 · 按新模板字段重造
 *
 * 列头：序号 / 风险描述 / 等级 / 发现时间 / 风险对项目推进可能产生的影响 /
 *        风险应对方案 / 相关人员 / 当前风险应对情况说明 / 风险状态
 * 列头动态定位（首个含「序号/编号」的行），容忍模板首行为空。
 * 日期：读取 cellDates=true → 日期单元格为 Date 对象，无需 Excel 序列号换算。
 */

import * as XLSX from 'xlsx'
import { formatLocalDate } from './datetime'
import { loadTemplate, getSheet, sheetNameOf, applyPatchesToTemplate } from './templateWriter'
import { fillRisk } from './excelFiller'

export interface ProjectIssue {
  id: number
  project_id: number
  title: string
  description: string | null
  level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  owner: string | null
  plan_date: string | null
  actual_date: string | null
  discovered_at: string | null
  solution: string | null
  resolution: string | null
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'
  created_at: string
  updated_at: string
}

const SHEET_NAME = '项目风险登记册'

function normalizeHeader(s: string): string {
  return String(s).replace(/[\s\n\r\t]+/g, '')
}

function toStr(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s ? s : null
}

/** 日期 → 本地 YYYY-MM-DD（Date 对象或 YYYY-MM-DD 字符串）*/
function toDate(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  if (v instanceof Date) {
    return isNaN(v.getTime()) ? null : formatLocalDate(v)
  }
  if (typeof v === 'string') {
    const s = v.trim()
    if (!s) return null
    const m = s.match(/^\d{4}-\d{2}-\d{2}/)
    return m ? m[0] : null
  }
  return null
}

function mapLevel(v: unknown): ProjectIssue['level'] {
  const t = toStr(v)
  if (!t) return 'MEDIUM'
  const s = t.toLowerCase()
  if (s === '低' || s === 'low') return 'LOW'
  if (s === '中' || s === 'medium' || s === 'mid') return 'MEDIUM'
  if (s === '高' || s === 'high') return 'HIGH'
  if (s === '严重' || s === 'critical' || s === 'urgent') return 'CRITICAL'
  return 'MEDIUM'
}

export function levelToCN(level: ProjectIssue['level']): string {
  switch (level) {
    case 'LOW': return '低'
    case 'MEDIUM': return '中'
    case 'HIGH': return '高'
    case 'CRITICAL': return '严重'
    default: return '中'
  }
}

function mapStatus(v: unknown): ProjectIssue['status'] {
  const t = toStr(v)
  if (!t) return 'OPEN'
  const s = t.toLowerCase()
  if (s === '待应对' || s === '未处理' || s === '未解决' || s === 'open') return 'OPEN'
  if (s === '应对中' || s === '处理中' || s === 'in_progress' || s === 'inprogress' || s === 'in progress') return 'IN_PROGRESS'
  if (s === '已应对' || s === '已解决' || s === 'resolved') return 'RESOLVED'
  if (s === '已关闭' || s === '关闭' || s === 'closed') return 'CLOSED'
  return 'OPEN'
}

export function statusToCN(status: ProjectIssue['status']): string {
  switch (status) {
    case 'OPEN': return '待应对'
    case 'IN_PROGRESS': return '应对中'
    case 'RESOLVED': return '已应对'
    case 'CLOSED': return '已关闭'
    default: return status
  }
}

function locateHeader(sheet: XLSX.WorkSheet): {
  row: number
  headerMap: Record<string, number>
} {
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1')
  for (let r = range.s.r; r <= range.e.r; r++) {
    const headerMap: Record<string, number> = {}
    let nonEmpty = 0
    for (let c = range.s.c; c <= range.e.c; c++) {
      const key = normalizeHeader(String(sheet[XLSX.utils.encode_cell({ r, c })]?.v ?? ''))
      if (key) {
        nonEmpty++
        if (!(key in headerMap)) headerMap[key] = c
      }
    }
    const keys = Object.keys(headerMap)
    if (keys.some((k) => k === '序号' || k === '编号') && nonEmpty >= 2) {
      return { row: r, headerMap }
    }
  }
  return { row: range.s.r, headerMap: {} }
}

function findCol(headerMap: Record<string, number>, needles: string[]): number | null {
  for (const [key, c] of Object.entries(headerMap)) {
    for (const n of needles) {
      if (key.includes(n)) return c
    }
  }
  return null
}

function cellAt(sheet: XLSX.WorkSheet, r: number, c: number | null): unknown {
  if (c === null) return ''
  return sheet[XLSX.utils.encode_cell({ r, c })]?.v ?? ''
}

/** 解析项目风险登记册 sheet → ProjectIssue[] */
export async function parseRisksExcel(
  file: File,
  projectId: number,
): Promise<ProjectIssue[]> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })
  const sheet = wb.Sheets[SHEET_NAME]
  if (!sheet) throw new Error(`Sheet "${SHEET_NAME}" 不存在`)

  const { row: hr, headerMap } = locateHeader(sheet)
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1')

  const cTitle = findCol(headerMap, ['风险描述', '描述'])
  const cLevel = findCol(headerMap, ['等级'])
  const cFound = findCol(headerMap, ['发现时间'])
  const cImpact = findCol(headerMap, ['影响'])
  const cPlan = findCol(headerMap, ['应对方案'])
  const cOwner = findCol(headerMap, ['相关人员', '人员'])
  const cResolution = findCol(headerMap, ['当前风险应对情况', '当前应对情况', '应对情况'])
  const cStatus = findCol(headerMap, ['风险状态', '状态'])
  const cSeq = findCol(headerMap, ['序号'])

  const result: ProjectIssue[] = []
  for (let r = hr; r <= range.e.r; r++) {
    if (r === hr) continue
    const title = toStr(cellAt(sheet, r, cTitle))
    const seq = toStr(cellAt(sheet, r, cSeq))
    if (!title && !seq) continue

    const foundRaw = toDate(cellAt(sheet, r, cFound))
    result.push({
      id: 0,
      project_id: projectId,
      title: title ?? '',
      description: toStr(cellAt(sheet, r, cImpact)),
      level: mapLevel(cellAt(sheet, r, cLevel)),
      owner: toStr(cellAt(sheet, r, cOwner)),
      plan_date: null,
      actual_date: null,
      discovered_at: foundRaw,
      solution: toStr(cellAt(sheet, r, cPlan)),
      resolution: toStr(cellAt(sheet, r, cResolution)),
      status: mapStatus(cellAt(sheet, r, cStatus)),
      created_at: foundRaw ?? formatLocalDate(new Date()),
      updated_at: '',
    })
  }
  return result
}

function issueToExcelRow(issue: ProjectIssue): Record<string, unknown> {
  return {
    序号: issue.id ? issue.id : '',
    风险描述: issue.title,
    等级: levelToCN(issue.level),
    发现时间: (issue.discovered_at ?? issue.created_at) || '',
    风险对项目推进可能产生的影响: issue.description ?? '',
    风险应对方案: issue.solution ?? '',
    相关人员: issue.owner ?? '',
    当前风险应对情况说明: issue.resolution ?? '',
    当前状态: statusToCN(issue.status),
  }
}

export async function exportRisksToExcel(
  issues: ProjectIssue[],
): Promise<Blob> {
  // 保真导出：整本模板 + 仅填「项目风险登记册」，公式/样式/条件格式全保留
  const wb = await loadTemplate()
  const ws = getSheet(wb, '风险')
  const patches = fillRisk(ws, issues)
  return applyPatchesToTemplate([{ sheetName: sheetNameOf(wb, '风险'), patches }])
}