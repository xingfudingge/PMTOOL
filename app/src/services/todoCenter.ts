/**
 * PMTool V2.0 · 待办中心动态聚合 Service
 * 维护者 2026-08-27：任务中心要能动态聚合展示两类任务：
 *   - 项目计划任务（project_tasks · 整体计划/甘特图 · 父+子）
 *   - 每周周报「下周项目工作计划」（weekly_entries 中 section='NEXT'）
 * 并可点击完成（完成状态回写来源表 + 同步主工作区"今日工作内容"）。
 *
 * 数据源（不新增表 / 不新增 Rust command / 不新增 sourceType 值 · 复用已有 API）：
 *   - listTodos / completeTodo / uncompleteTodo（todos 表）
 *   - listProjectTasks / updateProjectTask（project_tasks 表）
 *   - listWeeklyEntries / updateWeeklyEntry（weekly_entries 表）
 *
 * 聚合项【不落 todos 表】：动态算出来展示；完成动作按来源路由回写。
 */

import { listProjects, listTodos, type Todo } from '@/database/api'
import {
  listProjectTasks,
  updateProjectTask,
} from '@/services/projectTasks'
import {
  listWeeklyEntries,
  updateWeeklyEntry,
} from '@/services/weeklyEntries'
import {
  completeTodo,
  uncompleteTodo,
} from '@/services/todo'
import {
  listRecurringTasks,
  describeRecurringCycle,
  type RecurringTask,
} from '@/services/recurringTasks'
import {
  appendToTodayWorkNote,
  removeFromTodayWorkNote,
} from '@/pages/HomePage'

// ============================================================
// 类型
// ============================================================

/** 待办中心统一来源 */
export type TodoCenterSource = 'TODO' | 'PROJECT_TASK' | 'WEEKLY_NEXT' | 'RECURRING'

/** 待办中心统一行（普通 Todo + 项目任务 + 周报下周计划 合并） */
export interface TodoCenterItem {
  /** React key：source + ':' + id · 避免跨源撞 key */
  key: string
  /** 来源 */
  source: TodoCenterSource
  /** 来源表主键（todo.id / task.id / weekly_entry.id / recurring_id） */
  id: number
  title: string
  /** 统一状态（三源同名枚举，零成本映射） */
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'DELAYED'
  /** 统一截止：todo→due_date · task→end_date · weekly→plan_end_date */
  due_date: string | null
  /** 统一起始：todo→start_date · task→start_date · weekly→plan_start_date */
  start_date: string | null
  /** 优先级：task/weekly 无真实优先级 → 统一 NORMAL */
  priority: Todo['priority']
  project_id: number | null
  projectName: string | null
  /** 回写判断用（仅 TODO 有 completed_at） */
  completed_at: string | null
  /** 回写引用 */
  todo?: Todo
  projectTaskId?: number
  weeklyEntryId?: number
  recurringId?: number // 维护者 2026-08-28: 周期性任务的 todo.id
  /** 维护者 2026-08-28: 周期性任务的周期徽章（每日/每周一/每月1日…） */
  recurringLabel?: string
}

// ============================================================
// 聚合加载
// ============================================================

/**
 * 加载待办中心全部行（普通 Todo + 所有项目任务 + 各项目下周计划）
 * @returns { items 合并后的行, projectsMap 项目 id→名称 }
 */
export async function loadTodoCenterItems(): Promise<{
  items: TodoCenterItem[]
  projectsMap: Record<number, string>
}> {
  const [todos, projects] = await Promise.all([
    listTodos(),
    listProjects(undefined),
  ])

  const projectsMap: Record<number, string> = {}
  for (const p of projects) projectsMap[p.id] = p.project_name

  // 普通 Todo（不包括周期性任务的待办，周期性任务单独处理）
  const items: TodoCenterItem[] = todos
    .filter((t) => t.source_type !== 'RECURRING') // 维护者 2026-08-28: 周期性任务的待办单独聚合
    .map((t) => ({
      key: `TODO:${t.id}`,
      source: 'TODO',
      id: t.id,
      title: t.title,
      status: t.status,
      due_date: t.due_date,
      start_date: t.start_date,
      priority: t.priority,
      project_id: t.project_id,
      projectName: t.project_id ? projectsMap[t.project_id] ?? null : null,
      completed_at: t.completed_at,
      todo: t,
    }))

  // 维护者 2026-08-28: 周期性任务的待办（从 todos 表聚合）
  //  - DELAYED（已取消/已过期）直接不显示 · 已办（COMPLETED）保留历史
  //  - 带周期徽章（每日/每周一/每月1日…）· 由周期性任务定义实时算出
  const recurringDefs = new Map<number, RecurringTask>()
  for (const r of listRecurringTasks()) recurringDefs.set(r.id, r)
  const recurringTodos = todos.filter((t) => t.source_type === 'RECURRING' && t.status !== 'DELAYED')
  for (const t of recurringTodos) {
    // 维护者 2026-08-28: 周期性任务的 title 格式是"[周期性] 任务名"，需要恢复原始标题
    const rawTitle = t.title.replace(/^\[周期性\]\s*/, '') || t.title
    const def = t.source_id !== null ? recurringDefs.get(t.source_id) : undefined
    items.push({
      key: `RECURRING:${t.id}`,
      source: 'RECURRING',
      id: t.id,
      title: rawTitle,
      status: t.status,
      due_date: t.due_date,
      start_date: t.start_date,
      priority: t.priority,
      project_id: null,
      projectName: null,
      completed_at: t.completed_at,
      recurringId: t.id,
      recurringLabel: def ? describeRecurringCycle(def) : undefined,
    })
  }

  // 项目任务 + 周报下周计划（遍历全部项目 · 不过滤项目状态 · 任务/周报各自失败容错）
  // 方案 B：project_tasks 和 weekly_entries 表没有 completed_at 字段，只有 updated_at（UTC）
  // → 对于这两种来源，使用 updated_at 转换成本地日期作为 completed_at（用于反悔保护）
  await Promise.all(
    projects.map(async (p) => {
      // 项目计划任务（只纳入具体子任务 · 不纳入阶段父任务）
      // 维护者 2026-08-28：不要同步阶段名称（如「项目启动与准备」），只要具体的任务
      try {
        const tasks = await listProjectTasks(p.id)
        for (const task of tasks) {
          if (task.parent_id === null) continue // 阶段/根任务不同步
          items.push({
            key: `PROJECT_TASK:${task.id}`,
            source: 'PROJECT_TASK',
            id: task.id,
            title: task.task_name,
            status: task.status,
            due_date: task.end_date,
            start_date: task.start_date,
            priority: 'NORMAL',
            project_id: p.id,
            projectName: p.project_name,
            completed_at: task.status === 'COMPLETED' ? task.updated_at : null, // 使用 updated_at（UTC）转换成本地日期
            projectTaskId: task.id,
          })
        }
      } catch (e) {
        console.warn(`待办中心加载项目 #${p.id} 任务失败`, e)
      }
      // 周报「下周项目工作计划」（section === 'NEXT'）· 周报失败不阻塞该项目的任务
      try {
        const weekly = await listWeeklyEntries(p.id)
        for (const e of weekly) {
          if (e.section !== 'NEXT') continue
          items.push({
            key: `WEEKLY_NEXT:${e.id}`,
            source: 'WEEKLY_NEXT',
            id: e.id,
            title: e.task_name,
            status: e.is_completed,
            due_date: e.plan_end_date,
            start_date: e.plan_start_date,
            priority: 'NORMAL',
            project_id: p.id,
            projectName: p.project_name,
            completed_at: e.is_completed === 'COMPLETED' ? e.updated_at : null, // 使用 updated_at（UTC）转换成本地日期
            weeklyEntryId: e.id,
          })
        }
      } catch (e) {
        console.warn(`待办中心加载项目 #${p.id} 周报失败`, e)
      }
    }),
  )

  return { items, projectsMap }
}

// ============================================================
// 完成 / 取消完成（按来源回写）
// ============================================================

/**
 * 切换待办中心某行的完成状态（按来源回写各表 + 同步主工作区 worknote）
 * @returns 是否成功
 */
export async function toggleTodoCenterItem(item: TodoCenterItem): Promise<boolean> {
  const done = item.status === 'COMPLETED'

  let ok = false
  if (item.source === 'TODO') {
    ok = done
      ? await uncompleteTodo(item.id)
      : await completeTodo(item.id)
  } else if (item.source === 'PROJECT_TASK' && item.projectTaskId !== undefined) {
    ok = await updateProjectTask(item.projectTaskId, {
      status: done ? 'PENDING' : 'COMPLETED',
      progress: done ? 0 : 100,
    })
  } else if (item.source === 'WEEKLY_NEXT' && item.weeklyEntryId !== undefined) {
    ok = await updateWeeklyEntry(item.weeklyEntryId, {
      is_completed: done ? 'PENDING' : 'COMPLETED',
    })
  } else if (item.source === 'RECURRING') {
    // 维护者 2026-08-28: 周期性任务的待办 → 更新待办本身的完成状态
    ok = done
      ? await uncompleteTodo(item.id)
      : await completeTodo(item.id)
  }

  if (!ok) return false

  // 同步主工作区"今日工作内容"（项目/周报任务补 @项目名 · 与卡片展示一致）
  // 维护者 2026-08-28：进入今日工作内容的任务也要 @项目名称
  const displayTitle =
    (item.source === 'PROJECT_TASK' || item.source === 'WEEKLY_NEXT') && item.projectName
      ? `${item.title} @${item.projectName}`
      : item.title
  if (done) {
    removeFromTodayWorkNote(displayTitle)
  } else {
    appendToTodayWorkNote(displayTitle)
  }
  return true
}

// ============================================================
// 时间段工具（主工作区 / 待办中心共用）
// 维护者 2026-08-27：项目任务/周报任务是「时间段」，时间段内每天都展示（但实际是同一个任务）
// ============================================================

/**
 * 单日命中判断
 *  - 普通 Todo：仅 due_date 当天
 *  - 项目任务（PROJECT_TASK）/ 周报下周计划（WEEKLY_NEXT）：start_date ~ end_date 区间内每一天
 */
export function itemInDay(t: TodoCenterItem, date: string): boolean {
  if (t.source === 'TODO') return t.due_date === date
  const s = t.start_date ?? t.due_date ?? ''
  const e = t.due_date ?? t.start_date ?? ''
  return date >= s && date <= e
}

/**
 * 任务时间段与 [start, end] 区间重叠判断
 *  - 普通 Todo：start_date 或 due_date 落在区间内
 *  - 项目/周报任务：任务区间 [s, e] 与列区间有交集（含列区间被任务区间完全包含）
 */
export function itemOverlapsRange(t: TodoCenterItem, start: string, end: string): boolean {
  if (t.source === 'TODO') {
    const due = t.due_date ?? ''
    const s = t.start_date ?? ''
    return Boolean(
      (due && due >= start && due <= end) ||
        (s && s >= start && s <= end),
    )
  }
  const s = t.start_date ?? t.due_date ?? ''
  const e = t.due_date ?? t.start_date ?? ''
  return s <= end && e >= start
}