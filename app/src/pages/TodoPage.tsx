/**
 * PMTool V2.0 · 任务中心
 * Phase A 产品结构纠偏（2026-08-24 · 维护者拍板）+ 2026-08-25 整改
 *
 * 2026-08-25 维护者整改需求：
 *   1. 整个页面无整体滚动条 · 单模块不够放时单模块内部滚动
 *   2. 日视图"今日" = 主工作区 todos 一致（同数据源 + 同过滤）
 *      周视图 = 当前一周所有代办累加（start_date 或 due_date 命中周范围）
 *   3. 任务分两块：
 *      - 手动添加（@ 选项目 或 直接输入）
 *      - 项目计划带入（项目内加入代办时自动 @项目名 · 视觉上显示"项目"标签）
 *   4. 右上角快速添加时可选添加日期（默认当天）
 *   5. 点击完成 = 主工作区效果（当天点的自动 append 到 worknote · 取消勾选同步删）
 *   6. 月视图：完全不同的布局
 *      - 左：日历（复用主工作区工作日看板逻辑 · 去掉"工作日看板"标题）
 *      - 右：点击日历某天 → 显示该天 todos（默认当天）
 *
 * 严格遵守：不动 HomePage（已确认模块） · 复用其 appendToTodayWorkNote / removeFromTodayWorkNote
 */

import { useEffect, useMemo, useState } from 'react'
import {
  CalendarDays,
  CalendarRange,
  CalendarClock,
  Calendar,
  Plus,
  CheckCircle2,
  Circle,
  Trash2,
  Send,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  FolderKanban,
  ListTodo,
  SkipForward,
  Pencil,
  Link2,
  ExternalLink,
} from 'lucide-react'
import {
  loadDayView,
  loadWeekView,
  loadMonthView,
  createTodo,
  deleteTodo,
  updateTodo,
  postponeOverdueTodos,
  type DayViewItem,
} from '@/services/todo'
import type { Todo } from '@/database/api'
import {
  defaultHolidayProvider,
  loadHolidayProvider,
  type HolidayProvider,
} from '@/services/holidayProvider'
import { formatLocalDate, extractLocalDate } from '@/services/datetime'
import {
  MentionTextarea,
  type MentionOption,
} from '@/components/MentionTextarea'
import { DatePicker } from '@/components/DatePicker'
// 维护者 2026-08-27：待办中心动态聚合（普通 Todo + 项目任务 + 周报下周计划）
// 完成/取消完成回写各来源表 + 同步主工作区 worknote，都在 todoCenter 内处理
import {
  loadTodoCenterItems,
  toggleTodoCenterItem,
  itemInDay,
  itemOverlapsRange,
  type TodoCenterItem,
} from '@/services/todoCenter'
// 维护者 2026-08-28：周期性任务同步（生成周期日待办）
import { syncRecurringTodos } from '@/services/recurringTasks'
// 维护者 2026-08-28：周期性任务管理（任务中心内嵌 · 不走独立路由）
import TaskCenterPage from '@/pages/TaskCenterPage'

type ViewKey = 'day' | 'week' | 'month'

interface ViewDef {
  key: ViewKey
  label: string
  Icon: typeof CalendarDays
}

const VIEWS: ViewDef[] = [
  { key: 'day', label: '日视图', Icon: CalendarDays },
  { key: 'week', label: '周视图', Icon: CalendarRange },
  { key: 'month', label: '月视图', Icon: CalendarClock },
]

interface DayColumn {
  title: string
  subtitle: string
  range: { start: string; end: string }
  Icon: typeof ChevronLeft
  date: string
}

export function TodoPage() {
  const [view, setView] = useState<ViewKey>('day')
  const [holidayReady, setHolidayReady] = useState(false)
  // day/week 的 anchor（day=当天，week=当周周一）；month 用 selectedDate 驱动
  const [anchor, setAnchor] = useState<string>(() => formatLocalDate(new Date()))
  // month 视图专用：点日历某天 → 右侧显示该天
  const [monthSelectedDate, setMonthSelectedDate] = useState<string>(() =>
    formatLocalDate(new Date()),
  )
  // 维护者 2026-08-27：顶部时间段弹窗开关（周=日历；月=年月选择器）
  const [openWeekPicker, setOpenWeekPicker] = useState(false)
  const [openMonthPicker, setOpenMonthPicker] = useState(false)
  // 月视图面板当前显示的 年-月（供年月选择器初始值跟随面板）
  const [panelYM, setPanelYM] = useState<{ y: number; m: number } | null>(null)
  // 弹窗跟随按钮定位（记录触发按钮的屏幕坐标）
  const [pickWeekPos, setPickWeekPos] = useState<{ top: number; left: number } | null>(null)
  const [pickMonthPos, setPickMonthPos] = useState<{ top: number; left: number } | null>(null)
  const [allItems, setAllItems] = useState<TodoCenterItem[]>([])
  // 维护者 2026-08-28：周期性任务管理面板开关（任务中心内嵌）
  const [showRecurringMgr, setShowRecurringMgr] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  // 维护者 2026-08-25 后续：编辑态可改 title + priority + dueDate + projectId
  const [editDraft, setEditDraft] = useState<{
    title: string
    priority: Todo['priority']
    dueDate: string
    projectId: number | null
  } | null>(null)
  const [quickDraft, setQuickDraft] = useState('')
  const [quickSubmitting, setQuickSubmitting] = useState(false)
  // 快速添加日期（默认当天 · 可改）
  const [quickDate, setQuickDate] = useState<string>(() =>
    formatLocalDate(new Date()),
  )
  // @ 项目下拉 + 最近一次提到的项目
  const [mentionProjects, setMentionProjects] = useState<MentionOption[]>([])
  const [pendingMention, setPendingMention] = useState<MentionOption | null>(null)
  const [projectsMap, setProjectsMap] = useState<Record<number, string>>({})
  // 维护者 2026-08-25：顺延按钮 + toast 反馈
  const [postponeBusy, setPostponeBusy] = useState(false)
  const [toast, setToast] = useState<{ show: boolean; msg: string; tone: 'ok' | 'err' }>(
    { show: false, msg: '', tone: 'ok' },
  )
  const showToast = (msg: string, tone: 'ok' | 'err' = 'ok') => {
    setToast({ show: true, msg, tone })
    setTimeout(() => setToast((t) => ({ ...t, show: false })), 3000)
  }

  const reload = async () => {
    setLoading(true)
    setError(null)
    try {
      // 维护者 2026-08-28: 周期性任务同步（把周期日生成待办写入 todos 表）
      await syncRecurringTodos()
      const { items, projectsMap } = await loadTodoCenterItems()
      setAllItems(items)
      const projects = Object.keys(projectsMap).map((k) => ({ id: Number(k), name: projectsMap[Number(k)] }))
      setMentionProjects(projects)
      setProjectsMap(projectsMap)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void (async () => {
      try {
        await loadHolidayProvider()
        setHolidayReady(true)
      } catch {
        setHolidayReady(true)
      }
      await reload()
    })()
  }, [])

  const columns = useMemo<DayColumn[]>(() => {
    return buildColumns(view, anchor)
  }, [view, anchor])

  // 维护者 2026-08-25 后续：删掉 viewDays state（之前是给 DayStrip 用的 · DayStrip 已删）
  // 保留 setViewDays 调用点便于以后恢复 · 实际不再消费
  const [, setViewDays] = useState<DayViewItem[]>([])
  useEffect(() => {
    void (async () => {
      try {
        let days: DayViewItem[] = []
        if (view === 'day') {
          const r = await loadDayView(anchor)
          days = r.days
        } else if (view === 'week') {
          const r = await loadWeekView(anchor)
          days = r.days
        } else {
          const r = await loadMonthView(anchor.slice(0, 7))
          days = r.days
        }
        setViewDays(days)
      } catch (e) {
        console.error('加载视图失败', e)
        setViewDays([])
      }
    })()
  }, [view, anchor])

  // 日/周视图按列过滤待办
  const grouped = useMemo(() => {
    const result: Record<string, TodoCenterItem[]> = {}
    for (const col of columns) {
      result[col.title] = filterTodos(allItems, col, view)
    }
    return result
  }, [allItems, columns, view])

  // 月视图右侧待办：按 monthSelectedDate 过滤（项目/周报任务=时间段命中该日）
  const monthSelectedTodos = useMemo(() => {
    return allItems
      .filter((t) => itemInDay(t, monthSelectedDate))
      .sort(todoSortFn)
  }, [allItems, monthSelectedDate])

  const handleQuickAdd = async () => {
    const title = quickDraft.trim()
    if (!title || quickSubmitting) return
    setQuickSubmitting(true)
    try {
      await createTodo({
        title,
        priority: 'NORMAL',
        sourceType: 'MANUAL',
        startDate: null,
        dueDate: quickDate, // 维护者 2026-08-25：可选日期（默认当天）
        remindTime: null,
        projectId: pendingMention?.id ?? null,
        mentions: pendingMention ? JSON.stringify([pendingMention.id]) : null,
      })
      setQuickDraft('')
      setPendingMention(null)
      // 不重置 quickDate（保留用户选择）
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setQuickSubmitting(false)
    }
  }

  /**
   * 完成/取消完成 · 同步主工作区 worknote
   * 维护者 2026-08-25：「当天点的」（= 点击动作发生在今天）就同步
   * 不论 due_date 是哪天（即使任务在下个工作日）· 只要今天是点击动作发生日就同步
   * 维护者 2026-08-25：只有"未完成 / 已完成"两态 · 去掉 overdue 红点
   * 维护者 2026-08-28：今天之前已办不允许取消勾选（已完成的事不能反悔）
   *   - TODO/RECURRING：有 completed_at（本地日期）→ 检查并拦截
   *   - PROJECT_TASK/WEEKLY_NEXT：无 completed_at（updated_at 是 UTC）→ 不做反悔保护，允许随时取消
   */
  const handleToggle = async (item: TodoCenterItem) => {
    // 已办反悔保护：仅对 TODO/RECURRING 类型检查 completed_at
    console.log('=== [TodoPage handleToggle START] ===')
    console.log('item:', JSON.stringify(item, null, 2))
    console.log('item.source:', item.source)
    console.log('item.status:', item.status)
    console.log('item.completed_at:', item.completed_at)
    console.log('=== [TodoPage handleToggle END] ===')

    const isTodoOrRecurring = item.source === 'TODO' || item.source === 'RECURRING'
    console.log('isTodoOrRecurring:', isTodoOrRecurring)

    if (isTodoOrRecurring && item.status === 'COMPLETED' && item.completed_at) {
      console.log('进入反悔保护检查...')
      const completedDay = extractLocalDate(item.completed_at)
      const today = formatLocalDate(new Date())
      console.log('completedDay:', completedDay)
      console.log('today:', today)
      console.log('completedDay < today:', completedDay < today)
      if (completedDay && completedDay < today) {
        // 明确告诉用户为什么不能取消
        setToast({
          show: true,
          msg: `该任务已于 ${completedDay} 完成\n\n根据规则「已完成的事不能反悔」，今天之前完成的待办不允许取消勾选。`,
          tone: 'err',
        })
        // 清除 toast 后 3 秒 自动隐藏
        setTimeout(() => setToast({ ...toast, show: false }), 3000)
        return
      }
    }
    try {
      const ok = await toggleTodoCenterItem(item)
      if (!ok) {
        setError('完成/取消完成失败')
        return
      }
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleDelete = async (id: number) => {
    // 维护者 2026-08-25：去掉 confirm（Tauri webview confirm 体验差 · 删了没反馈以为失败）
    try {
      await deleteTodo(id)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleSaveEdit = async (id: number) => {
    if (!editDraft) return
    const title = editDraft.title.trim()
    if (!title) {
      setEditingId(null)
      setEditDraft(null)
      return
    }
    // 维护者 2026-08-25 后续：选项目后自动 @ 项目名（如果 title 还没包含）
    // 维护者 2026-08-25 后续：选"无项目"时清除 title 末尾的 @项目名 后缀
    const proj = editDraft.projectId
      ? mentionProjects.find((p) => p.id === editDraft.projectId)
      : null
    let finalTitle = title
    if (proj && !title.includes('@' + proj.name)) {
      finalTitle = `${title} @${proj.name}`
    } else if (!proj) {
      // 清除 title 末尾的 @项目名（用户从「有项目」切到「无项目」时）
      // 只清最后一个 · 不影响中间可能有的 @xxx 文本
      const idx = title.lastIndexOf('@')
      if (idx > 0) {
        const before = title.substring(0, idx).trimEnd()
        finalTitle = before
      }
    }
    try {
      await updateTodo(id, {
        title: finalTitle,
        priority: editDraft.priority,
        dueDate: editDraft.dueDate || null,
        projectId: proj?.id ?? null,
        mentions: proj ? JSON.stringify([proj.id]) : null,
      })
      setEditingId(null)
      setEditDraft(null)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  /**
   * 维护者 2026-08-25 后续：左右移动 todo 到相邻工作日
   * direction = -1 → 移到上个工作日
   * direction =  1 → 移到下个工作日
   * 维护者 2026-08-25 后续：项目同步任务跳到项目详情页改计划
   * hash 路由：#/projects/{id} · ProjectDetailPage 接管
   */
  const handleJumpToProject = (projectId: number) => {
    window.location.hash = `#/projects/${projectId}`
  }

  // 维护者 2026-08-27：点顶部日期/时间段弹日历选择日期（日/周/月视图）
  // 日视图 → anchor = 所选日；周视图 → anchor = 所选日所在周周一；月视图 → anchor = 所选年-月
  const handleJumpToDate = (date: string) => {
    if (!date) return
    if (view === 'week') {
      const monday = getMonday(date)
      setAnchor(formatLocalDate(monday))
    } else if (view === 'month') {
      setAnchor(date.slice(0, 7) + '-01')
    } else {
      setAnchor(date)
    }
  }

  // 维护者 2026-08-27：记录触发按钮位置并打开对应弹窗（跟随按钮下方）
  const openWeekPickerAt = (e: React.MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    setPickWeekPos({ top: r.top, left: r.left })
    setOpenWeekPicker(true)
  }
  const openMonthPickerAt = (e: React.MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    setPickMonthPos({ top: r.top, left: r.left })
    setOpenMonthPicker(true)
  }

  /**
   * 维护者 2026-08-25：顺延按钮
   * 把"当前（含之前）工作日未完成"的待办全部顺延到下个工作日
   * 未来 setting 里加 cron 自动调同一个函数
   *
   * 不弹 confirm（维护者反馈：Tauri webview 确认框体验差 / 看不到就以为没反应）
   * 直接执行 · toast 报告结果（"已顺延 N 项 → 日期"或"没有可顺延的待办"）
   */
  const handlePostpone = async () => {
    if (postponeBusy) return
    setPostponeBusy(true)
    try {
      const r = await postponeOverdueTodos()
      if (r.count === 0) {
        showToast('没有可顺延的待办 · 当前没有今天及之前未完成的工作日任务')
      } else {
        showToast(`已顺延 ${r.count} 项 → ${r.targetDate}`)
      }
      await reload()
    } catch (err) {
      showToast(
        '顺延失败：' + (err instanceof Error ? err.message : String(err)),
        'err',
      )
    } finally {
      setPostponeBusy(false)
    }
  }

  return (
    <div
      data-testid="todo-page"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--color-bg)',
        overflow: 'hidden', // 维护者 2026-08-25：整个页面无整体滚动
        boxSizing: 'border-box',
      }}
    >
      {/* 顶部栏：视图切换 + 日期切换 + 快速收集 */}
      <div
        style={{
          padding: '12px 24px 10px',
          borderBottom: '1px solid var(--color-border-thin)',
          background: 'var(--color-bg)',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginBottom: '8px',
          }}
        >
          {/* 视图切换 */}
          <div
            style={{
              display: 'flex',
              background: 'var(--color-bg-subtle)',
              border: '1px solid var(--color-border-thin)',
              borderRadius: 'var(--radius)',
              padding: '2px',
            }}
          >
            {VIEWS.map((v) => (
              <button
                key={v.key}
                onClick={() => {
                  setView(v.key)
                  setAnchor(formatLocalDate(new Date()))
                }}
                data-testid={`view-tab-${v.key}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '5px 12px',
                  fontSize: '12.5px',
                  fontWeight: view === v.key ? 500 : 400,
                  color:
                    view === v.key
                      ? 'var(--color-text)'
                      : 'var(--color-text-tertiary)',
                  background: view === v.key ? 'var(--color-surface)' : 'transparent',
                  borderRadius: '4px',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <v.Icon size={13} strokeWidth={1.75} />
                {v.label}
              </button>
            ))}
          </div>

          {/* 维护者 2026-08-25：顺延按钮 */}
          <button
            type="button"
            data-testid="todo-postpone-btn"
            onClick={() => void handlePostpone()}
            disabled={postponeBusy}
            title="把今天及之前工作日未完成的待办顺延到下个工作日"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '5px 12px',
              background: postponeBusy
                ? 'var(--color-bg-muted)'
                : 'var(--color-bg-subtle)',
              border: '1px solid var(--color-border-thin)',
              borderRadius: 'var(--radius)',
              fontSize: '12.5px',
              color: postponeBusy
                ? 'var(--color-text-tertiary)'
                : 'var(--color-text)',
              cursor: postponeBusy ? 'wait' : 'pointer',
            }}
          >
            <SkipForward size={12} strokeWidth={1.75} />
            {postponeBusy ? '顺延中…' : '顺延'}
          </button>

          {/* 维护者 2026-08-28：周期性任务管理入口（任务中心内嵌） */}
          <button
            type="button"
            data-testid="todo-recurring-btn"
            onClick={() => setShowRecurringMgr(true)}
            title="管理每日/每周/每月/每年重复的周期性任务"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '5px 12px',
              background: 'var(--color-bg-subtle)',
              border: '1px solid var(--color-border-thin)',
              borderRadius: 'var(--radius)',
              fontSize: '12.5px',
              color: 'var(--color-text)',
              cursor: 'pointer',
            }}
          >
            <CalendarRange size={12} strokeWidth={1.75} />
            周期性任务
          </button>

          <div style={{ flex: 1 }} />

          {/* 快速收集输入框 · 含日期选择 + @ 项目下拉 */}
          <div
            data-testid="quick-add-form"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '3px 8px',
              border: '1px solid var(--color-border-thin)',
              borderRadius: 'var(--radius)',
              background: 'var(--color-bg-subtle)',
            }}
          >
            {/* 日期选择（默认今天 · 可改） */}
            <input
              type="date"
              data-testid="quick-add-date"
              value={quickDate}
              onChange={(e) => setQuickDate(e.target.value)}
              style={{
                border: 'none',
                background: 'transparent',
                fontSize: '11.5px',
                color: 'var(--color-text-secondary)',
                fontVariantNumeric: 'tabular-nums',
                padding: '2px 4px',
                cursor: 'pointer',
                width: 124,
                outline: 'none',
                fontFamily: 'inherit',
              }}
              aria-label="添加日期"
            />
            <span
              style={{
                width: 1,
                height: 16,
                background: 'var(--color-border-thin)',
              }}
            />
            <Plus size={13} strokeWidth={2} color="var(--color-text-tertiary)" />
            <div style={{ flex: 1, minWidth: 200 }}>
              <MentionTextarea
                value={quickDraft}
                onChange={setQuickDraft}
                projects={mentionProjects}
                placeholder="输入 @ 选项目 · 回车保存"
                testid="quick-add-input"
                rows={1}
                autoBullet={false}
                onEnter={() => void handleQuickAdd()}
                onMention={(opt) => setPendingMention(opt)}
                textareaStyle={{
                  padding: '2px 0',
                  background: 'transparent',
                  border: 'none',
                  fontSize: '12.5px',
                  minHeight: 20,
                  resize: 'none',
                  lineHeight: 1.5,
                }}
              />
            </div>
            <button
              type="button"
              data-testid="quick-add-submit"
              onClick={() => void handleQuickAdd()}
              disabled={!quickDraft.trim() || quickSubmitting}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '3px 6px',
                border: 'none',
                background:
                  quickDraft.trim() && !quickSubmitting
                    ? 'var(--color-accent)'
                    : 'var(--color-bg-muted)',
                color:
                  quickDraft.trim() && !quickSubmitting
                    ? 'var(--color-text-on-accent)'
                    : 'var(--color-text-tertiary)',
                borderRadius: 'var(--radius)',
                cursor:
                  quickDraft.trim() && !quickSubmitting ? 'pointer' : 'not-allowed',
              }}
            >
              <Send size={11} strokeWidth={2} />
            </button>
          </div>
        </div>

        {/* anchor 切换 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '12px',
            color: 'var(--color-text-secondary)',
          }}
        >
          {view !== 'month' && (
            <>
              <button
                onClick={() => setAnchor(shiftAnchor(view, anchor, -1))}
                data-testid="anchor-prev"
                style={ghostBtn}
                aria-label="上一段"
              >
                <ChevronLeft size={12} />
              </button>
              <span
                style={{
                  minWidth: '180px',
                  textAlign: 'center',
                  fontVariantNumeric: 'tabular-nums',
                  fontWeight: 500,
                  color: 'var(--color-text)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {view === 'day' ? (
                  <DatePicker
                    value={anchor}
                    onChange={handleJumpToDate}
                    width={122}
                  />
                ) : view === 'week' ? (
                  <button
                    type="button"
                    onClick={openWeekPickerAt}
                    data-testid="anchor-week-picker"
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      fontWeight: 500,
                      color: 'var(--color-text)',
                      fontSize: '12px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    {anchorText(view, anchor)}
                    <Calendar size={11} strokeWidth={1.75} color="var(--color-text-tertiary)" />
                  </button>
                ) : (
                  <span
                    style={{
                      fontSize: '12px',
                      fontWeight: 500,
                      color: 'var(--color-text)',
                    }}
                  >
                    {anchorText(view, anchor)}
                  </span>
                )}
              </span>
              <button
                onClick={() => setAnchor(shiftAnchor(view, anchor, 1))}
                data-testid="anchor-next"
                style={ghostBtn}
                aria-label="下一段"
              >
                <ChevronRight size={12} />
              </button>
              <button
                onClick={() => setAnchor(formatLocalDate(new Date()))}
                data-testid="anchor-today"
                style={{
                  ...ghostBtn,
                  width: 'auto',
                  padding: '3px 10px',
                  color: 'var(--color-accent)',
                }}
              >
                <RefreshCw size={11} />
                回到今天
              </button>
            </>
          )}
          <div style={{ flex: 1 }} />
          <span
            style={{
              fontSize: '11px',
              color: 'var(--color-text-tertiary)',
            }}
          >
            {loading
              ? '加载中…'
              : view === 'month'
                ? `${monthSelectedDate} · ${monthSelectedTodos.length} 项`
                : `当前显示 ${columns.reduce(
                    (s, c) => s + (grouped[c.title]?.length ?? 0),
                    0,
                  )} 项`}
          </span>
        </div>
      </div>

      {error && (
        <div
          data-testid="todo-error"
          style={{
            margin: '8px 24px 0',
            padding: '8px 12px',
            background: 'var(--color-bg-subtle)',
            border: '1px solid var(--color-border-thin)',
            borderRadius: 'var(--radius)',
            color: 'var(--color-status-danger)',
            fontSize: '12.5px',
            flexShrink: 0,
          }}
        >
          {error}
        </div>
      )}

      {/* 维护者 2026-08-25：顺延等操作的 toast 反馈 */}
      {toast.show && (
        <div
          role="status"
          data-testid="todo-toast"
          style={{
            position: 'fixed',
            top: 70,
            right: 24,
            zIndex: 9998,
            padding: '10px 16px',
            background:
              toast.tone === 'ok'
                ? 'var(--color-status-success)'
                : 'var(--color-status-danger)',
            color: 'white',
            borderRadius: 6,
            fontSize: '13px',
            fontWeight: 500,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            maxWidth: 360,
          }}
        >
          {toast.msg}
        </div>
      )}

      {/* 月视图：完全不同的布局（calendar 左 + todos 右） */}
      {view === 'month' ? (
        <div
          data-testid="todo-month-layout"
          style={{
            flex: 1,
            minHeight: 0,
            display: 'grid',
            gridTemplateColumns: 'minmax(320px, 5fr) minmax(0, 7fr)',
            gap: 12,
            padding: '12px 24px 16px',
            overflow: 'hidden',
            boxSizing: 'border-box',
          }}
        >
          <MonthCalendarPanel
            selectedDate={monthSelectedDate}
            onSelectDate={(d) => {
              setMonthSelectedDate(d)
              // 让顶部纯文本 anchor 跟随日历所点月份
              if (view === 'month') setAnchor(d)
            }}
            ready={holidayReady}
            items={allItems}
            onOpenMonthPicker={openMonthPickerAt}
            onMonthVisible={(y, m) => setPanelYM({ y, m })}
          />
          <DayTodosPanel
            date={monthSelectedDate}
            todos={monthSelectedTodos}
            projectsMap={projectsMap}
            allProjects={mentionProjects}
            editingId={editingId}
            editDraft={editDraft}
            setEditDraft={setEditDraft}
            onToggle={handleToggle}
            onDelete={handleDelete}
            onEdit={(t) => {
              setEditingId(t.id)
              setEditDraft({
                title: t.title,
                priority: t.priority,
                dueDate: t.due_date ?? '',
                projectId: t.project_id ?? null,
              })
            }}
            onSaveEdit={handleSaveEdit}
            onCancelEdit={() => {
              setEditingId(null)
              setEditDraft(null)
            }}
            onJumpToProject={handleJumpToProject}
          />
        </div>
      ) : (
        /* 日/周视图：3 列布局 · 单列内部滚动 */
        <div
          data-testid="todo-columns"
          style={{
            flex: 1,
            minHeight: 0,
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: 12,
            padding: '12px 24px 16px',
            overflow: 'hidden', // 维护者 2026-08-25：整页无滚动 · 内部滚动
            boxSizing: 'border-box',
          }}
        >
          {columns.map((col) => (
            <ColumnPanel
              key={col.title}
              column={col}
              todos={grouped[col.title] ?? []}
              view={view}
              projectsMap={projectsMap}
              allProjects={mentionProjects}
              editingId={editingId}
              editDraft={editDraft}
              setEditDraft={setEditDraft}
              onToggle={handleToggle}
              onDelete={handleDelete}
              onEdit={(t) => {
                setEditingId(t.id)
                setEditDraft({
                  title: t.title,
                  priority: t.priority,
                  dueDate: t.due_date ?? '',
                  projectId: t.project_id ?? null,
                })
              }}
              onSaveEdit={handleSaveEdit}
              onCancelEdit={() => {
                setEditingId(null)
                setEditDraft(null)
              }}
              onJumpToProject={handleJumpToProject}
            />
          ))}
        </div>
      )}

      {/* 维护者 2026-08-27：周视图顶部时间段 → 弹日历选日期（跟随按钮下方） */}
      {view === 'week' && openWeekPicker && (
        <div
          style={{
            position: 'fixed',
            top: (pickWeekPos?.top ?? 40) + 30,
            left: (pickWeekPos?.left ?? 24) - 20,
            width: 280,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border-thin)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            padding: '14px',
            zIndex: 9999,
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text)', marginBottom: 10 }}>
            选择日期（跳到所在周）
          </div>
          <DatePicker
            value={anchor}
            onChange={(v) => {
              handleJumpToDate(v)
              setOpenWeekPicker(false)
            }}
            width={150}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <button
              type="button"
              onClick={() => setOpenWeekPicker(false)}
              style={{
                padding: '5px 12px',
                borderRadius: 'var(--radius)',
                border: 'none',
                background: 'var(--color-bg-subtle)',
                color: 'var(--color-text)',
                fontSize: '12px',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              关闭
            </button>
          </div>
        </div>
      )}

      {/* 维护者 2026-08-27：月视图顶部月份 → 弹年/月快速选择（跟随按钮下方） */}
      {view === 'month' && openMonthPicker && (
        <div
          style={{
            position: 'fixed',
            top: (pickMonthPos?.top ?? 40) + 30,
            left: Math.max(8, Math.min((pickMonthPos?.left ?? 24) - 20, window.innerWidth - 300 - 8)),
            width: 300,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border-thin)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            padding: '14px',
            zIndex: 9999,
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text)', marginBottom: 10 }}>
            选择年月
          </div>
          <YearMonthPicker
            year={panelYM?.y ?? (Number(anchor.slice(0, 4)) || new Date().getFullYear())}
            month={panelYM?.m ?? (Number(anchor.slice(5, 7)) - 1 || new Date().getMonth())}
            onPick={(y, m) => {
              const ym = `${y}-${String(m + 1).padStart(2, '0')}`
              setAnchor(`${ym}-01`)
              // 同步 monthSelectedDate：让 MonthCalendarPanel 跳到所选月 + 右侧显示该月中某天
              setMonthSelectedDate(`${ym}-15`)
              setOpenMonthPicker(false)
            }}
            onClose={() => setOpenMonthPicker(false)}
          />
        </div>
      )}

      {/* 维护者 2026-08-28：周期性任务管理面板（任务中心内嵌 overlay） */}
      {showRecurringMgr && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'var(--color-bg)',
            zIndex: 1000,
            overflow: 'auto',
          }}
        >
          <TaskCenterPage
            onClose={() => setShowRecurringMgr(false)}
            // 维护者 2026-08-28：创建/编辑/删除周期任务后 → 重新同步 + 刷新任务中心视图
            onChanged={() => void reload()}
          />
        </div>
      )}
    </div>
  )
}

// ============================================================
// 列面板（日/周视图 · 3 列 · 内部滚动）
// ============================================================

interface ColumnProps {
  column: DayColumn
  todos: TodoCenterItem[]
  view: ViewKey
  projectsMap: Record<number, string>
  /** 维护者 2026-08-25 后续：编辑态选项目用 */
  allProjects: MentionOption[]
  editingId: number | null
  editDraft: {
    title: string
    priority: Todo['priority']
    dueDate: string
    projectId: number | null
  } | null
  setEditDraft: (v: {
    title: string
    priority: Todo['priority']
    dueDate: string
    projectId: number | null
  } | null) => void
  onToggle: (t: TodoCenterItem) => void
  onDelete: (id: number) => void
  onEdit: (t: TodoCenterItem) => void
  onSaveEdit: (id: number) => void
  onCancelEdit: () => void
  /** 维护者 2026-08-25 后续：项目同步任务跳转项目详情 */
  onJumpToProject: (projectId: number) => void
}

function ColumnPanel({
  column,
  todos,
  view,
  projectsMap,
  allProjects,
  editingId,
  editDraft,
  setEditDraft,
  onToggle,
  onDelete,
  onEdit,
  onSaveEdit,
  onCancelEdit,
  onJumpToProject,
}: ColumnProps) {
  const today = formatLocalDate(new Date())
  const isCurrent = column.range.start <= today && today <= column.range.end

  return (
    <div
      data-testid={`todo-col-${column.title}`}
      style={{
        background: 'var(--color-surface)',
        border: isCurrent
          ? '1px solid var(--color-accent)'
          : '1px solid var(--color-border-thin)',
        borderRadius: 'var(--radius-md)',
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0, // 关键：允许 flex 子项内部滚动
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '10px',
          paddingBottom: '8px',
          borderBottom: '1px solid var(--color-border-thin)',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: '28px',
            height: '28px',
            borderRadius: 'var(--radius)',
            background: isCurrent
              ? 'var(--color-accent-subtle)'
              : 'var(--color-bg-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <column.Icon
            size={14}
            strokeWidth={1.75}
            color={isCurrent ? 'var(--color-accent)' : 'var(--color-text-tertiary)'}
          />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--color-text)',
            }}
          >
            {column.title}
            {isCurrent && (
              <span
                style={{
                  fontSize: '10px',
                  color: 'var(--color-accent)',
                  marginLeft: '6px',
                  fontWeight: 500,
                  padding: '1px 5px',
                  background: 'var(--color-accent-subtle)',
                  borderRadius: '3px',
                }}
              >
                当前
              </span>
            )}
          </div>
          <div
            style={{
              fontSize: '11px',
              color: 'var(--color-text-tertiary)',
              marginTop: '2px',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {column.subtitle}
          </div>
        </div>
        <span
          style={{
            fontSize: '11px',
            color: 'var(--color-text-tertiary)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {todos.length} 项
        </span>
      </div>

      {/*
        维护者 2026-08-25：去掉周视图的 DayStrip（一 二 三 四 五 六 日）
        周视图本来就是整周，再内嵌一周内的日条没意义
        月视图：月视图根本不走 ColumnPanel（直接用 DayTodosPanel）
        日视图：单日不需要日条
        所以这里什么都不渲染
      */}

      {/* 待办列表（内部滚动 · 维护者 2026-08-25） */}
      <div style={{ flex: 1, minHeight: 0, marginTop: view !== 'day' ? '8px' : 0 }}>
        {todos.length === 0 ? (
          <div
            style={{
              padding: '32px 0',
              textAlign: 'center',
              fontSize: '12px',
              color: 'var(--color-text-tertiary)',
            }}
          >
            <CheckCircle2
              size={22}
              strokeWidth={1.25}
              color="var(--color-text-tertiary)"
              style={{ margin: '0 auto 6px', display: 'block', opacity: 0.6 }}
            />
            <div>暂无待办</div>
          </div>
        ) : (
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              overflowY: 'auto',
              maxHeight: '100%',
            }}
          >
            {todos.map((t) => (
              <TodoRow
                key={t.id}
                todo={t}
                today={today}
                projectName={t.project_id ? projectsMap[t.project_id] : null}
                allProjects={allProjects}
                editingId={editingId}
                editDraft={editDraft}
                setEditDraft={setEditDraft}
                onToggle={onToggle}
                onDelete={onDelete}
                onEdit={onEdit}
                onSaveEdit={onSaveEdit}
                onCancelEdit={onCancelEdit}
                onJumpToProject={onJumpToProject}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ============================================================
// 月视图：右侧选中日待办面板（独立模块 · 可复用）
// ============================================================

interface DayTodosProps {
  date: string
  todos: TodoCenterItem[]
  projectsMap: Record<number, string>
  /** 维护者 2026-08-25 后续：编辑态选项目用 */
  allProjects: MentionOption[]
  editingId: number | null
  editDraft: {
    title: string
    priority: Todo['priority']
    dueDate: string
    projectId: number | null
  } | null
  setEditDraft: (v: {
    title: string
    priority: Todo['priority']
    dueDate: string
    projectId: number | null
  } | null) => void
  onToggle: (t: TodoCenterItem) => void
  onDelete: (id: number) => void
  onEdit: (t: TodoCenterItem) => void
  onSaveEdit: (id: number) => void
  onCancelEdit: () => void
  onJumpToProject: (projectId: number) => void
}

function DayTodosPanel({
  date,
  todos,
  projectsMap,
  allProjects,
  editingId,
  editDraft,
  setEditDraft,
  onToggle,
  onDelete,
  onEdit,
  onSaveEdit,
  onCancelEdit,
  onJumpToProject,
}: DayTodosProps) {
  const today = formatLocalDate(new Date())
  const isToday = date === today
  const weekday = ['日', '一', '二', '三', '四', '五', '六'][
    new Date(date + 'T00:00:00').getDay()
  ]
  return (
    <div
      data-testid="todo-day-panel"
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border-thin)',
        borderRadius: 'var(--radius-md)',
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          marginBottom: '12px',
          paddingBottom: '10px',
          borderBottom: '1px solid var(--color-border-thin)',
          flexShrink: 0,
        }}
      >
        <ListTodo size={16} strokeWidth={1.75} color="var(--color-accent)" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: '14px',
              fontWeight: 600,
              color: 'var(--color-text)',
            }}
          >
            {date}{' '}
            <span
              style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}
            >
              星期{weekday}
            </span>
            {isToday && (
              <span
                style={{
                  fontSize: '10px',
                  color: 'var(--color-accent)',
                  marginLeft: '8px',
                  fontWeight: 500,
                  padding: '1px 6px',
                  background: 'var(--color-accent-subtle)',
                  borderRadius: '3px',
                }}
              >
                今天
              </span>
            )}
          </div>
          <div
            style={{
              fontSize: '11px',
              color: 'var(--color-text-tertiary)',
              marginTop: '2px',
            }}
          >
            点击左侧日历 · 切换右侧待办
          </div>
        </div>
        <span
          style={{
            fontSize: '11px',
            color: 'var(--color-text-tertiary)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {todos.length} 项
        </span>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {todos.length === 0 ? (
          <div
            style={{
              padding: '40px 0',
              textAlign: 'center',
              fontSize: '12.5px',
              color: 'var(--color-text-tertiary)',
            }}
          >
            <CheckCircle2
              size={26}
              strokeWidth={1.25}
              color="var(--color-text-tertiary)"
              style={{ margin: '0 auto 8px', display: 'block', opacity: 0.6 }}
            />
            <div>{date} 暂无待办</div>
          </div>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {todos.map((t) => (
              <TodoRow
                key={t.id}
                todo={t}
                today={today}
                projectName={t.project_id ? projectsMap[t.project_id] : null}
                allProjects={allProjects}
                editingId={editingId}
                editDraft={editDraft}
                setEditDraft={setEditDraft}
                onToggle={onToggle}
                onDelete={onDelete}
                onEdit={onEdit}
                onSaveEdit={onSaveEdit}
                onCancelEdit={onCancelEdit}
                onJumpToProject={onJumpToProject}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ============================================================
// 待办单行（共用 · 日/周/月都用）
// ============================================================

interface TodoRowProps {
  todo: TodoCenterItem
  today: string
  projectName: string | null
  /** 维护者 2026-08-25 后续：编辑态选项目用 */
  allProjects: MentionOption[]
  editingId: number | null
  editDraft: {
    title: string
    priority: Todo['priority']
    dueDate: string
    projectId: number | null
  } | null
  setEditDraft: (v: {
    title: string
    priority: Todo['priority']
    dueDate: string
    projectId: number | null
  } | null) => void
  onToggle: (t: TodoCenterItem) => void
  onDelete: (id: number) => void
  onEdit: (t: TodoCenterItem) => void
  onSaveEdit: (id: number) => void
  onCancelEdit: () => void
  /** 维护者 2026-08-25 后续：项目同步任务跳转项目详情 */
  onJumpToProject?: (projectId: number) => void
}

function TodoRow({
  todo: t,
  today: _today,
  projectName,
  allProjects,
  editingId,
  editDraft,
  setEditDraft,
  onToggle,
  onDelete,
  onEdit,
  onSaveEdit,
  onCancelEdit,
  onJumpToProject,
}: TodoRowProps) {
  // 维护者 2026-08-27 后续：来源区分（动态聚合 · 不改 source_id 判定了）
  // - 普通 Todo（source === 'TODO'）：可编辑/删除/完成
  // - 项目计划任务（source === 'PROJECT_TASK'）· 周报下周计划（source === 'WEEKLY_NEXT'）：
  //   readonly（不可编辑/删除），但可点击完成（回写来源表 + 同步 worknote）
  const isReadOnly = t.source !== 'TODO'
  const isProjectLinked = !!t.project_id && !!projectName
  // 维护者 2026-08-25 后续：hover 才显操作按钮（不编辑时清爽）
  const [hovered, setHovered] = useState(false)
  const isEditing = editingId === t.id && !!editDraft

  return (
    <li
      data-testid={`todo-row-${t.id}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '8px',
        padding: isEditing ? '8px' : '6px 0',
        borderBottom: '1px solid var(--color-border-thin)',
        fontSize: '13px',
        background: isEditing ? 'var(--color-bg-subtle)' : 'transparent',
        borderRadius: isEditing ? 'var(--radius)' : 0,
        margin: isEditing ? '2px 0' : 0,
        transition: 'background 0.15s',
      }}
    >
      <button
        onClick={() => onToggle(t)}
        data-testid={`todo-toggle-${t.id}`}
        style={{
          background: 'transparent',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          marginTop: 2,
        }}
        title={t.status === 'COMPLETED' ? '点击恢复' : '点击完成'}
      >
        {t.status === 'COMPLETED' ? (
          <CheckCircle2
            size={15}
            strokeWidth={1.75}
            color="var(--color-status-success)"
          />
        ) : (
          <Circle size={15} strokeWidth={1.5} color="var(--color-text-tertiary)" />
        )}
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        {isEditing ? (
          <input
            autoFocus
            value={editDraft!.title}
            onChange={(e) =>
              setEditDraft({ ...editDraft!, title: e.target.value })
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSaveEdit(t.id)
              if (e.key === 'Escape') onCancelEdit()
            }}
            data-testid={`todo-edit-input-${t.id}`}
            style={{
              width: '100%',
              fontSize: '13px',
              padding: '3px 6px',
              border: '1px solid var(--color-accent)',
              borderRadius: 'var(--radius)',
              outline: 'none',
              background: 'var(--color-bg)',
              color: 'var(--color-text)',
            }}
          />
        ) : (
          <span
            style={{
              display: 'block',
              color:
                t.status === 'COMPLETED'
                  ? 'var(--color-text-tertiary)'
                  : 'var(--color-text)',
              textDecoration:
                t.status === 'COMPLETED' ? 'line-through' : 'none',
              wordBreak: 'break-word',
            }}
          >
            {t.title}
            {/* 维护者 2026-08-27：项目/周报同步任务 · 标题后自动 @ 项目名称 */}
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
            {/* 维护者 2026-08-28：周期性任务 · 标题后周期标签（与 @项目名 同风格 · 无图标） */}
            {t.source === 'RECURRING' && t.recurringLabel && (
              <span
                style={{
                  color: 'var(--color-accent)',
                  fontWeight: 500,
                  marginLeft: 4,
                  fontSize: '12px',
                }}
              >
                {t.recurringLabel}
              </span>
            )}
          </span>
        )}

        {/* 维护者 2026-08-25 后续：不编辑时 · 副行显示项目/优先级/日期（清爽）*/}
        {!isEditing && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              marginTop: 3,
              flexWrap: 'wrap',
            }}
          >
            {t.source === 'PROJECT_TASK' && (
              <span
                data-testid={`todo-source-synced-${t.id}`}
                title="来源：项目计划任务（请到项目详情修改计划）"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  padding: '0 5px',
                  background: '#fff1e6',
                  color: '#d97706',
                  borderRadius: '3px',
                  fontSize: '10px',
                  fontWeight: 500,
                }}
              >
                <Link2 size={9} strokeWidth={1.75} />
                项目任务
              </span>
            )}
            {t.source === 'WEEKLY_NEXT' && (
              <span
                data-testid={`todo-source-weekly-${t.id}`}
                title="来源：周报「下周项目工作计划」"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  padding: '0 5px',
                  background: '#eef2ff',
                  color: '#4f46e5',
                  borderRadius: '3px',
                  fontSize: '10px',
                  fontWeight: 500,
                }}
              >
                <CalendarClock size={9} strokeWidth={1.75} />
                下周计划
              </span>
            )}
            {isProjectLinked && (
              <span
                data-testid={`todo-project-badge-${t.id}`}
                title={projectName ?? ''}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  padding: '0 5px',
                  background: 'var(--color-accent-subtle)',
                  color: 'var(--color-accent)',
                  borderRadius: '3px',
                  fontSize: '10px',
                  fontWeight: 500,
                }}
              >
                <FolderKanban size={9} strokeWidth={1.75} />
                {projectName}
              </span>
            )}
            {t.priority !== 'NORMAL' && <PriorityBadge priority={t.priority} />}
            {t.due_date && (
              <span
                data-testid={`todo-date-${t.id}`}
                style={{
                  fontSize: '10.5px',
                  color: 'var(--color-text-tertiary)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {t.due_date}
              </span>
            )}
          </div>
        )}

        {/* 维护者 2026-08-25 后续：编辑态 · 优先级 + 日期 inline 编辑 */}
        {isEditing && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginTop: 6,
              flexWrap: 'wrap',
            }}
          >
            <select
              data-testid={`todo-edit-priority-${t.id}`}
              value={editDraft!.priority}
              onChange={(e) =>
                setEditDraft({
                  ...editDraft!,
                  priority: e.target.value as Todo['priority'],
                })
              }
              style={{
                fontSize: '11.5px',
                padding: '2px 4px',
                border: '1px solid var(--color-border-thin)',
                borderRadius: 'var(--radius)',
                background: 'var(--color-bg)',
                color: 'var(--color-text)',
                cursor: 'pointer',
                outline: 'none',
                fontFamily: 'inherit',
              }}
            >
              <option value="LOW">低</option>
              <option value="NORMAL">普通</option>
              <option value="HIGH">高</option>
              <option value="URGENT">紧急</option>
            </select>
            {/* 维护者 2026-08-25 后续：编辑态选项目 · 自动 @ 项目名 */}
            <select
              data-testid={`todo-edit-project-${t.id}`}
              value={editDraft!.projectId ?? ''}
              onChange={(e) =>
                setEditDraft({
                  ...editDraft!,
                  projectId: e.target.value ? Number(e.target.value) : null,
                })
              }
              style={{
                fontSize: '11.5px',
                padding: '2px 4px',
                border: '1px solid var(--color-border-thin)',
                borderRadius: 'var(--radius)',
                background: 'var(--color-bg)',
                color: 'var(--color-text)',
                cursor: 'pointer',
                outline: 'none',
                fontFamily: 'inherit',
                maxWidth: 180,
              }}
            >
              <option value="">无项目</option>
              {allProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  @ {p.name}
                </option>
              ))}
            </select>
            <DatePicker
              value={editDraft!.dueDate}
              onChange={(v) => setEditDraft({ ...editDraft!, dueDate: v })}
              testid={`todo-edit-date-${t.id}`}
              width={130}
            />
          </div>
        )}
      </div>

      {/* 右侧操作区 · 不编辑时 hover 才显（项目同步「改计划」始终可见） */}
      {!isEditing && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            flexShrink: 0,
            opacity: t.source === 'PROJECT_TASK' || hovered ? 1 : 0,
            transition: 'opacity 0.15s',
          }}
        >
          {/* 项目任务 → 改计划按钮（始终可见 · 维护者要求）*/}
          {t.source === 'PROJECT_TASK' && onJumpToProject && t.project_id && (
            <button
              type="button"
              data-testid={`todo-jump-project-${t.id}`}
              onClick={() => onJumpToProject(t.project_id!)}
              title="去项目详情改计划"
              style={{
                background: 'var(--color-accent-subtle)',
                border: 'none',
                padding: '3px 7px',
                cursor: 'pointer',
                color: 'var(--color-accent)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 2,
                borderRadius: 'var(--radius)',
                fontSize: '10.5px',
                fontWeight: 500,
              }}
            >
              改计划
              <ExternalLink size={9} strokeWidth={1.75} />
            </button>
          )}

          {/* hover 才显 · 编辑 + 删除按钮 */}
          {hovered && (
            <>
              {!isReadOnly && (
                <button
                  onClick={() => onEdit(t)}
                  data-testid={`todo-edit-btn-${t.id}`}
                  title="编辑"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    padding: '2px',
                    cursor: 'pointer',
                    color: 'var(--color-text-tertiary)',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <Pencil size={11} strokeWidth={1.75} />
                </button>
              )}
              {/* 维护者 2026-08-25：项目同步任务也不能删 · readonly */}
              {!isReadOnly && (
                <button
                  onClick={() => onDelete(t.id)}
                  data-testid={`todo-delete-${t.id}`}
                  title="删除"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    padding: '2px',
                    cursor: 'pointer',
                    color: 'var(--color-text-tertiary)',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <Trash2 size={11} strokeWidth={1.75} />
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* 编辑态 · 保存 / 取消按钮（始终显示） */}
      {isEditing && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            data-testid={`todo-save-btn-${t.id}`}
            onClick={() => onSaveEdit(t.id)}
            title="保存"
            style={{
              background: 'var(--color-accent)',
              border: 'none',
              padding: '3px 10px',
              cursor: 'pointer',
              color: 'var(--color-text-on-accent)',
              borderRadius: 'var(--radius)',
              fontSize: '11.5px',
              fontWeight: 500,
              fontFamily: 'inherit',
            }}
          >
            保存
          </button>
          <button
            type="button"
            data-testid={`todo-cancel-btn-${t.id}`}
            onClick={onCancelEdit}
            title="取消"
            style={{
              background: 'var(--color-bg)',
              border: '1px solid var(--color-border-thin)',
              padding: '3px 10px',
              cursor: 'pointer',
              color: 'var(--color-text-secondary)',
              borderRadius: 'var(--radius)',
              fontSize: '11.5px',
              fontFamily: 'inherit',
            }}
          >
            取消
          </button>
        </div>
      )}
    </li>
  )
}

// 维护者 2026-08-25：周视图去掉 DayStrip（整周再内嵌日条无意义）· 此处仅保留空函数防 unused import

function PriorityBadge({ priority }: { priority: Todo['priority'] }) {
  const cfg = {
    LOW: { label: '低', bg: 'var(--color-bg-muted)', fg: 'var(--color-text-tertiary)' },
    HIGH: { label: '高', bg: '#fff1e6', fg: '#d97706' },
    URGENT: { label: '紧急', bg: '#ffe8e8', fg: 'var(--color-status-danger)' },
    NORMAL: { label: '', bg: '', fg: '' },
  }[priority]
  if (!cfg.label) return null
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '0 5px',
        background: cfg.bg,
        color: cfg.fg,
        borderRadius: '3px',
        fontSize: '10px',
        fontWeight: 500,
        flexShrink: 0,
      }}
    >
      {cfg.label}
    </span>
  )
}

// ============================================================
// 月视图：左侧日历（复用主工作区逻辑 · 不带"工作日看板"标题）
// 维护者 2026-08-25：去掉"工作日看板"几个字
// ============================================================

interface MonthDayCell {
  date: string
  day: number
  isCurrentMonth: boolean
  isToday: boolean
  type: 'workday' | 'weekend' | 'holiday' | 'adjusted-workday'
  label?: string
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

function gotoMonthTodo(
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

function MonthCalendarPanel({
  selectedDate,
  onSelectDate,
  ready,
  items,
  onOpenMonthPicker,
  onMonthVisible,
}: {
  selectedDate: string
  onSelectDate: (date: string) => void
  ready: boolean
  items: TodoCenterItem[]
  onOpenMonthPicker: (e: React.MouseEvent<HTMLButtonElement>) => void
  onMonthVisible?: (y: number, m: number) => void
}) {
  const today = useMemo(() => new Date(), [])
  // 默认打开选中日所在的月
  const initialYear =
    Number(selectedDate.slice(0, 4)) || today.getFullYear()
  const initialMonth =
    Number(selectedDate.slice(5, 7)) - 1 || today.getMonth()
  const [year, setYear] = useState(initialYear)
  const [month, setMonth] = useState(initialMonth)
  // 选中日变化时，自动跳到那个月（仅依赖 selectedDate · 不覆盖箭头点击）
  // 维护者 2026-08-25 修复：之前依赖 year/month 导致 useEffect 在箭头点击后
  // 把 month 拉回 selectedDate 所在的月份，箭头看起来没反应
  useEffect(() => {
    const sy = Number(selectedDate.slice(0, 4))
    const sm = Number(selectedDate.slice(5, 7)) - 1
    if (!Number.isNaN(sy) && !Number.isNaN(sm)) {
      setYear(sy)
      setMonth(sm)
    }
  }, [selectedDate])

  const days = useMemo<MonthDayCell[]>(() => {
    return buildMonthGridTodo(year, month, today, ready)
  }, [year, month, today, ready])

  // 面板当前显示月份变化时上报，供顶部年月选择器初始值跟随
  useEffect(() => {
    onMonthVisible?.(year, month)
  }, [year, month, onMonthVisible])

  const monthLabel = `${year} 年 ${month + 1} 月`

  return (
    <div
      data-testid="todo-month-calendar"
      style={{
        padding: '12px 14px',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border-thin)',
        borderRadius: 'var(--radius-md)',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      {/* 顶部：月份切换 + 今天 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 10,
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={() => gotoMonthTodo(year, month - 1, setYear, setMonth)}
            data-testid="cal-prev"
            style={calNavBtn}
            aria-label="上一月"
          >
            <ChevronLeft size={12} />
          </button>
          <button
            type="button"
            onClick={onOpenMonthPicker}
            data-testid="cal-month-title"
            style={{
              fontSize: '13px',
              color: 'var(--color-text)',
              fontVariantNumeric: 'tabular-nums',
              minWidth: 84,
              textAlign: 'center',
              fontWeight: 600,
              background: 'none',
              border: 'none',
              padding: '2px 6px',
              cursor: 'pointer',
              fontFamily: 'inherit',
              borderRadius: 'var(--radius)',
              display: 'inline-block',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--color-bg-subtle)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'none'
            }}
          >
            {monthLabel}
          </button>
          <button
            onClick={() => gotoMonthTodo(year, month + 1, setYear, setMonth)}
            data-testid="cal-next"
            style={calNavBtn}
            aria-label="下一月"
          >
            <ChevronRight size={12} />
          </button>
        </div>
        <button
          onClick={() => {
            const t = formatLocalDate(today)
            setYear(today.getFullYear())
            setMonth(today.getMonth())
            onSelectDate(t)
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

      {/* 图例 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: '10px',
          color: 'var(--color-text-tertiary)',
          marginBottom: 6,
          flexWrap: 'wrap',
          flexShrink: 0,
        }}
      >
        <LegendDot color="var(--color-text-secondary)" label="工作日" />
        <LegendDot color="var(--color-status-warning)" label="周末" />
        <LegendDot color="var(--color-status-danger)" label="法定节假日" />
        <LegendDot color="var(--color-accent)" label="补班" />
      </div>

      {/* 周标题 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: 3,
          marginBottom: 3,
          flexShrink: 0,
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

      {/* 日期网格（内部滚动 · 维护者 2026-08-25） */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gridAutoRows: 'minmax(34px, auto)',
          gap: 3,
          alignContent: 'start',
        }}
      >
        {days.map((d, idx) => (
          <MonthDayCellView
            key={`${d.date}-${idx}`}
            cell={d}
            isSelected={d.date === selectedDate}
            onClick={() => d.date && onSelectDate(d.date)}
            dotColor={dotColorForTodo(items, d.date)}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * 任务中心月视图：某天待办小点颜色（与首页 HomePage.dotColorFor 一致）
 * @param items 所有待办列表（Todo[]）
 * @param date 日期字符串 YYYY-MM-DD
 * @returns 有未完成=绿 #10B981 / 全部完成=灰 #9CA3AF / 无待办=null
 */
function dotColorForTodo(items: TodoCenterItem[], date: string): string | null {
  if (!date) return null
  const dayItems = items.filter((t) => itemInDay(t, date))
  if (dayItems.length === 0) return null
  const hasPending = dayItems.some((t) => t.status !== 'COMPLETED')
  return hasPending ? '#10B981' : '#9CA3AF'
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: 2,
          background: color,
        }}
      />
      {label}
    </span>
  )
}

function MonthDayCellView({
  cell,
  isSelected,
  onClick,
  dotColor,
}: {
  cell: MonthDayCell
  isSelected: boolean
  onClick: () => void
  /** 待办小点颜色（#10B981=有未完成 / #9CA3AF=全部完成）· null=无待办 */
  dotColor?: string | null
}) {
  if (!cell.isCurrentMonth) {
    return <div style={{ minHeight: 34 }} />
  }
  const color =
    cell.type === 'holiday'
      ? 'var(--color-status-danger)'
      : cell.type === 'weekend'
        ? 'var(--color-status-warning)'
        : cell.type === 'adjusted-workday'
          ? 'var(--color-accent)'
          : 'var(--color-text)'
  return (
    <button
      type="button"
      data-testid={`cal-day-${cell.date}`}
      data-selected={isSelected}
      onClick={onClick}
      style={{
        position: 'relative',
        minHeight: 34,
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
      }}
    >
      <div
        style={{
          fontSize: '11.5px',
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
            fontSize: '8.5px',
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
    </button>
  )
}

function buildMonthGridTodo(
  year: number,
  month: number,
  today: Date,
  _ready: boolean,
): MonthDayCell[] {
  const firstDay = new Date(year, month, 1)
  const firstWeekday = (firstDay.getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const todayLocal = formatLocalDate(today)

  const cells: MonthDayCell[] = []
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
    const { type, label } = classifyDayTodo(dateStr, isWeekend)
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

interface DayMetaTodo {
  isHoliday: boolean
  isAdjusted: boolean
  name: string | null
}

function getDayMetaTodo(date: string): DayMetaTodo | null {
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
    isAdjusted: false,
    name: null,
  }
}

function classifyDayTodo(
  dateLocal: string,
  isWeekend: boolean,
): { type: MonthDayCell['type']; label?: string } {
  const meta = getDayMetaTodo(dateLocal)
  if (meta) {
    if (meta.isHoliday) return { type: 'holiday', label: meta.name ?? '放假' }
    if (meta.isAdjusted) return { type: 'adjusted-workday', label: '补班' }
  }
  if (isWeekend) return { type: 'weekend' }
  return { type: 'workday' }
}

// ============================================================
// 工具函数：构造三时间段 + anchor 切换 + 文本
// ============================================================

function buildColumns(view: ViewKey, anchor: string): DayColumn[] {
  if (view === 'day') {
    return [
      buildDayCol('上个工作日', anchor, -1),
      buildDayCol('今日', anchor, 0),
      buildDayCol('下个工作日', anchor, 1),
    ]
  }
  if (view === 'week') {
    return [
      buildWeekCol('上周', anchor, -1),
      buildWeekCol('本周', anchor, 0),
      buildWeekCol('下周', anchor, 1),
    ]
  }
  return [
    buildMonthCol('上月', anchor, -1),
    buildMonthCol('本月', anchor, 0),
    buildMonthCol('下月', anchor, 1),
  ]
}

function buildDayCol(
  title: string,
  anchor: string,
  direction: -1 | 0 | 1,
): DayColumn {
  const d = direction === 0 ? anchor : computeAdjacentWorkday(anchor, direction)
  const weekday = weekdayCN(d)
  return {
    title,
    subtitle: `${d} · 星期${weekday}`,
    range: { start: d, end: d },
    Icon: direction === 0 ? CalendarDays : direction < 0 ? ChevronLeft : ChevronRight,
    date: d,
  }
}

function buildWeekCol(
  title: string,
  anchor: string,
  direction: -1 | 0 | 1,
): DayColumn {
  const monday = getMonday(anchor)
  monday.setDate(monday.getDate() + direction * 7)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return {
    title,
    subtitle: `${formatLocalDate(monday)} ~ ${formatLocalDate(sunday)}`,
    range: { start: formatLocalDate(monday), end: formatLocalDate(sunday) },
    Icon: direction === 0 ? CalendarRange : direction < 0 ? ChevronLeft : ChevronRight,
    date: formatLocalDate(monday),
  }
}

function buildMonthCol(
  title: string,
  anchor: string,
  direction: -1 | 0 | 1,
): DayColumn {
  const [y, m] = anchor.slice(0, 7).split('-').map(Number)
  const targetMonth = m - 1 + direction
  const date = new Date(y, targetMonth, 1)
  const yy = date.getFullYear()
  const mm = date.getMonth() + 1
  const monthStart = `${yy}-${String(mm).padStart(2, '0')}-01`
  const lastDay = new Date(yy, mm, 0).getDate()
  const monthEnd = `${yy}-${String(mm).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return {
    title,
    subtitle: `${yy} 年 ${mm} 月 · 共 ${lastDay} 天`,
    range: { start: monthStart, end: monthEnd },
    Icon: direction === 0 ? CalendarClock : direction < 0 ? ChevronLeft : ChevronRight,
    date: monthStart,
  }
}

/**
 * 计算上一个/下一个工作日（基于 anchor）
 * 跳过周末 + 法定节假日
 */
function computeAdjacentWorkday(anchor: string, direction: -1 | 1): string {
  const d = new Date(anchor + 'T00:00:00')
  for (let i = 0; i < 14; i++) {
    d.setDate(d.getDate() + direction)
    const local = formatLocalDate(d)
    const wd = d.getDay()
    if (wd === 0 || wd === 6) continue
    if (defaultHolidayProvider.isHoliday(local)) continue
    if (!defaultHolidayProvider.isWorkday(local)) continue
    return local
  }
  return anchor
}

function getMonday(dateStr: string): Date {
  const d = new Date(dateStr)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d
}

function weekdayCN(dateStr: string): string {
  return ['日', '一', '二', '三', '四', '五', '六'][
    new Date(dateStr + 'T00:00:00').getDay()
  ]
}

function anchorText(view: ViewKey, anchor: string): string {
  if (view === 'day') return anchor
  if (view === 'week') {
    const monday = getMonday(anchor)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    return `周 ${formatLocalDate(monday)} ~ ${formatLocalDate(sunday)}`
  }
  const [y, m] = anchor.slice(0, 7).split('-')
  return `${y} 年 ${parseInt(m, 10)} 月`
}

function shiftAnchor(view: ViewKey, anchor: string, delta: -1 | 1): string {
  if (view === 'day') {
    const d = new Date(anchor + 'T00:00:00')
    d.setDate(d.getDate() + delta)
    return formatLocalDate(d)
  }
  if (view === 'week') {
    const monday = getMonday(anchor)
    monday.setDate(monday.getDate() + delta * 7)
    return formatLocalDate(monday)
  }
  const [y, m] = anchor.slice(0, 7).split('-').map(Number)
  const newDate = new Date(y, m - 1 + delta, 1)
  return formatLocalDate(newDate)
}

/**
 * 按列筛选待办
 *  - 日视图：单日命中（项目任务/周报任务=时间段内每天展示 · 普通 Todo=due 当天）
 *  - 周/月视图：任务时间段与列范围重叠即展示（含任务范围横跨整周/整月的情况）
 */
function filterTodos(all: TodoCenterItem[], col: DayColumn, view: ViewKey): TodoCenterItem[] {
  const { start, end } = col.range
  const filtered = all.filter((t) => {
    if (view === 'day') {
      return itemInDay(t, start)
    }
    return itemOverlapsRange(t, start, end)
  })
  filtered.sort(todoSortFn)
  return filtered
}

/**
 * 待办排序（未完成在前 · 同态按优先级 · 同优先级按截止日）
 */
function todoSortFn(a: TodoCenterItem, b: TodoCenterItem): number {
  const aDone = a.status === 'COMPLETED' || a.status === 'DELAYED'
  const bDone = b.status === 'COMPLETED' || b.status === 'DELAYED'
  if (aDone !== bDone) return aDone ? 1 : -1
  const ap = priorityRank(a.priority)
  const bp = priorityRank(b.priority)
  if (ap !== bp) return ap - bp
  return (a.due_date ?? '9999-99-99').localeCompare(b.due_date ?? '9999-99-99')
}

function priorityRank(p: Todo['priority']): number {
  return { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 }[p]
}

/** 维护者 2026-08-27：年/月快速选择器（月视图顶部点月份弹出） */
function YearMonthPicker({
  year,
  month,
  onPick,
  onClose,
}: {
  year: number
  month: number // 0-11
  onPick: (year: number, month: number) => void
  onClose: () => void
}) {
  const [y, setY] = useState(year)
  const [m, setM] = useState(month)
  const years = useMemo(() => {
    const cur = new Date().getFullYear()
    const out: number[] = []
    for (let i = cur - 8; i <= cur + 4; i++) out.push(i)
    return out
  }, [])
  const months = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
  return (
    <div>
      <div
        style={{
          display: 'flex',
          gap: 4,
          marginBottom: 10,
          flexWrap: 'wrap',
        }}
      >
        {years.map((yy) => (
          <button
            key={yy}
            type="button"
            onClick={() => setY(yy)}
            style={{
              padding: '4px 10px',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--color-border-thin)',
              background: yy === y ? 'var(--color-accent-subtle)' : 'var(--color-bg-subtle)',
              color: yy === y ? 'var(--color-accent)' : 'var(--color-text)',
              fontSize: '11.5px',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {yy}年
          </button>
        ))}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 6,
        }}
      >
        {months.map((mm, idx) => (
          <button
            key={mm}
            type="button"
            onClick={() => onPick(y, idx)}
            style={{
              padding: '7px 0',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--color-border-thin)',
              background: y === year && idx === month ? 'var(--color-accent)' : 'var(--color-bg-subtle)',
              color: y === year && idx === month ? 'var(--color-text-on-accent)' : 'var(--color-text)',
              fontSize: '12px',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {mm}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
        <button
          type="button"
          onClick={onClose}
          style={{
            padding: '5px 12px',
            borderRadius: 'var(--radius)',
            border: 'none',
            background: 'var(--color-bg-subtle)',
            color: 'var(--color-text)',
            fontSize: '12px',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          取消
        </button>
      </div>
    </div>
  )
}

// ============================================================
// 通用样式
// ============================================================

const ghostBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '26px',
  height: '26px',
  background: 'var(--color-bg-subtle)',
  border: '1px solid var(--color-border-thin)',
  borderRadius: 'var(--radius)',
  color: 'var(--color-text-secondary)',
  cursor: 'pointer',
}