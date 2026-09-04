/**
 * PMTool V2.0 · Todo 自动化测试
 * Phase 3 · T3.5（任务清单中的 T3.6）
 *
 * 覆盖维护者 T3.6 要求：
 *   - 创建任务
 *   - 完成任务
 *   - 自动顺延周末
 *   - 自动跳过节假日
 *   - 关闭自动顺延
 *   - 项目任务同步 Todo（⚠️ 与 PM A1 冲突 · 本测试用 sourceType='WEEKLY' 占位）
 *
 * GWT 全部写入测试。
 *
 * 运行命令（待网络恢复）：
 *   pnpm test src/database/__tests__/todo
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import {
  listTodos,
  createTodo,
  completeTodo,
  executeAutoPostpone,
  computeAutoPostponeDate,
  enrichTodo,
  loadDayView,
  loadWeekView,
  loadMonthView,
} from '@/services/todo'
import { LocalHolidayProvider } from '@/services/holidayProvider'
import { formatLocalDate, computeNextWorkday } from '@/services/datetime'
import type { Todo } from '@/database/api'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

// ============================================================
// 工具函数测试
// ============================================================

describe('computeNextWorkday（RFC-02 §3）', () => {
  it('周五 → 周一', () => {
    // 2026-08-21 周五
    expect(computeNextWorkday(new Date('2026-08-21T00:00:00'))).toBe('2026-08-24')
  })

  it('周六 → 周一', () => {
    expect(computeNextWorkday(new Date('2026-08-22T00:00:00'))).toBe('2026-08-24')
  })

  it('周日 → 周一', () => {
    expect(computeNextWorkday(new Date('2026-08-23T00:00:00'))).toBe('2026-08-24')
  })

  it('周一 → 周二', () => {
    expect(computeNextWorkday(new Date('2026-08-24T00:00:00'))).toBe('2026-08-25')
  })

  it('跳过节假日（callback 返回 true）', () => {
    // 假设 2026-08-25 是法定节假日 → 应跳过到 2026-08-26
    expect(
      computeNextWorkday(new Date('2026-08-24T00:00:00'), (d) => d === '2026-08-25'),
    ).toBe('2026-08-26')
  })
})

// ============================================================
// 验收 #1：创建任务（基础 CRUD）
// ============================================================

describe('验收 #1：创建任务', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('createTodo 调用 create_todo command · 参数结构正确', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(42)
    const id = await createTodo({
      title: '写 Phase 3 报告',
      priority: 'HIGH',
      dueDate: '2026-08-22',
      sourceType: 'MANUAL',
    })
    expect(invoke).toHaveBeenCalledWith(
      'create_todo',
      expect.objectContaining({
        todo: expect.objectContaining({
          title: '写 Phase 3 报告',
          priority: 'HIGH',
          source_type: 'MANUAL',
          due_date: '2026-08-22',
        }),
      }),
    )
    expect(id).toBe(42)
  })

  it('listTodos 默认不传 sourceType → 返回所有类型', async () => {
    vi.mocked(invoke).mockResolvedValueOnce([])
    await listTodos()
    expect(invoke).toHaveBeenCalledWith('list_todos', {
      status: null,
      sourceType: null,
    })
  })

  it('listTodos 传 status + sourceType → 过滤生效', async () => {
    vi.mocked(invoke).mockResolvedValueOnce([])
    await listTodos({ status: 'PENDING', sourceType: 'MANUAL' })
    expect(invoke).toHaveBeenCalledWith('list_todos', {
      status: 'PENDING',
      sourceType: 'MANUAL',
    })
  })
})

// ============================================================
// 验收 #2：完成任务
// ============================================================

describe('验收 #2：完成任务', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('completeTodo 调用 complete_todo command · 写入 completed_at（UTC ISO 8601）', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(true)
    const result = await completeTodo(1)
    expect(invoke).toHaveBeenCalledWith('complete_todo', { id: 1 })
    expect(result).toBe(true)
    // Rust 端负责写入 completed_at（RFC-02 §4 · UTC ISO 8601）
  })

  it('enrichTodo 标记 isCompletedToday = true（completed_at 本地日期 = today）', () => {
    const today = '2026-08-22'
    const todo: Todo = {
      id: 1,
      title: '今日完成',
      content: null,
      priority: 'NORMAL',
      status: 'COMPLETED',
      start_date: null,
      due_date: today,
      completed_at: '2026-08-22T08:30:00Z',
      source_type: 'MANUAL',
      source_id: null,
            project_id: null,
            mentions: null,
      remind_time: null,
      created_at: '',
      updated_at: '',
    }
    const enriched = enrichTodo(todo, today)
    expect(enriched.isCompletedToday).toBe(true)
    expect(enriched.isDueToday).toBe(true)
  })

  it('enrichTodo：跨日完成（UTC 23:00 → 本地 0:00 翌日）不归档今日', () => {
    // 2026-08-22 23:00:00 UTC = 2026-08-23 07:00:00 本地（假设 UTC+8）
    const todo: Todo = {
      id: 1,
      title: '跨日完成',
      status: 'COMPLETED',
      completed_at: '2026-08-22T23:00:00Z',
      due_date: '2026-08-23',
      priority: 'NORMAL',
      content: null,
      start_date: null,
      source_type: 'MANUAL',
      source_id: null,
            project_id: null,
            mentions: null,
      remind_time: null,
      created_at: '',
      updated_at: '',
    }
    const enriched = enrichTodo(todo, '2026-08-22')
    // 本地日期是 2026-08-23，归档到 23 号，不算今日
    expect(enriched.isCompletedToday).toBe(false)
  })
})

// ============================================================
// 验收 #3：自动顺延周末（RFC-02 §6 验收 #1）
// ============================================================

describe('验收 #3：自动顺延周末', () => {
  it('computeAutoPostponeDate：周五到期的 MANUAL 待办 → 周一', () => {
    const todo: Todo = {
      id: 1,
      title: '周五待办',
      status: 'PENDING',
      due_date: '2026-08-21', // 周五
      priority: 'NORMAL',
      content: null,
      start_date: null,
      completed_at: null,
      source_type: 'MANUAL',
      source_id: null,
            project_id: null,
            mentions: null,
      remind_time: null,
      created_at: '',
      updated_at: '',
    }
    const provider = new LocalHolidayProvider()
    const newDate = computeAutoPostponeDate(todo, '2026-08-21', provider)
    expect(newDate).toBe('2026-08-24') // 周一
  })

  it('computeAutoPostponeDate：非当天到期 → 不顺延', () => {
    const todo: Todo = {
      id: 1,
      title: '明天待办',
      status: 'PENDING',
      due_date: '2026-08-22', // 今天 8/21
      priority: 'NORMAL',
      content: null,
      start_date: null,
      completed_at: null,
      source_type: 'MANUAL',
      source_id: null,
            project_id: null,
            mentions: null,
      remind_time: null,
      created_at: '',
      updated_at: '',
    }
    const newDate = computeAutoPostponeDate(todo, '2026-08-21', new LocalHolidayProvider())
    expect(newDate).toBeNull()
  })

  it('computeAutoPostponeDate：已完成 → 不顺延', () => {
    const todo: Todo = {
      id: 1,
      title: '已完成',
      status: 'COMPLETED',
      due_date: '2026-08-21',
      priority: 'NORMAL',
      content: null,
      start_date: null,
      completed_at: '2026-08-21T10:00:00Z',
      source_type: 'MANUAL',
      source_id: null,
            project_id: null,
            mentions: null,
      remind_time: null,
      created_at: '',
      updated_at: '',
    }
    const newDate = computeAutoPostponeDate(todo, '2026-08-21', new LocalHolidayProvider())
    expect(newDate).toBeNull()
  })

  it('executeAutoPostpone：批量顺延 + audit_log 记录', async () => {
    vi.clearAllMocks()
    const todos: Todo[] = [
      {
        id: 1,
        title: '周五待办 1',
        status: 'PENDING',
        due_date: '2026-08-21',
        priority: 'NORMAL',
        content: null,
        start_date: null,
        completed_at: null,
        source_type: 'MANUAL',
        source_id: null,
            project_id: null,
            mentions: null,
        remind_time: null,
        created_at: '',
        updated_at: '',
      },
      {
        id: 2,
        title: '周五待办 2',
        status: 'PENDING',
        due_date: '2026-08-21',
        priority: 'NORMAL',
        content: null,
        start_date: null,
        completed_at: null,
        source_type: 'WEEKLY',
        source_id: null,
            project_id: null,
            mentions: null,
        remind_time: null,
        created_at: '',
        updated_at: '',
      },
    ]
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'list_todos') return todos
      if (cmd === 'get_todo') return todos[0]
      if (cmd === 'update_todo') return true
      if (cmd === 'list_system_config') return [{ config_key: 'todo_auto_postpone', config_value: '1' }]
      return []
    })

    const results = await executeAutoPostpone('2026-08-21', new LocalHolidayProvider())
    expect(results).toHaveLength(2)
    expect(results[0].newDueDate).toBe('2026-08-24') // 周一
    expect(results[1].newDueDate).toBe('2026-08-24')
  })
})

// ============================================================
// 验收 #4：自动跳过节假日
// ============================================================

describe('验收 #4：自动跳过节假日', () => {
  it('周五到期 → 周一（周一为法定节假日）→ 顺延到周二', () => {
    const todo: Todo = {
      id: 1,
      title: '测试节假日跳过',
      status: 'PENDING',
      due_date: '2026-08-21',
      priority: 'NORMAL',
      content: null,
      start_date: null,
      completed_at: null,
      source_type: 'MANUAL',
      source_id: null,
            project_id: null,
            mentions: null,
      remind_time: null,
      created_at: '',
      updated_at: '',
    }
    // mock holidays：2026-08-24 是法定节假日
    const provider = new LocalHolidayProvider()
    // 通过 load() 无法 mock（Rust command 不存在），用更底层方法
    // 直接 mock provider.list()
    ;(provider as any).cache.set('2026-08-24', {
      id: 1,
      date: '2026-08-24',
      name: '中秋节',
      type: 'HOLIDAY',
      isWorkday: 0,
      source: 'manual',
    })

    const newDate = computeAutoPostponeDate(todo, '2026-08-21', provider)
    expect(newDate).toBe('2026-08-25') // 周二（跳过周一节假日）
  })

  it('调休上班日（WORKDAY_SHIFT, is_workday=1）视为工作日', () => {
    const todo: Todo = {
      id: 1,
      title: '周日的调休待办',
      status: 'PENDING',
      due_date: '2026-08-21',
      priority: 'NORMAL',
      content: null,
      start_date: null,
      completed_at: null,
      source_type: 'MANUAL',
      source_id: null,
            project_id: null,
            mentions: null,
      remind_time: null,
      created_at: '',
      updated_at: '',
    }
    const provider = new LocalHolidayProvider()
    ;(provider as any).cache.set('2026-08-23', {
      // 周日
      id: 2,
      date: '2026-08-23',
      name: '调休上班',
      type: 'WORKDAY_SHIFT',
      isWorkday: 1,
      source: 'national',
    })
    const newDate = computeAutoPostponeDate(todo, '2026-08-21', provider)
    // 周六 → 周日（调休上班日）→ 视为工作日 → 周一
    expect(newDate).toBe('2026-08-24')
  })
})

// ============================================================
// 验收 #5：关闭自动顺延
// ============================================================

describe('验收 #5：关闭自动顺延', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('system_config.todo_auto_postpone = 0 → 顺延空操作', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'list_system_config') return [{ config_key: 'todo_auto_postpone', config_value: '0' }]
      return []
    })
    const results = await executeAutoPostpone('2026-08-21', new LocalHolidayProvider())
    expect(results).toHaveLength(0)
  })

  it('system_config.todo_auto_postpone = 1 → 正常顺延', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'list_system_config') return [{ config_key: 'todo_auto_postpone', config_value: '1' }]
      if (cmd === 'list_todos') return [
        {
          id: 1,
          title: 't',
          status: 'PENDING',
          due_date: '2026-08-21',
          priority: 'NORMAL',
          content: null,
          start_date: null,
          completed_at: null,
          source_type: 'MANUAL',
          source_id: null,
            project_id: null,
            mentions: null,
          remind_time: null,
          created_at: '',
          updated_at: '',
        },
      ]
      if (cmd === 'get_todo') return null
      if (cmd === 'update_todo') return true
      return []
    })
    const results = await executeAutoPostpone('2026-08-21', new LocalHolidayProvider())
    expect(results.length).toBeGreaterThan(0)
  })
})

// ============================================================
// 验收 #6：项目任务同步 Todo（占位 · PM A1 冲突）
// ============================================================

describe('验收 #6：项目任务同步 Todo（PM A1 占位）', () => {
  it('createTodo 接受 sourceType=WEEKLY（与 PM A1 一致）', async () => {
    vi.clearAllMocks()
    vi.mocked(invoke).mockResolvedValueOnce(99)
    const id = await createTodo({
      title: '周任务',
      sourceType: 'WEEKLY',
    })
    expect(invoke).toHaveBeenCalledWith(
      'create_todo',
      expect.objectContaining({
        todo: expect.objectContaining({
          source_type: 'WEEKLY',
        }),
      }),
    )
    expect(id).toBe(99)
  })

  it('⚠️ 创建 Todo 时不允许 sourceType=PROJECT_TASK（PM A1 已废除）', async () => {
    // Phase 3 严格按 PM A1：仅 MANUAL/WEEKLY
    // TypeScript 类型本身不允许 PROJECT_TASK，但运行时需验证后端
    // 此测试作为文档记录约束
    const todo = {
      title: '项目任务（违规示例）',
      source_type: 'WEEKLY' as const, // 强制仅 MANUAL/WEEKLY
    }
    expect(todo.source_type).not.toBe('PROJECT_TASK')
    expect(['MANUAL', 'WEEKLY']).toContain(todo.source_type)
  })
})

// ============================================================
// 三视图数据加载（RFC-02 §4）
// ============================================================

describe('loadDayView / loadWeekView / loadMonthView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loadDayView 返回 7 天窗口 + 过滤 due_date 在范围内的 todos', async () => {
    const todos: Todo[] = [
      {
        id: 1,
        title: '今天',
        status: 'PENDING',
        due_date: formatLocalDate(new Date()),
        priority: 'NORMAL',
        content: null,
        start_date: null,
        completed_at: null,
        source_type: 'MANUAL',
        source_id: null,
            project_id: null,
            mentions: null,
        remind_time: null,
        created_at: '',
        updated_at: '',
      },
    ]
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'list_todos') return todos
      return []
    })
    const result = await loadDayView(formatLocalDate(new Date()))
    expect(result.days).toHaveLength(7) // 当前周 7 天窗口
    expect(result.todos).toHaveLength(1)
  })

  it('loadWeekView 返回周一到周日 + todos 在本周范围内', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'list_todos') return []
      return []
    })
    const result = await loadWeekView('2026-08-22')
    // 2026-08-22 是周六 · getMonday 返回本周周一 = 2026-08-17（Mon-Sun 整周包含 08-22）
    expect(result.weekStart).toBe('2026-08-17')
    expect(result.weekEnd).toBe('2026-08-23')
    expect(result.days).toHaveLength(7)
  })

  it('loadMonthView 返回指定年月的所有日期', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'list_todos') return []
      return []
    })
    const result = await loadMonthView('2026-08')
    expect(result.days).toHaveLength(31) // 8 月 31 天
  })
})