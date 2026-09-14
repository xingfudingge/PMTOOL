/**
 * PMTool · 自动化调度器（2026-09-11 重构）
 *
 * 统一任务模型（带工作日感知 + 顺延 + 持久化执行记录 + 启动补偿）：
 *   - 自动备份 backup     ：每天 backupTime
 *   - 任务自动顺延 postpone：每天 postponeTime
 *   - 日报 daily          ：每天 autoDailyReportTime（可选是否跳过工作日）
 *   - 周报 weekly         ：每周 autoWeeklyReportDay（默认周五，可选每周最后一个工作日）+ autoWeeklyReportTime
 *   - 月报 monthly        ：每月 autoMonthlyReportDay（默认月末，可选每月最后一个工作日）+ autoMonthlyReportTime
 *
 * 关键修复（vs 旧版）：
 *   1. 报告生成统一走 reportGenerator.generateAutomationReport（真正调 createReport 落库），
 *      旧版直接调 generateDailyReport 只返回字符串、从不写库。
 *   2. 周报/月报不再缺 dailyReportsInPeriod / nextPeriodTodos 参数（旧版必 throw）。
 *   3. 用持久化执行记录（autoTask_lastRun_*）替代内存 lastRef，重启后仍能判断错过。
 *   4. 轮询间隔 406ms → 30s。
 *   5. 启动补偿：检查最近应触发未执行的定时任务，弹窗三选（执行/取消/不再提醒）。
 *
 * 局限：应用开启时才执行（桌面工具可接受）。
 */

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Clock, X as XIcon } from 'lucide-react'
import { useSettings } from './SettingsProvider'
import { backupData, setSetting as apiSetSetting } from '@/services/settings'
import { executeAutoPostpone } from '@/services/todo'
import { formatLocalDate, computeNextWorkday, endOfWeek, endOfMonth } from '@/services/datetime'
import { defaultHolidayProvider } from '@/services/holidayProvider'

const AutomationContext = createContext<unknown>(null)
export function useAutomation() {
  return useContext(AutomationContext)
}

// ── 任务类型定义 ──────────────────────────────────────────────
type TaskType = 'backup' | 'postpone' | 'daily' | 'weekly' | 'monthly'

interface TaskSpec {
  type: TaskType
  label: string
  enabledKey: string
  timeKey: string
  /** 仅日报：非工作日跳过开关 key（1=非工作日跳过不生成） */
  carryoverKey?: string
  /** 仅周报：周几（1=周一..7=周日，默认5=周五）或 'lastworkday'=每周最后一个工作日 */
  dayKey?: string
  /** 仅月报：几号（数字或 'last'=月末 或 'lastworkday'=每月最后一个工作日） */
  monthDayKey?: string
  /** 仅报告类：是否生成个人报告 */
  personalKey?: string
  /** 仅报告类：是否生成项目报告（全部在办项目各一份） */
  projectKey?: string
}

const TASKS: TaskSpec[] = [
  { type: 'backup', label: '自动备份', enabledKey: 'autoBackup', timeKey: 'backupTime' },
  { type: 'postpone', label: '任务自动顺延', enabledKey: 'autoPostpone', timeKey: 'postponeTime' },
  {
    type: 'daily', label: '日报自动生成', enabledKey: 'autoDailyReport',
    timeKey: 'autoDailyReportTime', carryoverKey: 'autoDailyReportCarryover',
    personalKey: 'autoDailyReportPersonal', projectKey: 'autoDailyReportProject',
  },
  {
    type: 'weekly', label: '周报自动生成', enabledKey: 'autoWeeklyReport',
    timeKey: 'autoWeeklyReportTime', dayKey: 'autoWeeklyReportDay',
    personalKey: 'autoWeeklyReportPersonal', projectKey: 'autoWeeklyReportProject',
  },
  {
    type: 'monthly', label: '月报自动生成', enabledKey: 'autoMonthlyReport',
    timeKey: 'autoMonthlyReportTime', monthDayKey: 'autoMonthlyReportDay',
    personalKey: 'autoMonthlyReportPersonal', projectKey: 'autoMonthlyReportProject',
  },
]

// ── 持久化执行记录 key（存到后端 system_config）─────────────────
function lastRunKey(t: TaskType): string { return `autoTask_lastRun_${t}` }
function ignoredKey(t: TaskType): string { return `autoTask_ignored_${t}` }

// ── 日期/时间工具 ──────────────────────────────────────────────
function hhmm(mark: Date = new Date()): string {
  return `${String(mark.getHours()).padStart(2, '0')}:${String(mark.getMinutes()).padStart(2, '0')}`
}

function isTimeReached(time: string, mark: Date = new Date()): boolean {
  if (!time) return false
  return hhmm(mark) >= time
}

/** 本周内指定星期几的日期（1=周一..7=周日） */
function thisWeekdayDate(dayIdx: number, now: Date): string {
  const iso = now.getDay() === 0 ? 7 : now.getDay() // 周日→7
  const diff = dayIdx - iso
  const d = new Date(now)
  d.setDate(now.getDate() + diff)
  return formatLocalDate(d)
}

/** 本月内指定日期的日期（数字，超出月末则 clamp；'last'=月末） */
function thisMonthDate(dayNum: string, now: Date): string {
  const y = now.getFullYear()
  const m = now.getMonth()
  const last = new Date(y, m + 1, 0).getDate()
  const dd = dayNum === 'last' || !dayNum ? last : Math.min(parseInt(dayNum, 10) || last, last)
  return formatLocalDate(new Date(y, m, dd))
}

/** 本周最后一个工作日（参考法定节假日与调休上班日） */
function thisWeekLastWorkday(now: Date): string {
  let d = new Date(endOfWeek(now))
  for (let i = 0; i < 7; i++) {
    const dateStr = formatLocalDate(d)
    if (defaultHolidayProvider.isWorkday(dateStr)) return dateStr
    d.setDate(d.getDate() - 1)
  }
  // 理论上不会发生，兜底返回周日
  return endOfWeek(now)
}

/** 本月最后一个工作日（参考法定节假日与调休上班日） */
function thisMonthLastWorkday(now: Date): string {
  let d = new Date(endOfMonth(now))
  for (let i = 0; i < 31; i++) {
    const dateStr = formatLocalDate(d)
    if (defaultHolidayProvider.isWorkday(dateStr)) return dateStr
    d.setDate(d.getDate() - 1)
  }
  // 理论上不会发生，兜底返回月末
  return endOfMonth(now)
}

/**
 * 计算任务“本周期应触发日期”。
 * 返回 YYYY-MM-DD；若本周期决定跳过则返回 null。
 */
function computeTargetDate(t: TaskSpec, s: Record<string, string>, now: Date): string | null {
  const today = formatLocalDate(now)
  if (t.type === 'backup' || t.type === 'postpone') return today

  if (t.type === 'daily') {
    const skip = (s[t.carryoverKey ?? ''] ?? '') === '1'
    if (skip && !defaultHolidayProvider.isWorkday(today)) {
      // 非工作日直接跳过，不生成日报
      return null
    }
    return today
  }

  if (t.type === 'weekly') {
    const dayRaw = s[t.dayKey ?? ''] ?? '5'
    if (dayRaw === 'lastworkday') {
      return thisWeekLastWorkday(now)
    }
    const day = parseInt(dayRaw, 10) || 5
    return thisWeekdayDate(day, now)
  }

  // monthly
  const dayRaw = s[t.monthDayKey ?? ''] ?? 'last'
  if (dayRaw === 'lastworkday') {
    return thisMonthLastWorkday(now)
  }
  return thisMonthDate(dayRaw, now)
}

// ── 执行调度 ──────────────────────────────────────────────────

/** 真正执行一个任务（落库/写操作），返回是否成功 */
async function dispatchTask(t: TaskSpec, s: Record<string, string>): Promise<boolean> {
  try {
    const now = new Date()
    if (t.type === 'backup') {
      const dir = s.backupDir
      if (!dir) return false
      await backupData(dir)
    } else if (t.type === 'postpone') {
      await executeAutoPostpone(formatLocalDate(now), defaultHolidayProvider)
    } else {
      // daily / weekly / monthly → 按启用范围生成（个人与项目可同时开 · 不互斥）
      const { generateAutomationReport, getPeriodKey } = await import('@/services/reportGenerator')
      let any = false
      if ((s[t.personalKey ?? ''] ?? '') === '1') {
        const r = await generateAutomationReport(t.type, 'personal')
        console.log('[AutoDiag]', t.type, 'personal scope:', r, 'period=', getPeriodKey(t.type))
        any = true
      }
      if ((s[t.projectKey ?? ''] ?? '') === '1') {
        const r = await generateAutomationReport(t.type, 'project')
        console.log('[AutoDiag]', t.type, 'project scope:', r, 'period=', getPeriodKey(t.type))
        any = true
      }
      if (!any) return false
    }
    return true
  } catch (e) {
    console.warn('[AutoDiag]', t.type, 'dispatch ERR:', e)
    return false
  }
}

/** 写持久化执行记录（成功执行后调用） */
async function markRun(s: Record<string, string>, t: TaskType, date: string) {
  s[lastRunKey(t)] = date
  try { await apiSetSetting(lastRunKey(t), date) } catch { /* 忽略 */ }
}

/** 写“不再提醒”忽略标记 */
async function markIgnored(s: Record<string, string>, t: TaskType, date: string) {
  s[ignoredKey(t)] = date
  try { await apiSetSetting(ignoredKey(t), date) } catch { /* 忽略 */ }
}

/** 任务是否开启：backup/postpone 看主开关；报告类只看个人或项目任一开启（二者可同时 · 不互斥，都关则停用） */
function taskActive(t: TaskSpec, s: Record<string, string>): boolean {
  if (t.type === 'backup' || t.type === 'postpone') {
    return (s[t.enabledKey] ?? '') === '1'
  }
  const p = (s[t.personalKey ?? ''] ?? '') === '1'
  const pr = (s[t.projectKey ?? ''] ?? '') === '1'
  return p || pr
}

/**
 * 判断任务是否“应触发”（含到点 + 周期未执行）。
 * 返回 true 表示本次 tick 应执行。
 */
function shouldFire(t: TaskSpec, s: Record<string, string>, now: Date): boolean {
  if (!taskActive(t, s)) return false
  const time = s[t.timeKey] ?? ''
  if (!time) return false
  const target = computeTargetDate(t, s, now)
  if (target === null) return false      // 本周期跳过（如日报非工作日）
  const today = formatLocalDate(now)
  // 已执行过 / 已被“不再提醒”跳过 → 不重复
  if (s[lastRunKey(t.type)] === target) return false
  if (s[ignoredKey(t.type)] === target) return false
  // 到目标日期且到点
  if (target < today) return true      // 错过（补触发）
  if (target > today) return false     // 未来
  return isTimeReached(time, now)      // 今天到点
}

/** 收集启动补偿：本周期应触发但未执行的任务列表 */
function collectMissed(s: Record<string, string>): TaskSpec[] {
  const now = new Date()
  const today = formatLocalDate(now)
  const missed: TaskSpec[] = []
  for (const t of TASKS) {
    if (!taskActive(t, s)) continue
    if (!(s[t.timeKey] ?? '')) continue
    const target = computeTargetDate(t, s, now)
    if (target === null) continue                      // 本周期跳过（如日报非工作日）
    if (target > today) continue                       // 未来，未到触发
    if (s[lastRunKey(t.type)] === target) continue     // 已执行
    if (s[ignoredKey(t.type)] === target) continue     // 已“不再提醒”
    // 到点才算错过（今天未到时间不算）
    if (target === today && !isTimeReached(s[t.timeKey] ?? '', now)) continue
    missed.push(t)
  }
  return missed
}

// ── Provider ─────────────────────────────────────────────────
export function AutomationProvider({ children }: { children: ReactNode }) {
  const { settings, save } = useSettings()
  // 用 ref 持有最新 settings（tick 闭包只创建一次）
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  // 补偿弹窗状态
  const [missed, setMissed] = useState<TaskSpec[] | null>(null)

  // 每次开机/刷新只跑一次补偿检查（settings 加载完成后）
  // 启动补偿提醒总开关：设置里可关；在弹窗点「不再提醒」也会关掉，需到设置→自动化重新开启
  useEffect(() => {
    if (Object.keys(settings).length === 0) return
    if ((settings.autoCompensationReminder ?? '0') !== '1') return
    const m = collectMissed(settings)
    if (m.length > 0) setMissed(m)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings])

  // 常驻调度器：每 30s 检查
  useEffect(() => {
    const tick = async () => {
      const s = settingsRef.current
      const now = new Date()
      for (const t of TASKS) {
        const _fire = shouldFire(t, s, now)
        console.log('[AutoDiag]', t.type, 'enabled=', JSON.stringify(s[t.enabledKey]), 'personal=', JSON.stringify(s[t.personalKey ?? '']), 'project=', JSON.stringify(s[t.projectKey ?? '']), 'time=', JSON.stringify(s[t.timeKey]), 'lastRun=', JSON.stringify(s[lastRunKey(t.type)]), 'ignored=', JSON.stringify(s[ignoredKey(t.type)]), 'fl=', JSON.stringify(s[t.dayKey ?? '']), JSON.stringify(s[t.monthDayKey ?? '']), 'active=', taskActive(t, s), 'fire=', _fire, 'now=', formatLocalDate(now), hhmm(now))
        if (!_fire) continue
        try {
          const ok = await dispatchTask(t, s)
          console.log('[AutoDiag]', t.type, 'dispatch=', ok)
          const runDate = computeTargetDate(t, s, now)
          if (ok && runDate) await markRun(s, t.type, runDate)
        } catch (e) {
          console.log('[AutoDiag]', t.type, 'dispatch-ERR', e)
        }
      }
    }
    const timer = setInterval(() => void tick(), 30000)
    void tick()
    return () => clearInterval(timer)
  }, [])

  // 补偿行为
  const runMissed = async () => {
    const s = settingsRef.current
    if (!missed) return
    const now = new Date()
    for (const t of missed) {
      const ok = await dispatchTask(t, s)
      const runDate = computeTargetDate(t, s, now)
      if (ok && runDate) await markRun(s, t.type, runDate)
      else if (runDate) await markIgnored(s, t.type, runDate)
    }
    setMissed(null)
  }
  const cancelMissed = () => setMissed(null)
  const ignoreMissed = async () => {
    const s = settingsRef.current
    if (!missed) return
    // 点「不再提醒」＝关闭启动补偿提醒功能 · 需到设置→自动化重新开启
    // 用 useSettings().save 而非 apiSetSetting：save 会同步更新内存 state（开关才立即熄灭）+ 写后端
    await save('autoCompensationReminder', '0')
    setMissed(null)
  }

  return (
    <AutomationContext.Provider value={{ runMissed, cancelMissed, ignoreMissed }}>
      {missed && (
        <AutomationCompensationModal
          tasks={missed}
          onRun={runMissed}
          onCancel={cancelMissed}
          onIgnore={ignoreMissed}
        />
      )}
      {children}
    </AutomationContext.Provider>
  )
}

// ── 补偿弹窗 ──────────────────────────────────────────────────
function AutomationCompensationModal({
  tasks,
  onRun,
  onCancel,
  onIgnore,
}: {
  tasks: TaskSpec[]
  onRun: () => void
  onCancel: () => void
  onIgnore: () => void
}) {
  return createPortal(
    <div
      role="dialog"
      data-testid="automation-compensation-modal"
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2147483647,
        background: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        animation: 'automationFadeIn 0.15s ease-out',
      }}
    >
      <style>{`
        @keyframes automationFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes automationScaleIn { from { transform: scale(0.92); opacity: 0; } to { transform: scale(1); opacity: 1; } }
      `}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--color-surface)',
          borderRadius: 12,
          padding: '20px 24px',
          maxWidth: 460,
          width: '100%',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.4), 0 0 0 3px var(--color-status-warning)',
          animation: 'automationScaleIn 0.18s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Clock size={20} strokeWidth={2} color="var(--color-status-warning)" />
          <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-text)', margin: 0, flex: 1 }}>
            有定时任务未执行
          </h3>
          <button
            type="button"
            onClick={onCancel}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--color-text-tertiary)', borderRadius: 4 }}
            aria-label="关闭"
          >
            <XIcon size={16} strokeWidth={1.75} />
          </button>
        </div>

        <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: 12, lineHeight: 1.6 }}>
          应用未开启期间，以下{' '}
          <strong style={{ color: 'var(--color-status-warning)' }}>{tasks.length}</strong>
          {' '}个定时任务到点未执行。是否立即执行？
          <br />
          选「不再提醒」将关闭此提醒，需到设置 → 自动化重新开启。
        </div>

        <ul
          style={{
            margin: '0 0 16px',
            padding: '6px 14px',
            background: 'var(--color-bg-subtle)',
            border: '1px solid var(--color-border-thin)',
            borderRadius: 'var(--radius)',
            listStyle: 'none',
            maxHeight: 180,
            overflowY: 'auto',
          }}
        >
          {tasks.map((t) => (
            <li
              key={t.type}
              style={{ fontSize: '12px', color: 'var(--color-text-secondary)', padding: '6px 0', borderBottom: '1px solid var(--color-border-thin)', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Clock size={12} strokeWidth={1.75} color="var(--color-accent)" />
              <span style={{ flex: 1 }}>{t.label}</span>
            </li>
          ))}
        </ul>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            data-testid="automation-neglect-btn"
            onClick={onIgnore}
            style={{ padding: '7px 14px', background: 'var(--color-bg-subtle)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border-thin)', borderRadius: 6, fontSize: '12px', cursor: 'pointer' }}
          >
            不再提醒（关闭）
          </button>
          <button
            type="button"
            data-testid="automation-cancel-btn"
            onClick={onCancel}
            style={{ padding: '7px 18px', background: 'var(--color-bg-subtle)', color: 'var(--color-text)', border: '1px solid var(--color-border-thin)', borderRadius: 6, fontSize: '12.5px', cursor: 'pointer' }}
          >
            取消
          </button>
          <button
            type="button"
            data-testid="automation-run-btn"
            onClick={onRun}
            autoFocus
            style={{ padding: '7px 22px', background: 'var(--color-accent)', color: 'var(--color-text-on-accent)', border: 'none', borderRadius: 6, fontSize: '12.5px', fontWeight: 500, cursor: 'pointer', boxShadow: '0 0 0 2px var(--color-accent-subtle)' }}
          >
            立即执行
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
