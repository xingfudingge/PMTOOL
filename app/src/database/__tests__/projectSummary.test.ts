/**
 * PMTool V2.0 · ProjectSummary 数据聚合单元测试
 * Phase A · P1 项目中心整改（2026-08-24）
 *
 * 覆盖维护者 P1 5 要素：
 *   - 客户（project.customer_name）
 *   - 项目阶段（inferStage：5 阶段推断）
 *   - 当前风险（OPEN issues 计数）
 *   - 待办事项（pendingTaskCount + overdueTaskCount）
 *   - 交付资料入口（attachmentCount）
 *
 * 不依赖 Tauri runtime · 全部 mock
 *
 * 运行命令：
 *   pnpm vitest run src/database/__tests__/projectSummary
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import {
  inferStage,
  loadProjectOverviews,
  loadProjectSummary,
  STAGES,
  type ProjectOverview,
} from '@/services/projectSummary'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

// ============================================================
// 测试辅助
// ============================================================

function makeProject(overrides: Partial<{
  id: number
  customer_name: string | null
  status: 'START' | 'PLANNING' | 'EXECUTING' | 'MONITORING' | 'CLOSING'
  end_date: string | null
  owner: string | null
  overallProgress: number
}> = {}) {
  const defaults = {
    id: 1,
    project_code: 'P001',
    project_name: '测试项目',
    customer_name: '客户A',
    status: 'EXECUTING' as const,
    priority: 'NORMAL' as const,
    owner: '张三',
    start_date: null as string | null,
    end_date: '2026-12-31',
    contract_amount: 100000,
    background: null,
    objective: null,
    scope: null,
    description: null,
    created_at: '2026-01-01 00:00:00',
    updated_at: '2026-01-01 00:00:00',
  }
  return { ...defaults, ...overrides }
}

// ============================================================
// STAGES 常量
// ============================================================

describe('STAGES 常量', () => {
  it('5 个阶段：启动 / 需求确认 / 实施 / 试运行 / 验收', () => {
    expect(STAGES).toHaveLength(5)
    expect(STAGES.map((s) => s.label)).toEqual([
      '启动',
      '需求确认',
      '实施',
      '试运行',
      '验收',
    ])
  })

  it('阶段 order 1-5 递增', () => {
    STAGES.forEach((s, i) => {
      expect(s.order).toBe(i + 1)
    })
  })
})

// ============================================================
// inferStage：阶段推断
// ============================================================

describe('inferStage', () => {
  it('PLANNING → 启动（阶段 1）', () => {
    const r = inferStage(makeProject({ status: 'PLANNING' }),0)
    expect(r.stage).toBe('启动')
    expect(r.stageOrder).toBe(1)
  })

  it('COMPLETED → 已验收（阶段 5）', () => {
    const r = inferStage(makeProject({ status: 'CLOSING' }), 100)
    expect(r.stage).toBe('已验收')
    expect(r.stageOrder).toBe(5)
  })

  it('MONITORING + 中等进度 → 实施（按进度推断）', () => {
    const r = inferStage(makeProject({ status: 'MONITORING' }), 50)
    expect(r.stage).toBe('实施')
    expect(r.stageOrder).toBe(3)
  })

  it('IN_PROGRESS + 进度<20 → 启动', () => {
    const r = inferStage(makeProject({ status: 'EXECUTING' }), 10)
    expect(r.stage).toBe('启动')
  })

  it('IN_PROGRESS + 进度 20-40 → 需求确认', () => {
    const r = inferStage(makeProject({ status: 'EXECUTING' }), 30)
    expect(r.stage).toBe('需求确认')
  })

  it('IN_PROGRESS + 进度 40-80 → 实施', () => {
    const r = inferStage(makeProject({ status: 'EXECUTING' }), 60)
    expect(r.stage).toBe('实施')
  })

  it('IN_PROGRESS + 进度 80-100 → 试运行', () => {
    const r = inferStage(makeProject({ status: 'EXECUTING' }), 90)
    expect(r.stage).toBe('试运行')
  })

  it('SUSPENDED + 高进度 → 保持高阶段', () => {
    const r = inferStage(makeProject({ status: 'MONITORING' }), 60)
    expect(r.stage).toBe('实施')
  })

  it('stageTotal 始终为 5', () => {
    for (const status of ['START', 'PLANNING', 'EXECUTING', 'MONITORING', 'CLOSING'] as const) {
      const r = inferStage(makeProject({ status }), 50)
      expect(r.stageTotal).toBe(5)
    }
  })
})

// ============================================================
// loadProjectOverviews：列表摘要（N+1 mock）
// ============================================================

describe('loadProjectOverviews', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('空项目列表返回空数组', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'list_projects') return []
      return []
    })
    const result = await loadProjectOverviews()
    expect(result).toEqual([])
  })

  it('返回的项目含 5 要素计数', async () => {
    const project = makeProject({ id: 1, status: 'EXECUTING', end_date: '2026-12-31' })
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'list_projects') return [project]
      if (cmd === 'list_project_tasks') return []
      if (cmd === 'list_project_issues') return []
      if (cmd === 'list_attachments') return []
      return []
    })
    const result = await loadProjectOverviews()
    expect(result).toHaveLength(1)
    const o = result[0] as ProjectOverview
    expect(o.project.id).toBe(1)
    expect(o.openIssueCount).toBe(0)
    expect(o.urgentIssueCount).toBe(0)
    expect(o.pendingTaskCount).toBe(0)
    expect(o.overdueTaskCount).toBe(0)
    expect(o.attachmentCount).toBe(0)
    expect(o.stage).toBeDefined()
    expect(o.stageOrder).toBeGreaterThan(0)
  })

  it('风险 / 待办 / 资料计数准确（OPEN issues + 任务 + 附件）', async () => {
    const project = makeProject({ id: 1 })
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'list_projects') return [project]
      if (cmd === 'list_project_tasks') {
        return [
          // PENDING 1 + IN_PROGRESS 1 + COMPLETED 1（不计）
          {
            id: 10, project_id: 1, parent_id: null, task_name: '待办1',
            owner: null, start_date: null, end_date: '2026-12-31',
            work_days: 0, progress: 0, status: 'PENDING', remark: null,
            sort_order: 0, created_at: '', updated_at: '',
          },
          {
            id: 11, project_id: 1, parent_id: null, task_name: '进行中',
            owner: null, start_date: null, end_date: '2099-12-31',
            work_days: 0, progress: 50, status: 'IN_PROGRESS', remark: null,
            sort_order: 0, created_at: '', updated_at: '',
          },
          {
            id: 12, project_id: 1, parent_id: null, task_name: '已完成',
            owner: null, start_date: null, end_date: null,
            work_days: 0, progress: 100, status: 'COMPLETED', remark: null,
            sort_order: 0, created_at: '', updated_at: '',
          },
        ]
      }
      if (cmd === 'list_project_issues') {
        return [
          // OPEN HIGH + OPEN CRITICAL（urgent）+ RESOLVED（不算 open）
          {
            id: 100, project_id: 1, title: '高风险', description: null,
            level: 'HIGH', owner: null, plan_date: null, actual_date: null,
            solution: null, status: 'OPEN', created_at: '', updated_at: '',
          },
          {
            id: 101, project_id: 1, title: '严重风险', description: null,
            level: 'CRITICAL', owner: null, plan_date: null, actual_date: null,
            solution: null, status: 'OPEN', created_at: '', updated_at: '',
          },
          {
            id: 102, project_id: 1, title: '已解决', description: null,
            level: 'MEDIUM', owner: null, plan_date: null, actual_date: null,
            solution: null, status: 'RESOLVED', created_at: '', updated_at: '',
          },
        ]
      }
      if (cmd === 'list_attachments') {
        return [
          { id: 200, owner_type: 'PROJECT', owner_id: 1, file_name: 'a.pdf',
            file_path: '/x.pdf', file_size: 1024, file_type: 'application/pdf',
            created_at: '' },
          { id: 201, owner_type: 'PROJECT', owner_id: 1, file_name: 'b.docx',
            file_path: '/y.docx', file_size: 2048, file_type: 'application/docx',
            created_at: '' },
        ]
      }
      return []
    })

    const result = await loadProjectOverviews()
    const o = result[0] as ProjectOverview
    expect(o.openIssueCount).toBe(2) // OPEN HIGH + OPEN CRITICAL
    expect(o.urgentIssueCount).toBe(2) // 都 HIGH/CRITICAL
    expect(o.pendingTaskCount).toBe(2) // PENDING + IN_PROGRESS
    expect(o.overdueTaskCount).toBe(0) // end_date 都是未来
    expect(o.attachmentCount).toBe(2)
  })

  it('延期任务数：end_date < 今天 + 未完成', async () => {
    const project = makeProject({ id: 1 })
    // 用昨天日期（今天是 2026-08-24 · 系统时间）
    const yesterdayDate = new Date(Date.now() - 86400000 * 3) // 3 天前
    const yesterday = yesterdayDate.toISOString().split('T')[0]
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'list_projects') return [project]
      if (cmd === 'list_project_tasks') {
        return [
          {
            id: 10, project_id: 1, parent_id: null, task_name: '延期任务',
            owner: null, start_date: null, end_date: yesterday,
            work_days: 0, progress: 0, status: 'PENDING', remark: null,
            sort_order: 0, created_at: '', updated_at: '',
          },
        ]
      }
      return []
    })
    const result = await loadProjectOverviews()
    expect((result[0] as ProjectOverview).overdueTaskCount).toBe(1)
  })
})

// ============================================================
// loadProjectSummary：单个详情
// ============================================================

describe('loadProjectSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('项目不存在返回 null', async () => {
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'get_project') return null
      return []
    })
    const result = await loadProjectSummary(999)
    expect(result).toBeNull()
  })

  it('返回完整数据（含 issues / tasks / attachments 详细）', async () => {
    const project = makeProject({ id: 1 })
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'get_project') return project
      if (cmd === 'list_project_tasks') return [
        {
          id: 10, project_id: 1, parent_id: null, task_name: '待办1',
          owner: null, start_date: null, end_date: '2099-12-31',
          work_days: 0, progress: 0, status: 'PENDING', remark: null,
          sort_order: 0, created_at: '', updated_at: '',
        },
      ]
      if (cmd === 'list_project_issues') return [
        {
          id: 100, project_id: 1, title: '风险', description: null,
          level: 'HIGH', owner: null, plan_date: null, actual_date: null,
          solution: null, status: 'OPEN', created_at: '', updated_at: '',
        },
      ]
      if (cmd === 'list_attachments') return [
        { id: 200, owner_type: 'PROJECT', owner_id: 1, file_name: 'a.pdf',
          file_path: '/x.pdf', file_size: 1024, file_type: 'application/pdf',
          created_at: '' },
      ]
      return []
    })
    const result = await loadProjectSummary(1)
    expect(result).not.toBeNull()
    expect(result!.issues).toHaveLength(1)
    expect(result!.pendingTasks).toHaveLength(1)
    expect(result!.attachments).toHaveLength(1)
  })

  it('isOverdue：end_date 已过 + 未完成', async () => {
    const yesterday = new Date(Date.now() - 86400000 * 5).toISOString().split('T')[0]
    const project = makeProject({ id: 1, end_date: yesterday, status: 'EXECUTING' })
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'get_project') return project
      return []
    })
    const result = await loadProjectSummary(1)
    expect(result!.isOverdue).toBe(true)
  })

  it('isOverdue false：COMPLETED 即使 end_date 已过也不算逾期', async () => {
    const yesterday = new Date(Date.now() - 86400000 * 5).toISOString().split('T')[0]
    const project = makeProject({ id: 1, end_date: yesterday, status: 'CLOSING' })
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'get_project') return project
      return []
    })
    const result = await loadProjectSummary(1)
    expect(result!.isOverdue).toBe(false)
  })

  it('pendingTasks 按 end_date 升序（延期在前）', async () => {
    const project = makeProject({ id: 1 })
    const d1 = new Date(Date.now() - 86400000).toISOString().split('T')[0] // 昨天
    const d2 = '2099-12-31' // 远期
    vi.mocked(invoke).mockImplementation(async (cmd: string) => {
      if (cmd === 'get_project') return project
      if (cmd === 'list_project_tasks') return [
        // 先放远期，后放延期 · 应该重排后延期在前
        {
          id: 10, project_id: 1, parent_id: null, task_name: '远期任务',
          owner: null, start_date: null, end_date: d2,
          work_days: 0, progress: 0, status: 'PENDING', remark: null,
          sort_order: 0, created_at: '', updated_at: '',
        },
        {
          id: 11, project_id: 1, parent_id: null, task_name: '延期任务',
          owner: null, start_date: null, end_date: d1,
          work_days: 0, progress: 0, status: 'PENDING', remark: null,
          sort_order: 0, created_at: '', updated_at: '',
        },
      ]
      return []
    })
    const result = await loadProjectSummary(1)
    expect(result!.pendingTasks[0].task_name).toBe('延期任务')
    expect(result!.pendingTasks[1].task_name).toBe('远期任务')
  })
})