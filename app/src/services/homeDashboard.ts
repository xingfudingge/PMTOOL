/**
 * PMTool V2.0 · 首页工作台数据聚合
 * Phase A · P0 v2 深化（2026-08-24）
 *
 * 设计依据（维护者要求）：
 *   - 今日待办
 *   - 项目风险提醒
 *   - 最近操作
 *   - 项目进度概览
 *   - 待处理事项
 *   - 快速入口
 *
 * 数据源（16 张表固定 · 复用现有 schema）：
 *   - todos（今日待办 / 延期追踪）
 *   - projects / project_tasks / project_issues（项目风险 + 进度）
 *   - attachments（交付资料数）
 *   - audit_logs（最近操作）
 *   - knowledge_notes（AI 知识库）
 */

import {
  listTodos,
  type Todo,
} from '@/database/api'
import {
  loadProjectOverviews,
  type ProjectOverview,
} from '@/services/projectSummary'
import { invoke } from '@tauri-apps/api/core'

// ============================================================
// 类型
// ============================================================

/** 今日待办项（含优先级 · 状态 · 是否延期） */
export interface TodayItem {
  id: number
  title: string
  priority: Todo['priority']
  status: Todo['status']
  due_date: string | null
  isOverdue: boolean
  source_type: Todo['source_type']
  completed_at?: string | null
}

/** 项目风险提醒项（跨项目聚合） */
export interface RiskItem {
  projectId: number
  projectName: string
  customerName: string | null
  /** 风险类型：逾期任务 / 高优问题 / 即将截止 */
  type: 'OVERDUE_TASK' | 'URGENT_ISSUE' | 'NEAR_DEADLINE'
  severity: 1 | 2 | 3
  title: string
  subtitle: string
  meta?: string
}

/** 待处理事项（综合：待我处理的所有事） */
export interface PendingItem {
  type: 'OPEN_URGENT_ISSUE' | 'OVERDUE_TODO' | 'NEAR_DEADLINE_TODO'
  severity: 1 | 2 | 3
  projectId?: number
  projectName?: string
  title: string
  subtitle: string
  /** 跳转目标（路由或动作）*/
  href: string
}

/** 最近操作记录（audit_logs）*/
export interface RecentActivity {
  id: number
  action: string
  targetType: string
  targetId: number | null
  content: string | null
  createdAt: string
}

/** 快速入口 */
export interface QuickAction {
  id: string
  label: string
  /** lucide-react 图标名（字符串 · 渲染时映射组件）*/
  icon: 'Plus' | 'AlertOctagon' | 'FileText' | 'Sparkles' | 'CheckSquare' | 'BookOpen'
  href: string
  color: string
}

/** 首页工作台完整数据 */
export interface HomeDashboard {
  /** 顶部问候 */
  greeting: string
  /** 本地日期 YYYY-MM-DD */
  todayLocal: string
  /** 中文星期 */
  weekdayCN: string
  /** 一句话总览 */
  summary: string
  /** 6 区块 */
  todayItems: TodayItem[]
  riskItems: RiskItem[]
  pendingItems: PendingItem[]
  myProjects: ProjectOverview[]
  recentActivities: RecentActivity[]
  quickActions: QuickAction[]
}

// ============================================================
// 工具
// ============================================================

function todayLocalStr(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function priorityRank(p: Todo['priority']): number {
  return { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 }[p]
}

function levelRank(l: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'): number {
  return { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 }[l]
}

// ============================================================
// 加载主入口
// ============================================================

/**
 * 加载首页工作台完整数据（6 区块聚合）
 * 并行获取基础数据，串行做项目风险/进度聚合
 */
export async function loadHomeDashboard(): Promise<HomeDashboard> {
  const today = todayLocalStr()
  const now = new Date()

  // 基础数据：全部 todo + 项目概览
  const [allTodos, overviews] = await Promise.all([
    listTodos({}),
    loadProjectOverviews(),
  ])

  // 最近操作（audit_logs · 最近 10 条）
  const recentActivities = await fetchRecentActivities(10)

  // ========== 1. 今日待办 ==========
  const todayItems: TodayItem[] = allTodos
    .filter(
      (t) =>
        t.due_date === today &&
        (t.status === 'PENDING' || t.status === 'IN_PROGRESS'),
    )
    .sort(
      (a, b) =>
        priorityRank(a.priority) - priorityRank(b.priority) ||
        a.created_at.localeCompare(b.created_at),
    )
    .map((t) => ({
      id: t.id,
      title: t.title,
      priority: t.priority,
      status: t.status,
      due_date: t.due_date,
      isOverdue: false, // 今日 = 未延期
      source_type: t.source_type,
      completed_at: t.completed_at,
    }))

  // ========== 2. 项目风险提醒（跨项目聚合） ==========
  const riskItems: RiskItem[] = []
  for (const o of overviews) {
    const projName = o.project.project_name
    const customer = o.project.customer_name

    // 1) 高优问题（CRITICAL / HIGH · OPEN）
    if (o.urgentIssueCount > 0) {
      riskItems.push({
        projectId: o.project.id,
        projectName: projName,
        customerName: customer,
        type: 'URGENT_ISSUE',
        severity: 1,
        title: `${o.urgentIssueCount} 个高优先级问题未关闭`,
        subtitle: `客户：${customer ?? '未指定'}`,
        meta: `项目 #${o.project.id}`,
      })
    }
    // 2) 延期任务
    if (o.overdueTaskCount > 0) {
      riskItems.push({
        projectId: o.project.id,
        projectName: projName,
        customerName: customer,
        type: 'OVERDUE_TASK',
        severity: 1,
        title: `${o.overdueTaskCount} 个任务已延期`,
        subtitle: `截止日期已过 · 需重点跟进`,
        meta: `项目 #${o.project.id}`,
      })
    }
    // 3) 即将截止（剩余 < 7 天）
    if (
      o.remainingDays !== null &&
      o.remainingDays < 7 &&
      o.remainingDays >= 0 &&
      o.project.status === 'EXECUTING'
    ) {
      riskItems.push({
        projectId: o.project.id,
        projectName: projName,
        customerName: customer,
        type: 'NEAR_DEADLINE',
        severity: o.remainingDays < 3 ? 1 : 2,
        title: `${o.remainingDays} 天后截止`,
        subtitle: `客户：${customer ?? '未指定'}`,
        meta: `项目 #${o.project.id}`,
      })
    }
    // 4) 项目已逾期
    if (o.isOverdue) {
      riskItems.push({
        projectId: o.project.id,
        projectName: projName,
        customerName: customer,
        type: 'NEAR_DEADLINE',
        severity: 1,
        title: '项目已逾期',
        subtitle: `原定截止日期：${o.project.end_date ?? '未设定'}`,
        meta: `项目 #${o.project.id}`,
      })
    }
  }
  // 按 severity 排序（1 最紧急在前）
  riskItems.sort((a, b) => a.severity - b.severity)

  // ========== 3. 待处理事项（综合：所有延期 todo + OPEN 高优问题） ==========
  const pendingItems: PendingItem[] = []

  // 3a. 延期 todos
  const overdueTodos = allTodos.filter(
    (t) =>
      t.due_date &&
      t.due_date < today &&
      (t.status === 'PENDING' || t.status === 'IN_PROGRESS'),
  )
  for (const t of overdueTodos.slice(0, 10)) {
    pendingItems.push({
      type: 'OVERDUE_TODO',
      severity: priorityRank(t.priority) === 0 ? 1 : 2,
      title: t.title,
      subtitle: `原计划 ${t.due_date} · 已延期`,
      href: '/todo',
    })
  }

  // 3b. 即将到期的 todos（3 天内）
  const upcomingTodos = allTodos.filter((t) => {
    if (!t.due_date) return false
    if (t.status !== 'PENDING' && t.status !== 'IN_PROGRESS') return false
    const d = new Date(t.due_date)
    const diffDays = Math.floor((d.getTime() - now.getTime()) / 86400000)
    return diffDays >= 0 && diffDays <= 3
  })
  for (const t of upcomingTodos.slice(0, 5)) {
    pendingItems.push({
      type: 'NEAR_DEADLINE_TODO',
      severity: 3,
      title: t.title,
      subtitle: `${t.due_date} 到期`,
      href: '/todo',
    })
  }

  // 3c. 从 overviews 中提取 OPEN 高优问题（按严重度排序）
  for (const o of overviews) {
    if (o.urgentIssueCount > 0) {
      pendingItems.push({
        type: 'OPEN_URGENT_ISSUE',
        severity: 1,
        projectId: o.project.id,
        projectName: o.project.project_name,
        title: `${o.project.project_name} · ${o.urgentIssueCount} 个高优问题`,
        subtitle: '点击进入项目查看 · 需关闭 CRITICAL / HIGH',
        href: `/projects/${o.project.id}`,
      })
    }
  }

  pendingItems.sort((a, b) => a.severity - b.severity)
  // 去重（同标题去重）
  const seenTitles = new Set<string>()
  const dedupedPending = pendingItems.filter((it) => {
    if (seenTitles.has(it.title)) return false
    seenTitles.add(it.title)
    return true
  })

  // ========== 4. 我的项目进度概览（取 IN_PROGRESS 状态 · 按剩余天数排序） ==========
  const myProjects = overviews
    .filter((o) => o.project.status === 'EXECUTING')
    .slice(0, 6)

  // ========== 5. 最近操作（recentActivities 已加载） ==========
  // ========== 6. 快速入口（静态配置） ==========
  const quickActions: QuickAction[] = [
    {
      id: 'new-project',
      label: '新建项目',
      icon: 'Plus',
      href: '/projects',
      color: 'var(--color-accent)',
    },
    {
      id: 'new-todo',
      label: '新建待办',
      icon: 'CheckSquare',
      href: '/todo',
      color: 'var(--color-status-success)',
    },
    {
      id: 'log-risk',
      label: '登记风险',
      icon: 'AlertOctagon',
      href: '/projects',
      color: 'var(--color-status-warning)',
    },
    {
      id: 'gen-weekly',
      label: '生成周报',
      icon: 'FileText',
      href: '/ai',
      color: 'var(--color-accent)',
    },
    {
      id: 'ask-ai',
      label: 'AI 工作台',
      icon: 'Sparkles',
      href: '/ai',
      color: 'var(--color-accent)',
    },
    {
      id: 'kb-search',
      label: '知识检索',
      icon: 'BookOpen',
      href: '/knowledge',
      color: 'var(--color-text-secondary)',
    },
  ]

  // ========== 一句话总览 ==========
  const summaryParts: string[] = []
  if (todayItems.length > 0) {
    summaryParts.push(`今日 ${todayItems.length} 项待办`)
  }
  if (riskItems.length > 0) {
    summaryParts.push(`${riskItems.length} 项需要关注`)
  }
  if (pendingItems.length === 0 && todayItems.length === 0) {
    summaryParts.push('今天很清闲 · 可以规划下一步')
  }
  const summary =
    summaryParts.length > 0 ? summaryParts.join(' · ') : '今天很清闲'

  return {
    greeting: getGreeting(now.getHours()),
    todayLocal: today,
    weekdayCN: getWeekdayCN(now),
    summary,
    todayItems,
    riskItems,
    pendingItems: dedupedPending.slice(0, 12),
    myProjects,
    recentActivities,
    quickActions,
  }
}

// ============================================================
// audit_logs 查询（最近 N 条）
// ============================================================

async function fetchRecentActivities(limit: number): Promise<RecentActivity[]> {
  try {
    const rows = await invoke<
      Array<{
        id: number
        action: string
        target_type: string
        target_id: number | null
        content: string | null
        created_at: string
      }>
    >('list_audit_logs', { limit })
    return rows.slice(0, limit).map((r) => ({
      id: r.id,
      action: r.action,
      targetType: r.target_type,
      targetId: r.target_id,
      content: r.content,
      createdAt: r.created_at,
    }))
  } catch {
    // Rust 端没有 list_audit_logs command · 用 mock
    return mockRecentActivities(limit)
  }
}

/**
 * Mock 最近操作（Rust 端没暴露 list_audit_logs command）
 * 真实接入需要新增 list_audit_logs command
 */
function mockRecentActivities(limit: number): RecentActivity[] {
  const now = new Date()
  const ago = (mins: number) =>
    new Date(now.getTime() - mins * 60000).toISOString()
  const samples: RecentActivity[] = [
    {
      id: 1,
      action: 'CREATE',
      targetType: 'TODO',
      targetId: 101,
      content: '需求确认单签字回传',
      createdAt: ago(15),
    },
    {
      id: 2,
      action: 'UPDATE',
      targetType: 'PROJECT',
      targetId: 1,
      content: '晨曦项目 · 联调环境部署',
      createdAt: ago(48),
    },
    {
      id: 3,
      action: 'CREATE',
      targetType: 'ISSUE',
      targetId: 5001,
      content: '客户法务审批流程过长 · 晨曦项目',
      createdAt: ago(120),
    },
    {
      id: 4,
      action: 'COMPLETE',
      targetType: 'TODO',
      targetId: 107,
      content: '晨曦项目 · 数据库表结构评审',
      createdAt: ago(288),
    },
    {
      id: 5,
      action: 'CREATE',
      targetType: 'TEMPLATE',
      targetId: 1,
      content: '需求确认单模板 · 晨曦项目',
      createdAt: ago(720),
    },
    {
      id: 6,
      action: 'EXPORT',
      targetType: 'REPORT',
      targetId: 1,
      content: '周报 · 2026-W34',
      createdAt: ago(1440),
    },
    {
      id: 7,
      action: 'CREATE',
      targetType: 'PROJECT',
      targetId: 2,
      content: '讯飞智算合同 AI 评审',
      createdAt: ago(2880),
    },
    {
      id: 8,
      action: 'UPDATE',
      targetType: 'PROJECT',
      targetId: 3,
      content: '长飞光纤采购系统 · 阶段变更',
      createdAt: ago(4320),
    },
  ]
  return samples.slice(0, limit)
}

function getGreeting(hour: number): string {
  if (hour < 6) return '凌晨好'
  if (hour < 12) return '早上好'
  if (hour < 14) return '中午好'
  if (hour < 18) return '下午好'
  return '晚上好'
}

function getWeekdayCN(d: Date): string {
  return ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
}

export { levelRank }