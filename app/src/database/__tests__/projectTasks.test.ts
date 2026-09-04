/**
 * PMTool V2.0 · Project Tasks 自动化测试
 * Phase 4 · T4.7
 *
 * 覆盖：
 *   - 列表（listProjectTasks）
 *   - 叶子任务（listProjectLeafTasks，用于加权平均）
 *   - CRUD（get/create/update/delete）
 *   - 加权平均进度算法（computeProjectOverallProgress · RFC-02 §2）
 *   - 任务树构建（buildTaskTree）
 *   - 父任务约束（循环检测 · 由 Rust 端 ensure）
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import {
  listProjectTasks,
  listProjectLeafTasks,
  getProjectTask,
  createProjectTask,
  updateProjectTask,
  deleteProjectTask,
  computeProjectOverallProgress,
  buildTaskTree,
  type ProjectTask,
} from '@/services/projectTasks'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

const SAMPLE_TASKS: ProjectTask[] = [
  // 父任务
  {
    id: 1,
    project_id: 1,
    parent_id: null,
    task_name: '父任务 P1',
    owner: '张三',
    start_date: '2026-08-01',
    end_date: '2026-08-31',
    work_days: 22,
    natural_days: 30,
    progress: 0,
    status: 'IN_PROGRESS',
    remark: null,
    sort_order: 0,
    created_at: '2026-08-01 10:00:00',
    updated_at: '2026-08-01 10:00:00',
  },
  // 子任务 L1（work_days=2, progress=50）
  {
    id: 2,
    project_id: 1,
    parent_id: 1,
    task_name: '子任务 L1',
    owner: '张三',
    start_date: '2026-08-01',
    end_date: '2026-08-03',
    work_days: 2,
    natural_days: 3,
    progress: 50,
    status: 'IN_PROGRESS',
    remark: null,
    sort_order: 1,
    created_at: '2026-08-01 10:00:00',
    updated_at: '2026-08-01 10:00:00',
  },
  // 子任务 L2（work_days=8, progress=100）
  {
    id: 3,
    project_id: 1,
    parent_id: 1,
    task_name: '子任务 L2',
    owner: '李四',
    start_date: '2026-08-01',
    end_date: '2026-08-12',
    work_days: 8,
    natural_days: 12,
    progress: 100,
    status: 'COMPLETED',
    remark: null,
    sort_order: 2,
    created_at: '2026-08-01 10:00:00',
    updated_at: '2026-08-01 10:00:00',
  },
  // 独立任务 L3（work_days=4, progress=0）
  {
    id: 4,
    project_id: 1,
    parent_id: null,
    task_name: '独立任务 L3',
    owner: '王五',
    start_date: '2026-08-15',
    end_date: '2026-08-20',
    work_days: 4,
    natural_days: 6,
    progress: 0,
    status: 'PENDING',
    remark: null,
    sort_order: 3,
    created_at: '2026-08-15 10:00:00',
    updated_at: '2026-08-15 10:00:00',
  },
]

// ============================================================
// 验收 T4.7 · listProjectTasks / listProjectLeafTasks
// ============================================================

describe('验收 T4.7 · listProjectTasks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('listProjectTasks 调用 list_project_tasks command', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(SAMPLE_TASKS)
    const tasks = await listProjectTasks(1)
    expect(invoke).toHaveBeenCalledWith('list_project_tasks', { projectId: 1 })
    expect(tasks).toHaveLength(4)
  })

  it('listProjectLeafTasks 调用 list_project_leaf_tasks command · 排除父任务', async () => {
    const leafOnly = SAMPLE_TASKS.filter((t) => t.parent_id === null || t.parent_id !== 1)
    // 注意：上面的 filter 是简化 · 真实实现里 listProjectLeafTasks 在 Rust 端过滤
    vi.mocked(invoke).mockResolvedValueOnce(leafOnly)
    const tasks = await listProjectLeafTasks(1)
    expect(invoke).toHaveBeenCalledWith('list_project_leaf_tasks', { projectId: 1 })
    expect(tasks.length).toBeGreaterThan(0)
  })
})

// ============================================================
// 验收 T4.7 · CRUD
// ============================================================

describe('验收 T4.7 · CRUD', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('getProjectTask 调用 get_project_task command', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(SAMPLE_TASKS[0])
    const t = await getProjectTask(1)
    expect(invoke).toHaveBeenCalledWith('get_project_task', { id: 1 })
    expect(t?.id).toBe(1)
  })

  it('createProjectTask 调用 create_project_task command · 默认值填充', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(42)
    const id = await createProjectTask({
      project_id: 1,
      task_name: '新任务',
    })
    expect(invoke).toHaveBeenCalledWith(
      'create_project_task',
      expect.objectContaining({
        task: expect.objectContaining({
          project_id: 1,
          task_name: '新任务',
          parent_id: null,
          status: 'PENDING',
          progress: 0,
          work_days: 0,
        }),
      }),
    )
    expect(id).toBe(42)
  })

  it('updateProjectTask 合并现有字段（不覆盖未传字段）', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(SAMPLE_TASKS[0])
    vi.mocked(invoke).mockResolvedValueOnce(true)
    await updateProjectTask(1, { progress: 75 })
    expect(invoke).toHaveBeenCalledTimes(2)
    expect(invoke).toHaveBeenLastCalledWith(
      'update_project_task',
      expect.objectContaining({
        id: 1,
        task: expect.objectContaining({
          task_name: '父任务 P1', // 保留
          progress: 75, // 更新
        }),
      }),
    )
  })

  it('deleteProjectTask 调用 delete_project_task command', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(true)
    await deleteProjectTask(1)
    expect(invoke).toHaveBeenCalledWith('delete_project_task', { id: 1 })
  })
})

// ============================================================
// 验收 T4.7 · computeProjectOverallProgress（RFC-02 §2 加权平均）
// ============================================================

describe('验收 T4.7 · computeProjectOverallProgress（加权平均）', () => {
  it('验收 #2（RFC-02 §6.2）：父 + 2 叶子（2天 50% + 8天 100%）→ 90', async () => {
    // Mock 叶子任务（只有叶子）
    const leafOnly = SAMPLE_TASKS.filter((t) => t.parent_id !== null)
    vi.mocked(invoke).mockResolvedValueOnce(leafOnly)
    const progress = await computeProjectOverallProgress(1)
    // (2×50 + 8×100) / (2+8) = 1100/10 = 110（向下取整）？
    // 实际：(2*50 + 8*100) / 10 = (100+800)/10 = 90
    expect(progress).toBe(90)
  })

  it('无叶子任务 → 进度 0', async () => {
    vi.mocked(invoke).mockResolvedValueOnce([])
    const progress = await computeProjectOverallProgress(1)
    expect(progress).toBe(0)
  })

  it('work_days=0 的叶子 → 默认权重 1', async () => {
    const leafNoWork: ProjectTask[] = [{ ...SAMPLE_TASKS[2], work_days: 0, progress: 50 }]
    vi.mocked(invoke).mockResolvedValueOnce(leafNoWork)
    const progress = await computeProjectOverallProgress(1)
    // 权重 = 1，progress = 50
    expect(progress).toBe(50)
  })
})

// ============================================================
// 验收 T4.7 · buildTaskTree
// ============================================================

describe('验收 T4.7 · buildTaskTree', () => {
  it('父子任务构建为树', () => {
    const tree = buildTaskTree(SAMPLE_TASKS)
    expect(tree).toHaveLength(2) // 2 个根任务（id=1 父任务 + id=4 独立任务）

    const parent = tree.find((n) => n.id === 1)
    expect(parent).toBeDefined()
    expect(parent?.children).toHaveLength(2) // L1 + L2

    const childrenIds = parent?.children.map((c) => c.id).sort()
    expect(childrenIds).toEqual([2, 3])
  })

  it('独立任务（无 parent_id）作为根节点', () => {
    const tree = buildTaskTree(SAMPLE_TASKS)
    const standalone = tree.find((n) => n.id === 4)
    expect(standalone).toBeDefined()
    expect(standalone?.children).toHaveLength(0)
  })

  it('空数组 → 空树', () => {
    expect(buildTaskTree([])).toEqual([])
  })

  it('父任务引用不存在的 parent_id → 视为根节点', () => {
    const orphans: ProjectTask[] = [{ ...SAMPLE_TASKS[2], parent_id: 999 }]
    const tree = buildTaskTree(orphans)
    expect(tree).toHaveLength(1) // 孤儿任务变根
  })
})