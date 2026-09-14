/**
 * PMTool V2.0 · 主工作区
 * Phase A 产品结构纠偏 v2（2026-08-24 · 维护者拍板）
 *
 * 设计依据（维护者 2026-08-24 原话 · ASCII 设计稿）：
 *
 *   时间    今日待完成：10  今日已完成：1   |
 *   ------------------------------------|
 *   日历看板       |  今日工作内容         |
 *   （工作日和法定节|---------------------|
 *   假日要特殊标记）|1、xxx               |
 *                 |2、xxx               |
 *                 |3、xxx               |
 *                 |---------------------|
 *                 |  下个工作日计划       |
 *                 |---------------------|
 *   --------------|1、xxx               |
 *   今日代办       |2、xxx               |
 *   --------------|3、xxx               |
 *   口 xxx        |4、xxx               |
 *   口 xxx        |5、xxx               |
 *   ------------------------------------|
 *
 * 实现要点（按维护者反馈）：
 *   - 今日待完成 / 今日已完成：顶部 2 个数字（今天 todo 里未完成 / 已完成数）
 *   - 日历看板：左列上半 · 工作日 + 法定节假日特殊标记
 *   - 今日工作内容：右列上半 · 编号列表（用户手动记录今天做了什么 · 自由文本）
 *   - 下个工作日计划：右列下半 · 编号列表（用户手动记录下一个工作日要做什么）
 *   - 今日待办：左列下半 · todo checkbox 列表（点击勾选完成）
 *
 * 区分澄清：
 *   · 今日待完成 = 数字（统计）
 *   · 今日已完成 = 数字（统计）
 *   · 今日工作内容 = 自由文本编号列表（手工记录 · 不是 todo）
 *   · 今日待办 = todo checkbox（来自 todos 表 · 可勾选完成）
 *
 * 风格延续：CSS 变量 + Lucide + Linear 风
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  FileText,
  ListTodo,
  Maximize2,
  Minimize2,
  PenLine,
  Plus,
  Send,
  type LucideIcon,
} from 'lucide-react'
import {
  loadHomeDashboard,
  type HomeDashboard,
} from '@/services/homeDashboard'
import { createTodo } from '@/services/todo'
import {
  loadTodoCenterItems,
  toggleTodoCenterItem,
  itemInDay,
  type TodoCenterItem,
} from '@/services/todoCenter'
import { useReportGen } from '@/services/reportGenerator'
import { syncRecurringTodos } from '@/services/recurringTasks'
import {
  defaultHolidayProvider,
  loadHolidayProvider,
  type HolidayProvider,
} from '@/services/holidayProvider'
import { formatLocalDate, extractLocalDate } from '@/services/datetime'
import { getWorkNote, saveWorkNote } from '@/services/workNotes'
import {
  MentionTextarea,
  type MentionOption,
} from '@/components/MentionTextarea'

export function HomePage() {
  const [data, setData] = useState<HomeDashboard | null>(null)
  // 维护者 2026-08-27：主工作区与待办中心同源聚合（Todo + 项目任务 + 周报下周计划）
  const [allItems, setAllItems] = useState<TodoCenterItem[]>([])
  const [mentionProjects, setMentionProjects] = useState<MentionOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [holidayReady, setHolidayReady] = useState(false)
  // 维护者要的「日历点击联动」· 点哪一天，下面的今日待办就显示哪一天
  const [selectedDate, setSelectedDate] = useState<string>(() => formatLocalDate(new Date()))

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // 维护者 2026-08-28: 周期性任务同步（把周期日生成待办写入 todos 表）
      await syncRecurringTodos()
      const [d, { items, projectsMap }] = await Promise.all([
        loadHomeDashboard(),
        loadTodoCenterItems(),
      ])
      setData(d)
      setAllItems(items)
      const projects = Object.keys(projectsMap).map((k) => ({ id: Number(k), name: projectsMap[Number(k)] }))
      setMentionProjects(projects)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        await loadHolidayProvider()
        setHolidayReady(true)
      } catch {
        setHolidayReady(true)
      }
      await refresh()
    })()
  }, [refresh])

  // 按 selectedDate 客户端过滤聚合项（Todo + 项目任务 + 周报下周计划 · 时间段任务命中当天）
  const todosForDate: TodoCenterItem[] = useMemo(() => {
    return allItems
      .filter((t) => itemInDay(t, selectedDate))
      .sort((a, b) => {
        const order: Record<string, number> = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 }
        return (order[a.priority] ?? 9) - (order[b.priority] ?? 9)
      })
  }, [allItems, selectedDate])

  const pendingCount = todosForDate.filter(
    (t) => t.status !== 'COMPLETED' && t.status !== 'DELAYED',
  ).length
  const completedCount = todosForDate.filter((t) => t.status === 'COMPLETED').length
  const todayLocal = formatLocalDate(new Date())
  const isSelectedToday = selectedDate === todayLocal

  // 维护者 2026-08-28：下个工作日计划要排除休息日（周末 + 法定节假日 + 调休）
  // 依赖 holidayReady：节假日表异步加载完成后重算 · 否则首帧空缓存会把节假日周中当工作日
  const nextWorkday = useMemo(() => computeNextWorkday(), [holidayReady])
  const nextWorkdayTodos = useMemo(() => {
    return allItems
      .filter((t) => itemInDay(t, nextWorkday) && t.status !== 'COMPLETED' && t.status !== 'DELAYED')
      .sort((a, b) => {
        const order: Record<string, number> = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 }
        return (order[a.priority] ?? 9) - (order[b.priority] ?? 9)
      })
  }, [allItems, nextWorkday])

  if (loading && !data) {
    return (
      <div
        data-testid="home-loading"
        style={{ padding: '48px 40px', color: 'var(--color-text-secondary)' }}
      >
        正在加载主工作区…
      </div>
    )
  }

  if (error || !data) {
    return (
      <div style={{ padding: '48px 40px' }}>
        <div
          data-testid="home-error"
          style={{
            padding: '12px 16px',
            background: 'var(--color-bg-subtle)',
            border: '1px solid var(--color-status-danger)',
            borderRadius: 'var(--radius)',
            color: 'var(--color-status-danger)',
            fontSize: '13px',
          }}
        >
          加载失败：{error ?? '未知错误'}
        </div>
      </div>
    )
  }

  return (
    <div
      data-testid="home-page"
      style={{
        padding: '14px 24px 14px',
        maxWidth: '1440px',
        background: 'var(--color-bg)',
        // fit viewport · 整页无滚动
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      {/* 顶部：左侧问候 */}
      <div style={{ marginBottom: 8, flexShrink: 0 }}>
        <Greeting data={data} />
      </div>

      {/* 顶部：3 个数字卡片（平铺 · 大字号 · 维护者要求"要平铺开"） */}
      <div style={{ marginBottom: 10, flexShrink: 0 }}>
        <Counters
          pending={pendingCount}
          completed={completedCount}
          date={selectedDate}
          isToday={isSelectedToday}
        />
      </div>

      {/* 主区：左列（日历 + 今日待办·窄列）+ 右列（今日工作内容 + 下个工作日计划·宽列） */}
      <div
        style={{
          display: 'grid',
          // 维护者原话："不要所有界面都55分 · 强行55分很丑"
          // 日历看板还是太大了 → 左列更窄（3fr = ~280px）· 右列更宽（8fr = ~800px）
          gridTemplateColumns: 'minmax(260px, 3fr) minmax(0, 8fr)',
          gap: 10,
          alignItems: 'stretch',
          flex: 1,
          minHeight: 0,
        }}
      >
        {/* 左列 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
          <MonthCalendar
            ready={holidayReady}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            onJumpToToday={setSelectedDate}
            items={allItems}
          />
          <TodayTodosCard
            items={todosForDate}
            date={selectedDate}
            isToday={isSelectedToday}
            onAfterChange={refresh}
            mentionProjects={mentionProjects}
          />
        </div>

        {/* 右列 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
          <TodayWorkCard projects={mentionProjects} />
          <NextWorkdayCard nextWorkday={nextWorkday} nextWorkdayTodos={nextWorkdayTodos} />
        </div>
      </div>
    </div>
  )
}

// ============================================================
// 顶部左侧：日期 + 问候
// ============================================================

function Greeting({ data }: { data: HomeDashboard }) {
  return (
    <div>
      <div
        style={{
          fontSize: '12px',
          color: 'var(--color-text-tertiary)',
          letterSpacing: '0.04em',
          marginBottom: 4,
        }}
      >
        {data.todayLocal} · 星期{data.weekdayCN} · {dayTypeLabel(data.todayLocal)}
      </div>
      <h1
        style={{
          fontSize: '24px',
          fontWeight: 600,
          color: 'var(--color-text)',
          letterSpacing: '-0.015em',
          margin: 0,
        }}
      >
        {data.greeting}
      </h1>
    </div>
  )
}

function dayTypeLabel(_dateLocal: string): string {
  const w = new Date().getDay()
  if (w === 0 || w === 6) return '周末'
  return '工作日'
}

// ============================================================
// 顶部右侧：2 个数字（今日待完成 / 今日已完成 · 维护者要求只要这 2 个）
// ============================================================

function Counters({
  pending,
  completed,
  date,
  isToday,
}: {
  pending: number
  completed: number
  date: string
  isToday: boolean
}) {
  // 维护者要的「平铺开」：数字卡片化 · 大字号 · 横向铺满
  // 第 3 格放「生成日报」按钮（一键复制 Markdown 到剪贴板）
  return (
    <div
      data-testid="home-counters"
      style={{
        display: 'flex',
        alignItems: 'stretch',
        border: '1px solid var(--color-border-thin)',
        borderRadius: 'var(--radius-md)',
        background: 'var(--color-surface)',
        overflow: 'hidden',
      }}
    >
      <CounterCell
        label={isToday ? '今日待完成' : '当日待完成'}
        value={pending}
        color="var(--color-status-warning)"
        testid="counter-pending"
        suffix={isToday ? '' : `（${date.slice(5)}）`}
      />
      <div style={{ width: 1, background: 'var(--color-border-thin)' }} />
      <CounterCell
        label={isToday ? '今日已完成' : '当日已完成'}
        value={completed}
        color="var(--color-status-success)"
        testid="counter-completed"
        suffix={isToday ? '' : `（${date.slice(5)}）`}
      />
      <div style={{ width: 1, background: 'var(--color-border-thin)' }} />
      <ReportButton />
    </div>
  )
}

/**
 * 生成日报按钮
 *  · 一键把「今日工作内容」+「下个工作日计划」拼成 Markdown
 *  · 复制到剪贴板 + alert 弹窗预览
 *  · 维护者原话："今日工作内容：1、xxx 2、xxx / 下个工作日计划：1、xxx 2、xxx"
 */
function ReportButton() {
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<{ show: boolean; msg: string; tone: 'ok' | 'err' }>({
    show: false,
    msg: '',
    tone: 'ok',
  })
  const { requestGeneration, pendingCount } = useReportGen()
  const showToast = (msg: string, tone: 'ok' | 'err' = 'ok') => {
    setToast({ show: true, msg, tone })
    setTimeout(() => setToast((t) => ({ ...t, show: false })), 3000)
  }

  const handleClick = async () => {
    if (busy) return
    setBusy(true)
    try {
      // 走全局 Context · 主页 = 个人 + 项目 一起生成（各自走弹窗）
      const today = formatLocalDate(new Date())
      const r1 = await requestGeneration({
        type: 'daily',
        scope: 'personal',
        period: today,
      })
      const r2 = await requestGeneration({
        type: 'daily',
        scope: 'project',
        period: today,
      })
      if (r1.written || r2.written) {
        showToast('生成成功，请到报告中心查看')
      } else {
        showToast('已取消')
      }
    } catch (err) {
      console.error('生成日报失败', err)
      showToast('生成失败：' + (err instanceof Error ? err.message : String(err)), 'err')
    } finally {
      setBusy(false)
    }
  }

  // 按钮文案：
  //  - 没在生成中：显示「生成日报」
  //  - 在生成中 + 有待确认弹窗：显示「等待确认…」（告诉用户弹窗要确认）
  //  - 在生成中 + 没待确认弹窗：显示「生成中…」（正在写库）
  let btnText = '生成日报'
  if (busy) {
    btnText = pendingCount > 0 ? '等待确认…' : '生成中…'
  }

  return (
    <>
      <button
        type="button"
        data-testid="generate-daily-report"
        onClick={handleClick}
        disabled={busy}
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 5,
          padding: '0 14px',
          border: 'none',
          background: 'transparent',
          color: pendingCount > 0 ? 'var(--color-status-warning)' : 'var(--color-accent)',
          fontSize: '12.5px',
          fontWeight: 500,
          cursor: busy ? 'wait' : 'pointer',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--color-accent-subtle)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent'
        }}
      >
        <FileText size={13} strokeWidth={1.75} />
        {btnText}
      </button>
      {toast.show && <Toast message={toast.msg} tone={toast.tone} />}
    </>
  )
}

/**
 * Toast 提示（替换 window.alert · 维护者原话"只要提示：生成成功"）
 *  · 显示在右上角 · 3 秒自动消失
 */
function Toast({ message, tone }: { message: string; tone: 'ok' | 'err' }) {
  return (
    <div
      role="status"
      data-testid="pmtool-toast"
      style={{
        position: 'fixed',
        top: 70,
        right: 24,
        zIndex: 9998,
        padding: '10px 16px',
        background: tone === 'ok' ? 'var(--color-status-success)' : 'var(--color-status-danger)',
        color: 'white',
        borderRadius: 6,
        fontSize: '13px',
        fontWeight: 500,
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        maxWidth: 360,
      }}
    >
      {message}
    </div>
  )
}

function CounterCell({
  label,
  value,
  color,
  testid,
  suffix,
}: {
  label: string
  value: number
  color: string
  testid: string
  suffix?: string
}) {
  return (
    <div
      style={{
        flex: 1,
        padding: '8px 18px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: '11.5px',
            color: 'var(--color-text-tertiary)',
            marginBottom: 2,
          }}
        >
          {label}
          {suffix && (
            <span style={{ marginLeft: 6, opacity: 0.7 }}>{suffix}</span>
          )}
        </div>
        <div
          data-testid={testid}
          style={{
            fontSize: '24px',
            fontWeight: 600,
            color,
            fontVariantNumeric: 'tabular-nums',
            lineHeight: 1,
          }}
        >
          {value}
        </div>
      </div>
    </div>
  )
}

// ============================================================
// 左列上半：日历看板（工作日 + 法定节假日特殊标记）
// ============================================================

interface DayCell {
  date: string
  day: number
  isCurrentMonth: boolean
  isToday: boolean
  type: 'workday' | 'weekend' | 'holiday' | 'adjusted-workday'
  label?: string
}

interface DayMeta {
  /** 该日期在 holidays 表里标记为 HOLIDAY 且 is_workday=0（法定节假日） */
  isHoliday: boolean
  /** 该日期在 holidays 表里标记为 WORKDAY_SHIFT 且 is_workday=1（调休上班） */
  isAdjusted: boolean
  /** 节假日 / 调休 显示名称 */
  name: string | null
}

function getDayMeta(date: string): DayMeta | null {
  const provider: HolidayProvider = defaultHolidayProvider
  const entry = provider.list().find((h) => h.date === date)
  if (entry) {
    return {
      isHoliday: entry.type === 'HOLIDAY' && entry.isWorkday === 0,
      isAdjusted: entry.type === 'WORKDAY_SHIFT' && entry.isWorkday === 1,
      name: entry.name,
    }
  }
  if (provider.list().length === 0) return null
  return {
    isHoliday: provider.isHoliday(date),
    isAdjusted: false, // 没在表里 → 不是调休
    name: null,
  }
}

function MonthCalendar({
  ready,
  selectedDate,
  onSelectDate,
  onJumpToToday,
  items,
}: {
  ready: boolean
  selectedDate: string
  onSelectDate: (date: string) => void
  onJumpToToday: (today: string) => void
  items: TodoCenterItem[]
}) {
  const today = useMemo(() => new Date(), [])
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())

  const days = useMemo<DayCell[]>(() => {
    return buildMonthGrid(year, month, today, ready)
  }, [year, month, today, ready])

  const monthLabel = `${year} 年 ${month + 1} 月`

  return (
    <div
      data-testid="home-month-calendar"
      style={{
        padding: '8px 12px 10px',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border-thin)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      <div
        style={{
          marginBottom: 10,
        }}
      >
        {/* 第一行：图标 + 标题（不再被 flex 压缩） */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 8,
          }}
        >
          <CalendarDays size={16} strokeWidth={1.75} color="var(--color-accent)" />
          <h2
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--color-text)',
              margin: 0,
              flex: 1,
            }}
          >
            工作日看板
          </h2>
        </div>
        {/* 第二行：月份切换 + 今天（独立行 · 避免压缩标题） */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 6,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              onClick={() => gotoMonth(year, month - 1, setYear, setMonth)}
              data-testid="cal-prev"
              style={calNavBtn}
              aria-label="上一月"
            >
              <ChevronLeft size={12} />
            </button>
            <span
              style={{
                fontSize: '12.5px',
                color: 'var(--color-text)',
                fontVariantNumeric: 'tabular-nums',
                minWidth: 84,
                textAlign: 'center',
              }}
            >
              {monthLabel}
            </span>
            <button
              onClick={() => gotoMonth(year, month + 1, setYear, setMonth)}
              data-testid="cal-next"
              style={calNavBtn}
              aria-label="下一月"
            >
              <ChevronRight size={12} />
            </button>
          </div>
          <button
            onClick={() => {
              setYear(today.getFullYear())
              setMonth(today.getMonth())
              // 维护者原话：「我点今天 · 不应该和我点击今天是一个效果吗？自动定位到今天，并且今日代办也同步展示今天的任务」
              // 同步把 selectedDate 跳到今天 · 触发下方"今日待办"重新过滤
              onJumpToToday(formatLocalDate(today))
            }}
            data-testid="cal-today"
            style={{
              ...calNavBtn,
              width: 'auto',
              padding: '3px 8px',
              color: 'var(--color-accent)',
            }}
          >
            今天
          </button>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontSize: '10px',
          color: 'var(--color-text-tertiary)',
          marginBottom: 6,
          flexWrap: 'wrap',
        }}
      >
        <LegendDot color="var(--color-text-secondary)" label="工作日" />
        <LegendDot color="var(--color-status-warning)" label="周末" />
        <LegendDot color="var(--color-status-danger)" label="法定节假日" />
        <LegendDot color="var(--color-accent)" label="补班" />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: 3,
          marginBottom: 3,
        }}
      >
        {['一', '二', '三', '四', '五', '六', '日'].map((w, i) => (
          <div
            key={w}
            style={{
              fontSize: '10px',
              color:
                i >= 5 ? 'var(--color-status-warning)' : 'var(--color-text-tertiary)',
              textAlign: 'center',
              padding: '2px 0',
              fontWeight: 500,
            }}
          >
            {w}
          </div>
        ))}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: 3,
        }}
      >
        {days.map((d, idx) => (
          <DayCellView
            key={`${d.date}-${idx}`}
            cell={d}
            isSelected={d.date === selectedDate}
            onClick={() => onSelectDate(d.date)}
            dotColor={dotColorFor(items, d.date)}
          />
        ))}
      </div>
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: 2,
          background: color,
        }}
      />
      {label}
    </span>
  )
}

const calNavBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 24,
  height: 24,
  background: 'var(--color-bg-subtle)',
  border: '1px solid var(--color-border-thin)',
  borderRadius: 'var(--radius)',
  color: 'var(--color-text-secondary)',
  cursor: 'pointer',
}

function gotoMonth(
  year: number,
  month: number,
  setYear: (y: number) => void,
  setMonth: (m: number) => void,
) {
  if (month < 0) {
    setYear(year - 1)
    setMonth(11)
  } else if (month > 11) {
    setYear(year + 1)
    setMonth(0)
  } else {
    setMonth(month)
  }
}

function DayCellView({
  cell,
  isSelected,
  onClick,
  dotColor,
}: {
  cell: DayCell
  isSelected: boolean
  onClick: () => void
  /** 待办小点颜色（#10B981=有未完成 / #9CA3AF=全部完成）· null=无待办 */
  dotColor?: string | null
}) {
  if (!cell.isCurrentMonth) {
    return <div style={{ minHeight: 30 }} />
  }
  const color =
    cell.type === 'holiday'
      ? 'var(--color-status-danger)'
      : cell.type === 'weekend'
        ? 'var(--color-status-warning)'
        : cell.type === 'adjusted-workday'
          ? 'var(--color-accent)'
          : 'var(--color-text)'
  // 维护者要的「日历点击联动」· 点击日格 → selectedDate 变化
  // 视觉：
  //   - today  + selected = 实心 accent
  //   - today  + 未选     = accent border（半透明）
  //   - 非 today + selected = 实心 accent
  //   - 非 today + 未选     = 默认
  const isTodayAndSelected = cell.isToday && isSelected
  const isSelectedNotToday = isSelected && !cell.isToday
  const isTodayNotSelected = cell.isToday && !isSelected
  return (
    <button
      type="button"
      data-testid={`cal-day-${cell.date}`}
      data-selected={isSelected}
      onClick={onClick}
      style={{
        position: 'relative',
        minHeight: 30,
        padding: 3,
        cursor: 'pointer',
        background: isSelected
          ? 'var(--color-accent)'
          : cell.isToday
            ? 'var(--color-accent-subtle)'
            : 'var(--color-bg-subtle)',
        border: isSelected
          ? '1px solid var(--color-accent)'
          : cell.isToday
            ? '1px solid var(--color-accent)'
            : '1px solid transparent',
        borderRadius: 'var(--radius)',
        display: 'flex',
        flexDirection: 'column',
        color: isSelected ? 'var(--color-text-on-accent)' : color,
        fontFamily: 'inherit',
        paddingTop: 3,
        paddingRight: 3,
        paddingBottom: 3,
        paddingLeft: 3,
      }}
    >
      <div
        style={{
          fontSize: '11px',
          fontWeight: cell.isToday || isSelected ? 600 : 400,
          color: 'inherit',
          fontVariantNumeric: 'tabular-nums',
          lineHeight: 1.1,
        }}
      >
        {cell.day}
      </div>
      {/* 待办小点：有未完成=绿 / 全部完成=灰 */}
      {dotColor && (
        <div
          data-testid={`cal-dot-${cell.date}`}
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: dotColor,
            marginTop: 'auto',
            alignSelf: 'center',
            flexShrink: 0,
          }}
        />
      )}
      {cell.label && (
        <div
          style={{
            fontSize: '9px',
            color: isSelected
              ? 'inherit'
              : cell.type === 'holiday'
                ? 'var(--color-status-danger)'
                : 'var(--color-accent)',
            marginTop: 'auto',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {cell.label}
        </div>
      )}
      {/* 引用以避免 lint 警告（之前用的未用变量） */}
      <span style={{ display: 'none' }}>
        {void isTodayAndSelected}
        {void isTodayNotSelected}
        {void isSelectedNotToday}
      </span>
    </button>
  )
}

function buildMonthGrid(
  year: number,
  month: number,
  today: Date,
  _ready: boolean,
): DayCell[] {
  const firstDay = new Date(year, month, 1)
  const firstWeekday = (firstDay.getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const todayLocal = formatLocalDate(today)

  const cells: DayCell[] = []
  for (let i = 0; i < firstWeekday; i++) {
    cells.push({
      date: '',
      day: 0,
      isCurrentMonth: false,
      isToday: false,
      type: 'workday',
    })
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const wd = new Date(dateStr + 'T00:00:00').getDay()
    const isWeekend = wd === 0 || wd === 6
    const { type, label } = classifyDay(dateStr, isWeekend)
    cells.push({
      date: dateStr,
      day: d,
      isCurrentMonth: true,
      isToday: dateStr === todayLocal,
      type,
      label,
    })
  }
  while (cells.length < 42) {
    cells.push({
      date: '',
      day: 0,
      isCurrentMonth: false,
      isToday: false,
      type: 'workday',
    })
  }
  return cells
}

function classifyDay(
  dateLocal: string,
  isWeekend: boolean,
): { type: DayCell['type']; label?: string } {
  const meta = getDayMeta(dateLocal)
  if (meta) {
    if (meta.isHoliday) return { type: 'holiday', label: meta.name ?? '放假' }
    // isAdjusted=true 表示 holidays 表明确标记为调休工作日
    if (meta.isAdjusted) return { type: 'adjusted-workday', label: '补班' }
  }
  if (isWeekend) return { type: 'weekend' }
  return { type: 'workday' }
}

/**
 * 计算某天的待办小点颜色
 * @param items 所有待办列表
 * @param date 日期字符串 YYYY-MM-DD
 * @returns 有未完成=#10B981 绿点 / 全部完成=#9CA3AF 灰点 / 无待办=null
 */
function dotColorFor(items: TodoCenterItem[], date: string): string | null {
  if (!date) return null
  const dayItems = items.filter((t) => itemInDay(t, date))
  if (dayItems.length === 0) return null
  const hasPending = dayItems.some((t) => t.status !== 'COMPLETED')
  return hasPending ? '#10B981' : '#9CA3AF'
}

// ============================================================
// 左列下半：今日待办（todo checkbox 列表 · 来自 todos 表）
// ============================================================

function TodayTodosCard({
  items,
  date,
  isToday,
  onAfterChange,
  mentionProjects,
}: {
  items: TodoCenterItem[]
  date: string
  isToday: boolean
  /** 任何操作完成后回调（用于父组件 refresh 数据）*/
  onAfterChange: () => void
  /** 维护者 2026-08-25 后续：快速添加 todo 用的项目列表 */
  mentionProjects: MentionOption[]
}) {
  const [quickDraft, setQuickDraft] = useState('')
  const [pendingMention, setPendingMention] = useState<MentionOption | null>(null)
  const [quickSubmitting, setQuickSubmitting] = useState(false)

  /**
   * 维护者 2026-08-25 后续：左下角"今日待办"加快速添加
   *  - due_date 固定为当前 date（卡片显示的日期 · 非 selectedDate）
   *  - 选中项目 → 写入 project_id + mentions + title 自动加 @项目名
   *  - 回车提交 · 提交后清空 input
   */
  const handleQuickAdd = async () => {
    const title = quickDraft.trim()
    if (!title || quickSubmitting) return
    setQuickSubmitting(true)
    try {
      const proj = pendingMention
      let finalTitle = title
      if (proj && !title.includes('@' + proj.name)) {
        finalTitle = `${title} @${proj.name}`
      }
      await createTodo({
        title: finalTitle,
        priority: 'NORMAL',
        sourceType: 'MANUAL',
        startDate: null,
        dueDate: date, // 当前卡片日期（非 selectedDate · 避免日历选日期后误加到选中日）
        remindTime: null,
        projectId: proj?.id ?? null,
        mentions: proj ? JSON.stringify([proj.id]) : null,
      })
      setQuickDraft('')
      setPendingMention(null)
      onAfterChange()
    } catch (err) {
      console.error('快速添加失败', err)
    } finally {
      setQuickSubmitting(false)
    }
  }
  const handleToggle = async (item: TodoCenterItem) => {
    // 已办反悔保护（维护者 2026-08-28 修正）：
    //   - 所有来源（TODO/PROJECT_TASK/WEEKLY_NEXT/RECURRING）统一逻辑
    //   - TODO/RECURRING：有 completed_at（本地日期）→ 检查并拦截
    //   - PROJECT_TASK/WEEKLY_NEXT：无 completed_at（updated_at 是 UTC）→ 不做反悔保护，允许随时取消
    //   - completed_at < 今天 → 不允许取消（拦截 + 明确提示）
    //   - completed_at >= 今天 / null → 允许取消（当天判断允许修正 / 异常数据容错）
    console.log('[HomePage handleToggle]', {
      id: item.id,
      source: item.source,
      status: item.status,
      completed_at: item.completed_at,
    })

    if ((item.source === 'TODO' || item.source === 'RECURRING') && item.status === 'COMPLETED' && item.completed_at) {
      const completedDay = extractLocalDate(item.completed_at)
      const todayStr = formatLocalDate(new Date())
      console.log('[HomePage anti-regret check]', { completedDay, todayStr })
      if (completedDay && completedDay < todayStr) {
        // 明确告诉用户为什么不能取消
        alert(`❌ 该任务已于 ${completedDay} 完成\n\n根据规则「已完成的事不能反悔」，今天之前完成的待办不允许取消勾选。\n\n如需修改，请删除该任务后重新添加。`)
        return
      }
    }
    try {
      // 按来源回写（Todo → complete/uncomplete · 项目任务 → status/progress · 周报 → is_completed）
      // 并同步主工作区「今日工作内容」（完成 append · 取消 remove）
      await toggleTodoCenterItem(item)
      onAfterChange()
    } catch (err) {
      console.error('完成/取消完成失败', err)
    }
  }
  const monthDay = date.slice(5) // MM-DD
  return (
    <div
      data-testid="home-today-todos"
      style={{
        padding: '8px 12px 10px',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border-thin)',
        borderRadius: 'var(--radius-md)',
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 6,
          flexShrink: 0,
        }}
      >
        <ListTodo size={13} strokeWidth={1.75} color="var(--color-accent)" />
        <h3
          style={{
            fontSize: '12.5px',
            fontWeight: 600,
            color: 'var(--color-text)',
            margin: 0,
            flex: 1,
          }}
        >
          {isToday ? '今日待办' : `${monthDay} 待办`}
        </h3>
        <span
          style={{
            fontSize: '10.5px',
            color: 'var(--color-text-tertiary)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {items.length} 项
        </span>
      </div>

      {/* 维护者 2026-08-25 后续：左下角快速添加 todo（卡片 date 为 due_date · 非日历选中日） */}
      <div
        data-testid="home-quick-add-form"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 8px',
          marginBottom: 6,
          border: '1px solid var(--color-border-thin)',
          borderRadius: 'var(--radius)',
          background: 'var(--color-bg-subtle)',
          flexShrink: 0,
        }}
      >
        <Plus size={12} strokeWidth={2} color="var(--color-text-tertiary)" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <MentionTextarea
            value={quickDraft}
            onChange={setQuickDraft}
            projects={mentionProjects}
            placeholder={isToday ? '快速添加 · 输入 @ 选项目 · 回车保存' : '快速添加 · 回车保存'}
            testid="home-quick-add-input"
            rows={1}
            autoBullet={false}
            onEnter={() => void handleQuickAdd()}
            onMention={setPendingMention}
            textareaStyle={{
              padding: '1px 0',
              background: 'transparent',
              border: 'none',
              fontSize: '11.5px',
              minHeight: 18,
              resize: 'none',
              lineHeight: 1.4,
              fontFamily: 'inherit',
            }}
          />
        </div>
        <button
          type="button"
          data-testid="home-quick-add-submit"
          onClick={() => void handleQuickAdd()}
          disabled={!quickDraft.trim() || quickSubmitting}
          title="保存"
          style={{
            background:
              quickDraft.trim() && !quickSubmitting
                ? 'var(--color-accent)'
                : 'var(--color-bg-muted)',
            color:
              quickDraft.trim() && !quickSubmitting
                ? 'var(--color-text-on-accent)'
                : 'var(--color-text-tertiary)',
            border: 'none',
            borderRadius: 'var(--radius)',
            padding: '2px 6px',
            cursor: quickDraft.trim() && !quickSubmitting ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <Send size={10} strokeWidth={2} />
        </button>
      </div>

      {items.length === 0 ? (
        <div
          style={{
            padding: '12px 0',
            textAlign: 'center',
            fontSize: '11.5px',
            color: 'var(--color-text-tertiary)',
          }}
        >
          {isToday ? '今日没有待办 · 去「任务中心」添加' : `${monthDay} 没有待办`}
        </div>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            overflowY: 'auto',
            flex: 1,
            minHeight: 0,
          }}
        >
          {items.map((t) => {
            const done = t.status === 'COMPLETED' || t.status === 'DELAYED'
            return (
              <li
                key={t.id}
                data-testid={`today-todo-${t.id}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: 0,
                  borderBottom: '1px solid var(--color-border-thin)',
                  listStyle: 'none',
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    // eslint-disable-next-line no-console
                    console.log('[PMTool handleToggle]', t.id, t.status, '→',
                      done ? 'PENDING' : 'COMPLETED')
                    void handleToggle(t)
                  }}
                  data-testid={`today-todo-btn-${t.id}`}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 0',
                    background: 'transparent',
                    border: 'none',
                    color: 'inherit',
                    textAlign: 'left',
                    fontFamily: 'inherit',
                    fontSize: '13px',
                    cursor: 'pointer',
                    opacity: done ? 0.7 : 1,
                  }}
                >
                  {done ? (
                    <CheckCircle2
                      size={15}
                      strokeWidth={1.75}
                      color="var(--color-status-success)"
                    />
                  ) : (
                    <Circle size={15} strokeWidth={1.5} color="var(--color-text-tertiary)" />
                  )}
                  <span
                    style={{
                      flex: 1,
                      color: 'var(--color-text)',
                      textDecoration: done ? 'line-through' : 'none',
                    }}
                  >
                    {t.title}
                    {/* 维护者 2026-08-28：项目/周报同步任务 · 标题后自动 @ 项目名称（与待办中心一致） */}
                    {(t.source === 'PROJECT_TASK' || t.source === 'WEEKLY_NEXT') && t.projectName && (
                      <span
                        style={{
                          color: 'var(--color-accent)',
                          fontWeight: 500,
                          marginLeft: 4,
                        }}
                      >
                        @{t.projectName}
                      </span>
                    )}
                  </span>
                  {t.priority === 'URGENT' && (
                    <span
                      style={{
                        fontSize: '10px',
                        color: 'var(--color-status-danger)',
                        fontWeight: 500,
                      }}
                    >
                      紧急
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ============================================================
// 右列：今日工作内容 / 下个工作日计划
// 两者都用单一 textarea 实现（所见即所得 · 维护者要的"输入框形式"）
// 数据：localStorage 持久化（pmtool.home.workNotes）
// 代办点击完成时自动 append 一行到「今日工作内容」
// ============================================================

const WORK_NOTES_KEY = 'pmtool.home.workNotes'
const WORKNOTES_EVENT = 'pmtool.home.worknotes.changed'

interface WorkNotes {
  today: string
  todayContent: string // 一段文本 · 一行一条
  nextWorkday: string
  nextContent: string
}

// 2026-09-08 · 规范化今日/下周内容：删除孤立「·」行、裸文本行补「· 」前缀、清空行
function normalizeContentText(txt: string): string {
  if (!txt) return ''
  return txt
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '' && l !== '·')        // 去掉空行 + 孤立圆点行
    .map((l) => (l.startsWith('· ') ? l : `· ${l}`)) // 裸文本补前缀
    .join('\n')
}

function loadNotes(): WorkNotes {
  const today = formatLocalDate(new Date())
  try {
    const raw = localStorage.getItem(WORK_NOTES_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as any
      // 兼容上一版（items 数组 → content 字符串）
      if (Array.isArray(parsed.todayItems)) {
        parsed.todayContent = parsed.todayItems.join('\n')
        delete parsed.todayItems
      }
      if (Array.isArray(parsed.nextItems)) {
        parsed.nextContent = parsed.nextItems.join('\n')
        delete parsed.nextItems
      }
      if (parsed.today === today) {
        parsed.todayContent = normalizeContentText(parsed.todayContent)
        parsed.nextContent = normalizeContentText(parsed.nextContent)
        return parsed as WorkNotes
      }
    }
  } catch {
    // ignore
  }
  return { today, todayContent: '', nextWorkday: '', nextContent: '' }
}

function saveNotes(n: WorkNotes) {
  try {
    localStorage.setItem(WORK_NOTES_KEY, JSON.stringify(n))
  } catch {
    // ignore quota
  }
  // 2026-09-08 · 异步落库（主存储 → SQLite）· localStorage 仅作本地回显缓存
  saveWorkNote(n.today, normalizeContentText(n.todayContent), n.nextWorkday, normalizeContentText(n.nextContent)).catch(() => {
    /* 静默：后端失败不影响本地回显 */
  })
}

/**
 * 追加一条到「今日工作内容」
 *  - 自动补 "· " 无序符号（维护者要求）
 *  - 用于代办完成时自动记录
 *  - 同一天内同一条目不会重复追加
 *  - 触发事件通知相关组件刷新
 */
export function appendToTodayWorkNote(entry: string) {
  const today = formatLocalDate(new Date())
  let notes: WorkNotes
  try {
    const raw = localStorage.getItem(WORK_NOTES_KEY)
    notes = raw ? JSON.parse(raw) : null
    if (!notes || notes.today !== today) {
      notes = { today, todayContent: '', nextWorkday: '', nextContent: '' }
    }
    // 兼容上一版 schema（items 数组 → content 字符串）
    if (Array.isArray((notes as any).todayItems)) {
      notes.todayContent = (notes as any).todayItems.join('\n')
      delete (notes as any).todayItems
    }
  } catch {
    notes = { today, todayContent: '', nextWorkday: '', nextContent: '' }
  }
  // 2026-09-08：恢复自动加 "· " 前缀（完成待办自动追加的条目要带圆点列表符号）
  // 修正：之前 2026-09-07 去掉前缀+strip 已有 ·，导致出现孤立的「·」行、裸文本混乱
  const trimmed = entry.replace(/^·\s*/, '').trim()
  const line = `· ${trimmed}`
  // 按完整行（含前缀）去重 · 追加
  const lines = notes.todayContent ? notes.todayContent.split('\n') : []
  if (!lines.includes(line)) {
    notes.todayContent = lines.length
      ? `${lines.join('\n')}\n${line}`
      : line
  }
  try {
    localStorage.setItem(WORK_NOTES_KEY, JSON.stringify(notes))
  } catch {
    // ignore
  }
  // 2026-09-08 · 同步落库（待办完成自动 append 也要持久化，否则重启丢失「测试111」类记录）
  saveWorkNote(notes.today, normalizeContentText(notes.todayContent), notes.nextWorkday, normalizeContentText(notes.nextContent)).catch(() => {})
  window.dispatchEvent(new CustomEvent(WORKNOTES_EVENT))
}

/**
 * 从「今日工作内容」删除含指定 marker 的行
 *  - 用于代办取消完成时同步删掉之前自动 append 的那行
 *  - 匹配规则：任何包含 `marker` 的行都删（容忍用户编辑过的内容）
 *  - 同一天内操作 · 跨日不删
 */
export function removeFromTodayWorkNote(marker: string) {
  const today = formatLocalDate(new Date())
  let notes: WorkNotes
  try {
    const raw = localStorage.getItem(WORK_NOTES_KEY)
    notes = raw ? JSON.parse(raw) : null
    if (!notes || notes.today !== today) return
    if (Array.isArray((notes as any).todayItems)) {
      notes.todayContent = (notes as any).todayItems.join('\n')
      delete (notes as any).todayItems
    }
  } catch {
    return
  }
  const before = notes.todayContent
  const filtered = before
    .split('\n')
    .filter((line) => !line.includes(marker))
    .join('\n')
  if (filtered === before) return // 没找到就不写
  notes.todayContent = filtered
  try {
    localStorage.setItem(WORK_NOTES_KEY, JSON.stringify(notes))
  } catch {
    // ignore
  }
  // 2026-09-08 · 同步落库（取消待办完成删行也要持久化）
  saveWorkNote(notes.today, normalizeContentText(notes.todayContent), notes.nextWorkday, normalizeContentText(notes.nextContent)).catch(() => {})
  window.dispatchEvent(new CustomEvent(WORKNOTES_EVENT))
}

function TodayWorkCard({ projects }: { projects: MentionOption[] }) {
  const [notes, setNotes] = useState<WorkNotes>(() => loadNotes())
  // 2026-09-08 · 挂载时从后端拉取，覆盖 localStorage 缓存（主存储在后端）
  useEffect(() => {
    const today = formatLocalDate(new Date())
    getWorkNote(today)
      .then((saved) => {
        if (saved && saved.note_date === today) {
          setNotes({
            today,
            todayContent: saved.today_content,
            nextWorkday: saved.next_workday,
            nextContent: saved.next_content,
          })
        }
      })
      .catch(() => {})
  }, [])
  // 监听 worknotes 事件 · 当外部（如 appendToTodayWorkNote）写入时自动刷新
  useEffect(() => {
    const handler = () => setNotes(loadNotes())
    window.addEventListener(WORKNOTES_EVENT, handler)
    return () => window.removeEventListener(WORKNOTES_EVENT, handler)
  }, [])
  const update = (content: string) => {
    const next = { ...notes, today: formatLocalDate(new Date()), todayContent: content }
    setNotes(next)
    saveNotes(next)
  }
  return (
    <NoteCard
      Icon={PenLine}
      iconColor="var(--color-accent)"
      title="今日工作内容"
      placeholder="今天做了什么 · 一行一条 · 完成的待办会自动追加 · 输入 @ 选择项目"
      value={notes.todayContent}
      onChange={update}
      projects={projects}
      testid="today-work"
      flex={1}
      maxTitle={`今日工作内容 · ${formatLocalDate(new Date())}`}
    />
  )
}

function NextWorkdayCard({
  nextWorkday,
  nextWorkdayTodos,
}: {
  nextWorkday: string
  nextWorkdayTodos: TodoCenterItem[]
}) {
  // 维护者 2026-08-25：只读 · 不再手写 · 自动读下一工作日 todos · 格式统一
  // 卡片视觉：和 TodayWorkCard / 今日待办一致（圆角 surface · header + 列表）
  return (
    <div
      data-testid="next-workday-plan"
      style={{
        padding: '10px 14px 12px',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border-thin)',
        borderRadius: 'var(--radius-md)',
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 8,
          flexShrink: 0,
        }}
      >
        <CalendarCheck size={13} strokeWidth={1.75} color="var(--color-status-success)" />
        <h3
          style={{
            fontSize: '12.5px',
            fontWeight: 600,
            color: 'var(--color-text)',
            margin: 0,
            flex: 1,
          }}
        >
          下个工作日计划
        </h3>
        <span
          style={{
            fontSize: '10.5px',
            color: 'var(--color-text-tertiary)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {nextWorkday} · {nextWorkdayTodos.length} 项
        </span>
      </div>

      {nextWorkdayTodos.length === 0 ? (
        <div
          style={{
            padding: '16px 0',
            textAlign: 'center',
            fontSize: '11.5px',
            color: 'var(--color-text-tertiary)',
          }}
        >
          {nextWorkday} 暂无待办自动带入
        </div>
      ) : (
        <ul
          data-testid="next-workday-todos"
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            overflowY: 'auto',
            flex: 1,
            minHeight: 0,
          }}
        >
          {nextWorkdayTodos.map((t) => {
            // 维护者 2026-08-28：title 不含 @项目名 · 这里按来源补上 @项目名后缀（与今日待办/待办中心一致）
            return (
              <li
                key={t.id}
                style={{
                  fontSize: '13px',
                  color: 'var(--color-text)',
                  padding: '6px 0',
                  borderBottom: '1px solid var(--color-border-thin)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                {/* 维护者 2026-08-25：去掉 checkbox 圆圈（只读不可点 · 没必要占位） */}
                {/* 优先级点 */}
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background:
                      t.priority === 'URGENT'
                        ? 'var(--color-status-danger)'
                        : t.priority === 'HIGH'
                          ? '#d97706'
                          : 'var(--color-text-tertiary)',
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {t.title}
                  {(t.source === 'PROJECT_TASK' || t.source === 'WEEKLY_NEXT') && t.projectName && (
                    <span style={{ color: 'var(--color-text-tertiary)' }}> @{t.projectName}</span>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/**
 * 单一 textarea 笔记卡片（所见即所得 · 维护者要的"输入框形式"）
 *  · 用户输入什么就显示什么（没有预览层）
 *  · 一行一条记录 · 完成的待办会自动 append 到「今日工作内容」
 *  · MentionTextarea 自动以 "· " 开头 · Enter 续行 + 输入 @ 弹项目下拉
 */
function NoteCard({
  Icon,
  iconColor,
  title,
  value,
  onChange,
  projects,
  testid,
  placeholder,
  flex,
  topSlot,
  maxTitle,
}: {
  Icon: LucideIcon
  iconColor: string
  title: string
  value: string
  onChange: (v: string) => void
  projects: MentionOption[]
  testid: string
  placeholder: string
  /** flex 值：1 表示占满剩余空间（带内部滚动）；0 或 undefined 表示自然高度 */
  flex?: number
  /** 维护者 2026-08-25 后续：顶部嵌入内容（如自动带入的下个工作日 todo 列表）*/
  topSlot?: React.ReactNode
  /** 维护者 2026-09-01：最大化时浮窗标题（默认与 title 相同）*/
  maxTitle?: string
}) {
  const lineCount = value.split('\n').filter((l) => l.trim()).length
  const [maximized, setMaximized] = useState(false)

  // ESC 退出最大化
  useEffect(() => {
    if (!maximized) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMaximized(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [maximized])

  const cardStyle: React.CSSProperties = maximized
    ? {
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'var(--color-surface)',
        border: 'none',
        borderRadius: 0,
        boxShadow: 'none',
        padding: '14px 18px 16px',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        width: '100vw',
        height: '100vh',
      }
    : {
        padding: '8px 12px 10px',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border-thin)',
        borderRadius: 'var(--radius-md)',
        flex,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }

  const card = (
    <div
      data-testid={testid}
      style={cardStyle}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 6,
          flexShrink: 0,
        }}
      >
        <Icon size={maximized ? 16 : 13} strokeWidth={1.75} color={iconColor} />
        <h3
          style={{
            fontSize: maximized ? 16 : '12.5px',
            fontWeight: 600,
            color: 'var(--color-text)',
            margin: 0,
            flex: 1,
          }}
        >
          {maximized ? (maxTitle ?? title) : title}
        </h3>
        {!maximized && (
          <span
            style={{
              fontSize: '10.5px',
              color: 'var(--color-text-tertiary)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {lineCount > 0 ? `${lineCount} 条` : '尚未记录'}
          </span>
        )}
        <button
          type="button"
          onClick={() => setMaximized((m) => !m)}
          title={maximized ? '还原（Esc）' : '最大化'}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 10px',
            border: '1px solid var(--color-border-thin)',
            background: 'var(--color-bg-subtle)',
            color: 'var(--color-text-secondary)',
            borderRadius: 6,
            cursor: 'pointer',
            flexShrink: 0,
            fontSize: 11,
            fontFamily: 'inherit',
          }}
        >
          {maximized ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
          {maximized ? '还原' : '最大化'}
        </button>
      </div>

      {/* 维护者 2026-08-25 后续：顶部嵌入（如自动带入的下个工作日 todo 列表）*/}
      {topSlot}

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <MentionTextarea
          value={value}
          onChange={onChange}
          projects={projects}
          placeholder={placeholder}
          testid={testid ? `${testid}-textarea` : undefined}
          textareaStyle={{
            flex: 1,
            minHeight: 0,
            resize: 'none',
          }}
        />
      </div>
    </div>
  )

  return card
}

function computeNextWorkday(): string {
  const cur = new Date()
  const provider: HolidayProvider = defaultHolidayProvider
  for (let i = 1; i <= 14; i++) {
    const d = new Date(cur)
    d.setDate(cur.getDate() + i)
    const local = formatLocalDate(d)
    if (provider.isWorkday(local)) {
      return local
    }
  }
  // 兜底：超过 14 天还没到 → 明天
  const t = new Date()
  t.setDate(t.getDate() + 1)
  return formatLocalDate(t)
}