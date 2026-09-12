/**
 * PMTool · 设置全局上下文（2026-09-09）
 *
 * 启动时加载全部设置，提供 get/save；并把「外观」主题应用到 documentElement（light/dark/auto）。
 * Layout 顶栏主题开关、设置中心「外观」共用这里，做到单一数据源 + 持久化。
 */

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { getSettings, setSetting as apiSetSetting } from '@/services/settings'

/** 设置键常量 */
export const SETTING_KEYS = {
  theme: 'theme',
  color: 'color',
  userName: 'userName',
  userEmail: 'userEmail',
  userRole: 'userRole',
  fontSize: 'fontSize',
  autoBackup: 'autoBackup',
  backupTime: 'backupTime',
  backupDir: 'backupDir',
  autoPostpone: 'autoPostpone',
  postponeTime: 'postponeTime',
  autoCompensationReminder: 'autoCompensationReminder',
  holidaySources: 'holidaySources',
  holidayActive: 'holidayActive',
  holidaySyncPeriod: 'holidaySyncPeriod',
  holidayLastSync: 'holidayLastSync',
  autoDailyReport: 'autoDailyReport',
  autoDailyReportTime: 'autoDailyReportTime',
  autoDailyReportCarryover: 'autoDailyReportCarryover',
  autoDailyReportPersonal: 'autoDailyReportPersonal',
  autoDailyReportProject: 'autoDailyReportProject',
  autoWeeklyReport: 'autoWeeklyReport',
  autoWeeklyReportTime: 'autoWeeklyReportTime',
  autoWeeklyReportDay: 'autoWeeklyReportDay',
  autoWeeklyReportCarryover: 'autoWeeklyReportCarryover',
  autoWeeklyReportPersonal: 'autoWeeklyReportPersonal',
  autoWeeklyReportProject: 'autoWeeklyReportProject',
  autoMonthlyReport: 'autoMonthlyReport',
  autoMonthlyReportTime: 'autoMonthlyReportTime',
  autoMonthlyReportDay: 'autoMonthlyReportDay',
  autoMonthlyReportCarryover: 'autoMonthlyReportCarryover',
  autoMonthlyReportPersonal: 'autoMonthlyReportPersonal',
  autoMonthlyReportProject: 'autoMonthlyReportProject',
} as const

export type ThemeMode = 'light' | 'dark' | 'auto'

export interface SettingsApi {
  /** 全部设置（key -> value） */
  settings: Record<string, string>
  /** 读取某项 */
  get: (key: string) => string | null
  /** 保存某项：先写本地状态(立即生效) + 写后端(持久化) */
  save: (key: string, value: string) => Promise<void>
  /** 当前有效主题（'light' | 'dark'，auto 已解析） */
  resolvedTheme: 'light' | 'dark'
  themeMode: ThemeMode
}

const SettingsContext = createContext<SettingsApi | null>(null)

const THEME_DEFAULT: ThemeMode = 'auto'

function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'dark') return 'dark'
  if (mode === 'light') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(mode: ThemeMode) {
  const resolved = resolveTheme(mode)
  if (resolved === 'dark') document.documentElement.setAttribute('data-theme', 'dark')
  else document.documentElement.removeAttribute('data-theme')
  return resolved
}

/** 计算主色明暗派生（走纯 hex 运算，避免依赖 color-mix 兼容性） */
function shiftHex(hex: string, amt: number): string {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(full, 16)
  const r = Math.max(0, Math.min(255, ((n >> 16) & 0xff) + amt))
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amt))
  const b = Math.max(0, Math.min(255, (n & 0xff) + amt))
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

function applyColor(hex: string) {
  if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex)) return
  const style = document.documentElement.style
  style.setProperty('--color-accent', hex)
  style.setProperty('--color-accent-hover', shiftHex(hex, -30))
  style.setProperty('--color-accent-active', shiftHex(hex, -60))
  // 浅色衬底用 12% 透明度叠加在主色上
  style.setProperty('--primary', hex)
}

/** 字号缩放 · App 全量用 px 布局（index.css 14px + 各页 px 内联），
 *  改根字号/--font-scale 对 px 无效（无任何元素消费 --font-scale）。
 *  改用 documentElement 的 css zoom 做整体缩放，匹配设置区「主题、字体、间距」统一缩放意图。 */
function applyFontScale(mode: string) {
  const scale = mode === 'compact' ? 0.88 : mode === 'large' ? 1.12 : 1
  document.documentElement.style.setProperty('--font-scale', String(scale))
  document.documentElement.style.zoom = String(scale)
}

function applyAppearance(settings: Record<string, string>) {
  if (settings.theme) applyTheme(settings.theme as ThemeMode)
  if (settings.color) applyColor(settings.color)
  if (settings.fontSize) applyFontScale(settings.fontSize)
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [themeMode, setThemeMode] = useState<ThemeMode>(THEME_DEFAULT)
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    let alive = true
    getSettings()
      .then((all) => {
        if (!alive) return
        setSettings(all)
        const mode = (all.theme as ThemeMode) || THEME_DEFAULT
        setThemeMode(mode)
        setResolvedTheme(applyTheme(mode))
        applyAppearance(all)
      })
      .catch((e) => console.error('[SettingsProvider] load settings:', e))
    return () => {
      alive = false
    }
  }, [])

  // auto 模式下监听系统主题变化
  useEffect(() => {
    if (themeMode !== 'auto') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setResolvedTheme(applyTheme('auto'))
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [themeMode])

  const get = useCallback((key: string) => settings[key] ?? null, [settings])

  const save = useCallback(async (key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
    if (key === SETTING_KEYS.theme) {
      const mode = value as ThemeMode
      setThemeMode(mode)
      setResolvedTheme(applyTheme(mode))
    }
    if (key === SETTING_KEYS.color || key === SETTING_KEYS.fontSize) {
      applyAppearance({ [key]: value })
    }
    try {
      await apiSetSetting(key, value)
    } catch (e) {
      console.error('[SettingsProvider] save setting:', key, e)
    }
  }, [])

  const value: SettingsApi = {
    settings,
    get,
    save,
    resolvedTheme,
    themeMode,
  }

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings(): SettingsApi {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider')
  return ctx
}
