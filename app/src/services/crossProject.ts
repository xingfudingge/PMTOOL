/**
 * PMTool V2.0 · 跨项目任务聚合
 * Phase A · alpha 化（2026-08-24 · 维护者要求）
 *
 * 用途：TodoPage 的"项目任务关联"+"今日计划"视图
 * 数据源（不新增表 / 不新增 Rust command · 复用已有 API）：
 *   - listProjects (WebView 已有)
 *   - listProjectTasks(projectId) (WebView 已有)
 *   - listTodos (WebView 已有)
 */

import { listProjects, listTodos } from '@/database/api'
import {
  listProjectTasks,
  type ProjectTask,
} from '@/services/projectTasks'

// ============================================================
// 类型
// ============================================================

export interface ProjectTaskWithProject extends ProjectTask {
  /** 所属项目信息（来自 listProjects） */
  projectName: string
  customerName: string | null
}

/** 今日计划项（todos + project_tasks 合并 · 统一按优先级排序） */
export interface TodayPlanItem {
  source: 'TODO' | 'PROJECT_TASK'
  id: number
  title: string
  priority: 'URGENT' | 'HIGH' | 'NORMAL' | 'LOW'
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'DELAYED'
  due_date: string
  /** 项目任务才有 */
  projectId?: number
  projectName?: string
  customerName?: string | null
  /** todos 才有 */
  sourceType?: 'MANUAL' | 'WEEKLY' | 'RECURRING'
}

// ============================================================
// 跨项目任务加载
// ============================================================

/**
 * 加载所有进行中项目的未完成任务
 *   - 遍历 projects (status = IN_PROGRESS)
 *   - 对每个项目调 listProjectTasks
 *   - 合并并排序（按 end_date 升序 · 无日期放最后）
 */
export async function loadActiveProjectTasks(): Promise<ProjectTaskWithProject[]> {
  const projects = await listProjects({ status: 'EXECUTING' })
  const allTasks: ProjectTaskWithProject[] = []

  await Promise.all(
    projects.map(async (p) => {
      try {
        const tasks = await listProjectTasks(p.id)
        const withProject = tasks
          .filter((t) => t.status !== 'COMPLETED')
          .map((t) => ({
            ...t,
            projectName: p.project_name,
            customerName: p.customer_name,
          }))
        allTasks.push(...withProject)
      } catch (e) {
        // 单个项目失败不阻塞整体
        console.warn(`加载项目 #${p.id} 任务失败`, e)
      }
    }),
  )

  // 排序：按 end_date 升序 · 延期在前 · 无日期放最后
  return allTasks.sort((a, b) => {
    const ad = a.end_date ?? '9999-99-99'
    const bd = b.end_date ?? '9999-99-99'
    return ad.localeCompare(bd)
  })
}

// ============================================================
// 今日计划聚合
// ============================================================

/**
 * 加载今日计划（todos + project_tasks · 统一按优先级排好）
 *   - todos: due_date = today + status IN (PENDING, IN_PROGRESS)
 *   - project_tasks: end_date = today + status IN (PENDING, IN_PROGRESS)
 *   - 合并排序：URGENT > HIGH > NORMAL > LOW · 同优先级按时间
 */
export async function loadTodayPlan(): Promise<TodayPlanItem[]> {
  const today = todayLocal()

  const [allTodos, projects] = await Promise.all([
    listTodos({}),
    listProjects(undefined),
  ])

  // 今日到期的 todos
  const todayTodos: TodayPlanItem[] = allTodos
    .filter(
      (t) =>
        t.due_date === today &&
        (t.status === 'PENDING' || t.status === 'IN_PROGRESS'),
    )
    .map((t) => ({
      source: 'TODO' as const,
      id: t.id,
      title: t.title,
      priority: t.priority,
      status: t.status,
      due_date: t.due_date!,
      sourceType: t.source_type,
    }))

  // 今日到期的 project_tasks
  const todayProjectTasks: TodayPlanItem[] = []
  await Promise.all(
    projects
      .filter((p) => p.status === 'EXECUTING')
      .map(async (p) => {
        try {
          const tasks = await listProjectTasks(p.id)
          for (const t of tasks) {
            if (t.end_date !== today) continue
            if (t.status === 'COMPLETED') continue
            todayProjectTasks.push({
              source: 'PROJECT_TASK',
              id: t.id,
              title: t.task_name,
              priority: 'NORMAL', // project_tasks 无 priority 字段
              status: t.status,
              due_date: today,
              projectId: p.id,
              projectName: p.project_name,
              customerName: p.customer_name,
            })
          }
        } catch (e) {
          console.warn(`加载项目 #${p.id} 任务失败`, e)
        }
      }),
  )

  return [...todayTodos, ...todayProjectTasks].sort(
    (a, b) => priorityRank(a.priority) - priorityRank(b.priority),
  )
}

function priorityRank(p: TodayPlanItem['priority']): number {
  return { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 }[p]
}

function todayLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}