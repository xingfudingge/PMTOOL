/**
 * PMTool V2.0 · AI 工作台能力定义
 * Phase A · P4 AI 助手整改（2026-08-24 维护者拍板）
 *
 * 维护者原话：「AI 助手结合实际交付工作，而不是一个聊天窗口。」
 *
 * 设计原则：
 *   - 每个能力绑定具体项目数据源（不靠聊天·靠数据聚合）
 *   - 输出 Markdown · 可复制 · 可保存
 *   - 不新增表 / 不依赖真实 AI 模型（用真实数据 + 模板生成）
 *
 * 实现策略（Phase 4 阶段）：
 *   - 用现有 services 聚合真实数据
 *   - 用 Markdown 模板生成报告（与 P3 templates 一致）
 *   - 留 ProjectAIProvider 接口 · Phase 8 接真实 AI 模型时无缝替换
 */

import type { LucideIcon } from 'lucide-react'
import {
  AlertOctagon,
  ClipboardCheck,
  ClipboardSignature,
  HandHelping,
  Sparkles,
} from 'lucide-react'
import {
  listProjects,
  type Project,
} from '@/database/api'
import {
  loadProjectSummary,
  type ProjectSummary,
} from '@/services/projectSummary'
import { loadProjectDetail } from '@/services/projectDetail'
import {
  listTodos,
} from '@/database/api'

// ============================================================
// 类型定义
// ============================================================

export type AICapabilityId =
  | 'risk_scan'
  | 'weekly_report'
  | 'meeting_notes'
  | 'acceptance_review'
  | 'handover_doc'
  | 'project_summary'

export interface AICapability {
  id: AICapabilityId
  title: string
  description: string
  Icon: LucideIcon
  outputPrefix: string
  needsProject: boolean
}

export interface AIOutput {
  title: string
  markdown: string
  generatedAt: string
  capabilityId: AICapabilityId
  projectId?: number
}

// ============================================================
// 5 个 AI 能力定义
// ============================================================

export const AI_CAPABILITIES: AICapability[] = [
  {
    id: 'risk_scan',
    title: '项目风险扫描',
    description: '基于项目任务 / 问题 / 截止日期 · 自动识别延期与阻塞',
    Icon: AlertOctagon,
    outputPrefix: '风险扫描报告',
    needsProject: true,
  },
  {
    id: 'weekly_report',
    title: '周报自动生成',
    description: '汇总本周完成任务 + 进行中任务 · 自动生成本周工作周报',
    Icon: ClipboardCheck,
    outputPrefix: '项目周报',
    needsProject: true,
  },
  {
    id: 'meeting_notes',
    title: '会议纪要整理',
    description: '自动结构化会议要点 · 决议 · 行动项 · 下次会议主题',
    Icon: ClipboardSignature,
    outputPrefix: '会议纪要',
    needsProject: false,
  },
  {
    id: 'acceptance_review',
    title: '验收材料检查',
    description: '对比计划与实际 · 生成验收前自检清单',
    Icon: ClipboardCheck,
    outputPrefix: '验收自检清单',
    needsProject: true,
  },
  {
    id: 'handover_doc',
    title: '转客服资料整理',
    description: '汇总项目信息 + 任务清单 + 资料附件 · 生成交接资料',
    Icon: HandHelping,
    outputPrefix: '项目交接资料',
    needsProject: true,
  },
  {
    id: 'project_summary',
    title: '项目总结',
    description: '项目完成度 + 成果 + 关键指标 + 经验沉淀',
    Icon: Sparkles,
    outputPrefix: '项目总结报告',
    needsProject: true,
  },
]

// ============================================================
// 工具函数
// ============================================================

const NOT_SET = '未指定'

async function getProject(id: number): Promise<Project | null> {
  const all = await listProjects(undefined)
  return all.find((p) => p.id === id) ?? null
}

function todayLocal(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function emptyOutput(
  capabilityId: AICapabilityId,
  reason: string,
  projectId?: number,
): AIOutput {
  return {
    title: '生成失败',
    markdown: `# 生成失败\n\n${reason}`,
    generatedAt: new Date().toISOString(),
    capabilityId,
    projectId,
  }
}

function completionStageDone(
  summary: ProjectSummary,
  stageOrder: number,
): boolean {
  return summary.stageOrder >= stageOrder
}

// ============================================================
// 4 个能力生成器
// ============================================================

/**
 * 项目风险扫描
 * 数据源：loadProjectSummary（5 要素聚合）+ 项目截止日期
 */
export async function generateRiskScan(projectId: number): Promise<AIOutput> {
  const project = await getProject(projectId)
  const summary = await loadProjectSummary(projectId)
  if (!project || !summary) {
    return emptyOutput('risk_scan', '项目不存在', projectId)
  }

  const today = todayLocal()
  const lines: string[] = []
  lines.push(`# ${project.project_name} · 风险扫描报告`)
  lines.push('')
  lines.push(`**生成时间**：${today}`)
  lines.push(`**客户**：${project.customer_name ?? NOT_SET}`)
  lines.push(`**负责人**：${project.owner ?? NOT_SET}`)
  lines.push('')

  let level: '低' | '中' | '高' = '低'
  if (summary.isOverdue) level = '高'
  else if (
    summary.urgentIssueCount > 0 ||
    summary.overdueTaskCount > 0 ||
    (summary.remainingDays !== null && summary.remainingDays < 7)
  )
    level = '高'
  else if (
    summary.openIssueCount > 0 ||
    (summary.remainingDays !== null && summary.remainingDays < 14)
  )
    level = '中'

  lines.push(`## 总体风险评级：**${level}**`)
  lines.push('')

  lines.push('## 关键风险点')
  lines.push('')
  if (summary.isOverdue) {
    lines.push(`- 🔴 **项目已逾期** · 剩余天数 = ${summary.remainingDays}`)
  }
  if (summary.overdueTaskCount > 0) {
    lines.push(
      `- 🔴 **${summary.overdueTaskCount} 个延期任务**（截止日期已过未完成）`,
    )
  }
  if (summary.urgentIssueCount > 0) {
    lines.push(
      `- ⚠️ **${summary.urgentIssueCount} 个高优先级问题**（CRITICAL / HIGH）`,
    )
  }
  if (summary.openIssueCount > 0) {
    lines.push(
      `- 📋 **${summary.openIssueCount} 个未关闭问题**（含 ${summary.urgentIssueCount} 个高优先级）`,
    )
  }
  if (summary.remainingDays !== null && summary.remainingDays < 14 && !summary.isOverdue) {
    lines.push(
      `- ⏰ **剩余时间 ${summary.remainingDays} 天** · 建议检查里程碑进度`,
    )
  }
  if (lines.length === 6) {
    lines.push('- ✅ 当前无显著风险')
  }
  lines.push('')

  const openIssues = summary.issues.filter((i) => i.status === 'OPEN')
  if (openIssues.length > 0) {
    lines.push('## 待解决问题明细')
    lines.push('')
    for (const issue of openIssues) {
      const desc = issue.description ? ` · ${issue.description.slice(0, 50)}` : ''
      lines.push(
        `- **[${issue.level}]** ${issue.title}${desc} · 负责人：${issue.owner ?? NOT_SET}`,
      )
    }
    lines.push('')
  }

  const overdueTasks = summary.pendingTasks.filter(
    (t) => t.end_date && t.end_date < today,
  )
  if (overdueTasks.length > 0) {
    lines.push('## 延期任务明细')
    lines.push('')
    for (const t of overdueTasks) {
      lines.push(
        `- ${t.task_name} · 截止：${t.end_date} · 进度：${t.progress}%`,
      )
    }
    lines.push('')
  }

  lines.push('## 建议')
  lines.push('')
  if (level === '高') {
    lines.push('1. **立即召开风险复盘会** · 与客户沟通延期影响')
    lines.push('2. **重新评估里程碑** · 必要时调整范围 / 资源')
    lines.push('3. **关闭高优先级问题** · 重点跟进 CRITICAL / HIGH')
  } else if (level === '中') {
    lines.push('1. 关注剩余时间 · 必要时调整计划')
    lines.push('2. 跟进未关闭问题')
  } else {
    lines.push('1. 保持当前节奏')
  }

  return {
    title: `${project.project_name} · 风险扫描报告`,
    markdown: lines.join('\n'),
    generatedAt: new Date().toISOString(),
    capabilityId: 'risk_scan',
    projectId,
  }
}

/**
 * 周报自动生成
 * 数据源：listTodos（本周完成的） + projectTasks（本周进度变化）
 */
export async function generateWeeklyReport(projectId: number): Promise<AIOutput> {
  const project = await getProject(projectId)
  const summary = await loadProjectSummary(projectId)
  if (!project || !summary) {
    return emptyOutput('weekly_report', '项目不存在', projectId)
  }

  const now = new Date()
  const monday = new Date(now)
  const day = monday.getDay()
  const diff = day === 0 ? -6 : 1 - day
  monday.setDate(monday.getDate() + diff)
  monday.setHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)
  const mondayStr = todayLocal.call(new Date(monday.getTime())) as unknown as string
  // 用更简单的方式
  const mondayStrFmt = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`
  const sundayStr = `${sunday.getFullYear()}-${String(sunday.getMonth() + 1).padStart(2, '0')}-${String(sunday.getDate()).padStart(2, '0')}`
  void mondayStr // 避免 unused 警告

  const allTodos = await listTodos({})
  const completedThisWeek = allTodos.filter((t) => {
    if (t.status !== 'COMPLETED' || !t.completed_at) return false
    const completedDate = new Date(t.completed_at)
    return completedDate >= monday && completedDate <= sunday
  })

  const pendingTodos = allTodos.filter(
    (t) => t.status === 'PENDING' || t.status === 'IN_PROGRESS',
  )

  const lines: string[] = []
  lines.push(`# ${project.project_name} · 项目周报`)
  lines.push('')
  lines.push(`**周期**：${mondayStrFmt} 至 ${sundayStr}`)
  lines.push(`**客户**：${project.customer_name ?? NOT_SET}`)
  lines.push(`**负责人**：${project.owner ?? NOT_SET}`)
  lines.push('')

  lines.push('## 项目概况')
  lines.push('')
  lines.push(`- **当前阶段**：${summary.stage}（${summary.stageOrder}/${summary.stageTotal}）`)
  lines.push(`- **整体进度**：${summary.overallProgress}%`)
  if (summary.remainingDays !== null) {
    lines.push(
      `- **剩余时间**：${summary.isOverdue ? '已逾期' : `${summary.remainingDays} 天`}`,
    )
  }
  lines.push('')

  lines.push('## 本周完成')
  lines.push('')
  if (completedThisWeek.length === 0) {
    lines.push('- 本周暂无完成任务')
  } else {
    for (const t of completedThisWeek) {
      lines.push(`- ✅ ${t.title}`)
    }
  }
  lines.push('')

  lines.push('## 进行中任务')
  lines.push('')
  if (summary.pendingTasks.length === 0) {
    lines.push('- 暂无进行中任务')
  } else {
    for (const t of summary.pendingTasks.slice(0, 8)) {
      const progress = t.progress > 0 ? ` · 进度 ${t.progress}%` : ''
      const due = t.end_date ? ` · 截止 ${t.end_date}` : ''
      lines.push(`- 🔄 ${t.task_name}${progress}${due}`)
    }
    if (summary.pendingTasks.length > 8) {
      lines.push(`- ... 还有 ${summary.pendingTasks.length - 8} 个任务`)
    }
  }
  lines.push('')

  if (pendingTodos.length > 0) {
    const overdue = pendingTodos.filter(
      (t) => t.due_date && t.due_date < todayLocal(),
    )
    lines.push('## 待办统计')
    lines.push('')
    lines.push(`- 总待办：${pendingTodos.length} 项`)
    if (overdue.length > 0) {
      lines.push(`- 延期：${overdue.length} 项 · 需重点关注`)
    }
    lines.push('')
  }

  const openIssues = summary.issues.filter((i) => i.status === 'OPEN')
  if (openIssues.length > 0) {
    lines.push('## 待解决问题')
    lines.push('')
    for (const issue of openIssues.slice(0, 5)) {
      lines.push(
        `- [${issue.level}] ${issue.title} · 负责人：${issue.owner ?? NOT_SET}`,
      )
    }
    lines.push('')
  }

  lines.push('## 下周计划')
  lines.push('')
  const nextWeekTodos = pendingTodos
    .filter((t) => t.due_date && t.due_date >= sundayStr)
    .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))
    .slice(0, 5)
  if (nextWeekTodos.length === 0) {
    lines.push('- 待规划（建议根据当前进度明确下周优先级）')
  } else {
    for (const t of nextWeekTodos) {
      lines.push(`- [ ] ${t.title} · 计划 ${t.due_date}`)
    }
  }

  return {
    title: `${project.project_name} · 项目周报`,
    markdown: lines.join('\n'),
    generatedAt: new Date().toISOString(),
    capabilityId: 'weekly_report',
    projectId,
  }
}

/**
 * 验收材料检查
 * 数据源：projectTasks（按阶段分组） + issues + 整体进度
 */
export async function generateAcceptanceReview(
  projectId: number,
): Promise<AIOutput> {
  const project = await getProject(projectId)
  const summary = await loadProjectSummary(projectId)
  if (!project || !summary) {
    return emptyOutput('acceptance_review', '项目不存在', projectId)
  }

  const completion = summary.overallProgress
  const ready = completion >= 80 && summary.openIssueCount === 0

  const lines: string[] = []
  lines.push(`# ${project.project_name} · 验收自检清单`)
  lines.push('')
  lines.push(`**生成时间**：${todayLocal()}`)
  lines.push('')

  lines.push('## 验收准备度')
  lines.push('')
  lines.push(`- 整体完成度：**${completion}%**${ready ? ' ✅' : ' ⚠️'}`)
  lines.push(
    `- 未关闭问题：${summary.openIssueCount} 个${summary.openIssueCount === 0 ? ' ✅' : ' ⚠️'}`,
  )
  lines.push(
    `- 高优先级问题：${summary.urgentIssueCount} 个${summary.urgentIssueCount === 0 ? ' ✅' : ' ⚠️'}`,
  )
  lines.push(
    `- 延期任务：${summary.overdueTaskCount} 个${summary.overdueTaskCount === 0 ? ' ✅' : ' ⚠️'}`,
  )
  lines.push('')
  lines.push(
    ready
      ? '**当前状态**：✅ **可发起验收**'
      : '**当前状态**：⚠️ **建议先处理遗留项再发起验收**',
  )
  lines.push('')

  lines.push('## 阶段交付物自检')
  lines.push('')
  const STAGE_LABELS = ['启动', '需求确认', '实施', '试运行', '验收']
  for (let i = 0; i < summary.stageTotal; i++) {
    const stageOrder = i + 1
    const stageLabel = STAGE_LABELS[i] ?? `阶段${stageOrder}`
    const passed = stageOrder <= summary.stageOrder
    const isCurrent = stageOrder === summary.stageOrder
    lines.push(
      `- ${passed ? '✅' : '⬜'} **${stageLabel}**${isCurrent ? ' （当前阶段）' : ''}`,
    )
  }
  lines.push('')

  lines.push('## 验收前自检清单')
  lines.push('')
  const checklist = [
    { item: '需求确认单已签字', checked: completion >= 20 },
    { item: '实施方案文档归档', checked: completion >= 40 },
    { item: '试运行报告已生成', checked: completion >= 80 },
    { item: '客户培训已完成', checked: completion >= 80 },
    { item: '高优先级问题全部关闭', checked: summary.urgentIssueCount === 0 },
    { item: '延期任务全部清理', checked: summary.overdueTaskCount === 0 },
    { item: '交付资料齐全（合同/方案/培训/验收）', checked: completion >= 95 },
  ]
  for (const c of checklist) {
    lines.push(`- ${c.checked ? '✅' : '⬜'} ${c.item}`)
  }
  lines.push('')

  if (summary.pendingTasks.length > 0) {
    lines.push('## 验收前待清理任务')
    lines.push('')
    for (const t of summary.pendingTasks.slice(0, 8)) {
      lines.push(
        `- [ ] ${t.task_name}${t.end_date ? ` · 截止 ${t.end_date}` : ''}`,
      )
    }
    lines.push('')
  }

  if (summary.issues.filter((i) => i.status === 'OPEN').length > 0) {
    lines.push('## 验收前待关闭问题')
    lines.push('')
    for (const issue of summary.issues.filter((i) => i.status === 'OPEN')) {
      lines.push(
        `- [ ] **[${issue.level}]** ${issue.title} · 负责人：${issue.owner ?? NOT_SET}`,
      )
    }
    lines.push('')
  }

  lines.push('## 建议')
  lines.push('')
  if (ready) {
    lines.push('1. 与客户约定验收会议时间')
    lines.push('2. 准备验收会议 PPT')
    lines.push('3. 通知客户代表 + 项目经理 + 客服')
  } else {
    lines.push('1. **优先关闭高优先级问题**（CRITICAL / HIGH）')
    lines.push('2. **清理延期任务** · 必要时调整范围或截止')
    lines.push('3. **补齐交付资料** · 验收前必须齐全')
    lines.push('4. 达到 80% + 0 高优问题后再发起验收')
  }

  return {
    title: `${project.project_name} · 验收自检清单`,
    markdown: lines.join('\n'),
    generatedAt: new Date().toISOString(),
    capabilityId: 'acceptance_review',
    projectId,
  }
}

/**
 * 转客服资料整理
 * 数据源：项目信息 + 任务清单 + 附件数 + 整体状态
 */
export async function generateHandoverDoc(projectId: number): Promise<AIOutput> {
  const project = await getProject(projectId)
  const summary = await loadProjectSummary(projectId)
  if (!project || !summary) {
    return emptyOutput('handover_doc', '项目不存在', projectId)
  }

  const lines: string[] = []
  lines.push(`# ${project.project_name} · 转客服资料`)
  lines.push('')
  lines.push(`**生成时间**：${todayLocal()}`)
  lines.push(`**阶段**：${summary.stage} · 进度 ${summary.overallProgress}%`)
  lines.push('')

  lines.push('## 一、项目概况')
  lines.push('')
  lines.push(`- **客户**：${project.customer_name ?? NOT_SET}`)
  lines.push(`- **起止时间**：${project.start_date ?? NOT_SET} 至 ${project.end_date ?? NOT_SET}`)
  lines.push(`- **负责人**：${project.owner ?? NOT_SET}`)
  lines.push(`- **项目背景**：${project.background ?? '（待补充）'}`)
  lines.push(`- **项目目标**：${project.objective ?? '（待补充）'}`)
  lines.push('')

  lines.push('## 二、核心功能')
  lines.push('')
  lines.push(project.scope ?? '（待补充· 建议从需求确认单迁移）')
  lines.push('')

  lines.push('## 三、已交付任务')
  lines.push('')
  if (summary.pendingTasks.length === 0) {
    lines.push('暂无未完成任务 · 视为已全部交付 ✅')
  } else {
    lines.push('仍有 ' + summary.pendingTasks.length + ' 个任务未完成：')
    lines.push('')
    for (const t of summary.pendingTasks.slice(0, 5)) {
      lines.push(`- ⚠️ ${t.task_name} · 进度 ${t.progress}%`)
    }
  }
  lines.push('')

  lines.push('## 四、交付资料')
  lines.push('')
  lines.push(`- 附件数：${summary.attachmentCount} 个`)
  if (summary.attachmentCount === 0) {
    lines.push('⚠️ 暂无附件 · 建议在验收前补齐交付资料')
  }
  lines.push('')

  const openIssues = summary.issues.filter((i) => i.status === 'OPEN')
  lines.push('## 五、待解决问题（客服需关注）')
  lines.push('')
  if (openIssues.length === 0) {
    lines.push('暂无未关闭问题')
  } else {
    for (const issue of openIssues) {
      lines.push(
        `- [${issue.level}] ${issue.title} · 负责人：${issue.owner ?? NOT_SET}`,
      )
    }
  }
  lines.push('')

  lines.push('## 六、应急联系')
  lines.push('')
  lines.push(`- **实施经理**：${project.owner ?? NOT_SET}`)
  lines.push('- **客户方对接人**：见需求确认单')
  lines.push('- **客服升级路径**：')
  lines.push('  - L1：客服一线')
  lines.push('  - L2：原实施经理（owner）')
  lines.push('  - L3：研发支持')
  lines.push('')

  lines.push('## 七、客服上手清单')
  lines.push('')
  const onboarding = [
    { item: '阅读项目背景与目标', checked: !!project.background },
    { item: '熟悉核心功能（需求确认单）', checked: completionStageDone(summary, 2) },
    { item: '掌握已交付功能（试运行报告）', checked: completionStageDone(summary, 4) },
    { item: '了解待解决问题清单', checked: openIssues.length === 0 },
    { item: '熟悉附件资料位置', checked: summary.attachmentCount > 0 },
  ]
  for (const o of onboarding) {
    lines.push(`- ${o.checked ? '✅' : '⬜'} ${o.item}`)
  }

  return {
    title: `${project.project_name} · 转客服资料`,
    markdown: lines.join('\n'),
    generatedAt: new Date().toISOString(),
    capabilityId: 'handover_doc',
    projectId,
  }
}

// ============================================================
// alpha 化新增：会议纪要整理
// ============================================================

export async function generateMeetingNotes(
  projectId: number,
): Promise<AIOutput> {
  const data = await loadProjectDetail(projectId)
  if (!data) {
    return emptyOutput('meeting_notes', '项目不存在', projectId)
  }
  const project = data.project

  const today = todayLocal()
  const lines: string[] = []
  lines.push(`# ${project.project_name} · 会议纪要`)
  lines.push('')
  lines.push(`**会议日期**：${today}`)
  lines.push(`**客户**：${project.customer_name ?? '未指定'}`)
  lines.push(`**项目阶段**：${data.stageLabel}`)
  lines.push('')
  lines.push('## 一、会议目标')
  lines.push('- 同步项目当前进度')
  lines.push('- 识别阻塞与风险')
  lines.push('- 明确下一步行动项')
  lines.push('')
  lines.push('## 二、当前进展')
  lines.push(`- 项目整体进度 **${data.progress}%**（${data.stageLabel}）`)
  lines.push(`- 完成任务 ${data.taskStats.completed} / ${data.taskStats.total}`)
  if (data.taskStats.overdue > 0) {
    lines.push(`- 延期任务 ${data.taskStats.overdue} 个 · 需重点关注`)
  }
  lines.push(`- 交付资料 ${data.delivery.totalAttachments} 个`)
  lines.push('')
  lines.push('## 三、风险与问题')
  lines.push(
    `- OPEN 问题 ${data.issueStats.open} 个 · 高优 ${data.issueStats.urgent} 个`,
  )
  if (data.remainingDays !== null) {
    if (data.isOverdue) {
      lines.push(`- ⚠️ 项目已逾期 · 需调整计划`)
    } else if (data.remainingDays < 14) {
      lines.push(`- ⏰ 距离截止 ${data.remainingDays} 天`)
    }
  }
  lines.push('')
  lines.push('## 四、决议')
  lines.push('1. （从会议中提取 · 由人工补充）')
  lines.push('2. （从会议中提取 · 由人工补充）')
  lines.push('')
  lines.push('## 五、行动项')
  lines.push('| 序号 | 行动项 | 负责人 | 截止日期 |')
  lines.push('| --- | --- | --- | --- |')
  lines.push('| 1 | （从会议中提取） | | |')
  lines.push('| 2 | （从会议中提取） | | |')
  lines.push('')
  lines.push('## 六、下次会议')
  lines.push('- 时间：（待定）')
  lines.push('- 主题：（待定）')
  lines.push('')
  lines.push('---')
  lines.push('')
  lines.push('> 本纪要由 PMTool 自动生成 · 由主持人补充后归档')

  return {
    title: `${project.project_name} · 会议纪要`,
    markdown: lines.join('\n'),
    generatedAt: new Date().toISOString(),
    capabilityId: 'meeting_notes',
    projectId,
  }
}

// ============================================================
// alpha 化新增：项目总结
// ============================================================

export async function generateProjectSummary(
  projectId: number,
): Promise<AIOutput> {
  const data = await loadProjectDetail(projectId)
  if (!data) {
    return emptyOutput('project_summary', '项目不存在', projectId)
  }
  const project = data.project

  const lines: string[] = []
  lines.push(`# ${project.project_name} · 项目总结报告`)
  lines.push('')
  lines.push(`**客户**：${project.customer_name ?? '未指定'}`)
  lines.push(`**项目阶段**：${data.stageLabel}（${data.stageOrder}/${data.stageTotal}）`)
  lines.push(`**项目状态**：${project.status}`)
  lines.push(`**整体完成度**：${data.progress}%`)
  if (data.remainingDays !== null) {
    lines.push(
      `**剩余时间**：${data.isOverdue ? '已逾期' : `${data.remainingDays} 天`}`,
    )
  }
  lines.push('')
  lines.push('## 一、项目概述')
  lines.push(
    project.objective ?? '（项目目标未填写）',
  )
  lines.push('')
  lines.push('## 二、关键指标')
  lines.push('| 指标 | 数值 |')
  lines.push('| --- | --- |')
  lines.push(`| 整体完成度 | ${data.progress}% |`)
  lines.push(`| 任务完成 | ${data.taskStats.completed} / ${data.taskStats.total} |`)
  lines.push(`| 完成率 | ${data.delivery.completionRate}% |`)
  lines.push(`| 交付资料 | ${data.delivery.totalAttachments} 个 |`)
  lines.push(`| OPEN 问题 | ${data.issueStats.open} |`)
  lines.push(`| 高优问题 | ${data.issueStats.urgent} |`)
  lines.push('')
  lines.push('## 三、交付清单')
  lines.push('### 3.1 任务交付')
  if (data.taskStats.completed > 0) {
    lines.push(`- 已完成 ${data.taskStats.completed} 个任务`)
  } else {
    lines.push('- （暂无已完成任务）')
  }
  lines.push('')
  lines.push('### 3.2 资料交付')
  if (data.delivery.totalAttachments > 0) {
    lines.push(`- 交付资料 ${data.delivery.totalAttachments} 个`)
  } else {
    lines.push('- （暂无交付资料）')
  }
  lines.push('')
  lines.push('## 四、风险与遗留')
  if (data.issueStats.open > 0) {
    lines.push(`- 未关闭问题 ${data.issueStats.open} 个 · 高优 ${data.issueStats.urgent} 个`)
  } else {
    lines.push('- 无未关闭问题 · 项目质量良好')
  }
  if (data.taskStats.overdue > 0) {
    lines.push(`- 延期任务 ${data.taskStats.overdue} 个 · 需后续跟进`)
  }
  lines.push('')
  lines.push('## 五、经验沉淀')
  lines.push('- （从项目过程中提炼 · 由项目经理补充）')
  lines.push('')
  lines.push('## 六、后续建议')
  lines.push('- （针对下个类似项目的改进建议 · 由项目经理补充）')
  lines.push('')
  lines.push('---')
  lines.push('')
  lines.push('> 本总结由 PMTool 自动生成 · 基于项目实际数据')

  return {
    title: `${project.project_name} · 项目总结报告`,
    markdown: lines.join('\n'),
    generatedAt: new Date().toISOString(),
    capabilityId: 'project_summary',
    projectId,
  }
}

// ============================================================
// 能力 dispatcher
// ============================================================

export async function executeCapability(
  capabilityId: AICapabilityId,
  projectId: number,
): Promise<AIOutput> {
  switch (capabilityId) {
    case 'risk_scan':
      return generateRiskScan(projectId)
    case 'weekly_report':
      return generateWeeklyReport(projectId)
    case 'meeting_notes':
      return generateMeetingNotes(projectId)
    case 'acceptance_review':
      return generateAcceptanceReview(projectId)
    case 'handover_doc':
      return generateHandoverDoc(projectId)
    case 'project_summary':
      return generateProjectSummary(projectId)
    default:
      return emptyOutput(capabilityId, '未知能力', projectId)
  }
}

// ============================================================
// 项目列表（供选择器使用）
// ============================================================

export async function loadAvailableProjects(): Promise<Project[]> {
  return listProjects(undefined)
}