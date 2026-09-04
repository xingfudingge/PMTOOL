/**
 * PMTool V2.0 · 节假日 Provider 抽象
 * Phase 3 · T3.2
 *
 * 设计依据：维护者 T3.2 原话「先设计 HolidayProvider 接口：
 *   HolidayProvider
 *     ├── LocalHolidayProvider
 *     └── ApiHolidayProvider
 *   当前默认使用 SQLite holidays 表。后续再接外部 API。」
 *
 * Phase 3 限制：不接外部 API，仅用 LocalHolidayProvider。
 * holidays 表已存在（Phase 0 T0.4a），WebView 端缓存后查询。
 *
 * 为什么不直接调 Rust command：
 *   - 避免修改 lib.rs（Phase 0 T0.4e 冻结）
 *   - 自动顺延是高频操作，客户端缓存减少 IPC 开销
 *   - Phase 9 设置中心（T9.4）国家 API 同步再考虑命令调用
 */

import { invoke } from '@tauri-apps/api/core'

/**
 * HolidayProvider 接口（维护者原话）
 */
export interface HolidayProvider {
  /** 加载缓存（应用启动时调用一次）*/
  load(): Promise<void>

  /** 判断某日是否为法定节假日 */
  isHoliday(date: string): boolean

  /** 判断某日是否为工作日（不在节假日 + 不在周末）*/
  isWorkday(date: string): boolean

  /** 获取节假日列表 */
  list(): HolidayEntry[]
}

export interface HolidayEntry {
  id: number
  date: string // YYYY-MM-DD
  name: string
  type: 'HOLIDAY' | 'WORKDAY_SHIFT' // HOLIDAY=放假 / WORKDAY_SHIFT=调休上班
  isWorkday: number // 1=调休上班, 0=放假（与 type 互补）
  source: string
}

/**
 * LocalHolidayProvider
 * 数据源：本地 holidays 表（Phase 0 T0.4a 已建）
 * 注：Phase 3 通过 WebView 端缓存，调用 list_holidays 时机：
 *   - 应用启动时（main.tsx）
 *   - 节假日设置变化时（Phase 9）
 */
export class LocalHolidayProvider implements HolidayProvider {
  private cache: Map<string, HolidayEntry> = new Map()
  private loaded = false

  async load(): Promise<void> {
    try {
      const entries = await invoke<HolidayEntry[]>('list_holidays', {})
      this.cache.clear()
      for (const e of entries) {
        this.cache.set(e.date, e)
      }
      this.loaded = true
    } catch (e) {
      // list_holidays 命令可能不存在（Phase 3 未实现）
      // 降级为无节假日缓存（只跳过周末）
      this.cache.clear()
      this.loaded = false
    }
  }

  isHoliday(date: string): boolean {
    const entry = this.cache.get(date)
    if (!entry) return false
    // type=HOLIDAY 且 is_workday=0 → 法定节假日
    return entry.type === 'HOLIDAY' && entry.isWorkday === 0
  }

  isWorkday(date: string): boolean {
    // 先查缓存（节假日 / 调休上班）
    const entry = this.cache.get(date)
    if (entry) {
      // 调休上班日（type=WORKDAY_SHIFT, is_workday=1）视为工作日
      if (entry.type === 'WORKDAY_SHIFT' && entry.isWorkday === 1) {
        return true
      }
      // 普通节假日 → 非工作日
      if (entry.type === 'HOLIDAY' && entry.isWorkday === 0) {
        return false
      }
    }
    // 缓存无 → 按周末判断
    const d = new Date(date)
    return d.getDay() !== 0 && d.getDay() !== 6
  }

  list(): HolidayEntry[] {
    return Array.from(this.cache.values())
  }

  isLoaded(): boolean {
    return this.loaded
  }
}

/**
 * ApiHolidayProvider 占位
 * Phase 9 设置中心实接（国家 API 同步）
 * 当前仅占位
 */
export class ApiHolidayProvider implements HolidayProvider {
  async load(): Promise<void> {
    throw new Error('ApiHolidayProvider 未实接（Phase 9 实现）')
  }
  isHoliday(_date: string): boolean {
    return false
  }
  isWorkday(_date: string): boolean {
    return false
  }
  list(): HolidayEntry[] {
    return []
  }
}

/** 默认 Provider：LocalHolidayProvider */
export const defaultHolidayProvider: HolidayProvider = new LocalHolidayProvider()

/** 加载默认 Provider 的便捷函数（应用启动时调用一次）*/
export async function loadHolidayProvider(): Promise<HolidayProvider> {
  await defaultHolidayProvider.load()
  return defaultHolidayProvider
}
