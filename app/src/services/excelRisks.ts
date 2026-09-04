/**
 * PMTool V2.0 · 项目风险登记册 sheet ↔ project_issues Excel 导入导出
 * Phase 4 · 维护者 2026-08-26
 *
 * 设计依据：
 *   - 模板 app/src/assets/templates/pmtool_project_template.xlsx
 *   - sheet 名「项目风险登记册」
 *   - 第 1 行（0-indexed row 0）为列头
 *   - 列头：序号 / 描述 / 发现时间 / 处理方法 / 等级 / 解计划决时间 / 责任人 /
 *     实际划决时间 / 解决情况
 *
 * 关键设计选择：
 *   1. 模板里「计划解决时间」写作「解计划决时间」、「实际解决时间」写作「实际划决时间」，
 *      列名解析做双 fallback
 *   2. 等级映射「低/中/高/严重」+ 英文别名 → LOW/MEDIUM/HIGH/CRITICAL，默认 MEDIUM
 *   3. 状态推断：actual_date 非空 → RESOLVED；否则 OPEN
 *   4. created_at 从发现时间（Excel 日期）推导
 */

import * as XLSX from 'xlsx'
import { formatLocalDate } from './datetime'

// ============================================================
// 类型（与 services/projectIssues.ts 的 ProjectIssue 对齐）
// ============================================================

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
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED'
  created_at: string
  updated_at: string
}

// ============================================================
// 常量
// ============================================================

/** Sheet 名（与模板完全一致）*/
const SHEET_NAME = '项目风险登记册'

/** 列头所在的行（0-indexed = row 0 = 1-indexed 第 1 行）*/
const HEADER_ROW = 0

/**
 列名候选（支持模板里多种写法 + 用户期望的标准写法）
  - "计划解决时间" 标准
  - "解计划决时间" 模板里的错别字
  - "实际解决时间" 标准
  - "实际划决时间" 模板里的错别字
 */
const COL = {
  serial: ['序号'],
  description: ['描述'],
  foundDate: ['发现时间'],
  solutionMethod: ['处理方法'],
  level: ['等级'],
  planDate: ['计划解决时间', '解计划决时间'],
  owner: ['责任人'],
  actualDate: ['实际解决时间', '实际划决时间'],
  resolution: ['解决情况'],
} as const

// ============================================================
// 内部 helpers
// ============================================================

/** 规范化列头（去换行/空格）*/
function normalizeHeader(s: string): string {
  return String(s).replace(/[\s\n\r\t]+/g, '')
}

function toStr(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s ? s : null
}

/** Excel 序列日期 → 本地 YYYY-MM-DD */
function excelSerialToLocalDate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : formatLocalDate(value)
  }
  if (typeof value === 'number') {
    if (!isFinite(value) || value <= 0) return null
    return formatLocalDate(new Date(Math.round((value - 25569) * 86400 * 1000)))
  }
  if (typeof value === 'string') {
    const s = value.trim()
    if (!s) return null
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
    const n = Number(s)
    if (isFinite(n) && n > 0) {
      return formatLocalDate(new Date(Math.round((n - 25569) * 86400 * 1000)))
    }
    const d = new Date(s)
    if (!isNaN(d.getTime())) return formatLocalDate(d)
  }
  return null
}

/**
 * 等级映射：中文「低/中/高/严重」+ 英文别名 → LOW/MEDIUM/HIGH/CRITICAL
 * 默认 MEDIUM
 */
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

/**
 * 状态推断：
 * - actual_date 非空 → RESOLVED
 * - plan_date 存在但 actual_date 为空 → IN_PROGRESS
 * - 其它 → OPEN
 */
function inferStatus(
  planDate: string | null,
  actualDate: string | null,
): ProjectIssue['status'] {
  if (actualDate) return 'RESOLVED'
  if (planDate) return 'IN_PROGRESS'
  return 'OPEN'
}

/**
 * 取第一个命中的列值（支持错别字 fallback）
 */
function pickField(row: Record<string, unknown>, candidates: readonly string[]): unknown {
  for (const name of candidates) {
    if (name in row) return row[name]
    const norm = normalizeHeader(name)
    if (norm in row) return row[norm]
  }
  return ''
}

/**
 * 直接从 sheet 单元格读取（行 0 是列头）
 */
function readSheetAsRows(sheet: XLSX.WorkSheet): Record<string, unknown>[] {
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1')
  // 列头映射（规范化）
  const headerMap: Record<string, number> = {}
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = sheet[XLSX.utils.encode_cell({ r: HEADER_ROW, c })]
    if (!cell) continue
    const key = normalizeHeader(String(cell.v))
    if (key && !(key in headerMap)) {
      headerMap[key] = c
    }
  }
  // 数据行
  const rows: Record<string, unknown>[] = []
  for (let r = HEADER_ROW + 1; r <= range.e.r; r++) {
    const rowObj: Record<string, unknown> = {}
    for (const [key, c] of Object.entries(headerMap)) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })]
      rowObj[key] = cell ? cell.v : ''
    }
    rows.push(rowObj)
  }
  return rows
}

// ============================================================
// 公开 API
// ============================================================

/** 解析项目风险登记册 sheet → ProjectIssue[] */
export async function parseRisksExcel(
  file: File,
  projectId: number,
): Promise<ProjectIssue[]> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const sheet = wb.Sheets[SHEET_NAME]
  if (!sheet) {
    throw new Error(`Sheet "${SHEET_NAME}" 不存在（模板应为 6 个 sheet）`)
  }

  const rows = readSheetAsRows(sheet)
  const result: ProjectIssue[] = []

  rows.forEach((row) => {
    const title = toStr(pickField(row, COL.description))
    // 描述为空 + 序号为空 → 跳过
    if (!title && !toStr(pickField(row, COL.serial))) return

    const planDate = excelSerialToLocalDate(pickField(row, COL.planDate))
    const actualDate = excelSerialToLocalDate(pickField(row, COL.actualDate))
    const foundDateRaw = excelSerialToLocalDate(pickField(row, COL.foundDate))
    // created_at 优先用发现时间，否则用当前日期
    const createdAt = foundDateRaw ?? formatLocalDate(new Date())

    const level = mapLevel(pickField(row, COL.level))
    const status = inferStatus(planDate, actualDate)

    result.push({
      id: 0, // 占位
      project_id: projectId,
      title: title ?? '', // title 必填；缺失则空字符串
      description: toStr(pickField(row, COL.solutionMethod)),
      level,
      owner: toStr(pickField(row, COL.owner)),
      plan_date: planDate,
      actual_date: actualDate,
      discovered_at: foundDateRaw,
      solution: toStr(pickField(row, COL.resolution)),
      status,
      created_at: createdAt,
      updated_at: '',
    })
  })

  return result
}

/** ProjectIssue → Excel 行 */
function issueToExcelRow(issue: ProjectIssue): Record<string, unknown> {
  return {
    序号: issue.id > 0 ? issue.id : '',
    描述: issue.title,
    发现时间: issue.created_at,
    处理方法: issue.description ?? '',
    等级: levelToCN(issue.level),
    计划解决时间: issue.plan_date ?? '',
    责任人: issue.owner ?? '',
    实际解决时间: issue.actual_date ?? '',
    解决情况: issue.solution ?? '',
  }
}

/** 等级枚举 → 中文 */
function levelToCN(level: ProjectIssue['level']): string {
  switch (level) {
    case 'LOW':
      return '低'
    case 'MEDIUM':
      return '中'
    case 'HIGH':
      return '高'
    case 'CRITICAL':
      return '严重'
    default:
      return '中'
  }
}

/** 导出 ProjectIssue[] → Excel Blob */
export async function exportRisksToExcel(
  issues: ProjectIssue[],
): Promise<Blob> {
  const data = issues.map(issueToExcelRow)
  const ws = XLSX.utils.json_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, SHEET_NAME)
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  return new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}