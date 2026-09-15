/**
 * PMTool V2.0 · 按模板规则把业务数据“收集为补丁”，由 templateWriter.applyPatchesToTemplate 保真写入。
 * 2026-09-14 · 维护者整改：一律不再直接改 SheetJS 工作表，不覆盖任何公式列。
 * 列号仍按模板表头文本运行时检测（findHeaderRow / colOf / colOfAfter）。
 *
 * 项目管理（父子分层）按 App 任务树 DFS 映射：
 *   - 有子任务的节点 → 模板“父行”（D/E/F/G/H 是汇总公式，只写 序号/任务/跟进人/说明，公式不动）
 *   - 叶子任务 → 模板“子行”（写 序号/任务/跟进人/开始/结束/完成度/说明）
 *   - 通过检测“计划启动日期列是否有公式”自动判别父行/子行，不写死块大小。
 */

import * as XLSX from 'xlsx'
import { findHeaderRow, findHeaderRows, colOf, colOfAfter, patch, dateSerial, ONE, TWO, HUNDRED, type CellPatch, type SheetPatch, type ProjectGridLayout, type ProjectGridRow } from './templateWriter'
import type { ProjectTask } from './excelProjects'
import type { ProjectIssue } from './excelRisks'
import type { WeeklyReportEntry } from './excelWeekly'
import type { ProjectRequirement } from './projectRequirements'
import type { ProjectIssueLog } from './projectIssueLog'
import type { ProjectTodoItem } from './projectTodoItems'
import type { ProjectMember } from './excelMembers'
import type { HolidayEntry } from './holidayProvider'

// 状态/等级 → 一律映射到【模板数据验证下拉】的合法值（维护者 2026-09-15 整改：写入值必须与模板要求一致，缺省兜底取下拉首值）
// 风险·等级：模板下拉仅 高/中/低，CRITICAL 无对应项，归并入最高的“高”
function levelToCN(l: ProjectIssue['level']): string {
  return l === 'LOW' ? '低' : l === 'HIGH' || l === 'CRITICAL' ? '高' : '中'
}
// 风险·风险状态：模板下拉 识别中/应对中/已关闭（无“待应对/已应对”），RESOLVED/CLOSED 归并入“已关闭”
function riskStatusToCN(s: ProjectIssue['status']): string {
  return s === 'OPEN' ? '识别中' : s === 'IN_PROGRESS' ? '应对中' : '已关闭'
}
// 需求·响应状态：模板下拉 待设计/设计中/待开发/开发中/已完成；REJECTED 无对应项，归并入“待设计”
function reqStatusToCN(s: string): string {
  return s === 'PENDING' ? '待设计' : s === 'EVALUATING' ? '设计中' : s === 'CONFIRMED' ? '待开发' : s === 'IMPLEMENTED' ? '已完成' : '待设计'
}
// 问题·状态：模板下拉 处理中/已处理（无“待处理/已解决/已关闭”），非未处理态一律归并入“已处理”
function issStatusToCN(s: string): string {
  return s === 'RESOLVED' || s === 'CLOSED' ? '已处理' : '处理中'
}
// 待办·任务状态：模板下拉 已完成/未完成（无“待办/进行中/已逾期”），非完成态归并入“未完成”
function todoStatusToCN(s: string): string {
  return s === 'COMPLETED' ? '已完成' : '未完成'
}
// 每周·任务状态：模板下拉 已完成/未完成，非完成态归并入“未完成”
function weeklyStatusToCN(s: WeeklyReportEntry['is_completed']): string {
  return s === 'COMPLETED' ? '已完成' : '未完成'
}

// ---------- 项目管理（父子分层 · DFS 映射）----------
export function fillProject(ws: XLSX.WorkSheet, tasks: ProjectTask[]): ProjectGridLayout {
  const hr = findHeaderRow(ws, ['序号']) ?? 0
  const cSeq = colOf(ws, hr, '序号')
  if (cSeq < 0) return { dataStartRow: (hr + ONE) + TWO, rows: [] }
  const cTask = colOf(ws, hr, '任务')
  const cOwner = colOf(ws, hr, '跟进人')
  const cStart = colOf(ws, hr, '计划启动日期')
  const cNat = colOf(ws, hr, '自然日工时')
  const cProg = colOf(ws, hr, '当前完成度')
  const cNote = colOf(ws, hr, '任务完成情况说明')

  // 建树（parent_id）：父子 DFS 先序，并生成真正的层级序号（根=1，子=1.1，孙=1.1.1…）
  const childrenOf = new Map<number | null, ProjectTask[]>()
  for (const t of tasks) {
    const k = t.parent_id ?? null
    const arr = childrenOf.get(k)
    if (arr) arr.push(t)
    else childrenOf.set(k, [t])
  }
  const serialOf = new Map<number, string>()
  const nodeList: ProjectTask[] = []
  const traverse = (nodes: ProjectTask[], parentSerial: string) => {
    nodes.forEach((n, i) => {
      const s = parentSerial ? `${parentSerial}.${i + ONE}` : String(i + ONE)
      serialOf.set(n.id, s)
      nodeList.push(n)
      const ch = childrenOf.get(n.id)
      if (ch && ch.length) traverse(ch, s)
    })
  }
  const roots = [...(childrenOf.get(null) || [])]
  traverse(roots, '')
  const seen = new Set(nodeList.map((n) => n.id))
  const orphans = tasks.filter((t) => !seen.has(t.id))
  if (orphans.length) {
    let k = roots.length
    for (const o of orphans) {
      k += 1
      const s = String(k)
      serialOf.set(o.id, s)
      nodeList.push(o)
      const ch = childrenOf.get(o.id)
      if (ch && ch.length) traverse(ch, s)
    }
  }

  // 旧版：isParentRow 就近跳模板既有格位，固定网格塞不下 0 深任务树 → 越界 break 丢弃。
  // 新版：全量展开为行，交给 projectGridWriter.rebuildProjectRows 按模板蓝图重排(阶段行公式按真实子行区间)。
  const dataStartRow = (hr + ONE) + TWO
  const rows: ProjectGridRow[] = nodeList.map((node, i) => ({
    row: dataStartRow + i,
    kind: node.parent_id === null ? 'phase' : 'task',
    serial: serialOf.get(node.id) ?? String(i + ONE),
    name: node.task_name,
    owner: node.owner ?? '',
    startSerial: node.parent_id === null ? null : dateSerial(node.start_date),
    natural: node.parent_id === null ? null : (node.natural_days || node.work_days || 0),
    progress: node.parent_id === null ? null : (node.progress || 0) / HUNDRED,
    remark: node.remark ?? '',
    childRows: [],
  }))
  // 阶段行的子行区间：其紧随其后的连续任务行(即阶段下所有后代行)
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].kind !== 'phase') continue
    const kids: number[] = []
    for (let j = i + 1; j < rows.length && rows[j].kind !== 'phase'; j++) kids.push(rows[j].row)
    rows[i].childRows = kids
  }
  return { dataStartRow, rows }
}

// ---------- 每周工作情况（本周/下周双表头）----------
export function fillWeekly(ws: XLSX.WorkSheet, entries: WeeklyReportEntry[]): CellPatch[] {
  const patches: CellPatch[] = []
  // 只导出最新一期（最大 week_number），不导出历期
  const latestWeek = entries.reduce((m, e) => Math.max(m, e.week_number || 0), 0)
  const cur = entries.filter((e) => e.section === 'CURRENT' && (e.week_number || 0) === latestWeek)
  const next = entries.filter((e) => e.section === 'NEXT' && (e.week_number || 0) === latestWeek)
  const headers = findHeaderRows(ws, ['序号'])
  const h1 = headers.length > 0 ? headers[0] : 0
  const d1 = h1 + TWO
  const h2 = headers.length > 1 ? headers[1] : h1
  const d2 = h2 + TWO
  const cs = colOf(ws, h1, '序号')
  const ct = colOf(ws, h1, '任务')
  const cps = colOf(ws, h1, '计划开始时间')
  const cpe = colOf(ws, h1, '计划完成时间')
  const cas = colOf(ws, h1, '实际开始时间')
  const cae = colOf(ws, h1, '实际完成时间')
  const cA = colOf(ws, h1, '主要负责人')
  const cB = cA + ONE
  const cn = colOf(ws, h1, '完成情况')
  const cst = colOf(ws, h1, '任务状态')
  const w = (row: number, e: WeeklyReportEntry, idx: number) => {
    if (cs >= 0) patch(patches, row, cs, String(idx))
    if (ct >= 0) patch(patches, row, ct, e.task_name)
    if (cps >= 0) patch(patches, row, cps, e.plan_start_date, true)
    if (cpe >= 0) patch(patches, row, cpe, e.plan_end_date, true)
    if (cas >= 0) patch(patches, row, cas, e.actual_start_date, true)
    if (cae >= 0) patch(patches, row, cae, e.actual_end_date, true)
    if (cA >= 0) patch(patches, row, cA, e.owner_party_a ?? '')
    if (cB >= 0) patch(patches, row, cB, e.owner_party_b ?? '')
    if (cn >= 0) patch(patches, row, cn, e.completion_note ?? '')
    if (cst >= 0) patch(patches, row, cst, weeklyStatusToCN(e.is_completed))
  }
  cur.forEach((e, i) => w(d1 + i, e, i + ONE))
  next.forEach((e, i) => w(d2 + i, e, i + ONE))
  return patches
}

// ---------- 其他待办事项 ----------
export function fillTodo(ws: XLSX.WorkSheet, items: ProjectTodoItem[]): CellPatch[] {
  const patches: CellPatch[] = []
  const hr = findHeaderRow(ws, ['编号', '序号']) ?? 0
  const ds = hr + ONE
  const cSeq = colOf(ws, hr, '编号')
  const cContent = colOf(ws, hr, '代办事项说明')
  const cPeople = colOf(ws, hr, '涉及人员')
  const cPlan = colOf(ws, hr, '计划完成时间')
  const cNote = colOf(ws, hr, '当前完成情况')
  const cActual = colOf(ws, hr, '实际完成时间')
  const cStatus = colOf(ws, hr, '任务状态')
  const cRemark = colOf(ws, hr, '备注')
  items.forEach((x, i) => {
    const rr = ds + i
    if (cSeq >= 0) patch(patches, rr, cSeq, String(i + ONE))
    if (cContent >= 0) patch(patches, rr, cContent, x.content)
    if (cPeople >= 0) patch(patches, rr, cPeople, x.related_people ?? '')
    if (cPlan >= 0) patch(patches, rr, cPlan, x.plan_date, true)
    if (cNote >= 0) patch(patches, rr, cNote, x.completion_note ?? '')
    if (cActual >= 0) patch(patches, rr, cActual, x.actual_date, true)
    if (cStatus >= 0) patch(patches, rr, cStatus, todoStatusToCN(x.status))
    if (cRemark >= 0) patch(patches, rr, cRemark, x.remark ?? '')
  })
  return patches
}

// ---------- 项目风险登记册 ----------
export function fillRisk(ws: XLSX.WorkSheet, items: ProjectIssue[]): CellPatch[] {
  const patches: CellPatch[] = []
  const hr = findHeaderRow(ws, ['序号']) ?? 0
  const ds = hr + ONE
  const cSeq = colOf(ws, hr, '序号')
  const cTitle = colOf(ws, hr, '风险描述')
  const cLevel = colOf(ws, hr, '等级')
  const cFound = colOf(ws, hr, '发现时间')
  const cImpact = colOf(ws, hr, '影响')
  const cPlan = colOf(ws, hr, '应对方案')
  const cOwner = colOf(ws, hr, '相关人员')
  const cResolution = colOf(ws, hr, '风险应对情况')
  const cStatus = colOf(ws, hr, '风险状态')
  const sc = cStatus >= 0 ? cStatus : colOf(ws, hr, '当前状态')
  items.forEach((x, i) => {
    const rr = ds + i
    if (cSeq >= 0) patch(patches, rr, cSeq, String(i + ONE))
    if (cTitle >= 0) patch(patches, rr, cTitle, x.title)
    if (cLevel >= 0) patch(patches, rr, cLevel, levelToCN(x.level))
    if (cFound >= 0) patch(patches, rr, cFound, x.discovered_at ?? x.created_at ?? '', true)
    if (cImpact >= 0) patch(patches, rr, cImpact, x.description ?? '')
    if (cPlan >= 0) patch(patches, rr, cPlan, x.solution ?? '')
    if (cOwner >= 0) patch(patches, rr, cOwner, x.owner ?? '')
    if (cResolution >= 0) patch(patches, rr, cResolution, x.resolution ?? '')
    if (sc >= 0) patch(patches, rr, sc, riskStatusToCN(x.status))
  })
  return patches
}

// ---------- 需求登记册 ----------
export function fillReq(ws: XLSX.WorkSheet, items: ProjectRequirement[]): CellPatch[] {
  const patches: CellPatch[] = []
  const hr = findHeaderRow(ws, ['序号']) ?? 0
  const ds = hr + ONE
  const cSeq = colOf(ws, hr, '序号')
  const cType = colOf(ws, hr, '需求类型')
  const cSystem = colOf(ws, hr, '归属系统')
  const cSummary = colOf(ws, hr, '需求简述')
  const cDetail = colOf(ws, hr, '需求详述')
  const cProposed = colOf(ws, hr, '提出时间')
  const cProposer = colOf(ws, hr, '提出人')
  const cStatus = colOf(ws, hr, '需求响应状态')
  items.forEach((x, i) => {
    const rr = ds + i
    if (cSeq >= 0) patch(patches, rr, cSeq, String(i + ONE))
    if (cType >= 0) patch(patches, rr, cType, x.type || 'NEW')
    if (cSystem >= 0) patch(patches, rr, cSystem, x.system ?? '')
    if (cSummary >= 0) patch(patches, rr, cSummary, x.summary)
    if (cDetail >= 0) patch(patches, rr, cDetail, x.detail ?? '')
    if (cProposed >= 0) patch(patches, rr, cProposed, x.proposed_at ?? '', true)
    if (cProposer >= 0) patch(patches, rr, cProposer, x.proposer ?? '')
    if (cStatus >= 0) patch(patches, rr, cStatus, reqStatusToCN(x.status))
  })
  return patches
}

// ---------- 问题登记册 ----------
export function fillIssueLog(ws: XLSX.WorkSheet, items: ProjectIssueLog[]): CellPatch[] {
  const patches: CellPatch[] = []
  const hr = findHeaderRow(ws, ['序号']) ?? 0
  const ds = hr + ONE
  const cSeq = colOf(ws, hr, '序号')
  const cTitle = colOf(ws, hr, '问题描述')
  const cProposer = colOf(ws, hr, '提出人')
  const cModule = colOf(ws, hr, '涉及系统及模块')
  const cFound = colOf(ws, hr, '发现时间')
  const cPlan = colOf(ws, hr, '计划解决时间')
  const cPlanSol = colOf(ws, hr, '计划解决方案')
  const cHandler = colOf(ws, hr, '问题处理人')
  const cProgress = colOf(ws, hr, '当前处理进度')
  const cActual = colOf(ws, hr, '实际处理时间')
  const cStatus = colOf(ws, hr, '问题状态')
  const sc = cStatus >= 0 ? cStatus : colOf(ws, hr, '是否已处理')
  items.forEach((x, i) => {
    const rr = ds + i
    if (cSeq >= 0) patch(patches, rr, cSeq, String(i + ONE))
    if (cTitle >= 0) patch(patches, rr, cTitle, x.title)
    if (cProposer >= 0) patch(patches, rr, cProposer, x.proposer ?? '')
    if (cModule >= 0) patch(patches, rr, cModule, x.module ?? '')
    if (cFound >= 0) patch(patches, rr, cFound, x.discovered_at ?? '', true)
    if (cPlan >= 0) patch(patches, rr, cPlan, x.plan_date, true)
    if (cPlanSol >= 0) patch(patches, rr, cPlanSol, x.plan_solution ?? '')
    if (cHandler >= 0) patch(patches, rr, cHandler, x.handler ?? '')
    if (cProgress >= 0) patch(patches, rr, cProgress, x.progress_note ?? '')
    if (cActual >= 0) patch(patches, rr, cActual, x.actual_date, true)
    if (sc >= 0) patch(patches, rr, sc, issStatusToCN(x.status))
  })
  return patches
}

// ---------- 项目成员（A..F 甲方块 + H..M 乙方块）----------
export function fillMembers(ws: XLSX.WorkSheet, members: ProjectMember[]): CellPatch[] {
  const patches: CellPatch[] = []
  const A = members.filter((m) => m.party === 'PARTY_A')
  const B = members.filter((m) => m.party === 'PARTY_B')
  const hdr = findHeaderRow(ws, ['角色']) ?? 0
  const ds = hdr + ONE
  const aRole = colOf(ws, hdr, '角色')
  const aName = colOf(ws, hdr, '姓名')
  const aContact = colOf(ws, hdr, '联系方式')
  const aPart = colOf(ws, hdr, '参与程度')
  const aImpact = colOf(ws, hdr, '影响度')
  const bRole = colOfAfter(ws, hdr, '角色', aRole + ONE)
  const bName = colOfAfter(ws, hdr, '姓名', aName + ONE)
  const bContact = colOfAfter(ws, hdr, '联系方式', aContact + ONE)
  const bPart = colOfAfter(ws, hdr, '参与程度', aPart + ONE)
  const bImpact = colOfAfter(ws, hdr, '影响度', aImpact + ONE)
  const w = (row: number, m: ProjectMember, label: string, role: number, name: number, contact: number, part: number, impact: number) => {
    if (role - ONE >= 0) patch(patches, row, role - ONE, label + String(row - ds + ONE))
    if (role >= 0) patch(patches, row, role, m.role ?? '')
    if (name >= 0) patch(patches, row, name, m.name ?? '')
    if (contact >= 0) patch(patches, row, contact, m.contact ?? '')
    if (part >= 0) patch(patches, row, part, m.participation ?? '')
    if (impact >= 0) patch(patches, row, impact, m.impact ?? '')
  }
  A.forEach((m, i) => w(ds + i, m, '甲方联系人', aRole, aName, aContact, aPart, aImpact))
  B.forEach((m, i) => w(ds + i, m, '乙方联系人', bRole, bName, bContact, bPart, bImpact))
  return patches
}

// ---------- 节假日一览表 ----------
function fillHolidays(ws: XLSX.WorkSheet, holidays: HolidayEntry[]): CellPatch[] {
  const patches: CellPatch[] = []
  const hr = findHeaderRow(ws, ['节日']) ?? 0
  const ds = hr + ONE
  const cn = colOf(ws, hr, '节日')
  const co = colOf(ws, hr, '放假时间')
  const cw = colOf(ws, hr, '上班时间')
  holidays.forEach((h, i) => {
    const rr = ds + i
    if (cn >= 0) patch(patches, rr, cn, h.name)
    if (h.type === 'HOLIDAY') { if (co >= 0) patch(patches, rr, co, h.date, true) }
    else if (cw >= 0) patch(patches, rr, cw, h.date, true)
  })
  return patches
}

// ============ 导出入口 ============
export interface TemplateData {
  tasks: ProjectTask[]
  risks: ProjectIssue[]
  requirements: ProjectRequirement[]
  issues: ProjectIssueLog[]
  todos: ProjectTodoItem[]
  weekly: WeeklyReportEntry[]
  members: ProjectMember[]
  holidays: HolidayEntry[]
}

/** 把各数据集按模板规则收集为 [sheet, patches]，交给 applyPatchesToTemplate 保真写入 */
export function fillAll(wb: XLSX.WorkBook, data: TemplateData): SheetPatch[] {
  const out: SheetPatch[] = []
  const find = (kw: string) => {
    const k = wb.SheetNames.find((n) => n.includes(kw))
    return k ? { name: k, ws: wb.Sheets[k] } : undefined
  }
  const push = (kw: string, fn: (ws: XLSX.WorkSheet) => CellPatch[]) => {
    const found = find(kw)
    if (!found) return
    const patches = fn(found.ws)
    if (patches.length) out.push({ sheetName: found.name, patches })
  }
  {
    const proj = find('项目管理')
    if (proj) out.push({ sheetName: proj.name, projectGrid: fillProject(proj.ws, data.tasks) })
  }
  push('每周工作情况', (ws) => fillWeekly(ws, data.weekly))
  push('待办', (ws) => fillTodo(ws, data.todos))
  push('风险', (ws) => fillRisk(ws, data.risks))
  push('需求登记册', (ws) => fillReq(ws, data.requirements))
  push('问题登记册', (ws) => fillIssueLog(ws, data.issues))
  push('项目成员', (ws) => fillMembers(ws, data.members))
  push('节假日', (ws) => fillHolidays(ws, data.holidays))
  return out
}