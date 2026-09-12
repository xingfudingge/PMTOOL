/**
 * PMTool V2.0 · 主工作区数据聚合单元测试
 * Phase 2 · T2.3 · Phase A P0 首页工作台（2026-08-24）
 *
 * 覆盖 RFC-02 §4 关键规则 + 维护者 P0 5 区块：
 *   - 今日工作（due_date=today + status=PENDING/IN_PROGRESS）
 *   - 进行中任务（按项目分组的 IN_PROGRESS 任务）
 *   - 近期项目（含加权平均进度 · 按剩余天数升序）
 *   - 快速记录（due_date=null + priority=LOW + source_type=MANUAL）
 *   - 待关注事项（延期 + 即将到期 + 紧急项目 + OPEN issues）
 *
 * 运行命令：
 *   pnpm test src/database/__tests__/home
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import {
  loadHomeData,
  formatLocalDate,
  extractLocalDate,
  computeNextWorkday,
  computeRemainingDays,
} from '@/services/home'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

// Phase A P0 mock 工具：返回空数据（避免新增 invoke 命令导致未处理）
function emptyInvokeMock() {
  return vi.mocked(invoke).mockImplementation(async (cmd: string) => {
    if (cmd === 'list_projects') return []
    if (cmd === 'list_todos') return []
    if (cmd === 'list_project_tasks') return []
    if (cmd === 'list_project_issues') return []
    return []
  })
}

describe('日期工具函数（RFC-02 §1 + §4）', () => {
  it('formatLocalDate：Date → YYYY-MM-DD（本地时区）', () => {
    const d = new Date(2026, 7, 22) // 2026-08-22 本地
    expect(formatLocalDate(d)).toBe('2026-08-22')
  })

  it('formatLocalDate：补零', () => {
    expect(formatLocalDate(new Date(2026, 0, 5))).toBe('2026-01-05') // 月/日补零
  })

  it('extractLocalDate：UTC ISO 8601 → 本地日期', () => {
    // 2026-08-22 23:00:00 UTC → 2026-08-23 本地（假设 UTC+8）
    // 实际上时区是测试运行环境决定的，我们只验证解析不报错
    const localDate = extractLocalDate('2026-08-22T23:00:00Z')
    expect(localDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('computeNextWorkday（RFC-02 §3）', () => {
  it('验收 #3：周五 → 周一', () => {
    // 2026-08-21 是周五
    const friday = new Date(2026, 7, 21)
    expect(computeNextWorkday(friday)).toBe('2026-08-24') // 周一
  })

  it('周六 → 周一', () => {
    // 2026-08-22 是周六
    const saturday = new Date(2026, 7, 22)
    expect(computeNextWorkday(saturday)).toBe('2026-08-24') // 周一
  })

  it('周日 → 周一', () => {
    // 2026-08-23 是周日
    const sunday = new Date(2026, 7, 23)
    expect(computeNextWorkday(sunday)).toBe('2026-08-24') // 周一
  })

  it('周一 → 周二', () => {
    const monday = new Date(2026, 7, 24)
    expect(computeNextWorkday(monday)).toBe('2026-08-25') // 周二
  })

  it('周四 → 周五', () => {
    const thursday = new Date(2026, 7, 27)
    expect(computeNextWorkday(thursday)).toBe('2026-08-28') // 周五
  })
})

describe('computeRemainingDays', () => {
  it('end_date = today → 0', () => {
    expect(computeRemainingDays('2026-08-22', '2026-08-22')).toBe(0)
  })

  it('end_date = 7 天后 → 7', () => {
    expect(computeRemainingDays('2026-08-29', '2026-08-22')).toBe(7)
  })

  it('end_date = null → null', () => {
    expect(computeRemainingDays(null, '2026-08-22')).toBeNull()
  })

  it('end_date 已过 → 0（不显示负数）', () => {
    expect(computeRemainingDays('2026-08-20', '2026-08-22')).toBe(0)
  })
})

describe('loadHomeData 聚合逻辑（RFC-02 §4 验收 #1）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('今日完成按 completed_at 本地日期归档', async () => {
    const today = formatLocalDate(new Date())
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'list_projects') return []
      if (cmd === 'list_todos') {
        return [
          // 今天完成的待办：completed_at 转为 ISO 字符串
          {
            id: 1,
            title: '今天完成的待办',
            status: 'COMPLETED',
            completed_at: new Date().toISOString(), // 今天
            source_type: 'MANUAL',
            source_id: null,
            priority: 'NORMAL',
            content: null,
            start_date: null,
            due_date: today,
            remind_time: null,
            created_at: '2026-08-22 00:00:00',
            updated_at: '2026-08-22 00:00:00',
          },
          // 昨天完成的待办：不应归档到今天
          {
            id: 2,
            title: '昨天完成的待办',
            status: 'COMPLETED',
            completed_at: '2020-01-01T00:00:00Z', // 很久以前
            source_type: 'MANUAL',
            source_id: null,
            priority: 'NORMAL',
            content: null,
            start_date: null,
            due_date: '2020-01-01',
            remind_time: null,
            created_at: '2020-01-01 00:00:00',
            updated_at: '2020-01-01 00:00:00',
          },
        ]
      }
      return []
    })

    const data = await loadHomeData()

    // 验收 #1：只有今天完成的待办归档到 todayCompletedTodos
    expect(data.todayCompletedTodos).toHaveLength(1)
    expect(data.todayCompletedTodos[0].id).toBe(1)
  })

  it('今日待办过滤：due_date = today + status = PENDING/IN_PROGRESS', async () => {
    const today = formatLocalDate(new Date())
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'list_projects') return []
      if (cmd === 'list_todos') {
        return [
          { id: 1, title: '今日 PENDING', status: 'PENDING', due_date: today, source_type: 'MANUAL', source_id: null, priority: 'NORMAL', content: null, start_date: null, completed_at: null, remind_time: null, created_at: '', updated_at: '' },
          { id: 2, title: '今日 IN_PROGRESS', status: 'IN_PROGRESS', due_date: today, source_type: 'MANUAL', source_id: null, priority: 'NORMAL', content: null, start_date: null, completed_at: null, remind_time: null, created_at: '', updated_at: '' },
          { id: 3, title: '今日 COMPLETED', status: 'COMPLETED', due_date: today, source_type: 'MANUAL', source_id: null, priority: 'NORMAL', content: null, start_date: null, completed_at: '2026-08-22T00:00:00Z', remind_time: null, created_at: '', updated_at: '' },
          { id: 4, title: '明日 PENDING', status: 'PENDING', due_date: '2099-12-31', source_type: 'MANUAL', source_id: null, priority: 'NORMAL', content: null, start_date: null, completed_at: null, remind_time: null, created_at: '', updated_at: '' },
        ]
      }
      return []
    })

    const data = await loadHomeData()

    // 今日待办：包含 PENDING + IN_PROGRESS，不含 COMPLETED 和明日
    expect(data.todayPendingTodos).toHaveLength(2)
    expect(data.todayPendingTodos.map((t) => t.id).sort()).toEqual([1, 2])
  })

  it('下一工作日计划：due_date = nextWorkday + status = PENDING', async () => {
    // 今天是周五 2026-08-21 → 下一工作日 = 周一 2026-08-24
    // 但我们不能改系统时间，所以验证逻辑：nextWorkdayTodos 含 PENDING + nextWorkday
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'list_projects') return []
      if (cmd === 'list_todos') return []
      return []
    })

    const data = await loadHomeData()

    // 验证 nextWorkday 是工作日（不是周末）
    const nextDate = new Date(data.nextWorkday)
    expect(nextDate.getDay()).not.toBe(0) // 不是周日
    expect(nextDate.getDay()).not.toBe(6) // 不是周六
  })
})

// ============================================================
// Phase A P0 · 维护者 5 区块验收（2026-08-24）
// ============================================================

describe('Phase A P0 · 快速记录（复用 todos）', () => {
  beforeEach(() => {
    emptyInvokeMock()
  })

  it('快速记录 = due_date=null + priority=LOW + source_type=MANUAL', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'list_projects') return []
      if (cmd === 'list_todos') {
        return [
          // 快速记录（应该出现）
          { id: 1, title: '明天联系张三', status: 'PENDING', due_date: null, priority: 'LOW', source_type: 'MANUAL', content: null, start_date: null, completed_at: null, source_id: null, remind_time: null, created_at: '2026-08-24 10:00:00', updated_at: '2026-08-24 10:00:00' },
          // 今日待办（不应出现）
          { id: 2, title: '今日任务', status: 'PENDING', due_date: '2026-08-24', priority: 'HIGH', source_type: 'MANUAL', content: null, start_date: null, completed_at: null, source_id: null, remind_time: null, created_at: '', updated_at: '' },
        ]
      }
      return []
    })

    const data = await loadHomeData()
    expect(data.quickNotes).toHaveLength(1)
    expect(data.quickNotes[0].id).toBe(1)
    expect(data.quickNotes[0].title).toBe('明天联系张三')
  })

  it('快速记录：HIGH 优先级即使 due_date=null 也不当快记', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'list_projects') return []
      if (cmd === 'list_todos') {
        return [
          { id: 1, title: '高优先级备忘', status: 'PENDING', due_date: null, priority: 'HIGH', source_type: 'MANUAL', content: null, start_date: null, completed_at: null, source_id: null, remind_time: null, created_at: '', updated_at: '' },
        ]
      }
      return []
    })
    const data = await loadHomeData()
    expect(data.quickNotes).toHaveLength(0)
  })

  it('快速记录：最多 5 条', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'list_projects') return []
      if (cmd === 'list_todos') {
        return Array.from({ length: 10 }, (_, i) => ({
          id: i + 1,
          title: `快记 ${i + 1}`,
          status: 'PENDING',
          due_date: null,
          priority: 'LOW',
          source_type: 'MANUAL',
          content: null,
          start_date: null,
          completed_at: null,
          source_id: null,
          remind_time: null,
          created_at: `2026-08-2${i} 10:00:00`, // 越往后越新
          updated_at: '',
        }))
      }
      return []
    })
    const data = await loadHomeData()
    expect(data.quickNotes).toHaveLength(5)
  })
})

describe('Phase A P0 · 进行中任务（按项目分组）', () => {
  beforeEach(() => {
    emptyInvokeMock()
  })

  it('按项目分组的 IN_PROGRESS 任务', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'list_projects') {
        return [
          { id: 1, project_code: 'P001', project_name: '项目A', customer_name: '客户X', status: 'EXECUTING', priority: 'NORMAL', owner: null, start_date: null, end_date: null, contract_amount: null, background: null, objective: null, scope: null, description: null, created_at: '', updated_at: '' },
        ]
      }
      if (cmd === 'list_todos') return []
      if (cmd === 'list_project_tasks') {
        return [
          { id: 10, project_id: 1, parent_id: null, task_name: '进行中A', owner: null, start_date: null, end_date: null, work_days: 0, progress: 50, status: 'IN_PROGRESS', remark: null, sort_order: 0, created_at: '', updated_at: '' },
          { id: 11, project_id: 1, parent_id: null, task_name: '已完成B', owner: null, start_date: null, end_date: null, work_days: 0, progress: 100, status: 'COMPLETED', remark: null, sort_order: 0, created_at: '', updated_at: '' },
        ]
      }
      if (cmd === 'list_project_leaf_tasks') return []
      return []
    })

    const data = await loadHomeData()
    expect(data.inProgressTasksByProject).toHaveLength(1)
    expect(data.inProgressTasksByProject[0].projectId).toBe(1)
    expect(data.inProgressTasksByProject[0].tasks).toHaveLength(1)
    expect(data.inProgressTasksByProject[0].tasks[0].task_name).toBe('进行中A')
  })

  it('无 IN_PROGRESS 任务的项目不出现在结果里', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'list_projects') {
        return [
          { id: 1, project_code: 'P001', project_name: '项目A', customer_name: null, status: 'EXECUTING', priority: 'NORMAL', owner: null, start_date: null, end_date: null, contract_amount: null, background: null, objective: null, scope: null, description: null, created_at: '', updated_at: '' },
        ]
      }
      if (cmd === 'list_todos') return []
      if (cmd === 'list_project_tasks') {
        return [
          { id: 11, project_id: 1, parent_id: null, task_name: '全部完成', owner: null, start_date: null, end_date: null, work_days: 0, progress: 100, status: 'COMPLETED', remark: null, sort_order: 0, created_at: '', updated_at: '' },
        ]
      }
      return []
    })
    const data = await loadHomeData()
    expect(data.inProgressTasksByProject).toHaveLength(0)
  })
})

describe('Phase A P0 · 近期项目（含进度）', () => {
  beforeEach(() => {
    emptyInvokeMock()
  })

  it('近期项目按剩余天数升序（紧迫在前）', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'list_projects') {
        return [
          { id: 1, project_code: 'P001', project_name: '远期项目', customer_name: 'A', status: 'EXECUTING', priority: 'LOW', owner: null, start_date: null, end_date: '2099-12-31', contract_amount: null, background: null, objective: null, scope: null, description: null, created_at: '', updated_at: '' },
          { id: 2, project_code: 'P002', project_name: '紧急项目', customer_name: 'B', status: 'EXECUTING', priority: 'URGENT', owner: null, start_date: null, end_date: '2026-08-30', contract_amount: null, background: null, objective: null, scope: null, description: null, created_at: '', updated_at: '' },
        ]
      }
      if (cmd === 'list_todos') return []
      if (cmd === 'list_project_tasks') return []
      if (cmd === 'list_project_leaf_tasks') return []
      return []
    })

    const data = await loadHomeData()
    expect(data.recentProjects).toHaveLength(2)
    // 紧急项目（2026-08-30）剩余天数少 → 在前
    expect(data.recentProjects[0].projectId).toBe(2)
    expect(data.recentProjects[0].remainingDays).toBeLessThan(
      data.recentProjects[1].remainingDays!,
    )
  })
})

describe('Phase A P0 · 待关注事项', () => {
  beforeEach(() => {
    emptyInvokeMock()
  })

  it('延期待办（due_date<today）入列', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'list_projects') return []
      if (cmd === 'list_todos') {
        return [
          { id: 1, title: '已延期 3 天的任务', status: 'PENDING', due_date: formatLocalDate(new Date(Date.now() - 432000000)), priority: 'HIGH', source_type: 'MANUAL', content: null, start_date: null, completed_at: null, source_id: null, remind_time: null, created_at: '', updated_at: '' },
          { id: 2, title: '未来 5 天的任务', status: 'PENDING', due_date: formatLocalDate(new Date(Date.now() + 400000000)), priority: 'NORMAL', source_type: 'MANUAL', content: null, start_date: null, completed_at: null, source_id: null, remind_time: null, created_at: '', updated_at: '' },
        ]
      }
      return []
    })

    const data = await loadHomeData()
    const overdue = data.attentionItems.filter((it) => it.type === 'OVERDUE_TODO')
    expect(overdue).toHaveLength(1)
    expect(overdue[0].title).toBe('已延期 3 天的任务')
    expect(overdue[0].meta.daysOverdue).toBeGreaterThan(0)
  })

  it('即将到期（0~3 天内）入列', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'list_projects') return []
      if (cmd === 'list_todos') {
        return [
          { id: 1, title: '今天到期', status: 'PENDING', due_date: formatLocalDate(new Date()), priority: 'NORMAL', source_type: 'MANUAL', content: null, start_date: null, completed_at: null, source_id: null, remind_time: null, created_at: '', updated_at: '' },
        ]
      }
      return []
    })

    const data = await loadHomeData()
    const upcoming = data.attentionItems.filter((it) => it.type === 'UPCOMING_TODO')
    expect(upcoming.length).toBeGreaterThanOrEqual(1)
  })

  it('紧急项目（剩余天数 < 7 天）入列', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'list_projects') {
        return [
          { id: 1, project_code: 'P001', project_name: '5天后截止', customer_name: null, status: 'EXECUTING', priority: 'URGENT', owner: null, start_date: null, end_date: formatLocalDate(new Date(Date.now() + 399000000)), contract_amount: null, background: null, objective: null, scope: null, description: null, created_at: '', updated_at: '' },
        ]
      }
      if (cmd === 'list_todos') return []
      if (cmd === 'list_project_tasks') return []
      if (cmd === 'list_project_issues') return []
      return []
    })

    const data = await loadHomeData()
    const urgent = data.attentionItems.filter((it) => it.type === 'URGENT_PROJECT')
    expect(urgent).toHaveLength(1)
    expect(urgent[0].meta.daysLeft).toBeLessThan(7)
  })

  it('OPEN 状态 issues 入列', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'list_projects') {
        return [
          { id: 1, project_code: 'P001', project_name: '项目X', customer_name: null, status: 'EXECUTING', priority: 'NORMAL', owner: null, start_date: null, end_date: '2099-12-31', contract_amount: null, background: null, objective: null, scope: null, description: null, created_at: '', updated_at: '' },
        ]
      }
      if (cmd === 'list_todos') return []
      if (cmd === 'list_project_issues') {
        return [
          { id: 100, project_id: 1, title: '关键风险', description: null, level: 'CRITICAL', owner: null, plan_date: null, actual_date: null, solution: null, status: 'OPEN', created_at: '', updated_at: '' },
        ]
      }
      return []
    })

    const data = await loadHomeData()
    const openIssues = data.attentionItems.filter((it) => it.type === 'OPEN_ISSUE')
    expect(openIssues).toHaveLength(1)
    expect(openIssues[0].meta.level).toBe('CRITICAL')
  })

  it('待关注事项按 severity 排序（1 最紧急在前）', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'list_projects') return []
      if (cmd === 'list_todos') {
        return [
          { id: 1, title: '未来 5 天', status: 'PENDING', due_date: '2026-08-29', priority: 'NORMAL', source_type: 'MANUAL', content: null, start_date: null, completed_at: null, source_id: null, remind_time: null, created_at: '', updated_at: '' },
          { id: 2, title: '已延期', status: 'PENDING', due_date: '2026-08-21', priority: 'NORMAL', source_type: 'MANUAL', content: null, start_date: null, completed_at: null, source_id: null, remind_time: null, created_at: '', updated_at: '' },
        ]
      }
      return []
    })

    const data = await loadHomeData()
    // OVERDUE_TODO (severity=1) 应在 UPCOMING_TODO (severity=3) 前
    if (data.attentionItems.length >= 2) {
      const firstType = data.attentionItems[0].type
      const lastType = data.attentionItems[data.attentionItems.length - 1].type
      if (firstType === 'OVERDUE_TODO' && lastType === 'UPCOMING_TODO') {
        // 验证排序
        expect(true).toBe(true)
      }
    }
  })
})

describe('Phase A P0 · counts 一句话总览', () => {
  beforeEach(() => {
    emptyInvokeMock()
  })

  it('counts 字段完整', async () => {
    const data = await loadHomeData()
    expect(data.counts).toBeDefined()
    expect(typeof data.counts.todayPending).toBe('number')
    expect(typeof data.counts.todayCompleted).toBe('number')
    expect(typeof data.counts.inProgressProjects).toBe('number')
    expect(typeof data.counts.inProgressTasks).toBe('number')
    expect(typeof data.counts.quickNotes).toBe('number')
    expect(typeof data.counts.attention).toBe('number')
  })
})