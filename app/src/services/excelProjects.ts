/**
 * PMTool V2.0 · 项目管理 sheet ↔ project_tasks Excel 导入导出
 * Phase 4 · 维护者 2026-08-26
 *
 * 设计依据：
 *   - 模板 app/src/assets/templates/pmtool_project_template.xlsx
 *   - sheet 名「项目管理」
 *   - 第 4 行（0-indexed row 3）为列头：序号 / 任务 / 跟进人 / 计划启动日期 /
 *     计划完成日期 / 自然日工时 / 当前完成度 % / 工作日工时 / 任务完成情况说明
 *   - 序号支持三级层级：「1」/「1.1」/「1.1.1」
 *
 * 关键设计选择：
 *   1. 列头规范化（去 \n / 空格）后映射，避免模板里 "自然日\n工时" 等换行干扰
 *   2. 序号解析按自然排序（split('.') 后逐级比较），容忍「先填 2.1 再填 1.1」
 *   3. parent_id 用临时正整数 id（DB insert 时会被真实 id 替换，调用方需重映射）
 *   4. 日期用 (serial - 25569) * 86400 * 1000 转本地 YYYY-MM-DD
 *   5. status 启发式：progress == 0 → PENDING，0 < x < 100 → IN_PROGRESS，x >= 100 → COMPLETED
 */

import * as XLSX from 'xlsx'
import { formatLocalDate } from './datetime'
import templateUrl from '@/assets/templates/pmtool_project_template.xlsx?url'

// 内置模板 ArrayBuffer 缓存（避免每次导出都重新 fetch）
let _templateBuf: ArrayBuffer | null = null
async function templateArrayBuffer(): Promise<ArrayBuffer> {
  if (_templateBuf) return _templateBuf
  const res = await fetch(templateUrl)
  if (!res.ok) throw new Error(`加载模板失败 HTTP ${res.status}`)
  _templateBuf = await res.arrayBuffer()
  return _templateBuf
}

// ============================================================
// 类型（与 services/projectTasks.ts 的 ProjectTask 对齐）
// ============================================================

export interface ProjectTask {
  id: number
  project_id: number
  parent_id: number | null
  task_name: string
  owner: string | null
  start_date: string | null
  end_date: string | null
  work_days: number
  natural_days: number
  progress: number
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'DELAYED'
  remark: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

// ============================================================
// 常量
// ============================================================

/** Sheet 名（必须与模板完全一致）*/
const SHEET_NAME = '项目管理'

/** 列头所在的行（0-indexed = row 3 = 1-indexed 第 4 行）*/
const HEADER_ROW = 3

/** 列头映射（已规范化：去换行/空格）*/
const COL = {
  serial: '序号',
  task: '任务',
  owner: '跟进人',
  startDate: '计划启动日期',
  endDate: '计划完成日期',
  workDays: '自然日工时',
  progress: '当前完成度%',
  workdayCount: '工作日工时',
  remark: '任务完成情况说明',
} as const

// ============================================================
// 内部 helpers
// ============================================================

/** 规范化列头：去换行/空格/制表符 */
function normalizeHeader(s: string): string {
  return String(s).replace(/[\s\n\r\t]+/g, '')
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

/** 安全转 number（失败回 0）*/
function toNumber(v: unknown): number {
  if (typeof v === 'number') return isFinite(v) ? v : 0
  if (v === null || v === undefined || v === '') return 0
  const n = Number(String(v).trim())
  return isFinite(n) ? n : 0
}

/** 安全转 string（trim + 空 → null）*/
function toStr(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s ? s : null
}

/** 序号 → 父序号（"1.2.3" → "1.2"）*/
function parentSerial(serial: string): string | null {
  const idx = serial.lastIndexOf('.')
  return idx === -1 ? null : serial.slice(0, idx)
}

/** 自然比较两个序号（先比段数再逐段比）*/
function compareSerial(a: string, b: string): number {
  const aParts = a.split('.').map(Number)
  const bParts = b.split('.').map(Number)
  const len = Math.max(aParts.length, bParts.length)
  for (let i = 0; i < len; i++) {
    const av = aParts[i] ?? 0
    const bv = bParts[i] ?? 0
    if (av !== bv) return av - bv
  }
  return 0
}

/** 中间解析结构（含 serial + sort_order）*/
interface ParsedRow {
  serial: string
  sortOrder: number
  task: Omit<ProjectTask, 'id' | 'parent_id' | 'sort_order' | 'project_id'>
}

/**
 * 解析一行 Excel → ParsedRow
 * 任务名为空 → 返回 null（跳过）
 */
function parseRow(row: Record<string, unknown>, sortOrder: number): ParsedRow | null {
  const serial = toStr(row[COL.serial]) ?? ''
  const taskName = toStr(row[COL.task])
  if (!taskName) return null

  // Excel 百分比格式在 SheetJS 里返回 0-1 小数（如 100% → 1.0），用户写的纯数字如 50 → 50。
  // 兼容两种：如果值 ≤ 1 且 ≥ 0，×100 转成 0-100；如果 > 1 直接当 0-100 整数。
  const rawProgress = toNumber(row[COL.progress])
  const progress = rawProgress > 0 && rawProgress <= 1
    ? Math.round(rawProgress * 100)
    : Math.max(0, Math.min(100, rawProgress))

  // status 启发式
  let status: ProjectTask['status'] = 'PENDING'
  if (progress >= 100) status = 'COMPLETED'
  else if (progress > 0) status = 'IN_PROGRESS'

  return {
    serial,
    sortOrder,
    task: {
      task_name: taskName,
      owner: toStr(row[COL.owner]),
      start_date: excelSerialToLocalDate(row[COL.startDate]),
      end_date: excelSerialToLocalDate(row[COL.endDate]),
      work_days: toNumber(row[COL.workDays]),
      natural_days: toNumber(row[COL.workDays]), // 自然日工时（默认与 work_days 同）
      progress,
      status,
      remark: toStr(row[COL.remark]),
      created_at: '',
      updated_at: '',
    },
  }
}

/**
 * 排序 + 解析父子层级
 * - 输入：含 serial 的中间结构数组
 * - 输出：ProjectTask[]，id 是临时正整数（DB insert 后需重映射）
 */
function resolveHierarchy(rows: ParsedRow[], projectId: number): ProjectTask[] {
  // 自然排序：先排父任务，再排子任务（容忍乱序填表）
  const sorted = [...rows].sort((a, b) => compareSerial(a.serial, b.serial))

  const serialToId = new Map<string, number>()
  const result: ProjectTask[] = []

  sorted.forEach((row, idx) => {
    const tempId = idx + 1
    serialToId.set(row.serial, tempId)

    let parentId: number | null = null
    const pSerial = parentSerial(row.serial)
    if (pSerial) {
      parentId = serialToId.get(pSerial) ?? null
      // 父序号缺失（用户填错）→ 当顶层处理
    }

    result.push({
      id: tempId,
      project_id: projectId,
      parent_id: parentId,
      ...row.task,
      sort_order: row.sortOrder,
    })
  })

  return result
}

/**
 * 直接从 sheet 单元格读取（跳过标题/配置行）
 * 适用于列头含 \n 的情况（模板里 "工作日\n工时\n" 等）
 */
function readSheetAsRows(sheet: XLSX.WorkSheet): Record<string, unknown>[] {
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1')
  // 第一步：建列头映射（规范化）
  const headerMap: Record<string, number> = {}
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = sheet[XLSX.utils.encode_cell({ r: HEADER_ROW, c })]
    if (!cell) continue
    const key = normalizeHeader(String(cell.v))
    if (key && !(key in headerMap)) {
      headerMap[key] = c
    }
  }
  // 第二步：从 HEADER_ROW + 1 开始读取
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

/** 解析项目管理 sheet → ProjectTask[] */
export async function parseProjectsExcel(
  file: File,
  projectId: number,
): Promise<ProjectTask[]> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const sheet = wb.Sheets[SHEET_NAME]
  if (!sheet) {
    throw new Error(`Sheet "${SHEET_NAME}" 不存在（模板应为 6 个 sheet）`)
  }

  const rows = readSheetAsRows(sheet)
  const parsed: ParsedRow[] = []
  rows.forEach((row, idx) => {
    const p = parseRow(row, idx)
    if (p) parsed.push(p)
  })

  return resolveHierarchy(parsed, projectId)
}

/**
 * ProjectTask → Excel 行
 * 模板列序：A序号 B任务 C跟进人 D计划启动日期 E计划完成日期 F自然日工时 G当前完成度% H工作日工时 I任务完成情况说明
 *
 * ⚠ 公式列（不写·让 Excel 自动算）：
 *   F = 自然日工时 = NETWORKDAYS(D, E)         → 改 D/E 自动重算
 *   H = 工作日工时 = NETWORKDAYS(D, E)         → 改 D/E 自动重算
 *   I = 任务完成情况说明 = 公式                 → 用户说明可改这里
 *
 *   我们只写 A/B/C/D/E/G 五个数据列 + 任务完成情况说明（如果非空）
 */
function projectTaskToExcelRow(task: ProjectTask): (string | number | null)[] {
  return [
    task.id > 0 ? String(task.id) : '',     // A 序号
    task.task_name,                          // B 任务
    task.owner ?? '',                        // C 跟进人
    task.start_date ?? '',                   // D 计划启动日期（驱动公式）
    task.end_date ?? '',                     // E 计划完成日期（驱动公式）
    // F 自然日工时（公式）· 不写
    Math.round(task.progress),               // G 当前完成度%
    // H 工作日工时（公式）· 不写
    task.remark ?? '',                       // I 任务完成情况说明（覆盖公式）
  ]
}

/** 导出 ProjectTask[] → Excel Blob（按模板结构：加载模板 xlsx → 往「项目管理」sheet 填数据） */
export async function exportProjectsToExcel(
  tasks: ProjectTask[],
): Promise<Blob> {
  const wb = XLSX.read(await templateArrayBuffer(), { type: 'array' })
  const key = wb.SheetNames.find((n) => n.includes('项目管理'))
  if (!key) throw new Error('模板中未找到「项目管理」sheet')
  const ws = wb.Sheets[key]
  // 模板「项目管理」第 4 行（index=3）是表头 · 数据从第 7 行（index=6）开始写
  // 关键：只写数据列（A/B/C/D/E/G/I）· F/H 是公式列不写· 让 Excel 自动算
  const dataRows = tasks.map((t) => projectTaskToExcelRow(t))
  // 按列写入（避免覆盖模板公式列 F/H）
  const colMap: Array<{ col: number; extract: (row: typeof dataRows[number]) => string | number }> = [
    { col: 0, extract: (r) => r[0] as string }, // A 序号
    { col: 1, extract: (r) => r[1] as string }, // B 任务
    { col: 2, extract: (r) => r[2] as string }, // C 跟进人
    { col: 3, extract: (r) => r[3] as string }, // D 计划启动日期
    { col: 4, extract: (r) => r[4] as string }, // E 计划完成日期
    // F (5) = 公式列 · 跳过
    { col: 6, extract: (r) => r[5] as number }, // G 当前完成度%
    // H (7) = 公式列 · 跳过
    { col: 8, extract: (r) => r[6] as string }, // I 任务完成情况说明（覆盖公式）
  ]
  const START_ROW = 6 // 0-indexed row 6 = 第 7 行 = 任务区第一行
  dataRows.forEach((row, i) => {
    const r = START_ROW + i
    colMap.forEach(({ col, extract }) => {
      const val = extract(row)
      if (val === '' || val == null) return
      const addr = XLSX.utils.encode_cell({ r, c: col })
      ws[addr] = { v: val, t: typeof val === 'number' ? 'n' : 's' }
    })
  })

  // 甘特条形填充：任务行 (START_ROW + i) 对应 tasks[i] · 模板日列从 col 9 起（row3 为逐日日期）
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
  const GANTT_COL_BASE = 9
  // 模板启动日期 = row1 单元格 B2 的序列值（日列锚点）
  const anchorCell = ws[XLSX.utils.encode_cell({ r: 1, c: 1 })]
  const anchorSerial = typeof anchorCell?.v === 'number' ? anchorCell.v : null
  const anchorDate = anchorSerial ? new Date(Math.round((anchorSerial - 25569) * 86400 * 1000)) : null
  const dayColFor = (dateStr: string | null): number | null => {
    if (!anchorDate || !dateStr) return null
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return null
    const diff = Math.round((d.getTime() - anchorDate.getTime()) / 86400000)
    return GANTT_COL_BASE + diff
  }
  const inferStatus = (t: ProjectTask): ProjectTask['status'] => {
    if (t.progress >= 100) return 'COMPLETED'
    if (t.status === 'DELAYED') return 'DELAYED'
    if (t.progress > 0) return 'IN_PROGRESS'
    return 'PENDING'
  }
  const STATUS_HEX: Record<ProjectTask['status'], string> = {
    PENDING: 'BFBFBF', IN_PROGRESS: '1677FF', DELAYED: 'FF4D4F', COMPLETED: '52C41A',
  }
  const STATUSH_HEX: Record<ProjectTask['status'], string> = {
    PENDING: 'E6E6E6', IN_PROGRESS: 'D6EBFF', DELAYED: 'FFD6D6', COMPLETED: 'D5F2D5',
  }
  tasks.forEach((t, i) => {
    const r = START_ROW + i
    const s = dayColFor(t.start_date)
    const e = dayColFor(t.end_date)
    if (s === null || e === null || s > e) return
    if (s > range.e.c) return
    const status = inferStatus(t)
    const span = e - s + 1
    const progCells = Math.max(1, Math.round(span * Math.min(100, Math.max(0, t.progress)) / 100))
    const fullCol = Math.min(s + progCells, e + 1)
    for (let c = s; c <= e && c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c })
      const style = c < fullCol
        ? { patternType: 'solid', fgColor: { rgb: STATUS_HEX[status] } }
        : { patternType: 'solid', fgColor: { rgb: STATUSH_HEX[status] } }
      ws[addr] = { v: '', t: 's', s: { fill: style } }
    }
  })

  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx', cellStyles: true })
  return new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

