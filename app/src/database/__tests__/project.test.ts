/**
 * PMTool V2.0 · Project 自动化测试
 * Phase 4 · T4.7
 *
 * 覆盖：
 *   - 项目 CRUD（listProjects / createProject / updateProject / deleteProject）
 *   - 项目进度计算（computeProjectProgress）
 *   - 项目任务 / 问题加载（listProjectTasks / listProjectIssues · ⚠️ Phase 0 未实接）
 *   - Excel 字段映射（taskToExcelRow / excelRowToTask）
 *   - ProjectAIProvider 接口（Mock 实现）
 *   - 4 指标展示
 *
 * 运行命令（待网络恢复）：
 *   pnpm test src/database/__tests__/project
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import {
  listProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  computeProjectProgress,
  listProjectTasks,
  listProjectIssues,
  type Project,
} from '@/services/project'
import {
  taskToExcelRow,
  excelRowToTask,
  exportProjectPlanToExcel,
  parseProjectPlanExcel,
} from '@/services/excel'
import {
  generateProjectSummary,
  analyzeProjectRisk,
  generateProjectReport,
  defaultProjectAIProvider,
} from '@/services/projectAI'
import type { ProjectTask } from '@/services/project'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async () => []),
}))

const SAMPLE_PROJECT: Project = {
  id: 1,
  project_code: 'PM-2026-001',
  project_name: '测试科技智能合同项目',
  customer_name: '测试科技',
  status: 'IN_PROGRESS',
  priority: 'HIGH',
  owner: '刘海东',
  start_date: '2026-07-13',
  end_date: '2026-09-30',
  contract_amount: 1000000,
  background: null,
  objective: null,
  scope: null,
  description: null,
  created_at: '2026-07-13 10:00:00',
  updated_at: '2026-08-22 10:00:00',
}

const SAMPLE_TASK: ProjectTask = {
  id: 1,
  project_id: 1,
  parent_id: null,
  task_name: '需求调研',
  owner: '刘海东',
  start_date: '2026-07-13',
  end_date: '2026-07-30',
  work_days: 14,
  natural_days: 18,
  progress: 80,
  status: 'IN_PROGRESS',
  remark: '部分子任务进行中',
  sort_order: 0,
  created_at: '2026-07-13 10:00:00',
  updated_at: '2026-07-13 10:00:00',
}

// ============================================================
// 验收 T4.1：项目 CRUD
// ============================================================

describe('验收 T4.1 · 项目 CRUD', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('listProjects 调用 list_projects command · 参数结构正确', async () => {
    vi.mocked(invoke).mockResolvedValueOnce([SAMPLE_PROJECT])
    const result = await listProjects()
    expect(invoke).toHaveBeenCalledWith('list_projects', { status: null })
    expect(result).toHaveLength(1)
    expect(result[0].project_code).toBe('PM-2026-001')
  })

  it('listProjects 传 status 过滤 → 生效', async () => {
    vi.mocked(invoke).mockResolvedValueOnce([SAMPLE_PROJECT])
    await listProjects({ status: 'IN_PROGRESS' })
    expect(invoke).toHaveBeenCalledWith('list_projects', { status: 'IN_PROGRESS' })
  })

  it('getProject(id) → null 当项目不存在', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(null)
    const result = await getProject(999)
    expect(result).toBeNull()
  })

  it('createProject 默认 status=PLANNING priority=NORMAL', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(42)
    const id = await createProject({
      projectCode: 'PM-NEW',
      projectName: '新建项目',
    })
    expect(invoke).toHaveBeenCalledWith(
      'create_project',
      expect.objectContaining({
        project: expect.objectContaining({
          project_code: 'PM-NEW',
          project_name: '新建项目',
          status: 'PLANNING',
          priority: 'NORMAL',
        }),
      }),
    )
    expect(id).toBe(42)
  })

  it('updateProject 合并现有字段（不覆盖未传字段）', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(SAMPLE_PROJECT)
    vi.mocked(invoke).mockResolvedValueOnce(true)
    await updateProject(1, { priority: 'URGENT' })
    // get_project 调一次 + update_project 调一次
    expect(invoke).toHaveBeenCalledTimes(2)
    expect(invoke).toHaveBeenLastCalledWith(
      'update_project',
      expect.objectContaining({
        id: 1,
        project: expect.objectContaining({
          priority: 'URGENT',
          // 未传字段保持原值
          project_code: 'PM-2026-001',
          project_name: '测试科技智能合同项目',
        }),
      }),
    )
  })

  it('updateProject 非存在项目 → 返回 false', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(null)
    const result = await updateProject(999, { priority: 'URGENT' })
    expect(result).toBe(false)
  })

  it('deleteProject 调用 delete_project command', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(true)
    const result = await deleteProject(1)
    expect(invoke).toHaveBeenCalledWith('delete_project', { id: 1 })
    expect(result).toBe(true)
  })
})

// ============================================================
// 验收 T4.1：项目进度计算（RFC-02 §2）
// ============================================================

describe('验收 T4.1 · computeProjectProgress', () => {
  it('IN_PROGRESS 项目：进度 = 50（合同金额占位）', () => {
    const progress = computeProjectProgress(SAMPLE_PROJECT, '2026-08-22')
    expect(progress.overallProgress).toBe(50)
    expect(progress.status).toBe('IN_PROGRESS')
    expect(progress.isOverdue).toBe(false)
  })

  it('已逾期项目（today > end_date 且非 COMPLETED）→ isOverdue=true', () => {
    const progress = computeProjectProgress(SAMPLE_PROJECT, '2026-10-15')
    expect(progress.isOverdue).toBe(true)
    expect(progress.remainingDays).toBe(0) // 已过期显示 0 而非负数
  })

  it('COMPLETED 项目：即使 end_date 已过，isOverdue=false', () => {
    const completed = { ...SAMPLE_PROJECT, status: 'COMPLETED' as const }
    const progress = computeProjectProgress(completed, '2026-10-15')
    expect(progress.isOverdue).toBe(false)
  })

  it('无 end_date → remainingDays=null', () => {
    const noEndDate = { ...SAMPLE_PROJECT, end_date: null }
    const progress = computeProjectProgress(noEndDate, '2026-08-22')
    expect(progress.remainingDays).toBeNull()
  })

  it('无 contract_amount → overallProgress = 0（占位）', () => {
    const noAmount = { ...SAMPLE_PROJECT, contract_amount: null }
    const progress = computeProjectProgress(noAmount, '2026-08-22')
    expect(progress.overallProgress).toBe(0)
  })
})

// ============================================================
// 验收 T4.3：项目任务加载（⚠️ Phase 0 未实接）
// ============================================================

describe('验收 T4.3 · listProjectTasks / listProjectIssues（Phase 0 解冻后实接）', () => {
  it('listProjectTasks 当前返回空数组（Phase 0 未实接命令）', async () => {
    // Phase 0 list_project_tasks 命令未实现 → 返回空
    const tasks = await listProjectTasks(1)
    expect(tasks).toEqual([])
  })

  it('listProjectIssues 当前返回空数组（Phase 0 未实接命令）', async () => {
    const issues = await listProjectIssues(1)
    expect(issues).toEqual([])
  })
})

// ============================================================
// 验收 T4.5：Excel 字段映射
// ============================================================

describe('验收 T4.5 · taskToExcelRow', () => {
  it('ProjectTask → Excel 行（字段名按 EXCEL_COLUMNS.key）', () => {
    const row = taskToExcelRow(SAMPLE_TASK)
    expect(row.task_name).toBe('需求调研')
    expect(row.owner).toBe('刘海东')
    expect(row.work_days).toBe(14)
    expect(row.progress).toBe(80)
    expect(row.remark).toBe('部分子任务进行中')
  })

  it('owner/remark 为 null 时 → 空字符串', () => {
    const task = { ...SAMPLE_TASK, owner: null, remark: null }
    const row = taskToExcelRow(task)
    expect(row.owner).toBe('')
    expect(row.remark).toBe('')
  })

  it('progress 四舍五入到整数', () => {
    const task = { ...SAMPLE_TASK, progress: 80.7 }
    const row = taskToExcelRow(task)
    expect(row.progress).toBe(81)
  })
})

describe('验收 T4.5 · excelRowToTask', () => {
  it('Excel 行 → Partial<ProjectTask>（含 projectId 注入）', () => {
    const row = {
      task_name: '需求调研',
      owner: '刘海东',
      start_date: '2026-07-13',
      end_date: '2026-07-30',
      work_days: 14,
      progress: 80,
      remark: '部分子任务',
    }
    const task = excelRowToTask(row, 1)
    expect(task.project_id).toBe(1)
    expect(task.task_name).toBe('需求调研')
    expect(task.work_days).toBe(14)
    expect(task.progress).toBe(80)
  })

  it('work_days 缺失 → 默认 0', () => {
    const row = { task_name: 't' }
    const task = excelRowToTask(row, 1)
    expect(task.work_days).toBe(0)
  })

  it('往返一致：task → row → task → row（保真度测试）', () => {
    const row1 = taskToExcelRow(SAMPLE_TASK)
    const task1 = excelRowToTask(row1, SAMPLE_TASK.project_id)
    const row2 = taskToExcelRow({ ...SAMPLE_TASK, ...task1 } as ProjectTask)

    expect(row2.task_name).toBe(row1.task_name)
    expect(row2.work_days).toBe(row1.work_days)
    expect(row2.progress).toBe(row1.progress)
  })
})

describe('验收 T4.5 · parseProjectPlanExcel / exportProjectPlanToExcel', () => {
  it('parseProjectPlanExcel 占位返回空数组（SheetJS 未装）', async () => {
    const tasks = await parseProjectPlanExcel(new ArrayBuffer(0))
    expect(tasks).toEqual([])
  })

  it('exportProjectPlanToExcel 占位返回 Blob（SheetJS 未装）', async () => {
    const blob = await exportProjectPlanToExcel([SAMPLE_TASK])
    expect(blob).toBeInstanceOf(Blob)
  })
})

// ============================================================
// 验收 T4.6：ProjectAIProvider 接口
// ============================================================

describe('验收 T4.6 · ProjectAIProvider 接口', () => {
  it('Mock generate(SUMMARY) 返回草稿（isDraft=true）', async () => {
    const result = await generateProjectSummary(1)
    expect(result.isDraft).toBe(true)
    expect(result.type).toBe('SUMMARY')
    expect(result.projectId).toBe(1)
    expect(result.content).toContain('Mock SUMMARY')
  })

  it('Mock generate(RISK_ANALYSIS) 返回草稿', async () => {
    const result = await analyzeProjectRisk(1)
    expect(result.type).toBe('RISK_ANALYSIS')
    expect(result.isDraft).toBe(true)
  })

  it('Mock generate(REPORT_GENERATION) 返回草稿', async () => {
    const result = await generateProjectReport(1, '周报')
    expect(result.type).toBe('REPORT_GENERATION')
    expect(result.isDraft).toBe(true)
  })

  it('默认 Provider 是 MockProjectAIProvider', () => {
    expect(defaultProjectAIProvider.constructor.name).toBe('MockProjectAIProvider')
  })

  it('⚠️ 输出永远是草稿（RFC-03 §4 AI 不能直接写库）', async () => {
    const result = await generateProjectSummary(1)
    expect(result.isDraft).toBe(true)
  })
})

// ============================================================
// 验收 T4.2：项目详情页 4 指标
// ============================================================

describe('验收 T4.2 · 详情页 4 指标（间接通过 computeProjectProgress 覆盖）', () => {
  it('整体进度指标 = progress.overallProgress', () => {
    const progress = computeProjectProgress(SAMPLE_PROJECT, '2026-08-22')
    expect(progress.overallProgress).toBeDefined()
  })

  it('剩余天数指标 = progress.remainingDays', () => {
    const progress = computeProjectProgress(SAMPLE_PROJECT, '2026-08-22')
    expect(progress.remainingDays).toBe(39) // 2026-08-22 ~ 2026-09-30 = 39 days
  })

  it('状态指标 = progress.status', () => {
    const progress = computeProjectProgress(SAMPLE_PROJECT, '2026-08-22')
    expect(progress.status).toBe('IN_PROGRESS')
  })

  it('优先指标 = project.priority', () => {
    expect(SAMPLE_PROJECT.priority).toBe('HIGH')
  })
})