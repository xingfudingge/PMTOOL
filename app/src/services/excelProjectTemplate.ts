/**
 * PMTool V2.0 · 整项目模板导出（归集所有功能导出为一个模板工作簿）
 * 2026-09-13 · 维护者要求「导出模版里所有内容，包含节假日」
 *
 * 复现真实模板 app/src/assets/templates/pmtool_project_template.xlsx 的 sheet 集合：
 *   项目管理(含甘特时间轴) / 每周工作情况以及下周计划 / 开发任务具体排期 /
 *   项目风险登记册 / 需求登记册 / 问题登记册 / 其他代办事项 / 节假日一览表
 *
 * 复用各 per-feature 导出函数（其行结构已与真实模板对齐），拆出各自 sheet 后
 * 归入同一工作簿；「开发任务具体排期」由任务树生成层级序号；节假日一览表
 * 单独由 HolidayEntry[] 生成。
 */

import * as XLSX from 'xlsx'
import { exportProjectsToExcel, type ProjectTask } from './excelProjects'
import { exportWeeklyToExcel, type WeeklyReportEntry } from './excelWeekly'
import { exportRisksToExcel, type ProjectIssue } from './excelRisks'
import { exportRequirementsToExcel } from './excelRegisters'
import { exportIssueLogToExcel } from './excelRegisters'
import { exportTodoItemsToExcel } from './excelRegisters'
import { type ProjectRequirement } from './projectRequirements'
import { type ProjectIssueLog } from './projectIssueLog'
import { type ProjectTodoItem } from './projectTodoItems'
import type { HolidayEntry } from './holidayProvider'

/** 整项目导出入参（各数据集由调用方获取后传入）*/
export interface WholeProjectData {
  tasks: ProjectTask[]
  risks: ProjectIssue[]
  requirements: ProjectRequirement[]
  issues: ProjectIssueLog[]
  todos: ProjectTodoItem[]
  weeklyEntries: WeeklyReportEntry[]
  holidays: HolidayEntry[]
}

/** 取某个导出函数产出的 Blob 里的指定 sheet（按名称模糊匹配）*/
async function sheetFromBlob(
  run: () => Promise<Blob>,
  keyword: string,
): Promise<XLSX.WorkSheet> {
  const blob = await run()
  const wb = XLSX.read(await blob.arrayBuffer(), { type: 'array' })
  const key = wb.SheetNames.find((n) => n.includes(keyword)) ?? wb.SheetNames[0]
  return wb.Sheets[key]
}

/** 生成「开发任务具体排期」sheet：任务树 DFS 计算层级序号（1 / 1.1 / 1.1.1）*/
function buildScheduleSheet(tasks: ProjectTask[]): XLSX.WorkSheet {
  const byId = new Map<number, { task: ProjectTask; serial: string }>()
  for (const t of tasks) byId.set(t.id, { task: t, serial: '' })

  function assign(id: number, prefix: string, counter: { n: number }) {
    const node = byId.get(id)
    if (!node) return
    node.serial = prefix ? `${prefix}.${counter.n}` : String(counter.n)
    counter.n++
    const children = tasks.filter((x) => x.parent_id === id)
    if (children.length) {
      const c = { n: 1 }
      for (const ch of children) assign(ch.id, node.serial, c)
    }
  }

  let top = 1
  for (const t of tasks.filter((x) => x.parent_id == null)) assign(t.id, '', { n: top++ })

  const aoa: unknown[][] = [['序号', '任务', '跟进人', '计划启动日期', '计划完成日期', '当前完成度']]
  for (const t of tasks) {
    aoa.push([
      byId.get(t.id)?.serial ?? '',
      t.task_name,
      t.owner ?? '',
      t.start_date ?? '',
      t.end_date ?? '',
      Math.round(t.progress) / 100,
    ])
  }
  return XLSX.utils.aoa_to_sheet(aoa)
}

/** 生成「节假日一览表」sheet（表头对齐模板：节日/放假时间/上班时间）*/
function buildHolidaySheet(holidays: HolidayEntry[]): XLSX.WorkSheet {
  const aoa: unknown[][] = [['节日', '放假时间', '', '上班时间', '', '说明']]
  for (const h of holidays) {
    if (h.type === 'HOLIDAY') aoa.push([h.name, h.date, '', '', '', '放假'])
    else aoa.push([h.name, '', '', h.date, '', '调休上班'])
  }
  return XLSX.utils.aoa_to_sheet(aoa)
}

/**
 * 导出整项目模板 → 单工作簿 Blob
 * 包含：项目管理(甘特) / 每周工作情况 / 开发任务具体排期 / 项目风险登记册 /
 *       需求登记册 / 问题登记册 / 其他代办事项 / 节假日一览表
 */
export async function exportWholeProjectExcel(data: WholeProjectData): Promise<Blob> {
  const out = XLSX.utils.book_new()

  XLSX.utils.book_append_sheet(
    out,
    await sheetFromBlob(() => exportProjectsToExcel(data.tasks), '项目管理'),
    '项目管理',
  )
  XLSX.utils.book_append_sheet(
    out,
    await sheetFromBlob(() => exportWeeklyToExcel(data.weeklyEntries), '每周工作情况'),
    '每周工作情况以及下周计划',
  )
  XLSX.utils.book_append_sheet(out, buildScheduleSheet(data.tasks), '开发任务具体排期')
  XLSX.utils.book_append_sheet(
    out,
    await sheetFromBlob(() => exportRisksToExcel(data.risks), '风险'),
    '项目风险登记册',
  )
  XLSX.utils.book_append_sheet(
    out,
    await sheetFromBlob(() => exportRequirementsToExcel(data.requirements), '需求登记册'),
    '需求登记册',
  )
  XLSX.utils.book_append_sheet(
    out,
    await sheetFromBlob(() => exportIssueLogToExcel(data.issues), '问题登记册'),
    '问题登记册',
  )
  XLSX.utils.book_append_sheet(
    out,
    await sheetFromBlob(() => exportTodoItemsToExcel(data.todos), '待办'),
    '其他代办事项',
  )
  XLSX.utils.book_append_sheet(out, buildHolidaySheet(data.holidays), '节假日一览表')

  const buf = XLSX.write(out, { type: 'array', bookType: 'xlsx', cellStyles: true })
  return new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}