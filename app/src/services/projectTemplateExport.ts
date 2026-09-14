/**
 * PMTool V2.0 · 导出整个项目为模板文件（项目列表/概览卡片一键导出）
 * 2026-09-13 · 维护者要求「编辑项目之前有个导出项目，导出到模板里所有信息」
 *
 * 按 projectId 抓取全部数据集 → 组装模板工作簿 → 原生另存为。
 * 与 ProjectDetailPage 顶部「导出整个项目」复用同一 exportWholeProjectExcel。
 */

import { exportWholeProjectExcel } from './excelProjectTemplate'
import { saveBlobToDirectory } from './excel'
import { formatLocalDate } from './datetime'
import { listProjectTasks } from './projectTasks'
import { listProjectIssues } from './projectIssues'
import { listProjectRequirements } from './projectRequirements'
import { listProjectIssueLog } from './projectIssueLog'
import { listProjectTodoItems } from './projectTodoItems'
import { listWeeklyEntries } from './weeklyEntries'
import { listProjectMembers } from './projectMembers'
import { defaultHolidayProvider } from './holidayProvider'

/** 导出某项目全部信息到模板文件。@returns true 成功 / false 取消或失败 */
export async function exportProjectToFile(
  projectId: number,
  projectName: string,
): Promise<boolean> {
  const [tasks, risks, requirements, issues, todos, weekly, members] = await Promise.all([
    listProjectTasks(projectId),
    listProjectIssues(projectId),
    listProjectRequirements(projectId),
    listProjectIssueLog(projectId),
    listProjectTodoItems(projectId),
    listWeeklyEntries(projectId),
    listProjectMembers(projectId),
  ])
  await defaultHolidayProvider.load()
  const blob = await exportWholeProjectExcel({
    tasks,
    risks,
    requirements,
    issues,
    todos,
    weeklyEntries: weekly,
    members,
    holidays: defaultHolidayProvider.list(),
  })
  const name = `${projectName || projectId}-整项目模板-${formatLocalDate(new Date())}.xlsx`
  return saveBlobToDirectory(blob, name)
}