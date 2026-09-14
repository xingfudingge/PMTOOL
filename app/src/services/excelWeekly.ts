/**
 * PMTool V2.0 · 每周工作情况以及下周计划 sheet ↔ weekly_report_entries Excel 导入导出
 * Phase 4 · 维护者 2026-08-26
 *
 * 设计依据：
 *   - 模板 app/src/assets/templates/pmtool_project_template.xlsx
 *   - sheet 名「每周工作情况以及下周计划」（注：模板实际名为「计划」非「任务」，
 *     按维护者 2026-08-26 「用准确名」要求）
 *   - 两个 section：本周项目工作情况（CURRENT）+ 下周项目工作计划（NEXT）
 *   - 主要负责人列拆分为「甲方」「乙方」两列（sub-header 行处理）
 *
 * 关键设计选择：
 *   1. 周编号 = (该条 plan_start_date 周一 - 项目启动周一) / 7 + 1
 *   2. 项目启动周一 = 全部 entries 中最小 plan_start_date 所在周的周一
 *   3. 直接读单元格（不靠 sheet_to_json），因为列头被 sub-header 行截断
 *   4. 跳过 section title 行 / 主表头行 / sub-header 行
 *   5. ⚠️ weekly_report_entries 表尚未建立（Rust repo/command 后续补），
 *      这里只返回符合设计 schema 的 WeeklyReportEntry[]
 */

import * as XLSX from 'xlsx'
import { formatLocalDate } from './datetime'
import { loadTemplate, getSheet, sheetNameOf, applyPatchesToTemplate } from './templateWriter'
import { fillWeekly } from './excelFiller'

// ============================================================
// 类型（设计 schema · 表 weekly_report_entries 尚未建立）
// ============================================================

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

// ============================================================
// 常量
// ============================================================

/** Sheet 名（模糊匹配 · 兼容「每周工作情况以及下周计划/任务」· 忽略其它 sheet）*/
const SHEET_KEYWORD = '每周工作情况'

/** 列位置（0-indexed）· 适用于 sheet_to_json 后的行结构 */
const COL = {
  serial: 0, // A
  task: 1, // B
  planStart: 2, // C
  planEnd: 3, // D
  actualStart: 4, // E
  actualEnd: 5, // F
  ownerPartyA: 6, // G · sub-header = 甲方
  ownerPartyB: 7, // H · sub-header = 乙方
  completionNote: 8, // I
  isCompleted: 9, // J
} as const

/** Section 标题识别 */
const SECTION_CURRENT_TITLE = '本周项目工作情况'
const SECTION_NEXT_TITLE = '下周项目工作计划'
const HEADER_MARKER = '序号'
const SUBHEADER_PARTY_A_MARKER = '甲方'

// ============================================================
// 内部 helpers
// ============================================================

/** 取日期 0:00 本地时间 */
function atLocalMidnight(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

/** 计算某日期所在周的周一 */
function getMonday(d: Date): Date {
  const local = atLocalMidnight(d)
  const day = local.getDay() // 0=Sun, 1=Mon, ..., 6=Sat
  const diff = day === 0 ? -6 : 1 - day // 周日 → 上周一；周二 → -1
  const monday = new Date(local)
  monday.setDate(local.getDate() + diff)
  return atLocalMidnight(monday)
}

/** 加 N 天 */
function addDays(d: Date, days: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + days)
  return x
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

function toStr(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s ? s : null
}

/** 是否完成 → is_completed */
function mapIsCompleted(v: unknown): WeeklyReportEntry['is_completed'] {
  const t = toStr(v)
  if (!t) return 'PENDING'
  // 是 / 完成 / 已完成 / 完成 / Y / Yes / 1
  if (/^(是|完成|已完成|Y|Yes|1|true)$/i.test(t)) return 'COMPLETED'
  // 否 / 未完成 / 进行中 / N / No / 0
  if (/^(否|未完成|进行中|N|No|0|false)$/i.test(t)) return 'IN_PROGRESS'
  // 部分完成 / 处理中
  if (/部分|part/i.test(t)) return 'IN_PROGRESS'
  return 'PENDING'
}

/**
 * 周信息
 * - week_number：项目内周次（从 1 开始）
 * - week_start_date / week_end_date：所在周周一~周日
 */
function computeWeekInfo(
  planStartDateStr: string,
  projectStartMonday: Date,
): {
  week_number: number
  week_start_date: string
  week_end_date: string
} {
  const d = new Date(planStartDateStr + 'T00:00:00')
  const monday = getMonday(d)
  const sunday = addDays(monday, 6)

  const diffMs = monday.getTime() - projectStartMonday.getTime()
  const diffDays = Math.round(diffMs / (86400 * 1000))
  // 容错：跨天误差 → 整 7 天对齐
  const weekNumber = Math.max(1, Math.floor(diffDays / 7) + 1)

  return {
    week_number: weekNumber,
    week_start_date: formatLocalDate(monday),
    week_end_date: formatLocalDate(sunday),
  }
}

/**
 * 把 cell 数组当作单行读取
 * - 缺位补 ''
 */
function getCell(row: unknown[], idx: number): unknown {
  return idx < row.length ? row[idx] : ''
}

/** 行类型判断 */
function rowStringAt(row: unknown[], idx: number): string {
  return toStr(getCell(row, idx)) ?? ''
}

/**
 * 解析一个 section 的所有行（从 section title 后第一个表头开始）
 * @param rows 已转成 string[] 的全 sheet 行
 * @param startRowIdx section title 所在行号
 * @param section CURRENT / NEXT
 */
function parseSection(
  rows: unknown[][],
  startRowIdx: number,
  section: WeeklyReportEntry['section'],
): { entries: Omit<WeeklyReportEntry, 'week_number' | 'week_start_date' | 'week_end_date' | 'id' | 'project_id' | 'created_at' | 'updated_at' | 'sort_order'>[]; nextSectionRow: number } {
  const entries: Omit<
    WeeklyReportEntry,
    'week_number' | 'week_start_date' | 'week_end_date' | 'id' | 'project_id' | 'created_at' | 'updated_at' | 'sort_order'
  >[] = []

  // 找主表头行（col0 = 序号）· 忽略 section title 行
  let headerRow = -1
  for (let r = startRowIdx + 1; r < rows.length; r++) {
    if (rowStringAt(rows[r], 0) === HEADER_MARKER) { headerRow = r; break }
  }
  if (headerRow === -1) return { entries, nextSectionRow: startRowIdx + 1 }

  // 从表头行动态定位列（兼容 8 列 / 10 列两种模板布局）
  const head = rows[headerRow]
  const findHeader = (needle: string): number => {
    for (let c = 0; c < head.length; c++) {
      const v = toStr(head[c])
      if (v && v.includes(needle)) return c
    }
    return -1
  }
  const cSerial = findHeader('序号')
  const cTask = findHeader('任务')
  const cActualStart = findHeader('实际开始')
  const cActualEnd = findHeader('实际完成')
  const cPlanStart = findHeader('计划开始')
  const cPlanEnd = findHeader('计划完成')
  const cNote = findHeader('完成情况')
  const cDone = findHeader('是否完成')

  // 找 sub-header 行（甲方/乙方）· 动态定位列；找不到则回退到「主要负责人」列及其相邻列
  let cPartyA = -1
  let cPartyB = -1
  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r]
    for (let c = 0; c < row.length; c++) {
      const v = toStr(row[c])
      if (v === '甲方') cPartyA = c
      else if (v === '乙方') cPartyB = c
    }
    if (cPartyA !== -1 || cPartyB !== -1) {
      const subStartRow = r
      void subStartRow
      break
    }
  }
  if (cPartyA === -1) {
    const base = findHeader('主要负责')
    cPartyA = base >= 0 ? base : 4
  }
  if (cPartyB === -1) cPartyB = cPartyA >= 0 ? cPartyA + 1 : 5

  // 读取任务行，直到下一个 section title 或末尾
  let r = headerRow + 1
  // 跳过 sub-header 行（含 甲方/乙方的行）
  while (r < rows.length) {
    const row = rows[r]
    let isSub = false
    for (let c = 0; c < row.length; c++) {
      const v = toStr(row[c])
      if (v === '甲方' || v === '乙方') { isSub = true; break }
    }
    if (!isSub) break
    r++
  }

  const cell = (row: unknown[], c: number) => (c >= 0 && c < row.length ? row[c] : '')
  let sortOrder = 0
  while (r < rows.length) {
    const a = rowStringAt(rows[r], 0)
    if (a === SECTION_CURRENT_TITLE || a === SECTION_NEXT_TITLE) break

    const taskName = cTask >= 0 ? rowStringAt(rows[r], cTask) : ''
    if (!taskName) {
      // 空行跳过（含模板里空白行）
      r++
      continue
    }

    const actualStart = excelSerialToLocalDate(cell(rows[r], cActualStart))
    const actualEnd = excelSerialToLocalDate(cell(rows[r], cActualEnd))
    const planStart = excelSerialToLocalDate(cell(rows[r], cPlanStart))
    const planEnd = excelSerialToLocalDate(cell(rows[r], cPlanEnd))

    entries.push({
      task_name: taskName,
      plan_start_date: planStart,
      plan_end_date: planEnd,
      actual_start_date: actualStart,
      actual_end_date: actualEnd,
      owner_party_a: cPartyA >= 0 ? toStr(cell(rows[r], cPartyA)) : null,
      owner_party_b: cPartyB >= 0 ? toStr(cell(rows[r], cPartyB)) : null,
      completion_note: cNote >= 0 ? toStr(cell(rows[r], cNote)) : null,
      is_completed: cDone >= 0 ? mapIsCompleted(cell(rows[r], cDone)) : 'PENDING',
      section,
    })
    sortOrder++
    r++
  }

  return { entries, nextSectionRow: r }
}

/**
 * 把 sheet 全部 cell 转成 unknown[][]（便于按列号读取）
 */
function sheetToRows(sheet: XLSX.WorkSheet): unknown[][] {
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1')
  const rows: unknown[][] = []
  for (let r = range.s.r; r <= range.e.r; r++) {
    const row: unknown[] = []
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })]
      row.push(cell ? cell.v : '')
    }
    rows.push(row)
  }
  return rows
}

/** 给 entries 打上周编号（基于全局最小 plan_start_date）*/
function assignWeekNumbers(
  entries: WeeklyReportEntry[],
): WeeklyReportEntry[] {
  // 取最小 plan_start_date
  const minDate = entries
    .map((e) => e.plan_start_date)
    .filter((d): d is string => !!d)
    .sort()[0]

  if (!minDate) {
    // 无日期 → 周信息留空（week_number=0）
    return entries.map((e) => ({
      ...e,
      week_number: 0,
      week_start_date: '',
      week_end_date: '',
    }))
  }

  const projectStartMonday = getMonday(new Date(minDate + 'T00:00:00'))

  return entries.map((e) => {
    if (!e.plan_start_date) {
      return { ...e, week_number: 0, week_start_date: '', week_end_date: '' }
    }
    const info = computeWeekInfo(e.plan_start_date, projectStartMonday)
    return {
      ...e,
      week_number: info.week_number,
      week_start_date: info.week_start_date,
      week_end_date: info.week_end_date,
    }
  })
}

// ============================================================
// 公开 API
// ============================================================

/** 解析每周工作情况以及下周计划 sheet → WeeklyReportEntry[] */
export async function parseWeeklyExcel(
  file: File,
  projectId: number,
): Promise<WeeklyReportEntry[]> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  // 模糊匹配：找到名字包含「每周工作情况」的 sheet · 忽略其它 sheet
  const sheetKey = wb.SheetNames.find(
    (n) => n.includes(SHEET_KEYWORD),
  )
  const sheet = sheetKey ? wb.Sheets[sheetKey] : undefined
  if (!sheet) {
    throw new Error('Excel 中未找到「每周工作情况」相关的 sheet 页 · 请用模板页或重命名 sheet 页')
  }

  const rows = sheetToRows(sheet)

  // 找两个 section 起始行
  let currentStart = -1
  let nextStart = -1
  for (let i = 0; i < rows.length; i++) {
    const a = rowStringAt(rows[i], COL.serial)
    if (a === SECTION_CURRENT_TITLE && currentStart === -1) currentStart = i
    else if (a === SECTION_NEXT_TITLE && nextStart === -1) nextStart = i
  }

  // 解析两个 section（顺序：CURRENT → NEXT）
  const collected: WeeklyReportEntry[] = []
  let globalSort = 0

  if (currentStart !== -1) {
    const { entries } = parseSection(rows, currentStart, 'CURRENT')
    entries.forEach((e) => {
      collected.push({
        id: 0,
        project_id: projectId,
        ...e,
        week_number: 0,
        week_start_date: '',
        week_end_date: '',
        sort_order: globalSort++,
        created_at: '',
        updated_at: '',
      })
    })
  }

  if (nextStart !== -1) {
    const { entries } = parseSection(rows, nextStart, 'NEXT')
    entries.forEach((e) => {
      collected.push({
        id: 0,
        project_id: projectId,
        ...e,
        week_number: 0,
        week_start_date: '',
        week_end_date: '',
        sort_order: globalSort++,
        created_at: '',
        updated_at: '',
      })
    })
  }

  // 第二遍：分配周编号
  return assignWeekNumbers(collected)
}

/** 导出 WeeklyReportEntry[] → Excel Blob（就地写入内置模板「每周工作情况」sheet，保留表头/样式）*/
export async function exportWeeklyToExcel(
  entries: WeeklyReportEntry[],
): Promise<Blob> {
  const wb = await loadTemplate()
  const ws = getSheet(wb, '每周工作情况')
  const patches = fillWeekly(ws, entries)
  return applyPatchesToTemplate([{ sheetName: sheetNameOf(wb, '每周工作情况以及下周计划'), patches }])
}