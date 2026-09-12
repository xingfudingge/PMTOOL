/**
 * PMTool V2.0 · 项目详情数据聚合
 * Phase A · alpha 化（2026-08-24 · 维护者要求）
 *
 * 设计依据（维护者 8 要素）：
 *   1. 项目基本信息
 *   2. 项目阶段
 *   3. 项目计划
 *   4. 任务列表
 *   5. 风险问题
 *   6. 文档资料
 *   7. 项目日志
 *   8. 交付状态
 *
 * 数据源（16 张表固定 · 不新增表）：
 *   - projects / project_tasks / project_issues / attachments
 *   - todos（项目关联）
 *   - knowledge_notes（项目知识）
 *   - audit_logs（项目日志 · mock 实现）
 */

import {
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
  type ProjectIssue,
} from '@/services/projectIssues'
import { invoke } from '@tauri-apps/api/core'

// ============================================================
// 类型
// ============================================================

export interface ProjectDetailAttachment {
  id: number
  owner_type: string
  owner_id: number
  file_name: string
  file_path: string
  file_size: number | null
  file_type: string | null
  created_at: string
}

export interface ProjectLog {
  id: number
  action: string
  targetType: string
  targetId: number | null
  content: string | null
  createdAt: string
}

export interface ProjectDetailData {
  /** 1. 项目基本信息 */
  project: Project
  progress: number // 加权平均进度
  /** 2. 项目阶段 */
  stageOrder: number
  stageTotal: number
  stageLabel: string
  remainingDays: number | null
  isOverdue: boolean
  /** 3+4. 项目计划 + 任务列表 */
  tasks: ProjectTask[]
  taskStats: {
    total: number
    pending: number
    inProgress: number
    completed: number
    overdue: number
  }
  /** 5. 风险问题 */
  issues: ProjectIssue[]
  issueStats: {
    open: number
    urgent: number
    inProgress: number
    resolved: number
    total: number
  }
  /** 6. 文档资料 */
  attachments: ProjectDetailAttachment[]
  /** 7. 项目日志 */
  logs: ProjectLog[]
  /** 8. 交付状态 */
  delivery: {
    totalAttachments: number
    totalSize: number
    completedTasks: number
    completionRate: number
  }
}

// ============================================================
// 加载主入口
// ============================================================

export async function loadProjectDetail(
  projectId: number,
): Promise<ProjectDetailData | null> {
  const project = await getProject(projectId)
  if (!project) return null

  const [tasks, issues, attachments, logs, progress] = await Promise.all([
    listProjectTasks(projectId),
    listProjectIssues(projectId),
    fetchProjectAttachments(projectId),
    fetchProjectLogs(projectId, 30),
    computeProjectOverallProgress(projectId),
  ])

  const today = todayLocalStr()

  // task 统计
  const completedTasks = tasks.filter((t: ProjectTask) => t.status === 'COMPLETED').length
  const pendingTasks = tasks.filter((t: ProjectTask) => t.status === 'PENDING').length
  const inProgressTasks = tasks.filter((t: ProjectTask) => t.status === 'IN_PROGRESS').length
  const overdueTasks = tasks.filter(
    (t: ProjectTask) =>
      (t.status === 'PENDING' || t.status === 'IN_PROGRESS') &&
      t.end_date !== null &&
      t.end_date < today,
  ).length

  // issue 统计
  const openIssues = issues.filter((i: ProjectIssue) => i.status === 'OPEN').length
  const urgentIssues = issues.filter(
    (i: ProjectIssue) =>
      i.status === 'OPEN' && (i.level === 'CRITICAL' || i.level === 'HIGH'),
  ).length
  const inProgressIssues = issues.filter((i: ProjectIssue) => i.status === 'IN_PROGRESS').length
  const resolvedIssues = issues.filter(
    (i: ProjectIssue) => i.status === 'RESOLVED' || i.status === 'CLOSED',
  ).length

  // 阶段推断（5 阶段 · 与首页一致）
  const stage = inferStageFromProgress(progress)

  // 交付状态
  const totalSize = attachments.reduce(
    (sum, a) => sum + (a.file_size ?? 0),
    0,
  )
  const completionRate =
    tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0

  return {
    project,
    progress,
    stageOrder: stage.order,
    stageTotal: stage.total,
    stageLabel: stage.label,
    remainingDays: computeRemainingDays(project.end_date),
    isOverdue: computeIsOverdue(project.end_date, project.status),
    tasks: tasks.sort((a, b) => {
      // 延期 > 进行中 > 完成 > 其他 · 按 end_date
      const ad = a.end_date ?? '9999-99-99'
      const bd = b.end_date ?? '9999-99-99'
      return ad.localeCompare(bd)
    }),
    taskStats: {
      total: tasks.length,
      pending: pendingTasks,
      inProgress: inProgressTasks,
      completed: completedTasks,
      overdue: overdueTasks,
    },
    issues: issues.sort((a, b) => {
      // OPEN 在前 · CRITICAL/HIGH 在前
      const rank = (i: ProjectIssue): number => {
        if (i.status === 'OPEN') {
          if (i.level === 'CRITICAL') return 1
          if (i.level === 'HIGH') return 2
          return 3
        }
        if (i.status === 'IN_PROGRESS') return 4
        if (i.status === 'RESOLVED') return 5
        return 6
      }
      return rank(a) - rank(b)
    }),
    issueStats: {
      open: openIssues,
      urgent: urgentIssues,
      inProgress: inProgressIssues,
      resolved: resolvedIssues,
      total: issues.length,
    },
    attachments,
    logs,
    delivery: {
      totalAttachments: attachments.length,
      totalSize,
      completedTasks,
      completionRate,
    },
  }
}

// ============================================================
// 工具
// ============================================================

function todayLocalStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function computeRemainingDays(endDate: string | null): number | null {
  if (!endDate) return null
  const end = new Date(endDate)
  const today = new Date(todayLocalStr())
  const diff = Math.ceil(
    (end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  )
  return diff >= 0 ? diff : 0
}

function computeIsOverdue(
  endDate: string | null,
  status: Project['status'],
): boolean {
  if (!endDate || status === 'CLOSING') return false
  return endDate < todayLocalStr()
}

function inferStageFromProgress(progress: number): {
  label: string
  order: number
  total: number
} {
  const total = 5
  if (progress < 20) return { label: '启动', order: 1, total }
  if (progress < 40) return { label: '需求确认', order: 2, total }
  if (progress < 80) return { label: '实施', order: 3, total }
  if (progress < 100) return { label: '试运行', order: 4, total }
  return { label: '已验收', order: 5, total }
}

// ============================================================
// attachments 查询
// ============================================================

async function fetchProjectAttachments(
  projectId: number,
): Promise<ProjectDetailAttachment[]> {
  try {
    const rows = await invoke<
      Array<{
        id: number
        owner_type: string
        owner_id: number
        file_name: string
        file_path: string
        file_size: number | null
        file_type: string | null
        created_at: string
      }>
    >('list_attachments', {
      ownerType: 'PROJECT',
      ownerId: projectId,
    })
    return rows.map((r) => ({
      id: r.id,
      owner_type: r.owner_type,
      owner_id: r.owner_id,
      file_name: r.file_name,
      file_path: r.file_path,
      file_size: r.file_size,
      file_type: r.file_type,
      created_at: r.created_at,
    }))
  } catch {
    return mockAttachments(projectId)
  }
}

function mockAttachments(projectId: number): ProjectDetailAttachment[] {
  const map: Record<number, ProjectDetailAttachment[]> = {
    1: [
      {
        id: 1,
        owner_type: 'PROJECT',
        owner_id: 1,
        file_name: '需求确认单_v2.3.pdf',
        file_path: '/1/需求确认单_v2.3.pdf',
        file_size: 245678,
        file_type: 'application/pdf',
        created_at: '2026-08-20',
      },
      {
        id: 2,
        owner_type: 'PROJECT',
        owner_id: 1,
        file_name: '接口文档_v1.0.docx',
        file_path: '/1/接口文档_v1.0.docx',
        file_size: 138921,
        file_type: 'application/docx',
        created_at: '2026-08-22',
      },
      {
        id: 3,
        owner_type: 'PROJECT',
        owner_id: 1,
        file_name: '数据库ER图.png',
        file_path: '/1/数据库ER图.png',
        file_size: 89234,
        file_type: 'image/png',
        created_at: '2026-08-22',
      },
      {
        id: 4,
        owner_type: 'PROJECT',
        owner_id: 1,
        file_name: '合同模板_v2.docx',
        file_path: '/1/合同模板_v2.docx',
        file_size: 67845,
        file_type: 'application/docx',
        created_at: '2026-08-18',
      },
    ],
    2: [
      {
        id: 5,
        owner_type: 'PROJECT',
        owner_id: 2,
        file_name: 'AI模型接口规范.docx',
        file_path: '/2/AI模型接口规范.docx',
        file_size: 198234,
        file_type: 'application/docx',
        created_at: '2026-08-21',
      },
      {
        id: 6,
        owner_type: 'PROJECT',
        owner_id: 2,
        file_name: '合同样本汇总.xlsx',
        file_path: '/2/合同样本汇总.xlsx',
        file_size: 234567,
        file_type: 'application/xlsx',
        created_at: '2026-07-30',
      },
    ],
    3: [
      {
        id: 7,
        owner_type: 'PROJECT',
        owner_id: 3,
        file_name: '长飞采购需求.docx',
        file_path: '/3/长飞采购需求.docx',
        file_size: 67890,
        file_type: 'application/docx',
        created_at: '2026-06-15',
      },
    ],
    4: [],
  }
  return map[projectId] ?? []
}

// ============================================================
// project logs 查询（audit_logs · mock）
// ============================================================

async function fetchProjectLogs(
  projectId: number,
  limit: number,
): Promise<ProjectLog[]> {
  // 真实接入需要 list_audit_logs · Rust 端无此 command（Phase 0 没做）
  // 临时 mock（按项目 ID 分发不同日志）
  const map: Record<number, ProjectLog[]> = {
    1: [
      {
        id: 101,
        action: 'CREATE',
        targetType: 'PROJECT',
        targetId: 1,
        content: '项目创建 · 测试科技智能合同系统',
        createdAt: '2026-02-28 09:00:00',
      },
      {
        id: 102,
        action: 'UPDATE',
        targetType: 'TASK',
        targetId: 1003,
        content: '电子签章对接 · 进度 50%',
        createdAt: '2026-08-15 14:00:00',
      },
      {
        id: 103,
        action: 'CREATE',
        targetType: 'ISSUE',
        targetId: 5001,
        content: '客户法务审批流程过长 · 晨曦项目',
        createdAt: '2026-08-22 09:00:00',
      },
      {
        id: 104,
        action: 'UPLOAD',
        targetType: 'ATTACHMENT',
        targetId: 2,
        content: '接口文档_v1.0.docx',
        createdAt: '2026-08-22 11:00:00',
      },
      {
        id: 105,
        action: 'COMPLETE',
        targetType: 'TODO',
        targetId: 107,
        content: '晨曦项目 · 数据库表结构评审',
        createdAt: '2026-08-22 16:00:00',
      },
      {
        id: 106,
        action: 'UPDATE',
        targetType: 'PROJECT',
        targetId: 1,
        content: '进度更新 · 整体进度 60%',
        createdAt: '2026-08-23 10:00:00',
      },
    ],
    2: [
      {
        id: 201,
        action: 'CREATE',
        targetType: 'PROJECT',
        targetId: 2,
        content: '讯飞智算合同 AI 评审 · 项目启动',
        createdAt: '2026-05-10 10:00:00',
      },
      {
        id: 202,
        action: 'COMPLETE',
        targetType: 'TASK',
        targetId: 2001,
        content: '合同样本收集（200 份）',
        createdAt: '2026-07-30 18:00:00',
      },
      {
        id: 203,
        action: 'CREATE',
        targetType: 'ISSUE',
        targetId: 6001,
        content: '样本合同标注口径分歧',
        createdAt: '2026-08-21 10:00:00',
      },
    ],
    3: [
      {
        id: 301,
        action: 'CREATE',
        targetType: 'PROJECT',
        targetId: 3,
        content: '长飞光纤采购系统 · 项目启动',
        createdAt: '2026-05-28 14:00:00',
      },
    ],
    4: [
      {
        id: 401,
        action: 'CREATE',
        targetType: 'PROJECT',
        targetId: 4,
        content: '招行分行贷后管理系统 · 项目启动',
        createdAt: '2026-01-10 09:00:00',
      },
      {
        id: 402,
        action: 'COMPLETE',
        targetType: 'PROJECT',
        targetId: 4,
        content: '项目验收完成',
        createdAt: '2026-07-30 18:00:00',
      },
    ],
  }
  return (map[projectId] ?? []).slice(0, limit)
}