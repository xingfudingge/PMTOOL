/**
 * PMTool V2.0 · 待办中心动态聚合 todoCenter.ts 自动化测试
 * 维护者 2026-08-27
 *
 * 覆盖：
 *   - loadTodoCenterItems：三类 item 正确映射
 *     · TODO → due_date/start_date/priority 直通 · completed_at 保留
 *     · PROJECT_TASK → due_date=end_date · start_date=start_date · priority=NORMAL
 *     · WEEKLY_NEXT → 仅 section='NEXT' · due_date=plan_end_date · priority=NORMAL
 *     · projectsMap 正确 · key 用 source:id 防撞
 *   - toggleTodoCenterItem 按来源路由回写：
 *     · TODO → complete_todo / uncomplete_todo
 *     · PROJECT_TASK → update_project_task {status,progress}
 *     · WEEKLY_NEXT → update_weekly_entry {is_completed}
 *     · 同步主工作区 worknote（完成 append · 取消 remove）
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import {
  loadTodoCenterItems,
  toggleTodoCenterItem,
  itemInDay,
  itemOverlapsRange,
  type TodoCenterItem,
} from '@/services/todoCenter'
import {
  appendToTodayWorkNote,
  removeFromTodayWorkNote,
} from '@/pages/HomePage'
import type { ProjectTask } from '@/services/projectTasks'
import type { WeeklyReportEntry } from '@/services/weeklyEntries'
import type { Todo } from '@/database/api'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('@/pages/HomePage', () => ({
  appendToTodayWorkNote: vi.fn(),
  removeFromTodayWorkNote: vi.fn(),
}))

// ============================================================
// 样例数据
// ============================================================

const SAMPLE_PROJECTS = [
  { id: 1, project_name: '官网改版', customer_name: null, status: 'IN_PROGRESS' },
  { id: 2, project_name: 'App 迭代', customer_name: null, status: 'PLANNED' },
]

const SAMPLE_TODO: Todo = {
  id: 101,
  title: '评审原型',
  content: null,
  priority: 'HIGH',
  status: 'PENDING',
  start_date: '2026-08-25',
  due_date: '2026-08-28',
  source_type: 'MANUAL',
  source_id: null,
  project_id: 1,
  mentions: null,
  remind_time: null,
  completed_at: null,
  created_at: '',
  updated_at: '',
}

const SAMPLE_TASKS: ProjectTask[] = [
  {
    id: 201,
    project_id: 1,
    parent_id: null,
    task_name: '整体设计',
    owner: null,
    start_date: '2026-08-01',
    end_date: '2026-08-10',
    work_days: 8,
    natural_days: 10,
    progress: 100,
    status: 'COMPLETED',
    remark: null,
    sort_order: 0,
    created_at: '',
    updated_at: '2026-08-10 09:00:00',
  },
  {
    id: 202,
    project_id: 1,
    parent_id: 201,
    task_name: '页面切图',
    owner: null,
    start_date: '2026-08-05',
    end_date: '2026-08-15',
    work_days: 6,
    natural_days: 10,
    progress: 30,
    status: 'IN_PROGRESS',
    remark: null,
    sort_order: 1,
    created_at: '',
    updated_at: '',
  },
]

const SAMPLE_WEEKLY: WeeklyReportEntry[] = [
  {
    id: 301,
    project_id: 1,
    week_number: 35,
    week_start_date: '2026-08-31',
    week_end_date: '2026-09-04',
    task_name: '下周上首页',
    plan_start_date: '2026-08-31',
    plan_end_date: '2026-09-04',
    actual_start_date: null,
    actual_end_date: null,
    owner_party_a: null,
    owner_party_b: null,
    completion_note: null,
    is_completed: 'PENDING',
    section: 'NEXT',
    sort_order: 0,
    created_at: '',
    updated_at: '',
  },
  {
    id: 302,
    project_id: 1,
    week_number: 35,
    week_start_date: '2026-08-31',
    week_end_date: '2026-09-04',
    task_name: '本周收尾',
    plan_start_date: '2026-08-24',
    plan_end_date: '2026-08-28',
    actual_start_date: null,
    actual_end_date: null,
    owner_party_a: null,
    owner_party_b: null,
    completion_note: null,
    is_completed: 'COMPLETED',
    section: 'CURRENT',
    sort_order: 1,
    created_at: '',
    updated_at: '',
  },
]

beforeEach(() => {
  // resetAllMocks：清掉上次测试残留的 once 队列 / implementation
  vi.resetAllMocks()
})

/** 按 command + args 路由的 mock（避免调用序耦合 + 避免 eager reject 未处理）*/
function mockByCommand(routes: Record<string, (args: any) => unknown>) {
  vi.mocked(invoke).mockImplementation(async (cmd: string, args: any) => {
    const r = routes[cmd]
    return r ? r(args) : undefined
  })
}

function standardAggregateRoutes() {
  mockByCommand({
    list_todos: () => [SAMPLE_TODO],
    list_projects: () => SAMPLE_PROJECTS,
    list_project_tasks: (args) => (args.projectId === 1 ? SAMPLE_TASKS : []),
    list_weekly_entries: (args) => (args.projectId === 1 ? SAMPLE_WEEKLY : []),
  })
}

// ============================================================
// loadTodoCenterItems · 三类聚合映射
// ============================================================

describe('验收 T6 · loadTodoCenterItems（动态聚合）', () => {
  it('三类 item 正确映射 · projectsMap 正确', async () => {
    standardAggregateRoutes()
    const { items, projectsMap } = await loadTodoCenterItems()

    expect(projectsMap).toEqual({ 1: '官网改版', 2: 'App 迭代' })

    // 普通 Todo
    const todo = items.find((i) => i.source === 'TODO')!
    expect(todo).toMatchObject({
      key: 'TODO:101',
      title: '评审原型',
      priority: 'HIGH',
      due_date: '2026-08-28',
      start_date: '2026-08-25',
      projectName: '官网改版',
      completed_at: null,
    })

    // 项目任务（只纳入具体子任务 · 不纳入阶段父任务）· due_date=end_date · priority=NORMAL
    const tasks = items.filter((i) => i.source === 'PROJECT_TASK')
    expect(tasks).toHaveLength(1)
    expect(tasks.map((t) => t.title)).toEqual(['页面切图'])
    expect(tasks[0]).toMatchObject({
      key: 'PROJECT_TASK:202',
      due_date: '2026-08-15',
      start_date: '2026-08-05',
      priority: 'NORMAL',
      project_id: 1,
      projectName: '官网改版',
      completed_at: null,
    })
    // 阶段/根任务（parent_id === null）不同步
    expect(items.some((i) => i.title === '整体设计')).toBe(false)

    // 周报仅 section='NEXT' · due_date=plan_end_date · priority=NORMAL
    const weekly = items.filter((i) => i.source === 'WEEKLY_NEXT')
    expect(weekly).toHaveLength(1)
    expect(weekly[0]).toMatchObject({
      key: 'WEEKLY_NEXT:301',
      title: '下周上首页',
      due_date: '2026-09-04',
      start_date: '2026-08-31',
      priority: 'NORMAL',
      project_id: 1,
      projectName: '官网改版',
    })
    // CURRENT 周报条目不聚合进来
    expect(items.some((i) => i.title === '本周收尾')).toBe(false)

    // 三源 key 互不碰撞
    const keys = new Set(items.map((i) => i.key))
    expect(keys.size).toBe(items.length)
  })

  it('单项目失败容错不阻塞整体', async () => {
    mockByCommand({
      list_todos: () => [SAMPLE_TODO],
      list_projects: () => SAMPLE_PROJECTS,
      list_project_tasks: (args) => {
        if (args.projectId === 1) return SAMPLE_TASKS
        throw new Error('boom') // 项目2 任务加载失败
      },
      list_weekly_entries: (args) => (args.projectId === 1 ? SAMPLE_WEEKLY : []),
    })
    const { items } = await loadTodoCenterItems()
    // 项目1 正常 · 项目2 失败被跳过
    expect(items.filter((i) => i.source === 'PROJECT_TASK')).toHaveLength(1)
    expect(items.filter((i) => i.source === 'WEEKLY_NEXT')).toHaveLength(1)
  })
})

// ============================================================
// toggleTodoCenterItem · 按来源回写 + worknote 同步
// ============================================================

function makeItem(over: Partial<TodoCenterItem>): TodoCenterItem {
  return {
    key: 'TODO:1',
    source: 'TODO',
    id: 1,
    title: '任务',
    status: 'PENDING',
    due_date: null,
    start_date: null,
    priority: 'NORMAL',
    project_id: null,
    projectName: null,
    completed_at: null,
    ...over,
  }
}

describe('验收 T6 · toggleTodoCenterItem（来源路由回写）', () => {
  it('TODO 未完成 → complete_todo · 同步 append worknote', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(true)
    const ok = await toggleTodoCenterItem(makeItem({ source: 'TODO', id: 5, title: '写文档' }))
    expect(ok).toBe(true)
    expect(invoke).toHaveBeenCalledWith('complete_todo', { id: 5 })
    expect(appendToTodayWorkNote).toHaveBeenCalledWith('写文档')
    expect(removeFromTodayWorkNote).not.toHaveBeenCalled()
  })

  it('TODO 已完成 → uncomplete_todo · 同步 remove worknote', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(true)
    const ok = await toggleTodoCenterItem(
      makeItem({ source: 'TODO', id: 5, title: '写文档', status: 'COMPLETED', completed_at: '2026-08-26 12:00:00' }),
    )
    expect(ok).toBe(true)
    expect(invoke).toHaveBeenCalledWith('uncomplete_todo', { id: 5 })
    expect(removeFromTodayWorkNote).toHaveBeenCalledWith('写文档')
    expect(appendToTodayWorkNote).not.toHaveBeenCalled()
  })

  it('PROJECT_TASK 完成 → update_project_task {status:COMPLETED,progress:100} · append worknote', async () => {
    // updateProjectTask 会先 get_project_task（取现有）再 update
    vi.mocked(invoke).mockResolvedValueOnce(SAMPLE_TASKS[1]) // get_project_task
    vi.mocked(invoke).mockResolvedValueOnce(true) // update_project_task
    const ok = await toggleTodoCenterItem(
      makeItem({ source: 'PROJECT_TASK', id: 202, title: '页面切图', status: 'IN_PROGRESS', projectTaskId: 202 }),
    )
    expect(ok).toBe(true)
    expect(invoke).toHaveBeenLastCalledWith(
      'update_project_task',
      expect.objectContaining({
        id: 202,
        task: expect.objectContaining({ status: 'COMPLETED', progress: 100 }),
      }),
    )
    expect(appendToTodayWorkNote).toHaveBeenCalledWith('页面切图')
  })

  it('PROJECT_TASK 取消完成 → update_project_task {status:PENDING,progress:0} · remove worknote', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(SAMPLE_TASKS[1])
    vi.mocked(invoke).mockResolvedValueOnce(true)
    const ok = await toggleTodoCenterItem(
      makeItem({ source: 'PROJECT_TASK', id: 202, title: '页面切图', status: 'COMPLETED', projectTaskId: 202 }),
    )
    expect(ok).toBe(true)
    expect(invoke).toHaveBeenLastCalledWith(
      'update_project_task',
      expect.objectContaining({
        id: 202,
        task: expect.objectContaining({ status: 'PENDING', progress: 0 }),
      }),
    )
    expect(removeFromTodayWorkNote).toHaveBeenCalledWith('页面切图')
  })

  it('WEEKLY_NEXT 完成 → update_weekly_entry {is_completed:COMPLETED} · append worknote', async () => {
    // updateWeeklyEntry 先 get_weekly_entry 再 update
    vi.mocked(invoke).mockResolvedValueOnce(SAMPLE_WEEKLY[0]) // get_weekly_entry
    vi.mocked(invoke).mockResolvedValueOnce(true) // update_weekly_entry
    const ok = await toggleTodoCenterItem(
      makeItem({ source: 'WEEKLY_NEXT', id: 301, title: '下周上首页', status: 'PENDING', weeklyEntryId: 301 }),
    )
    expect(ok).toBe(true)
    expect(invoke).toHaveBeenLastCalledWith(
      'update_weekly_entry',
      expect.objectContaining({
        id: 301,
        entry: expect.objectContaining({ is_completed: 'COMPLETED' }),
      }),
    )
    expect(appendToTodayWorkNote).toHaveBeenCalledWith('下周上首页')
  })

  it('回写失败返回 false', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(false)
    const ok = await toggleTodoCenterItem(makeItem({ source: 'TODO', id: 5, title: '写文档' }))
    expect(ok).toBe(false)
    expect(appendToTodayWorkNote).not.toHaveBeenCalled()
  })
})

// ============================================================
// 时间段工具（itemInDay / itemOverlapsRange）
// 维护者 2026-08-27：项目任务/周报任务=时间段 · 时间段内每天都展示（同一任务）
// ============================================================

describe('验收 T6 · 时间段工具（itemInDay / itemOverlapsRange）', () => {
  const projectItem = makeItem({
    source: 'PROJECT_TASK',
    id: 1,
    title: '切图',
    status: 'IN_PROGRESS',
    start_date: '2026-08-01',
    due_date: '2026-08-10',
  })
  const weeklyItem = makeItem({
    source: 'WEEKLY_NEXT',
    id: 2,
    title: '下周上线',
    status: 'PENDING',
    start_date: '2026-08-31',
    due_date: '2026-09-04',
  })
  const todoItem = makeItem({
    source: 'TODO',
    id: 3,
    title: '评审',
    status: 'PENDING',
    start_date: '2026-08-05',
    due_date: '2026-08-08',
  })

  it('项目任务=时间段 · 区间内每一天都命中（同一天内的同一天都 true）', () => {
    expect(itemInDay(projectItem, '2026-08-01')).toBe(true) // 起始日
    expect(itemInDay(projectItem, '2026-08-05')).toBe(true) // 中间
    expect(itemInDay(projectItem, '2026-08-10')).toBe(true) // 截止日
    expect(itemInDay(projectItem, '2026-08-11')).toBe(false) // 区间外
    expect(itemInDay(projectItem, '2026-07-31')).toBe(false)
  })

  it('周报任务=时间段 · 跨月区间命中', () => {
    expect(itemInDay(weeklyItem, '2026-08-31')).toBe(true)
    expect(itemInDay(weeklyItem, '2026-09-01')).toBe(true)
    expect(itemInDay(weeklyItem, '2026-09-04')).toBe(true)
    expect(itemInDay(weeklyItem, '2026-09-05')).toBe(false)
  })

  it('普通 Todo 仅 due_date 当天命中（不看 start_date）', () => {
    expect(itemInDay(todoItem, '2026-08-08')).toBe(true) // due 当天
    expect(itemInDay(todoItem, '2026-08-05')).toBe(false) // start 当天不算
  })

  it('itemOverlapsRange · 时间段任务与区间重叠（含区间被完整包含）', () => {
    // 项目任务 [08-01, 08-10]
    expect(itemOverlapsRange(projectItem, '2026-08-05', '2026-08-06')).toBe(true) // 部分重叠
    expect(itemOverlapsRange(projectItem, '2026-08-02', '2026-08-09')).toBe(true) // 区间被任务完整包含
    expect(itemOverlapsRange(projectItem, '2026-08-11', '2026-08-20')).toBe(false) // 区间在任务后
    expect(itemOverlapsRange(projectItem, '2026-07-01', '2026-07-31')).toBe(false) // 区间在任务前
  })

  it('itemOverlapsRange · 普通 Todo 按 start 或 due 命中', () => {
    expect(itemOverlapsRange(todoItem, '2026-08-08', '2026-08-08')).toBe(true) // due
    expect(itemOverlapsRange(todoItem, '2026-08-05', '2026-08-05')).toBe(true) // start
    expect(itemOverlapsRange(todoItem, '2026-08-06', '2026-08-06')).toBe(false) // 都不在
  })
})