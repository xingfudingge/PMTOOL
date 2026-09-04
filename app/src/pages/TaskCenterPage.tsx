/**
 * PMTool V2.0 · 周期性任务管理页面
 * 维护者 2026-08-28
 *
 * 功能：
 *   - 查看、创建、删除周期性任务
 *   - 支持每日/每周/每月/每年周期
 *   - 支持一周/一月/一年/永久/自定义生效时间
 *   - 取消时只删除未执行部分，已执行的保留
 *
 * 样式：跟随 TodoPage/HomePage 设计语言
 *   - 按钮：var(--color-bg-subtle) + var(--color-border-thin)
 *   - 卡片：var(--color-surface) + 1px var(--color-border-thin)
 *   - 强调色：var(--color-accent)
 *   - 文字：var(--color-text)/var(--color-text-secondary)/var(--color-text-tertiary)
 *   - 圆角：var(--radius)/var(--radius-md)
 *   - 阴影：boxShadow '0 8px 24px rgba(0,0,0,0.18)'
 */

import { useState, useEffect, useMemo } from 'react'
import { Trash2, Plus, CheckCircle2, X, CalendarRange, Pencil } from 'lucide-react'
import {
  listRecurringTasks,
  createRecurringTask,
  updateRecurringTask,
  deleteRecurringTask,
  syncRecurringTodos,
  calculateRecurringDates,
  describeRecurringCycle,
  type RecurringCycle,
  type RecurringPattern,
  type RecurringInterval,
  type RecurringTask,
} from '@/services/recurringTasks'
import { formatLocalDate, computeNextWorkday } from '@/services/datetime'
import { defaultHolidayProvider } from '@/services/holidayProvider'

export default function TaskCenterPage({ onClose, onChanged }: { onClose?: () => void; onChanged?: () => void }) {
  const [tasks, setTasks] = useState<RecurringTask[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  // 维护者 2026-08-28：编辑中的任务（非 null → 弹窗处于编辑模式）
  const [editingTask, setEditingTask] = useState<RecurringTask | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<RecurringTask | null>(null)
  const [deleting, setDeleting] = useState(false)

  const loadTasks = () => {
    setLoading(true)
    try {
      const loaded = listRecurringTasks()
      setTasks(loaded)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTasks()
  }, [])

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const ok = await deleteRecurringTask(deleteTarget.id)
      if (ok) {
        setDeleteTarget(null)
        loadTasks()
        onChanged?.()
      } else {
        setError('删除失败')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setDeleting(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)

    const title = formData.get('title') as string
    const content = formData.get('content') as string
    const priority = formData.get('priority') as RecurringTask['priority']
    const cycle = formData.get('cycle') as RecurringCycle
    const interval = formData.get('interval') as RecurringInterval
    const startDate = formData.get('startDate') as string
    const endDate = formData.get('endDate') as string

    const pattern: RecurringPattern = {}

    if (cycle === 'WEEKLY') {
      const dayOfWeek = formData.getAll('dayOfWeek') as string[]
      // 维护者 2026-08-28：一个都没选 → 兜底周一至周五，避免生成 0 条
      pattern.dayOfWeek = dayOfWeek.length > 0 ? dayOfWeek.map((d) => parseInt(d)) : [1, 2, 3, 4, 5]
    } else if (cycle === 'MONTHLY') {
      const dayOfMonth = formData.getAll('dayOfMonth') as string[]
      pattern.dayOfMonth = dayOfMonth.length > 0 ? dayOfMonth.map((d) => parseInt(d)) : [1]
    } else if (cycle === 'YEARLY') {
      pattern.month = parseInt(formData.get('yearMonth') as string)
      pattern.day = parseInt(formData.get('yearDay') as string)
    }

    // 生效窗口：一周/一月/一年/永久 → 从今天起算 · 自定义 → 用表单起止
    const win = getEffectiveWindow(interval, startDate, endDate)

    try {
      if (editingTask) {
        updateRecurringTask({
          ...editingTask,
          title,
          content: content || undefined,
          priority,
          cycle,
          pattern,
          interval,
          startDate: win.start,
          endDate: win.end ?? undefined,
        })
      } else {
        createRecurringTask(
          title,
          content || undefined,
          priority,
          cycle,
          pattern,
          interval,
          win.start,
          win.end ?? undefined,
        )
      }
      // 新建/编辑后立即同步周期待办（重复数据由 sync 去重兜底）
      await syncRecurringTodos()
      setShowCreateModal(false)
      setEditingTask(null)
      loadTasks()
      onChanged?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const pendingCount = tasks.length
  // 预计 30 天内生成的待办数（按任务定义实时算）
  const totalGeneratedTodos = useMemo(() => {
    const now = formatLocalDate(new Date())
    const to = formatLocalDate(new Date(new Date(now).getTime() + 30 * 24 * 60 * 60 * 1000))
    return tasks.reduce((sum, t) => sum + calculateRecurringDates(t, now, to).length, 0)
  }, [tasks])

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: 'var(--radius)',
              background: 'var(--color-accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CalendarRange size={20} color="white" />
          </div>
          <h1 style={{ fontSize: '18px', fontWeight: 600, margin: 0, color: 'var(--color-text)' }}>
            周期性任务管理
          </h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => setShowCreateModal(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              background: 'var(--color-accent)',
              color: 'white',
              border: 'none',
              borderRadius: 'var(--radius)',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            <Plus size={14} />
            新增
          </button>
          {onClose && (
            <button
              onClick={onClose}
              style={{
                padding: '6px 12px',
                background: 'var(--color-bg-subtle)',
                color: 'var(--color-text)',
                border: '1px solid var(--color-border-thin)',
                borderRadius: 'var(--radius)',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '20px' }}>
        <div style={{ padding: '12px', background: 'var(--color-surface)', border: '1px solid var(--color-border-thin)', borderRadius: 'var(--radius-md)' }}>
          <div style={{ fontSize: '11.5px', color: 'var(--color-text-tertiary)', marginBottom: '4px' }}>周期性任务</div>
          <div style={{ fontSize: '20px', fontWeight: 600, color: 'var(--color-text)' }}>{pendingCount} 个</div>
        </div>
        <div style={{ padding: '12px', background: 'var(--color-surface)', border: '1px solid var(--color-border-thin)', borderRadius: 'var(--radius-md)' }}>
          <div style={{ fontSize: '11.5px', color: 'var(--color-text-tertiary)', marginBottom: '4px' }}>预计生成待办</div>
          <div style={{ fontSize: '20px', fontWeight: 600, color: 'var(--color-text)' }}>{totalGeneratedTodos} 条</div>
        </div>
        <div style={{ padding: '12px', background: 'var(--color-surface)', border: '1px solid var(--color-border-thin)', borderRadius: 'var(--radius-md)' }}>
          <div style={{ fontSize: '11.5px', color: 'var(--color-text-tertiary)', marginBottom: '4px' }}>状态</div>
          <div style={{ fontSize: '20px', fontWeight: 600, color: 'var(--color-status-success)' }}>正常</div>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-tertiary)' }}>加载中...</div>
      ) : tasks.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '50px 20px', background: 'var(--color-surface)', border: '1px solid var(--color-border-thin)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-tertiary)' }}>
          <CalendarRange size={40} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
          <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '6px', color: 'var(--color-text-secondary)' }}>暂无周期性任务</div>
          <div style={{ fontSize: '12.5px' }}>点击「新增」创建每日/每周/每月/每年重复的任务</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {tasks.map((task) => (
            <div key={task.id} style={{ padding: '14px', background: 'var(--color-surface)', border: '1px solid var(--color-border-thin)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                  <CheckCircle2 size={16} color="var(--color-status-success)" />
                  <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--color-text)' }}>{task.title}</span>
                  <span style={{ fontSize: '10.5px', padding: '2px 6px', background: 'var(--color-accent-subtle)', color: 'var(--color-accent)', borderRadius: 'var(--radius-sm)', textTransform: 'uppercase' }}>
                    {getCycleLabel(task.cycle)} · {getIntervalLabel(task.interval)}
                  </span>
                </div>
                {task.content && <div style={{ fontSize: '12.5px', color: 'var(--color-text-secondary)', marginBottom: '6px' }}>{task.content}</div>}
                <div style={{ fontSize: '11.5px', color: 'var(--color-text-tertiary)' }}>
                  <div>周期：{getCycleDescription(task.cycle, task.pattern)}</div>
                  <div>生效时间：{task.startDate} ~ {task.endDate || '永久'}</div>
                  <div>创建时间：{task.createdAt}</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  onClick={() => {
                    setEditingTask(task)
                    setShowCreateModal(true)
                  }}
                  title="编辑周期性任务"
                  style={{ padding: '6px 10px', background: 'var(--color-bg-subtle)', color: 'var(--color-text)', border: '1px solid var(--color-border-thin)', borderRadius: 'var(--radius)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 500, fontSize: '12px' }}
                >
                  <Pencil size={12} />
                  编辑
                </button>
                <button onClick={() => setDeleteTarget(task)} style={{ padding: '6px 10px', background: '#fee2e2', color: 'var(--color-status-danger)', border: 'none', borderRadius: 'var(--radius)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 500, fontSize: '12px' }}>
                  <Trash2 size={12} />
                  取消
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreateModal && (
          <CreateRecurringTaskModal
            editingTask={editingTask}
            onCancel={() => {
              setShowCreateModal(false)
              setEditingTask(null)
            }}
            onSubmit={handleSubmit}
          />
        )}
      {deleteTarget && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0, 0, 0, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-md)', padding: '20px', width: '400px', maxWidth: '90vw' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, margin: '0 0 10px', color: 'var(--color-text)' }}>取消周期性任务</h3>
            <div style={{ fontSize: '13px', lineHeight: 1.6, color: 'var(--color-text-secondary)', marginBottom: '14px' }}>
              <p style={{ margin: '0 0 6px' }}>确定要取消「{deleteTarget.title}」吗？</p>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-text-tertiary)' }}>已执行的历史记录会保留，只删除未执行的待办。</p>
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setDeleteTarget(null)} style={{ padding: '7px 14px', background: 'var(--color-bg-subtle)', color: 'var(--color-text)', border: '1px solid var(--color-border-thin)', borderRadius: 'var(--radius)', fontSize: '12.5px', fontWeight: 500, cursor: 'pointer' }}>暂不</button>
              <button onClick={() => void handleDelete()} disabled={deleting} style={{ padding: '7px 14px', background: 'var(--color-status-danger)', color: 'white', border: 'none', borderRadius: 'var(--radius)', fontSize: '12.5px', fontWeight: 500, cursor: deleting ? 'wait' : 'pointer' }}>
                {deleting ? '取消中…' : '确定取消'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================
// 工具函数
// ============================================================

function getEffectiveWindow(interval: RecurringInterval, start: string, end?: string): { start: string; end?: string } {
  const today = formatLocalDate(new Date())
  const now = new Date()
  switch (interval) {
    case 'ONE_WEEK':
      return { start: today, end: formatLocalDate(new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)) }
    case 'ONE_MONTH':
      return { start: today, end: formatLocalDate(new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)) }
    case 'ONE_YEAR':
      return { start: today, end: formatLocalDate(new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)) }
    case 'PERMANENT':
      return { start: today }
    case 'CUSTOM':
      return { start, end }
    default:
      return { start: today }
  }
}

/**
 * 按生效窗口计算预览执行日（不截断数据 · 只在渲染时折叠）
 * 维护者 2026-08-28：窗口跟随生效时间——选「一年」就算一整年的执行日
 */
function getNextExecutionDates(
  cycle: RecurringCycle,
  pattern: RecurringPattern,
  interval: RecurringInterval,
  startDate: string,
  endDate: string,
): { dates: string[]; total: number } {
  const now = formatLocalDate(new Date())
  const win = getEffectiveWindow(interval, startDate, endDate)
  const start = win.start || now
  const end = win.end ?? formatLocalDate(new Date(new Date(now).getTime() + 365 * 24 * 60 * 60 * 1000))
  const task: RecurringTask = {
    id: 0,
    title: '',
    priority: 'NORMAL',
    createdAt: '',
    cycle,
    pattern,
    interval,
    startDate: start,
    endDate: end,
  }
  const upcoming = calculateRecurringDates(task, start, end).filter((d) => d >= now)
  return { dates: upcoming, total: upcoming.length }
}

/** YYYY-MM-DD → 8月28日 周四 */
function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const wd = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
  return `${d.getMonth() + 1}月${d.getDate()}日 周${wd}`
}

// ============================================================
// 创建弹窗
// ============================================================

function CreateRecurringTaskModal({
  editingTask,
  onCancel,
  onSubmit,
}: {
  editingTask: RecurringTask | null
  onCancel: () => void
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void
}) {
  const today = formatLocalDate(new Date())
  const nextWorkday = computeNextWorkday(new Date(), (d) => defaultHolidayProvider.isHoliday(d))

  // 维护者 2026-08-28：受控表单 + 实时预览
  const [cycle, setCycle] = useState<RecurringCycle>(editingTask?.cycle ?? 'DAILY')
  const [interval, setInterval] = useState<RecurringInterval>(editingTask?.interval ?? 'ONE_WEEK')
  const [weekDays, setWeekDays] = useState<number[]>(editingTask?.pattern?.dayOfWeek ?? [1, 2, 3, 4, 5])
  const [monthDays, setMonthDays] = useState<number[]>(editingTask?.pattern?.dayOfMonth ?? [1])
  const [yearMonth, setYearMonth] = useState<number>(editingTask?.pattern?.month ?? 1)
  const [yearDay, setYearDay] = useState<number>(editingTask?.pattern?.day ?? 1)
  // 维护者 2026-08-28：自定义时间段起止（受控 · 预览随编辑实时变化）
  const [startDate, setStartDate] = useState<string>(editingTask?.startDate ?? today)
  const [endDate, setEndDate] = useState<string>(editingTask?.endDate ?? nextWorkday)
  // 维护者 2026-08-28：实时预览（随表单变化实时计算未来执行日 · 按生效窗口算完整计划）
  const preview = useMemo(() => {
    if (!cycle) return { dates: [], total: 0 }
    const pattern: RecurringPattern = {}
    if (cycle === 'WEEKLY') pattern.dayOfWeek = weekDays
    if (cycle === 'MONTHLY') pattern.dayOfMonth = monthDays
    if (cycle === 'YEARLY') { pattern.month = yearMonth; pattern.day = yearDay }
    return getNextExecutionDates(cycle, pattern, interval, startDate, endDate)
  }, [cycle, interval, weekDays, monthDays, yearMonth, yearDay, startDate, endDate])
  const previewDates = preview.dates
  const previewTotal = preview.total

  const toggleNum = (list: number[], n: number, setter: (v: number[]) => void) => {
    setter(list.includes(n) ? list.filter((x) => x !== n) : [...list, n])
  }

  const selectStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 10px',
    border: '1px solid var(--color-border-thin)',
    borderRadius: 'var(--radius)',
    fontSize: '13px',
    background: 'var(--color-bg)',
    color: 'var(--color-text)',
  }

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0, 0, 0, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-md)', padding: '20px', width: '580px', maxWidth: '90vw', maxHeight: '90vh', overflow: 'auto' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 16px', color: 'var(--color-text)' }}>
          {editingTask ? '编辑周期性任务' : '新增周期性任务'}
        </h2>
        <form onSubmit={onSubmit}>
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 500, marginBottom: '6px', color: 'var(--color-text)' }}>任务名称 *</label>
            <input name="title" type="text" required placeholder="例如：写月报" defaultValue={editingTask?.title ?? ''} style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-border-thin)', borderRadius: 'var(--radius)', fontSize: '13px', background: 'var(--color-bg)', color: 'var(--color-text)' }} />
          </div>
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 500, marginBottom: '6px', color: 'var(--color-text)' }}>任务内容</label>
            <textarea name="content" rows={2} placeholder="可选" defaultValue={editingTask?.content ?? ''} style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-border-thin)', borderRadius: 'var(--radius)', fontSize: '13px', background: 'var(--color-bg)', color: 'var(--color-text)', resize: 'vertical' }} />
          </div>
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 500, marginBottom: '6px', color: 'var(--color-text)' }}>优先级</label>
            <select name="priority" defaultValue={editingTask?.priority ?? 'NORMAL'} style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--color-border-thin)', borderRadius: 'var(--radius)', fontSize: '13px', background: 'var(--color-bg)', color: 'var(--color-text)' }}>
              <option value="NORMAL">正常</option>
              <option value="LOW">低</option>
              <option value="HIGH">高</option>
              <option value="URGENT">紧急</option>
            </select>
          </div>
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 500, marginBottom: '6px', color: 'var(--color-text)' }}>周期类型 *</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
              {(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as RecurringCycle[]).map((c) => (
                <label
                  key={c}
                  style={{
                    padding: '10px',
                    border: '1px solid',
                    borderColor: cycle === c ? 'var(--color-accent)' : 'var(--color-border-thin)',
                    borderRadius: 'var(--radius)',
                    cursor: 'pointer',
                    textAlign: 'center',
                    background: cycle === c ? 'var(--color-accent-subtle)' : 'var(--color-bg)',
                    color: cycle === c ? 'var(--color-accent)' : 'var(--color-text)',
                    userSelect: 'none',
                    transition: 'background 0.15s, border-color 0.15s',
                  }}
                >
                  <input
                    type="radio"
                    name="cycle"
                    value={c}
                    checked={cycle === c}
                    onChange={() => setCycle(c)}
                    required
                    style={{ display: 'none' }}
                  />
                  <div style={{ fontSize: '12px', fontWeight: cycle === c ? 600 : 500 }}>{getCycleLabel(c)}</div>
                </label>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 500, marginBottom: '6px', color: 'var(--color-text)' }}>周期详情 *</label>
            {cycle === 'DAILY' && (
              <div style={{ fontSize: '12.5px', color: 'var(--color-text-secondary)', padding: '6px 2px' }}>
                每天重复一次
              </div>
            )}
            {cycle === 'WEEKLY' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
                {['日', '一', '二', '三', '四', '五', '六'].map((day, i) => (
                  <label
                    key={i}
                    style={{
                      padding: '6px',
                      border: '1px solid',
                      borderColor: weekDays.includes(i) ? 'var(--color-accent)' : 'var(--color-border-thin)',
                      borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer',
                      textAlign: 'center',
                      fontSize: '11.5px',
                      background: weekDays.includes(i) ? 'var(--color-accent-subtle)' : 'var(--color-bg)',
                      color: weekDays.includes(i) ? 'var(--color-accent)' : 'var(--color-text)',
                      userSelect: 'none',
                      transition: 'background 0.15s, border-color 0.15s',
                    }}
                  >
                    <input type="checkbox" name="dayOfWeek" value={i} checked={weekDays.includes(i)} onChange={() => toggleNum(weekDays, i, setWeekDays)} style={{ display: 'none' }} />
                    {day}
                  </label>
                ))}
              </div>
            )}
            {cycle === 'MONTHLY' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', maxHeight: '120px', overflowY: 'auto' }}>
                {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                  <label
                    key={day}
                    style={{
                      padding: '5px',
                      border: '1px solid',
                      borderColor: monthDays.includes(day) ? 'var(--color-accent)' : 'var(--color-border-thin)',
                      borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer',
                      textAlign: 'center',
                      fontSize: '11px',
                      background: monthDays.includes(day) ? 'var(--color-accent-subtle)' : 'var(--color-bg)',
                      color: monthDays.includes(day) ? 'var(--color-accent)' : 'var(--color-text)',
                      userSelect: 'none',
                      transition: 'background 0.15s, border-color 0.15s',
                    }}
                  >
                    <input type="checkbox" name="dayOfMonth" value={day} checked={monthDays.includes(day)} onChange={() => toggleNum(monthDays, day, setMonthDays)} style={{ display: 'none' }} />
                    {day}日
                  </label>
                ))}
              </div>
            )}
            {cycle === 'YEARLY' && (
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <label style={{ fontSize: '12px', color: 'var(--color-text)' }}>月份</label>
                <select name="yearMonth" value={yearMonth} onChange={(e) => setYearMonth(Number(e.target.value))} style={{ padding: '5px 8px', border: '1px solid var(--color-border-thin)', borderRadius: 'var(--radius-sm)', fontSize: '12px', background: 'var(--color-bg)', color: 'var(--color-text)' }}>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{m}月</option>)}
                </select>
                <label style={{ fontSize: '12px', color: 'var(--color-text)' }}>日期</label>
                <select name="yearDay" value={yearDay} onChange={(e) => setYearDay(Number(e.target.value))} style={{ padding: '5px 8px', border: '1px solid var(--color-border-thin)', borderRadius: 'var(--radius-sm)', fontSize: '12px', background: 'var(--color-bg)', color: 'var(--color-text)' }}>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}日</option>)}
                </select>
              </div>
            )}
          </div>
          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 500, marginBottom: '6px', color: 'var(--color-text)' }}>生效时间 *</label>
            <select name="interval" value={interval} onChange={(e) => setInterval(e.target.value as RecurringInterval)} style={selectStyle}>
              <option value="ONE_WEEK">一周</option>
              <option value="ONE_MONTH">一月</option>
              <option value="ONE_YEAR">一年</option>
              <option value="PERMANENT">永久</option>
              <option value="CUSTOM">自定义时间段</option>
            </select>
            <div style={{ display: interval === 'CUSTOM' ? 'block' : 'none', marginTop: '10px' }}>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 500, marginBottom: '6px', color: 'var(--color-text)' }}>开始日期</label>
              <input name="startDate" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={selectStyle} />
            </div>
            <div style={{ display: interval === 'CUSTOM' ? 'block' : 'none', marginTop: '10px' }}>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 500, marginBottom: '6px', color: 'var(--color-text)' }}>结束日期</label>
              <input name="endDate" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={selectStyle} />
            </div>
          </div>
          {/* 维护者 2026-08-28：实时预览预计执行日期（随表单变化即时更新） */}
          <div style={{ marginBottom: '14px', padding: '10px 12px', background: 'var(--color-accent-subtle)', border: '1px solid var(--color-accent)', borderRadius: 'var(--radius)', fontSize: '12.5px', color: 'var(--color-text)' }}>
            <div style={{ fontWeight: 600, marginBottom: '4px' }}>预计执行</div>
            {previewDates.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                {/* 维护者 2026-08-28：窗口内完整执行计划 · 只显示前 8 个，放不下折叠成 … 共 N 次 */}
                {previewDates.slice(0, 8).map((d) => (
                  <span key={d} style={{ padding: '2px 8px', background: 'var(--color-bg)', border: '1px solid var(--color-border-thin)', borderRadius: 'var(--radius-sm)', fontSize: '11.5px', color: 'var(--color-text-secondary)' }}>
                    {formatShortDate(d)}
                  </span>
                ))}
                {previewTotal > 8 && (
                  <span style={{ fontSize: '11.5px', color: 'var(--color-text-tertiary)' }}>
                    … 共 {previewTotal} 次
                  </span>
                )}
              </div>
            ) : (
              <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }}>
                生效时间内没有可执行的日期，请检查周期设置
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '16px' }}>
            <button type="button" onClick={onCancel} style={{ padding: '7px 16px', background: 'var(--color-bg-subtle)', color: 'var(--color-text)', border: '1px solid var(--color-border-thin)', borderRadius: 'var(--radius)', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>取消</button>
            <button type="submit" style={{ padding: '7px 16px', background: 'var(--color-accent)', color: 'white', border: 'none', borderRadius: 'var(--radius)', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>{editingTask ? '保存' : '创建'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ============================================================
// 工具函数
// ============================================================

function getCycleLabel(cycle: RecurringCycle): string {
  const labels: Record<RecurringCycle, string> = { DAILY: '每日', WEEKLY: '每周', MONTHLY: '每月', YEARLY: '每年' }
  return labels[cycle]
}

function getCycleDescription(cycle: RecurringCycle, pattern: RecurringPattern): string {
  switch (cycle) {
    case 'DAILY':
      return '每天'
    case 'WEEKLY':
      if (pattern.dayOfWeek && pattern.dayOfWeek.length > 0) {
        const days = pattern.dayOfWeek.map((d) => ['日', '一', '二', '三', '四', '五', '六'][d])
        return `每周${days.join('/')}`
      }
      return '每周'
    case 'MONTHLY':
      if (pattern.dayOfMonth && pattern.dayOfMonth.length > 0) {
        const days = pattern.dayOfMonth.map((d) => `${d}日`)
        return `每月${days.join('/')}`
      }
      return '每月'
    case 'YEARLY':
      if (pattern.month && pattern.day) {
        return `${pattern.month}月${pattern.day}日`
      }
      return '每年'
    default:
      return ''
  }
}

function getIntervalLabel(interval: RecurringInterval): string {
  const labels: Record<RecurringInterval, string> = { ONE_WEEK: '一周', ONE_MONTH: '一月', ONE_YEAR: '一年', PERMANENT: '永久', CUSTOM: '自定义' }
  return labels[interval]
}
