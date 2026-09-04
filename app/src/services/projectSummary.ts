/**
 * PMTool V2.0 · 项目中心数据聚合服务
 * Phase A · P1 项目中心整改（2026-08-24 维护者拍板）
 *
 * 设计依据：维护者 P1 5 要素
 *   - 客户
 *   - 项目阶段
 *   - 当前风险（OPEN issues + 剩余天数）
 *   - 待办事项（PENDING + IN_PROGRESS project_tasks）
 *   - 交付资料入口（attachments）
 *
 * 不新增表 · 不新增 Rust command（红线）
 * 复用已有 API：
 *   - listProjects / getProject
 *   - listProjectTasks / listProjectLeafTasks / computeProjectOverallProgress
 *   - listProjectIssues / computeIssueStats
 *   - list_attachments(ownerType='PROJECT', ownerId)
 */

import {
  listProjects,
  getProject,
  type Project,
} from '@/database/api'
import {
  listProjectTasks,
  computeProjectOverallProgress,
  type ProjectTask,
} from '@/services/projectTasks'
import {
  listProjectIssues,
  computeIssueStats,
  type ProjectIssue,
} from '@/services/projectIssues'
import { invoke } from '@tauri-apps/api/core'

// ============================================================
// 类型定义
// ============================================================

export interface Attachment {
  id: number
  owner_type: string
  owner_id: number
  file_name: string
  file_path: string
  file_size: number | null
  file_type: string | null
  created_at: string
}

/** 单个项目完整摘要（含 5 要素）*/
export interface ProjectSummary {
  project: Project
  overallProgress: number
  /** 真实项目阶段（实施经理视角：启动/需求/实施/试运行/验收）*/
  stage: string
  /** 阶段序号（用于阶段进度条）*/
  stageOrder: number
  /** 项目阶段总步数（固定 5）*/
  stageTotal: number
  remainingDays: number | null
  isOverdue: boolean
  /** 风险：OPEN 状态 issues 计数 */
  openIssueCount: number
  /** 风险：CRITICAL/HIGH 计数（高优先级）*/
  urgentIssueCount: number
  /** 待办：未完成任务数（PENDING + IN_PROGRESS）*/
  pendingTaskCount: number
  /** 待办：延期任务数（due_date 已过 + 未完成）*/
  overdueTaskCount: number
  /** 交付资料：附件数 */
  attachmentCount: number
  /** 完整数据（按需懒加载）*/
  issues: ProjectIssue[]
  pendingTasks: ProjectTask[]
  attachments: Attachment[]
}

export interface ProjectOverview {
  project: Project
  overallProgress: number
  stage: string
  stageOrder: number
  stageTotal: number
  remainingDays: number | null
  isOverdue: boolean
  openIssueCount: number
  urgentIssueCount: number
  pendingTaskCount: number
  overdueTaskCount: number
  attachmentCount: number
  // ⚠️ 摘要不含 issues/tasks/attachments 详细数据（懒加载）
}

// ============================================================
// 项目阶段定义（实施经理视角 · 5 个阶段）
// ============================================================

export const STAGES = [
  { key: 'kickoff', label: '启动', order: 1 },
  { key: 'requirement', label: '需求确认', order: 2 },
  { key: 'implementation', label: '实施', order: 3 },
  { key: 'pilot', label: '试运行', order: 4 },
  { key: 'acceptance', label: '验收', order: 5 },
] as const

/**
 * 根据项目状态 + 进度推断阶段
 * 优先级：status > 进度推断
 *   - PLANNING → 启动（阶段 1）
 *   - SUSPENDED → 保持上次阶段
 *   - COMPLETED → 验收（阶段 5）
 *   - CANCELLED → 终止（特殊状态）
 *   - IN_PROGRESS → 按进度推断
 */
export function inferStage(
  project: Project,
  overallProgress: number,
): { stage: string; stageOrder: number; stageTotal: number } {
  const stageTotal = STAGES.length
  if (project.status === 'CANCELLED') {
    return { stage: '已终止', stageOrder: 0, stageTotal }
  }
  if (project.status === 'COMPLETED') {
    return { stage: '已验收', stageOrder: 5, stageTotal }
  }
  if (project.status === 'PLANNING') {
    return { stage: '启动', stageOrder: 1, stageTotal }
  }
  // IN_PROGRESS / SUSPENDED：按进度推断
  if (overallProgress < 20) return { stage: '启动', stageOrder: 1, stageTotal }
  if (overallProgress < 40) return { stage: '需求确认', stageOrder: 2, stageTotal }
  if (overallProgress < 80) return { stage: '实施', stageOrder: 3, stageTotal }
  if (overallProgress < 100) return { stage: '试运行', stageOrder: 4, stageTotal }
  return { stage: '已验收', stageOrder: 5, stageTotal }
}

// ============================================================
// 加载项目列表 + 完整摘要（N+1 查询 · 慎用）
// ============================================================

/**
 * 加载所有项目的摘要（列表页用）
 * 注意：每个项目都要调 list_project_tasks / list_project_issues / list_attachments · N+1
 * 性能优化建议：Phase A P1 后续做项目中心数据后端聚合命令（避免 N+1）
 */
export async function loadProjectOverviews(): Promise<ProjectOverview[]> {
  const projects = await listProjects(undefined)
  if (projects.length === 0) return []

  // 并行获取每个项目的任务/问题/附件摘要
  const overviews = await Promise.all(
    projects.map(async (p) => {
      return buildProjectOverview(p)
    }),
  )
  return overviews
}

async function buildProjectOverview(p: Project): Promise<ProjectOverview> {
  // 并行获取进度、issues、attachments 计数
  const [overallProgress, issues, attachments] = await Promise.all([
    computeProjectOverallProgress(p.id),
    listProjectIssues(p.id),
    listAttachments('PROJECT', p.id),
  ])

  const stats = computeIssueStats(issues)
  const tasks = await listProjectTasks(p.id)
  const pendingTasks = tasks.filter(
    (t) => t.status === 'PENDING' || t.status === 'IN_PROGRESS',
  )
  const overdueTasks = pendingTasks.filter(
    (t) => t.end_date && t.end_date < formatTodayLocal(),
  )
  const stage = inferStage(p, overallProgress)
  const remainingDays = computeRemainingDays(p.end_date)
  const isOverdue = !!(
    p.end_date &&
    formatTodayLocal() > p.end_date &&
    p.status !== 'COMPLETED' &&
    p.status !== 'CANCELLED'
  )

  return {
    project: p,
    overallProgress,
    stage: stage.stage,
    stageOrder: stage.stageOrder,
    stageTotal: stage.stageTotal,
    remainingDays,
    isOverdue,
    openIssueCount: stats.open,
    urgentIssueCount: issues.filter(
      (i) =>
        i.status === 'OPEN' && (i.level === 'CRITICAL' || i.level === 'HIGH'),
    ).length,
    pendingTaskCount: pendingTasks.length,
    overdueTaskCount: overdueTasks.length,
    attachmentCount: attachments.length,
  }
}

// ============================================================
// 加载单个项目完整摘要（详情/展开用）
// ============================================================

export async function loadProjectSummary(
  projectId: number,
): Promise<ProjectSummary | null> {
  const project = await getProject(projectId)
  if (!project) return null

  // 并行获取全部数据
  const [overallProgress, tasks, issues, attachments] = await Promise.all([
    computeProjectOverallProgress(projectId),
    listProjectTasks(projectId),
    listProjectIssues(projectId),
    listAttachments('PROJECT', projectId),
  ])

  const stats = computeIssueStats(issues)
  const pendingTasks = tasks.filter(
    (t) => t.status === 'PENDING' || t.status === 'IN_PROGRESS',
  )
  const overdueTasks = pendingTasks.filter(
    (t) => t.end_date && t.end_date < formatTodayLocal(),
  )
  const stage = inferStage(project, overallProgress)
  const remainingDays = computeRemainingDays(project.end_date)
  const isOverdue = !!(
    project.end_date &&
    formatTodayLocal() > project.end_date &&
    project.status !== 'COMPLETED' &&
    project.status !== 'CANCELLED'
  )

  return {
    project,
    overallProgress,
    stage: stage.stage,
    stageOrder: stage.stageOrder,
    stageTotal: stage.stageTotal,
    remainingDays,
    isOverdue,
    openIssueCount: stats.open,
    urgentIssueCount: issues.filter(
      (i) =>
        i.status === 'OPEN' && (i.level === 'CRITICAL' || i.level === 'HIGH'),
    ).length,
    pendingTaskCount: pendingTasks.length,
    overdueTaskCount: overdueTasks.length,
    attachmentCount: attachments.length,
    issues,
    pendingTasks: pendingTasks.sort((a, b) => {
      // 延期在前 + 按 end_date 升序
      const ad = a.end_date ?? '9999-12-31'
      const bd = b.end_date ?? '9999-12-31'
      return ad.localeCompare(bd)
    }),
    attachments,
  }
}

// ============================================================
// 附件 API（透传 Rust command）
// ============================================================

async function listAttachments(
  ownerType: string,
  ownerId: number,
): Promise<Attachment[]> {
  return invoke<Attachment[]>('list_attachments', {
    ownerType,
    ownerId,
  })
}

// ============================================================
// 工具函数
// ============================================================

function formatTodayLocal(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function computeRemainingDays(endDate: string | null): number | null {
  if (!endDate) return null
  const end = new Date(endDate)
  const today = new Date(formatTodayLocal())
  const diff = Math.ceil(
    (end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  )
  return diff >= 0 ? diff : 0
}