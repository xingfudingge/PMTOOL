/**
 * PMTool V2.0 · 整项目模板导出（把数据就地写入内置模板，保留表头/样式/公式）
 * 2026-09-14 · 维护者逐 sheet 规则：只替换示例数据行，其余由模板公式/条件格式自动计算
 *
 * 统一入口：loadTemplate() + excelFiller.fillAll()。所有行/列号运行时按模板表头检测
 * （findHeaderRow / colOf / colOfAfter），不写死魔数，兼容模板变体。
 * 模板含 8 个数据 sheet：项目管理 / 每周工作情况以及下周计划 / 其他待办事项 /
 *   项目风险登记册 / 需求登记册 / 问题登记册 / 项目成员 / 节假日一览表（+ 使用指南）。
 */

import { loadTemplate, applyPatchesToTemplate } from './templateWriter'
import { fillAll, type TemplateData } from './excelFiller'
import type { ProjectTask } from './excelProjects'
import type { ProjectIssue } from './excelRisks'
import type { WeeklyReportEntry } from './excelWeekly'
import type { ProjectRequirement } from './projectRequirements'
import type { ProjectIssueLog } from './projectIssueLog'
import type { ProjectTodoItem } from './projectTodoItems'
import type { ProjectMember } from './excelMembers'
import type { HolidayEntry } from './holidayProvider'

/** 整项目导出入参（各数据集由调用方获取后传入）*/
export interface WholeProjectData {
  tasks: ProjectTask[]
  risks: ProjectIssue[]
  requirements: ProjectRequirement[]
  issues: ProjectIssueLog[]
  todos: ProjectTodoItem[]
  weeklyEntries: WeeklyReportEntry[]
  members: ProjectMember[]
  holidays: HolidayEntry[]
}

/**
 * 导出整项目 → 单工作簿 Blob（就地写入内置模板，保留全部 sheet 与样式/公式）
 */
export async function exportWholeProjectExcel(data: WholeProjectData): Promise<Blob> {
  const wb = await loadTemplate()
  const payload: TemplateData = {
    tasks: data.tasks,
    risks: data.risks,
    requirements: data.requirements,
    issues: data.issues,
    todos: data.todos,
    weekly: data.weeklyEntries,
    members: data.members,
    holidays: data.holidays,
  }
  const patches = fillAll(wb, payload)
  return applyPatchesToTemplate(patches)
}