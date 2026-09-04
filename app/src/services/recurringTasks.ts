/**
 * PMTool V2.0 · 周期性任务服务
 * 维护者 2026-08-28
 *
 * 周期性任务定义存储在前端 localStorage（不新增数据库表）。
 * 每个周期日生成一条待办记录到 todos 表，source_type='RECURRING'。
 * 取消周期性任务时只删除未来周期的待办，已执行的保留。
 */

import { listTodos, createTodo, updateTodo } from './todo'
import { formatLocalDate } from './datetime'
import type { Todo, TodoPriority } from '@/database/api'

// ============================================================
// 类型定义
// ============================================================

export type RecurringCycle = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
export type RecurringPattern = {
  dayOfWeek?: number[] // 0= 周日，1= 周一...6= 周六（每周）
  dayOfMonth?: number[] // 1-31 数组（每月）
  month?: number // 1-12（每年）
  day?: number // 1-31（每年：几月几日）
}

export type RecurringInterval = 'ONE_WEEK' | 'ONE_MONTH' | 'ONE_YEAR' | 'PERMANENT' | 'CUSTOM'

export interface RecurringTask {
  id: number // numeric ID (timestamp) · 与 database source_id 兼容
  title: string
  content?: string
  priority: TodoPriority
  cycle: RecurringCycle
  pattern: RecurringPattern
  interval: RecurringInterval
  startDate: string // 生效开始日期
  endDate?: string // 生效结束日期（自定义时间段用）
  createdAt: string
}

// ============================================================
// localStorage 存储
// ============================================================

const RECURRING_TASKS_KEY = 'pmtool.recurringTasks'

function loadRecurringTasks(): RecurringTask[] {
  try {
    const raw = localStorage.getItem(RECURRING_TASKS_KEY)
    if (raw) return JSON.parse(raw) as RecurringTask[]
  } catch {
    // ignore
  }
  return []
}

function saveRecurringTasks(tasks: RecurringTask[]): void {
  try {
    localStorage.setItem(RECURRING_TASKS_KEY, JSON.stringify(tasks))
  } catch {
    // ignore quota
  }
}

// ============================================================
// CRUD 操作
// ============================================================

/** 创建周期性任务 */
export function createRecurringTask(
  title: string,
  content: string | undefined,
  priority: TodoPriority,
  cycle: RecurringCycle,
  pattern: RecurringPattern,
  interval: RecurringInterval,
  startDate: string,
  endDate?: string,
): RecurringTask {
  const id = Date.now() // numeric ID
  const task: RecurringTask = {
    id,
    title,
    content,
    priority,
    cycle,
    pattern,
    interval,
    startDate,
    endDate,
    createdAt: formatLocalDate(new Date()),
  }
  const tasks = loadRecurringTasks()
  tasks.push(task)
  saveRecurringTasks(tasks)
  return task
}

/** 获取所有周期性任务 */
export function listRecurringTasks(): RecurringTask[] {
  return loadRecurringTasks()
}

/** 更新周期性任务定义（id 不变 · 改标题/周期/生效时间等） */
export function updateRecurringTask(task: RecurringTask): boolean {
  const tasks = loadRecurringTasks()
  const i = tasks.findIndex((t) => t.id === task.id)
  if (i === -1) return false
  tasks[i] = { ...task, createdAt: tasks[i].createdAt }
  saveRecurringTasks(tasks)
  return true
}

/** 删除周期性任务（只删除未执行的部分） */
export async function deleteRecurringTask(taskId: number): Promise<boolean> {
  // 1. 从 localStorage 删除定义
  const tasks = loadRecurringTasks()
  const index = tasks.findIndex((t) => t.id === taskId)
  if (index === -1) return false
  tasks.splice(index, 1)
  saveRecurringTasks(tasks)

  // 2. 删除 todos 表中该周期性任务的未来待办
  // 维护者 2026-08-28: 周期性任务的 todo 用 source_type='RECURRING' + sourceId=taskId
  // 已完成的保留（不删除），只删除未执行的
  const allTodos = await listTodos({})
  const recurringTodos = allTodos.filter(
    (t) => t.source_type === 'RECURRING' && t.source_id === taskId && t.status === 'PENDING',
  )

  // 删除所有未执行的周期性待办（已执行的保留）
  const now = formatLocalDate(new Date())
  for (const todo of recurringTodos) {
    if (todo.due_date && todo.due_date >= now) {
      await updateTodo(todo.id, {
        status: 'DELAYED' as const,
        title: '[已取消] ' + todo.title,
      })
    }
  }

  return true
}

/** 取消单个周期性待办 */
export async function cancelRecurringTodo(todoId: number, originalTitle: string): Promise<boolean> {
  // 只是标记为删除，不删除历史记录
  return updateTodo(todoId, {
    status: 'DELAYED', // 维护者 2026-08-28: 用 DELAYED 代替 DELETED
    title: `[已取消] ${originalTitle}`,
  })
}

// ============================================================
// 周期性待办生成
// ============================================================

/**
 * 计算周期性任务在指定日期范围内的所有待办日期
 * @param task 周期性任务定义
 * @param from 起始日期
 * @param to 结束日期
 * @returns 所有待办日期列表
 */
export function calculateRecurringDates(task: RecurringTask, from: string, to: string): string[] {
  const dates: string[] = []
  const start = new Date(from)
  const end = new Date(to)

  // 遍历每一天，检查是否是待办日
  const cursor = new Date(start)
  while (cursor <= end) {
    const dateStr = formatLocalDate(cursor)

    // 检查是否在生效时间范围内
    if (dateStr >= task.startDate && (!task.endDate || dateStr <= task.endDate)) {
      if (isRecurringDate(task, dateStr, cursor)) {
        dates.push(dateStr)
      }
    }

    cursor.setDate(cursor.getDate() + 1)
  }

  return dates
}

/** 判断某日是否符合周期性任务的待办条件 */
function isRecurringDate(task: RecurringTask, dateStr: string, dateObj: Date): boolean {
  const cycle = task.cycle
  const pattern = task.pattern

  switch (cycle) {
    case 'DAILY':
      return true

    case 'WEEKLY':
      const dayOfWeek = dateObj.getDay() // 0= 周日...6= 周六
      if (pattern.dayOfWeek && pattern.dayOfWeek.includes(dayOfWeek)) {
        return true
      }
      return false

    case 'MONTHLY':
      const dayOfMonth = dateObj.getDate() // 1-31
      if (pattern.dayOfMonth && pattern.dayOfMonth.includes(dayOfMonth)) {
        return true
      }
      return false

    case 'YEARLY':
      const month = dateObj.getMonth() + 1 // 1-12
      const day = dateObj.getDate() // 1-31
      if (pattern.month && pattern.day && pattern.month === month && pattern.day === day) {
        return true
      }
      return false

    default:
      return false
  }
}

/**
 * 生成周期性待办（为每个周期日创建一条待办记录）
 * @param taskId 周期性任务 ID
 * @param task 周期性任务定义
 * @param dates 周期日期列表
 */
export async function generateRecurringTodos(taskId: number, task: RecurringTask, dates: string[]): Promise<{ createdCount: number }> {
  let createdCount = 0

  for (const date of dates) {
    // 检查该日是否已存在待办
    const allTodos = await listTodos({})
    const existing = allTodos.find(
      (t) => t.source_type === 'RECURRING' && t.source_id === taskId && t.due_date === date,
    )
    if (existing) continue // 已存在，跳过

    // 创建新待办
    const created = await createTodo({
      title: `[周期性] ${task.title}`,
      content: task.content ?? null,
      priority: task.priority,
      dueDate: date,
      startDate: date, // 周期性任务 start=due
      sourceType: 'RECURRING',
      sourceId: taskId,
    })
    if (created) {
      createdCount++
    }
  }

  return { createdCount }
}

/**
 * 同步周期性任务到待办中心（为所有未执行的周期日创建待办）
 * 维护者 2026-08-28: 在待办中心加载时调用，确保主工作区和任务中心都能看到周期性任务的待办
 *
 * 幂等防竞态：React StrictMode dev 双挂载会并发调用两次 sync，
 * 两次的 listTodos 查重互相看不到 → 同一周期日生成两条待办。
 * 这里用模块级 in-flight 锁，并发调用共享同一次同步结果。
 */
let recurringSyncInFlight: Promise<{ createdCount: number; deletedCount: number }> | null = null

export function syncRecurringTodos(): Promise<{ createdCount: number; deletedCount: number }> {
  if (recurringSyncInFlight) return recurringSyncInFlight
  recurringSyncInFlight = doSyncRecurringTodos().finally(() => {
    recurringSyncInFlight = null
  })
  return recurringSyncInFlight
}

async function doSyncRecurringTodos(): Promise<{ createdCount: number; deletedCount: number }> {
  const tasks = listRecurringTasks()
  if (tasks.length === 0) return { createdCount: 0, deletedCount: 0 }

  const now = formatLocalDate(new Date())
  // 向前扩展 30 天，向后扩展 30 天
  const from = formatLocalDate(new Date(now))
  const to = formatLocalDate(new Date(new Date(now).getTime() + 30 * 24 * 60 * 60 * 1000))

  let createdCount = 0
  let deletedCount = 0

  for (const task of tasks) {
    // 1. 生成新的周期日待办
    const dates = calculateRecurringDates(task, from, to)
    const { createdCount: c } = await generateRecurringTodos(task.id, task, dates)
    createdCount += c

    // 2. 清理过期/不再匹配的周期性待办（已过去、或编辑后不再属于该周期的）
    // 维护者 2026-08-28：编辑任务后旧周期的待办也会被清掉，避免残留
    const allTodos = await listTodos({})
    const recurringTodos = allTodos.filter(
      (t) => t.source_type === 'RECURRING' && t.source_id === task.id && t.status === 'PENDING',
    )
    for (const todo of recurringTodos) {
      if (todo.due_date && !dates.includes(todo.due_date)) {
        // 过期/不再匹配的周期性待办 → 标记为已取消（DELAYED）
        await updateTodo(todo.id, { status: 'DELAYED' as const, title: `[已取消] ${todo.title}` })
        deletedCount++
      }
    }

    // 3. 去重兜底：同一 (source_id, due_date) 多条未办 → 只保留最早一条
    // 维护者 2026-08-28：历史并发同步/重复创建产生的重复待办，保留 id 最小的一条
    const byDate = new Map<string, Todo[]>()
    for (const t of recurringTodos) {
      if (t.status !== 'PENDING') continue
      if (t.due_date) {
        const list = byDate.get(t.due_date) ?? []
        list.push(t)
        byDate.set(t.due_date, list)
      }
    }
    for (const [date, dupes] of byDate) {
      if (dupes.length <= 1 || !dates.includes(date)) continue
      const keep = dupes.reduce((a, b) => (a.id < b.id ? a : b))
      for (const t of dupes) {
        if (t.id !== keep.id) {
          await updateTodo(t.id, { status: 'DELAYED' as const, title: `[已取消] ${t.title}` })
          deletedCount++
        }
      }
    }
  }

  return { createdCount, deletedCount }
}

/**
 * 周期性任务的周期描述（每日 / 每周一/三 / 每月1日 / 每年3月8日）
 * 维护者 2026-08-28：待办中心徽章 + 任务管理页共用
 */
export function describeRecurringCycle(task: Pick<RecurringTask, 'cycle' | 'pattern'>): string {
  const { cycle, pattern } = task
  switch (cycle) {
    case 'DAILY':
      return '每日'
    case 'WEEKLY':
      if (pattern.dayOfWeek && pattern.dayOfWeek.length > 0) {
        return `每周${pattern.dayOfWeek.map((d) => ['日', '一', '二', '三', '四', '五', '六'][d] ?? d).join('/')}`
      }
      return '每周'
    case 'MONTHLY':
      if (pattern.dayOfMonth && pattern.dayOfMonth.length > 0) {
        return `每月${pattern.dayOfMonth.map((d) => `${d}日`).join('/')}`
      }
      return '每月'
    case 'YEARLY':
      if (pattern.month && pattern.day) return `${pattern.month}月${pattern.day}日`
      return '每年'
    default:
      return ''
  }
}

/** 检查某日是否有周期性待办 */
export function hasRecurringTodosOnDate(taskId: number, date: string): boolean {
  const tasks = listRecurringTasks()
  const task = tasks.find((t) => t.id === taskId)
  if (!task) return false
  return isRecurringDate(task, date, new Date(date))
}
