/**
 * PMTool V2.0 · 报告生成器（个人 + 项目）
 * 维护者 2026-08-25 · 常规报告三件套（日报/周报/月报）
 *
 * 维护者 2026-08-25 二次修正：
 *   - 「个人报告」不等于"汇报层面包含项目报告" · 是"任务层面包含"
 *     即：个人报告 = 用户自由文本 + 今天完成的所有 todos（@ 项目名已经在标题里）
 *     不要在个人报告里写 "## 项目名" 分段（那是汇报层结构）
 *   - 项目日报里只能有该项目相关的 todos · 不能包含用户自由文本 + 个人头
 *
 * 输出：个人 Markdown + 多个项目 Markdown（每个项目一份）
 *
 * 个人模板：
 *   今日工作内容：
 *   1、xxx                                       ← 用户自由文本
 *   2、项目调研@启明智能印章项目                  ← 完成的 todo · 标题里 @ 项目
 *   3、yyy
 *   下个工作日计划：
 *   1、zzz
 *
 * 项目模板（如启明智能印章项目）：
 *   今日工作内容：
 *   1、项目调研@启明智能印章项目
 *   2、回复晨曦合同细节@启明智能合同项目
 *   下个工作日计划：
 *   （暂无）
 */

import type { Project } from '@/services/project'
import type { Todo, Report } from '@/database/api'
import { formatLocalDate } from '@/services/datetime'

export type ReportType = 'daily' | 'weekly' | 'monthly'

const TITLES: Record<ReportType, { section1: string; section2: string }> = {
  daily: {
    section1: '今日工作内容',
    section2: '下个工作日计划',
  },
  weekly: {
    section1: '本周工作内容',
    section2: '下周工作计划',
  },
  monthly: {
    section1: '本月工作内容',
    section2: '下月工作计划',
  },
}

/**
 * 把 textarea 文本（每行一条）转成 "1、xxx\n2、xxx" 格式
 *  - 自动剥掉行首 "· " / "1、 " / "- " 这类用户已写的前缀
 *  - 空行过滤
 */
export function toNumberedList(text: string): string {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => l.replace(/^[-*•·]\s*/, '').replace(/^\d+[、.)]\s*/, ''))
    .filter((l) => l.length > 0)
  return lines.map((l, i) => `${i + 1}、${l}`).join('\n')
}

/**
 * 把每条剥掉前缀，然后整体重新从 1 开始编号
 */
function renumber(items: string[]): string[] {
  const cleaned = items
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => s.replace(/^[-*•·]\s*/, '').replace(/^\d+[、.)]\s*/, ''))
    .filter((s) => s.length > 0)
  return cleaned.map((s, i) => `${i + 1}、${s}`)
}

function getToday(): string {
  return formatLocalDate(new Date())
}

/**
 * 个人报告内容
 *  - 今日工作内容：用户手写的 todayContent（自由文本 · 一行一条 · @ 项目名直接在标题里）
 *  - 下个工作日计划：用户手写的 nextContent
 *  - 不混入 todos（todos 出现在项目报告里 · 个人报告不要污染）
 *  - 维护者原话："我就这么多内容 · 你的日报里面怎么输出那么多内容的" —— 不要把全部 todo 塞进去
 */
function buildPersonalReport(
  type: ReportType,
  todayContent: string,
  nextContent: string,
  // 接收但不消费 todos（接口稳定 · 防止后续误用）
  _todos: Todo[],
): string {
  const { section1, section2 } = TITLES[type]
  const lines: string[] = []

  // 个人报告只取用户手写内容 · 不并入任何 todo
  const todayItems = toNumberedList(todayContent)
  lines.push(`${section1}：`)
  lines.push(todayItems || '（暂无）')
  lines.push('')

  const nextItems = toNumberedList(nextContent)
  lines.push(`${section2}：`)
  lines.push(nextItems || '（暂无）')

  return lines.join('\n')
}

/**
 * 项目报告内容
 *  - 完全从 personal report content 推导（项目报告 = 个人报告的子集）
 *  - 解析 personal content · 抽取含 @项目名 的编号项
 *  - 剥掉 @项目名 后保留其余文字作为项目报告内容
 *  - 格式：两段标题必须有 · 空内容用「（暂无）」
 *  - 维护者原话：项目报告不得出现个人报告中没有的内容
 */
function buildProjectReport(
  type: ReportType,
  project: Project,
  // 个人报告 content（来源）· 项目报告必须从中推导
  personalContent: string,
): string {
  const { section1, section2 } = TITLES[type]
  const { today, plan } = extractProjectItems(personalContent, project.project_name)
  const numberedToday = renumber(today)
  const numberedPlan = renumber(plan)

  const lines: string[] = []
  lines.push(`${section1}：`)
  lines.push(numberedToday.length > 0 ? numberedToday.join('\n') : '（暂无）')
  lines.push('')
  lines.push(`${section2}：`)
  lines.push(numberedPlan.length > 0 ? numberedPlan.join('\n') : '（暂无）')

  return lines.join('\n')
}

/**
 * 项目日报 · 从该项目自己的待办生成（不依赖个人日报）
 * 维护者 2026-09-17：报告中心点「生成日报（项目）」时，若该日没有个人日报，
 *   则直接从该项目当天/次日的待办生成，不再强制先建个人日报。
 *  - 今日工作内容 = todayItems（该项目当天的待办）
 *  - 下个工作日计划 = planItems（该项目次工作日的待办）
 *  - 两段标题必须有 · 空内容落「（暂无）」· 与 buildProjectReport 输出格式一致
 */
export function buildProjectReportFromItems(
  type: ReportType,
  todayItems: string[],
  planItems: string[],
): string {
  const { section1, section2 } = TITLES[type]
  const lines: string[] = []
  lines.push(`${section1}：`)
  lines.push(todayItems.length > 0 ? renumber(todayItems).join('\n') : '（暂无）')
  lines.push('')
  lines.push(`${section2}：`)
  lines.push(planItems.length > 0 ? renumber(planItems).join('\n') : '（暂无）')
  return lines.join('\n')
}

/**
 * 从 personal content 中抽取含指定项目 @ 的编号项
 *  - 匹配「1、xxx@项目名」或「1、@项目名 xxx」或「1、xxx @项目名 xxx」
 *  - 剥掉 @项目名 段保留其余作为 item 内容
 *  - 不区分段别（today / plan）· 通过 section 标识分别归入
 *  - 返回 { today: string[], plan: string[] }
 */
function extractProjectItems(
  personalContent: string,
  projectName: string,
): { today: string[]; plan: string[] } {
  const out: { today: string[]; plan: string[] } = { today: [], plan: [] }
  let section: 'today' | 'plan' | null = null

  // 转义项目名中的特殊字符
  const escaped = projectName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // 匹配 @ 项目名（@ 和项目名之间允许空格 · 项目名后接行尾/空白/标点）
  const atRegex = new RegExp(`@\\s*${escaped}(?=\\s|$|[，。！？、）])`)

  for (const raw of personalContent.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    // 段头检测（兼容日报/周报/月报三种 section1 标题）
    if (
      line.startsWith('今日工作内容') ||
      line.startsWith('本周工作内容') ||
      line.startsWith('本月工作内容')
    ) {
      section = 'today'
      continue
    }
    if (
      line.startsWith('下个工作日计划') ||
      line.startsWith('下周工作计划') ||
      line.startsWith('下月工作计划')
    ) {
      section = 'plan'
      continue
    }
    // 编号项：1、xxx / 1) xxx / 1. xxx
    const m = /^\d+[、.)]\s*(.+)$/.exec(line)
    if (!m) continue
    const item = m[1]
    if (atRegex.test(item)) {
      // 剥掉 @项目名（包括 @ 和项目名及前后空白）· 保留其余文字
      const cleaned = item.replace(new RegExp(`@\\s*${escaped}\\s*`, 'g'), '').trim()
      if (cleaned) {
        if (section === 'today') out.today.push(cleaned)
        else if (section === 'plan') out.plan.push(cleaned)
      }
    }
  }
  return out
}

/**
 * 生成个人 + 项目报告
 *  - 1 份个人报告（project_id = NULL）
 *  - N 份项目报告（每个有相关 todo 的项目一份）
 *  - 不为没有 todo 的项目生成报告
 *  - period: 报告归属周期（'YYYY-MM-DD' / 'YYYY-Www' / 'YYYY-MM'）·
 *    同一 (type, project_id, period) 写入时会覆盖前一条
 */
export async function generateDailyReport(input: {
  todayContent: string
  nextContent: string
  todos: Todo[]
  projects: Project[]
  /** 可选 · 默认今天 · 周报/月报需要传对应周期 */
  period?: string
  /**
   * 只生成个人日报（不写项目报告）· true 时项目 reports 返回 []
   *  - ReportsPage scope='personal' 走这条路
   */
  onlyPersonal?: boolean
}): Promise<{
  personal: { period: string; content: string; projectReports: { project: Project; period: string; content: string }[] }
}> {
  const today = input.period ?? getToday()

  // 1. 个人报告（用户手写内容 · 不并入任何 todo）
  const personalContent = buildPersonalReport('daily', input.todayContent, input.nextContent, input.todos)

  // 2. 项目报告 · 从 personal content 推导（含 @项目名 的项）
  if (input.onlyPersonal) {
    return {
      personal: { period: today, content: personalContent, projectReports: [] },
    }
  }
  const projectReports = input.projects
    .map((p) => {
      const content = buildProjectReport('daily', p, personalContent)
      return { project: p, period: today, content }
    })
    .filter((r): r is { project: Project; period: string; content: string } => r !== null)

  return {
    personal: { period: today, content: personalContent, projectReports },
  }
}

/**
 * 从已存在的 personal daily content 推导各项目 daily
 *  - ReportsPage scope='project' 走这条路
 *  - 不重新生成 personal daily · 只从已写入的 personal content 抽取 @项目名 项
 *  - 返回 [{ project, period, content }] · 每个项目都返回（即使无内容也返回「（暂无）」）
 */
export function deriveProjectReportsFromPersonal(
  personalContent: string,
  projects: Project[],
  period: string,
): { project: Project; period: string; content: string }[] {
  return projects.map((p) => {
    const content = buildProjectReport('daily', p, personalContent)
    return { project: p, period, content }
  })
}

/**
 * 按类型生成报告（日报 / 周报 / 月报通用）
 *  - daily: 走 buildPersonalReport / buildProjectReport · todos 用今天的 COMPLETED
 *  - weekly / monthly: 走 aggregatePeriodReport · 从当周/当月日报 content 聚合
 */
export async function generateReport(input: {
  type: ReportType
  todayContent: string
  nextContent: string
  todos: Todo[]
  projects: Project[]
  period: string
  /** 周报/月报 聚合时必填 · 日报可省 */
  dailyReportsInPeriod?: Report[]
  /** 周报/月报 必填 · 用于下周/下月计划（从 todos 表读 · 与主工作区统一） */
  nextPeriodTodos?: Todo[]
}): Promise<{
  personal: { period: string; content: string; projectReports: { project: Project; period: string; content: string }[] }
}> {
  // 周报 / 月报：聚合日报 · next plan 从 todos 读（与主工作区统一）
  if (input.type !== 'daily') {
    if (!input.dailyReportsInPeriod || !input.nextPeriodTodos) {
      throw new Error('周报/月报必须传 dailyReportsInPeriod + nextPeriodTodos')
    }
    return aggregatePeriodReport({
      type: input.type,
      period: input.period,
      dailyReports: input.dailyReportsInPeriod,
      nextPeriodTodos: input.nextPeriodTodos,
      projects: input.projects,
    })
  }

  // 日报：单日生成
  const today = input.period
  const personalContent = buildPersonalReport(input.type, input.todayContent, input.nextContent, input.todos)
  const projectReports = input.projects
    .map((p) => {
      const content = buildProjectReport(input.type, p, personalContent)
      return { project: p, period: today, content }
    })
    .filter((r): r is { project: Project; period: string; content: string } => r !== null)

  return {
    personal: { period: today, content: personalContent, projectReports },
  }
}

// ============================================================
// 周报 / 月报 · 聚合当周/当月所有日报
// ============================================================

/**
 * 解析日报 content · 提取「今日工作内容」「下个工作日计划」段
 *  - 格式：section1：\n1、...\n2、...\n\nsection2：\n1、...
 *  - 返回 { today: string[]（剥掉编号后的纯文本）, plan: string[] }
 */
function parseDailyContent(content: string): { today: string[]; plan: string[] } {
  const out: { today: string[]; plan: string[] } = { today: [], plan: [] }
  let section: 'today' | 'plan' | null = null
  const lines = content.split('\n')
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    if (line.startsWith('今日工作内容') || line.startsWith('本周工作内容') || line.startsWith('本月工作内容')) {
      section = 'today'
      continue
    }
    if (line.startsWith('下个工作日计划') || line.startsWith('下周工作计划') || line.startsWith('下月工作计划')) {
      section = 'plan'
      continue
    }
    // 编号行：1、xxx  2) xxx  3. xxx
    const m = /^\d+[、.)]\s*(.+)$/.exec(line)
    if (!m) continue
    const cleaned = m[1].trim()
    if (!cleaned || cleaned === '（暂无）') continue
    if (section === 'today') out.today.push(cleaned)
    else if (section === 'plan') out.plan.push(cleaned)
  }
  return out
}

/**
 * 周报 / 月报聚合
 *  - 已办 = 当周期所有日报的「今日工作内容」累加（personal 取 personal daily，project · 取项目 daily）
 *  - 下周/月计划 = 下周/月项目计划（按项目分组 · 用户后续扩充）
 */
function aggregatePeriodReport(input: {
  type: ReportType
  period: string
  dailyReports: Report[]
  nextPeriodTodos: Todo[]
  projects: Project[]
}): {
  personal: { period: string; content: string; projectReports: { project: Project; period: string; content: string }[] }
} {
  const { section1, section2 } = TITLES[input.type]
  const projectNameById = new Map(input.projects.map((p) => [p.id, p.project_name]))

  // 1. 个人报告：聚合所有 personal daily reports（projectId === null）
  const personalDaily = input.dailyReports.filter((r) => r.projectId === null)
  const allToday: string[] = []
  for (const r of personalDaily) {
    const { today } = parseDailyContent(r.content ?? '')
    allToday.push(...today)
  }
  // 去重（保留顺序）
  const seen = new Set<string>()
  const uniqueToday = allToday.filter((t) => {
    if (seen.has(t)) return false
    seen.add(t)
    return true
  })
  // 下一周期计划（来自 todos · 与主工作区统一 · 维护者 2026-08-25）
  const nextPlan = formatTodoPlan(input.nextPeriodTodos, projectNameById)

  const personalContent =
    `${section1}：\n` +
    (uniqueToday.length > 0 ? renumber(uniqueToday).join('\n') : '（暂无）') +
    '\n\n' +
    `${section2}：\n` +
    (nextPlan || '（暂无）')

  // 2. 项目报告：聚合该项目当周/当月的所有项目 daily reports
  // 维护者 2026-09-12：无论是否有项目日报，每个项目都生成周报/月报（无数据落「（暂无）」）
  // 之前的实现用 continue 跳过无日报/无内容的项目，导致项目周报/月报「静默不生成」。
  const projectReports: { project: Project; period: string; content: string }[] = []
  for (const p of input.projects) {
    const projectDaily = input.dailyReports.filter((r) => r.projectId === p.id)
    const projToday: string[] = []
    for (const r of projectDaily) {
      const { today } = parseDailyContent(r.content ?? '')
      projToday.push(...today)
    }
    const seenProj = new Set<string>()
    const uniqueProjToday = projToday.filter((t) => {
      if (seenProj.has(t)) return false
      seenProj.add(t)
      return true
    })
    const projContent =
      `${section1}：\n` +
      (uniqueProjToday.length > 0 ? renumber(uniqueProjToday).join('\n') : '（暂无）') +
      '\n\n' +
      `${section2}：\n` +
      '（暂无）'
    projectReports.push({ project: p, period: input.period, content: projContent })
  }

  return {
    personal: { period: input.period, content: personalContent, projectReports },
  }
}

/**
 * 待办分组格式（next period plan · 周报/月报用）
 *  - 维护者 2026-08-25：替代旧的 formatProjectTaskPlan · 数据源从 project_tasks 改为 todos
 *  - 按项目分组 · 段头「（项目名）」
 *  - 每个项目下列出 todo title（已带 @项目名 后缀）
 *  - 用户生成后自己扩充细节
 */
function formatTodoPlan(
  todos: Todo[],
  projectNameById: Map<number, string>,
): string {
  if (todos.length === 0) return ''
  // 按 project_id 分组（无 project_id 的归到「未分配」）
  const byProject = new Map<number | null, Todo[]>()
  for (const t of todos) {
    const key = t.project_id
    if (!byProject.has(key)) byProject.set(key, [])
    byProject.get(key)!.push(t)
  }
  const lines: string[] = []
  // 项目优先排序（按项目名字母序）· 无项目放最后
  const sorted = [...byProject.entries()].sort((a, b) => {
    if (a[0] === null) return 1
    if (b[0] === null) return -1
    const na = projectNameById.get(a[0]!) ?? ''
    const nb = projectNameById.get(b[0]!) ?? ''
    return na.localeCompare(nb, 'zh-CN')
  })
  for (const [projectId, projTodos] of sorted) {
    const projName =
      projectId !== null
        ? projectNameById.get(projectId) ?? `项目 #${projectId}`
        : '未分配项目'
    lines.push(`（${projName}）`)
    for (let i = 0; i < projTodos.length; i++) {
      lines.push(`${i + 1}、${projTodos[i].title}`)
    }
    lines.push('')
  }
  return lines.join('\n').trimEnd()
}