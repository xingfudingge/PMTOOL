/**
 * PMTool V2.0 · 父任务详情 Modal（项目中心 · 任务概览详情）
 *
 * 维护者 2026-08-26 spec · Excel 是设计蓝图 · 完全按公式实现
 *
 * 三子模块（拆分 · 维护者原话「顶多一个界面放不下，我允许你把
 * 甘特图、总体情况和完成情况、人工工作量分三个子模块去排版」）：
 *   1. 甘特图（SVG 时间轴 + 任务行）
 *   2. 总体情况和完成情况（项目概况 + 任务表 D/E/F/G/H/I 按 Excel 公式重算）
 *   3. 人工工作量（按 owner 分组 · 自然日 / 工作日 / 参与程度★）
 *
 * 顶部控制面板（Modal 顶级 · 跨 3 个 tab 永久可见）：
 *   项目名 / 启动日期 / 切换人名（select · 项目成员）/ 项目负责人 /
 *   本周结束时间 / 延期基准 / 显示第N周 / 项目持续周数 / 查看工作日人天
 *   + Excel 颜色配置条（5 色块 + 延期阈值）
 *
 * 顶部工具栏：下载模板 / 导出 Excel / 导入 Excel / 最大化 / 关闭
 *
 * 复用 service（不动）：
 *   - projectTasks.ts CRUD 全套
 *   - projectMembers.ts listProjectMembers（切换人名 select 选项来源）
 *   - excelProjects.ts parseProjectsExcel + exportProjectsToExcel
 *   - excelTemplate.ts downloadProjectTemplate
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  X,
  Calendar,
  User,
  Users,
  AlertTriangle,
  Maximize2,
  Minimize2,
  Plus,
  Pencil,
  Trash2,
  Download,
  Upload,
  FileSpreadsheet,
  ChevronRight,
  ChevronDown,
  TrendingUp,
  ListTodo,
  Activity,
  Timer,
  GanttChartSquare,
  LayoutGrid,
  Star,
} from 'lucide-react'

import type { ProjectDetailData } from '@/services/projectDetail'
import type { ProjectTask, NewTask } from '@/services/projectTasks'
import {
  createProjectTask,
  updateProjectTask,
  deleteProjectTask,
} from '@/services/projectTasks'
import { parseProjectsExcel, exportProjectsToExcel } from '@/services/excelProjects'
import { downloadProjectTemplate } from '@/services/excelTemplate'
import { saveBlobToDirectory } from '@/services/excel'
import { toast } from './Toast'
import { defaultHolidayProvider } from '@/services/holidayProvider'
import { listProjectMembers, type ProjectMember } from '@/services/projectMembers'

export interface ParentTaskDetailModalProps {
  open: boolean
  data: ProjectDetailData
  onClose: () => void
  /** CRUD 后用于刷新项目详情 */
  onRefresh?: () => Promise<void>
}

// ============================================================
// 类型 & 常量
// ============================================================

type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'DELAYED'

/** 三子模块 tab */
type ModuleTab = 'gantt' | 'overall' | 'workload'

/** 延期基准选项 */
type DelayBase = 'today' | 'weekEnd' | 'projectEnd'

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: 'PENDING', label: '待开始' },
  { value: 'IN_PROGRESS', label: '进行中' },
  { value: 'COMPLETED', label: '已完成' },
  { value: 'DELAYED', label: '已延期' },
]

const DELAY_BASE_OPTIONS: { value: DelayBase; label: string }[] = [
  { value: 'today', label: '按当前日期' },
  { value: 'weekEnd', label: '按本周结束时间' },
  { value: 'projectEnd', label: '按项目结束日期' },
]

/** Excel 公式颜色（蓝/红/绿/灰） */
const COLOR_PENDING = '#BFBFBF'
const COLOR_IN_PROGRESS = '#1677FF'
const COLOR_DELAYED = '#FF4D4F'
const COLOR_COMPLETED = '#52C41A'

/**
 * 任务表单字段（按 Excel 列顺序）：
 *   任务 / 跟进人 / 计划启动日期 / 计划完成日期 /
 *   自然日工时 / 当前完成度% / 工作日工时 / 任务完成情况说明 / status
 */
interface TaskFormData {
  task_name: string
  owner: string
  start_date: string
  end_date: string
  natural_days: string
  progress: string
  work_days: string
  status: TaskStatus
  remark: string
}

const EMPTY_FORM: TaskFormData = {
  task_name: '',
  owner: '',
  start_date: '',
  end_date: '',
  natural_days: '0',
  progress: '0',
  work_days: '0',
  status: 'PENDING',
  remark: '',
}

function taskToForm(t: ProjectTask): TaskFormData {
  return {
    task_name: t.task_name,
    owner: t.owner ?? '',
    start_date: t.start_date ?? '',
    end_date: t.end_date ?? '',
    natural_days: String(t.natural_days),
    progress: String(t.progress),
    work_days: String(t.work_days),
    status: t.status,
    remark: t.remark ?? '',
  }
}

function parseFormNumber(value: string, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

// ============================================================
// 纯工具（pure）
// ============================================================

function todayLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function parseDate(d: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null
  const dt = new Date(d + 'T00:00:00')
  return isNaN(dt.getTime()) ? null : dt
}

function diffDays(a: string, b: string): number {
  const ad = parseDate(a)
  const bd = parseDate(b)
  if (!ad || !bd) return 0
  return Math.round((bd.getTime() - ad.getTime()) / 86400000)
}

/** 加上天数 → YYYY-MM-DD */
function addDays(dateStr: string, n: number): string {
  const d = parseDate(dateStr)
  if (!d) return dateStr
  d.setDate(d.getDate() + n)
  return formatLocal(d)
}

/** NETWORKDAYS · Excel 公式版 · 含节假日（holidays Set） */
function networkdaysWithHolidays(start: string, end: string, holidays: Set<string>): number {
  const s = parseDate(start)
  const e = parseDate(end)
  if (!s || !e) return 0
  let count = 0
  const cur = new Date(s)
  while (cur.getTime() <= e.getTime()) {
    const day = cur.getDay()
    const y = cur.getFullYear()
    const m = String(cur.getMonth() + 1).padStart(2, '0')
    const dd = String(cur.getDate()).padStart(2, '0')
    const dateStr = `${y}-${m}-${dd}`
    if (day !== 0 && day !== 6 && !holidays.has(dateStr)) count++
    cur.setDate(cur.getDate() + 1)
  }
  return count
}

/** NETWORKDAYS 简化版（仅周末排除 · 与 Excel NETWORKDAYS(start,end) 一致）*/
function networkdays(start: string, end: string): number {
  return networkdaysWithHolidays(start, end, new Set())
}

/** 本周日 */
function getSunday(dateStr: string): string {
  const d = parseDate(dateStr)
  if (!d) return dateStr
  const day = d.getDay()
  const diff = day === 0 ? 0 : 7 - day
  d.setDate(d.getDate() + diff)
  return formatLocal(d)
}

/** 周一 */
function startOfWeek(dateStr: string): string {
  const d = parseDate(dateStr)
  if (!d) return dateStr
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return formatLocal(d)
}

/** 月份中文短标签（08-26 / 09-02）*/
function dateShort(d: Date): string {
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 中文年月（如「2026年6月」）*/
function dateYMDist(d: Date): string {
  return `${d.getFullYear()}年${d.getMonth() + 1}月`
}

/** 星期中文（一/二/.../日）*/
function weekdayCN(d: Date): string {
  return ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
}

/**
 * Bar 颜色规则（与 Excel 子任务条完全一致）：
 *   - status=COMPLETED 或 progress>=100 → 绿
 *   - 延期（end_date < threshold & status!=COMPLETED）→ 红
 *   - 进行中（0 < progress < 100 或 status=IN_PROGRESS）→ 蓝
 *   - 待开始（D 空 或 progress=0）→ 灰
 */
function getBarColor(
  task: Pick<ProjectTask, 'status' | 'progress' | 'start_date' | 'end_date'>,
  threshold: string,
): string {
  if (task.status === 'COMPLETED' || task.progress >= 100) return COLOR_COMPLETED
  if (task.end_date && task.end_date < threshold) return COLOR_DELAYED
  if (task.status === 'IN_PROGRESS' || (task.progress > 0 && task.progress < 100)) return COLOR_IN_PROGRESS
  if (!task.start_date || task.progress === 0) return COLOR_PENDING
  return COLOR_PENDING
}

// ============================================================
// Excel 父/子任务字段计算（pure · 与公式 1:1）
// ============================================================

/** D = MIN(子任务 D) · 无子任务 → 自身 D */
function parentDValue(parent: ProjectTask, children: ProjectTask[]): string {
  let min = parent.start_date ?? ''
  for (const c of children) {
    if (c.start_date && (!min || c.start_date < min)) min = c.start_date
  }
  return min
}

/** E = MAX(子任务 E) · 无子任务 → 自身 E */
function parentEValue(parent: ProjectTask, children: ProjectTask[]): string {
  let max = parent.end_date ?? ''
  for (const c of children) {
    if (c.end_date && (!max || c.end_date > max)) max = c.end_date
  }
  return max
}

/** F = IF(OR(D=空, E=空), 0, E-D+1) · 自然日 */
function parentFValue(parent: ProjectTask, children: ProjectTask[]): number {
  const d = parentDValue(parent, children)
  const e = parentEValue(parent, children)
  if (!d || !e) return 0
  const days = diffDays(d, e) + 1
  return days > 0 ? days : 0
}

/** G = IFERROR(SUMPRODUCT(子H, 子G)/SUM(子H), 0) · 加权平均 */
function parentGValue(parent: ProjectTask, children: ProjectTask[], holidays: Set<string>): number {
  if (children.length === 0) return parent.progress
  let weightedSum = 0
  let weightTotal = 0
  for (const c of children) {
    if (c.start_date && c.end_date) {
      const w = networkdaysWithHolidays(c.start_date, c.end_date, holidays)
      if (w > 0) {
        weightedSum += w * c.progress
        weightTotal += w
      }
    }
  }
  if (weightTotal === 0) return parent.progress
  return weightedSum / weightTotal
}

/** H = IF(OR(D=空, E=空), " - ", NETWORKDAYS(D,E)) · 工作日 */
function parentHValue(parent: ProjectTask, children: ProjectTask[], holidays: Set<string>): number | string {
  const d = parentDValue(parent, children)
  const e = parentEValue(parent, children)
  if (!d || !e) return ' - '
  return networkdaysWithHolidays(d, e, holidays)
}

/** I = TEXTJOIN 子 I 列 · 各子任务说明拼接 */
function parentIValue(parent: ProjectTask, children: ProjectTask[]): string {
  const parts: string[] = []
  if (parent.remark) parts.push(parent.remark)
  for (const c of children) {
    if (c.remark) parts.push(c.remark)
  }
  return parts.join(' · ')
}

/** 子任务 E（完成日期）= IF(D 空, " - ", IF(F=0, D, D+F-1)) */
function childEValue(child: ProjectTask): string {
  if (!child.start_date) return ' - '
  if (!child.natural_days || child.natural_days <= 0) return child.start_date
  return addDays(child.start_date, child.natural_days - 1)
}

/** 子任务 H（工作日）= IF(OR(D=0, E=0), " - ", NETWORKDAYS(D, E)) */
function childHValue(child: ProjectTask, holidays: Set<string>): number | string {
  if (!child.start_date || !child.end_date) return ' - '
  return networkdaysWithHolidays(child.start_date, child.end_date, holidays)
}

/** 项目启动日期默认 = MIN(任务 start_date) · 兜底 = 项目 start_date */
function defaultStartDate(data: ProjectDetailData): string {
  const starts = data.tasks
    .map((t) => t.start_date)
    .filter((s): s is string => !!s)
  if (starts.length === 0) return data.project.start_date ?? todayLocal()
  return starts.reduce((a, b) => (a < b ? a : b))
}

/** 项目结束日期 = MAX(任务 end_date) · 兜底 = 项目 end_date */
function projectEndDate(data: ProjectDetailData): string {
  const ends = data.tasks
    .map((t) => t.end_date)
    .filter((s): s is string => !!s)
  if (ends.length === 0) return data.project.end_date ?? todayLocal()
  return ends.reduce((a, b) => (a > b ? a : b))
}

// ============================================================
// 主组件
// ============================================================

export function ParentTaskDetailModal({
  open,
  data,
  onClose,
  onRefresh,
}: ParentTaskDetailModalProps) {
  // ---------- UI / 交互状态 ----------
  const [maximized, setMaximized] = useState(false)
  const [activeModule, setActiveModule] = useState<ModuleTab>('gantt')
  const [expandedRows, setExpandedRows] = useState<Set<number>>(() => new Set())
  const [selectedGanttTaskId, setSelectedGanttTaskId] = useState<number | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null)
  const [deletingTask, setDeletingTask] = useState<ProjectTask | null>(null)
  const [importConfirm, setImportConfirm] = useState<ProjectTask[] | null>(null)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<TaskFormData>(EMPTY_FORM)

  // ---------- 维护者 2026-08-26 spec · 顶部控制面板 state ----------
  // 启动日期：默认 MIN(任务 start_date) · 可改
  const [startDate, setStartDate] = useState<string>('')
  // 切换人名（Excel C2 等价）：可改
  const [switchName, setSwitchName] = useState<string>('')
  // 项目负责人：可改
  const [leadName, setLeadName] = useState<string>('')
  // 本周结束时间：默认 = 本周日 · 可改
  const [weekEnd, setWeekEnd] = useState<string>('')
  // 延期基准：today / weekEnd / projectEnd
  const [delayBase, setDelayBase] = useState<DelayBase>('today')
  // 显示第 N 周：1..项目持续周数
  const [displayWeek, setDisplayWeek] = useState<number>(1)
  // 查看工作日人天（只读 · = 任务列表 SUM(work_days)）
  const [viewWorkDays, setViewWorkDays] = useState<number>(0)
  // 项目成员列表（用于切换人名 select 选项来源）
  const [members, setMembers] = useState<ProjectMember[]>([])

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const importBusyRef = useRef(false)
  const ganttScrollRef = useRef<HTMLDivElement | null>(null)

  // ---------- 打开时清空所有瞬态状态 + 初始化控制面板 ----------
  useEffect(() => {
    if (open) {
      setActiveModule('gantt')
      setShowCreateForm(false)
      setEditingTaskId(null)
      setDeletingTask(null)
      setImportConfirm(null)
      setImportFile(null)
      setExpandedRows(new Set())
      setSelectedGanttTaskId(null)
      setError(null)
      setBusy(false)
      setForm(EMPTY_FORM)
      importBusyRef.current = false

      // 控制面板初始化
      setStartDate(defaultStartDate(data))
      // 切换人名默认 = 项目负责人 · 维护者 2026-08-26 spec · 打开 modal 时 if (!switchName) setSwitchName(owner)
      setSwitchName(data.project.owner ?? '')
      setLeadName(data.project.owner ?? '')
      setWeekEnd(getSunday(todayLocal()))
      setDelayBase('today')
      setDisplayWeek(1)
      setViewWorkDays(
        data.tasks.reduce((s, t) => s + (Number.isFinite(t.work_days) ? t.work_days : 0), 0),
      )
    }
  }, [open, data])

  // ---------- 加载项目成员（切换人名 select 选项来源）----------
  useEffect(() => {
    if (!open) return
    let cancelled = false
    listProjectMembers(data.project.id)
      .then((list) => {
        if (!cancelled) setMembers(list)
      })
      .catch((e) => console.error('[ParentTaskDetailModal] 加载成员失败', e))
    return () => {
      cancelled = true
    }
  }, [open, data.project.id])

  // ---------- Esc 关闭（按层级退栈）----------
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (busy || importBusyRef.current) return
      if (deletingTask) {
        setDeletingTask(null)
        return
      }
      if (importConfirm) {
        setImportConfirm(null)
        setImportFile(null)
        return
      }
      if (editingTaskId !== null) {
        setEditingTaskId(null)
        setForm(EMPTY_FORM)
        return
      }
      if (showCreateForm) {
        setShowCreateForm(false)
        setForm(EMPTY_FORM)
        return
      }
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, deletingTask, importConfirm, editingTaskId, showCreateForm, onClose])

  // ---------- 计算 ----------
  // 节日 Set（一次性生成 · 传给 networkdaysWithHolidays 按工作日计算）
  const holidaySet = useMemo(() => {
    const set = new Set<string>()
    // 读数据库同步的法定节假日（与设置中心一致 · 并保留周末兜底）
    const cur = new Date()
    cur.setFullYear(cur.getFullYear() - 1)
    for (let i = 0; i < 365 * 3; i++) {
      const y = cur.getFullYear()
      const m = String(cur.getMonth() + 1).padStart(2, '0')
      const d = String(cur.getDate()).padStart(2, '0')
      const ds = `${y}-${m}-${d}`
      if (defaultHolidayProvider.isHoliday(ds)) {
        set.add(ds)
      }
      cur.setDate(cur.getDate() + 1)
    }
    return set
  }, [open])

  const projectEnd = useMemo(() => projectEndDate(data), [data])

  // 项目持续周数 = INT((MAX(end_date) - 启动日期) / 7) + 1
  const durationWeeks = useMemo(() => {
    const end = projectEnd
    if (!startDate || !end || end < startDate) return 1
    return Math.floor(diffDays(startDate, end) / 7) + 1
  }, [startDate, projectEnd])

  const computed = useMemo(() => computeDetail(data), [data])
  const flatTasks = useMemo(() => buildFlatTaskList(data.tasks), [data.tasks])

  // 启动日期变更 → 重算 viewWorkDays（避免显示滞后）
  useEffect(() => {
    setViewWorkDays(
      data.tasks.reduce((s, t) => s + (Number.isFinite(t.work_days) ? t.work_days : 0), 0),
    )
  }, [data.tasks])

  // 打开甘特图时刷新法定节假日缓存（读数据库同步数据 · 与设置中心一致）
  useEffect(() => {
    if (open) void defaultHolidayProvider.load()
  }, [open])

  // displayWeek 改变 → 横向滚动到对应周
  useEffect(() => {
    const el = ganttScrollRef.current
    if (!el) return
    const DAY_W = 14
    const weekW = 7 * DAY_W
    const LABEL_W = 200
    el.scrollTo({ left: (displayWeek - 1) * weekW - LABEL_W * 0, behavior: 'smooth' })
  }, [displayWeek, activeModule])

  if (!open) return null

  // ---------- 任务 CRUD handlers ----------
  const handleStartCreate = () => {
    setError(null)
    setShowCreateForm(true)
    setEditingTaskId(null)
    setForm(EMPTY_FORM)
  }

  const handleStartEdit = (task: ProjectTask) => {
    setError(null)
    setShowCreateForm(false)
    setEditingTaskId(task.id)
    setForm(taskToForm(task))
  }

  const handleCancelForm = () => {
    setShowCreateForm(false)
    setEditingTaskId(null)
    setForm(EMPTY_FORM)
    setError(null)
  }

  const handleSaveTask = async () => {
    if (busy) return
    if (!form.task_name.trim()) {
      setError('任务名称不能为空')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const computedWorkDays =
        form.start_date && form.end_date
          ? networkdaysWithHolidays(form.start_date, form.end_date, holidaySet)
          : 0
      const userWorkDays = parseFormNumber(form.work_days, 0)
      const finalWorkDays = userWorkDays > 0 ? userWorkDays : computedWorkDays

      const baseTask: Partial<NewTask> = {
        task_name: form.task_name.trim(),
        owner: form.owner.trim() || null,
        start_date: form.start_date.trim() || null,
        end_date: form.end_date.trim() || null,
        natural_days: parseFormNumber(form.natural_days, 0),
        work_days: finalWorkDays,
        progress: parseFormNumber(form.progress, 0),
        status: form.status,
        remark: form.remark.trim() || null,
      }

      if (editingTaskId !== null) {
        await updateProjectTask(editingTaskId, baseTask)
      } else {
        await createProjectTask({
          ...baseTask,
          project_id: data.project.id,
        } as NewTask)
      }
      setShowCreateForm(false)
      setEditingTaskId(null)
      setForm(EMPTY_FORM)
      if (onRefresh) await onRefresh()
      toast.success(editingTaskId !== null ? '任务已保存' : '任务已新增')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error('保存任务失败', msg)
      setError(msg)
    } finally {
      setBusy(false)
    }
  }

  const handleConfirmDelete = async () => {
    if (!deletingTask || busy) return
    setBusy(true)
    setError(null)
    try {
      await deleteProjectTask(deletingTask.id)
      setDeletingTask(null)
      if (onRefresh) await onRefresh()
      toast.success('任务已删除')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error('删除任务失败', msg)
      setError(msg)
    } finally {
      setBusy(false)
    }
  }

  // ---------- Excel handlers ----------
  const handleDownloadTemplate = () => {
    try {
      downloadProjectTemplate()
      toast.success('模板已下载', `${data.project.project_name}_任务清单_模板.xlsx`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error('下载模板失败', msg)
      setError(msg)
    }
  }

  const handleExportExcel = async () => {
    setBusy(true)
    setError(null)
    try {
      const blob = await exportProjectsToExcel(data.tasks)
      const filename = `${data.project.project_name}_任务清单_${todayLocal()}.xlsx`
      await saveBlobToDirectory(blob, filename)
      toast.success(`已导出 ${data.tasks.length} 条任务`, filename)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error('导出 Excel 失败', msg)
      setError(msg)
    } finally {
      setBusy(false)
    }
  }

  const handleImportClick = () => {
    if (busy) return
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const parsed = await parseProjectsExcel(file, data.project.id)
      if (parsed.length === 0) {
        toast.warning('Excel 中没有可导入的任务')
        setError('Excel 中没有可导入的任务（请检查 sheet「项目管理」列头与序号）')
      } else {
        setImportFile(file)
        setImportConfirm(parsed)
        toast.success(`已解析 ${parsed.length} 条任务`, '请在确认框中预览并确认导入')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error('解析 Excel 失败', msg)
      setError(msg)
    } finally {
      setBusy(false)
    }
  }

  const handleConfirmImport = async () => {
    if (!importConfirm || importBusyRef.current) return
    importBusyRef.current = true
    setBusy(true)
    setError(null)
    try {
      const idMap = new Map<number, number>()
      const parents = importConfirm.filter((t) => t.parent_id === null)
      const children = importConfirm.filter((t) => t.parent_id !== null)

      for (const t of parents) {
        const newTask: NewTask = {
          project_id: data.project.id,
          task_name: t.task_name,
          owner: t.owner,
          start_date: t.start_date,
          end_date: t.end_date,
          natural_days: t.natural_days,
          work_days: t.work_days,
          progress: t.progress,
          status: t.status,
          remark: t.remark,
          sort_order: t.sort_order,
        }
        const realId = await createProjectTask(newTask)
        idMap.set(t.id, realId)
      }

      for (const t of children) {
        const mappedParent =
          t.parent_id !== null ? idMap.get(t.parent_id) ?? null : null
        const newTask: NewTask = {
          project_id: data.project.id,
          parent_id: mappedParent,
          task_name: t.task_name,
          owner: t.owner,
          start_date: t.start_date,
          end_date: t.end_date,
          natural_days: t.natural_days,
          work_days: t.work_days,
          progress: t.progress,
          status: t.status,
          remark: t.remark,
          sort_order: t.sort_order,
        }
        await createProjectTask(newTask)
      }

      setImportConfirm(null)
      setImportFile(null)
      if (onRefresh) await onRefresh()
      toast.success(`成功导入 ${parents.length + children.length} 条任务`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error('导入失败', msg)
      setError(msg)
    } finally {
      importBusyRef.current = false
      setBusy(false)
    }
  }

  const handleCancelImport = () => {
    if (importBusyRef.current) return
    setImportConfirm(null)
    setImportFile(null)
  }

  // ---------- 容器尺寸 ----------
  const containerStyle: React.CSSProperties = maximized
    ? { width: '95vw', height: '95vh', maxHeight: '95vh' }
    : { width: '960px', maxHeight: '90vh' }

  // 延期阈值（按选项计算）
  const delayThreshold =
    delayBase === 'today' ? todayLocal() : delayBase === 'weekEnd' ? weekEnd : projectEnd

  return (
    <div
      data-testid="parent-task-detail-modal"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 250,
      }}
      onClick={busy || importBusyRef.current ? undefined : onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          ...containerStyle,
          background: 'var(--color-surface)',
          borderRadius: 'var(--radius-md)',
          boxShadow: '0 12px 40px rgba(0, 0, 0, 0.18)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* ============ 顶部标题栏 ============ */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '14px 18px',
            borderBottom: '1px solid var(--color-border-thin)',
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
              任务概览 · 详情
            </div>
            <div
              style={{
                fontSize: '15px',
                fontWeight: 600,
                color: 'var(--color-text)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {data.project.project_name}
            </div>
          </div>

          {/* Excel 工具栏 */}
          <ToolbarButton
            testid="detail-download-template"
            label="下载模板"
            icon={FileSpreadsheet}
            onClick={handleDownloadTemplate}
            disabled={busy}
          />
          <ToolbarButton
            testid="detail-export-excel"
            label="导出 Excel"
            icon={Download}
            onClick={handleExportExcel}
            disabled={busy}
          />
          <ToolbarButton
            testid="detail-import-excel"
            label="导入 Excel"
            icon={Upload}
            onClick={handleImportClick}
            disabled={busy}
          />

          {/* 最大化 / 还原 */}
          <button
            data-testid={maximized ? 'detail-restore' : 'detail-maximize'}
            onClick={() => setMaximized((m) => !m)}
            title={maximized ? '还原' : '最大化'}
            style={{ ...iconBtnStyle, width: 'auto', padding: '0 8px', gap: 4, fontSize: 12, fontFamily: 'inherit' }}
          >
            {maximized ? (
              <>
                <Minimize2 size={13} strokeWidth={1.75} />
                还原
              </>
            ) : (
              <>
                <Maximize2 size={13} strokeWidth={1.75} />
                最大化
              </>
            )}
          </button>

          {/* 关闭 */}
          <button
            onClick={busy || importBusyRef.current ? undefined : onClose}
            data-testid="parent-task-detail-close"
            style={{
              ...iconBtnStyle,
              cursor: busy || importBusyRef.current ? 'not-allowed' : 'pointer',
              opacity: busy || importBusyRef.current ? 0.6 : 1,
            }}
          >
            <X size={14} strokeWidth={1.75} />
          </button>

          {/* 隐藏文件 input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            data-testid="detail-import-file-input"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
        </div>

        {/* ============ 项目控制面板（Modal 顶部 · 跨 3 个 tab 永久可见）============ */}
        <ProjectControlPanel
          projectName={data.project.project_name}
          startDate={startDate}
          switchName={switchName}
          leadName={leadName}
          weekEnd={weekEnd}
          delayBase={delayBase}
          displayWeek={displayWeek}
          viewWorkDays={viewWorkDays}
          durationWeeks={durationWeeks}
          members={members}
          threshold={delayThreshold}
          onStartDateChange={setStartDate}
          onSwitchNameChange={setSwitchName}
          onLeadNameChange={setLeadName}
          onWeekEndChange={setWeekEnd}
          onDelayBaseChange={setDelayBase}
          onDisplayWeekChange={(n) =>
            setDisplayWeek(Math.max(1, Math.min(durationWeeks, n)))
          }
        />

        {/* ============ 模块 Tab 切换栏 ============ */}
        <ModuleTabs active={activeModule} onChange={setActiveModule} disabled={busy} />

        {/* ============ 错误条 ============ */}
        {error && (
          <div
            data-testid="detail-error"
            style={{
              padding: '8px 18px',
              background: 'rgba(217, 45, 32, 0.08)',
              borderBottom: '1px solid rgba(217, 45, 32, 0.2)',
              color: 'var(--color-status-danger)',
              fontSize: '12.5px',
            }}
          >
            {error}
          </div>
        )}

        {/* ============ 内容（按 tab 切换三子模块）============ */}
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: '18px',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          {activeModule === 'gantt' && (
            <GanttModule
              data={data}
              computed={computed}
              selectedId={selectedGanttTaskId}
              onSelect={setSelectedGanttTaskId}
              startDate={startDate}
              onChangeStartDate={setStartDate}
              switchName={switchName}
              onChangeSwitchName={setSwitchName}
              leadName={leadName}
              onChangeLeadName={setLeadName}
              weekEnd={weekEnd}
              onChangeWeekEnd={setWeekEnd}
              delayBase={delayBase}
              onChangeDelayBase={setDelayBase}
              displayWeek={displayWeek}
              onChangeDisplayWeek={(n) =>
                setDisplayWeek(Math.max(1, Math.min(durationWeeks, n)))
              }
              durationWeeks={durationWeeks}
              viewWorkDays={viewWorkDays}
              threshold={delayThreshold}
              projectEnd={projectEnd}
              holidaySet={holidaySet}
              scrollRef={ganttScrollRef}
            />
          )}

          {activeModule === 'overall' && (
            <OverallModule
              data={data}
              computed={computed}
              flatTasks={flatTasks}
              expandedRows={expandedRows}
              onToggleExpand={(id) => {
                setExpandedRows((prev) => {
                  const next = new Set(prev)
                  if (next.has(id)) next.delete(id)
                  else next.add(id)
                  return next
                })
              }}
              showCreateForm={showCreateForm}
              editingTaskId={editingTaskId}
              form={form}
              onFormChange={setForm}
              onStartCreate={handleStartCreate}
              onStartEdit={handleStartEdit}
              onCancelForm={handleCancelForm}
              onSaveTask={handleSaveTask}
              onDeleteTask={setDeletingTask}
              busy={busy}
              holidaySet={holidaySet}
              startDate={startDate}
              threshold={delayThreshold}
            />
          )}

          {activeModule === 'workload' && <WorkloadModule computed={computed} />}
        </div>
      </div>

      {/* ============ 删除确认 ============ */}
      {deletingTask &&
        createPortal(
          <ConfirmCascadeModal
            testid="detail-delete-confirm"
            title="删除任务"
            message={
              <>
                确定要删除任务「
                <strong style={{ color: 'var(--color-text)' }}>
                  {deletingTask.task_name}
                </strong>
                」吗？此操作不可撤销。
              </>
            }
            confirmLabel={busy ? '删除中…' : '删除任务'}
            onConfirm={handleConfirmDelete}
            onCancel={() => !busy && setDeletingTask(null)}
            busy={busy}
            extra={
              deletingTask.parent_id !== null ? (
                <div
                  style={{
                    padding: '10px 12px',
                    background: 'var(--color-bg-subtle)',
                    borderRadius: 'var(--radius)',
                    fontSize: '12px',
                    color: 'var(--color-text-tertiary)',
                    marginBottom: 8,
                  }}
                >
                  该任务为子任务，删除后将从父任务下移除。
                </div>
              ) : null
            }
          />,
          document.body,
        )}

      {/* ============ 导入确认 ============ */}
      {importConfirm &&
        createPortal(
          <ConfirmCascadeModal
            testid="detail-import-confirm"
            title="导入任务"
            message={
              <>
                将从「
                <strong style={{ color: 'var(--color-text)' }}>
                  {importFile?.name ?? 'Excel 文件'}
                </strong>
                」导入{' '}
                <strong style={{ color: 'var(--color-status-warning)' }}>
                  {importConfirm.length}
                </strong>{' '}
                条任务（含父子层级），是否追加到当前任务列表？
              </>
            }
            confirmLabel={
              importBusyRef.current || busy ? '导入中…' : '确认导入'
            }
            onConfirm={handleConfirmImport}
            onCancel={handleCancelImport}
            busy={busy}
            extra={
              <div
                style={{
                  padding: '10px 12px',
                  background: 'var(--color-bg-subtle)',
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--color-border-thin)',
                  marginBottom: 8,
                  fontSize: '12px',
                  color: 'var(--color-text-secondary)',
                }}
              >
                <div style={{ marginBottom: 4 }}>
                  · 共{' '}
                  {importConfirm.filter((t) => t.parent_id === null).length}{' '}
                  条父任务 ·{' '}
                  {importConfirm.filter((t) => t.parent_id !== null).length}{' '}
                  条子任务
                </div>
                <div style={{ color: 'var(--color-text-tertiary)' }}>
                  导入完成后现有任务不会被删除 · 新任务会追加到列表
                </div>
              </div>
            }
          />,
          document.body,
        )}
    </div>
  )
}

// ============================================================
// 子组件：模块 Tab 切换栏
// ============================================================

function ModuleTabs({
  active,
  onChange,
  disabled,
}: {
  active: ModuleTab
  onChange: (m: ModuleTab) => void
  disabled: boolean
}) {
  const tabs: { id: ModuleTab; label: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number }> }[] = [
    { id: 'gantt', label: '甘特图（任务时间线）', icon: GanttChartSquare },
    { id: 'overall', label: '总体情况和完成情况', icon: LayoutGrid },
    { id: 'workload', label: '人工工作量', icon: Users },
  ]
  return (
    <div
      data-testid="detail-module-tabs"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '8px 18px 0',
        borderBottom: '1px solid var(--color-border-thin)',
        background: 'var(--color-bg-subtle)',
      }}
    >
      {tabs.map((t) => {
        const isActive = t.id === active
        const Icon = t.icon
        return (
          <button
            key={t.id}
            data-testid={`detail-tab-${t.id}`}
            onClick={disabled ? undefined : () => onChange(t.id)}
            disabled={disabled}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              background: 'transparent',
              border: 'none',
              borderBottom: isActive
                ? '2px solid var(--color-accent)'
                : '2px solid transparent',
              color: isActive
                ? 'var(--color-accent)'
                : 'var(--color-text-secondary)',
              fontSize: '12.5px',
              fontWeight: isActive ? 600 : 500,
              cursor: disabled ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s',
              marginBottom: -1,
            }}
          >
            <Icon size={13} strokeWidth={1.75} />
            {t.label}
          </button>
        )
      })}
    </div>
  )
}

// ============================================================
// 子模块 1 · 甘特图（SVG 时间轴 + 任务行）
// 维护者 2026-08-26 spec · Excel 公式重写 · 顶部控制面板已上提到 ParentTaskDetailModal
// ============================================================

interface GanttModuleProps {
  data: ProjectDetailData
  computed: DetailComputed
  selectedId: number | null
  onSelect: (id: number | null) => void
  // 顶部控制面板 state（保留在接口中 · 当前仅甘特图本体使用部分）
  startDate: string
  onChangeStartDate: (v: string) => void
  switchName: string
  onChangeSwitchName: (v: string) => void
  leadName: string
  onChangeLeadName: (v: string) => void
  weekEnd: string
  onChangeWeekEnd: (v: string) => void
  delayBase: DelayBase
  onChangeDelayBase: (v: DelayBase) => void
  displayWeek: number
  onChangeDisplayWeek: (n: number) => void
  durationWeeks: number
  viewWorkDays: number
  threshold: string
  projectEnd: string
  holidaySet: Set<string>
  scrollRef: React.RefObject<HTMLDivElement | null>
}

function GanttModule({
  data,
  computed: _computed,
  selectedId,
  onSelect,
  startDate,
  onChangeStartDate: _onChangeStartDate,
  switchName: _switchName,
  onChangeSwitchName: _onChangeSwitchName,
  leadName: _leadName,
  onChangeLeadName: _onChangeLeadName,
  weekEnd: _weekEnd,
  onChangeWeekEnd: _onChangeWeekEnd,
  delayBase: _delayBase,
  onChangeDelayBase: _onChangeDelayBase,
  displayWeek,
  onChangeDisplayWeek: _onChangeDisplayWeek,
  durationWeeks: _durationWeeks,
  viewWorkDays: _viewWorkDays,
  threshold,
  projectEnd: _projectEnd,
  holidaySet: _holidaySet,
  scrollRef,
}: GanttModuleProps) {
  // 注：维护者 2026-08-26 spec · 顶部控制面板（含颜色配置条）已上提到 ParentTaskDetailModal 顶级
  // 本组件仅保留甘特图本体（SVG 时间轴 + 任务行）+ 右侧详情面板
  // 未使用的 props（switchName/leadName/weekEnd/delayBase/durationWeeks/viewWorkDays 等）
  // 保留在接口中以备将来「按切换人名筛选任务」等功能使用（spec 验收提到 · 不强求）

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* ============ 主体：左侧甘特 + 右侧详情 ============ */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div
          style={{
            flex: 1,
            minWidth: 0,
            border: '1px solid var(--color-border-thin)',
            borderRadius: 'var(--radius)',
            background: 'var(--color-surface)',
            overflow: 'hidden',
          }}
        >
          <div
            ref={scrollRef}
            data-testid="gantt-scroll"
            style={{
              overflowX: 'auto',
              overflowY: 'hidden',
              maxWidth: '100%',
            }}
          >
            <GanttSvg
              tasks={data.tasks}
              today={todayLocal()}
              threshold={threshold}
              startDate={startDate}
              selectedId={selectedId}
              onSelect={onSelect}
              displayWeek={displayWeek}
            />
          </div>
          {/* 图例 */}
          <GanttLegend />
        </div>

        {/* 右侧详情面板 */}
        <div style={{ width: 280, flexShrink: 0 }}>
          <GanttDetailPanel
            tasks={data.tasks}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        </div>
      </div>
    </div>
  )
}

// ============================================================
// 项目控制面板（Modal 顶级 · 3 个 tab 永久可见）
// 维护者 2026-08-26 spec · 从 GanttModule 上提
// ============================================================

interface ProjectControlPanelProps {
  projectName: string
  startDate: string
  switchName: string
  leadName: string
  weekEnd: string
  delayBase: DelayBase
  displayWeek: number
  viewWorkDays: number
  durationWeeks: number
  members: ProjectMember[]
  threshold: string
  onStartDateChange: (v: string) => void
  onSwitchNameChange: (v: string) => void
  onLeadNameChange: (v: string) => void
  onWeekEndChange: (v: string) => void
  onDelayBaseChange: (v: DelayBase) => void
  onDisplayWeekChange: (n: number) => void
}

function ProjectControlPanel({
  projectName,
  startDate,
  switchName,
  leadName,
  weekEnd,
  delayBase,
  displayWeek,
  viewWorkDays,
  durationWeeks,
  members,
  threshold,
  onStartDateChange,
  onSwitchNameChange,
  onLeadNameChange,
  onWeekEndChange,
  onDelayBaseChange,
  onDisplayWeekChange,
}: ProjectControlPanelProps) {
  // 切换人名 select 选项：["无", ...members.name 去重]
  const memberNames: string[] = Array.from(
    new Set(members.map((m) => m.name).filter((n): n is string => !!n && n.length > 0)),
  )

  // 如果当前 switchName 不在成员列表中（项目负责人可能未在成员表中），
  // 加一个 ghost option 以保证 select 能正确显示当前值
  const currentInList = switchName && memberNames.includes(switchName)
  const ghostValue = switchName && !currentInList ? switchName : null

  return (
    <div
      data-testid="project-control-panel-wrapper"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: '12px 18px 0',
        background: 'var(--color-surface)',
      }}
    >
      {/* ============ 控制面板 grid（横排 9 列自适应）============ */}
      <div
        data-testid="project-control-panel"
        style={{
          padding: '12px 14px',
          background: 'var(--color-bg-subtle)',
          borderRadius: 'var(--radius)',
          border: '1px solid var(--color-border-thin)',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: 12,
        }}
      >
        {/* 1 · 项目名（只读）*/}
        <ControlField label="项目名" value={projectName} />
        {/* 2 · 启动日期（可改 · 默认 MIN(任务 start_date)）*/}
        <ControlFieldInput
          testid="control-start-date"
          label="启动日期"
          type="date"
          value={startDate}
          onChange={onStartDateChange}
          mono
        />
        {/* 3 · 切换人名（select · 选项：项目成员去重 + "无"）*/}
        <div>
          <div
            style={{
              fontSize: '10.5px',
              color: 'var(--color-text-tertiary)',
              marginBottom: 3,
            }}
          >
            切换人名（Excel C2）
          </div>
          <select
            data-testid="control-switch-name"
            value={switchName}
            onChange={(e) => onSwitchNameChange(e.target.value)}
            style={{
              width: '100%',
              padding: '4px 8px',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border-thin)',
              borderRadius: 'var(--radius)',
              fontSize: '12.5px',
              color: 'var(--color-text)',
              outline: 'none',
              fontFamily: 'inherit',
            }}
          >
            <option value="">无</option>
            {ghostValue && (
              <option value={ghostValue}>{ghostValue}（非成员）</option>
            )}
            {memberNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        {/* 4 · 项目负责人（text input · 默认 = data.project.owner）*/}
        <ControlFieldInput
          testid="control-lead-name"
          label="项目负责人"
          type="text"
          value={leadName}
          onChange={onLeadNameChange}
          placeholder="项目负责人"
        />

        {/* 5 · 本周结束时间 */}
        <ControlFieldInput
          testid="control-week-end"
          label="本周结束时间"
          type="date"
          value={weekEnd}
          onChange={onWeekEndChange}
          mono
        />
        {/* 6 · 延期基准 */}
        <ControlFieldSelect
          testid="control-delay-base"
          label="延期基准"
          value={delayBase}
          onChange={(v) => onDelayBaseChange(v as DelayBase)}
          options={DELAY_BASE_OPTIONS}
        />
        {/* 7 · 显示第 N 周（1..durationWeeks）*/}
        <ControlFieldInput
          testid="control-display-week"
          label={`显示第 N 周（1~${durationWeeks}）`}
          type="number"
          min={1}
          max={durationWeeks}
          value={String(displayWeek)}
          onChange={(v) => onDisplayWeekChange(parseFormNumber(v, 1))}
          mono
        />
        {/* 8 · 项目持续周数（只读）*/}
        <ControlField
          label="项目持续周数"
          value={String(durationWeeks)}
          mono
          accent="var(--color-text-secondary)"
        />
        {/* 9 · 查看工作日人天（只读）*/}
        <ControlField
          label="查看工作日人天"
          value={String(viewWorkDays)}
          mono
          accent="var(--color-accent)"
        />
      </div>

      {/* ============ Excel 颜色配置条（5 个色块 + 延期阈值 · 控制面板下方）============ */}
      <div
        data-testid="project-color-strip"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '6px 12px',
          background: 'var(--color-bg-subtle)',
          borderRadius: 'var(--radius)',
          border: '1px solid var(--color-border-thin)',
          fontSize: '11px',
          color: 'var(--color-text-tertiary)',
        }}
      >
        <ColorChip color={COLOR_PENDING} label="待启动" />
        <ColorChip color={COLOR_IN_PROGRESS} label="进行中" />
        <ColorChip color={COLOR_DELAYED} label="已延期" />
        <ColorChip color={COLOR_COMPLETED} label="已完成" />
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: 'var(--font-mono)' }}>
          延期阈值：{threshold}
        </span>
      </div>
    </div>
  )
}

/** 甘特 SVG 主体 · 时间轴 + 任务行 */
function GanttSvg({
  tasks,
  today,
  threshold,
  startDate,
  selectedId,
  onSelect,
  displayWeek,
}: {
  tasks: ProjectTask[]
  today: string
  threshold: string
  startDate: string
  selectedId: number | null
  onSelect: (id: number | null) => void
  displayWeek: number
}) {
  const DAY_W = 14
  const ROW_H_PARENT = 30
  const ROW_H_CHILD = 22
  const LABEL_W = 200
  const HEADER_H = 56

  // 时间轴起点 = 启动日期所在周一
  const tlStart = startOfWeek(startDate || today)

  // 时间轴终点 = MAX(end_date) + 7
  const ends = tasks
    .map((t) => t.end_date)
    .filter((s): s is string => !!s)
  let tlEnd = today
  if (ends.length > 0) tlEnd = ends.reduce((a, b) => (a > b ? a : b))
  tlEnd = addDays(tlEnd, 7)

  // 至少 N 周（保证 6 周可视）
  const minEnd = addDays(tlStart, 7 * 6 - 1)
  if (diffDays(tlStart, tlEnd) < diffDays(tlStart, minEnd)) tlEnd = minEnd

  const totalDays = diffDays(tlStart, tlEnd) + 1
  const chartW = totalDays * DAY_W
  const totalW = LABEL_W + chartW

  const tlStartMs = parseDate(tlStart)?.getTime() ?? 0
  const todayMs = parseDate(today)?.getTime() ?? 0

  // 父子分组
  const parents = tasks.filter((t) => t.parent_id === null)
  const childMap = new Map<number, ProjectTask[]>()
  for (const t of tasks) {
    if (t.parent_id !== null) {
      const arr = childMap.get(t.parent_id) ?? []
      arr.push(t)
      childMap.set(t.parent_id, arr)
    }
  }
  const sortedParents = [...parents].sort((a, b) => a.sort_order - b.sort_order)

  // 总行高
  let totalRows = 0
  for (const p of sortedParents) {
    totalRows += 1
    totalRows += childMap.get(p.id)?.length ?? 0
  }
  if (totalRows === 0) totalRows = 1
  const totalH = HEADER_H + totalRows * (ROW_H_PARENT + 4) + 16

  // 日期 → x
  const dateToX = (d: string): number => {
    const dt = parseDate(d)
    if (!dt) return LABEL_W
    const days = Math.round((dt.getTime() - tlStartMs) / 86400000)
    return LABEL_W + days * DAY_W
  }

  // 周列表
  const weeks: { startMs: number; label: string; date: Date }[] = []
  let cur = parseDate(tlStart)
  if (cur) {
    let safety = 0
    while (cur.getTime() <= (parseDate(tlEnd)?.getTime() ?? 0) && safety++ < 400) {
      const ms = cur.getTime()
      weeks.push({ startMs: ms, label: `${dateShort(cur)}`, date: new Date(cur) })
      cur = new Date(cur)
      cur.setDate(cur.getDate() + 7)
    }
  }

  // 每天标记（节假日 / 周末）
  type DayMarkerKind = 'holiday' | 'weekend' | 'none'
  const dayMarkers: { x: number; kind: DayMarkerKind; date: Date }[] = []
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(tlStartMs + i * 86400000)
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    const dateStr = `${yyyy}-${mm}-${dd}`
    let kind: DayMarkerKind = 'none'
    if (defaultHolidayProvider.isHoliday(dateStr)) {
      kind = 'holiday'
    } else if (d.getDay() === 0 || d.getDay() === 6) {
      // 周末但被调休成上班日 → 不算 weekend
      if (!defaultHolidayProvider.isWorkday(dateStr)) kind = 'weekend'
    }
    dayMarkers.push({ x: LABEL_W + i * DAY_W, kind, date: d })
  }

  if (tasks.length === 0) {
    return (
      <div
        style={{
          padding: '40px 20px',
          textAlign: 'center',
          color: 'var(--color-text-tertiary)',
          fontSize: '12px',
        }}
      >
        暂无任务
      </div>
    )
  }

  let rowY = HEADER_H + 8
  return (
    <svg width={totalW} height={totalH} style={{ display: 'block' }}>
      {/* 时间轴背景 */}
      <rect x={LABEL_W} y={0} width={chartW} height={totalH} fill="var(--color-surface)" />

      {/* 节假日 / 周末背景列 */}
      {dayMarkers.map((m, i) => {
        if (m.kind === 'none') return null
        const fill =
          m.kind === 'holiday'
            ? 'rgba(255, 77, 79, 0.10)'
            : 'rgba(255, 251, 230, 0.6)'
        return (
          <rect
            key={`day-${i}`}
            x={m.x}
            y={HEADER_H}
            width={DAY_W}
            height={totalH - HEADER_H}
            fill={fill}
          />
        )
      })}

      {/* 周分割线 + 周标签（第N周 · 日期范围 · 年月）+ 一二三四五六日 */}
      {weeks.map((w, i) => {
        const x = LABEL_W + Math.round((w.startMs - tlStartMs) / 86400000) * DAY_W
        const isDisplay = i + 1 === displayWeek
        // 周日期范围（周一~周日）
        const weekEndDate = new Date(w.date)
        weekEndDate.setDate(weekEndDate.getDate() + 6)
        const rangeLabel = `${dateShort(w.date)} ~ ${dateShort(weekEndDate)}`
        const monthLabel = dateYMDist(w.date)
        return (
          <g key={`w-${i}`}>
            <line
              x1={x}
              y1={HEADER_H}
              x2={x}
              y2={totalH}
              stroke={isDisplay ? 'var(--color-accent)' : 'var(--color-border-thin)'}
              strokeWidth={isDisplay ? 1.5 : 1}
            />
            {/* 顶部周标签 */}
            <text
              x={x + 4}
              y={HEADER_H - 38}
              fontSize={10}
              fill={isDisplay ? 'var(--color-accent)' : 'var(--color-text-tertiary)'}
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              第 {i + 1} 周 · {rangeLabel}
            </text>
            <text
              x={x + 4}
              y={HEADER_H - 24}
              fontSize={10}
              fill={isDisplay ? 'var(--color-accent)' : 'var(--color-text-tertiary)'}
            >
              {monthLabel}
            </text>
            {/* 一二三四五六日 */}
            {Array.from({ length: 7 }).map((_, di) => {
              const d = new Date(w.date)
              d.setDate(d.getDate() + di)
              const cx = x + di * DAY_W + DAY_W / 2
              return (
                <text
                  key={`wd-${i}-${di}`}
                  x={cx}
                  y={HEADER_H - 8}
                  fontSize={9.5}
                  textAnchor="middle"
                  fill={
                    d.getDay() === 0 || d.getDay() === 6
                      ? 'var(--color-status-warning)'
                      : 'var(--color-text-tertiary)'
                  }
                  style={{ fontFamily: 'var(--font-sans)' }}
                >
                  {weekdayCN(d)}
                </text>
              )
            })}
          </g>
        )
      })}

      {/* 头部底色 */}
      <rect x={0} y={0} width={totalW} height={HEADER_H} fill="var(--color-bg-subtle)" />

      {/* 今天竖线（浅粉）*/}
      {todayMs >= tlStartMs && (
        <line
          x1={dateToX(today)}
          y1={HEADER_H - 8}
          x2={dateToX(today)}
          y2={totalH}
          stroke="rgba(217, 45, 32, 0.5)"
          strokeWidth={2}
          strokeDasharray="4 4"
        />
      )}

      {/* 左侧标签区域背景（贯穿）*/}
      <rect x={0} y={HEADER_H} width={LABEL_W} height={totalH - HEADER_H} fill="var(--color-surface)" />
      <line
        x1={LABEL_W}
        y1={0}
        x2={LABEL_W}
        y2={totalH}
        stroke="var(--color-border-thin)"
        strokeWidth={1}
      />

      {/* 任务行 */}
      {sortedParents.map((parent, pi) => {
        const children = childMap.get(parent.id) ?? []
        const parentY = rowY
        rowY += ROW_H_PARENT + 4

        // 父任务 bar 范围 = 子任务 D~E · 无子任务 → 自身 D~E
        let pStart = parent.start_date
        let pEnd = parent.end_date
        if (children.length > 0) {
          const starts = children.map((c) => c.start_date).filter((s): s is string => s !== null)
          const ends = children.map((c) => c.end_date).filter((e): e is string => e !== null)
          if (starts.length > 0) pStart = starts.reduce((a, b) => (a < b ? a : b))
          if (ends.length > 0) pEnd = ends.reduce((a, b) => (a > b ? a : b))
        }

        const pX1 = pStart ? dateToX(pStart) : LABEL_W
        const pX2 = pEnd ? dateToX(pEnd) + DAY_W : LABEL_W + 40
        const pW = Math.max(pX2 - pX1, 20)

        const parentIsSelected = selectedId === parent.id
        // 父任务 bar 颜色 = getBarColor（按加权阈值判定）
        const parentColor = getBarColor(parent, threshold)

        return (
          <g key={`p-${parent.id}`}>
            {/* 左侧标签 */}
            <rect
              x={0}
              y={parentY}
              width={LABEL_W}
              height={ROW_H_PARENT}
              fill={parentIsSelected ? 'rgba(53, 124, 221, 0.08)' : 'transparent'}
            />
            <text
              x={8}
              y={parentY + 12}
              fontSize={10}
              fill="var(--color-text-tertiary)"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {pi + 1}.
            </text>
            <text
              x={28}
              y={parentY + 12}
              fontSize={11.5}
              fontWeight={600}
              fill="var(--color-text)"
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              {parent.task_name.length > 16
                ? `${parent.task_name.slice(0, 15)}…`
                : parent.task_name}
            </text>
            <text
              x={28}
              y={parentY + 25}
              fontSize={10}
              fill="var(--color-text-tertiary)"
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              {parent.owner ?? '—'}
            </text>

            {/* 父任务 bar */}
            <rect
              x={pX1}
              y={parentY + 6}
              width={pW}
              height={ROW_H_PARENT - 12}
              rx={4}
              fill={parentColor}
              opacity={0.35}
              stroke={parentIsSelected ? 'var(--color-accent)' : 'transparent'}
              strokeWidth={parentIsSelected ? 2 : 0}
              onClick={() => onSelect(parent.id)}
              style={{ cursor: 'pointer' }}
            />
            {/* 父任务进度填充 */}
            {(() => {
              const pct = Math.max(0, Math.min(100, parent.progress))
              if (pct <= 0) return null
              return (
                <rect
                  x={pX1}
                  y={parentY + 6}
                  width={(pW * pct) / 100}
                  height={ROW_H_PARENT - 12}
                  rx={4}
                  fill={parentColor}
                  opacity={0.85}
                  pointerEvents="none"
                />
              )
            })()}
            {/* 进度文字 */}
            {(() => {
              const pct = Math.max(0, Math.min(100, parent.progress))
              if (pct <= 0) return null
              return (
                <text
                  x={pX1 + 4}
                  y={parentY + 18}
                  fontSize={9.5}
                  fill="#fff"
                  style={{ fontFamily: 'var(--font-mono)' }}
                  pointerEvents="none"
                >
                  {Math.round(pct)}%
                </text>
              )
            })()}

            {/* 子任务 bars */}
            {children.map((child) => {
              const childY = rowY
              rowY += ROW_H_CHILD + 2
              if (!child.start_date || !child.end_date) {
                return (
                  <g key={`c-${child.id}`}>
                    <text
                      x={LABEL_W + 8}
                      y={childY + 13}
                      fontSize={10}
                      fill="var(--color-text-tertiary)"
                    >
                      └─{' '}
                      {child.task_name.length > 14
                        ? `${child.task_name.slice(0, 13)}…`
                        : child.task_name}
                      {!child.start_date || !child.end_date ? '（无日期）' : ''}
                    </text>
                  </g>
                )
              }
              const cX1 = dateToX(child.start_date)
              const cX2 = dateToX(child.end_date) + DAY_W
              const cW = Math.max(cX2 - cX1, 6)
              const cY = childY + 4
              const cH = ROW_H_CHILD - 8
              const childIsSelected = selectedId === child.id
              const fillColor = getBarColor(child, threshold)

              return (
                <g key={`c-${child.id}`}>
                  <rect
                    x={0}
                    y={childY}
                    width={LABEL_W}
                    height={ROW_H_CHILD}
                    fill={childIsSelected ? 'rgba(53, 124, 221, 0.06)' : 'transparent'}
                  />
                  <text
                    x={28}
                    y={childY + 14}
                    fontSize={10.5}
                    fill="var(--color-text-secondary)"
                  >
                    └─{' '}
                    {child.task_name.length > 14
                      ? `${child.task_name.slice(0, 13)}…`
                      : child.task_name}
                  </text>
                  <rect
                    x={cX1}
                    y={cY}
                    width={cW}
                    height={cH}
                    rx={3}
                    fill={fillColor}
                    stroke={childIsSelected ? 'var(--color-text)' : 'transparent'}
                    strokeWidth={childIsSelected ? 1.5 : 0}
                    onClick={() => onSelect(child.id)}
                    style={{ cursor: 'pointer' }}
                  />
                  {/* 进度填充（白色遮罩）*/}
                  {child.progress > 0 && child.progress < 100 && (
                    <rect
                      x={cX1}
                      y={cY}
                      width={(cW * child.progress) / 100}
                      height={cH}
                      rx={3}
                      fill="rgba(255,255,255,0.35)"
                      pointerEvents="none"
                    />
                  )}
                  {/* 完成度% */}
                  {child.progress > 0 && (
                    <text
                      x={cX1 + 4}
                      y={cY + 9}
                      fontSize={9}
                      fill="#fff"
                      style={{ fontFamily: 'var(--font-mono)' }}
                      pointerEvents="none"
                    >
                      {Math.round(child.progress)}%
                    </text>
                  )}
                </g>
              )
            })}
          </g>
        )
      })}

      {/* 头部标签列底线 */}
      <line
        x1={0}
        y1={HEADER_H}
        x2={totalW}
        y2={HEADER_H}
        stroke="var(--color-border-thin)"
        strokeWidth={1}
      />
    </svg>
  )
}

/** 甘特图例 */
function GanttLegend() {
  const items: { color: string; label: string }[] = [
    { color: COLOR_COMPLETED, label: '已完成 100%' },
    { color: COLOR_IN_PROGRESS, label: '进行中 1-99%' },
    { color: COLOR_DELAYED, label: '已延期' },
    { color: COLOR_PENDING, label: '待开始' },
    { color: 'rgba(255, 77, 79, 0.30)', label: '法定节假日' },
    { color: 'rgba(255, 200, 50, 0.4)', label: '周末' },
  ]
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 12px',
        borderTop: '1px solid var(--color-border-thin)',
        background: 'var(--color-bg-subtle)',
        fontSize: '10.5px',
        color: 'var(--color-text-tertiary)',
      }}
    >
      {items.map((it) => (
        <span
          key={it.label}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
          <span
            style={{
              width: 10,
              height: 10,
              background: it.color,
              borderRadius: 2,
            }}
          />
          {it.label}
        </span>
      ))}
    </div>
  )
}

/** 右侧详情面板 */
function GanttDetailPanel({
  tasks,
  selectedId,
  onSelect,
}: {
  tasks: ProjectTask[]
  selectedId: number | null
  onSelect: (id: number | null) => void
}) {
  if (selectedId === null) {
    return (
      <div
        data-testid="gantt-detail-empty"
        style={{
          padding: '20px 14px',
          border: '1px solid var(--color-border-thin)',
          borderRadius: 'var(--radius)',
          background: 'var(--color-bg-subtle)',
          fontSize: '12px',
          color: 'var(--color-text-tertiary)',
          textAlign: 'center',
        }}
      >
        点击左侧甘特图的任务条
        <br />
        查看详情
      </div>
    )
  }
  const t = tasks.find((x) => x.id === selectedId)
  if (!t) {
    return (
      <div style={panelStyle}>
        <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }}>
          任务不存在或已删除
        </div>
        <button onClick={() => onSelect(null)} style={miniBtnStyle}>
          清除选择
        </button>
      </div>
    )
  }
  const isChild = t.parent_id !== null
  return (
    <div data-testid="gantt-detail-panel" style={panelStyle}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 6,
          fontSize: '11px',
          color: 'var(--color-text-tertiary)',
        }}
      >
        {isChild ? '子任务' : '父任务'}
        <span style={{ flex: 1 }} />
        <button
          onClick={() => onSelect(null)}
          data-testid="gantt-detail-close"
          style={miniBtnStyle}
        >
          <X size={11} strokeWidth={1.75} />
        </button>
      </div>
      <div
        style={{
          fontSize: '13px',
          fontWeight: 600,
          color: 'var(--color-text)',
          marginBottom: 10,
          wordBreak: 'break-word',
        }}
      >
        {t.task_name}
      </div>
      <DetailRow label="跟进人" value={t.owner ?? '—'} />
      <DetailRow
        label="状态"
        value={STATUS_OPTIONS.find((s) => s.value === t.status)?.label ?? t.status}
      />
      <DetailRow label="计划启动日期" value={t.start_date ?? '—'} mono />
      <DetailRow label="计划完成日期" value={t.end_date ?? '—'} mono />
      <DetailRow label="自然日工时" value={String(t.natural_days)} mono />
      <DetailRow label="工作日工时" value={String(t.work_days)} mono />
      <DetailRow label="当前完成度" value={`${Math.round(t.progress)}%`} mono />
      {t.remark && <DetailRow label="说明" value={t.remark} multiline />}
    </div>
  )
}

// ============================================================
// 子模块 2 · 总体情况和完成情况
// 维护者 2026-08-26 spec · 任务表按 Excel 列顺序 · 父/子 D/E/F/G/H/I 实时计算
// ============================================================

interface OverallModuleProps {
  data: ProjectDetailData
  computed: DetailComputed
  flatTasks: ProjectTask[]
  expandedRows: Set<number>
  onToggleExpand: (id: number) => void
  showCreateForm: boolean
  editingTaskId: number | null
  form: TaskFormData
  onFormChange: (f: TaskFormData) => void
  onStartCreate: () => void
  onStartEdit: (t: ProjectTask) => void
  onCancelForm: () => void
  onSaveTask: () => void
  onDeleteTask: (t: ProjectTask) => void
  busy: boolean
  holidaySet: Set<string>
  startDate: string
  threshold: string
}

function OverallModule(props: OverallModuleProps) {
  const {
    data,
    flatTasks,
    expandedRows,
    onToggleExpand,
    showCreateForm,
    editingTaskId,
    form,
    onFormChange,
    onStartCreate,
    onStartEdit,
    onCancelForm,
    onSaveTask,
    onDeleteTask,
    busy,
    holidaySet,
    startDate,
    threshold,
  } = props

  const stats = data.taskStats

  // 父子映射（用 useMemo 缓存）
  const childrenMap = useMemo(() => {
    const map = new Map<number, ProjectTask[]>()
    for (const t of data.tasks) {
      if (t.parent_id !== null) {
        const arr = map.get(t.parent_id) ?? []
        arr.push(t)
        map.set(t.parent_id, arr)
      }
    }
    return map
  }, [data.tasks])

  // 父任务行：含 D/E/F/G/H/I（按 Excel 公式实时算 · 不写库）
  // 这里渲染序列 = flatTasks（父→子）
  // 父任务渲染时包含 computed D/E/F/G/H/I
  // 子任务渲染时包含 computed E/H

  // 启动日期变更会触发 holidaySet 之外的其它 props 重算
  // 注意：父任务 D = MIN(子 D) + 不依赖 startDate（只 E-D+1 依赖 · 但 E 来自子）
  // 父任务 F 用 startDate 也仅用于 H=NETWORKDAYS(D,E) 但 D/E 来自子任务 · startDate 不直接进
  // 实际上 Excel 的「启动日期」是项目的 · 子任务 D/E 不依赖 · 所以这里 startDate 仅用于标题展示
  void startDate

  // 任务是否延期（按 threshold 判定）
  const isDelayed = (t: ProjectTask): boolean =>
    !!t.end_date && t.end_date < threshold && t.status !== 'COMPLETED'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 项目概况 */}
      <Section title="项目概况" icon={Calendar}>
        {data.project.background && (
          <TextBlock label="项目背景" text={data.project.background} />
        )}
        {data.project.objective && (
          <TextBlock label="项目目标" text={data.project.objective} />
        )}
        {data.project.scope && (
          <TextBlock label="项目范围" text={data.project.scope} />
        )}
        {data.project.description && (
          <TextBlock label="补充说明" text={data.project.description} />
        )}
        {!data.project.background &&
          !data.project.objective &&
          !data.project.scope &&
          !data.project.description && <Empty text="尚未填写项目概况" />}
      </Section>

      {/* 4 指标卡 */}
      <Section title="整体进度" icon={TrendingUp}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 12,
          }}
        >
          <MetricCard
            testid="metric-progress"
            label="整体进度"
            value={`${data.progress}%`}
            sub={`加权平均 · ${stats.total} 任务`}
            color="var(--color-accent)"
            icon={Activity}
          />
          <MetricCard
            testid="metric-parents"
            label="父任务数量"
            value={String(
              data.tasks.filter((t) => t.parent_id === null).length,
            )}
            sub={`含 ${stats.pending} 待开始 / ${stats.inProgress} 进行中`}
            color="var(--color-text)"
            icon={ListTodo}
          />
          <MetricCard
            testid="metric-subtasks"
            label="子任务状态"
            value={`${stats.completed}/${stats.total}`}
            sub={`已完成 / 总数 · 延期 ${stats.overdue}`}
            color="var(--color-status-success, #1f9f47)"
            icon={Timer}
          />
          <MetricCard
            testid="metric-cycle"
            label="项目周期"
            value={String(holidaySet.size > 0 ? Math.round(holidaySet.size / 365 * 7) : 0)}
            sub={`延期阈值 ${threshold}`}
            color="var(--color-text-secondary)"
            icon={Calendar}
          />
        </div>
      </Section>

      {/* 任务列表 · 按 Excel 列顺序 */}
      <Section
        title={`任务列表（${flatTasks.length} · 按 Excel 公式 D/E/F/G/H/I 实时计算）`}
        icon={FileSpreadsheet}
        rightExtra={
          <button
            data-testid="detail-add-task"
            onClick={onStartCreate}
            disabled={busy}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 10px',
              borderRadius: 6,
              border: '1px solid var(--color-accent)',
              background: 'var(--color-accent)',
              color: 'var(--color-text-on-accent)',
              fontSize: '12px',
              fontWeight: 500,
              cursor: busy ? 'not-allowed' : 'pointer',
              opacity: busy ? 0.6 : 1,
            }}
          >
            <Plus size={12} strokeWidth={2} />
            新增任务
          </button>
        }
      >
        {flatTasks.length === 0 && !showCreateForm ? (
          <Empty text="暂无任务 · 点击右上「新增任务」开始" />
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            {/* 表头（Excel 列顺序）*/}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns:
                  '30px minmax(140px, 1.6fr) 90px 100px 100px 60px 60px 70px 1fr 130px',
                gap: 8,
                padding: '6px 10px',
                fontSize: '10.5px',
                color: 'var(--color-text-tertiary)',
                fontWeight: 500,
                borderBottom: '1px solid var(--color-border-thin)',
              }}
            >
              <span>序号</span>
              <span>任务</span>
              <span>跟进人</span>
              <span>D · 启动日期</span>
              <span>E · 完成日期</span>
              <span style={{ textAlign: 'right' }}>F · 自然日</span>
              <span style={{ textAlign: 'right' }}>G · 完成度</span>
              <span style={{ textAlign: 'right' }}>H · 工作日</span>
              <span>I · 任务完成情况说明</span>
              <span style={{ textAlign: 'right' }}>操作</span>
            </div>

            {/* 新增表单（行内 · 顶部）*/}
            {showCreateForm && editingTaskId === null && (
              <TaskFormRow
                mode="create"
                form={form}
                onChange={onFormChange}
                onSave={onSaveTask}
                onCancel={onCancelForm}
                busy={busy}
              />
            )}

            {flatTasks.map((t, idx) => {
              const isChild = t.parent_id !== null
              const isEditing = editingTaskId === t.id
              const isParent = !isChild
              const isExpanded = expandedRows.has(t.id)
              const childRows = childrenMap.get(t.id) ?? []

              if (isEditing) {
                return (
                  <TaskFormRow
                    key={t.id}
                    mode="edit"
                    form={form}
                    onChange={onFormChange}
                    onSave={onSaveTask}
                    onCancel={onCancelForm}
                    busy={busy}
                  />
                )
              }

              // 父任务行：D/E/F/G/H/I 按公式重算
              if (isParent) {
                const D = parentDValue(t, childRows)
                const E = parentEValue(t, childRows)
                const F = parentFValue(t, childRows)
                const G = parentGValue(t, childRows, holidaySet)
                const H = parentHValue(t, childRows, holidaySet)
                const I = parentIValue(t, childRows)
                const delayed = isDelayed(t)

                return (
                  <div
                    key={t.id}
                    style={{ display: 'flex', flexDirection: 'column', gap: 2 }}
                  >
                    <TaskExcelRow
                      testid={`detail-task-row-${t.id}`}
                      seq={idx + 1}
                      task={t}
                      isChild={false}
                      expandable={childRows.length > 0}
                      expanded={isExpanded}
                      onToggleExpand={() => onToggleExpand(t.id)}
                      onEdit={() => onStartEdit(t)}
                      onDelete={() => onDeleteTask(t)}
                      busy={busy}
                      D={D}
                      E={E}
                      F={F}
                      G={G}
                      H={H}
                      I={I}
                      delayed={delayed}
                    />
                    {/* 子任务展开 */}
                    {isParent && isExpanded && childRows.length > 0 && (
                      <div
                        data-testid={`expanded-children-${t.id}`}
                        style={{
                          marginLeft: 24,
                          padding: '4px 8px',
                          borderLeft: '2px solid var(--color-border-thin)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 2,
                        }}
                      >
                        {childRows.map((c) => {
                          const cD = c.start_date ?? ''
                          const cE = childEValue(c)
                          const cF = c.natural_days
                          const cG = c.progress
                          const cH = childHValue(c, holidaySet)
                          const cI = c.remark ?? ''
                          const cDelayed = isDelayed(c)
                          return (
                            <TaskExcelRow
                              key={c.id}
                              testid={`detail-task-row-${c.id}`}
                              seq={idx + 1}
                              task={c}
                              isChild
                              expandable={false}
                              expanded={false}
                              onToggleExpand={() => {}}
                              onEdit={() => onStartEdit(c)}
                              onDelete={() => onDeleteTask(c)}
                              busy={busy}
                              D={cD}
                              E={cE}
                              F={cF}
                              G={cG}
                              H={cH}
                              I={cI}
                              delayed={cDelayed}
                            />
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              }

              // 顶层显示子任务（无父任务）· 也按公式算
              const cD = t.start_date ?? ''
              const cE = childEValue(t)
              const cF = t.natural_days
              const cG = t.progress
              const cH = childHValue(t, holidaySet)
              const cI = t.remark ?? ''
              const cDelayed = isDelayed(t)
              return (
                <TaskExcelRow
                  key={t.id}
                  testid={`detail-task-row-${t.id}`}
                  seq={idx + 1}
                  task={t}
                  isChild
                  expandable={false}
                  expanded={false}
                  onToggleExpand={() => {}}
                  onEdit={() => onStartEdit(t)}
                  onDelete={() => onDeleteTask(t)}
                  busy={busy}
                  D={cD}
                  E={cE}
                  F={cF}
                  G={cG}
                  H={cH}
                  I={cI}
                  delayed={cDelayed}
                />
              )
            })}
          </div>
        )}
      </Section>
    </div>
  )
}

// ============================================================
// 子模块 3 · 人工工作量
// 维护者 2026-08-26 spec · 人员 / 任务数 / 自然日 / 工作日 / 完成度 / 参与程度★
// ============================================================

function WorkloadModule({ computed }: { computed: DetailComputed }) {
  const owners = computed.ownerStats
  if (owners.length === 0) {
    return (
      <Section title="人工工作量（按人员）" icon={Users}>
        <Empty text="暂无人员任务" />
      </Section>
    )
  }
  const totalWorkDays = owners.reduce((s, o) => s + o.workDays, 0)
  const totalNaturalDays = owners.reduce((s, o) => s + o.naturalDays, 0)
  const totalTaskCount = owners.reduce((s, o) => s + o.taskCount, 0)
  const avgProgress =
    owners.length > 0
      ? Math.round(
          owners.reduce((s, o) => s + o.weightedProgress, 0) / owners.length,
        )
      : 0

  return (
    <Section title="人工工作量（按人员）" icon={Users}>
      <table
        data-testid="workload-table"
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '12.5px',
        }}
      >
        <thead>
          <tr
            style={{
              textAlign: 'left',
              color: 'var(--color-text-tertiary)',
              fontSize: '11px',
              fontWeight: 500,
              borderBottom: '1px solid var(--color-border-thin)',
            }}
          >
            <th style={th}>人员</th>
            <th style={{ ...th, textAlign: 'right' }}>任务数</th>
            <th style={{ ...th, textAlign: 'right' }}>自然日工时</th>
            <th style={{ ...th, textAlign: 'right' }}>工作日工时（人天）</th>
            <th style={{ ...th, textAlign: 'right' }}>完成度（加权平均）</th>
            <th style={{ ...th, textAlign: 'left' }}>参与程度</th>
          </tr>
        </thead>
        <tbody>
          {owners.map((o) => {
            // 参与程度★：基于工作日占总工时比例
            const pct = totalWorkDays > 0 ? (o.workDays / totalWorkDays) * 100 : 0
            const stars = percentToStars(pct)
            return (
              <tr
                key={o.owner}
                data-testid={`workload-row-${o.owner}`}
                style={{ borderBottom: '1px solid var(--color-border-thin)' }}
              >
                <td style={td}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <User size={12} strokeWidth={1.5} color="var(--color-text-tertiary)" />
                    {o.owner}
                  </span>
                </td>
                <td style={{ ...td, textAlign: 'right', color: 'var(--color-text-tertiary)' }}>
                  {o.taskCount}
                </td>
                <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                  {o.naturalDays}
                </td>
                <td
                  style={{
                    ...td,
                    textAlign: 'right',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 600,
                    color: 'var(--color-accent)',
                  }}
                >
                  {o.workDays}
                </td>
                <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                  {Math.round(o.weightedProgress)}%
                </td>
                <td style={td}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <StarRow stars={stars} />
                    <span
                      style={{
                        fontSize: '10.5px',
                        color: 'var(--color-text-tertiary)',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {pct.toFixed(1)}%
                    </span>
                  </div>
                </td>
              </tr>
            )
          })}
          {/* 合计行 */}
          <tr
            style={{
              borderTop: '2px solid var(--color-border-thin)',
              fontWeight: 600,
              background: 'var(--color-bg-subtle)',
            }}
          >
            <td style={{ ...td, color: 'var(--color-text)' }}>合计</td>
            <td
              style={{
                ...td,
                textAlign: 'right',
                color: 'var(--color-text)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {totalTaskCount}
            </td>
            <td
              style={{
                ...td,
                textAlign: 'right',
                fontFamily: 'var(--font-mono)',
                color: 'var(--color-text)',
              }}
            >
              {totalNaturalDays}
            </td>
            <td
              style={{
                ...td,
                textAlign: 'right',
                fontFamily: 'var(--font-mono)',
                color: 'var(--color-text)',
              }}
            >
              {totalWorkDays}
            </td>
            <td
              style={{
                ...td,
                textAlign: 'right',
                fontFamily: 'var(--font-mono)',
                color: 'var(--color-text)',
              }}
            >
              {avgProgress}%
            </td>
            <td style={td}></td>
          </tr>
        </tbody>
      </table>

      {/* 比例条 · 横向叠加 */}
      <div
        style={{
          marginTop: 14,
          padding: '10px 12px',
          background: 'var(--color-bg-subtle)',
          borderRadius: 'var(--radius)',
        }}
      >
        <div
          style={{
            fontSize: '11px',
            color: 'var(--color-text-tertiary)',
            marginBottom: 6,
          }}
        >
          工作日工时占比分布
        </div>
        <div
          style={{
            display: 'flex',
            width: '100%',
            height: 10,
            borderRadius: 5,
            overflow: 'hidden',
            background: 'var(--color-border-thin)',
          }}
        >
          {owners.map((o, i) => {
            const w = totalWorkDays > 0 ? (o.workDays / totalWorkDays) * 100 : 0
            if (w <= 0) return null
            return (
              <div
                key={o.owner}
                title={`${o.owner} · ${o.workDays} (${w.toFixed(1)}%)`}
                style={{
                  width: `${w}%`,
                  background: WORKLOAD_COLORS[i % WORKLOAD_COLORS.length],
                }}
              />
            )
          })}
        </div>
        <div
          style={{
            marginTop: 6,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          {owners.map((o, i) => (
            <span
              key={o.owner}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: '10.5px',
                color: 'var(--color-text-tertiary)',
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  background: WORKLOAD_COLORS[i % WORKLOAD_COLORS.length],
                  borderRadius: 2,
                }}
              />
              {o.owner} · {o.workDays}
            </span>
          ))}
        </div>
      </div>
    </Section>
  )
}

/** ★/★★/★★★/★★★★/★★★★★ 参与程度（30+ / 20+ / 12+ / 5+ / >0）*/
function percentToStars(pct: number): number {
  if (pct >= 30) return 5
  if (pct >= 20) return 4
  if (pct >= 12) return 3
  if (pct >= 5) return 2
  if (pct > 0) return 1
  return 0
}

function StarRow({ stars }: { stars: number }) {
  return (
    <span style={{ display: 'inline-flex', gap: 1 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={11}
          strokeWidth={1.5}
          fill={i <= stars ? 'var(--color-status-warning, #f59e0b)' : 'transparent'}
          color={i <= stars ? 'var(--color-status-warning, #f59e0b)' : 'var(--color-text-tertiary)'}
        />
      ))}
    </span>
  )
}

const WORKLOAD_COLORS = [
  '#357cdd',
  '#1f9f47',
  '#f59e0b',
  '#9333ea',
  '#0891b2',
  '#dc2626',
  '#65a30d',
  '#db2777',
]

// ============================================================
// 子组件：基础 UI 块
// ============================================================

function Section({
  title,
  icon: Icon,
  accent,
  rightExtra,
  children,
}: {
  title: string
  icon: React.ComponentType<{
    size?: number
    strokeWidth?: number
    color?: string
  }>
  accent?: string
  rightExtra?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 10,
          color: accent ?? 'var(--color-text)',
          fontSize: '12.5px',
          fontWeight: 600,
        }}
      >
        <Icon
          size={13}
          strokeWidth={1.75}
          color={accent ?? 'var(--color-accent)'}
        />
        <span>{title}</span>
        <span style={{ flex: 1 }} />
        {rightExtra}
      </div>
      {children}
    </div>
  )
}

/** 只读字段 */
function ControlField({
  label,
  value,
  mono,
  accent,
}: {
  label: string
  value: string
  mono?: boolean
  accent?: string
}) {
  return (
    <div>
      <div
        style={{
          fontSize: '10.5px',
          color: 'var(--color-text-tertiary)',
          marginBottom: 3,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: '12.5px',
          color: accent ?? 'var(--color-text)',
          fontWeight: 500,
          fontFamily: mono ? 'var(--font-mono)' : 'inherit',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </div>
    </div>
  )
}

/** 可编辑字段 · input[type=text|date|number] */
function ControlFieldInput({
  testid,
  label,
  type,
  value,
  onChange,
  placeholder,
  mono,
  min,
  max,
}: {
  testid: string
  label: string
  type: 'text' | 'date' | 'number'
  value: string
  onChange: (v: string) => void
  placeholder?: string
  mono?: boolean
  min?: number
  max?: number
}) {
  return (
    <div>
      <div
        style={{
          fontSize: '10.5px',
          color: 'var(--color-text-tertiary)',
          marginBottom: 3,
        }}
      >
        {label}
      </div>
      <input
        data-testid={testid}
        type={type}
        value={value}
        placeholder={placeholder}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%',
          padding: '4px 8px',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border-thin)',
          borderRadius: 'var(--radius)',
          fontSize: '12.5px',
          color: 'var(--color-text)',
          outline: 'none',
          fontFamily: mono ? 'var(--font-mono)' : 'inherit',
        }}
      />
    </div>
  )
}

/** 可编辑字段 · select */
function ControlFieldSelect<T extends string>({
  testid,
  label,
  value,
  onChange,
  options,
}: {
  testid: string
  label: string
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <div>
      <div
        style={{
          fontSize: '10.5px',
          color: 'var(--color-text-tertiary)',
          marginBottom: 3,
        }}
      >
        {label}
      </div>
      <select
        data-testid={testid}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        style={{
          width: '100%',
          padding: '4px 8px',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border-thin)',
          borderRadius: 'var(--radius)',
          fontSize: '12.5px',
          color: 'var(--color-text)',
          outline: 'none',
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

/** 颜色块（用于色条）*/
function ColorChip({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span
        style={{
          width: 12,
          height: 12,
          background: color,
          borderRadius: 2,
          border: '1px solid rgba(0,0,0,0.06)',
        }}
      />
      {label}
    </span>
  )
}

function MetricCard({
  testid,
  label,
  value,
  sub,
  color,
  icon: Icon,
}: {
  testid: string
  label: string
  value: string
  sub: string
  color: string
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; color?: string }>
}) {
  return (
    <div
      data-testid={testid}
      style={{
        padding: '12px 14px',
        background: 'var(--color-bg-subtle)',
        borderRadius: 'var(--radius)',
        border: '1px solid var(--color-border-thin)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 6,
          background: 'var(--color-surface)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Icon size={16} strokeWidth={1.75} color={color} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: '11px',
            color: 'var(--color-text-tertiary)',
            marginBottom: 2,
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: '18px',
            fontWeight: 600,
            color,
            fontFamily: 'var(--font-mono)',
            lineHeight: 1.2,
          }}
        >
          {value}
        </div>
        <div
          style={{
            fontSize: '10.5px',
            color: 'var(--color-text-tertiary)',
            marginTop: 2,
          }}
        >
          {sub}
        </div>
      </div>
    </div>
  )
}

function TextBlock({ label, text }: { label: string; text: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div
        style={{
          fontSize: '11px',
          color: 'var(--color-text-tertiary)',
          marginBottom: 3,
        }}
      >
        {label}
      </div>
      <p
        style={{
          fontSize: '12.5px',
          color: 'var(--color-text-secondary)',
          margin: 0,
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {text}
      </p>
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return (
    <div
      style={{
        padding: '14px 0',
        textAlign: 'center',
        fontSize: '12px',
        color: 'var(--color-text-tertiary)',
      }}
    >
      {text}
    </div>
  )
}

function DetailRow({
  label,
  value,
  mono,
  multiline,
}: {
  label: string
  value: string
  mono?: boolean
  multiline?: boolean
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '78px 1fr',
        gap: 8,
        padding: '3px 0',
        fontSize: '11.5px',
        alignItems: multiline ? 'flex-start' : 'center',
      }}
    >
      <span style={{ color: 'var(--color-text-tertiary)' }}>{label}</span>
      <span
        style={{
          color: 'var(--color-text)',
          fontFamily: mono ? 'var(--font-mono)' : 'inherit',
          wordBreak: 'break-word',
          whiteSpace: multiline ? 'pre-wrap' : 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
        title={value}
      >
        {value}
      </span>
    </div>
  )
}

function ToolbarButton({
  testid,
  label,
  icon: Icon,
  onClick,
  disabled,
}: {
  testid: string
  label: string
  icon: React.ComponentType<{
    size?: number
    strokeWidth?: number
  }>
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      data-testid={testid}
      onClick={disabled ? undefined : onClick}
      title={label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '4px 10px',
        borderRadius: 6,
        border: '1px solid var(--color-border-thin)',
        background: 'var(--color-bg-subtle)',
        color: 'var(--color-text-secondary)',
        fontSize: '12px',
        fontWeight: 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <Icon size={12} strokeWidth={1.75} />
      {label}
    </button>
  )
}

const iconBtnStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 6,
  border: '1px solid var(--color-border-thin)',
  background: 'transparent',
  color: 'var(--color-text-secondary)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const panelStyle: React.CSSProperties = {
  padding: '12px 14px',
  border: '1px solid var(--color-border-thin)',
  borderRadius: 'var(--radius)',
  background: 'var(--color-surface)',
}

const miniBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--color-border-thin)',
  borderRadius: 4,
  width: 22,
  height: 22,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  color: 'var(--color-text-secondary)',
  padding: 0,
}

// ============================================================
// 子组件：任务展示行（按 Excel 列顺序 · D/E/F/G/H/I）
// ============================================================

interface TaskExcelRowProps {
  testid: string
  seq: number
  task: ProjectTask
  isChild: boolean
  expandable: boolean
  expanded: boolean
  onToggleExpand: () => void
  onEdit: () => void
  onDelete: () => void
  busy: boolean
  // Excel 公式实时计算的字段
  D: string
  E: string | number
  F: string | number
  G: string | number
  H: string | number
  I: string
  delayed: boolean
}

function TaskExcelRow({
  testid,
  seq,
  task,
  isChild,
  expandable,
  expanded,
  onToggleExpand,
  onEdit,
  onDelete,
  busy,
  D,
  E,
  F,
  G,
  H,
  I,
  delayed,
}: TaskExcelRowProps) {
  const statusMeta = STATUS_OPTIONS.find((s) => s.value === task.status)
  return (
    <div
      data-testid={testid}
      style={{
        display: 'grid',
        gridTemplateColumns:
          '30px minmax(140px, 1.6fr) 90px 100px 100px 60px 60px 70px 1fr 130px',
        alignItems: 'center',
        gap: 8,
        padding: '6px 10px',
        border: '1px solid var(--color-border-thin)',
        borderRadius: 'var(--radius)',
        background: delayed
          ? 'rgba(255, 77, 79, 0.04)'
          : isChild
            ? 'var(--color-bg-subtle)'
            : 'var(--color-surface)',
      }}
    >
      {/* 展开箭头 + 序号 */}
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 2,
          fontFamily: 'var(--font-mono)',
          fontSize: '11.5px',
          color: 'var(--color-text-tertiary)',
        }}
      >
        {expandable ? (
          <button
            onClick={onToggleExpand}
            data-testid={`expand-toggle-${task.id}`}
            style={{
              background: 'transparent',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              color: 'var(--color-text-tertiary)',
              display: 'inline-flex',
            }}
          >
            {expanded ? (
              <ChevronDown size={12} strokeWidth={1.75} />
            ) : (
              <ChevronRight size={12} strokeWidth={1.75} />
            )}
          </button>
        ) : (
          <span style={{ width: 12, display: 'inline-block' }} />
        )}
        {seq}
      </span>

      {/* 任务名（含延期徽章）*/}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          minWidth: 0,
        }}
      >
        {isChild && (
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              color: 'var(--color-text-tertiary)',
            }}
          >
            └─
          </span>
        )}
        <span
          style={{
            fontSize: '12.5px',
            color: 'var(--color-text)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontWeight: isChild ? 400 : 500,
          }}
          title={task.task_name}
        >
          {task.task_name}
        </span>
        {delayed && (
          <span
            data-testid={`delayed-badge-${task.id}`}
            title="已延期"
            style={{
              fontSize: '10px',
              padding: '1px 6px',
              borderRadius: 999,
              background: 'rgba(255, 77, 79, 0.12)',
              color: COLOR_DELAYED,
              fontWeight: 500,
              whiteSpace: 'nowrap',
            }}
          >
            延期
          </span>
        )}
      </div>

      {/* 跟进人 */}
      <span
        style={{
          fontSize: '12px',
          color: 'var(--color-text-secondary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={task.owner ?? ''}
      >
        {task.owner ?? '—'}
      </span>

      {/* D · 启动日期 */}
      <span style={cellMono}>{D || '—'}</span>

      {/* E · 完成日期 */}
      <span style={cellMono}>{typeof E === 'number' ? E : E || '—'}</span>

      {/* F · 自然日 */}
      <span style={{ ...cellMono, textAlign: 'right' }}>{F}</span>

      {/* G · 完成度% */}
      <span style={{ ...cellMono, textAlign: 'right' }}>
        {typeof G === 'number' ? `${Math.round(G)}%` : G}
      </span>

      {/* H · 工作日 */}
      <span style={{ ...cellMono, textAlign: 'right' }}>{H}</span>

      {/* I · 任务完成情况说明 */}
      <span
        style={{
          fontSize: '11.5px',
          color: 'var(--color-text-tertiary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={I}
      >
        {I || '—'}
      </span>

      {/* 状态 + 操作 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          justifyContent: 'flex-end',
        }}
      >
        <span
          style={{
            display: 'inline-block',
            padding: '2px 8px',
            fontSize: '11px',
            borderRadius: 999,
            background: statusBg(task.status),
            color: statusFg(task.status),
            textAlign: 'center',
            whiteSpace: 'nowrap',
          }}
        >
          {statusMeta?.label ?? task.status}
        </span>
        <IconBtn
          testid={`detail-edit-${task.id}`}
          icon={Pencil}
          title="编辑"
          onClick={onEdit}
          disabled={busy}
        />
        <IconBtn
          testid={`detail-delete-${task.id}`}
          icon={Trash2}
          title="删除"
          onClick={onDelete}
          disabled={busy}
          danger
        />
      </div>
    </div>
  )
}

const cellMono: React.CSSProperties = {
  fontSize: '12px',
  color: 'var(--color-text-secondary)',
  fontFamily: 'var(--font-mono)',
  whiteSpace: 'nowrap',
}

function IconBtn({
  testid,
  icon: Icon,
  title,
  onClick,
  disabled,
  danger,
}: {
  testid: string
  icon: React.ComponentType<{
    size?: number
    strokeWidth?: number
  }>
  title: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      data-testid={testid}
      onClick={disabled ? undefined : onClick}
      title={title}
      style={{
        width: 22,
        height: 22,
        borderRadius: 4,
        border: '1px solid var(--color-border-thin)',
        background: 'transparent',
        color: danger
          ? 'var(--color-status-danger)'
          : 'var(--color-text-secondary)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Icon size={11} strokeWidth={1.75} />
    </button>
  )
}

// ============================================================
// 子组件：行内任务表单（新增 / 编辑）
// 字段顺序按 Excel：任务 / 跟进人 / 计划启动日期 / 计划完成日期 /
// 自然日工时 / 当前完成度% / 工作日工时 / 任务完成情况说明 / status
// ============================================================

function TaskFormRow({
  mode,
  form,
  onChange,
  onSave,
  onCancel,
  busy,
}: {
  mode: 'create' | 'edit'
  form: TaskFormData
  onChange: (next: TaskFormData) => void
  onSave: () => void
  onCancel: () => void
  busy: boolean
}) {
  const isCreate = mode === 'create'

  const handleDateChange = (field: 'start_date' | 'end_date', value: string) => {
    const next: TaskFormData = { ...form, [field]: value }
    const cur = parseFormNumber(form.work_days, -1)
    if (next.start_date && next.end_date && (cur === 0 || cur === -1)) {
      next.work_days = String(networkdays(next.start_date, next.end_date))
    }
    onChange(next)
  }

  return (
    <div
      data-testid={isCreate ? 'detail-create-form' : 'detail-edit-form'}
      style={{
        padding: '10px 12px',
        border: '1px solid var(--color-accent)',
        borderRadius: 'var(--radius)',
        background: 'var(--color-bg-subtle)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div
        style={{
          fontSize: '11.5px',
          color: 'var(--color-accent)',
          fontWeight: 600,
        }}
      >
        {isCreate ? '新增任务' : '编辑任务'}
      </div>
      <input
        data-testid={isCreate ? 'create-task-name' : 'edit-task-name'}
        type="text"
        placeholder="任务名称 *"
        value={form.task_name}
        onChange={(e) => onChange({ ...form, task_name: e.target.value })}
        style={inputStyle}
      />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <input
          data-testid={isCreate ? 'create-task-owner' : 'edit-task-owner'}
          type="text"
          placeholder="跟进人"
          value={form.owner}
          onChange={(e) => onChange({ ...form, owner: e.target.value })}
          style={inputStyle}
        />
        <select
          data-testid={isCreate ? 'create-task-status' : 'edit-task-status'}
          value={form.status}
          onChange={(e) =>
            onChange({ ...form, status: e.target.value as TaskStatus })
          }
          style={inputStyle}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 8,
        }}
      >
        <input
          data-testid={isCreate ? 'create-task-start' : 'edit-task-start'}
          type="date"
          placeholder="计划启动日期"
          value={form.start_date}
          onChange={(e) => handleDateChange('start_date', e.target.value)}
          style={inputStyle}
        />
        <input
          data-testid={isCreate ? 'create-task-end' : 'edit-task-end'}
          type="date"
          placeholder="计划完成日期"
          value={form.end_date}
          onChange={(e) => handleDateChange('end_date', e.target.value)}
          style={inputStyle}
        />
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 8,
        }}
      >
        <input
          data-testid={isCreate ? 'create-task-natural-days' : 'edit-task-natural-days'}
          type="number"
          min="0"
          step="0.5"
          placeholder="自然日工时"
          title="自然日工时（Excel 列 F）"
          value={form.natural_days}
          onChange={(e) => onChange({ ...form, natural_days: e.target.value })}
          style={inputStyle}
        />
        <input
          data-testid={isCreate ? 'create-task-progress' : 'edit-task-progress'}
          type="number"
          min="0"
          max="100"
          step="1"
          placeholder="进度 %"
          title="当前完成度 %（Excel 列 G）"
          value={form.progress}
          onChange={(e) => onChange({ ...form, progress: e.target.value })}
          style={inputStyle}
        />
        <input
          data-testid={isCreate ? 'create-task-work-days' : 'edit-task-work-days'}
          type="number"
          min="0"
          step="0.5"
          placeholder="工作日工时"
          title="工作日工时（默认 = NETWORKDAYS(起,止)）"
          value={form.work_days}
          onChange={(e) => onChange({ ...form, work_days: e.target.value })}
          style={inputStyle}
        />
      </div>
      <textarea
        data-testid={isCreate ? 'create-task-remark' : 'edit-task-remark'}
        placeholder="任务完成情况说明（Excel 列 I）"
        value={form.remark}
        onChange={(e) => onChange({ ...form, remark: e.target.value })}
        rows={2}
        style={{
          ...inputStyle,
          resize: 'vertical',
          fontFamily: 'inherit',
        }}
      />
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          data-testid={isCreate ? 'create-task-cancel' : 'edit-task-cancel'}
          onClick={onCancel}
          disabled={busy}
          style={{
            padding: '5px 14px',
            background: 'transparent',
            color: 'var(--color-text-secondary)',
            border: '1px solid var(--color-border-thin)',
            borderRadius: 'var(--radius)',
            fontSize: '12.5px',
            cursor: busy ? 'not-allowed' : 'pointer',
          }}
        >
          取消
        </button>
        <button
          data-testid={isCreate ? 'create-task-save' : 'edit-task-save'}
          onClick={onSave}
          disabled={busy}
          style={{
            padding: '5px 14px',
            background: 'var(--color-accent)',
            color: 'var(--color-text-on-accent)',
            border: 'none',
            borderRadius: 'var(--radius)',
            fontSize: '12.5px',
            fontWeight: 500,
            cursor: busy ? 'not-allowed' : 'pointer',
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? '保存中…' : '保存'}
        </button>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 10px',
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border-thin)',
  borderRadius: 'var(--radius)',
  fontSize: '12.5px',
  color: 'var(--color-text)',
  outline: 'none',
  fontFamily: 'inherit',
}

// ============================================================
// 子组件：通用确认弹窗（删除 / 导入）
// ============================================================

function ConfirmCascadeModal({
  testid,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  busy,
  extra,
}: {
  testid: string
  title: string
  message: React.ReactNode
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  busy: boolean
  extra?: React.ReactNode
}) {
  return (
    <div
      data-testid={testid}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 400,
      }}
      onClick={busy ? undefined : onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '440px',
          background: 'var(--color-surface)',
          borderRadius: 'var(--radius-md)',
          padding: '24px',
          boxShadow: '0 12px 40px rgba(0, 0, 0, 0.2)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            marginBottom: '14px',
          }}
        >
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: 'rgba(217, 45, 32, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <AlertTriangle size={18} strokeWidth={1.75} color="#d92d20" />
          </div>
          <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0 }}>
            {title}
          </h2>
        </div>
        <p
          style={{
            fontSize: '13px',
            color: 'var(--color-text-secondary)',
            lineHeight: 1.6,
            margin: '0 0 14px',
          }}
        >
          {message}
        </p>
        {extra}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            data-testid={`${testid}-cancel`}
            onClick={onCancel}
            disabled={busy}
            style={{
              padding: '6px 14px',
              background: 'transparent',
              color: 'var(--color-text-secondary)',
              border: '1px solid var(--color-border-thin)',
              borderRadius: 'var(--radius)',
              fontSize: '13px',
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            取消
          </button>
          <button
            data-testid={`${testid}-confirm`}
            onClick={onConfirm}
            disabled={busy}
            style={{
              padding: '6px 14px',
              background: 'var(--color-status-danger, #d92d20)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--radius)',
              fontSize: '13px',
              fontWeight: 500,
              cursor: busy ? 'not-allowed' : 'pointer',
              opacity: busy ? 0.6 : 1,
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// 状态徽章色
// ============================================================

function statusBg(s: TaskStatus): string {
  switch (s) {
    case 'PENDING':
      return 'var(--color-bg-subtle)'
    case 'IN_PROGRESS':
      return 'rgba(53, 124, 221, 0.12)'
    case 'COMPLETED':
      return 'rgba(31, 159, 71, 0.12)'
    case 'DELAYED':
      return 'rgba(217, 45, 32, 0.12)'
  }
}

function statusFg(s: TaskStatus): string {
  switch (s) {
    case 'PENDING':
      return 'var(--color-text-tertiary)'
    case 'IN_PROGRESS':
      return 'var(--color-accent)'
    case 'COMPLETED':
      return 'var(--color-status-success, #1f9f47)'
    case 'DELAYED':
      return 'var(--color-status-danger, #d92d20)'
  }
}

// ============================================================
// 表格样式
// ============================================================

const th: React.CSSProperties = {
  padding: '6px 8px',
  fontWeight: 500,
}

const td: React.CSSProperties = {
  padding: '8px',
  fontSize: '12.5px',
}

// ============================================================
// 计算逻辑（pure · 用 useMemo 包）
// ============================================================

interface OwnerStat {
  owner: string
  workDays: number
  naturalDays: number
  taskCount: number
  weightedProgress: number
}

interface DetailComputed {
  parentTasks: ProjectTask[]
  childTasks: ProjectTask[]
  childrenMap: Map<number, ProjectTask[]>
  ownerStats: OwnerStat[]
  totalWorkDays: number
  weekEnd: string
  delayedTasks: ProjectTask[]
  cycleLabel: string
  cycleSub: string
}

function computeDetail(data: ProjectDetailData): DetailComputed {
  const parentTasks: ProjectTask[] = data.tasks.filter((t) => t.parent_id === null)
  const childTasks: ProjectTask[] = data.tasks.filter((t) => t.parent_id !== null)
  const today = todayLocal()
  const weekEnd = getSunday(today)

  // 父子映射
  const childrenMap = new Map<number, ProjectTask[]>()
  for (const t of childTasks) {
    if (t.parent_id === null) continue
    const arr = childrenMap.get(t.parent_id) ?? []
    arr.push(t)
    childrenMap.set(t.parent_id, arr)
  }

  // 按 owner 分组 · 加权平均进度
  const ownerMap = new Map<
    string,
    {
      workDays: number
      naturalDays: number
      taskCount: number
      weightedSum: number
      weightTotal: number
    }
  >()
  for (const t of data.tasks) {
    const owner = t.owner ?? '未指派'
    const prev = ownerMap.get(owner) ?? {
      workDays: 0,
      naturalDays: 0,
      taskCount: 0,
      weightedSum: 0,
      weightTotal: 0,
    }
    prev.workDays += t.work_days
    prev.naturalDays += t.natural_days
    prev.taskCount += 1
    const weight = t.work_days > 0 ? t.work_days : 1
    prev.weightedSum += t.progress * weight
    prev.weightTotal += weight
    ownerMap.set(owner, prev)
  }
  const ownerStats: OwnerStat[] = Array.from(ownerMap.entries())
    .map(([owner, v]) => ({
      owner,
      workDays: v.workDays,
      naturalDays: v.naturalDays,
      taskCount: v.taskCount,
      weightedProgress:
        v.weightTotal > 0 ? v.weightedSum / v.weightTotal : 0,
    }))
    .sort((a, b) => b.workDays - a.workDays)
  const totalWorkDays = ownerStats.reduce((s, o) => s + o.workDays, 0)

  // 延期任务（按 weekEnd 兜底 · threshold 优先使用上层传入）
  const delayedTasks = data.tasks.filter(
    (t) =>
      t.end_date !== null &&
      t.end_date > weekEnd &&
      t.status !== 'COMPLETED',
  )

  // 项目周期
  const start = data.project.start_date
  const end = data.project.end_date
  let cycleLabel = '—'
  let cycleSub = '未设置项目起止日期'
  if (start && end) {
    const days = diffDays(start, end) + 1
    cycleLabel = `${days} 天`
    cycleSub = `${start} ~ ${end}`
  } else if (start) {
    cycleLabel = `${diffDays(start, today)} 天`
    cycleSub = `自 ${start} 起 · 暂无结束日期`
  } else if (end) {
    cycleLabel = `${diffDays(today, end)} 天`
    cycleSub = `截止 ${end} · 暂无启动日期`
  }

  return {
    parentTasks,
    childTasks,
    childrenMap,
    ownerStats,
    totalWorkDays,
    weekEnd,
    delayedTasks,
    cycleLabel,
    cycleSub,
  }
}

/**
 * 把任务列表扁平化为「父→子」的展示序列（按 sort_order 自然排序）
 */
function buildFlatTaskList(tasks: ProjectTask[]): ProjectTask[] {
  const sorted = [...tasks].sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
    return a.id - b.id
  })
  const result: ProjectTask[] = []
  const parents = sorted.filter((t) => t.parent_id === null)
  for (const p of parents) {
    result.push(p)
    const children = sorted.filter((t) => t.parent_id === p.id)
    result.push(...children)
  }
  return result
}