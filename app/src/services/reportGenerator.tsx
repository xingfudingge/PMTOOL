/**
 * PMTool V2.0 · 报告生成统一入口（React Context 版）
 * 维护者 2026-08-25 · "不管在哪里点击" → 主页 + 报告中心共用一个弹窗
 *
 * 之前用模块级 state + subscribe/listener · pendingCount 按钮能更新但 modal pending 不更新
 * （module listener 没触发 React re-render） · 现在用真正的 React Context
 *
 * 流程：
 *  1. App 用 <ReportGenProvider> 包
 *  2. HomePage / ReportsPage 用 useReportGen() 拿 requestGeneration
 *  3. requestGeneration 内部调 provider 的 setPending → 触发所有 useReportGen 的组件重渲染
 *  4. RegenConfirmModal 也是 useReportGen() 消费者 · setPending 后自动显示
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { listReports, createReport } from './reports'
import { listTodos } from './todo'
import { listProjects, type Project } from './project'
import type { Report, Todo, ReportType } from '@/database/api'
import { loadTodoCenterItems, itemInDay } from './todoCenter'
import {
  generateDailyReport,
  generateReport,
  deriveProjectReportsFromPersonal,
} from './reportBuilder'
import { computeNextWorkday } from '@/services/datetime'
import { defaultHolidayProvider } from '@/services/holidayProvider'

export type GeneratorType = ReportType
export type GeneratorScope = 'personal' | 'project'

export interface GeneratorParams {
  type: GeneratorType
  scope: GeneratorScope
  period: string
  todayContent?: string
  nextContent?: string
}

export interface ToWrite {
  personal?: { period: string; content: string }
  projects: { project: Project; period: string; content: string }[]
}

export interface PendingRegen {
  existing: Report[]
  toWrite: ToWrite
  type: GeneratorType
  description: string
  resolve: (confirmed: boolean) => void
}

// ============================================================
// Context
// ============================================================

interface ReportGenCtx {
  pending: PendingRegen | null
  confirm: () => void
  cancel: () => void
  /** 当前正在等待用户确认的弹窗数（按钮用） */
  pendingCount: number
  /** 触发一次生成 · 自动处理弹窗 */
  requestGeneration: (params: GeneratorParams) => Promise<{ written: boolean }>
}

const Ctx = createContext<ReportGenCtx | null>(null)

export function useReportGen(): ReportGenCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('useReportGen 必须在 <ReportGenProvider> 内使用')
  return v
}

// ============================================================
// 纯函数
// ============================================================

function periodRange(
  type: GeneratorType,
  key: string,
): { start: string; end: string } | null {
  const pad2 = (n: number) => String(n).padStart(2, '0')
  const fmtDay = (d: Date) =>
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
  const addDays = (d: Date, n: number) => {
    const r = new Date(d)
    r.setDate(r.getDate() + n)
    return r
  }
  if (type === 'daily') return { start: key, end: key }
  if (type === 'weekly') {
    const m = /^(\d{4})-W(\d{2})$/.exec(key)
    if (!m) return null
    const year = +m[1]
    const week = +m[2]
    const jan4 = new Date(year, 0, 4)
    const jan4Mon = addDays(jan4, -(((jan4.getDay() + 6) % 7)))
    const monday = addDays(jan4Mon, (week - 1) * 7)
    const sunday = addDays(monday, 6)
    return { start: fmtDay(monday), end: fmtDay(sunday) }
  }
  const m = /^(\d{4})-(\d{2})$/.exec(key)
  if (!m) return null
  const year = +m[1]
  const month = +m[2]
  const last = new Date(year, month, 0).getDate()
  return { start: `${year}-${pad2(month)}-01`, end: `${year}-${pad2(month)}-${pad2(last)}` }
}

function nextPeriodRange(
  type: GeneratorType,
  key: string,
): { start: string; end: string } | null {
  const pad2 = (n: number) => String(n).padStart(2, '0')
  if (type === 'weekly') {
    const cur = periodRange(type, key)
    if (!cur) return null
    const monday = new Date(cur.start + 'T00:00:00')
    const nextMonday = new Date(monday.getTime() + 7 * 86400000)
    const nextSunday = new Date(nextMonday.getTime() + 6 * 86400000)
    const fmtDay = (d: Date) =>
      `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
    return { start: fmtDay(nextMonday), end: fmtDay(nextSunday) }
  }
  if (type === 'monthly') {
    const m = /^(\d{4})-(\d{2})$/.exec(key)
    if (!m) return null
    const year = +m[1]
    const month = +m[2]
    const nextDate = new Date(year, month, 1)
    const last = new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, 0).getDate()
    return {
      start: `${nextDate.getFullYear()}-${pad2(nextDate.getMonth() + 1)}-01`,
      end: `${nextDate.getFullYear()}-${pad2(nextDate.getMonth() + 1)}-${pad2(last)}`,
    }
  }
  return null
}

function repDayKeyFromCreatedAt(createdAt: string): string {
  return createdAt.slice(0, 10)
}

export async function prepareToWrite(params: GeneratorParams): Promise<ToWrite> {
  const r = periodRange(params.type, params.period)
  const [allTodos, projects] = await Promise.all([listTodos({}), listProjects()])
  const periodTodos: Todo[] = r
    ? allTodos.filter((t) => {
        const d = t.due_date
        return d !== null && d >= r.start && d <= r.end
      })
    : allTodos

  let todayContent = params.todayContent ?? ''
  if (params.type === 'daily') {
    try {
      const raw = localStorage.getItem('pmtool.home.workNotes')
      if (raw) {
        const parsed = JSON.parse(raw) as {
          today?: string
          todayContent?: string
          nextContent?: string
        }
        if (parsed.today === params.period) {
          todayContent = parsed.todayContent ?? ''
          // 维护者 2026-08-25：下个工作日计划不再读 localStorage · 与主工作区统一
          // 主工作区已经从 todos 表自动读 nextWorkday 的 todo · 日报也走同一份数据
        }
      }
    } catch {
      // ignore
    }
  }

  if (params.scope === 'personal' && params.type === 'daily') {
    // 维护者 2026-08-28：下个工作日计划走待办中心聚合数据（与主工作区统一）
    // 普通 Todo + 项目任务 + 周报下周计划 都要进日报 · 不再只读 todos 表
    const nextWd = computeNextWorkday(
      new Date(params.period + 'T00:00:00'),
      (d) => defaultHolidayProvider.isHoliday(d),
    )
    const { items } = await loadTodoCenterItems()
    const nextWdTodos = items
      .filter(
        (t) =>
          itemInDay(t, nextWd) &&
          t.status !== 'COMPLETED' &&
          t.status !== 'DELAYED',
      )
      .map((t) => (t.projectName ? `${t.title} @${t.projectName}` : t.title))
      .sort((a, b) => a.localeCompare(b, 'zh'))
    const nextWdContent = nextWdTodos.join('\n')

    const r2 = await generateDailyReport({
      todayContent,
      nextContent: nextWdContent,
      todos: periodTodos,
      projects: [],
      period: params.period,
      onlyPersonal: true,
    })
    return { personal: r2.personal, projects: [] }
  }

  if (params.scope === 'personal' && params.type !== 'daily') {
    const allDaily = await listReports({ reportType: 'daily', projectId: null })
    const inPeriod = allDaily.filter((rep) => {
      const p = rep.period ?? repDayKeyFromCreatedAt(rep.createdAt)
      return r ? p >= r.start && p <= r.end : false
    })
    // 维护者 2026-08-25：周报/月报"下周/下月工作计划"也跟主工作区统一 · 从 todos 表读
    // 不再读 project_tasks（那是项目计划 · 不是待办）
    const nextR = nextPeriodRange(params.type, params.period)
    const nextPeriodTodos: Todo[] = []
    if (nextR) {
      for (const t of allTodos) {
        const d = t.due_date
        if (
          d !== null &&
          d >= nextR.start &&
          d <= nextR.end &&
          t.status !== 'COMPLETED' &&
          t.status !== 'DELAYED'
        ) {
          nextPeriodTodos.push(t)
        }
      }
    }
    const r2 = await generateReport({
      type: params.type,
      todayContent: '',
      nextContent: '',
      todos: [],
      projects,
      period: params.period,
      dailyReportsInPeriod: inPeriod,
      nextPeriodTodos, // 改名：项目计划 → todos
    })
    return { personal: r2.personal, projects: [] }
  }

  if (params.type === 'daily') {
    const allDaily = await listReports({ reportType: 'daily', projectId: null })
    const personalReport = allDaily.find(
      (rep) => rep.projectId === null && rep.period === params.period,
    )
    if (!personalReport) {
      throw new Error(`${params.period} 的个人日报未生成 · 请先在主页生成个人日报`)
    }
    const personalContent = personalReport.content ?? ''
    const projects2 = deriveProjectReportsFromPersonal(
      personalContent,
      projects,
      params.period,
    )
    return { personal: undefined, projects: projects2 }
  }

  const allDaily = await listReports({ reportType: 'daily', projectId: null })
  const inPeriod = allDaily.filter((rep) => {
    const p = rep.period ?? repDayKeyFromCreatedAt(rep.createdAt)
    return r ? p >= r.start && p <= r.end : false
  })
  // 维护者 2026-08-25：项目作用域周报/月报"下周/下月计划"也从 todos 读（与个人/日报统一）
  const nextR = nextPeriodRange(params.type, params.period)
  const nextPeriodTodos: Todo[] = []
  if (nextR) {
    for (const t of allTodos) {
      const d = t.due_date
      if (
        d !== null &&
        d >= nextR.start &&
        d <= nextR.end &&
        t.status !== 'COMPLETED' &&
        t.status !== 'DELAYED'
      ) {
        nextPeriodTodos.push(t)
      }
    }
  }
  const r2 = await generateReport({
    type: params.type,
    todayContent: '',
    nextContent: '',
    todos: [],
    projects,
    period: params.period,
    dailyReportsInPeriod: inPeriod,
    nextPeriodTodos,
  })
  return { personal: undefined, projects: r2.personal.projectReports }
}

async function findExistingReports(
  type: GeneratorType,
  scope: GeneratorScope,
  period: string,
  projects: Project[],
): Promise<Report[]> {
  const all = await listReports({ reportType: type, projectId: null })
  if (scope === 'personal') {
    return all.filter((r) => r.projectId === null && r.period === period)
  }
  const projectIds = new Set(projects.map((p) => p.id))
  return all.filter(
    (r) => r.period === period && r.projectId !== null && projectIds.has(r.projectId),
  )
}

export async function writeReports(type: GeneratorType, toWrite: ToWrite): Promise<void> {
  if (toWrite.personal) {
    await createReport({
      reportType: type,
      projectId: null,
      title: `${typeLabelOf(type)}（个人）· ${toWrite.personal.period}`,
      content: toWrite.personal.content,
      period: toWrite.personal.period,
    })
  }
  for (const pr of toWrite.projects) {
    await createReport({
      reportType: type,
      projectId: pr.project.id,
      title: `${typeLabelOf(type)} · ${pr.project.project_name} · ${pr.period}`,
      content: pr.content,
      period: pr.period,
    })
  }
}

export function typeLabelOf(t: GeneratorType): string {
  return ({ daily: '日报', weekly: '周报', monthly: '月报' } as const)[t]
}

// ============================================================
// Provider
// ============================================================

export function ReportGenProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingRegen | null>(null)
  const pendingCount = pending ? 1 : 0

  // 用 ref 持有最新的 resolve · 避免 callback 闭包过期
  const pendingRef = useRef<PendingRegen | null>(null)
  pendingRef.current = pending

  const confirm = useCallback(() => {
    const p = pendingRef.current
    if (!p) return
    setPending(null)
    writeReports(p.type, p.toWrite)
      .catch((err) => console.error('写入报告失败', err))
      .finally(() => p.resolve(true))
  }, [])

  const cancel = useCallback(() => {
    const p = pendingRef.current
    if (!p) return
    setPending(null)
    p.resolve(false)
  }, [])

  const requestGeneration = useCallback(
    async (params: GeneratorParams): Promise<{ written: boolean }> => {
      // 已经有一个弹窗在等 → 排队（不阻塞 · 直接 resolve false）
      if (pendingRef.current) {
        return { written: false }
      }
      let toWrite: ToWrite
      try {
        toWrite = await prepareToWrite(params)
      } catch (err) {
        throw err
      }
      const projects = await listProjects()
      const existing = await findExistingReports(
        params.type,
        params.scope,
        params.period,
        projects,
      )

      // 没有已存在 → 直接写
      if (existing.length === 0) {
        await writeReports(params.type, toWrite)
        return { written: true }
      }

      // 有已存在 → setPending 触发 re-render → modal 显示 → 用户点确认/取消
      return new Promise<{ written: boolean }>((resolve) => {
        const description =
          params.scope === 'personal'
            ? `${typeLabelOf(params.type)}（个人）· ${params.period}`
            : `${typeLabelOf(params.type)}（项目）· ${params.period}`
        setPending({
          existing,
          toWrite,
          type: params.type,
          description,
          resolve: (confirmed) => resolve({ written: confirmed }),
        })
      })
    },
    [],
  )

  const value = useMemo<ReportGenCtx>(
    () => ({ pending, confirm, cancel, pendingCount, requestGeneration }),
    [pending, confirm, cancel, pendingCount, requestGeneration],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// ============================================================
// 自动化调度接入（维护者 2026-09-11 · 自动化任务真正落库）
// 调度器只负责判断"该不该触发"，报告内容生成+落库统一走这里，
// 而非直接调 generator 的纯函数（那只会返回字符串、不写库）。
// ============================================================

/**
 * 当前/指定日期所属周期 key：
 *   日报 → YYYY-MM-DD · 周报 → ISO 周 YYYY-Www · 月报 → YYYY-MM
 * 与 periodRange() 解析格式保持一致。
 */
export function getPeriodKey(type: GeneratorType, base?: Date): string {
  const d = base ?? new Date()
  const pad2 = (n: number) => String(n).padStart(2, '0')
  if (type === 'daily') return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
  if (type === 'monthly') return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`
  // weekly：ISO 8601 周数（周一为一周起点）
  const cur = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const dayOfWeek = (cur.getDay() + 6) % 7 // 周一=0 ... 周日=6
  const thursday = new Date(cur)
  thursday.setDate(cur.getDate() + (4 - dayOfWeek))
  const yearStart = new Date(thursday.getFullYear(), 0, 1)
  const weekNo = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${thursday.getFullYear()}-W${pad2(weekNo)}`
}

/**
 * 自动化生成报告并落库（日报/周报/月报通用）。
 * 直接写库（自动化不弹覆盖确认 · 不打扰用户）。
 * @param scope 'personal'=仅个人 · 'project'=该用户全部项目各生成一份
 */
export async function generateAutomationReport(
  type: GeneratorType,
  scope: GeneratorScope = 'personal',
): Promise<{ written: boolean }> {
  const period = getPeriodKey(type)
  const toWrite = await prepareToWrite({
    type,
    scope,
    period,
    todayContent: '',
    nextContent: '',
  })
  await writeReports(type, toWrite)
  return { written: true }
}
