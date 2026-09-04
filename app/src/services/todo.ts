/**
 * PMTool V2.0 · Todo Service 层（WebView 端）
 * Phase 3 · T3.2 + T3.4
 *
 * 设计依据：
 *   - RFC-03 §1 分层架构（WebView → commands → Rust service → repository → SQLite）
 *   - 维护者 T3.2 原话「不要复制日期逻辑。统一抽公共日期服务」（用 ./datetime）
 *   - RFC-02 §4 待办业务规则（自动顺延、状态枚举）
 *   - RFC-02 §6 验收样例
 *
 * Phase 3 限制：
 *   - 不新增 Rust commands（lib.rs 冻结）
 *   - 复用 Phase 0 commands::todos（list_todos / create_todo / update_todo / complete_todo / delete_todo）
 *   - 自动顺延在客户端实现（用现有 update_todo 更新 due_date）
 *   - 节假日判断用 HolidayProvider 抽象（当前 LocalHolidayProvider）
 */

import { invoke } from '@tauri-apps/api/core'
import { defaultHolidayProvider, type HolidayProvider } from './holidayProvider'
import {
  formatLocalDate,
  extractLocalDate,
  computeNextWorkday,
  diffDays,
} from './datetime'
import type { Todo, TodoSourceType, TodoStatus, TodoPriority } from '@/database/api'

// ============================================================
// 类型扩展（在 api.ts 基础上加计算字段）
// ============================================================

/** 计算后的待办（含自动顺延建议）*/
export interface TodoWithMeta extends Todo {
  /** 是否今天到期 */
  isDueToday: boolean
  /** 是否今天完成（按 completed_at 本地日期）*/
  isCompletedToday: boolean
  /** 自动顺延建议（如果适用）*/
  autoPostponeTo?: string
  /** 来源标识（手动/周任务）*/
  sourceLabel: string
  /** 是否逾期 */
  isOverdue: boolean
}

// ============================================================
// CRUD（透传到 Phase 0 Rust commands）
// ============================================================

export async function listTodos(filter?: {
  status?: TodoStatus
  sourceType?: TodoSourceType
}): Promise<Todo[]> {
  return invoke<Todo[]>('list_todos', {
    status: filter?.status ?? null,
    sourceType: filter?.sourceType ?? null,
  })
}

export async function createTodo(input: {
  title: string
  content?: string | null
  priority?: TodoPriority
  startDate?: string | null
  dueDate?: string | null
  sourceType?: TodoSourceType
  sourceId?: number | null
  projectId?: number | null
  mentions?: string | null
  remindTime?: string | null
}): Promise<number> {
  const todo = {
    title: input.title,
    content: input.content ?? null,
    priority: input.priority ?? 'NORMAL',
    start_date: input.startDate ?? null,
    due_date: input.dueDate ?? null,
    source_type: input.sourceType ?? 'MANUAL',
    source_id: input.sourceId ?? null,
    project_id: input.projectId ?? null,
    mentions: input.mentions ?? null,
    remind_time: input.remindTime ?? null,
  }
  return invoke<number>('create_todo', { todo })
}

export async function updateTodo(
  id: number,
  patch: {
    title?: string
    content?: string | null
    priority?: TodoPriority
    status?: TodoStatus
    startDate?: string | null
    dueDate?: string | null
    sourceType?: TodoSourceType
    projectId?: number | null
    mentions?: string | null
    remindTime?: string | null
  },
): Promise<boolean> {
  // 先获取完整 todo（避免覆盖未传字段）
  const existing = await invoke<Todo | null>('get_todo', { id })
  if (!existing) return false
  const todo = {
    title: patch.title ?? existing.title,
    content: patch.content ?? existing.content,
    priority: patch.priority ?? existing.priority,
    status: patch.status ?? existing.status,
    start_date: patch.startDate ?? existing.start_date,
    due_date: patch.dueDate ?? existing.due_date,
    source_type: patch.sourceType ?? existing.source_type,
    source_id: existing.source_id,
    project_id: patch.projectId !== undefined ? patch.projectId : existing.project_id,
    mentions: patch.mentions !== undefined ? patch.mentions : existing.mentions,
    remind_time: patch.remindTime ?? existing.remind_time,
  }
  return invoke<boolean>('update_todo', { id, todo })
}

export async function completeTodo(id: number): Promise<boolean> {
  return invoke<boolean>('complete_todo', { id })
}

/**
 * 取消完成（status → PENDING · completed_at 清空）
 * 专门命令 · 避免 updateTodo 传 todo 对象时字段命名不一致的坑
 */
export async function uncompleteTodo(id: number): Promise<boolean> {
  return invoke<boolean>('uncomplete_todo', { id })
}

export async function deleteTodo(id: number): Promise<boolean> {
  return invoke<boolean>('delete_todo', { id })
}

// ============================================================
// 自动顺延（T3.4 · RFC-02 §4 验收 #1）
// ============================================================

/**
 * 自动顺延单条 Todo 到下一工作日
 * @returns 新 due_date，如果无需顺延则返回 null
 */
export function computeAutoPostponeDate(
  todo: Todo,
  todayLocal: string,
  provider: HolidayProvider = defaultHolidayProvider,
): string | null {
  // RFC-02 §4：仅当天到期且尚未完成
  if (todo.status !== 'PENDING') return null
  if (todo.due_date !== todayLocal) return null
  // RFC-02 §4：仅 MANUAL / WEEKLY
  if (todo.source_type !== 'MANUAL' && todo.source_type !== 'WEEKLY') return null
  // 顺延到下一工作日（跳周末 + 跳节假日）
  return computeNextWorkday(new Date(todayLocal + 'T00:00:00'), (d) => provider.isHoliday(d))
}

/**
 * 批量执行自动顺延
 * @returns 顺延后的 todo 列表
 */
export async function executeAutoPostpone(
  todayLocal: string = formatLocalDate(new Date()),
  provider: HolidayProvider = defaultHolidayProvider,
): Promise<Array<{ id: number; oldDueDate: string; newDueDate: string; title: string }>> {
  // RFC-02 §4：先查 system_config（暂用 client side 判断，待 Phase 9 服务化）
  const enabled = await isAutoPostponeEnabled()
  if (!enabled) return []

  const allTodos = await listTodos({ status: 'PENDING' })
  const results: Array<{ id: number; oldDueDate: string; newDueDate: string; title: string }> = []

  for (const todo of allTodos) {
    const newDate = computeAutoPostponeDate(todo, todayLocal, provider)
    if (newDate && newDate !== todo.due_date) {
      await updateTodo(todo.id, { dueDate: newDate })
      results.push({
        id: todo.id,
        oldDueDate: todo.due_date!,
        newDueDate: newDate,
        title: todo.title,
      })
    }
  }

  return results
}

/**
 * 维护者 2026-08-25：任务中心"顺延"按钮
 * 把"当前（含之前）工作日未完成"的待办全部顺延到下个工作日
 *  - 过滤规则：
 *    - status === 'PENDING'
 *    - due_date 存在且 <= today（含今天 · 即使今天还没"过去"）
 *    - due_date 是工作日（排周末 + 排法定节假日）
 *    - source_type 限 MANUAL / WEEKLY（项目计划任务不顺延避免打乱）
 *  - 目标日：computeNextWorkday(today) · 跳周末 + 跳节假日
 *  - 独立函数 · 未来设置页加 cron 可直接调用（维护者原话："相当于固定时间自动点这个按钮"）
 *
 * @returns { count, targetDate, moved }
 */
export async function postponeOverdueTodos(
  todayLocal: string = formatLocalDate(new Date()),
  provider: HolidayProvider = defaultHolidayProvider,
): Promise<{
  count: number
  targetDate: string
  moved: Array<{ id: number; oldDueDate: string; newDueDate: string; title: string }>
}> {
  const targetDate = computeNextWorkday(
    new Date(todayLocal + 'T00:00:00'),
    (d) => provider.isHoliday(d),
  )

  const allTodos = await listTodos({ status: 'PENDING' })
  const moved: Array<{ id: number; oldDueDate: string; newDueDate: string; title: string }> = []

  for (const todo of allTodos) {
    if (!todo.due_date) continue
    // 不顺延未来日期
    if (todo.due_date > todayLocal) continue
    // 仅工作日
    if (provider.isHoliday(todo.due_date)) continue
    const wd = new Date(todo.due_date + 'T00:00:00').getDay()
    if (wd === 0 || wd === 6) continue
    // 维护者 2026-08-25：项目同步任务（source_id 非 NULL）不顺延 · 必须在项目里改时间
    if (todo.source_id !== null && todo.source_id !== undefined) continue
    // 已经在下个工作日 → 跳过
    if (todo.due_date === targetDate) continue

    await updateTodo(todo.id, { dueDate: targetDate })
    moved.push({
      id: todo.id,
      oldDueDate: todo.due_date,
      newDueDate: targetDate,
      title: todo.title,
    })
  }

  return { count: moved.length, targetDate, moved }
}

/** 读取 system_config.todo_auto_postpone（1=开启）*/
async function isAutoPostponeEnabled(): Promise<boolean> {
  try {
    const config = await invoke<Array<{ config_key: string; config_value: string | null }>>(
      'list_system_config',
      {},
    )
    const entry = config.find((c) => c.config_key === 'todo_auto_postpone')
    return entry?.config_value === '1'
  } catch {
    // list_system_config 命令可能未实现（Phase 3 未加 commands）
    // 降级：默认开启
    return true
  }
}

// ============================================================
// 视图数据加载（日/周/月）
// ============================================================

/** 日视图：当天及前后 3 天（7 天窗口）*/
export async function loadDayView(
  centerDate: string,
  provider: HolidayProvider = defaultHolidayProvider,
): Promise<{
  days: DayViewItem[]
  todos: Todo[]
}> {
  const allTodos = await listTodos()
  const center = new Date(centerDate)
  const days: DayViewItem[] = []
  for (let offset = -3; offset <= 3; offset++) {
    const d = new Date(center)
    d.setDate(d.getDate() + offset)
    const dateStr = formatLocalDate(d)
    days.push({
      date: dateStr,
      weekdayCN: getWeekdayShort(d),
      isWeekend: d.getDay() === 0 || d.getDay() === 6,
      isHoliday: provider.isHoliday(dateStr),
      holidayName: provider.list().find((h) => h.date === dateStr)?.name,
    })
  }
  const startStr = days[0].date
  const endStr = days[days.length - 1].date
  const todos = allTodos.filter((t) => t.due_date && t.due_date >= startStr && t.due_date <= endStr)
  return { days, todos }
}

/** 周视图：本周一到周日 */
export async function loadWeekView(
  anyDateInWeek: string,
  provider: HolidayProvider = defaultHolidayProvider,
): Promise<{
  weekStart: string
  weekEnd: string
  days: DayViewItem[]
  todos: Todo[]
}> {
  const allTodos = await listTodos()
  const monday = getMonday(anyDateInWeek)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const mondayStr = formatLocalDate(monday)
  const sundayStr = formatLocalDate(sunday)
  const days: DayViewItem[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    const dateStr = formatLocalDate(d)
    days.push({
      date: dateStr,
      weekdayCN: getWeekdayShort(d),
      isWeekend: d.getDay() === 0 || d.getDay() === 6,
      isHoliday: provider.isHoliday(dateStr),
      holidayName: provider.list().find((h) => h.date === dateStr)?.name,
    })
  }
  const todos = allTodos.filter(
    (t) =>
      (t.start_date && t.start_date >= mondayStr && t.start_date <= sundayStr) ||
      (t.due_date && t.due_date >= mondayStr && t.due_date <= sundayStr) ||
      (t.completed_at && extractLocalDate(t.completed_at) >= mondayStr && extractLocalDate(t.completed_at) <= sundayStr),
  )
  return { weekStart: mondayStr, weekEnd: sundayStr, days, todos }
}

/** 月视图：本月所有日期 */
export async function loadMonthView(
  yearMonth: string, // YYYY-MM
  provider: HolidayProvider = defaultHolidayProvider,
): Promise<{
  days: DayViewItem[]
  todos: Todo[]
}> {
  const allTodos = await listTodos()
  const [y, m] = yearMonth.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  const monthStart = `${yearMonth}-01`
  const monthEnd = `${yearMonth}-${String(lastDay).padStart(2, '0')}`
  const days: DayViewItem[] = []
  for (let d = 1; d <= lastDay; d++) {
    const dateStr = `${yearMonth}-${String(d).padStart(2, '0')}`
    const date = new Date(dateStr)
    days.push({
      date: dateStr,
      weekdayCN: getWeekdayShort(date),
      isWeekend: date.getDay() === 0 || date.getDay() === 6,
      isHoliday: provider.isHoliday(dateStr),
      holidayName: provider.list().find((h) => h.date === dateStr)?.name,
    })
  }
  const todos = allTodos.filter(
    (t) => t.due_date && t.due_date >= monthStart && t.due_date <= monthEnd,
  )
  return { days, todos }
}

// ============================================================
// 内部辅助函数
// ============================================================

export interface DayViewItem {
  date: string
  weekdayCN: string
  isWeekend: boolean
  isHoliday: boolean
  holidayName?: string
}

function getWeekdayShort(d: Date): string {
  return ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
}

function getMonday(dateStr: string): Date {
  const d = new Date(dateStr)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d
}

/**
 * 给 Todo 附加计算字段
 */
export function enrichTodo(todo: Todo, todayLocal: string): TodoWithMeta {
  const isDueToday = todo.due_date === todayLocal
  const isCompletedToday =
    todo.status === 'COMPLETED' &&
    !!todo.completed_at &&
    extractLocalDate(todo.completed_at) === todayLocal
  const isOverdue =
    todo.status === 'PENDING' &&
    !!todo.due_date &&
    diffDays(todayLocal, todo.due_date) > 0
  const sourceLabel = todo.source_type === 'MANUAL' ? '🖊️ 手动' : '🔄 周任务'
  return {
    ...todo,
    isDueToday,
    isCompletedToday,
    isOverdue,
    sourceLabel,
  }
}