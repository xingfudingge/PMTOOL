/**
 * PMTool V2.0 · 节假日服务（Phase 4 独立实现 · WebView 端）
 *
 * 设计依据：维护者 T3.2 原话 + T4.1 决策
 *   "不要等待list_holidays。Phase 4新增独立calendar能力：新增holiday service/provider。不要回改Phase0。"
 *
 * Phase 3 T3.2 已有 src/services/holidayProvider.ts（抽象接口 + LocalHolidayProvider）
 * 本文件是 Phase 4 扩展：增加硬编码 2026 年节假日数据 + 工作日排班
 *
 * 为什么不修改 Phase 0：
 *   - T0.4a schema 的 holidays 表需要 list_holidays 命令（未实现）
 *   - T0.4e lib.rs 冻结（不能加 commands）
 *   - Phase 4 必须独立实现
 *
 * Phase 9 替换：国家 API 同步 + 改用 API provider
 */

import type { HolidayEntry } from './holidayProvider'

/**
 * 2026 年中国大陆法定节假日 + 调休
 *
 * ⚠ 唯一真相源：NateScarlet/holiday-cn（自动每日抓取国务院办公厅公告 · CI 自动更新）
 * ⚠ 严禁自行推断/编造放假日期或调休安排
 *
 * 数据地址：https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/{年份}.json
 * 备用地址：https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/{年份}.json
 * 字段约定：
 *   isOffDay=true  → 放假（HOLIDAY, isWorkday=0）
 *   isOffDay=false → 调休上班（WORKDAY_SHIFT, isWorkday=1）
 *
 * 2026 年调休具体安排（节选）：
 *   元旦：1/1~3 放假 · 1/4(周日)调休上班
 *   春节：2/15~23 放假9天 · 2/14(周六)、2/28(周六)调休上班
 *   清明：4/4~6 放假 · 无调休
 *   劳动节：5/1~5 放假 · 5/9(周六)调休上班
 *   端午：6/19~21 放假 · 无调休
 *   国庆+中秋：9/20(周日)调休 · 9/25~27 中秋 · 10/1~7 国庆 · 10/10(周六)调休
 */
const HOLIDAYS_2026: HolidayEntry[] = [
  // 元旦
  { id: 1, date: '2026-01-01', name: '元旦', type: 'HOLIDAY', isWorkday: 0, source: 'NateScarlet/holiday-cn@国办发明电〔2025〕7号' },
  { id: 2, date: '2026-01-02', name: '元旦', type: 'HOLIDAY', isWorkday: 0, source: 'NateScarlet/holiday-cn@国办发明电〔2025〕7号' },
  { id: 3, date: '2026-01-03', name: '元旦', type: 'HOLIDAY', isWorkday: 0, source: 'NateScarlet/holiday-cn@国办发明电〔2025〕7号' },
  { id: 4, date: '2026-01-04', name: '元旦调休上班', type: 'WORKDAY_SHIFT', isWorkday: 1, source: 'NateScarlet/holiday-cn@国办发明电〔2025〕7号' },

  // 春节
  { id: 10, date: '2026-02-14', name: '春节调休上班', type: 'WORKDAY_SHIFT', isWorkday: 1, source: 'NateScarlet/holiday-cn@国办发明电〔2025〕7号' },
  { id: 11, date: '2026-02-15', name: '春节', type: 'HOLIDAY', isWorkday: 0, source: 'NateScarlet/holiday-cn@国办发明电〔2025〕7号' },
  { id: 12, date: '2026-02-16', name: '春节', type: 'HOLIDAY', isWorkday: 0, source: 'NateScarlet/holiday-cn@国办发明电〔2025〕7号' },
  { id: 13, date: '2026-02-17', name: '春节', type: 'HOLIDAY', isWorkday: 0, source: 'NateScarlet/holiday-cn@国办发明电〔2025〕7号' },
  { id: 14, date: '2026-02-18', name: '春节', type: 'HOLIDAY', isWorkday: 0, source: 'NateScarlet/holiday-cn@国办发明电〔2025〕7号' },
  { id: 15, date: '2026-02-19', name: '春节', type: 'HOLIDAY', isWorkday: 0, source: 'NateScarlet/holiday-cn@国办发明电〔2025〕7号' },
  { id: 16, date: '2026-02-20', name: '春节', type: 'HOLIDAY', isWorkday: 0, source: 'NateScarlet/holiday-cn@国办发明电〔2025〕7号' },
  { id: 17, date: '2026-02-21', name: '春节', type: 'HOLIDAY', isWorkday: 0, source: 'NateScarlet/holiday-cn@国办发明电〔2025〕7号' },
  { id: 18, date: '2026-02-22', name: '春节', type: 'HOLIDAY', isWorkday: 0, source: 'NateScarlet/holiday-cn@国办发明电〔2025〕7号' },
  { id: 19, date: '2026-02-23', name: '春节', type: 'HOLIDAY', isWorkday: 0, source: 'NateScarlet/holiday-cn@国办发明电〔2025〕7号' },
  { id: 20, date: '2026-02-28', name: '春节调休上班', type: 'WORKDAY_SHIFT', isWorkday: 1, source: 'NateScarlet/holiday-cn@国办发明电〔2025〕7号' },

  // 清明
  { id: 30, date: '2026-04-04', name: '清明节', type: 'HOLIDAY', isWorkday: 0, source: 'NateScarlet/holiday-cn@国办发明电〔2025〕7号' },
  { id: 31, date: '2026-04-05', name: '清明节', type: 'HOLIDAY', isWorkday: 0, source: 'NateScarlet/holiday-cn@国办发明电〔2025〕7号' },
  { id: 32, date: '2026-04-06', name: '清明节', type: 'HOLIDAY', isWorkday: 0, source: 'NateScarlet/holiday-cn@国办发明电〔2025〕7号' },

  // 劳动节
  { id: 40, date: '2026-05-01', name: '劳动节', type: 'HOLIDAY', isWorkday: 0, source: 'NateScarlet/holiday-cn@国办发明电〔2025〕7号' },
  { id: 41, date: '2026-05-02', name: '劳动节', type: 'HOLIDAY', isWorkday: 0, source: 'NateScarlet/holiday-cn@国办发明电〔2025〕7号' },
  { id: 42, date: '2026-05-03', name: '劳动节', type: 'HOLIDAY', isWorkday: 0, source: 'NateScarlet/holiday-cn@国办发明电〔2025〕7号' },
  { id: 43, date: '2026-05-04', name: '劳动节', type: 'HOLIDAY', isWorkday: 0, source: 'NateScarlet/holiday-cn@国办发明电〔2025〕7号' },
  { id: 44, date: '2026-05-05', name: '劳动节', type: 'HOLIDAY', isWorkday: 0, source: 'NateScarlet/holiday-cn@国办发明电〔2025〕7号' },
  { id: 45, date: '2026-05-09', name: '劳动节调休上班', type: 'WORKDAY_SHIFT', isWorkday: 1, source: 'NateScarlet/holiday-cn@国办发明电〔2025〕7号' },

  // 端午
  { id: 50, date: '2026-06-19', name: '端午节', type: 'HOLIDAY', isWorkday: 0, source: 'NateScarlet/holiday-cn@国办发明电〔2025〕7号' },
  { id: 51, date: '2026-06-20', name: '端午节', type: 'HOLIDAY', isWorkday: 0, source: 'NateScarlet/holiday-cn@国办发明电〔2025〕7号' },
  { id: 52, date: '2026-06-21', name: '端午节', type: 'HOLIDAY', isWorkday: 0, source: 'NateScarlet/holiday-cn@国办发明电〔2025〕7号' },

  // 国庆+中秋
  { id: 60, date: '2026-09-20', name: '国庆调休上班', type: 'WORKDAY_SHIFT', isWorkday: 1, source: 'NateScarlet/holiday-cn@国办发明电〔2025〕7号' },
  { id: 61, date: '2026-09-25', name: '中秋节', type: 'HOLIDAY', isWorkday: 0, source: 'NateScarlet/holiday-cn@国办发明电〔2025〕7号' },
  { id: 62, date: '2026-09-26', name: '中秋节', type: 'HOLIDAY', isWorkday: 0, source: 'NateScarlet/holiday-cn@国办发明电〔2025〕7号' },
  { id: 63, date: '2026-09-27', name: '中秋节', type: 'HOLIDAY', isWorkday: 0, source: 'NateScarlet/holiday-cn@国办发明电〔2025〕7号' },
  { id: 64, date: '2026-10-01', name: '国庆节', type: 'HOLIDAY', isWorkday: 0, source: 'NateScarlet/holiday-cn@国办发明电〔2025〕7号' },
  { id: 65, date: '2026-10-02', name: '国庆节', type: 'HOLIDAY', isWorkday: 0, source: 'NateScarlet/holiday-cn@国办发明电〔2025〕7号' },
  { id: 66, date: '2026-10-03', name: '国庆节', type: 'HOLIDAY', isWorkday: 0, source: 'NateScarlet/holiday-cn@国办发明电〔2025〕7号' },
  { id: 67, date: '2026-10-04', name: '国庆节', type: 'HOLIDAY', isWorkday: 0, source: 'NateScarlet/holiday-cn@国办发明电〔2025〕7号' },
  { id: 68, date: '2026-10-05', name: '国庆节', type: 'HOLIDAY', isWorkday: 0, source: 'NateScarlet/holiday-cn@国办发明电〔2025〕7号' },
  { id: 69, date: '2026-10-06', name: '国庆节', type: 'HOLIDAY', isWorkday: 0, source: 'NateScarlet/holiday-cn@国办发明电〔2025〕7号' },
  { id: 70, date: '2026-10-07', name: '国庆节', type: 'HOLIDAY', isWorkday: 0, source: 'NateScarlet/holiday-cn@国办发明电〔2025〕7号' },
  { id: 71, date: '2026-10-10', name: '国庆调休上班', type: 'WORKDAY_SHIFT', isWorkday: 1, source: 'NateScarlet/holiday-cn@国办发明电〔2025〕7号' },
]

/**
 * 工作日排班（默认双休）
 */
const WORK_SCHEDULE_DEFAULT = {
  0: { isWorkday: false }, // 周日
  1: { isWorkday: true },
  2: { isWorkday: true },
  3: { isWorkday: true },
  4: { isWorkday: true },
  5: { isWorkday: true },
  6: { isWorkday: false }, // 周六
}

/**
 * HolidayService · Phase 4 独立实现
 * 不依赖 Phase 0 commands（避免改 T0.4e lib.rs）
 */
export class HolidayService {
  private holidays: Map<string, HolidayEntry>

  constructor(holidays: HolidayEntry[] = HOLIDAYS_2026) {
    this.holidays = new Map()
    for (const h of holidays) {
      this.holidays.set(h.date, h)
    }
  }

  /** 判断某日是否为法定节假日（不在工作日）*/
  isHoliday(date: string): boolean {
    const entry = this.holidays.get(date)
    if (!entry) return false
    return entry.type === 'HOLIDAY' && entry.isWorkday === 0
  }

  /** 判断某日是否为工作日 */
  isWorkday(date: string): boolean {
    const entry = this.holidays.get(date)
    if (entry) {
      if (entry.type === 'WORKDAY_SHIFT' && entry.isWorkday === 1) return true
      if (entry.type === 'HOLIDAY' && entry.isWorkday === 0) return false
    }
    // 缓存无 → 按排班判断
    const dayOfWeek = new Date(date + 'T00:00:00').getDay()
    return WORK_SCHEDULE_DEFAULT[dayOfWeek as 0 | 1 | 2 | 3 | 4 | 5 | 6].isWorkday
  }

  /** 获取某日信息 */
  get(date: string): HolidayEntry | undefined {
    return this.holidays.get(date)
  }

  /** 列出所有节假日 */
  list(): HolidayEntry[] {
    return Array.from(this.holidays.values())
  }

  /** 列出某范围内的节假日 */
  listInRange(startDate: string, endDate: string): HolidayEntry[] {
    return Array.from(this.holidays.values()).filter(
      (h) => h.date >= startDate && h.date <= endDate,
    )
  }
}

/** 默认 HolidayService 实例（2026 数据）*/
export const defaultHolidayService = new HolidayService()

/** 下一工作日计算（RFC-02 §3 · 跳节假日）*/
export function computeNextWorkdayFromService(
  from: string,
  service: HolidayService = defaultHolidayService,
): string {
  const d = new Date(from + 'T00:00:00')
  d.setDate(d.getDate() + 1)
  for (let i = 0; i < 366; i++) {
    // 注意：toISOString 总是 UTC，需要转换本地日期
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const localDateStr = `${yyyy}-${mm}-${dd}`
    if (service.isWorkday(localDateStr)) {
      return localDateStr
    }
    d.setDate(d.getDate() + 1)
  }
  throw new Error('超出 366 天未找到下一工作日')
}