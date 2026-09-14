/**
 * PMTool V2.0 · 模板写入器（保真导出：字节级复制模板 + XML 原位填充）
 * 2026-09-14 · 维护者整改：绝不再 book_new / XLSX.write 重建 Excel。
 * 原则：模板永远只读；输出 = 模板字节副本 + 仅对目标单元格做 XML 值注入（保留 r= s=），
 * 其余全部 OOXML 部件（styles/theme/drawing/条件格式/数据验证/冻结/命名区域/公式）逐字节保留。
 * 再用 fullCalcOnLoad 强制 Excel 打开即重算。
 *
 * 定位逻辑保留：所有行/列号仍运行时按模板表头检测（findHeaderRow / colOf / colOfAfter）。
 * 只是“写回”从 SheetJS 模型换成 patch 收集 + XML 补丁。
 */

import * as XLSX from 'xlsx'
import JSZip from 'jszip'
import templateUrl from '@/assets/templates/pmtool_project_template.xlsx?url'

/** 一个待写入的单元格（r/c 为 0 基行列；v 已序列化：日期为序列数(number)、其余 string|number） */
export type CellPatch = { r: number; c: number; v: string | number }
/** 一个 sheet 的全部补丁 */
export interface SheetPatch { sheetName: string; patches: CellPatch[] }

let _templateBuf: ArrayBuffer | null = null

/** 模板原始字节（只读、缓存） */
export async function loadTemplateBytes(): Promise<ArrayBuffer> {
  if (!_templateBuf) {
    const res = await fetch(templateUrl)
    if (!res.ok) throw new Error(`加载模板失败 HTTP ${res.status}`)
    _templateBuf = await res.arrayBuffer()
  }
  return _templateBuf
}

/** 读取模板为 SheetJS 工作簿，仅供“定位表头/列号”。不要用于写出。 */
export async function loadTemplate(): Promise<XLSX.WorkBook> {
  return XLSX.read(await loadTemplateBytes(), { type: 'array', cellStyles: true })
}

/** 按关键字返回模板中精确 sheet 名（供 applyPatchesToTemplate 定位 parts） */
export function sheetNameOf(wb: XLSX.WorkBook, keyword: string): string {
  const k = wb.SheetNames.find((n) => n.includes(keyword))
  if (!k) throw new Error(`模板中未找到包含「${keyword}」的 sheet`)
  return k
}

/** 按名称关键字找 sheet（定位用） */
export function getSheet(wb: XLSX.WorkBook, keyword: string): XLSX.WorkSheet {
  return wb.Sheets[sheetNameOf(wb, keyword)]
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

/* 行偏移常量（用字符串长度避开数字字面量被环境损坏）*/
export const ONE = 'a'.length
export const TWO = 'ab'.length
export const HUNDRED = Number('100')

/** 找所有含指定标记的表头行（返回行号数组）· 周报有本周/下周两个表头 */
export function findHeaderRows(ws: XLSX.WorkSheet, markers: string[]): number[] {
  const { s, e } = range(ws)
  const out: number[] = []
  for (let r = s; r <= e; r++) {
    for (const marker of markers) {
      const mc = normHeader(marker)
      for (let c = 0; c <= maxCol(ws); c++) {
        if (cellText(ws, r, c) === mc) { out.push(r); break }
      }
      if (out[out.length - 1] === r) break
    }
  }
  return out
}

/** 在表头行从 afterCol 之后找包含指定文本的列（用于成员表第二块） */
export function colOfAfter(ws: XLSX.WorkSheet, headerRow: number, needle: string, afterCol: number): number {
  const n = normHeader(needle)
  for (let c = afterCol; c <= maxCol(ws); c++) {
    if (cellText(ws, headerRow, c).includes(n)) return c
  }
  return -1
}

/** 记录一条待写入补丁（不直接改工作表；空值跳过；日期转序列数） */
export function patch(patches: CellPatch[], r: number, c: number, v: unknown, isDate = false): void {
  if (v === null || v === undefined || v === '') return
  patches.push({
    r,
    c,
    v: isDate && typeof v === 'string' ? (dateSerial(v) ?? v) : typeof v === 'number' ? v : String(v),
  })
}

// ==================== XML 原位补丁内核 ====================

function escText(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function colIndexFromAddr(addr: string): number {
  const m = /^[A-Z]+/.exec(addr)
  if (!m) return 0
  let n = 0
  for (const ch of m[0]) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n
}

function buildCellXml(addr: string, s: string, v: string | number): string {
  const sAttr = s && s !== '0' ? ` s="${s}"` : ''
  if (typeof v === 'number') {
    return `<c r="${addr}"${sAttr}><v>${String(v)}</v></c>`
  }
  return `<c r="${addr}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${escText(String(v))}</t></is></c>`
}

/** 对单个地址做替换：命中已存在格（含公式格一律保留）则改值；否则插入 */
<<<<<<< Updated upstream
function replaceCell(xml: string, addr: string, v: string | number): string {
=======
function replaceCell(xml: string, addr: string, v: string | number, isDate = false, dateResolver?: (r: number, c: number, sourceS: string) => string): string {
  const rowNum = Number(/\d+$/.exec(addr)?.[1] ?? '0')
  const colNum = colIndexFromAddr(addr)
>>>>>>> Stashed changes
  const open = `<c r="${addr}"`
  const openIdx = xml.indexOf(open)
  if (openIdx >= 0) {
    const gt = xml.indexOf('>', openIdx)
    if (gt < 0) return xml
    const selfClose = xml[gt - 1] === '/'
    const cellEnd = selfClose ? gt + 1 : xml.indexOf('</c>', gt) + 4
    const block = xml.slice(openIdx, cellEnd)
    // 公式格：绝不覆盖，保留模板公式
    if (/<f>/.test(block)) return xml
    const sM = /s="(\d+)"/.exec(block)
<<<<<<< Updated upstream
    const s = sM ? sM[1] : '0'
=======
    let s = sM ? sM[1] : '0'
    if (isDate && dateResolver) s = dateResolver(rowNum, colNum, s)
>>>>>>> Stashed changes
    return xml.slice(0, openIdx) + buildCellXml(addr, s, v) + xml.slice(cellEnd)
  }
  // 未命中 → 读到行内，按列序插入
  const row = /(\d+)$/.exec(addr)?.[1] ?? ''
  const col = colIndexFromAddr(addr)
  const rowOpen = xml.indexOf(`<row r="${row}"`)
  const rowClose = rowOpen >= 0 ? xml.indexOf('</row>', rowOpen) : -1
  if (rowOpen >= 0 && rowClose >= 0) {
    const rowBlock = xml.slice(rowOpen, rowClose)
    const sM = /<c[^>]*s="(\d+)"/.exec(rowBlock)
<<<<<<< Updated upstream
    const s = sM ? sM[1] : '0'
=======
    let s = sM ? sM[1] : '0'
    if (isDate && dateResolver) s = dateResolver(rowNum, colNum, s)
>>>>>>> Stashed changes
    const newCell = buildCellXml(addr, s, v)
    let insertAt = rowClose
    for (const m of rowBlock.matchAll(/<c r="([A-Z]+\d+)"/g)) {
      if (colIndexFromAddr(m[1]) > col) { insertAt = rowOpen + m.index; break }
    }
    return xml.slice(0, insertAt) + newCell + xml.slice(insertAt)
  }
  // 行也不存在 → 在 </sheetData> 前新建一行（极少触发）
  const sdClose = xml.lastIndexOf('</sheetData>')
  if (sdClose >= 0) {
    const newRow = `<row r="${row}" spans="1:${Math.max(col + 1, 1)}">${buildCellXml(addr, '0', v)}</row>`
    return xml.slice(0, sdClose) + newRow + xml.slice(sdClose)
  }
  return xml
}

function expandDimension(xml: string, maxRow: number, maxCol0: number): string {
  const match = /(<dimension ref=")A1:([A-Z]+\d+)(")/.exec(xml)
  if (!match) return xml
  const curEndCol = colIndexFromAddr(/[A-Z]+/.exec(match[2])![0])
  const curEndRow = Number(/\d+/.exec(match[2])![0])
  const newCol = Math.max(curEndCol, maxCol0)
  const newRow = Math.max(curEndRow, maxRow)
  if (newCol === curEndCol && newRow === curEndRow) return xml
  const newEnd = XLSX.utils.encode_cell({ r: newRow - 1, c: newCol - 1 })
  return xml.slice(0, match.index) + `${match[1]}A1:${newEnd}${match[3]}` + xml.slice(match.index + match[0].length)
}

<<<<<<< Updated upstream
function applyCellPatchesToXml(xml: string, patches: CellPatch[]): string {
=======
function isDateFormat(code: string): boolean {
  const c = code.replace(/\\/g, '')
  return c.includes('yyy') || c.includes('m/d') || c.includes('dddd') || c.includes('aaa')
}

/** 扫描某 sheet XML：找该模板“已有日期数字格式”的单元格，按“列”记录其样式索引。
 * 这样同一列的日期格能用模板自己设的那个日期样式，整列格式才统一（不会一正一错）。 */
function collectColumnDateStyles(xml: string, dateStyles: Set<number>): Map<number, string> {
  const map = new Map<number, string>()
  for (const m of xml.matchAll(/<c[^>]*r="([A-Z]+)\d+"[^>]*s="(\d+)"[^>]*\/?>/g)) {
    const s = Number(m[2])
    if (dateStyles.has(s)) {
      const col = colIndexFromAddr(m[1])
      if (!map.has(col)) map.set(col, m[2])
    }
  }
  return map
}

// 解析 styles.xml：找出所有“日期数字格式”的 cellXf 索引，以及各填充/边框/字体下优先的日期样式，供日期单元格复用。
function parseDateStyles(sx: string): {
  dateStyles: Set<number>
  dateStyleByFill: Map<number, number>
  defaultDate: number
  fillByXf: number[]
} {
  const fm = new Map<string, string>()
  for (const m of sx.matchAll(/<numFmt numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)) fm.set(m[1], m[2])
  const xfsMatch = /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(sx)
  const xfAttrs = xfsMatch ? [...xfsMatch[1].matchAll(/<xf([^>]*?)\/?>/g)].map((m) => m[1]) : []
  const dateStyles = new Set<number>()
  const dateStyleByFill = new Map<number, number>()
  const fillByXf: number[] = []
  let defaultDate = 0
  xfAttrs.forEach((attrs, i) => {
    const nf = Number(/numFmtId="(\d+)"/.exec(attrs)?.[1] ?? 0)
    const fill = Number(/fillId="(\d+)"/.exec(attrs)?.[1] ?? 0)
    fillByXf[i] = fill
    const code = fm.get(String(nf)) ?? ''
    if (isDateFormat(code)) {
      dateStyles.add(i)
      if (!dateStyleByFill.has(fill)) dateStyleByFill.set(fill, i)
      // 默认日期样式优先模板常用的 yyyy/m/d（177/178），否则取首个日期样式
      if (nf === 178 || nf === 177) defaultDate = i
      if (!defaultDate) defaultDate = i
    }
  })
  return { dateStyles, dateStyleByFill, defaultDate, fillByXf }
}

function applyCellPatchesToXml(xml: string, patches: CellPatch[], dateResolver?: (r: number, c: number, sourceS: string) => string): string {
>>>>>>> Stashed changes
  let out = xml
  let maxRow = 0
  let maxCol0 = 0
  for (const p of patches) {
    const addr = XLSX.utils.encode_cell({ r: p.r, c: p.c })
    out = replaceCell(out, addr, p.v)
    if (p.r + 1 > maxRow) maxRow = p.r + 1
    if (p.c + 1 > maxCol0) maxCol0 = p.c + 1
  }
  return expandDimension(out, maxRow, maxCol0)
}

/** 用 workbook.xml + rels 解析 sheet 名 → xlsx 内 part 路径 */
async function loadSheetNameMap(zip: JSZip): Promise<Map<string, string>> {
  const relsFile = zip.file('xl/_rels/workbook.xml.rels')
  const wbFile = zip.file('xl/workbook.xml')
  if (!relsFile || !wbFile) return new Map()
  const relsXml = await relsFile.async('string')
  const wbXml = await wbFile.async('string')
  const relTarget = new Map<string, string>()
  for (const m of relsXml.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*\/>/g)) {
    relTarget.set(m[1], m[2])
  }
  const map = new Map<string, string>()
  for (const m of wbXml.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"[^>]*\/>/g)) {
    const t = relTarget.get(m[2])
    if (t) map.set(m[1], t.replace(/^\.\.\//g, '').replace(/^\//g, ''))
  }
  return map
}

/**
 * 保真导出入口：把各 sheet 的补丁以 XML 原位注入模板字节副本，返回新 Excel Blob。
 * 不覆盖任何公式格；保留全部样式/条件格式/数据验证/图形/冻结/命名区域；打开即重算。
 */
export async function applyPatchesToTemplate(patchesBySheet: SheetPatch[]): Promise<Blob> {
  const buf = await loadTemplateBytes()
  const zip = await JSZip.loadAsync(new Uint8Array(buf))
  const nameToPart = await loadSheetNameMap(zip)
  for (const { sheetName, patches } of patchesBySheet) {
    if (!patches || patches.length === 0) continue
    const part = nameToPart.get(sheetName)
    if (!part) continue
    const path = 'xl/' + part
    const file = zip.file(path)
    if (!file) continue
    let xml = await file.async('string')
    xml = applyCellPatchesToXml(xml, patches)
    zip.file(path, xml)
  }
  const wbFile = zip.file('xl/workbook.xml')
  if (wbFile) {
    let wbXml = await wbFile.async('string')
    wbXml = wbXml.replace(/<calcPr[^>]*\/>/, '<calcPr calcId="0" fullCalcOnLoad="1"/>')
    zip.file('xl/workbook.xml', wbXml)
  }
  const out = await zip.generateAsync({
    type: 'arraybuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })
  return new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}