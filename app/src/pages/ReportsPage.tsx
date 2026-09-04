/**
 * PMTool V2.0 · 报告中心
 * 维护者 2026-08-25 反馈重构
 *
 * 结构：
 *   Tabs：[常规报告] | [AI 报告]
 *   常规报告下：
 *     - 日报 / 周报 / 月报 三种类型
 *     - 每种类型下分 [个人] | [项目] 两种 scope
 *     - 水平日期条（维护者要求）：
 *         日报：7 天 · 今天默认在中间 · 可前后切换
 *         周报：7 周 · 本周默认在中间 · 可前后切换
 *         月报：12 个月 · 本月默认在中间 · 可前后切换
 *     - 列表显示当前选中日期的报告
 *
 * 报告内容模板（维护者原话）：
 *   日报 / 周报 / 月报 结构相同，字段名换成本周/本月 + 下周/下月
 *   1、xxx
 *   2、xxx
 *   项目报告 = 按 @ 项目 分组（每个项目下都有 1、xxx / 2、xxx）
 *
 * 数据流：
 *   - list_reports（按 reportType / projectId 过滤 · period 在前端按 created_at 过滤）
 *   - delete_report
 *   - 点击报告 → 弹 Modal 显示 content
 */

import { useEffect, useMemo, useState } from 'react'
import {
  Sparkles,
  CalendarDays,
  FileText,
  Trash2,
  ChevronRight,
  ChevronLeft,
  Clock,
  Pencil,
  Plus,
  Save,
  X as XIcon,
  Maximize2,
  Minimize2,
} from 'lucide-react'
import { listReports, updateReport, deleteReport } from '@/services/reports'
import { useReportGen } from '@/services/reportGenerator'
import type { Report } from '@/database/api'

type TabKey = 'normal' | 'ai'
type ReportTypeKey = 'daily' | 'weekly' | 'monthly'
type ScopeKey = 'personal' | 'project'

const TAB_DEFS: { key: TabKey; label: string }[] = [
  { key: 'normal', label: '常规报告' },
  { key: 'ai', label: 'AI 报告' },
]

const TYPE_DEFS: {
  key: ReportTypeKey
  label: string
  desc: string
}[] = [
  { key: 'daily', label: '日报', desc: '今日工作内容 + 下个工作日计划' },
  { key: 'weekly', label: '周报', desc: '本周工作内容 + 下周工作计划' },
  { key: 'monthly', label: '月报', desc: '本月工作内容 + 下月工作计划' },
]

const SCOPE_DEFS: { key: ScopeKey; label: string }[] = [
  { key: 'personal', label: '个人' },
  { key: 'project', label: '项目' },
]

function typeLabelOf(t: ReportTypeKey): string {
  return TYPE_DEFS.find((d) => d.key === t)?.label ?? '报告'
}

// ============================================================
// 日期工具（本地时区）
// ============================================================

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function fmtDay(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function fmtMonth(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`
}

/** ISO 周一为一周首日 · YYYY-Www */
function isoWeekKey(d: Date): string {
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const dayNum = (target.getDay() + 6) % 7 // 周一=0, 周日=6
  target.setDate(target.getDate() - dayNum + 3) // 周四
  const firstThursday = new Date(target.getFullYear(), 0, 4)
  const diff = (target.getTime() - firstThursday.getTime()) / 86400000
  const weekNum = 1 + Math.round((diff - 3 + ((firstThursday.getDay() + 6) % 7)) / 7)
  return `${target.getFullYear()}-W${pad2(weekNum)}`
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function addWeeks(d: Date, n: number): Date {
  return addDays(d, n * 7)
}

function addMonths(d: Date, n: number): Date {
  const r = new Date(d.getFullYear(), d.getMonth() + n, d.getDate())
  return r
}

/** 报告 created_at 字符串 → 当天本地 YYYY-MM-DD（DB 存的是 UTC ISO，前端按 UTC 切日期） */
function reportDayKey(createdAt: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(createdAt)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  return createdAt.slice(0, 10)
}

function reportWeekKey(createdAt: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(createdAt)
  if (!m) return ''
  return isoWeekKey(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])))
}

function reportMonthKey(createdAt: string): string {
  return createdAt.slice(0, 7)
}

// ============================================================
// 报告分组键（按周期类型聚合）
// ============================================================

function periodKeyOf(reportType: ReportTypeKey, report: Report): string {
  // 优先用 DB period 字段（新数据一定有 · 旧数据 0003 已 backfill）
  if (report.period) return report.period
  // 兜底：从 created_at 反推
  const c = report.createdAt
  if (reportType === 'daily') return reportDayKey(c)
  if (reportType === 'weekly') return reportWeekKey(c)
  return reportMonthKey(c)
}

// ============================================================
// 主组件
// ============================================================

export function ReportsPage() {
  const [tab, setTab] = useState<TabKey>('normal')
  const [typeKey, setTypeKey] = useState<ReportTypeKey>('daily')
  const [scope, setScope] = useState<ScopeKey>('personal')
  const [allReports, setAllReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(false)
  const [viewing, setViewing] = useState<Report | null>(null)
  const [generating, setGenerating] = useState(false)
  const { requestGeneration, pendingCount } = useReportGen()
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null)
  const [toast, setToast] = useState<{ show: boolean; msg: string; tone: 'ok' | 'err' }>({
    show: false,
    msg: '',
    tone: 'ok',
  })

  // 选中日期（按 typeKey 维度解释）
  // daily: YYYY-MM-DD · weekly: YYYY-Www · monthly: YYYY-MM
  const [selectedKey, setSelectedKey] = useState<string>(() => {
    const now = new Date()
    return fmtDay(now)
  })

  /** 当 typeKey 变化时，重置 selectedKey 到"今天" */
  useEffect(() => {
    const now = new Date()
    if (typeKey === 'daily') setSelectedKey(fmtDay(now))
    else if (typeKey === 'weekly') setSelectedKey(isoWeekKey(now))
    else setSelectedKey(fmtMonth(now))
  }, [typeKey])

  const load = async () => {
    setLoading(true)
    try {
      // 一次拉全部该 type 的报告 · period + scope 都在前端按字段切
      const data = await listReports({
        reportType: typeKey,
        projectId: null,
      })
      setAllReports(data)
    } catch (err) {
      console.error('加载报告失败', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (tab === 'normal') void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, typeKey])

  // 当前选中周期 + scope 的报告
  const filteredReports = useMemo(
    () =>
      allReports.filter((r) => {
        // 1. scope 过滤
        if (scope === 'personal' && r.projectId !== null) return false
        if (scope === 'project' && r.projectId === null) return false
        // 2. period 过滤
        return periodKeyOf(typeKey, r) === selectedKey
      }),
    [allReports, typeKey, selectedKey, scope],
  )

  // 按周期聚合的计数（用于 strip badge）
  const countByPeriod = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of allReports) {
      const k = periodKeyOf(typeKey, r)
      map.set(k, (map.get(k) ?? 0) + 1)
    }
    return map
  }, [allReports, typeKey])

  const showToast = (msg: string, tone: 'ok' | 'err' = 'ok') => {
    setToast({ show: true, msg, tone })
    setTimeout(() => setToast((t) => ({ ...t, show: false })), 3000)
  }

  /**
   * 删除报告（两段式：先点垃圾桶进入确认态，再点确认才真删）
   * 维护者原话"删除也删不掉" —— Tauri webview 默认拦截 window.confirm，必须用 inline 二次确认
   */
  const handleDeleteRequest = (id: number) => {
    setPendingDeleteId(id)
    // 5 秒自动取消
    setTimeout(() => {
      setPendingDeleteId((cur) => (cur === id ? null : cur))
    }, 5000)
  }
  const handleDeleteConfirm = async (id: number) => {
    try {
      await deleteReport(id)
      setPendingDeleteId(null)
      await load()
      showToast('已删除')
    } catch (err) {
      console.error('删除报告失败', err)
      showToast('删除失败：' + (err instanceof Error ? err.message : String(err)), 'err')
      setPendingDeleteId(null)
    }
  }

  /**
   * 在当前 tab/scope 下生成报告
   *  - 用 selectedKey 作 period
   *  - daily: 读 work notes + 今天完成的 todos（按 due_date = period）
   *  - weekly/monthly: 不读 work notes（仅适用于日报）；todos 按周期范围过滤
   */
  /**
   * 触发报告生成
   *  - 全部走 @/services/reportGenerator.requestGeneration
   *  - 它处理：准备内容 → 检查已存在 → 弹全局确认 / 直接写
   *  - 弹窗在 RegenConfirmModal（App.tsx 顶层挂载）· 任何入口都共用
   */
  const handleGenerate = async () => {
    if (generating) return
    setGenerating(true)
    try {
      const r = await requestGeneration({
        type: typeKey,
        scope,
        period: selectedKey,
      })
      if (r.written) {
        await load()
        showToast('已生成')
      }
    } catch (err) {
      console.error('生成报告失败', err)
      showToast('生成失败：' + (err instanceof Error ? err.message : String(err)), 'err')
    } finally {
      setGenerating(false)
    }
  }

  // 清空当前选中周期 · 两段式按钮状态
  const [pendingClear, setPendingClear] = useState(false)
  const handleClearRequest = () => {
    setPendingClear(true)
    setTimeout(() => setPendingClear(false), 5000)
  }
  const handleClearConfirm = async () => {
    try {
      for (const r of filteredReports) {
        await deleteReport(r.id)
      }
      setPendingClear(false)
      await load()
      showToast('已清空')
    } catch (err) {
      console.error('清空失败', err)
      showToast('清空失败：' + (err instanceof Error ? err.message : String(err)), 'err')
      setPendingClear(false)
    }
  }

  return (
    <div
      data-testid="reports-page"
      style={{
        padding: '24px 32px 32px',
        maxWidth: '1440px',
        height: '100%',
        overflowY: 'auto',
      }}
    >
      {/* 顶部 */}
      <div style={{ marginBottom: '16px' }}>
        <h1
          style={{
            fontSize: '24px',
            fontWeight: 600,
            letterSpacing: '-0.015em',
            margin: 0,
            marginBottom: '4px',
            color: 'var(--color-text)',
          }}
        >
          报告中心
        </h1>
        <p
          style={{
            fontSize: '13px',
            color: 'var(--color-text-secondary)',
            margin: 0,
          }}
        >
          常规报告（日报 / 周报 / 月报 · 分个人和项目） · AI 报告（项目总结 / 阶段汇报 · 即将开放）
        </p>
      </div>

      {/* Tabs：常规 / AI */}
      <div
        style={{
          display: 'flex',
          gap: 4,
          padding: 4,
          background: 'var(--color-bg-subtle)',
          border: '1px solid var(--color-border-thin)',
          borderRadius: 'var(--radius)',
          width: 'fit-content',
          marginBottom: '14px',
        }}
      >
        {TAB_DEFS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            data-testid={`reports-tab-${t.key}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '6px 14px',
              border: 'none',
              background: tab === t.key ? 'var(--color-surface)' : 'transparent',
              color: tab === t.key ? 'var(--color-text)' : 'var(--color-text-tertiary)',
              fontSize: '12.5px',
              fontWeight: tab === t.key ? 500 : 400,
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
            }}
          >
            {t.key === 'ai' && <Sparkles size={12} strokeWidth={1.75} />}
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'ai' ? (
        <AIPlaceholder />
      ) : (
        <>
          {/* 报告类型选择：日报 / 周报 / 月报 */}
          <div
            style={{
              display: 'flex',
              gap: 6,
              marginBottom: 10,
            }}
          >
            {TYPE_DEFS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTypeKey(t.key)}
                data-testid={`reports-type-${t.key}`}
                style={{
                  padding: '5px 12px',
                  border: '1px solid var(--color-border-thin)',
                  borderRadius: 'var(--radius)',
                  background:
                    typeKey === t.key ? 'var(--color-accent-subtle)' : 'var(--color-bg-subtle)',
                  color:
                    typeKey === t.key ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                  fontSize: '12.5px',
                  fontWeight: typeKey === t.key ? 500 : 400,
                  borderColor:
                    typeKey === t.key ? 'var(--color-accent)' : 'var(--color-border-thin)',
                  cursor: 'pointer',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* scope：个人 / 项目 */}
          <div
            style={{
              display: 'flex',
              gap: 4,
              padding: 3,
              background: 'var(--color-bg-subtle)',
              border: '1px solid var(--color-border-thin)',
              borderRadius: 'var(--radius)',
              width: 'fit-content',
              marginBottom: 14,
            }}
          >
            {SCOPE_DEFS.map((s) => (
              <button
                key={s.key}
                onClick={() => setScope(s.key)}
                data-testid={`reports-scope-${s.key}`}
                style={{
                  padding: '4px 12px',
                  border: 'none',
                  background: scope === s.key ? 'var(--color-surface)' : 'transparent',
                  color: scope === s.key ? 'var(--color-text)' : 'var(--color-text-tertiary)',
                  fontSize: '12px',
                  fontWeight: scope === s.key ? 500 : 400,
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                }}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* 操作栏：生成 / 清空（按当前 tab + scope + 选中 period） */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 10,
            }}
          >
            <button
              type="button"
              data-testid="generate-report-btn"
              onClick={() => void handleGenerate()}
              disabled={generating}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '5px 12px',
                border: 'none',
                background: generating ? 'var(--color-bg-muted)' : 'var(--color-accent)',
                color: generating ? 'var(--color-text-tertiary)' : 'var(--color-text-on-accent)',
                borderRadius: 'var(--radius)',
                fontSize: '12.5px',
                fontWeight: 500,
                cursor: generating ? 'wait' : 'pointer',
              }}
              onMouseEnter={(e) => {
                if (!generating) e.currentTarget.style.opacity = '0.9'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = '1'
              }}
            >
              <Plus size={12} strokeWidth={2} />
              {generating
                ? pendingCount > 0
                  ? '等待确认…'
                  : '生成中…'
                : `生成${typeLabelOf(typeKey)}（${scope === 'personal' ? '个人' : '项目'}）· ${selectedKey}`}
            </button>
            <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', flex: 1 }}>
              {filteredReports.length > 0
                ? `本周期已有 ${filteredReports.length} 份 · 再次生成会覆盖`
                : '本周期还没有报告'}
            </span>
            {filteredReports.length > 0 && (
              pendingClear ? (
                <button
                  type="button"
                  data-testid="clear-period-confirm"
                  onClick={() => void handleClearConfirm()}
                  style={{
                    padding: '5px 12px',
                    border: '1px solid var(--color-status-danger)',
                    background: 'var(--color-status-danger)',
                    color: 'white',
                    borderRadius: 'var(--radius)',
                    fontSize: '12px',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  确认清空？再点一次
                </button>
              ) : (
                <button
                  type="button"
                  data-testid="clear-period-btn"
                  onClick={() => handleClearRequest()}
                  style={{
                    padding: '5px 10px',
                    border: '1px solid var(--color-border-thin)',
                    background: 'transparent',
                    color: 'var(--color-text-tertiary)',
                    borderRadius: 'var(--radius)',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = 'var(--color-status-danger)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = 'var(--color-text-tertiary)'
                  }}
                >
                  清空本周期
                </button>
              )
            )}
          </div>

          {/* 水平日期条（7 天 / 7 周 / 12 个月） */}
          <PeriodStrip
            typeKey={typeKey}
            selectedKey={selectedKey}
            onSelect={setSelectedKey}
            countByPeriod={countByPeriod}
          />

          {/* 报告列表 */}
          {loading ? (
            <div
              style={{
                padding: '32px 0',
                textAlign: 'center',
                fontSize: '13px',
                color: 'var(--color-text-tertiary)',
              }}
            >
              加载中…
            </div>
          ) : filteredReports.length === 0 ? (
            <EmptyHint
              type={TYPE_DEFS.find((t) => t.key === typeKey)?.label ?? '报告'}
              scope={scope}
              periodLabel={selectedKey}
            />
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {filteredReports.map((r) => (
                <ReportRow
                  key={r.id}
                  report={r}
                  onView={() => setViewing(r)}
                  pendingDelete={pendingDeleteId === r.id}
                  onDeleteRequest={() => handleDeleteRequest(r.id)}
                  onDeleteConfirm={() => void handleDeleteConfirm(r.id)}
                />
              ))}
            </ul>
          )}
        </>
      )}

      {/* 报告内容 Modal */}
      {viewing && (
        <ReportContentModal
          report={viewing}
          onClose={() => setViewing(null)}
          onSaved={() => void load()}
        />
      )}

      {toast.show && <ReportsToast message={toast.msg} tone={toast.tone} />}
    </div>
  )
}

// ============================================================
// 水平周期条（7 天 / 7 周 / 12 个月）
// ============================================================

interface PeriodStripProps {
  typeKey: ReportTypeKey
  selectedKey: string
  onSelect: (k: string) => void
  countByPeriod: Map<string, number>
}

function PeriodStrip({ typeKey, selectedKey, onSelect, countByPeriod }: PeriodStripProps) {
  // 窗口配置：daily=7 天 · weekly=7 周 · monthly=12 个月（本月居中，前后各 6）
  const WINDOW_SIZE = typeKey === 'monthly' ? 12 : 7
  const PREV_COUNT = typeKey === 'monthly' ? 6 : 3

  /** 把 selectedKey 反解为 Date（按本地时区） */
  const anchor = useMemo(() => {
    if (typeKey === 'daily') {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(selectedKey)
      if (m) return new Date(+m[1], +m[2] - 1, +m[3])
    } else if (typeKey === 'weekly') {
      const m = /^(\d{4})-W(\d{2})$/.exec(selectedKey)
      if (m) {
        const week = +m[2]
        // 从 1月4日（必在第 1 周）回推到周一，加 (week-1)*7 天
        const jan4 = new Date(+m[1], 0, 4)
        const jan4Monday = addDays(jan4, -(((jan4.getDay() + 6) % 7)))
        return addDays(jan4Monday, (week - 1) * 7)
      }
    } else {
      const m = /^(\d{4})-(\d{2})$/.exec(selectedKey)
      if (m) return new Date(+m[1], +m[2] - 1, 1)
    }
    return new Date()
  }, [typeKey, selectedKey])

  /** 生成 PREV_COUNT 到 WINDOW_SIZE-1-PREV_COUNT 的 cells */
  const cells = useMemo(() => {
    const list: { key: string; label: string; sublabel: string; date: Date; isAnchor: boolean }[] = []
    for (let i = 0; i < WINDOW_SIZE; i++) {
      const offset = i - PREV_COUNT
      let d: Date
      if (typeKey === 'daily') d = addDays(anchor, offset)
      else if (typeKey === 'weekly') d = addWeeks(anchor, offset)
      else d = addMonths(anchor, offset)

      let key: string
      let label: string
      let sublabel: string
      if (typeKey === 'daily') {
        key = fmtDay(d)
        label = `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
        sublabel = '日一二三四五六'[d.getDay()]
      } else if (typeKey === 'weekly') {
        key = isoWeekKey(d)
        label = key.slice(-3) // Www
        const monday = addDays(d, -((d.getDay() + 6) % 7))
        sublabel = `${pad2(monday.getMonth() + 1)}-${pad2(monday.getDate())}`
      } else {
        key = fmtMonth(d)
        label = `${pad2(d.getMonth() + 1)}月`
        sublabel = `${d.getFullYear()}`
      }
      list.push({ key, label, sublabel, date: d, isAnchor: offset === 0 })
    }
    return list
  }, [anchor, typeKey, WINDOW_SIZE, PREV_COUNT])

  const goPrev = () => {
    // 整体往前推 1 个单元
    if (typeKey === 'daily') {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(selectedKey)
      if (!m) return
      const newDate = addDays(new Date(+m[1], +m[2] - 1, +m[3]), -1)
      onSelect(fmtDay(newDate))
    } else if (typeKey === 'weekly') {
      const monday = addDays(anchor, -((anchor.getDay() + 6) % 7))
      const newMonday = addDays(monday, -7)
      onSelect(isoWeekKey(newMonday))
    } else {
      const m = /^(\d{4})-(\d{2})$/.exec(selectedKey)
      if (!m) return
      const newDate = addMonths(new Date(+m[1], +m[2] - 1, 1), -1)
      onSelect(fmtMonth(newDate))
    }
  }

  const goNext = () => {
    if (typeKey === 'daily') {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(selectedKey)
      if (!m) return
      const newDate = addDays(new Date(+m[1], +m[2] - 1, +m[3]), 1)
      onSelect(fmtDay(newDate))
    } else if (typeKey === 'weekly') {
      const monday = addDays(anchor, -((anchor.getDay() + 6) % 7))
      const newMonday = addDays(monday, 7)
      onSelect(isoWeekKey(newMonday))
    } else {
      const m = /^(\d{4})-(\d{2})$/.exec(selectedKey)
      if (!m) return
      const newDate = addMonths(new Date(+m[1], +m[2] - 1, 1), 1)
      onSelect(fmtMonth(newDate))
    }
  }

  const goToday = () => {
    const now = new Date()
    if (typeKey === 'daily') onSelect(fmtDay(now))
    else if (typeKey === 'weekly') onSelect(isoWeekKey(now))
    else onSelect(fmtMonth(now))
  }

  return (
    <div
      data-testid="period-strip"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginBottom: 16,
        padding: '10px 12px',
        background: 'var(--color-bg-subtle)',
        border: '1px solid var(--color-border-thin)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      <button
        onClick={goPrev}
        data-testid="period-prev"
        title="上一周期"
        style={stripArrowStyle}
      >
        <ChevronLeft size={15} strokeWidth={1.75} />
      </button>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${WINDOW_SIZE}, 1fr)`,
          gap: 6,
          flex: 1,
        }}
      >
        {cells.map((c) => {
          const isSelected = c.key === selectedKey
          const count = countByPeriod.get(c.key) ?? 0
          return (
            <button
              key={c.key}
              onClick={() => onSelect(c.key)}
              data-testid={`period-cell-${c.key}`}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                padding: '6px 4px',
                border: isSelected
                  ? '1px solid var(--color-accent)'
                  : '1px solid var(--color-border-thin)',
                borderRadius: 'var(--radius)',
                background: isSelected ? 'var(--color-accent-subtle)' : 'var(--color-surface)',
                color: isSelected ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                fontSize: '12px',
                fontWeight: isSelected ? 500 : 400,
                cursor: 'pointer',
                position: 'relative',
                minWidth: 0,
                transition: 'background-color 0.1s, border-color 0.1s',
              }}
            >
              <span
                style={{
                  fontSize: '12.5px',
                  fontWeight: isSelected ? 600 : 500,
                  fontFamily: typeKey === 'weekly' ? 'var(--font-mono)' : 'inherit',
                }}
              >
                {c.label}
              </span>
              <span style={{ fontSize: '10px', color: 'var(--color-text-tertiary)' }}>
                {c.sublabel}
              </span>
              {count > 0 && (
                <span
                  data-testid={`period-count-${c.key}`}
                  style={{
                    position: 'absolute',
                    top: 3,
                    right: 5,
                    minWidth: 14,
                    height: 14,
                    padding: '0 4px',
                    borderRadius: 7,
                    background: 'var(--color-accent)',
                    color: 'var(--color-text-on-accent)',
                    fontSize: '9px',
                    fontWeight: 600,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    lineHeight: 1,
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      <button
        onClick={goNext}
        data-testid="period-next"
        title="下一周期"
        style={stripArrowStyle}
      >
        <ChevronRight size={15} strokeWidth={1.75} />
      </button>

      <button
        onClick={goToday}
        data-testid="period-today"
        title="回到今天"
        style={{
          padding: '5px 10px',
          border: '1px solid var(--color-border-thin)',
          background: 'var(--color-surface)',
          color: 'var(--color-text-secondary)',
          borderRadius: 'var(--radius)',
          fontSize: '11.5px',
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        今天
      </button>
    </div>
  )
}

const stripArrowStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 28,
  height: 28,
  border: '1px solid var(--color-border-thin)',
  background: 'var(--color-surface)',
  color: 'var(--color-text-secondary)',
  borderRadius: 'var(--radius)',
  cursor: 'pointer',
  flexShrink: 0,
}

// ============================================================
// 单条报告行
// ============================================================

function ReportRow({
  report,
  onView,
  pendingDelete,
  onDeleteRequest,
  onDeleteConfirm,
}: {
  report: Report
  onView: () => void
  pendingDelete: boolean
  onDeleteRequest: () => void
  onDeleteConfirm: () => void
}) {
  const typeLabel: Record<string, string> = {
    daily: '日报',
    weekly: '周报',
    monthly: '月报',
    project_summary: '项目总结',
    phase_report: '阶段汇报',
  }
  return (
    <li
      data-testid={`report-row-${report.id}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 14px',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border-thin)',
        borderRadius: 'var(--radius-md)',
        marginBottom: 8,
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 'var(--radius)',
          background: report.generateType === 'AI' ? 'var(--color-accent-subtle)' : 'var(--color-bg-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <CalendarDays size={15} strokeWidth={1.75} color="var(--color-accent)" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginBottom: 2,
          }}
        >
          <span style={{ fontSize: '13.5px', fontWeight: 500, color: 'var(--color-text)' }}>
            {report.title}
          </span>
          {report.generateType === 'AI' && (
            <span
              style={{
                fontSize: '9.5px',
                color: 'var(--color-accent)',
                background: 'var(--color-accent-subtle)',
                padding: '1px 5px',
                borderRadius: 3,
                fontWeight: 500,
              }}
            >
              AI
            </span>
          )}
        </div>
        <div
          style={{
            fontSize: '11px',
            color: 'var(--color-text-tertiary)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span>{typeLabel[report.reportType] ?? report.reportType}</span>
          <span>·</span>
          <span>{report.projectId === null ? '个人' : `项目 #${report.projectId}`}</span>
          <span>·</span>
          <Clock size={9} />
          <span>{report.createdAt}</span>
        </div>
      </div>
      <button
        onClick={onView}
        data-testid={`report-view-${report.id}`}
        style={{
          padding: '4px 10px',
          border: '1px solid var(--color-border-thin)',
          background: 'var(--color-bg-subtle)',
          color: 'var(--color-text-secondary)',
          borderRadius: 'var(--radius)',
          fontSize: '12px',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        查看 <ChevronRight size={12} strokeWidth={1.5} />
      </button>
      {pendingDelete ? (
        <button
          onClick={onDeleteConfirm}
          data-testid={`report-delete-confirm-${report.id}`}
          style={{
            padding: '4px 12px',
            border: '1px solid var(--color-status-danger)',
            background: 'var(--color-status-danger)',
            color: 'white',
            borderRadius: 'var(--radius)',
            fontSize: '12px',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          确认删除？
        </button>
      ) : (
        <button
          onClick={onDeleteRequest}
          data-testid={`report-delete-${report.id}`}
          title="删除"
          style={{
            padding: '4px 8px',
            border: '1px solid var(--color-border-thin)',
            background: 'transparent',
            color: 'var(--color-text-tertiary)',
            borderRadius: 'var(--radius)',
            fontSize: '12px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--color-status-danger)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--color-text-tertiary)'
          }}
        >
          <Trash2 size={12} />
        </button>
      )}
    </li>
  )
}

// ============================================================
// 报告内容 Modal
// ============================================================

function ReportContentModal({
  report,
  onClose,
  onSaved,
}: {
  report: Report
  onClose: () => void
  onSaved?: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(report.title)
  const [content, setContent] = useState(report.content ?? '')
  const [saving, setSaving] = useState(false)
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editing) return // editing 时 Esc 不关闭（避免误触）
        if (maximized) {
          setMaximized(false) // 最大化时 Esc 先还原
          return
        }
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, editing, maximized])

  const handleSave = async () => {
    if (saving) return
    setSaving(true)
    try {
      await updateReport(report.id, title.trim() || report.title, content)
      onSaved?.()
      // 实时刷新：保存成功后立即关闭弹窗 + 父级 reload
      setEditing(false)
      onClose()
    } catch (err) {
      console.error('保存报告失败', err)
      alert('保存失败：' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      role="dialog"
      data-testid="report-content-modal"
      onClick={() => {
        if (!editing) onClose()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: maximized ? 'var(--color-bg)' : 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: maximized ? 'stretch' : 'center',
        justifyContent: maximized ? 'stretch' : 'center',
        padding: maximized ? 0 : 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--color-surface)',
          borderRadius: maximized ? 0 : 12,
          padding: maximized ? '14px 22px' : '20px 22px',
          maxWidth: maximized ? '100%' : 720,
          width: maximized ? '100%' : '100%',
          maxHeight: maximized ? '100vh' : '85vh',
          height: maximized ? '100vh' : undefined,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: maximized ? '0 16px 48px rgba(0,0,0,0.3)' : '0 12px 40px rgba(0, 0, 0, 0.25)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 14,
          }}
        >
          <FileText size={16} strokeWidth={1.75} color="var(--color-accent)" />
          {editing ? (
            <input
              data-testid="report-title-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{
                flex: 1,
                fontSize: '15px',
                fontWeight: 600,
                color: 'var(--color-text)',
                border: '1px solid var(--color-border)',
                borderRadius: 6,
                padding: '6px 10px',
                outline: 'none',
                fontFamily: 'inherit',
              }}
            />
          ) : (
            <h3
              style={{
                fontSize: '15px',
                fontWeight: 600,
                color: 'var(--color-text)',
                margin: 0,
                flex: 1,
              }}
            >
              {report.title}
            </h3>
          )}
          {!editing && (
            <>
              <button
                type="button"
                data-testid="report-edit-btn"
                onClick={() => setEditing(true)}
                title="编辑"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '4px 10px',
                  border: '1px solid var(--color-border-thin)',
                  background: 'var(--color-bg-subtle)',
                  color: 'var(--color-text-secondary)',
                  borderRadius: 6,
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                <Pencil size={11} strokeWidth={1.75} />
                编辑
              </button>
              <button
                type="button"
                data-testid="report-maximize-btn"
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
                  fontSize: '12px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {maximized ? <Minimize2 size={11} strokeWidth={1.75} /> : <Maximize2 size={11} strokeWidth={1.75} />}
                {maximized ? '还原' : '最大化'}
              </button>
            </>
          )}
        </div>

        {editing ? (
          <textarea
            data-testid="report-content-input"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            style={{
              flex: 1,
              overflow: 'auto',
              margin: 0,
              padding: 14,
              background: 'var(--color-bg-subtle)',
              border: '1px solid var(--color-border)',
              borderRadius: 6,
              fontSize: '13px',
              lineHeight: 1.7,
              fontFamily: 'var(--font-mono), monospace',
              color: 'var(--color-text)',
              outline: 'none',
              resize: 'vertical',
              minHeight: 320,
            }}
          />
        ) : (
          <pre
            data-testid="report-content-text"
            style={{
              flex: 1,
              overflow: 'auto',
              margin: 0,
              padding: 14,
              background: 'var(--color-bg-subtle)',
              border: '1px solid var(--color-border-thin)',
              borderRadius: 6,
              fontSize: '13px',
              lineHeight: 1.7,
              fontFamily: 'var(--font-mono), monospace',
              color: 'var(--color-text)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              userSelect: 'text',
            }}
          >
            {report.content ?? ''}
          </pre>
        )}

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            marginTop: 14,
          }}
        >
          {editing ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setTitle(report.title)
                  setContent(report.content ?? '')
                  setEditing(false)
                }}
                data-testid="report-cancel-btn"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '6px 14px',
                  background: 'var(--color-bg-subtle)',
                  color: 'var(--color-text)',
                  border: '1px solid var(--color-border-thin)',
                  borderRadius: 6,
                  fontSize: '12.5px',
                  cursor: 'pointer',
                }}
              >
                <XIcon size={11} strokeWidth={1.75} />
                取消
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                data-testid="report-save-btn"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '6px 14px',
                  background: 'var(--color-accent)',
                  color: 'var(--color-text-on-accent)',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: '12.5px',
                  fontWeight: 500,
                  cursor: saving ? 'wait' : 'pointer',
                }}
              >
                <Save size={11} strokeWidth={1.75} />
                {saving ? '保存中…' : '保存'}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(report.content ?? '')
                  } catch {
                    // ignore
                  }
                }}
                style={{
                  padding: '6px 14px',
                  background: 'var(--color-bg-subtle)',
                  color: 'var(--color-text)',
                  border: '1px solid var(--color-border-thin)',
                  borderRadius: 6,
                  fontSize: '12.5px',
                  cursor: 'pointer',
                }}
              >
                复制
              </button>
              <button
                type="button"
                onClick={onClose}
                data-testid="report-modal-close"
                style={{
                  padding: '6px 14px',
                  background: 'var(--color-accent)',
                  color: 'var(--color-text-on-accent)',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: '12.5px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                关闭
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Toast 提示
 */
function ReportsToast({ message, tone }: { message: string; tone: 'ok' | 'err' }) {
  return (
    <div
      role="status"
      data-testid="reports-toast"
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
      }}
    >
      {message}
    </div>
  )
}

// ============================================================
// 空态 / AI 占位
// ============================================================

function EmptyHint({
  type,
  scope,
  periodLabel,
}: {
  type: string
  scope: string
  periodLabel: string
}) {
  return (
    <div
      data-testid="reports-empty"
      style={{
        padding: '40px 20px',
        textAlign: 'center',
        background: 'var(--color-surface)',
        border: '1px dashed var(--color-border-thin)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      <div
        style={{
          fontSize: '13px',
          color: 'var(--color-text)',
          marginBottom: 4,
        }}
      >
        {periodLabel} 还没有 {type}（{scope === 'personal' ? '个人' : '项目'}）
      </div>
      <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }}>
        去主工作区点「生成报告」会自动写入这里
      </div>
    </div>
  )
}

function AIPlaceholder() {
  return (
    <div
      style={{
        padding: '60px 20px',
        textAlign: 'center',
        background: 'var(--color-surface)',
        border: '1px dashed var(--color-border-thin)',
        borderRadius: 'var(--radius-md)',
        marginTop: 8,
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: '50%',
          background: 'var(--color-accent-subtle)',
          margin: '0 auto 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Sparkles size={20} strokeWidth={1.5} color="var(--color-accent)" />
      </div>
      <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--color-text)', marginBottom: 4 }}>
        AI 报告 · 即将开放
      </div>
      <div
        style={{
          fontSize: '12.5px',
          color: 'var(--color-text-tertiary)',
          maxWidth: 480,
          margin: '0 auto',
          lineHeight: 1.6,
        }}
      >
        维护者说"AI 报告后面做报告中心的时候，再详细设计" · 届时会支持：项目总结、阶段汇报、按需自由生成等
      </div>
    </div>
  )
}