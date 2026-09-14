/**
 * PMTool 保真导出 · 「项目管理」数据区重排生成器
 * 2026-09-14 维护者整改：模板固定网格(5阶段+~30任务)塞不下任意深任务树，旧 fillProject 就近跳行丢弃越界任务。
 * 本模块：把任务树按 DFS 全量展开为 阶段行/任务行，逐格克隆模板自身蓝图的样式(含甘特 J..FU 空样式格),
 * 阶段行公式(子行 MIN/MAX/加权)按真实子行区间重写，并延展条件格式(甘特)区间与 dimension。表头 rows 1..startRow-1 逐字节保留。
 */
import type { ProjectGridLayout, ProjectGridRow } from './templateWriter'

function colBase(s: string): number {
  let n = 0
  for (const ch of s) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n
}

interface Bp {
  s: Map<number, string>
  maxCol: number
  rowOpen: string // 形如 `r="6" ht="21" customHeight="1"` 的行开标签属性（不含字面），复用行高
}

function esc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
function escF(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function getRowBlock(xml: string, r: number): string {
  const openIdx = xml.indexOf(`<row r="${r}"`)
  if (openIdx < 0) return ''
  const closeIdx = xml.indexOf('</row>', openIdx)
  return closeIdx < 0 ? xml.slice(openIdx) : xml.slice(openIdx, closeIdx + 6)
}

function parseBp(xml: string, sampleRow: number): Bp {
  const block = getRowBlock(xml, sampleRow)
  const s = new Map<number, string>()
  let maxCol = 8
  const re = /<c([^>]*)r="([A-Z]+)\d+"([^>]*)>/g
  let m
  while ((m = re.exec(block))) {
    const col = colBase(m[2])
    if (col > maxCol) maxCol = col
    const sm = / s="(\d+)"/.exec(m[0])
    if (sm) s.set(col, sm[1])
  }
  const ro = /<row[^>]*?(r="\d+"[^>]*?)>/.exec(block)
  const rowOpen = ro ? ro[1] : `r="${sampleRow}"`
  return { s, maxCol, rowOpen }
}

function emptyCell(addr: string, s: string): string {
  return s && s !== '0' ? `<c r="${addr}" s="${s}"/>` : `<c r="${addr}"/>`
}
function strCell(addr: string, s: string, v: string): string {
  if (!v) return emptyCell(addr, s)
  const sa = s && s !== '0' ? ` s="${s}"` : ''
  return `<c r="${addr}"${sa} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`
}
function numCell(addr: string, s: string, v: number): string {
  const sa = s && s !== '0' ? ` s="${s}"` : ''
  return `<c r="${addr}"${sa}><v>${v}</v></c>`
}
function fNumCell(addr: string, s: string, formula: string): string {
  const sa = s && s !== '0' ? ` s="${s}"` : ''
  return `<c r="${addr}"${sa}><f>${escF(formula)}</f><v>0</v></c>`
}
function fStrCell(addr: string, s: string, formula: string): string {
  const sa = s && s !== '0' ? ` s="${s}"` : ''
  return `<c r="${addr}"${sa} t="str"><f>${escF(formula)}</f><v> - </v></c>`
}

function colLetters(n: number): string {
  let s = ''
  let x = n
  while (x > 0) {
    const r = (x - 1) % 26
    s = String.fromCharCode(65 + r) + s
    x = Math.floor((x - 1) / 26)
  }
  return s
}

function ganttCells(row: number, bp: Bp, fromCol: number): string {
  let out = ''
  for (let c = fromCol; c <= bp.maxCol; c++) {
    const st = bp.s.get(c) ?? '0'
    out += emptyCell(colLetters(c) + row, st)
  }
  return out
}

function buildRow(row: ProjectGridRow, phaseBp: Bp, taskBp: Bp): string {
  const r = row.row
  const bp = row.kind === 'phase' ? phaseBp : taskBp
  const st = (c: number) => bp.s.get(c) ?? '0'
  let cells = ''
  cells += strCell('A' + r, st(1), row.serial) // 序号（A 列即 st(1)，模板序号列对应列号1）
  cells += strCell('B' + r, st(2), row.name)
  cells += strCell('C' + r, st(3), row.owner)
  if (row.kind === 'task') {
    // D 计划启动(日期序列数) / E 公式算计划完成 / F 自然日 / G 当前完成度 / H 工作日工时(公式)
    cells += row.startSerial != null ? numCell('D' + r, st(4), row.startSerial) : emptyCell('D' + r, st(4))
    cells += fStrCell('E' + r, st(5), `IF(ISBLANK(D${r}),&quot; - &quot;,IF(F${r}=0,D${r},D${r}+F${r}-1))`)
    cells += row.natural != null ? numCell('F' + r, st(6), row.natural) : emptyCell('F' + r, st(6))
    cells += row.progress != null ? numCell('G' + r, st(7), row.progress) : emptyCell('G' + r, st(7))
    cells += fStrCell('H' + r, st(8), `IF(OR(E${r}=0,D${r}=0),&quot; - &quot;,NETWORKDAYS(D${r},E${r}))`)
    cells += strCell('I' + r, st(9), row.remark)
    cells += ganttCells(r, bp, 10)
  } else {
    const kids = row.childRows
    const a = kids.length ? kids[0] : r
    const b = kids.length ? kids[kids.length - 1] : r
    cells += fNumCell('D' + r, st(4), `MIN(D${a}:D${b})`)
    cells += fNumCell('E' + r, st(5), `MAX(E${a}:E${b})`)
    cells += fNumCell('F' + r, st(6), `IF(OR(D${r}=0,E${r}=0),0,E${r}-D${r}+1)`)
    cells += fNumCell('G' + r, st(7), `IFERROR(SUMPRODUCT(H${a}:H${b},G${a}:G${b})/SUM(H${a}:H${b}),0)`)
    cells += fStrCell('H' + r, st(8), `IF(OR(D${r}=0,E${r}=0),&quot; - &quot;,NETWORKDAYS(D${r},E${r}))`)
    cells += strCell('I' + r, st(9), row.remark)
    cells += ganttCells(r, bp, 10)
  }
  const open = /r="\d+"/.test(bp.rowOpen) ? bp.rowOpen.replace(/r="\d+"/, `r="${r}"`) : `r="${r}"`
  return `<row ${open}>${cells}</row>`
}

/** 在模板 XML 里找一个“阶段行样例”（D 列有公式）和一个“任务行样例”（D 列无公式）的行号。 */
function findSamples(xml: string, dataStartRow: number): { phase: number; task: number } {
  let phase = 0
  let task = 0
  let r = dataStartRow
  while (r < dataStartRow + 60) {
    const block = getRowBlock(xml, r)
    if (!block) { r++; continue }
    const dCell = /<c[^>]*r="D\d+"[^>]*>[\s\S]*?<\/c>/.exec(block)
    const hasF = dCell ? /<f>/.test(dCell[0]) : false
    if (!phase && hasF) phase = r
    else if (!task && !hasF) task = r
    if (phase && task) break
    r++
  }
  return { phase: phase || dataStartRow, task: task || dataStartRow + 1 }
}

export function rebuildProjectRows(xml: string, layout: ProjectGridLayout): string {
  const start = layout.dataStartRow
  const rowIdx = xml.indexOf(`<row r="${start}"`)
  if (rowIdx < 0) return xml
  const sdIdx = xml.indexOf('</sheetData>')
  if (sdIdx < 0) return xml
  const samples = findSamples(xml, start)
  const phaseBp = parseBp(xml, samples.phase)
  const taskBp = parseBp(xml, samples.task)
  const head = xml.slice(0, rowIdx)
  const tail = xml.slice(sdIdx)
  let body = ''
  for (const row of layout.rows) body += buildRow(row, phaseBp, taskBp)
  const maxRow = layout.rows.length ? Math.max(...layout.rows.map((x) => x.row)) : start
  let out = head + body + tail
  // 延展条件格式(甘特)区间到 maxRow
  out = out.replace(/sqref="([A-Z]+\d+):([A-Z]+\d+)"/g, (mm, s0, e0) => {
    const er = Number(/\d+$/.exec(e0)![0])
    if (er < maxRow) return `sqref="${s0}:${e0.replace(/\d+$/, String(maxRow))}"`
    return mm
  })
  // 延展 dimension
  out = out.replace(/<dimension ref="A1:([^"]+)"/g, (mm, e0) => {
    const er = Number(/\d+$/.exec(e0)![0])
    if (er < maxRow) return `<dimension ref="A1:${e0.replace(/\d+$/, String(maxRow))}"`
    return mm
  })
  return out
}
