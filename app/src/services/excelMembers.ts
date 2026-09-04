/**
 * PMTool V2.0 · 项目成员 sheet ↔ project_members Excel 导入导出
 * Phase 4 · 维护者 2026-08-26
 *
 * 设计依据：
 *   - 模板 app/src/assets/templates/pmtool_project_template.xlsx
 *   - sheet 名「项目成员」
 *   - 两个并排块（甲方相关方 + 启明相关方），每块 5 列：角色 / 姓名 / 联系方式 /
 *     项目参与程度 / 对项目影响度
 *   - 模板里实际为「启明相关方」（乙方内部代号），对外显示用「乙方」
 *
 * 关键设计选择：
 *   1. 直接读单元格（左右两块并排，sheet_to_json 会混淆列）
 *   2. 甲方块：A-F 列；乙方块：H-M 列；G 为空分隔列
 *   3. ★ 字符直接落库（不做枚举转换），保证导入导出 round-trip 一致
 *   4. 姓名必填为空则跳过整行；姓名存在但其它字段为空 → 保留（可能是占位行）
 *   5. 导出按维护者要求：先 8 行甲方空模板 + 8 行乙方空模板 + 相关度说明块
 */

import * as XLSX from 'xlsx'

// ============================================================
// 类型（设计 schema · 表 project_members 尚未建立）
// ============================================================

export interface ProjectMember {
  id: number
  project_id: number
  party: 'PARTY_A' | 'PARTY_B'
  role: string | null
  name: string
  contact: string | null
  participation: string | null
  impact: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

// ============================================================
// 常量
// ============================================================

/** Sheet 名（与模板完全一致）*/
const SHEET_NAME = '项目成员'

/** 甲方块列位置（0-indexed）*/
const COL_A = {
  label: 0, // A · 「甲方联系人N」
  role: 1, // B
  name: 2, // C
  contact: 3, // D
  participation: 4, // E
  impact: 5, // F
}

/** 乙方块列位置（0-indexed）*/
const COL_B = {
  label: 7, // H · 「乙方联系人N」
  role: 8, // I
  name: 9, // J
  contact: 10, // K
  participation: 11, // L
  impact: 12, // M
}

/** 每块行数（甲方/乙方各 8 个联系人槽位）*/
const ROWS_PER_BLOCK = 8

/** 数据行起始（0-indexed）= row 2 = 1-indexed 第 3 行 */
const DATA_START_ROW = 2

// ============================================================
// 内部 helpers
// ============================================================

function toStr(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s ? s : null
}

/** 取单元格值（按 sheet/行/列）*/
function cellAt(sheet: XLSX.WorkSheet, r: number, c: number): unknown {
  const addr = XLSX.utils.encode_cell({ r, c })
  const cell = sheet[addr]
  return cell ? cell.v : ''
}

/** 把单块列位置映射为 Excel 行 */
function readBlock(
  sheet: XLSX.WorkSheet,
  cols: typeof COL_A | typeof COL_B,
  party: ProjectMember['party'],
  rangeEnd: number,
  projectId: number,
): ProjectMember[] {
  const members: ProjectMember[] = []
  let sortOrder = 0
  for (let r = DATA_START_ROW; r <= rangeEnd; r++) {
    const nameRaw = toStr(cellAt(sheet, r, cols.name))
    const roleRaw = toStr(cellAt(sheet, r, cols.role))
    const contactRaw = toStr(cellAt(sheet, r, cols.contact))
    const participationRaw = toStr(cellAt(sheet, r, cols.participation))
    const impactRaw = toStr(cellAt(sheet, r, cols.impact))

    // 整行全空 → 跳过（保留槽位由导出补齐）
    if (!nameRaw && !roleRaw && !contactRaw && !participationRaw && !impactRaw) {
      continue
    }

    members.push({
      id: 0, // 占位
      project_id: projectId,
      party,
      role: roleRaw,
      name: nameRaw ?? '',
      contact: contactRaw,
      participation: participationRaw,
      impact: impactRaw,
      sort_order: sortOrder++,
      created_at: '',
      updated_at: '',
    })
  }
  return members
}

// ============================================================
// 公开 API
// ============================================================

/** 解析项目成员 sheet → ProjectMember[] */
export async function parseMembersExcel(
  file: File,
  projectId: number,
): Promise<ProjectMember[]> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const sheet = wb.Sheets[SHEET_NAME]
  if (!sheet) {
    throw new Error(`Sheet "${SHEET_NAME}" 不存在（模板应为 6 个 sheet）`)
  }

  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1')
  const rangeEnd = range.e.r

  // 甲方块（A-F）
  const partyA = readBlock(sheet, COL_A, 'PARTY_A', rangeEnd, projectId)
  // 乙方块（H-M）
  const partyB = readBlock(sheet, COL_B, 'PARTY_B', rangeEnd, projectId)

  // 甲方先，再乙方（与导出顺序保持一致）
  return [
    ...partyA.map((m, idx) => ({ ...m, sort_order: idx })),
    ...partyB.map((m, idx) => ({ ...m, sort_order: partyA.length + idx })),
  ]
}

/** ProjectMember → Excel 行（按 party 拆到左右两块）*/
function buildMemberRowsForExport(members: ProjectMember[]): { left: unknown[][]; right: unknown[][] } {
  const left: unknown[][] = []
  const right: unknown[][] = []

  const partyA = members.filter((m) => m.party === 'PARTY_A')
  const partyB = members.filter((m) => m.party === 'PARTY_B')

  for (let i = 0; i < ROWS_PER_BLOCK; i++) {
    const a = partyA[i]
    left.push([
      `甲方联系人${i + 1}`,
      a?.role ?? '',
      a?.name ?? '',
      a?.contact ?? '',
      a?.participation ?? '',
      a?.impact ?? '',
    ])
  }
  for (let i = 0; i < ROWS_PER_BLOCK; i++) {
    const b = partyB[i]
    right.push([
      `乙方联系人${i + 1}`,
      b?.role ?? '',
      b?.name ?? '',
      b?.contact ?? '',
      b?.participation ?? '',
      b?.impact ?? '',
    ])
  }
  return { left, right }
}

/**
 * 相关度说明块（5 行）
 * ★ = 极低，★★ = 低，★★★ = 中，★★★★ = 高，★★★★★ = 极高
 */
function buildLegendBlock(): unknown[][] {
  return [
    ['相关度', '极低', '低', '中', '高', '极高'],
    ['符号', '★', '★★', '★★★', '★★★★', '★★★★★'],
  ]
}

/** 导出 ProjectMember[] → Excel Blob */
export async function exportMembersToExcel(
  members: ProjectMember[],
): Promise<Blob> {
  // 用 aoa_to_sheet 构建并排结构
  const aoa: unknown[][] = []

  // 第 1 行：section 标题
  aoa.push(['甲方相关方', '', '', '', '', '', '', '启明相关方', '', '', '', '', '', ''])

  // 第 2 行：列头
  aoa.push([
    '', '角色', '姓名', '联系方式', '项目参与程度', '对项目影响度',
    '', '', '角色', '姓名', '联系方式', '项目参与程度', '对项目影响度',
  ])

  // 数据行（8 行甲方 + 8 行乙方）
  const { left, right } = buildMemberRowsForExport(members)
  for (let i = 0; i < ROWS_PER_BLOCK; i++) {
    const l = left[i] ?? [`甲方联系人${i + 1}`, '', '', '', '', '']
    const r = right[i] ?? [`乙方联系人${i + 1}`, '', '', '', '', '']
    aoa.push([...l, '', '', ...r])
  }

  // 空行分隔
  aoa.push([])

  // 相关度说明块
  for (const row of buildLegendBlock()) {
    aoa.push(row)
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, SHEET_NAME)

  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  return new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}