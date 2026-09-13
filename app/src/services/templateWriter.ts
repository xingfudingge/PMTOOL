/**
 * PMTool V2.0 · 模板写入器（导出数据就地写入内置模板，保留表头/样式/公式）
 * 2026-09-13 · 关键原则：所有行号/列号都在运行时从模板结构自动检测，
 * 不写死任何魔数，从而兼容任意模板变体 + 规避环境数字损坏。
 */

import * as XLSX from 'xlsx'
import templateUrl from '@/assets/templates/pmtool_project_template.xlsx?url'

let _templateBuf: ArrayBuffer | null = null

/** 加载内置模板（缓存）· cellStyles=true 保留填充/边框 */
export async function loadTemplate(): Promise<XLSX.WorkBook> {
  if (!_templateBuf) {
    const res = await fetch(templateUrl)
    if (!res.ok) throw new Error(`加载模板失败 HTTP ${res.status}`)
    _templateBuf = await res.arrayBuffer()
  }
  return XLSX.read(_templateBuf, { type: 'array', cellStyles: true })
}

/** 按名称关键字找 sheet */
export function getSheet(wb: XLSX.WorkBook, keyword: string): XLSX.WorkSheet {
  const key = wb.SheetNames.find((n) => n.includes(keyword))
  if (!key) throw new Error(`模板中未找到包含「${keyword}」的 sheet`)
  return wb.Sheets[key]
}

function normHeader(s: string): string {
  return String(s).replace(/[\s\n\r\t]+/g, '')
}

function cellText(ws: XLSX.WorkSheet, r: number, c: number): string {
  const cell = ws[XLSX.utils.encode_cell({ r, c })]
  return normHeader(String(cell && cell.v !== null && cell.v !== undefined ? cell.v : ''))
}

function range(ws: XLSX.WorkSheet): { s: number; e: number } {
  const rng = XLSX.utils.decode_range(ws['!ref'] || 'A1')
  return { s: rng.s.r, e: rng.e.r }
}

function maxCol(ws: XLSX.WorkSheet): number {
  return XLSX.utils.decode_range(ws['!ref'] || 'A1').e.c
}

/** 定位表头行：首个包含所有给定标记的行（任一标记出现在任一列即算） */
export function findHeaderRow(ws: XLSX.WorkSheet, markers: string[]): number | null {
  const { s, e } = range(ws)
  for (let r = s; r <= e; r++) {
    for (const marker of markers) {
      const mc = normHeader(marker)
      for (let c = 0; c <= maxCol(ws); c++) {
        if (cellText(ws, r, c) === mc) return r
      }
    }
  }
  return null
}

/** 在表头行找包含指定文本的列（返回列号） */
export function colOf(ws: XLSX.WorkSheet, headerRow: number, needle: string): number {
  const n = normHeader(needle)
  for (let c = 0; c <= maxCol(ws); c++) {
    if (cellText(ws, headerRow, c).includes(n)) return c
  }
  return -1
}

/** YYYY-MM-DD → Excel 序列数（UTC 安全） */
export function dateSerial(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr).trim())
  if (!m) return null
  return (Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - Date.UTC(1899, 11, 30)) / 86400000
}

/** 清空 startRow..末尾 的所有单元格（保留表头及之前） */
export function clearRows(ws: XLSX.WorkSheet, startRow: number): void {
  const { s, e } = range(ws)
  for (let r = Math.max(startRow, s); r <= e; r++) {
    for (let c = 0; c <= maxCol(ws); c++) {
      delete ws[XLSX.utils.encode_cell({ r, c })]
    }
  }
}

/** 写一行：cells = [col, value, isDate] 数组 */
export function writeRow(ws: XLSX.WorkSheet, r: number, cells: Array<[number, unknown, boolean?]>): void {
  for (const [c, v, isDate] of cells) {
    if (v === null || v === undefined || v === '') continue
    const addr = XLSX.utils.encode_cell({ r, c })
    const prev = ws[addr]
    ws[addr] = {
      v: isDate && typeof v === 'string' ? dateSerial(v) ?? v : v,
      t: isDate ? 'n' : typeof v === 'number' ? 'n' : 's',
      ...(prev && prev.s ? { s: prev.s } : {}),
    }
  }
}

/** 提取为单个 sheet 的工作簿 Blob（单功能导出用：模板化为一张表）
 * lastRow：最后一行数据（含）· 用于把写入的行纳入 sheet 范围（模板 sheet 可能只有表头行） */
export function singleSheetBlob(ws: XLSX.WorkSheet, name: string, lastRow?: number): Blob {
  const e = XLSX.utils.decode_range(ws['!ref'] || 'A1')
  if (lastRow !== undefined && lastRow > e.e.r) e.e.r = lastRow
  ws['!ref'] = XLSX.utils.encode_range(e)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31))
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx', cellStyles: true })
  return new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}
