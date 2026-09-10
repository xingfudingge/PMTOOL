/**
 * PMTool V2.0 · Project Tasks WebView 端 Service
 * Phase 4 · T4.7
 *
 * 架构：WebView → invoke('list_project_tasks', ...) → commands::project_tasks → Rust service
 *
 * 业务逻辑（RFC-02 §2 加权平均进度）：
 *   - 整体进度 = 叶子任务 progress 加权平均
 *   - work_days > 0 → 权重 = work_days；否则 = 1
 *   - 无叶子任务 → 进度 = 0
 *   - 父任务不参与平均
 */

import { invoke } from '@tauri-apps/api/core'

export interface ProjectTask {
  id: number
  project_id: number
  parent_id: number | null
  task_name: string
  owner: string | null
  start_date: string | null
  end_date: string | null
  work_days: number
  natural_days: number
  progress: number
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'DELAYED'
  remark: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export interface NewTask {
  project_id: number
  parent_id?: number | null
  task_name: string
  owner?: string | null
  start_date?: string | null
  end_date?: string | null
  work_days?: number
  natural_days?: number
  progress?: number
  status?: ProjectTask['status']
  remark?: string | null
  sort_order?: number
}

/** 列出项目的所有任务（含父子）*/
export async function listProjectTasks(projectId: number): Promise<ProjectTask[]> {
  return invoke<ProjectTask[]>('list_project_tasks', { projectId })
}

/** 列出项目的叶子任务（用于进度计算）*/
export async function listProjectLeafTasks(projectId: number): Promise<ProjectTask[]> {
  return invoke<ProjectTask[]>('list_project_leaf_tasks', { projectId })
}

export async function getProjectTask(id: number): Promise<ProjectTask | null> {
  return invoke<ProjectTask | null>('get_project_task', { id })
}

export async function createProjectTask(task: NewTask): Promise<number> {
  const fullTask: ProjectTask = {
    id: 0,
    project_id: task.project_id,
    parent_id: task.parent_id ?? null,
    task_name: task.task_name,
    owner: task.owner ?? null,
    start_date: task.start_date ?? null,
    end_date: task.end_date ?? null,
    work_days: task.work_days ?? 0,
    natural_days: task.natural_days ?? 0,
    progress: task.progress ?? 0,
    status: task.status ?? 'PENDING',
    remark: task.remark ?? null,
    sort_order: task.sort_order ?? 0,
    created_at: '',
    updated_at: '',
  }
  return invoke<number>('create_project_task', { task: fullTask })
}

export async function updateProjectTask(id: number, patch: Partial<NewTask>): Promise<boolean> {
  const existing = await getProjectTask(id)
  if (!existing) return false
  // 🔍 TRACE
  console.log('[UPDATE_TASK]', {
    id,
    patch_keys: Object.keys(patch),
    natural_days_in: patch.natural_days,
    natural_days_existing: existing.natural_days,
    existing_natural_days: existing.natural_days,
  })
  const task: ProjectTask = {
    ...existing,
    parent_id: patch.parent_id !== undefined ? patch.parent_id : existing.parent_id,
    task_name: patch.task_name ?? existing.task_name,
    owner: patch.owner !== undefined ? patch.owner : existing.owner,
    start_date: patch.start_date !== undefined ? patch.start_date : existing.start_date,
    end_date: patch.end_date !== undefined ? patch.end_date : existing.end_date,
    work_days: patch.work_days ?? existing.work_days,
    natural_days: patch.natural_days !== undefined ? patch.natural_days : existing.natural_days,
    progress: patch.progress !== undefined ? patch.progress : existing.progress,
    status: patch.status !== undefined ? patch.status : existing.status,
    remark: patch.remark !== undefined ? patch.remark : existing.remark,
    sort_order: patch.sort_order !== undefined ? patch.sort_order : existing.sort_order,
  }
  console.log('[UPDATE_TASK] final natural_days=', task.natural_days)
  return invoke<boolean>('update_project_task', { id, task })
}

export async function deleteProjectTask(id: number): Promise<boolean> {
  return invoke<boolean>('delete_project_task', { id })
}

/**
 * 计算项目整体进度（RFC-02 §2 加权平均）
 * - 叶子任务 progress 加权平均
 * - work_days > 0 → 权重 = work_days
 * - 否则 → 权重 = 1
 * - 无叶子任务 → 进度 = 0
 */
export async function computeProjectOverallProgress(projectId: number): Promise<number> {
  const leafTasks = await listProjectLeafTasks(projectId)
  if (leafTasks.length === 0) return 0
  let totalWeightedProgress = 0
  let totalWeight = 0
  for (const t of leafTasks) {
    const weight = t.work_days > 0 ? t.work_days : 1
    totalWeightedProgress += t.progress * weight
    totalWeight += weight
  }
  return totalWeight > 0 ? Math.round(totalWeightedProgress / totalWeight) : 0
}

/** 构建任务树（父子层级）*/
export interface TaskNode extends ProjectTask {
  children: TaskNode[]
}

export function buildTaskTree(tasks: ProjectTask[]): TaskNode[] {
  const map = new Map<number, TaskNode>()
  const roots: TaskNode[] = []
  for (const t of tasks) {
    map.set(t.id, { ...t, children: [] })
  }
  for (const t of tasks) {
    const node = map.get(t.id)!
    if (t.parent_id !== null) {
      const parent = map.get(t.parent_id)
      if (parent) {
        parent.children.push(node)
      } else {
        roots.push(node)
      }
    } else {
      roots.push(node)
    }
  }
  return roots
}

/// 批量导入任务（整体事务）
export async function importProjectTasksBulk(projectId: number, tasks: unknown[]): Promise<number[]> {
  return await invoke<number[]>('import_project_tasks_bulk', { projectId, tasks })
}
