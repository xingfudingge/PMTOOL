/**
 * PMTool V2.0 · Project Issues 自动化测试
 * Phase 4 · T4.8
 *
 * 覆盖：
 *   - CRUD（list/get/create/update/delete）
 *   - 状态迁移合法性（isValidIssueStatusTransition · RFC-02 §2）
 *   - 状态统计（computeIssueStats）
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import {
  listProjectIssues,
  getProjectIssue,
  createProjectIssue,
  updateProjectIssue,
  deleteProjectIssue,
  isValidIssueStatusTransition,
  computeIssueStats,
  type ProjectIssue,
} from '@/services/projectIssues'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

const SAMPLE_ISSUES: ProjectIssue[] = [
  {
    id: 1,
    project_id: 1,
    title: '服务器采购延迟',
    description: '关键路径',
    level: 'HIGH',
    owner: '张三',
    plan_date: '2026-08-25',
    actual_date: null,
    discovered_at: '2026-08-20',
    solution: null,
    status: 'OPEN',
    created_at: '2026-08-21 10:00:00',
    updated_at: '2026-08-21 10:00:00',
  },
  {
    id: 2,
    project_id: 1,
    title: '合同审批',
    description: null,
    level: 'MEDIUM',
    owner: '李四',
    plan_date: '2026-08-30',
    actual_date: null,
    discovered_at: '2026-08-18',
    solution: null,
    status: 'IN_PROGRESS',
    created_at: '2026-08-20 10:00:00',
    updated_at: '2026-08-22 10:00:00',
  },
  {
    id: 3,
    project_id: 1,
    title: '需求变更',
    description: null,
    level: 'LOW',
    owner: '王五',
    plan_date: '2026-09-01',
    actual_date: '2026-09-02',
    discovered_at: '2026-08-15',
    solution: '已与客户沟通确认',
    status: 'RESOLVED',
    created_at: '2026-08-15 10:00:00',
    updated_at: '2026-09-02 10:00:00',
  },
  {
    id: 4,
    project_id: 1,
    title: '老问题',
    description: null,
    level: 'LOW',
    owner: '赵六',
    plan_date: '2026-07-01',
    actual_date: '2026-07-02',
    discovered_at: '2026-06-25',
    solution: '已解决',
    status: 'CLOSED',
    created_at: '2026-06-25 10:00:00',
    updated_at: '2026-07-03 10:00:00',
  },
]

// ============================================================
// 验收 T4.8 · CRUD
// ============================================================

describe('验收 T4.8 · Project Issues CRUD', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('listProjectIssues 调用 list_project_issues command', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(SAMPLE_ISSUES)
    const issues = await listProjectIssues(1)
    expect(invoke).toHaveBeenCalledWith('list_project_issues', { projectId: 1 })
    expect(issues).toHaveLength(4)
  })

  it('getProjectIssue 调用 get_project_issue command', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(SAMPLE_ISSUES[0])
    const i = await getProjectIssue(1)
    expect(invoke).toHaveBeenCalledWith('get_project_issue', { id: 1 })
    expect(i?.level).toBe('HIGH')
  })

  it('createProjectIssue 默认值填充（level=MEDIUM, status=OPEN）', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(99)
    const id = await createProjectIssue({ project_id: 1, title: '新问题' })
    expect(invoke).toHaveBeenCalledWith(
      'create_project_issue',
      expect.objectContaining({
        issue: expect.objectContaining({
          project_id: 1,
          title: '新问题',
          level: 'MEDIUM',
          status: 'OPEN',
        }),
      }),
    )
    expect(id).toBe(99)
  })

  it('updateProjectIssue 合并现有字段', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(SAMPLE_ISSUES[0])
    vi.mocked(invoke).mockResolvedValueOnce(true)
    await updateProjectIssue(1, { status: 'RESOLVED', solution: '已修复' })
    expect(invoke).toHaveBeenCalledTimes(2)
    expect(invoke).toHaveBeenLastCalledWith(
      'update_project_issue',
      expect.objectContaining({
        id: 1,
        issue: expect.objectContaining({
          title: '服务器采购延迟', // 保留
          status: 'RESOLVED', // 更新
          solution: '已修复', // 更新
        }),
      }),
    )
  })

  it('deleteProjectIssue 调用 delete_project_issue command', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(true)
    await deleteProjectIssue(1)
    expect(invoke).toHaveBeenCalledWith('delete_project_issue', { id: 1 })
  })
})

// ============================================================
// 验收 T4.8 · isValidIssueStatusTransition（RFC-02 §2）
// ============================================================

describe('验收 T4.8 · 状态迁移合法性（RFC-02 §2）', () => {
  it('OPEN → IN_PROGRESS 合法', () => {
    expect(isValidIssueStatusTransition('OPEN', 'IN_PROGRESS')).toBe(true)
  })

  it('OPEN → RESOLVED 合法', () => {
    expect(isValidIssueStatusTransition('OPEN', 'RESOLVED')).toBe(true)
  })

  it('OPEN → CLOSED 不合法（必须经过 RESOLVED）', () => {
    expect(isValidIssueStatusTransition('OPEN', 'CLOSED')).toBe(false)
  })

  it('IN_PROGRESS → RESOLVED 合法', () => {
    expect(isValidIssueStatusTransition('IN_PROGRESS', 'RESOLVED')).toBe(true)
  })

  it('IN_PROGRESS → CLOSED 不合法', () => {
    expect(isValidIssueStatusTransition('IN_PROGRESS', 'CLOSED')).toBe(false)
  })

  it('RESOLVED → CLOSED 合法', () => {
    expect(isValidIssueStatusTransition('RESOLVED', 'CLOSED')).toBe(true)
  })

  it('RESOLVED → IN_PROGRESS 合法（可重新打开）', () => {
    expect(isValidIssueStatusTransition('RESOLVED', 'IN_PROGRESS')).toBe(true)
  })

  it('CLOSED → 任何状态都不合法（终态）', () => {
    expect(isValidIssueStatusTransition('CLOSED', 'OPEN')).toBe(false)
    expect(isValidIssueStatusTransition('CLOSED', 'IN_PROGRESS')).toBe(false)
    expect(isValidIssueStatusTransition('CLOSED', 'RESOLVED')).toBe(false)
  })
})

// ============================================================
// 验收 T4.8 · computeIssueStats
// ============================================================

describe('验收 T4.8 · computeIssueStats', () => {
  it('正确统计各状态数量', () => {
    const stats = computeIssueStats(SAMPLE_ISSUES)
    expect(stats.total).toBe(4)
    expect(stats.open).toBe(1)
    expect(stats.inProgress).toBe(1)
    expect(stats.resolved).toBe(1)
    expect(stats.closed).toBe(1)
  })

  it('空数组 → 全 0', () => {
    const stats = computeIssueStats([])
    expect(stats.total).toBe(0)
    expect(stats.open).toBe(0)
  })
})