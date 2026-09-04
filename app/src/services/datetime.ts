/**
 * PMTool V2.0 · 公共日期工具服务
 * Phase 3 · T3.2
 *
 * 设计依据：维护者 T3.2 原话「不要复制日期逻辑。统一抽公共日期服务。」
 *
 * 与 Phase 2 services/home.ts 工具函数一致（重构独立版本，避免修改 Phase 2 已 verified 代码）
 *
 * 功能：
 *   - formatLocalDate / extractLocalDate（RFC-02 §1 + §4）
 *   - computeNextWorkday（RFC-02 §3，跳周末）
 *   - computeRemainingDays
 *   - getWeekdayCN（中文星期）
 *   - isWeekend / isToday / diffDays
 */

/** 本地 Date → YYYY-MM-DD */
export function formatLocalDate(d: Date): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/** UTC ISO 8601 → 本地日期 YYYY-MM-DD */
export function extractLocalDate(isoString: string): string {
  return formatLocalDate(new Date(isoString))
}

/** 中文星期几 */
export function getWeekdayCN(d: Date): string {
  const weekdays = ['日', '一', '二', '三', '四', '五', '六']
  return `星期${weekdays[d.getDay()]}`
}

/**
 * 下一工作日（RFC-02 §3）
 * @param from 起始日期
 * @param isHoliday 回调函数判断某日是否为法定节假日（默认不传则只跳周末）
 * @returns YYYY-MM-DD
 */
export function computeNextWorkday(
  from: Date,
  isHoliday?: (date: string) => boolean,
): string {
  const d = new Date(from)
  d.setDate(d.getDate() + 1)
  let safetyCounter = 0
  while (safetyCounter++ < 366) {
    const dateStr = formatLocalDate(d)
    const dayOfWeek = d.getDay()
    if (dayOfWeek !== 0 && dayOfWeek !== 6 && !isHoliday?.(dateStr)) {
      return dateStr
    }
    d.setDate(d.getDate() + 1)
  }
  throw new Error('超出 366 天未找到下一工作日（请检查 holidays 排班）')
}

/** 项目剩余天数（end_date - today，含今天）。end_date 不存在 → null */
export function computeRemainingDays(
  endDate: string | null,
  todayLocal: string,
): number | null {
  if (!endDate) return null
  const end = new Date(endDate)
  const today = new Date(todayLocal)
  const diffMs = end.getTime() - today.getTime()
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
  return diffDays >= 0 ? diffDays : 0
}

/** 是否周末（周六=6 / 周日=0）*/
export function isWeekend(d: Date | string): boolean {
  const date = typeof d === 'string' ? new Date(d) : d
  const day = date.getDay()
  return day === 0 || day === 6
}

/** 是否今天（本地日历日比较）*/
export function isToday(dateStr: string, todayLocal: string): boolean {
  return dateStr === todayLocal
}

/** 两个日期相差天数（b - a）*/
export function diffDays(a: string, b: string): number {
  const aDate = new Date(a)
  const bDate = new Date(b)
  return Math.round((bDate.getTime() - aDate.getTime()) / (1000 * 60 * 60 * 24))
}

/** 上一工作日（用于自动顺延前的参考）*/
export function computePrevWorkday(from: Date): string {
  const d = new Date(from)
  d.setDate(d.getDate() - 1)
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() - 1)
  }
  return formatLocalDate(d)
}

/** 本周开始日期（周一）*/
export function startOfWeek(d: Date): string {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day // 周日(0) → -6; 周一(1) → 0; 周二(2) → -1
  const monday = new Date(d)
  monday.setDate(d.getDate() + diff)
  return formatLocalDate(monday)
}

/** 本周结束日期（周日）*/
export function endOfWeek(d: Date): string {
  const monday = new Date(startOfWeek(d))
  monday.setDate(monday.getDate() + 6)
  return formatLocalDate(monday)
}

/** 本月第一天 */
export function startOfMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

/** 本月最后一天 */
export function endOfMonth(d: Date): string {
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  return formatLocalDate(lastDay)
}
