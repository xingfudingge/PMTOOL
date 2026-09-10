/**
 * PMTool · 自动化调度器（2026-09-09）
 *
 * 每 30s 检查设置开关+时间，到点执行：自动备份 / 任务自动顺延 / 日报周报月报自动生成。
 * 复用现有前端逻辑：backup_data 命令、todo.ts executeAutoPostpone、reportBuilder。
 * 局限：应用开启时才执行（桌面工具可接受）。
 */

import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react'
import { useSettings, SETTING_KEYS } from './SettingsProvider'
import { backupData } from '@/services/settings'
import { executeAutoPostpone } from '@/services/todo'

const AutomationContext = createContext<unknown>(null)
export function useAutomation() {
  return useContext(AutomationContext)
}

function hhmm(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
function todayKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function due(enabled: string, time: string, last: Record<string, string>, tag: string): boolean {
  if (enabled !== '1') return false
  if (!time) return false
  if (hhmm() < time) return false
  if (last[tag] === todayKey()) return false
  return true
}

async function dispatchReport(type: 'daily' | 'weekly' | 'monthly') {
  // 复用报告中心生成入口；缺少上下文由其兜底（数据不全时抛错 → 记录并跳过）
  const { generateDailyReport, generateReport } = await import('@/services/reportBuilder')
  const { listTodos } = await import('@/services/todo')
  const { listProjects } = await import('@/services/project')
  const tod = new Date()
  const period = tod.toISOString().slice(0, 10)
  try {
    const projects = await listProjects()
    const todos = await listTodos({})
    if (type === 'daily') {
      await generateDailyReport({ todayContent: '', nextContent: '', todos, projects, period, onlyPersonal: true })
    } else {
      // 周/月报需要聚合周期日报 + 下周/下月计划，数据缺口时由生成器报错
      await generateReport({ type, todayContent: '', nextContent: '', todos, projects, period } as never)
    }
  } catch (e) {
    console.warn('[Automation] report gen requires period data, skipped:', type, e)
  }
}

export function AutomationProvider({ children }: { children: ReactNode }) {
  const { get } = useSettings()
  const lastRef = useRef<Record<string, string>>({})

  useEffect(() => {
    const tick = async () => {
      const last = lastRef.current

      if (due(get('autoBackup') ?? '', get('backupTime') ?? '', last, 'backup')) {
        const dir = get('backupDir')
        if (dir) {
          try {
            await backupData(dir)
            last.backup = todayKey()
          } catch (e) {
            console.warn('[Automation] backup failed:', e)
          }
        }
      }

      if (due(get('autoPostpone') ?? '', get('postponeTime') ?? '', last, 'postpone')) {
        try {
          const { defaultHolidayProvider } = await import('@/services/holidayProvider')
          await executeAutoPostpone(new Date().toISOString().slice(0, 10), defaultHolidayProvider)
          last.postpone = todayKey()
        } catch (e) {
          console.warn('[Automation] postpone failed:', e)
        }
      }

      const reportDefs: [string, string, 'daily' | 'weekly' | 'monthly'][] = [
        ['autoDailyReport', 'autoDailyReportTime', 'daily'],
        ['autoWeeklyReport', 'autoWeeklyReportTime', 'weekly'],
        ['autoMonthlyReport', 'autoMonthlyReportTime', 'monthly'],
      ]
      for (const [enKey, tKey, type] of reportDefs) {
        const tag = `report_${type}`
        if (due(get(enKey) ?? '', get(tKey) ?? '', last, tag)) {
          try {
            await dispatchReport(type)
            last[tag] = todayKey()
          } catch (e) {
            console.warn('[Automation] report skipped:', type, e)
          }
        }
      }
    }

    const timer = setInterval(() => void tick(), 406)
    void tick()
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <AutomationContext.Provider value={null}>{children}</AutomationContext.Provider>
}
