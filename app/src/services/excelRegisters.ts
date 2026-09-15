/**
 * PMTool V2.0 · 需求登记册 / 问题登记册 / 其他待办事项 Excel 导入导出
 * 2026-09-11 · 登记册体系
 *
 * 三个 sheet 与风险登记册同构：首个含「序号/编号」的为列头行，其后为数据行。
 * 列头动态定位，容忍模板首行为空；空数据行跳过。
 * 日期：读取 cellDates=true → 日期单元格为 Date 对象，无需 Excel 序列号换算。
 */

import * as XLSX from 'xlsx'
import { formatLocalDate } from './datetime'
import { loadTemplate, getSheet, sheetNameOf, applyPatchesToTemplate } from './templateWriter'
import { fillReq, fillIssueLog, fillTodo } from './excelFiller'
import type { ProjectRequirement } from './projectRequirements'
import type { ProjectIssueLog } from './projectIssueLog'
import type { ProjectTodoItem } from './projectTodoItems'

// ============================================================
// 共享 helpers
// ============================================================

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

/** 定位首个含「序号/编号」的列头行（normalized->colIndex）*/
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

async function fileToSheet(file: File, sheetName: string, keyword?: string): Promise<XLSX.WorkSheet> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })
  const sheet = keyword ? wb.Sheets[wb.SheetNames.find((n) => n.includes(keyword)) ?? ''] : wb.Sheets[sheetName]
  if (!sheet) throw new Error(`Sheet "${sheetName}" 不存在`)
  return sheet
}

function toBook(rows: Record<string, unknown>[], name: string): Blob {
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, name)
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  return new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

// ============================================================
// 需求登记册
// ============================================================

const REQ_SHEET = '需求登记册'

function reqStatusFromCN(v: unknown): string {
  const t = toStr(v)
  if (!t) return 'PENDING'
  const s = t.toLowerCase()
  // 模板下拉合法值：待设计/设计中/待开发/开发中/已完成（维护者 2026-09-15 对齐）
  if (s === '待响应' || s === '待设计' || s === 'pending') return 'PENDING'
  if (s === '评估中' || s === '设计中' || s === 'evaluating') return 'EVALUATING'
  if (s === '已确认' || s === '待开发' || s === 'confirmed') return 'CONFIRMED'
  if (s === '已实现' || s === '已完成' || s === '开发中' || s === 'implemented') return 'IMPLEMENTED'
  if (s === '已拒绝' || s === 'rejected') return 'REJECTED'
  return 'PENDING'
}

function reqStatusToCN(s: string): string {
  switch (s) {
    case 'PENDING': return '待设计'
    case 'EVALUATING': return '设计中'
    case 'CONFIRMED': return '待开发'
    case 'IMPLEMENTED': return '已完成'
    case 'REJECTED': return '待设计'
    default: return '待设计'
  }
}

export async function parseRequirementsExcel(file: File, projectId: number): Promise<ProjectRequirement[]> {
  const sheet = await fileToSheet(file, REQ_SHEET)
  const { row: hr, headerMap } = locateHeader(sheet)
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1')
  const cType = findCol(headerMap, ['需求类型', '类型'])
  const cSystem = findCol(headerMap, ['归属系统', '系统'])
  const cSummary = findCol(headerMap, ['需求简述', '简述'])
  const cDetail = findCol(headerMap, ['需求详述', '详述'])
  const cProposed = findCol(headerMap, ['提出时间'])
  const cProposer = findCol(headerMap, ['提出人'])
  const cStatus = findCol(headerMap, ['需求响应状态', '响应状态'])
  const cSeq = findCol(headerMap, ['序号'])

  const out: ProjectRequirement[] = []
  for (let r = hr; r <= range.e.r; r++) {
    if (r === hr) continue
    const summary = toStr(cellAt(sheet, r, cSummary))
    const seq = toStr(cellAt(sheet, r, cSeq))
    if (!summary && !seq) continue
    out.push({
      id: 0,
      project_id: projectId,
      type: toStr(cellAt(sheet, r, cType)) ?? 'NEW',
      system: toStr(cellAt(sheet, r, cSystem)),
      summary: summary ?? '',
      detail: toStr(cellAt(sheet, r, cDetail)),
      proposed_at: toDate(cellAt(sheet, r, cProposed)),
      proposer: toStr(cellAt(sheet, r, cProposer)),
      status: reqStatusFromCN(cellAt(sheet, r, cStatus)),
      created_at: '',
      updated_at: '',
    })
  }
  return out
}

export async function exportRequirementsToExcel(reqs: ProjectRequirement[]): Promise<Blob> {
  const wb = await loadTemplate()
  const ws = getSheet(wb, '需求登记册')
  const patches = fillReq(ws, reqs)
  return applyPatchesToTemplate([{ sheetName: sheetNameOf(wb, '需求登记册'), patches }])
}

// ============================================================
// 问题登记册
// ============================================================

const ISSUE_SHEET = '问题登记册'

function issStatusFromCN(v: unknown): string {
  const t = toStr(v)
  if (!t) return 'OPEN'
  const s = t.toLowerCase()
  if (s === '待处理' || s === '未解决' || s === '未处理' || s === 'open') return 'OPEN'
  if (s === '处理中' || s === 'in_progress' || s === 'inprogress') return 'IN_PROGRESS'
  if (s === '已解决' || s === 'resolved') return 'RESOLVED'
  if (s === '已关闭' || s === 'closed') return 'CLOSED'
  // 兼容「是否已处理」列：是/已/已完成 → 已关闭，否/未 → 待处理
  if (['是', '已', '已完成', '已处理'].includes(s)) return 'CLOSED'
  if (['否', '未'].includes(s)) return 'OPEN'
  return 'OPEN'
}

function issStatusToCN(s: string): string {
  // 模板下拉仅 处理中/已处理，非已处理态归并入“处理中”
  switch (s) {
    case 'OPEN':
    case 'IN_PROGRESS': return '处理中'
    case 'RESOLVED':
    case 'CLOSED': return '已处理'
    default: return '处理中'
  }
}

export async function parseIssueLogExcel(file: File, projectId: number): Promise<ProjectIssueLog[]> {
  const sheet = await fileToSheet(file, ISSUE_SHEET)
  const { row: hr, headerMap } = locateHeader(sheet)
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1')
  const cTitle = findCol(headerMap, ['问题描述', '描述'])
  const cProposer = findCol(headerMap, ['提出人'])
  const cModule = findCol(headerMap, ['涉及系统及模块', '模块'])
  const cFound = findCol(headerMap, ['发现时间'])
  const cPlan = findCol(headerMap, ['计划解决时间'])
  const cPlanSol = findCol(headerMap, ['计划解决方案'])
  const cHandler = findCol(headerMap, ['问题处理人', '处理人'])
  const cProgress = findCol(headerMap, ['当前处理进度', '处理进度'])
  const cActual = findCol(headerMap, ['实际处理时间'])
  const cStatus = findCol(headerMap, ['问题状态', '是否已处理', '是否处理'])
  const cSeq = findCol(headerMap, ['序号'])
  const out: ProjectIssueLog[] = []
  for (let r = hr; r <= range.e.r; r++) {
    if (r === hr) continue
    const title = toStr(cellAt(sheet, r, cTitle))
    const seq = toStr(cellAt(sheet, r, cSeq))
    if (!title && !seq) continue
    out.push({
      id: 0,
      project_id: projectId,
      title: title ?? '',
      proposer: toStr(cellAt(sheet, r, cProposer)),
      module: toStr(cellAt(sheet, r, cModule)),
      discovered_at: toDate(cellAt(sheet, r, cFound)),
      plan_date: toDate(cellAt(sheet, r, cPlan)),
      plan_solution: toStr(cellAt(sheet, r, cPlanSol)),
      handler: toStr(cellAt(sheet, r, cHandler)),
      progress_note: toStr(cellAt(sheet, r, cProgress)),
      actual_date: toDate(cellAt(sheet, r, cActual)),
      status: issStatusFromCN(cellAt(sheet, r, cStatus)),
      created_at: '',
      updated_at: '',
    })
  }
  return out
}

export async function exportIssueLogToExcel(items: ProjectIssueLog[]): Promise<Blob> {
  const wb = await loadTemplate()
  const ws = getSheet(wb, '问题登记册')
  const patches = fillIssueLog(ws, items)
  return applyPatchesToTemplate([{ sheetName: sheetNameOf(wb, '问题登记册'), patches }])
}

// ============================================================
// 其他待办事项
// ============================================================

const TODO_SHEET = '其他待办事项'

function todoStatusFromCN(v: unknown): string {
  const t = toStr(v)
  if (!t) return 'PENDING'
  const s = t.toLowerCase()
  if (s === '待办' || s === '未开始' || s === '未完成' || s === 'pending') return 'PENDING'
  if (s === '进行中' || s === 'in_progress' || s === 'inprogress') return 'IN_PROGRESS'
  if (s === '已完成' || s === 'completed' || s === '完成') return 'COMPLETED'
  if (s === '已逾期' || s === '延期' || s === 'delayed') return 'DELAYED'
  return 'PENDING'
}

function todoStatusToCN(s: string): string {
  // 模板下拉仅 已完成/未完成，非完成态归并入“未完成”
  switch (s) {
    case 'COMPLETED': return '已完成'
    default: return '未完成'
  }
}

export async function parseTodoItemsExcel(file: File, projectId: number): Promise<ProjectTodoItem[]> {
  const sheet = await fileToSheet(file, TODO_SHEET, '办')
  const { row: hr, headerMap } = locateHeader(sheet)
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1')
  const cContent = findCol(headerMap, ['代办事项说明', '事项说明', '说明'])
  const cPeople = findCol(headerMap, ['涉及人员', '人员'])
  const cPlan = findCol(headerMap, ['计划完成时间'])
  const cNote = findCol(headerMap, ['当前完成情况', '完成情况'])
  const cActual = findCol(headerMap, ['实际完成时间'])
  const cStatus = findCol(headerMap, ['任务状态'])
  const cRemark = findCol(headerMap, ['备注'])
  const cSeq = findCol(headerMap, ['编号'])
  const out: ProjectTodoItem[] = []
  for (let r = hr; r <= range.e.r; r++) {
    if (r === hr) continue
    const content = toStr(cellAt(sheet, r, cContent))
    const seq = toStr(cellAt(sheet, r, cSeq))
    if (!content && !seq) continue
    out.push({
      id: 0,
      project_id: projectId,
      content: content ?? '',
      related_people: toStr(cellAt(sheet, r, cPeople)),
      plan_date: toDate(cellAt(sheet, r, cPlan)),
      completion_note: toStr(cellAt(sheet, r, cNote)),
      actual_date: toDate(cellAt(sheet, r, cActual)),
      status: todoStatusFromCN(cellAt(sheet, r, cStatus)),
      remark: toStr(cellAt(sheet, r, cRemark)),
      created_at: '',
      updated_at: '',
    })
  }
  return out
}

export async function exportTodoItemsToExcel(items: ProjectTodoItem[]): Promise<Blob> {
  const wb = await loadTemplate()
  const ws = getSheet(wb, '待办')
  const patches = fillTodo(ws, items)
  return applyPatchesToTemplate([{ sheetName: sheetNameOf(wb, '待办'), patches }])
}