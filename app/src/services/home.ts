/**
 * PMTool V2.0 · 主工作区数据聚合服务
 * Phase A · P0 首页工作台重新设计（2026-08-24 维护者拍板）
 *
 * 设计依据：
 *   - 维护者 P0 要求 5 个区块：今日工作 / 进行中任务 / 近期项目 / 快速记录 / 待关注事项
 *   - RFC-02 §4：今日完成按 completed_at UTC ISO 8601 的本地日期归档
 *   - RFC-02 §3：下一工作日跳过周末
 *   - 不新增表 / 不新增 Rust command（红线）
 *   - 快速记录复用 todos 表（due_date=null · source_type=MANUAL · priority=LOW）
 *
 * 架构：WebView → services 层 → api.ts → invoke → Rust commands
 */

import {
  listProjects,
  listTodos,
  type Project,
  type Todo,
} from '@/database/api'
import {
  listProjectTasks,
  computeProjectOverallProgress,
  type ProjectTask,
} from '@/services/projectTasks'
import {
  listProjectIssues,
  type ProjectIssue,
} from '@/services/projectIssues'

/** 进行中任务按项目聚合 */
export interface InProgressTasksByProject {
  projectId: number
  projectName: string
  customerName: string | null
  tasks: ProjectTask[]
}

/** 近期项目（含进度 · 按剩余天数升序）*/
export interface RecentProject {
  projectId: number
  projectName: string
  customerName: string | null
  progress: number
  remainingDays: number | null
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
}

/** 待关注事项（聚合排序后的统一结构）*/
export type AttentionItemType =
  | 'OVERDUE_TODO'
  | 'UPCOMING_TODO'
  | 'URGENT_PROJECT'
  | 'OPEN_ISSUE'

export interface AttentionItem {
  type: AttentionItemType
  severity: 1 | 2 | 3 // 1=最紧急
  title: string
  subtitle: string
  href: string // 跳转目标（项目详情 / 待办详情 / 问题详情）
  meta: {
    projectId?: number
    projectName?: string
    todoId?: number
    issueId?: number
    daysOverdue?: number
    daysLeft?: number
    level?: ProjectIssue['level']
  }
}

/** 主工作区聚合数据 */
export interface HomeData {
  /** 本地日期 YYYY-MM-DD */
  todayLocal: string
  todayISO: string
  weekdayCN: string

  /** 今日工作（来自 todos · due_date=today）*/
  todayPendingTodos: Todo[]
  /** 今日已完成 */
  todayCompletedTodos: Todo[]
  /** 下一工作日 YYYY-MM-DD */
  nextWorkday: string
  /** 下一工作日计划 */
  nextWorkdayTodos: Todo[]

  /** 进行中任务（按项目分组 · 每个项目最多 5 个）*/
  inProgressTasksByProject: InProgressTasksByProject[]

  /** 近期项目（含加权平均进度 · 按剩余天数升序）*/
  recentProjects: RecentProject[]

  /** 快速记录（due_date=null · 最近 5 条）*/
  quickNotes: Todo[]

  /** 待关注事项（已按严重程度排序）*/
  attentionItems: AttentionItem[]

  /** 一句话总览用计数 */
  counts: {
    todayPending: number
    todayCompleted: number
    inProgressProjects: number
    inProgressTasks: number
    quickNotes: number
    attention: number
  }
}

// ============================================================
// 加载主工作区数据
// ============================================================

/**
 * 加载主工作区数据
 * 实现维护者 P0 的 5 个区块：
 *   1. 今日工作：due_date=today + status ∈ {PENDING, IN_PROGRESS}
 *   2. 进行中任务：按项目分组的 status=IN_PROGRESS 任务
 *   3. 近期项目：status=IN_PROGRESS 的项目 + 加权平均进度
 *   4. 快速记录：due_date=null 的 MANUAL todo（最近 5 条）
 *   5. 待关注事项：延期 + 即将到期 + 紧急项目 + OPEN issues
 */
export async function loadHomeData(): Promise<HomeData> {
  const now = new Date()
  const todayLocal = formatLocalDate(now)
  const nextWorkday = computeNextWorkday(now)
  const weekdayCN = getWeekdayCN(now)

  // 并行取基础数据
  const [activeProjects, allTodos] = await Promise.all([
    listProjects({ status: 'EXECUTING' }),
    listTodos({}),
  ])

  // ============ 1. 今日工作 ============
  const todayPendingTodos = allTodos
    .filter(
      (t) =>
        (t.status === 'PENDING' || t.status === 'IN_PROGRESS') &&
        t.due_date === todayLocal,
    )
    .sort(priorityFirstThenDate)

  // ============ 今日已完成 ============
  const todayCompletedTodos = allTodos.filter((t) => {
    if (t.status !== 'COMPLETED' || !t.completed_at) return false
    return extractLocalDate(t.completed_at) === todayLocal
  })

  // ============ 下一工作日计划 ============
  const nextWorkdayTodos = allTodos.filter(
    (t) => t.status === 'PENDING' && t.due_date === nextWorkday,
  )

  // ============ 4. 快速记录（due_date=null + 优先级 LOW）========
  const quickNotes = allTodos
    .filter(
      (t) =>
        t.status === 'PENDING' &&
        t.due_date === null &&
        t.priority === 'LOW' &&
        t.source_type === 'MANUAL',
    )
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 5)

  // ============ 2. 进行中任务（按项目分组）========
  // 只取 IN_PROGRESS 状态的项目
  const projectsForTasks = activeProjects.slice(0, 6) // 限制前 6 个项目避免 N+1 查询过载
  const tasksByProjectResults = await Promise.all(
    projectsForTasks.map(async (p) => {
      const tasks = await listProjectTasks(p.id)
      const inProgress = tasks.filter((t) => t.status === 'IN_PROGRESS')
      return {
        projectId: p.id,
        projectName: p.project_name,
        customerName: p.customer_name,
        tasks: inProgress.slice(0, 5), // 每个项目最多 5 个
      }
    }),
  )
  const inProgressTasksByProject = tasksByProjectResults.filter(
    (g) => g.tasks.length > 0,
  )

  // ============ 3. 近期项目（含加权平均进度 · 按剩余天数升序）========
  const recentProjectsRaw = await Promise.all(
    activeProjects.map(async (p) => {
      const progress = await computeProjectOverallProgress(p.id)
      return {
        projectId: p.id,
        projectName: p.project_name,
        customerName: p.customer_name,
        progress,
        remainingDays: computeRemainingDays(p.end_date, todayLocal),
        priority: p.priority,
      }
    }),
  )
  // 按剩余天数升序（紧迫在前），无截止日期放最后
  const recentProjects = recentProjectsRaw.sort((a, b) => {
    if (a.remainingDays === null && b.remainingDays === null) return 0
    if (a.remainingDays === null) return 1
    if (b.remainingDays === null) return -1
    return a.remainingDays - b.remainingDays
  })

  // ============ 5. 待关注事项（聚合排序）========
  const attentionItems = await aggregateAttentionItems(
    allTodos,
    activeProjects,
    todayLocal,
  )

  // ============ 一句话总览计数 ============
  const inProgressTasksCount = inProgressTasksByProject.reduce(
    (sum, g) => sum + g.tasks.length,
    0,
  )
  const counts = {
    todayPending: todayPendingTodos.length,
    todayCompleted: todayCompletedTodos.length,
    inProgressProjects: activeProjects.length,
    inProgressTasks: inProgressTasksCount,
    quickNotes: quickNotes.length,
    attention: attentionItems.length,
  }

  return {
    todayLocal,
    todayISO: now.toISOString(),
    weekdayCN,
    todayPendingTodos,
    todayCompletedTodos,
    nextWorkday,
    nextWorkdayTodos,
    inProgressTasksByProject,
    recentProjects,
    quickNotes,
    attentionItems,
    counts,
  }
}

// ============================================================
// 工具函数
// ============================================================

/** 优先级排序：URGENT > HIGH > NORMAL > LOW */
function priorityRank(p: Todo['priority']): number {
  return { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 }[p] ?? 2
}

/** 今日工作排序：紧急度优先 + 同优先级按 due_date 升序 */
function priorityFirstThenDate(a: Todo, b: Todo): number {
  const pr = priorityRank(a.priority) - priorityRank(b.priority)
  if (pr !== 0) return pr
  const ad = a.due_date ?? '9999-12-31'
  const bd = b.due_date ?? '9999-12-31'
  return ad.localeCompare(bd)
}

/**
 * 聚合待关注事项
 * 排序规则（severity 数字越小越紧急）：
 *   1. OVERDUE_TODO（已延期）
 *   2. URGENT_PROJECT（剩余 < 7 天）
 *   3. UPCOMING_TODO（即将到期 3 天内）
 *   4. OPEN_ISSUE（CRITICAL/HIGH）
 */
async function aggregateAttentionItems(
  allTodos: Todo[],
  activeProjects: Project[],
  todayLocal: string,
): Promise<AttentionItem[]> {
  const items: AttentionItem[] = []

  // 1. 延期 todos（due_date < today + status≠COMPLETED）
  for (const t of allTodos) {
    if (t.status === 'COMPLETED' || !t.due_date) continue
    const overdueDays = dateDiffDays(t.due_date, todayLocal)
    if (overdueDays > 0) {
      items.push({
        type: 'OVERDUE_TODO',
        severity: 1,
        title: t.title,
        subtitle: `延期 ${overdueDays} 天`,
        href: `/todo?id=${t.id}`,
        meta: { todoId: t.id, daysOverdue: overdueDays },
      })
    }
  }

  // 2. 即将到期 todos（0 ≤ 剩余 ≤ 3 天 + status≠COMPLETED）
  for (const t of allTodos) {
    if (t.status === 'COMPLETED' || !t.due_date) continue
    const daysLeft = dateDiffDays(todayLocal, t.due_date)
    if (daysLeft >= 0 && daysLeft <= 3) {
      items.push({
        type: 'UPCOMING_TODO',
        severity: 3,
        title: t.title,
        subtitle: daysLeft === 0 ? '今天到期' : `${daysLeft} 天后到期`,
        href: `/todo?id=${t.id}`,
        meta: { todoId: t.id, daysLeft },
      })
    }
  }

  // 3. 紧急项目（剩余天数 < 7 天的 IN_PROGRESS 项目）
  for (const p of activeProjects) {
    if (!p.end_date) continue
    const daysLeft = dateDiffDays(todayLocal, p.end_date)
    if (daysLeft >= 0 && daysLeft < 7) {
      items.push({
        type: 'URGENT_PROJECT',
        severity: 2,
        title: p.project_name,
        subtitle: `剩 ${daysLeft} 天`,
        href: `/projects/${p.id}`,
        meta: { projectId: p.id, projectName: p.project_name, daysLeft },
      })
    }
  }

  // 4. OPEN 状态 issues（按严重度排序）
  for (const p of activeProjects) {
    const issues = await listProjectIssues(p.id)
    for (const issue of issues) {
      if (issue.status !== 'OPEN') continue
      if (issue.level !== 'CRITICAL' && issue.level !== 'HIGH') continue
      items.push({
        type: 'OPEN_ISSUE',
        severity: issue.level === 'CRITICAL' ? 1 : 2,
        title: issue.title,
        subtitle: `${issue.level} · ${p.project_name}`,
        href: `/projects/${p.id}?tab=issues&issue=${issue.id}`,
        meta: {
          projectId: p.id,
          projectName: p.project_name,
          issueId: issue.id,
          level: issue.level,
        },
      })
    }
  }

  // 按 severity 排序（同 severity 按 title 字典序保持稳定）
  items.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity - b.severity
    return a.title.localeCompare(b.title)
  })

  // 限制最多 8 条（避免首页过长）
  return items.slice(0, 8)
}

/**
 * 日期差（天）· 第二个 - 第一个
 *   dateDiffDays('2026-08-22', '2026-08-29') === 7
 *   dateDiffDays('2026-08-29', '2026-08-22') === -7
 */
function dateDiffDays(fromLocal: string, toLocal: string): number {
  const from = new Date(fromLocal + 'T00:00:00')
  const to = new Date(toLocal + 'T00:00:00')
  const ms = to.getTime() - from.getTime()
  return Math.round(ms / (1000 * 60 * 60 * 24))
}

/**
 * Date → YYYY-MM-DD（本地时区）
 */
export function formatLocalDate(d: Date): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/**
 * ISO 8601 字符串 → 本地日期 YYYY-MM-DD
 */
export function extractLocalDate(isoString: string): string {
  const d = new Date(isoString)
  return formatLocalDate(d)
}

/**
 * 下一工作日（跳过周末）
 */
export function computeNextWorkday(from: Date): string {
  const d = new Date(from)
  d.setDate(d.getDate() + 1)
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1)
  }
  return formatLocalDate(d)
}

/**
 * 中文星期几
 */
export function getWeekdayCN(d: Date): string {
  const weekdays = ['日', '一', '二', '三', '四', '五', '六']
  return `星期${weekdays[d.getDay()]}`
}

/**
 * 项目剩余天数（end_date - todayLocal，含今天）
 */
export function computeRemainingDays(
  endDate: string | null,
  todayLocal: string,
): number | null {
  if (!endDate) return null
  const diffDays = dateDiffDays(todayLocal, endDate)
  return diffDays >= 0 ? diffDays : 0
}