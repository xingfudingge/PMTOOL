/**
 * PMTool V2.0 · 项目详情页（V2 重构）
 * 维护者 2026-08-26 spec
 *
 * 设计依据：
 *   一级 tab（6 个）：计划管理 | 每周工作情况及下周任务 | 知识中心 | 项目文件管理 | 项目成员 | 风险登记册
 *   二级 tab（仅计划管理下 · 2 个）：整体计划 | 甘特图
 *
 * 实现要点：
 *   - Header：项目名 + 状态 + 阶段 + 4 个指标卡 + AI 按钮组 + 编辑项目
 *   - 一级 Tab 切换大区块
 *   - 计划管理 tab 下显示二级 Tab：2 个
 *     · 整体计划：项目概况 + 任务概览（按 Excel 风格：大阶段卡 + 子任务明细）
 *     · 甘特图：复用 GanttTab
 *   - 每周工作情况及下周任务：提到一级 tab · 复用 WeeklyTab
 *   - 风险登记册：从原计划管理二级 tab 升级为一级 tab
 *   - AI 助手 tab 删除
 *
 * 数据：services/projectDetail.ts（聚合 tasks/issues/attachments/logs）
 * 严格：复用 16 张表 · 不新增表 · 不新增 Rust commands
 */

import { Fragment, useEffect, useMemo, useRef, useState, useCallback, Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import {
  AlertOctagon,
  AlertTriangle,
  ArrowLeft,
  ArrowRightLeft,
  BookOpen,
  Calendar,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Download,
  ExternalLink,
  FileText,
  Folder,
  FolderKanban,
  FolderOpen,
  FolderPlus,
  ListTodo,
  Maximize,
  Minimize,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Sparkles,
  StickyNote,
  Trash2,
  Upload,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import {
  loadProjectDetail,
  type ProjectDetailData,
} from '@/services/projectDetail'
import { updateProject } from '@/services/project'
import {
  listProjectIssues,
  createProjectIssue,
  deleteProjectIssue,
  updateProjectIssue,
  type ProjectIssue,
} from '@/services/projectIssues'
import {
  listWeeklyEntries,
  createWeeklyEntry,
  updateWeeklyEntry,
  deleteWeeklyEntry,
  type WeeklyReportEntry,
} from '@/services/weeklyEntries'
import {
  listProjectMembers,
  createProjectMember,
  updateProjectMember,
  deleteProjectMember,
  type ProjectMember,
} from '@/services/projectMembers'
import { parseRisksExcel, exportRisksToExcel } from '@/services/excelRisks'
import { parseWeeklyExcel, exportWeeklyToExcel } from '@/services/excelWeekly'
import { parseMembersExcel, exportMembersToExcel } from '@/services/excelMembers'
import { parseProjectsExcel, exportProjectsToExcel } from '@/services/excelProjects'
import { exportWholeProjectExcel } from '@/services/excelProjectTemplate'
import { exportProjectToFile } from '@/services/projectTemplateExport'
import { listProjectRequirements } from '@/services/projectRequirements'
import { listProjectIssueLog } from '@/services/projectIssueLog'
import { listProjectTodoItems } from '@/services/projectTodoItems'
import { toast } from '@/components/Toast'
import { RegistersSection } from '@/components/RegistersSection'
import { InlineEditableCell } from '@/components/InlineEditableCell'
import { downloadProjectTemplate } from '@/services/excelTemplate'
import { saveBlobToDirectory } from '@/services/excel'
import { formatLocalDate } from '@/services/datetime'
import {
  createProjectTask,
  importProjectTasksBulk,
  deleteProjectTask,
  updateProjectTask,
  type ProjectTask,
} from '@/services/projectTasks'
import { defaultHolidayProvider } from '@/services/holidayProvider'
import { ProjectOverviewEditModal } from '@/components/ProjectOverviewEditModal'
import { FileTree } from '@/components/FileTree'
import { FilePreview } from '@/components/FilePreview'
import { ProjectKnowledgeCenter } from '@/components/KnowledgeSpaceView/ProjectKnowledgeCenter'
import {
  listProjectBindings,
  listAllProjectSpaces,
  createBinding,
  deleteBinding,
  getKnowledgeSpace,
  type KnowledgeSpace,
} from '@/services/knowledgeSpaces'
import {
  listProjectFiles,
  pickProjectDirectory,
  setProjectLocalDirectory,
  openFileExternal,
  createFile,
  createDirectory,
  removePath,
  type FileNode,
} from '@/services/projectFiles'

interface Props {
  projectId: number
  onBack: () => void
}

type PrimaryTab =
  | 'planning'
  | 'weekly'
  | 'knowledge'
  | 'files'
  | 'members'
  | 'registers'
type PlanningTab = 'overview' | 'overall' | 'gantt'

interface PrimaryTabDef {
  key: PrimaryTab
  label: string
  Icon: LucideIcon
}

interface PlanningTabDef {
  key: PlanningTab
  label: string
}

const PRIMARY_TABS: PrimaryTabDef[] = [
  { key: 'planning', label: '计划管理', Icon: ListTodo },
  { key: 'weekly', label: '每周工作情况及下周任务', Icon: CalendarDays },
  { key: 'knowledge', label: '项目知识库', Icon: BookOpen },
  { key: 'files', label: '项目文件管理', Icon: FolderOpen },
  { key: 'members', label: '项目成员', Icon: Users },
  { key: 'registers', label: '登记册', Icon: AlertOctagon },
]

const PLANNING_TABS: PlanningTabDef[] = [
  { key: 'overview', label: '项目概况' },
  { key: 'overall', label: '整体计划' },
  { key: 'gantt', label: '甘特图' },
]

export function ProjectDetailPage({ projectId, onBack }: Props) {
  const [data, setData] = useState<ProjectDetailData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [primary, setPrimary] = useState<PrimaryTab>('planning')
  const [planning, setPlanning] = useState<PlanningTab>('overall')
  const [editOpen, setEditOpen] = useState(false)

  // 维护者 2026-08-26：项目周期自动从任务最早 start_date / 最晚 end_date 读取
  const projectPeriodStart = useMemo(
    () =>
      data?.tasks
        .map((t) => t.start_date)
        .filter((s): s is string => Boolean(s))
        .sort()[0] || data?.project.start_date || null,
    [data],
  )
  const projectPeriodEnd = useMemo(
    () =>
      data?.tasks
        .map((t) => t.end_date)
        .filter((s): s is string => Boolean(s))
        .sort()
        .reverse()[0] || data?.project.end_date || null,
    [data],
  )

  const refresh = async () => {
    setLoading(true)
    setError(null)
    try {
      const d = await loadProjectDetail(projectId)
      setData(d)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [projectId])

  /** 头部「导出项目」· 一键导出整个项目到模板 */
  const handleExportProject = async () => {
    if (!data) return
    setError(null)
    try {
      const ok = await exportProjectToFile(projectId, data.project.project_name)
      if (ok) toast.success('已导出整个项目模板', data.project.project_name)
      else toast.error('导出失败', '导出已取消或写入失败')
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e)
      toast.error('导出失败', m)
      setError(m)
    }
  }

  // 进入项目详情前刷新法定节假日缓存（读数据库同步数据 · 与设置中心一致）
  useEffect(() => {
    void defaultHolidayProvider.load()
  }, [])

  if (loading && !data) {
    return (
      <div
        style={{ padding: '48px 40px', color: 'var(--color-text-secondary)' }}
      >
        正在加载项目详情…
      </div>
    )
  }
  if (error || !data) {
    return (
      <div style={{ padding: '48px 40px' }}>
        <button
          onClick={onBack}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '6px 6px',
            border: '1px solid var(--color-border-thin)',
            borderRadius: 'var(--radius)',
            background: 'transparent',
            color: 'var(--color-text-secondary)',
            fontSize: '12px',
            cursor: 'pointer',
          }}
        >
          <ArrowLeft size={12} />
          返回项目列表
        </button>
        <div
          style={{
            marginTop: '20px',
            padding: '12px 16px',
            background: 'var(--color-bg-subtle)',
            border: '1px solid var(--color-status-danger)',
            borderRadius: 'var(--radius)',
            color: 'var(--color-status-danger)',
            fontSize: '13px',
          }}
        >
          加载失败：{error ?? '项目不存在'}
        </div>
      </div>
    )
  }

  return (
    <div
      data-testid="project-detail-page"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--color-bg)',
      }}
    >
      <Header
        data={data}
        onBack={onBack}
        onEditOverview={() => setEditOpen(true)}
        onExportWholeProject={() => void handleExportProject()}
      />

      {/* 关键指标卡区（4 张横排 · 始终可见） */}
      <MetricsRow data={data} />

      {/* 一级 Tab */}
      <div
        data-testid="primary-tabs"
        style={{
          display: 'flex',
          gap: '2px',
          padding: '0 32px',
          borderBottom: '1px solid var(--color-border-thin)',
          background: 'var(--color-bg)',
        }}
      >
        {PRIMARY_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setPrimary(t.key)}
            data-testid={`primary-tab-${t.key}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '12px 16px',
              border: 'none',
              background: 'transparent',
              borderBottom:
                primary === t.key
                  ? '2px solid var(--color-accent)'
                  : '2px solid transparent',
              color:
                primary === t.key
                  ? 'var(--color-text)'
                  : 'var(--color-text-secondary)',
              fontSize: '13px',
              fontWeight: primary === t.key ? 500 : 400,
              cursor: 'pointer',
              marginBottom: '-1px',
            }}
          >
            <t.Icon size={13} strokeWidth={1.75} />
            {t.label}
          </button>
        ))}
      </div>

      {/* 二级 Tab（仅在计划管理下）*/}
      {primary === 'planning' && (
        <div
          data-testid="planning-tabs"
          style={{
            display: 'flex',
            gap: '2px',
            padding: '8px 32px 0',
            background: 'var(--color-bg-subtle)',
            borderBottom: '1px solid var(--color-border-thin)',
          }}
        >
          {PLANNING_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setPlanning(t.key)}
              data-testid={`planning-tab-${t.key}`}
              style={{
                padding: '6px 6px',
                border: 'none',
                background: 'transparent',
                borderRadius: 'var(--radius)',
                color:
                  planning === t.key
                    ? 'var(--color-text)'
                    : 'var(--color-text-secondary)',
                backgroundColor:
                  planning === t.key ? 'var(--color-surface)' : 'transparent',
                fontSize: '12.5px',
                fontWeight: planning === t.key ? 500 : 400,
                cursor: 'pointer',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Tab 内容 */}
      <div
        data-testid="primary-content"
        style={{
          flex: 1,
          padding: '20px 32px 32px',
          // 甘特图 tab 激活时主容器不滚动（甘特图自带内部滚动，避免双滚动条）
          // 底部图例若被挤出可视区时兜底滚动（防止 hidden 裁剪图例导致看不到）
          overflowY:
            primary === 'planning' && planning === 'gantt' ? 'auto' : 'auto',
          maxWidth: '1440px',
          width: '100%',
        }}
      >
        {/* 规划区顶部：项目概况（横排 · 单独组件 · 由 PlanningSection 在 planning === 'overall' 下渲染） */}
        {primary === 'planning' && (
          <PlanningSection
            projectId={projectId}
            data={data}
            onRefresh={refresh}
            planning={planning}
            setPlanning={setPlanning}
          />
        )}
        {primary === 'weekly' && (
          <WeeklyTab projectId={projectId} data={data} onRefresh={refresh} />
        )}
        {primary === 'knowledge' && <KnowledgeTab data={data} />}
        {primary === 'files' && (
          <FilesTabErrorBoundary>
            <FilesTab
              projectId={projectId}
              data={data}
              onRefresh={refresh}
            />
          </FilesTabErrorBoundary>
        )}
        {primary === 'members' && (
          <MembersTab projectId={projectId} data={data} onRefresh={refresh} />
        )}
        {primary === 'registers' && <RegistersSection projectId={projectId} />}
      </div>

      <ProjectOverviewEditModal
        open={editOpen}
        project={data.project}
        onClose={() => setEditOpen(false)}
        onSaved={refresh}
      />
    </div>
  )
}

// ============================================================
// Header
// ============================================================

function Header({
  data,
  onBack,
  onEditOverview,
  onExportWholeProject,
}: {
  data: ProjectDetailData
  onBack: () => void
  onEditOverview?: () => void
  onExportWholeProject?: () => void
}) {
  return (
    <div
      data-testid="project-header"
      style={{
        padding: '14px 32px',
        borderBottom: '1px solid var(--color-border-thin)',
        background: 'var(--color-surface)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        {/* 左：返回 */}
        <button
          onClick={onBack}
          data-testid="project-back"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '5px 10px',
            border: '1px solid var(--color-border-thin)',
            borderRadius: 'var(--radius)',
            background: 'transparent',
            color: 'var(--color-text-secondary)',
            fontSize: '12px',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <ArrowLeft size={12} />
          返回列表
        </button>

        {/* 中：项目名（大号加粗） */}
        <h1
          style={{
            fontSize: '22px',
            fontWeight: 700,
            color: 'var(--color-text)',
            letterSpacing: '-0.015em',
            margin: 0,
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {data.project.project_name}
        </h1>

        {/* 右：导出项目 */}
        {onExportWholeProject && (
          <button
            onClick={onExportWholeProject}
            data-testid="export-project-btn"
            style={primaryBtnStyle}
            title="导出整个项目到模板"
          >
            <Download size={12} strokeWidth={1.75} />
            导出项目
          </button>
        )}
        {/* 右：编辑 */}
          <button
            onClick={onEditOverview}
            data-testid="edit-overview-btn"
            style={primaryBtnStyle}
          >
            <Pencil size={12} strokeWidth={1.75} />
            编辑项目
          </button>
      </div>
    </div>
  )
}

/** 主操作按钮样式（蓝色填充） */
const primaryBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '5px 12px',
  border: 'none',
  borderRadius: 'var(--radius)',
  background: 'var(--color-accent)',
  color: 'var(--color-text-on-accent)',
  fontSize: '12px',
  fontWeight: 500,
  cursor: 'pointer',
}

/** 淡按钮（导出 / 折叠 / 编辑等次要操作） */
const ghostBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '4px 10px',
  border: '1px solid var(--color-border-thin)',
  borderRadius: 'var(--radius)',
  background: 'var(--color-bg-subtle)',
  color: 'var(--color-text-secondary)',
  fontSize: '12px',
  cursor: 'pointer',
  fontFamily: 'inherit',
}

/** 维护者 2026-08-31：WeekDetailModal 顶部工具栏按钮统一样式 */
const weekModalBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 4,
  padding: '4px 10px',
  border: '1px solid var(--color-border-thin)',
  background: 'var(--color-bg-subtle)',
  color: 'var(--color-text-secondary)',
  borderRadius: 6,
  fontSize: 12,
  cursor: 'pointer',
  fontFamily: 'inherit',
  flexShrink: 0,
}

// ============================================================
// 关键指标卡区（4 张横排 · 始终可见）
// ============================================================

/**
 * 4 张关键指标卡：
 *  1. 整体进度（环形进度条 + 百分比）
 *  2. 父任务数量
 *  3. 子任务状态（已完成 / 进行中 / 未开始）
 *  4. 项目周期（起止 + 总天数）
 */
function MetricsRow({ data }: { data: ProjectDetailData }) {
  // 父任务数（parent_id 为 null）
  const parentCount = data.tasks.filter((t) => t.parent_id === null).length
  // 维护者 2026-08-26：项目周期自动从任务最早 start_date / 最晚 end_date 读取
  const projectPeriodStart =
    data.tasks.map((t) => t.start_date).filter((s): s is string => Boolean(s)).sort()[0] ||
    data.project.start_date ||
    null
  const projectPeriodEnd =
    data.tasks.map((t) => t.end_date).filter((s): s is string => Boolean(s)).sort().reverse()[0] ||
    data.project.end_date ||
    null
  // 项目总天数（含起止）
  const totalDays = computeProjectDays(projectPeriodStart, projectPeriodEnd)

  return (
    <div
      data-testid="project-metrics-row"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
        gap: 12,
        padding: '14px 32px',
        background: 'var(--color-bg)',
        borderBottom: '1px solid var(--color-border-thin)',
      }}
    >
      <ProgressCard progress={data.progress} />
      <ParentTaskCard count={parentCount} />
      <SubtaskStatusCard
        completed={data.taskStats.completed}
        inProgress={data.taskStats.inProgress}
        pending={data.taskStats.pending}
      />
      <PeriodCard
        startDate={projectPeriodStart}
        endDate={projectPeriodEnd}
        totalDays={totalDays}
      />
    </div>
  )
}

/** 计算项目总天数（含起止）· 跨年的用绝对差 */
function computeProjectDays(
  start: string | null,
  end: string | null,
): number | null {
  if (!start || !end) return null
  const s = new Date(start + 'T00:00:00')
  const e = new Date(end + 'T00:00:00')
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return null
  return Math.round((e.getTime() - s.getTime()) / 86400000) + 1
}

/** 卡片通用样式（白底 · 圆角 12 · 轻阴影） */
const metricCardStyle: React.CSSProperties = {
  background: 'var(--color-surface)',
  border: '1px solid var(--color-border-thin)',
  borderRadius: 12,
  padding: '14px 18px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  minHeight: 84,
}

/** 卡片 1：整体进度 + 环形进度条 */
function ProgressCard({ progress }: { progress: number }) {
  // 环形进度条 · SVG circle + stroke-dasharray
  const R = 28
  const CIRC = 2 * Math.PI * R
  const clamped = Math.max(0, Math.min(100, progress))
  const offset = CIRC * (1 - clamped / 100)
  return (
    <div
      data-testid="metric-progress"
      style={{ ...metricCardStyle, alignItems: 'center' }}
    >
      <svg width={64} height={64} style={{ flexShrink: 0 }}>
        <circle
          cx={32}
          cy={32}
          r={R}
          fill="none"
          stroke="var(--color-border-thin)"
          strokeWidth={5}
        />
        <circle
          cx={32}
          cy={32}
          r={R}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={offset}
          transform="rotate(-90 32 32)"
        />
        <text
          x={32}
          y={36}
          textAnchor="middle"
          fontSize={13}
          fontWeight={700}
          fill="var(--color-accent)"
          fontFamily="var(--font-mono)"
        >
          {clamped}
        </text>
      </svg>
      <div>
        <div
          style={{
            fontSize: '11.5px',
            color: 'var(--color-text-tertiary)',
            marginBottom: 4,
          }}
        >
          整体进度
        </div>
        <div
          style={{
            fontSize: '10.5px',
            color: 'var(--color-text-tertiary)',
          }}
        >
          加权平均完成度
        </div>
      </div>
    </div>
  )
}

/** 卡片 2：父任务数量 */
function ParentTaskCard({ count }: { count: number }) {
  return (
    <div data-testid="metric-parent-tasks" style={metricCardStyle}>
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 10,
          background: 'var(--color-accent-subtle)',
          color: 'var(--color-accent)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <FolderKanban size={20} strokeWidth={1.75} />
      </div>
      <div>
        <div
          style={{
            fontSize: '11.5px',
            color: 'var(--color-text-tertiary)',
            marginBottom: 4,
          }}
        >
          父任务数量
        </div>
        <div
          style={{
            fontSize: '22px',
            fontWeight: 700,
            color: 'var(--color-text)',
            fontFamily: 'var(--font-mono)',
            lineHeight: 1.1,
          }}
        >
          {count} <span style={{ fontSize: '12px', fontWeight: 400, color: 'var(--color-text-tertiary)' }}>个</span>
        </div>
      </div>
    </div>
  )
}

/** 卡片 3：子任务状态（已完成 / 进行中 / 未开始） */
function SubtaskStatusCard({
  completed,
  inProgress,
  pending,
}: {
  completed: number
  inProgress: number
  pending: number
}) {
  return (
    <div data-testid="metric-subtask-status" style={metricCardStyle}>
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 10,
          background: 'var(--color-status-success-subtle, rgba(16,185,129,0.08))',
          color: 'var(--color-status-success)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <ListTodo size={20} strokeWidth={1.75} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: '11.5px',
            color: 'var(--color-text-tertiary)',
            marginBottom: 6,
          }}
        >
          子任务状态
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: '12.5px',
            color: 'var(--color-text)',
            flexWrap: 'wrap',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: 'var(--color-status-success)',
              }}
            />
            已完成 <strong style={{ fontFamily: 'var(--font-mono)' }}>{completed}</strong>
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: 'var(--color-status-warning)',
              }}
            />
            进行中 <strong style={{ fontFamily: 'var(--font-mono)' }}>{inProgress}</strong>
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: 'var(--color-text-tertiary)',
              }}
            />
            未开始 <strong style={{ fontFamily: 'var(--font-mono)' }}>{pending}</strong>
          </span>
        </div>
      </div>
    </div>
  )
}

/** 卡片 4：项目周期 + 总天数 */
function PeriodCard({
  startDate,
  endDate,
  totalDays,
}: {
  startDate: string | null
  endDate: string | null
  totalDays: number | null
}) {
  return (
    <div data-testid="metric-period" style={metricCardStyle}>
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 10,
          background: 'var(--color-status-warning-subtle, rgba(245,158,11,0.08))',
          color: 'var(--color-status-warning)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Calendar size={20} strokeWidth={1.75} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: '11.5px',
            color: 'var(--color-text-tertiary)',
            marginBottom: 4,
          }}
        >
          项目周期
        </div>
        <div
          style={{
            fontSize: '12.5px',
            color: 'var(--color-text)',
            fontFamily: 'var(--font-mono)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {startDate ?? '?'} ~ {endDate ?? '?'}
          {totalDays !== null && (
            <span
              style={{
                marginLeft: 8,
                color: 'var(--color-text-tertiary)',
              }}
            >
              · 共 {totalDays} 天
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================
// 一级 · 计划管理 · 整体计划
// ============================================================

/**
 * 整体计划 tab（两行 · 不用 55 分 · 维护者 2026-08-26 重做）
 * 严格按 Excel 公式实现：
 *   - 启动日期 = MIN(任务列表中最早 start_date)
 *   - 项目结束日期 = MAX(任务列表中最晚 end_date)
 *   - 项目持续周数 = INT((MAX(end_date) - 启动日期) / 7) + 1
 *
 * 布局：
 *   第一行：项目概况（横排 · 由 ProjectOverviewPanel 在 planning === 'overall' 下渲染）
 *   第二行：任务概览（TaskPlanPanel · 原 TaskOverviewPanel 重命名）
 *
 * 注：维护者 2026-08-26：控制面板（启动日期/本周结束/延期基准/显示第N周/项目持续周数/查看工作日人天）
 * 全部移到详情 Modal 顶部 · 整体计划 tab 只保留任务概览
 */
/**
 * 计划管理 tab 容器 · 维护者 2026-08-26 spec
 * 根据 `planning` state 渲染对应二级 tab：
 *   - 'overall'：项目概况 + 任务概览
 *   - 'gantt'：甘特图
 * （'weekly' 已升级为一级 tab · 不再在此处渲染）
 */
function PlanningSection({
  projectId,
  data,
  onRefresh,
  planning,
  setPlanning,
}: {
  projectId: number
  data: ProjectDetailData
  onRefresh: () => Promise<void>
  planning: PlanningTab
  setPlanning: (p: PlanningTab) => void
}) {
  // 详情 modal（暂时保留 · 维护者 spec 仅删了 PlanningSection 上的 · 整体计划内「详情」按钮仍需要）
  // V2 简化：暂无 modal · 直接 placeholder
  void setPlanning

  return (
    <div
      data-testid="planning-section"
      style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
    >
      {planning === 'overview' && (
        <ProjectOverviewPanel data={data} onRefresh={onRefresh} />
      )}
      {planning === 'overall' && (
        <TaskPlanPanel
          projectId={projectId}
          data={data}
          onRefresh={onRefresh}
        />
      )}
      {planning === 'gantt' && (
        <GanttTab projectId={projectId} data={data} onRefresh={onRefresh} />
      )}
    </div>
  )
}

/**
 * 项目概况面板（折叠式 · 横排 4 列）
 * 维护者 2026-08-26 spec §7.1
 * - 标题栏可点击折叠/展开
 * - 内容：项目背景 / 项目目标 / 项目范围 / 补充说明（含关键注意事项）
 */

/**
 * 甘特图 tab · V2 完整实现 · 维护者 2026-08-26 spec §5「计划管理-甘特图（重点）」
 *
 * 布局：
 *   - 顶部控制栏：模式（日/周/月 · 单选）+ 视图（父任务/全部）+ 重置滚动
 *   - 主区（横排 · 左中右）：
 *       左：200px 标签区（编号 + 任务名 + 负责人 · 子任务缩进 16px · 折叠/展开）
 *       中：横向滚动时间轴（SVG · 每列按 mode 切换宽度）
 *       右：130px 统计区（自然日 + 工作日 · NETWORKDAYS 公式）
 *
 * 颜色规则（4 状态）：
 *   - 未开始（灰 #9CA3AF）· start_date 或 end_date 为空
 *   - 进行  （橙 #F59E0B）· 0 < progress < 100
 *   - 完成  （绿 #10B981）· progress >= 100
 *   - 延期  （红 #EF4444）· end_date < today && progress < 100
 *   进度填充：bar 内部按 progress% 填充（深一档色）
 *
 * 特殊日期底色：
 *   - 法定节假日：浅红（rgba(239,68,68,0.10)）
 *   - 补班      ：浅绿（rgba(16,185,129,0.10)）
 *   - 周末      ：浅灰（rgba(156,163,175,0.10)）
 *
 * 交互：
 *   - 横向滚动：wheel 事件 + 原生滚动条
 *   - 行 [+] 快速加子任务 · [编辑] [删除] 弹本文件 TaskEditModal / TaskDeleteConfirm
 *   - 父任务行点击 → 折叠/展开子任务（不进 ParentTaskDetailModal）
 *
 * 复用 service：
 *   - createProjectTask / updateProjectTask / deleteProjectTask
 *   - defaultHolidayProvider.get(dateStr) → HolidayEntry | undefined
 */
const GANTT_LABEL_W = 200
const GANTT_STATS_W = 130 // 自然日 65 + 工作日 65
const GANTT_ROW_H = 36
const GANTT_MONTH_ROW_H = 24 // 月份 header（跨列合并）
const GANTT_DATE_ROW_H = 24 // 日期 row（仅日期）
const GANTT_WEEKDAY_ROW_H = 24 // 周几 row（一二三四五六日）
const GANTT_HEADER_H =
  GANTT_MONTH_ROW_H + GANTT_DATE_ROW_H + GANTT_WEEKDAY_ROW_H // 72

/** 列宽（按 mode 切换）*/
const GANTT_CELL_W: Record<'day' | 'week' | 'month', number> = {
  day: 28,   // 日粒度：每列 28px（之前 14px 太挤）
  week: 80,  // 周粒度
  month: 120, // 月粒度
}

/** 4 状态颜色（与 §5 规范一致）*/
const GANTT_BAR_COLOR: Record<ProjectTask['status'], string> = {
  PENDING: '#9CA3AF',     // 灰
  IN_PROGRESS: '#F59E0B', // 橙
  COMPLETED: '#10B981',   // 绿
  DELAYED: '#EF4444',     // 红
}

/** 进度填充色（深一档）*/
const GANTT_PROGRESS_COLOR: Record<ProjectTask['status'], string> = {
  PENDING: '#6B7280',
  IN_PROGRESS: '#D97706',
  COMPLETED: '#059669',
  DELAYED: '#DC2626',
}

function GanttTab({
  projectId,
  data,
  onRefresh,
}: {
  projectId: number
  data: ProjectDetailData
  onRefresh: () => Promise<void>
}) {
  const [mode, setMode] = useState<'day' | 'week' | 'month'>('day')
  const [view, setView] = useState<'parent' | 'all'>('all')
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 甘特图全屏最大化浮窗
  const [maximized, setMaximized] = useState(false)
  // 维护者 2026-08-27：左侧任务标签列可拖动调宽（默认 200px · 可往右拖展开看长任务名）
  const [labelW, setLabelW] = useState(GANTT_LABEL_W)
  // 旧 GanttTab 内 import 状态（保留以兼容旧 handleImportFile · 实际 modal 在 TaskPlanPanel）
  const [importConfirm, _setImportConfirm] = useState<ProjectTask[] | null>(null)
  const [importFile, _setImportFile] = useState<File | null>(null)
  const [overwritePrompt, _setOverwritePrompt] = useState<{ existing: number; imported: number } | null>(null)
  const setImportConfirm = _setImportConfirm
  const setImportFile = _setImportFile
  const setOverwritePrompt = _setOverwritePrompt
  void importConfirm; void importFile; void overwritePrompt
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  // Excel 冻结窗格 · 手动 onScroll 同步表头 translateY（sticky top 在 max-content flex 里不可靠）
  const [scrollPos, setScrollPos] = useState({ left: 0, top: 0 })

  // 模式列宽映射（按 mode 切换 · 不挤）
  const cellW = GANTT_CELL_W[mode]

  /** 取该日期所在周的周日（周日=0 · 切到周六+1 = 周日）· 定义在 range 之前避免 TDZ */
  const endOfWeekSunday = (d: Date): Date => {
    const r = new Date(d)
    const day = r.getDay() // 0=Sun 6=Sat
    const add = day === 0 ? 0 : 7 - day
    r.setDate(r.getDate() + add)
    return r
  }

  // ----- 时间范围（按 §5 spec · 2026-08-26 维护者 拍板：动态取任务所在周）-----
  //   - 开始 = 最早 start_date 所在周的周一
  //   - 结束 = 最晚 end_date 所在周的周日
  const range = useMemo(() => {
    const starts = data.tasks
      .map((t) => t.start_date)
      .filter((s): s is string => Boolean(s))
      .sort()
    const ends = data.tasks
      .map((t) => t.end_date)
      .filter((s): s is string => Boolean(s))
      .sort()
    // 维护者 2026-08-26：开始/结束只看任务级日期（项目级 start_date/end_date 是元数据，可能跟排期不符）
    const rawStart = starts[0] || data.project.start_date || todayLocal()
    const rawEnd = ends[ends.length - 1] || data.project.end_date || todayLocal()
    // 取所在周的周一 / 周日（按维护者 2026-08-26 拍板：结束=最晚任务所在周的周末）
    // 不为显示节假日额外拉长范围（那是甘特图 bar 之外的额外列，会误导日期）
    const startD = new Date(rawStart + 'T00:00:00')
    const startMonday = startOfWeekMonday(startD)
    const endD = new Date(rawEnd + 'T00:00:00')
    const endSunday = endOfWeekSunday(endD)
    const start = formatLocalDate(startMonday)
    const end = formatLocalDate(endSunday)
    return { start, end }
  }, [data])

  // ----- 每天的节假日 / 补班标记（按 §5 spec · 复用 defaultHolidayProvider）-----
  //   - isHoliday：HOLIDAY + isWorkday=0 → 节假日（浅红）
  //   - isShift  ：WORKDAY_SHIFT + isWorkday=1 → 调休（保留旧字段）
  //   - isMakeup ：任意 type + isWorkday=1 → 补班（浅绿 + ▲ 标记）· 涵盖
  //                 ① WORKDAY_SHIFT + isWorkday=1（原调休工作日）
  //                 ② HOLIDAY + isWorkday=1（极端配置 · 维护者 spec 显式支持）
  const dayMeta = useMemo(() => {
    const m = new Map<
      string,
      { isHoliday: boolean; isShift: boolean; isMakeup: boolean }
    >()
    if (!range.start || !range.end) return m
    const cur = new Date(range.start + 'T00:00:00')
    const endD = new Date(range.end + 'T00:00:00')
    while (cur <= endD) {
      const ds = formatLocalDate(cur)
      const h = defaultHolidayProvider.get(ds)
      const isHoliday = !!(h && h.type === 'HOLIDAY' && h.isWorkday === 0)
      const isShift = !!(h && h.type === 'WORKDAY_SHIFT' && h.isWorkday === 1)
      // 补班判定：直接看 isWorkday（HOLIDAY+isWorkday=1 或 WORKDAY_SHIFT+isWorkday=1）
      const isMakeup = !!(h && h.isWorkday === 1)
      m.set(ds, { isHoliday, isShift, isMakeup })
      cur.setDate(cur.getDate() + 1)
    }
    return m
  }, [range])

  const holidaySet = useMemo(() => {
    const s = new Set<string>()
    dayMeta.forEach((v, k) => {
      if (v.isHoliday) s.add(k)
    })
    return s
  }, [dayMeta])

  // ----- 时间轴列（按 mode 步进）-----
  const columns = useMemo(() => {
    const cols: Array<{ date: string; label: string; subLabel?: string }> = []
    if (!range.start || !range.end) return cols
    const cur = new Date(range.start + 'T00:00:00')
    const endD = new Date(range.end + 'T00:00:00')
    while (cur <= endD) {
      const ds = formatLocalDate(cur)
      let label = ''
      let subLabel: string | undefined
      if (mode === 'day') {
        label = String(cur.getDate()).padStart(2, '0')
        subLabel = getWeekdayShort(cur)
      } else if (mode === 'week') {
        label = `${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`
        subLabel = `W${getIsoWeek(cur)}`
      } else {
        label = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}`
      }
      cols.push({ date: ds, label, subLabel })
      if (mode === 'day') cur.setDate(cur.getDate() + 1)
      else if (mode === 'week') cur.setDate(cur.getDate() + 7)
      else cur.setMonth(cur.getMonth() + 1)
    }
    return cols
  }, [range, mode])

  // ----- 月份块（用于月份 header · 跨列合并 · 维护者 2026-08-26 spec）-----
  //   每块: { startCol, endCol, label: '2026年X月' }
  //   day 模式：连续同月日期合并 · week 模式：按周起点所在月合并 · month 模式：每列一块
  const monthBlocks = useMemo(() => {
    const blocks: Array<{ startCol: number; endCol: number; label: string }> = []
    let i = 0
    while (i < columns.length) {
      const d = new Date(columns[i].date + 'T00:00:00')
      const y = d.getFullYear()
      const m = d.getMonth() + 1
      let j = i + 1
      while (j < columns.length) {
        const dj = new Date(columns[j].date + 'T00:00:00')
        if (dj.getFullYear() === y && dj.getMonth() + 1 === m) j++
        else break
      }
      blocks.push({
        startCol: i,
        endCol: j - 1,
        label: `${y}年${m}月`,
      })
      i = j
    }
    return blocks
  }, [columns])

  // ----- 父任务 + 子任务分组 -----
  const parents = useMemo(
    () =>
      data.tasks
        .filter((t) => t.parent_id === null)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [data.tasks],
  )
  const childrenByParent = useMemo(() => {
    const m = new Map<number, ProjectTask[]>()
    for (const t of data.tasks) {
      if (t.parent_id !== null) {
        const list = m.get(t.parent_id) ?? []
        list.push(t)
        m.set(t.parent_id, list)
      }
    }
    for (const [, list] of m) {
      list.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    }
    return m
  }, [data.tasks])

  // 默认全部展开（仅在父任务 ID 集合变化时）
  const parentIdsKey = parents.map((p) => p.id).join(',')
  useEffect(() => {
    setExpanded(new Set(parents.map((p) => p.id)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentIdsKey])

  // 可见行（带编号 · 父 N · 子 N.M）
  const visibleRows = useMemo(() => {
    const rows: Array<{
      task: ProjectTask
      isParent: boolean
      rowIdx: number
      label: string
      depth: number
    }> = []
    // 递归 DFS：深度 0（大阶段）可折叠；更深层级（阶段明细 4.1 及其孙级 4.1.1…）始终下钻显示，不再被 2 层结构隐藏
    const pushLevel = (list: ProjectTask[], prefix: string, depth: number) => {
      list.forEach((n, i) => {
        const label = depth === 0 ? String(i + 1) : `${prefix}.${i + 1}`
        const kids = childrenByParent.get(n.id) ?? []
        const hasKids = kids.length > 0
        rows.push({ task: n, isParent: depth === 0, rowIdx: rows.length, label, depth })
        const showKids = depth === 0 ? expanded.has(n.id) : true
        if (view === 'all' && hasKids && showKids) pushLevel(kids, label, depth + 1)
      })
    }
    pushLevel(parents, '', 0)
    return rows
  }, [parents, childrenByParent, expanded, view])

  // ----- 工具函数 -----
  const diffDays = (a: string, b: string): number => {
    const ms =
      new Date(a + 'T00:00:00').getTime() -
      new Date(b + 'T00:00:00').getTime()
    return Math.round(ms / 86400000)
  }

  const naturalDays = (start: string, end: string): number =>
    diffDays(end, start) + 1

  /** NETWORKDAYS 公式迁移（按 §5 spec · 排除周末 + 法定假日 + 补班视为工作日）*/
  const networkdays = (start: string, end: string): number => {
    if (!start || !end) return 0
    let count = 0
    const cur = new Date(start + 'T00:00:00')
    const endD = new Date(end + 'T00:00:00')
    while (cur <= endD) {
      const ds = formatLocalDate(cur)
      const day = cur.getDay()
      if (day !== 0 && day !== 6 && !holidaySet.has(ds)) count++
      cur.setDate(cur.getDate() + 1)
    }
    return count
  }

  /** 日期 → 列索引（按 mode 步进 · 二分）*/
  const dateToColIndex = (date: string): number => {
    let lo = 0
    let hi = columns.length - 1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (columns[mid].date === date) return mid
      if (columns[mid].date < date) lo = mid + 1
      else hi = mid - 1
    }
    return lo
  }

  /** 按 §5 规则推导当前应使用的 status（用于颜色）*/
  const inferStatus = (t: ProjectTask): ProjectTask['status'] => {
    if (!t.start_date || !t.end_date) return 'PENDING'
    const today = todayLocal()
    if (t.progress >= 100) return 'COMPLETED'
    if (t.end_date < today && t.progress < 100) return 'DELAYED'
    if (t.progress > 0 && t.progress < 100) return 'IN_PROGRESS'
    return 'PENDING'
  }

  const getBarColor = (t: ProjectTask): string =>
    GANTT_BAR_COLOR[inferStatus(t)]

  const getProgressColor = (t: ProjectTask): string =>
    GANTT_PROGRESS_COLOR[inferStatus(t)]

  /** 某天对应的底色（按 §5 spec · 节假日 / 补班 / 周末）*/
  const getDayBgColor = (date: string): string | undefined => {
    const meta = dayMeta.get(date)
    if (meta?.isHoliday) return 'rgba(239,68,68,0.10)'   // 节假日 · 浅红
    if (meta?.isMakeup) return 'rgba(16,185,129,0.10)'   // 补班   · 浅绿（▲ 标记）
    const d = new Date(date + 'T00:00:00').getDay()
    if (d === 0 || d === 6) return 'rgba(156,163,175,0.10)' // 周末  · 浅灰
    return undefined
  }

  // ----- 事件处理 -----
  const toggleExpand = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const resetScroll = () => {
    if (scrollRef.current) scrollRef.current.scrollLeft = 0
  }

  /** 滚轮事件：默认垂直滚动（纵向列表）· 不劫持成横向 · 修复「往下滚时往左滑」问题
   *  水平滚动交给滚动条 / Shift+滚轮 · 用户可正常浏览列表 */
  const handleWheel = (_e: React.WheelEvent<HTMLDivElement>) => {
    /* 保留空实现：让浏览器默认垂直滚动 */
  }

  /** 顶部工具栏 · 导出当前项目全部任务为 Excel */
  const handleExportExcel = async () => {
    setError(null)
    try {
      const blob = await exportProjectsToExcel(data.tasks)
      const ts = formatLocalDate(new Date())
      const filename = `项目管理-${data.project.project_name || projectId}-${ts}.xlsx`
      const ok = await saveBlobToDirectory(blob, filename)
      if (ok) {
        toast.success(`已导出 ${data.tasks.length} 条任务`, `文件名：${filename}`)
      } else {
        toast.error('导出 Excel 失败', '浏览器拦截了下载，请检查 WebView 设置')
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error('导出 Excel 失败', msg)
      setError(msg)
    }
  }

  /** 顶部工具栏 · 导出整个项目模板（甘特/各登记册/周报/成员/节假日） */
  const handleExportWholeProject = async () => {
    setBusy(true)
    setError(null)
    try {
      const [reqs, issLog, todos, risks, week, members] = await Promise.all([
        listProjectRequirements(projectId),
        listProjectIssueLog(projectId),
        listProjectTodoItems(projectId),
        listProjectIssues(projectId),
        listWeeklyEntries(projectId),
        listProjectMembers(projectId),
      ])
      await defaultHolidayProvider.load()
      const blob = await exportWholeProjectExcel({
        tasks: data.tasks,
        risks,
        requirements: reqs,
        issues: issLog,
        todos,
        weeklyEntries: week,
        members,
        holidays: defaultHolidayProvider.list(),
      })
      const ts = formatLocalDate(new Date())
      const filename = `${data.project.project_name || projectId}-整项目模板-${ts}.xlsx`
      const ok = await saveBlobToDirectory(blob, filename)
      if (ok) toast.success('已导出整个项目模板', `文件名：${filename}`)
      else toast.error('导出失败', '导出已取消或写入失败')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error('导出失败', msg)
      setError(msg)
    } finally {
      setBusy(false)
    }
  }

  /** 顶部工具栏 · 触发隐藏 file input */
  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  /** 顶部工具栏 · Excel 文件 → parse → 弹 confirm → 循环 createProjectTask */
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // 重置 input，允许重复导入同名文件
    if (e.target) e.target.value = ''
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const parsed = await parseProjectsExcel(file, projectId)
      if (parsed.length === 0) {
        toast.warning('Excel 中没有可导入的任务行')
        setError('Excel 中没有可导入的任务行')
        return
      }
      // 弹预览 modal（导入确认 + 覆盖判断在 modal 里做）
      setImportFile(file)
      setImportConfirm(parsed)
      toast.success(`已解析 ${parsed.length} 条任务`, '请在确认框中预览并确认导入')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error('解析 Excel 失败', msg)
      setError(msg)
    } finally {
      setBusy(false)
    }
  }

  const totalW = columns.length * cellW
  const totalH = Math.max(visibleRows.length, 1) * GANTT_ROW_H
  const today = todayLocal()
  const todayColIdx = dateToColIndex(today)

  // ----- 渲染 -----
  const sectionEl = (
    <Section
      title="项目甘特图"
      icon={ListTodo}
      accent="var(--color-accent)"
      rightSlot={
        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <GanttModeSwitch mode={mode} onChange={setMode} />
          <GanttViewSwitch view={view} onChange={setView} />
          <button
            type="button"
            onClick={async () => {
              try {
                const ok = await downloadProjectTemplate()
                if (ok) toast.success('模板已下载', '项目管理实施计划模板.xlsx')
              } catch (e) {
                const msg = e instanceof Error ? e.message : String(e)
                toast.error('下载模板失败', msg)
                setError(msg)
              }
            }}
            disabled={busy}
            data-testid="gantt-download-template"
            style={ghostBtnStyle}
            title="下载项目管理 Excel 模板"
          >
            <Download size={11} />
            下载模板
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={busy}
            data-testid="gantt-export-excel"
            style={ghostBtnStyle}
            title="导出当前项目全部任务为 Excel"
          >
            <Download size={11} />
            导出 Excel
          </button>
          <button
            type="button"
            onClick={() => void handleExportWholeProject()}
            disabled={busy}
            data-testid="export-whole-project"
            style={ghostBtnStyle}
            title="导出整个项目模板（甘特/各登记册/周报/成员/节假日）"
          >
            <Download size={11} />
            导出整个项目
          </button>
          {/* 全屏最大化 / 还原 · 放工具栏最末尾 */}
          <button
            type="button"
            onClick={() => setMaximized((m) => !m)}
            data-testid="gantt-maximize-toggle"
            style={ghostBtnStyle}
            title={maximized ? '还原到嵌入视图' : '全屏最大化甘特图'}
          >
            {maximized ? <Minimize size={11} /> : <Maximize size={11} />}
            {maximized ? '还原' : '最大化'}
          </button>
          </div>
      }
    >
      {error && (
        <div
          style={{
            marginBottom: 10,
            padding: '8px 12px',
            borderRadius: 'var(--radius)',
            background: 'rgba(239,68,68,0.08)',
            color: 'var(--color-status-danger)',
            fontSize: 12,
          }}
        >
          {error}
        </div>
      )}

      {visibleRows.length === 0 ? (
        <EmptyHint text="该项目暂无任务 · 暂不能生成甘特图" />
      ) : (
        <div
          data-testid="gantt-tab"
          ref={scrollRef}
          onScroll={(e) =>
            setScrollPos({
              left: e.currentTarget.scrollLeft,
              top: e.currentTarget.scrollTop,
            })
          }
          style={{
            border: '1px solid var(--color-border-thin)',
            borderRadius: 'var(--radius)',
            background: 'var(--color-surface)',
            // 唯一滚动容器：双轴滚动（maxHeight 纵滚 + max-content 横滚）
            // 240→340：为上方页面头/指标卡/tab/标题 + 底部图例预留空间，避免图例被挤出视口裁掉
            maxHeight: 'calc(100vh - 340px)',
            overflow: 'auto',
          }}
        >
          {/* 主体：左 200px label（sticky left）/ 中 timeline / 右 130px stats
              gantt-tab 唯一双轴滚动 · 三列平铺 flex · 各 sticky → Excel 冻结窗格 */}
          <div style={{ display: 'flex', width: 'max-content' }}>
            {/* === 左：标签列（200px · sticky left 双冻结 + 横向冻结） === */}
            <div
              style={{
                width: labelW,
                flexShrink: 0,
                position: 'sticky',
                left: 0,
                zIndex: 10,
                background: 'var(--color-surface)',
                borderRight: '1px solid var(--color-border-thin)',
              }}
            >
              {/* 拖拽手柄：拖动左列右边缘往右调宽 */}
              <div
                onPointerDown={(e) => {
                  e.preventDefault()
                  const startX = e.clientX
                  const startW = labelW
                  const onMove = (ev: PointerEvent) => {
                    const next = Math.max(140, Math.min(startW + (ev.clientX - startX), 480))
                    setLabelW(next)
                  }
                  const onUp = () => {
                    window.removeEventListener('pointermove', onMove)
                    window.removeEventListener('pointerup', onUp)
                  }
                  window.addEventListener('pointermove', onMove)
                  window.addEventListener('pointerup', onUp)
                }}
                title="拖动调整任务列宽度"
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  right: -3,
                  width: 7,
                  cursor: 'col-resize',
                  zIndex: 30,
                  touchAction: 'none',
                }}
              />
              {/* Header · 左上角双冻结（left 由外层 sticky 列承担 + top 手动 translateY 同步）*/}
              <div
                style={{
                  transform: `translateY(${scrollPos.top}px)`,
                  zIndex: 20,
                  height: GANTT_HEADER_H,
                  padding: '0 12px',
                  display: 'flex',
                  alignItems: 'center',
                  fontSize: 11,
                  fontWeight: 600,
                  color: 'var(--color-text-tertiary)',
                  borderBottom: '1px solid var(--color-border-thin)',
                  background: 'var(--color-bg-muted)',
                }}
              >
                任务（编号 · 名称 · 负责人）
              </div>
              {/* Rows */}
              {visibleRows.map((row) => {
                const hasChildren =
                  row.isParent && (childrenByParent.get(row.task.id) ?? []).length > 0
                return (
                  <div
                    key={`lbl-${row.task.id}`}
                    style={{
                      height: GANTT_ROW_H,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      paddingLeft: row.isParent ? 8 : 8 + row.depth * 16,
                      paddingRight: 6,
                      borderBottom: '1px solid var(--color-border-thin)',
                      // sticky-left 需要不透明背景，避免滚动内容透出
                      background:
                        row.rowIdx % 2 === 0
                          ? 'var(--color-surface)'
                          : 'var(--color-surface-muted, rgba(0,0,0,0.025))',
                    }}
                  >
                    {row.isParent ? (
                      <button
                        type="button"
                        onClick={() => toggleExpand(row.task.id)}
                        disabled={!hasChildren}
                        data-testid={`gantt-toggle-${row.task.id}`}
                        style={{
                          border: 'none',
                          background: 'transparent',
                          cursor: hasChildren ? 'pointer' : 'default',
                          padding: 0,
                          display: 'inline-flex',
                          color:
                            hasChildren
                              ? 'var(--color-text-tertiary)'
                              : 'transparent',
                          flexShrink: 0,
                        }}
                        title={hasChildren ? '折叠 / 展开' : ''}
                      >
                        {expanded.has(row.task.id) ? (
                          <ChevronDown size={12} />
                        ) : (
                          <ChevronRight size={12} />
                        )}
                      </button>
                    ) : (
                      <span style={{ width: 12, flexShrink: 0 }} />
                    )}
                    {/* 编号 */}
                    <span
                      style={{
                        fontSize: 10,
                        color: 'var(--color-text-tertiary)',
                        fontFamily: 'var(--font-mono)',
                        flexShrink: 0,
                        width: 22,
                      }}
                    >
                      {row.label}
                    </span>
                    {/* 任务名 */}
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        fontSize: 12,
                        fontWeight: row.isParent ? 600 : 400,
                        color: row.isParent
                          ? 'var(--color-text)'
                          : 'var(--color-text-secondary)',
                      }}
                      title={row.task.task_name}
                    >
                      {row.task.task_name}
                    </span>
                    {/* 负责人 */}
                    {row.task.owner && (
                      <span
                        style={{
                          fontSize: 10,
                          color: 'var(--color-text-tertiary)',
                          flexShrink: 0,
                          maxWidth: 36,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={row.task.owner}
                      >
                        {row.task.owner}
                      </span>
                    )}


                  </div>
                )
              })}
            </div>

            {/* === 中：时间轴（横向滚动由父容器承担） === */}
            <div
              data-testid="gantt-timeline"
              style={{
                flex: '0 0 auto',
              }}
            >
              {/* 冻结表头（HTML · 手动 translateY 同步 · 月份+日期+周几 3 行）*/}
              <div
                style={{
                  transform: `translateY(${scrollPos.top}px)`,
                  zIndex: 20,
                  width: totalW,
                  height: GANTT_HEADER_H,
                  background: 'var(--color-surface)',
                  borderBottom: '1px solid var(--color-border-thin)',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
                }}
              >
                {/* 月份 header（24px · 跨列合并） */}
                <div style={{ position: 'relative', height: GANTT_MONTH_ROW_H }}>
                  {monthBlocks.map((mb, i) => {
                    const x = mb.startCol * cellW
                    const w = (mb.endCol - mb.startCol + 1) * cellW
                    const midX = x + w / 2
                    return (
                      <div
                        key={`month-${i}`}
                        style={{
                          position: 'absolute',
                          left: x,
                          width: w,
                          height: GANTT_MONTH_ROW_H,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 12,
                          fontWeight: 600,
                          color: 'var(--color-text)',
                          background: 'var(--color-bg-subtle)',
                          borderRight: '0.5px solid var(--color-border-thin)',
                          borderBottom: '0.5px solid var(--color-border-thin)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {mb.label}
                      </div>
                    )
                  })}
                </div>
                {/* 日期（每列） */}
                <div style={{ position: 'relative', height: GANTT_DATE_ROW_H }}>
                  {columns.map((col, i) => {
                    const x = i * cellW
                    const meta = dayMeta.get(col.date)
                    const dayBg = getDayBgColor(col.date)
                    const fill = dayBg ?? 'var(--color-bg-muted)'
                    return (
                      <div
                        key={`hdr-date-${col.date}`}
                        style={{
                          position: 'absolute',
                          left: x,
                          width: cellW,
                          height: GANTT_DATE_ROW_H,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 11,
                          fontWeight: 600,
                          color: 'var(--color-text-secondary)',
                          background: fill,
                          borderRight: '0.5px solid var(--color-border-thin)',
                        }}
                      >
                        {col.label}
                        {mode === 'day' && meta?.isMakeup && (
                          <span style={{ position: 'absolute', top: 0, right: 2, fontSize: 8, color: '#10B981' }}>▲</span>
                        )}
                      </div>
                    )
                  })}
                </div>
                {/* 周几（仅 day 模式） */}
                {mode === 'day' && (
                  <div style={{ position: 'relative', height: GANTT_WEEKDAY_ROW_H }}>
                    {columns.map((col, i) => {
                      const x = i * cellW
                      const dayBg = getDayBgColor(col.date)
                      const fill = dayBg ?? 'var(--color-bg-muted)'
                      return (
                        <div
                          key={`hdr-wd-${col.date}`}
                          style={{
                            position: 'absolute',
                            left: x,
                            width: cellW,
                            height: GANTT_WEEKDAY_ROW_H,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 9,
                            color: 'var(--color-text-tertiary)',
                            background: fill,
                            borderRight: '0.5px solid var(--color-border-thin)',
                          }}
                        >
                          {col.subLabel}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* 任务条区（SVG · y 从 0 开始 · 不含表头） */}
              <svg
                width={totalW}
                height={totalH}
                style={{ display: 'block' }}
              >
                {/* 数据行（SVG 不再含表头 · y 从 0 开始） */}
                {visibleRows.map((row) => {
                  const y = row.rowIdx * GANTT_ROW_H
                  const t = row.task
                  const startCol = t.start_date ? dateToColIndex(t.start_date) : -1
                  const endCol = t.end_date ? dateToColIndex(t.end_date) : -1
                  const validBar = startCol >= 0 && endCol >= startCol
                  const x = validBar ? startCol * cellW : 0
                  const w = validBar ? (endCol - startCol + 1) * cellW : 0
                  const progressW =
                    validBar && t.progress > 0
                      ? (w * Math.max(0, Math.min(100, t.progress))) / 100
                      : 0
                  return (
                    <g key={`row-${t.id}`}>
                      {/* 行底色（奇数行斑马） */}
                      <rect
                        x={0}
                        y={y}
                        width={totalW}
                        height={GANTT_ROW_H}
                        fill={
                          row.rowIdx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.015)'
                        }
                      />
                      {/* 周末 / 节假日 / 补班底色（叠在斑马线之上）*/}
                      {columns.map((col, i) => {
                        const bgCol = getDayBgColor(col.date)
                        if (!bgCol) return null
                        return (
                          <rect
                            key={`bg-${t.id}-${col.date}`}
                            x={i * cellW}
                            y={y}
                            width={cellW}
                            height={GANTT_ROW_H}
                            fill={bgCol}
                            opacity={0.85}
                          />
                        )
                      })}
                      {/* 行底线 */}
                      <line
                        x1={0}
                        y1={y + GANTT_ROW_H}
                        x2={totalW}
                        y2={y + GANTT_ROW_H}
                        stroke="var(--color-border-thin)"
                        strokeWidth={0.5}
                      />
                      {/* 任务 bar（底色 + 进度填充 · 深一档）*/}
                      {validBar && (
                        <>
                          <rect
                            x={x}
                            y={y + 8}
                            width={w}
                            height={GANTT_ROW_H - 16}
                            rx={4}
                            fill={getBarColor(t)}
                            opacity={0.4}
                          />
                          {progressW > 0 && (
                            <rect
                              x={x}
                              y={y + 8}
                              width={progressW}
                              height={GANTT_ROW_H - 16}
                              rx={4}
                              fill={getProgressColor(t)}
                              opacity={0.95}
                            />
                          )}
                          {/* 进度文字已去除（按 §维护者 2026-08-26 spec · 保留彩色填充即可） */}
                        </>
                      )}
                    </g>
                  )
                })}

                {/* 今天竖线（蓝色虚线 · 仅 day 模式且今天落在范围内 · SVG 已不含表头）*/}
                {mode === 'day' && todayColIdx >= 0 && todayColIdx < columns.length && (
                  <line
                    x1={todayColIdx * cellW + cellW / 2}
                    y1={0}
                    x2={todayColIdx * cellW + cellW / 2}
                    y2={totalH}
                    stroke="#3B82F6"
                    strokeWidth={1}
                    strokeDasharray="4 2"
                    opacity={0.7}
                  />
                )}
              </svg>
            </div>

            {/* === 右：自然日 + 工作日（sticky right 横向冻结 · 属于同一 flex 三列平铺） === */}
            <div
              style={{
                width: GANTT_STATS_W,
                flexShrink: 0,
                background: 'var(--color-surface)',
                borderLeft: '1px solid var(--color-border-thin)',
                position: 'sticky',
                right: 0,
                zIndex: 10,
              }}
            >
              {/* Header · 手动 translateY 冻结（随列 right 横滚由 sticky 列承担） */}
              <div
                style={{
                  transform: `translateY(${scrollPos.top}px)`,
                  zIndex: 20,
                  height: GANTT_HEADER_H,
                  display: 'flex',
                  alignItems: 'center',
                  borderBottom: '1px solid var(--color-border-thin)',
                  background: 'var(--color-bg-muted)',
                }}
              >
                <div
                  style={{
                    width: GANTT_STATS_W / 2,
                    textAlign: 'center',
                    fontSize: 10.5,
                    color: 'var(--color-text-tertiary)',
                    fontWeight: 600,
                    borderRight: '1px solid var(--color-border-thin)',
                  }}
                >
                  自然日
                </div>
                <div
                  style={{
                    width: GANTT_STATS_W / 2,
                    textAlign: 'center',
                    fontSize: 10.5,
                    color: 'var(--color-text-tertiary)',
                    fontWeight: 600,
                  }}
                >
                  工作日
                </div>
              </div>
              {visibleRows.map((row) => {
                const t = row.task
                const hasRange = !!(t.start_date && t.end_date)
                const n = hasRange ? naturalDays(t.start_date!, t.end_date!) : null
                const w = hasRange ? networkdays(t.start_date!, t.end_date!) : null
                return (
                  <div
                    key={`stats-${t.id}`}
                    style={{
                      height: GANTT_ROW_H,
                      display: 'flex',
                      alignItems: 'center',
                      borderBottom: '1px solid var(--color-border-thin)',
                      fontSize: 11.5,
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--color-text-secondary)',
                      background:
                        row.rowIdx % 2 === 0
                          ? 'transparent'
                          : 'rgba(0,0,0,0.015)',
                    }}
                  >
                    <div
                      style={{
                        width: GANTT_STATS_W / 2,
                        textAlign: 'center',
                        borderRight: '1px solid var(--color-border-thin)',
                      }}
                    >
                      {n ?? '—'}
                    </div>
                    <div style={{ width: GANTT_STATS_W / 2, textAlign: 'center' }}>
                      {w ?? '—'}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* 图例 */}

        </div>
      )}

      {/* ===== 图例（固定在甘特图底部 · 不随主体滚动 · 始终可见） ===== */}
      <div
        style={{
          display: 'flex',
          gap: 14,
          alignItems: 'center',
          padding: '8px 12px',
          borderTop: '1px solid var(--color-border-thin)',
          background: 'var(--color-bg-subtle)',
          fontSize: 10.5,
          color: 'var(--color-text-tertiary)',
          flexWrap: 'wrap',
          position: maximized ? 'sticky' : undefined,
          bottom: 0,
          zIndex: maximized ? 40 : undefined,
          borderBottomLeftRadius: 'var(--radius)',
          borderBottomRightRadius: 'var(--radius)',
        }}
      >
        <GanttLegend color={GANTT_BAR_COLOR.PENDING} label="未开始" />
        <GanttLegend color={GANTT_BAR_COLOR.IN_PROGRESS} label="进行" />
        <GanttLegend color={GANTT_BAR_COLOR.COMPLETED} label="完成" />
        <GanttLegend color={GANTT_BAR_COLOR.DELAYED} label="延期" />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.3)' }} />
          法定节假日
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.3)' }} />
          <span style={{ color: '#10B981', fontWeight: 600 }}>▲</span>
          补班
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(156,163,175,0.10)', border: '1px solid rgba(156,163,175,0.3)' }} />
          周末
        </span>
      </div>

      </Section>
  )

  // 全屏最大化浮窗（fixed 覆盖整个视口 · 甘特图自带内部滚动）
  if (maximized) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          background: 'var(--color-surface)',
          padding: 16,
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 12,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: 'var(--color-text)',
            }}
          >
            项目甘特图（全屏）
          </div>
          {/* 关闭按钮已去掉（与「还原」重复）· 全屏时工具栏末尾的「还原」即可退出 */}
        </div>
        {sectionEl}
      </div>
    )
  }

  return sectionEl
}

/** 顶部模式切换按钮组（日/周/月）*/
function GanttModeSwitch({
  mode,
  onChange,
}: {
  mode: 'day' | 'week' | 'month'
  onChange: (m: 'day' | 'week' | 'month') => void
}) {
  const items: Array<{ key: typeof mode; label: string; test: string }> = [
    { key: 'day', label: '日', test: 'gantt-mode-day' },
    { key: 'week', label: '周', test: 'gantt-mode-week' },
    { key: 'month', label: '月', test: 'gantt-mode-month' },
  ]
  return (
    <div
      style={{
        display: 'inline-flex',
        border: '1px solid var(--color-border-thin)',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
      }}
    >
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          onClick={() => onChange(it.key)}
          data-testid={it.test}
          style={{
            border: 'none',
            background:
              mode === it.key ? 'var(--color-accent)' : 'transparent',
            color:
              mode === it.key
                ? 'var(--color-text-on-accent)'
                : 'var(--color-text-secondary)',
            padding: '4px 12px',
            fontSize: 11.5,
            fontWeight: mode === it.key ? 500 : 400,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {it.label}
        </button>
      ))}
    </div>
  )
}

/** 视图切换按钮组（父任务 / 全部）*/
function GanttViewSwitch({
  view,
  onChange,
}: {
  view: 'parent' | 'all'
  onChange: (v: 'parent' | 'all') => void
}) {
  const items: Array<{ key: typeof view; label: string; test: string }> = [
    { key: 'parent', label: '父任务', test: 'gantt-view-parent' },
    { key: 'all', label: '全部', test: 'gantt-view-all' },
  ]
  return (
    <div
      style={{
        display: 'inline-flex',
        border: '1px solid var(--color-border-thin)',
        borderRadius: 'var(--radius)',
        overflow: 'hidden',
      }}
    >
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          onClick={() => onChange(it.key)}
          data-testid={it.test}
          style={{
            border: 'none',
            background:
              view === it.key ? 'var(--color-accent)' : 'transparent',
            color:
              view === it.key
                ? 'var(--color-text-on-accent)'
                : 'var(--color-text-secondary)',
            padding: '4px 12px',
            fontSize: 11.5,
            fontWeight: view === it.key ? 500 : 400,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {it.label}
        </button>
      ))}
    </div>
  )
}

/** 图例小色块 */
function GanttLegend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span
        style={{
          width: 10,
          height: 10,
          borderRadius: 2,
          background: color,
        }}
      />
      {label}
    </span>
  )
}

/** 简易星期缩写 */
function getWeekdayShort(d: Date): string {
  return ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
}

/** ISO 周编号（粗略 · 1-53）*/
function getIsoWeek(d: Date): number {
  const target = new Date(d.valueOf())
  const dayNr = (d.getDay() + 6) % 7
  target.setDate(target.getDate() - dayNr + 3)
  const firstThursday = target.valueOf()
  target.setMonth(0, 1)
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7)
  }
  return 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000)
}

/** Task edit modal 行内表单状态 */
interface TaskFormState {
  task_name: string
  owner: string
  start_date: string
  end_date: string
  progress: number
}

function initialTaskFormState(
  task: ProjectTask | null,
  defaultStart: string,
  defaultEnd: string,
): TaskFormState {
  if (!task) {
    return {
      task_name: '',
      owner: '',
      start_date: defaultStart,
      end_date: defaultEnd,
      progress: 0,
    }
  }
  return {
    task_name: task.task_name,
    owner: task.owner ?? '',
    start_date: task.start_date ?? defaultStart,
    end_date: task.end_date ?? defaultEnd,
    progress: task.progress,
  }
}

/** Task edit modal（create / edit 复用 · 按 §5 spec · 弹 createProjectTask/updateProjectTask）
 * 维护者 2026-08-26 V2：create 模式支持「保存并新增」连续新增 · 不关 modal · 清空表单（保留 owner）
 *                  + 「保存并关闭」主动关闭
 *                  edit 模式仅 1 个「保存」按钮 · 保存后关闭
 * 新增 props：onCloseRequested（X / Esc / 遮罩点击）· error（父级错误展示）
 */
function TaskEditModal({
  mode,
  task,
  parentId,
  defaultStartDate,
  defaultEndDate,
  busy,
  error,
  onSave,
  onCancel,
  onCloseRequested,
  phaseOnly,
}: {
  mode: 'create' | 'edit'
  task: ProjectTask | null
  parentId: number | null
  defaultStartDate: string
  defaultEndDate: string
  busy: boolean
  error?: string | null
  onSave: (
    form: TaskFormState,
    opts?: { closeAfter: boolean },
  ) => void | Promise<void>
  onCancel: () => void
  /** 主动关闭（X / Esc / 遮罩点击）· 编辑模式保存按钮也会调它 */
  onCloseRequested?: () => void
  /** 阶段（父任务）编辑：仅允许改名称/负责人 · 日期/进度/工时由子任务自动计算 */
  phaseOnly?: boolean
}) {
  const [form, setForm] = useState<TaskFormState>(() =>
    initialTaskFormState(task, defaultStartDate, defaultEndDate),
  )
  /** 「已新增任务」瞬时提示（create 模式 · 保存并新增成功后展示 2s）*/
  const [justAdded, setJustAdded] = useState(false)
  const update = <K extends keyof TaskFormState>(
    key: K,
    value: TaskFormState[K],
  ) => setForm((prev) => ({ ...prev, [key]: value }))
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '5px 8px',
    border: '1px solid var(--color-border-thin)',
    borderRadius: 'var(--radius)',
    background: 'var(--color-bg)',
    fontSize: 12,
    color: 'var(--color-text)',
    fontFamily: 'inherit',
  }
  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    color: 'var(--color-text-tertiary)',
    marginBottom: 3,
  }
  const readonlyValueStyle: React.CSSProperties = {
    width: '100%',
    padding: '5px 8px',
    border: '1px dashed var(--color-border-thin)',
    borderRadius: 4,
    background: 'var(--color-bg-subtle)',
    color: 'var(--color-text-secondary)',
    fontSize: 12,
    minHeight: 30,
    display: 'flex',
    alignItems: 'center',
    fontFamily: 'var(--font-mono)',
  }

  /** 主动关闭：X / Esc / 遮罩点击 · 不区分 mode */
  const handleActiveClose = () => {
    if (busy) return
    if (onCloseRequested) onCloseRequested()
    else onCancel()
  }

  /** create 模式 · 「保存并新增」：调 onSave(closeAfter=false) · 清空表单（保留 owner）· 弹瞬时提示 */
  const handleSaveAndContinue = async () => {
    if (busy || !form.task_name.trim()) return
    // fire-and-forget：父级不抛错 · 错误由 error prop 展示
    void onSave(form, { closeAfter: false })
    setForm({
      task_name: '',
      owner: form.owner, // 保留：方便连续加任务时复用同一个负责人
      start_date: defaultStartDate,
      end_date: defaultEndDate,
      progress: 0,
    })
    setJustAdded(true)
    setTimeout(() => setJustAdded(false), 2000)
  }

  /** create 模式 · 「保存并关闭」· 调 onSave(closeAfter=true) · 调 onCloseRequested */
  const handleSaveAndClose = () => {
    if (busy || !form.task_name.trim()) return
    void onSave(form, { closeAfter: true })
    if (onCloseRequested) onCloseRequested()
  }

  /** edit 模式 · 「保存」 · 调 onSave(closeAfter=true) · 调 onCloseRequested */
  const handleSaveEdit = () => {
    if (busy || !form.task_name.trim()) return
    void onSave(form, { closeAfter: true })
    if (onCloseRequested) onCloseRequested()
  }

  const inputDisabled = busy || !form.task_name.trim()
  const primaryOpacity = inputDisabled ? 0.5 : 1
  const primaryCursor = inputDisabled ? 'not-allowed' : 'pointer'

  return (
    <div style={confirmOverlayStyle} onClick={handleActiveClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ ...confirmBoxStyle, width: '480px' }}
      >
        <h3 style={confirmTitleStyle}>
          {mode === 'create' ? '新增任务' : '编辑任务'}
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <div style={labelStyle}>任务名称 *</div>
            <input
              value={form.task_name}
              onChange={(e) => update('task_name', e.target.value)}
              disabled={busy}
              placeholder="输入任务名称"
              style={inputStyle}
            />
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <div style={{ flex: 1 }}>
              <div style={labelStyle}>开始日期</div>
              {phaseOnly ? (
                <div style={readonlyValueStyle}>
                  {form.start_date || '—'}
                  {form.start_date && <span style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', marginLeft: 4 }}>由子任务自动计算</span>}
                </div>
              ) : (
                <input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => update('start_date', e.target.value)}
                  disabled={busy}
                  style={inputStyle}
                />
              )}
            </div>
            <div style={{ flex: 1 }}>
              <div style={labelStyle}>结束日期</div>
              {phaseOnly ? (
                <div style={readonlyValueStyle}>
                  {form.end_date || '—'}
                  {form.end_date && <span style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', marginLeft: 4 }}>由子任务自动计算</span>}
                </div>
              ) : (
                <input
                  type="date"
                  value={form.end_date}
                  onChange={(e) => update('end_date', e.target.value)}
                  disabled={busy}
                  style={inputStyle}
                />
              )}
            </div>
          </div>
          {!phaseOnly ? (
            <>
              <div>
                <div style={labelStyle}>负责人</div>
                <input
                  value={form.owner}
                  onChange={(e) => update('owner', e.target.value)}
                  disabled={busy}
                  placeholder="输入负责人"
                  style={inputStyle}
                />
              </div>
              <div>
                <div style={labelStyle}>完成度（%）</div>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={form.progress}
                  onChange={(e) => update('progress', Number(e.target.value) || 0)}
                  disabled={busy}
                  style={inputStyle}
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <div style={labelStyle}>负责人</div>
                <div style={readonlyValueStyle}>{form.owner || '—'}</div>
              </div>
              <div>
                <div style={labelStyle}>完成度（%）</div>
                <div style={readonlyValueStyle}>
                  {form.progress}% · 由子任务自动计算
                </div>
              </div>
            </>
          )}
        </div>

        <div style={confirmFooterStyle}>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            style={ghostBtnStyle}
          >
            取消
          </button>
          {mode === 'edit' ? (
            <button
              type="button"
              onClick={handleSaveEdit}
              disabled={inputDisabled}
              style={{
                ...primaryBtnStyle,
                opacity: primaryOpacity,
                cursor: primaryCursor,
              }}
            >
              {busy ? '保存中…' : '保存'}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={handleSaveAndClose}
                disabled={inputDisabled}
                style={ghostBtnStyle}
              >
                {busy ? '保存中…' : '保存并关闭'}
              </button>
              <button
                type="button"
                onClick={handleSaveAndContinue}
                disabled={inputDisabled}
                style={{
                  ...primaryBtnStyle,
                  opacity: primaryOpacity,
                  cursor: primaryCursor,
                }}
              >
                {busy ? '保存中…' : '保存并新增'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/** Task delete confirm（按 §5 spec · 弹 deleteProjectTask）*/
function TaskDeleteConfirm({
  task,
  busy,
  onConfirm,
  onCancel,
}: {
  task: ProjectTask
  busy: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div style={confirmOverlayStyle} onClick={() => !busy && onCancel()}>
      <div onClick={(e) => e.stopPropagation()} style={confirmBoxStyle}>
        <h3 style={confirmTitleStyle}>删除任务</h3>
        <p style={confirmDescStyle}>
          确定要删除「{task.task_name}」？若为父任务，子任务也会被删除。该操作不可撤销。
        </p>
        <div style={confirmFooterStyle}>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            style={ghostBtnStyle}
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            style={dangerBtnStyle}
          >
            {busy ? '处理中…' : '确认删除'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ProjectOverviewPanel({ data, onRefresh }: { data: ProjectDetailData; onRefresh: () => Promise<void> }) {
  const [collapsed, setCollapsed] = useState(false)
  const [savingField, setSavingField] = useState<string | null>(null)
  const { project } = data
  // 关键注意事项：拉 OPEN 状态 + HIGH/CRITICAL 级别的问题
  const keyIssues = data.issues.filter(
    (i) => i.status === 'OPEN' && (i.level === 'CRITICAL' || i.level === 'HIGH'),
  )

  /** 项目概况行内编辑保存（任意字段） */
  const saveProjectField = async (
    field:
      | 'projectName' | 'customerName' | 'owner' | 'contractAmount'
      | 'status' | 'background' | 'objective' | 'scope',
    value: string,
  ) => {
    setSavingField(field)
    try {
      const patch: Record<string, string | number | null> = {}
      if (field === 'contractAmount') {
        const num = Number(value.replace(/[¥,，\s]/g, ''))
        patch.contractAmount = isFinite(num) && num > 0 ? num : null
      } else if (field === 'projectName') {
        patch.projectName = value
      } else if (field === 'customerName') {
        patch.customerName = value || null
      } else if (field === 'owner') {
        patch.owner = value || null
      } else if (field === 'background') {
        patch.background = value || null
      } else if (field === 'objective') {
        patch.objective = value || null
      } else if (field === 'scope') {
        patch.scope = value || null
      } else if (field === 'status') {
        patch.status = value as 'START' | 'PLANNING' | 'EXECUTING' | 'MONITORING' | 'CLOSING'
      }
      await updateProject(project.id, patch)
      await onRefresh()
      toast.success('项目概况已保存')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error('保存失败', msg)
    } finally {
      setSavingField(null)
    }
  }

  return (
    <div
      data-testid="project-overview-panel"
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border-thin)',
        borderRadius: 12,
        overflow: 'hidden',
        marginBottom: 16,
      }}
    >
      {/* 标题栏（可点击折叠） */}
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        data-testid="project-overview-toggle"
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '12px 16px',
          background: 'transparent',
          border: 'none',
          borderBottom: collapsed ? 'none' : '1px solid var(--color-border-thin)',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <StickyNote size={14} strokeWidth={1.75} color="var(--color-accent)" />
        <span
          style={{
            fontSize: '14px',
            fontWeight: 600,
            color: 'var(--color-text)',
            flex: 1,
          }}
        >
          项目概况
        </span>
        <span
          style={{
            fontSize: '11px',
            color: 'var(--color-text-tertiary)',
            marginRight: 6,
          }}
        >
          {collapsed ? '展开' : '折叠'}
        </span>
        <ChevronUp
          size={14}
          strokeWidth={1.75}
          color="var(--color-text-tertiary)"
          style={{
            transform: collapsed ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
          }}
        />
      </button>

      {/* 内容（折叠时隐藏）· 完全照搬 ProjectOverviewEditModal 字段：项目名称/客户/项目负责人/合同金额/项目背景/项目目标/项目范围 */}
      {!collapsed && (
        <div
          style={{
            padding: '14px 16px 16px',
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 16,
            alignItems: 'start',
          }}
        >
          {/* 项目名称（必填）· 横跨两列 */}
          <div>
            <Label>项目名称 *</Label>
            <InlineEditableCell
              value={project.project_name}
              busy={savingField === 'projectName'}
              placeholder="项目名称"
              onCommit={(v) => saveProjectField('projectName', v)}
            />
          </div>
          {/* 项目状态（五态 · 启动/规划/执行/监控/收尾）*/}
          <div><Label>项目状态</Label>
            <select
              value={project.status}
              onChange={(e) => saveProjectField('status', e.target.value)}
              data-testid="project-status-select"
              style={{ width: '100%', padding: '6px 6px', border: '1px solid var(--color-border-thin)', borderRadius: 'var(--radius)', background: 'var(--color-bg)', color: 'var(--color-text)', fontFamily: 'inherit' }}
            >
              <option value="START">启动</option>
              <option value="PLANNING">规划</option>
              <option value="EXECUTING">执行</option>
              <option value="MONITORING">监控</option>
              <option value="CLOSING">收尾</option>
            </select>
          </div>
          {/* 客户 */}
          <div>
            <Label>客户</Label>
            <InlineEditableCell
              value={project.customer_name ?? ''}
              placeholder="客户名称"
              busy={savingField === 'customerName'}
              onCommit={(v) => saveProjectField('customerName', v)}
            />
          </div>
          {/* 项目负责人 */}
          <div>
            <Label>项目负责人</Label>
            <InlineEditableCell
              value={project.owner ?? ''}
              placeholder="项目负责人"
              busy={savingField === 'owner'}
              onCommit={(v) => saveProjectField('owner', v)}
            />
          </div>
          {/* 合同金额（元）· 横跨两列 */}
          <div>
            <Label>合同金额（元）</Label>
            <InlineEditableCell
              value={project.contract_amount ? `¥${project.contract_amount.toLocaleString()}` : ''}
              placeholder="合同金额（数字）"
              busy={savingField === 'contractAmount'}
              onCommit={(v) => saveProjectField('contractAmount', v)}
            />
          </div>
          {/* 项目背景 */}
          <div>
            <Label>项目背景</Label>
            <InlineEditableCell
              value={project.background ?? ''}
              multiline
              busy={savingField === 'background'}
              placeholder="项目的起因 / 客户为什么需要 / 商业背景"
              onCommit={(v) => saveProjectField('background', v)}
            />
          </div>
          {/* 项目目标 */}
          <div>
            <Label>项目目标</Label>
            <InlineEditableCell
              value={project.objective ?? ''}
              multiline
              busy={savingField === 'objective'}
              placeholder="衡量成功的关键指标 / 客户期望达成什么"
              onCommit={(v) => saveProjectField('objective', v)}
            />
          </div>
          {/* 项目范围 · 横跨两列 */}
          <div>
            <Label>项目范围</Label>
            <InlineEditableCell
              value={project.scope ?? ''}
              multiline
              busy={savingField === 'scope'}
              placeholder="项目包含哪些工作 / 不包含什么"
              onCommit={(v) => saveProjectField('scope', v)}
            />
          </div>
        </div>
      )}
    </div>
  )
}

/** 4 列横排的文本列（项目背景 / 项目目标 / 项目范围） */
function OverviewColumn({
  label,
  text,
}: {
  label: string
  text?: string | null
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <Label>{label}</Label>
      <p
        style={{
          fontSize: '12.5px',
          color: text
            ? 'var(--color-text-secondary)'
            : 'var(--color-text-tertiary)',
          margin: 0,
          lineHeight: 1.6,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {text || '（未填写）'}
      </p>
    </div>
  )
}

/** 项目概况可编辑列（多行文本 + 加载状态） */
function OverviewEditableColumn({
  label,
  text,
  busy,
  onCommit,
}: {
  label: string
  text?: string | null
  busy?: boolean
  onCommit: (value: string) => void | Promise<void>
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <Label>{label}</Label>
      <div
        style={{
          fontSize: '12.5px',
          color: text
            ? 'var(--color-text-secondary)'
            : 'var(--color-text-tertiary)',
          lineHeight: 1.6,
        }}
      >
        <InlineEditableCell
          value={text ?? ''}
          multiline
          busy={busy}
          placeholder={`点击编辑${label}…`}
          onCommit={onCommit}
        />
      </div>
    </div>
  )
}

// ============================================================
// 整体计划 · 右：任务总览（Excel 风格「大阶段 → 阶段明细」）
// ============================================================

/**
 * 任务计划面板（TaskPlanPanel）· Excel 风格
 * 维护者 2026-08-26 V2 spec：
 *  - 父任务（parent_id === null）= 大阶段卡
 *  - 子任务（parent_id !== null）= 阶段明细行
 *  - 大阶段：序号 + 阶段名 + 整体进度条 + 总状态徽章 + 折叠按钮
 *  - 子任务：缩进 16px · 8 列（编号 / 任务 / 负责人 / 起 / 止 / 工时 / 完成率 / 状态）
 *  - 默认所有大阶段展开 · 可单独折叠
 *
 * 顶部工具栏（4 按钮 · 右对齐 · ghost 风格）：
 *  - [下载模板] downloadProjectTemplate()
 *  - [导出 Excel] exportProjectsToExcel(data.tasks) + triggerDownload
 *  - [导入] 隐藏 input + parseProjectsExcel + confirm modal + 循环 createProjectTask
 *  - [新增父任务] 弹 TaskEditModal（mode='create' · parent_id=null）
 *
 * 大阶段行内「新增子任务」按钮 → 弹 TaskEditModal（mode='create' · parent_id=parent.id）
 */
function TaskPlanPanel({
  projectId,
  data,
  onRefresh,
}: {
  projectId: number
  data: ProjectDetailData
  onRefresh: () => Promise<void>
}) {
  // 父任务：parent_id === null · 按 sort_order 排
  const parentTasks = data.tasks
    .filter((t) => t.parent_id === null)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))

  // 全深度任务树：任意层级（父/子/孙…）都能按 parent_id 找到其子级，供阶段明细递归渲染（4.1.1 这类孙级不再被隐藏）
  const taskTree = useMemo(() => {
    const m = new Map<number | null, ProjectTask[]>()
    for (const t of data.tasks) {
      const k = t.parent_id ?? null
      const a = m.get(k) ?? []
      a.push(t)
      m.set(k, a)
    }
    for (const list of m.values()) list.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    return m
  }, [data.tasks])

  // 默认全展开（折叠集合为空即展开）
  const [collapsedIds, setCollapsedIds] = useState<Set<number>>(() => new Set())

  // ----- 任务编辑 modal 状态（create/edit 复用 TaskEditModal）-----
  const [adding, setAdding] = useState<{ parentId: number | null } | null>(null)
  const [editingTask, setEditingTask] = useState<ProjectTask | null>(null)
  // 维护者 2026-08-27：任务删除确认（Tauri webview 无 window.confirm · 弹 TaskDeleteConfirm）
  const [deleteTarget, setDeleteTarget] = useState<ProjectTask | null>(null)

  // ----- Excel 导入状态 -----
  const [importConfirm, setImportConfirm] = useState<ProjectTask[] | null>(null)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [overwritePrompt, setOverwritePrompt] = useState<{ existing: number; imported: number } | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // ----- 通用 -----
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 维护者 2026-08-27：任务概览最大化/还原
  const [maximized, setMaximized] = useState(false)

  const toggleCollapse = (id: number) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ----- 顶部工具栏 · handlers -----
  const handleDownloadTemplate = async () => {
    try {
      const ok = await downloadProjectTemplate()
      if (ok) toast.success('模板已下载', '项目管理实施计划模板.xlsx')
      else toast.error('模板下载失败', '请检查应用日志')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error('下载模板失败', msg)
      setError(msg)
    }
  }

  const handleExportExcel = async () => {
    setBusy(true)
    setError(null)
    try {
      const blob = await exportProjectsToExcel(data.tasks)
      const ts = todayLocal()
      const filename = `项目管理-${data.project.project_name}-${ts}.xlsx`
      const ok = await saveBlobToDirectory(blob, filename)
      if (ok) toast.success(`已导出 ${data.tasks.length} 条任务`, filename)
      else toast.error('导出 Excel 失败', '浏览器拦截了下载，请检查 WebView 设置')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
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

  /** 解析失败时把 sheet 缺失的报错改成更友好的文案 */
  const rewriteImportError = (raw: string): string => {
    if (raw.includes('Sheet "项目管理" 不存在')) {
      return '请使用包含『项目管理』sheet 的 Excel 模板（可点击下载模板获取）'
    }
    return raw
  }

  const handleImportFile = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0]
    if (e.target) e.target.value = ''
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const parsed = await parseProjectsExcel(file, projectId)
      if (parsed.length === 0) {
        setError('Excel 中没有可导入的任务行（请检查 sheet『项目管理』列头与序号）')
        return
      }
      setImportFile(file)
      setImportConfirm(parsed)
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err)
      setError(rewriteImportError(raw))
    } finally {
      setBusy(false)
    }
  }

  const handleImportConfirm = async () => {
    if (!importConfirm || busy) return
    const existing = data.tasks.length
    if (existing > 0) {
      // 弹 modal 上的覆盖确认（不进 native confirm 否则被遮）
      setOverwritePrompt({ existing, imported: importConfirm.length })
      return
    }
    await executeImport(false, 0)
  }

  const executeImport = async (overwrite: boolean, existing: number) => {
    if (!importConfirm || busy) return
    setBusy(true)
    setError(null)
    setOverwritePrompt(null)
    try {
      if (overwrite && existing > 0) {
        for (const t of data.tasks) {
          await deleteProjectTask(t.id)
        }
      }
      const importedCount = importConfirm.length
      // 2026-09-08 改：单次批量事务导入（父先落库→子映射真实 id→全成 COMMIT / 任一失败整批 ROLLBACK）
      // 根治「提示成功32条、重启后只落6条（阶段2-4丢失）」
      const realIds = await importProjectTasksBulk(projectId, importConfirm)
      console.log('[IMPORT_BULK] imported', realIds.length, 'ids')
      setImportConfirm(null)
      setImportFile(null)
      await onRefresh()
      toast.success(
        `成功导入 ${importedCount} 条任务`,
        existing > 0 ? `覆盖了原 ${existing} 条` : undefined,
      )
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error('导入失败', msg)
      setError(msg)
    } finally {
      setBusy(false)
    }
  }

  const handleImportCancel = () => {
    if (busy) return
    setImportConfirm(null)
    setImportFile(null)
  }

  // ----- TaskEditModal · 任务保存 -----
  /** naturalDays · 工作日 · 状态推导（与 GanttTab.handleSave 一致）*/
  const diffDays = (a: string, b: string): number => {
    const ms =
      new Date(a + 'T00:00:00').getTime() -
      new Date(b + 'T00:00:00').getTime()
    return Math.round(ms / 86400000)
  }
  const naturalDays = (start: string, end: string): number =>
    diffDays(end, start) + 1

  const handleTaskSave = async (
    form: TaskFormState,
    opts?: { closeAfter: boolean },
  ) => {
    setBusy(true)
    setError(null)
    try {
      const nd =
        form.start_date && form.end_date
          ? naturalDays(form.start_date, form.end_date)
          : 0
      const status: ProjectTask['status'] =
        form.progress >= 100
          ? 'COMPLETED'
          : form.progress > 0
            ? 'IN_PROGRESS'
            : 'PENDING'
      if (editingTask) {
        // 阶段（父任务）编辑：日期/进度/工时由子任务自动计算 · 只保存名称/负责人
        if (editingTask.parent_id === null) {
          const childTasks = data.tasks.filter((t) => t.parent_id === editingTask.id)
          const starts = childTasks.map((t) => t.start_date).filter(Boolean) as string[]
          const ends = childTasks.map((t) => t.end_date).filter(Boolean) as string[]
          const phaseStart = starts.length ? starts.sort()[0] : null
          const phaseEnd = ends.length ? ends.sort().reverse()[0] : null
          const done = childTasks.filter((t) => t.status === 'COMPLETED' || t.progress >= 100).length
          const total = childTasks.length
          const phaseProgress = total > 0 ? Math.round((done / total) * 100) : 0
          const phaseNd = phaseStart && phaseEnd ? naturalDays(phaseStart, phaseEnd) : 0
          const phaseStatus: ProjectTask['status'] =
            phaseProgress >= 100
              ? 'COMPLETED'
              : phaseProgress > 0
                ? 'IN_PROGRESS'
                : 'PENDING'
          await updateProjectTask(editingTask.id, {
            task_name: form.task_name.trim(),
            owner: form.owner.trim() || null,
            start_date: phaseStart,
            end_date: phaseEnd,
            natural_days: phaseNd,
            progress: phaseProgress,
            status: phaseStatus,
          })
        } else {
          await updateProjectTask(editingTask.id, {
            task_name: form.task_name.trim(),
            owner: form.owner.trim() || null,
            start_date: form.start_date || null,
            end_date: form.end_date || null,
            natural_days: nd,
            progress: form.progress,
            status,
          })
        }
      } else if (adding) {
        await createProjectTask({
          project_id: projectId,
          parent_id: adding.parentId,
          task_name: form.task_name.trim(),
          owner: form.owner.trim() || null,
          start_date: form.start_date || null,
          end_date: form.end_date || null,
          work_days: nd,
          natural_days: nd,
          progress: form.progress,
          status,
          sort_order: 0,
        })
      }
      await onRefresh()
      // closeAfter=false 表示「保存并新增」· modal 会自己清表单 · 这里不动 modal state
      // closeAfter=true / 编辑模式 · 关 modal
      if (opts?.closeAfter || editingTask) {
        setAdding(null)
        setEditingTask(null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const handleAddParent = () => {
    setEditingTask(null)
    setAdding({ parentId: null })
  }

  const handleAddChild = (parentId: number) => {
    setEditingTask(null)
    setAdding({ parentId })
  }

  const handleEditTask = (task: ProjectTask) => {
    setAdding(null)
    setEditingTask(task)
  }

  const handleDelete = async (id: number) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      // 级联：先删子任务，再删本任务（Rust delete_with_children 也兜底）
      const children = data.tasks.filter((t) => t.parent_id === id)
      await deleteProjectTask(id)
      await onRefresh()
      toast.success(children.length > 0 ? `已删除任务及其 ${children.length} 条子任务` : '任务已删除')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error('删除任务失败', msg)
      setError(msg)
    } finally {
      setBusy(false)
    }
  }

  /** TaskEditModal 主动关闭（X / Esc / 遮罩 · 或「保存并关闭」） */
  const handleTaskModalCloseRequested = () => {
    setAdding(null)
    setEditingTask(null)
  }

  // 默认日期范围（项目范围 · 退化到今天）
  const defaultStart =
    data.project.start_date || data.tasks.find((t) => t.start_date)?.start_date || todayLocal()
  const defaultEnd =
    data.project.end_date ||
    [...data.tasks].reverse().find((t) => t.end_date)?.end_date ||
    todayLocal()

  const showTopError =
    error !== null && adding === null && editingTask === null && importConfirm === null

  return (
    <div
      data-testid="task-plan-panel"
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border-thin)',
        borderRadius: 12,
        overflow: 'auto',
        height: maximized ? '92vh' : undefined,
        position: maximized ? 'fixed' : undefined,
        inset: maximized ? '2vh 1vw' : undefined,
        zIndex: maximized ? 999 : undefined,
        boxShadow: maximized ? '0 16px 48px rgba(0,0,0,0.3)' : undefined,
      }}
    >
      {/* 顶部工具栏：标题 + 4 按钮（右对齐 · ghost · gap 8px） */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '12px 16px',
          borderBottom: '1px solid var(--color-border-thin)',
          flexWrap: 'wrap',
        }}
      >
        <h3
          style={{
            fontSize: '13.5px',
            fontWeight: 600,
            color: 'var(--color-text)',
            margin: 0,
            flex: 1,
            minWidth: 0,
          }}
        >
          任务概览（共 {parentTasks.length} 个阶段）
        </h3>
        <button
          type="button"
          onClick={() => setMaximized((m) => !m)}
          title={maximized ? '还原' : '最大化'}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            padding: '6px 6px',
            border: '1px solid var(--color-border-thin)',
            background: 'var(--color-bg-subtle)',
            color: 'var(--color-text-secondary)',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: '12.5px',
            flexShrink: 0,
          }}
        >
          {maximized ? <Minimize size={12} /> : <Maximize size={12} />}
          {maximized ? '还原' : '最大化'}
        </button>
        <button
          type="button"
          onClick={handleDownloadTemplate}
          disabled={busy}
          data-testid="task-plan-download-template"
          style={ghostBtnStyle}
          title="下载项目管理 Excel 模板"
        >
          <Download size={11} />
          下载模板
        </button>
        <button
          type="button"
          onClick={() => void handleExportExcel()}
          disabled={busy}
          data-testid="task-plan-export-excel"
          style={ghostBtnStyle}
          title="导出当前项目全部任务为 Excel"
        >
          <Upload size={11} />
          导出 Excel
        </button>
        <button
          type="button"
          onClick={handleImportClick}
          disabled={busy}
          data-testid="task-plan-import"
          style={ghostBtnStyle}
          title="从 Excel 导入任务（追加到当前项目）"
        >
          <Upload size={11} />
          导入
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          data-testid="task-plan-import-input"
          style={{ display: 'none' }}
          onChange={handleImportFile}
        />
        <button
          type="button"
          onClick={handleAddParent}
          disabled={busy}
          data-testid="task-plan-add-parent"
          style={ghostBtnStyle}
          title="新增顶层父任务"
        >
          <Plus size={11} />
          新增父任务
        </button>
      </div>

      {/* 顶部错误条（modal/confirm 打开时不显示，避免被遮挡） */}
      {showTopError && (
        <div
          style={{
            margin: '10px 16px 0',
            padding: '8px 12px',
            borderRadius: 'var(--radius)',
            background: 'rgba(239,68,68,0.08)',
            color: 'var(--color-status-danger)',
            fontSize: 12,
          }}
        >
          {error}
        </div>
      )}

      {/* 大阶段列表 */}
      <div data-testid="parent-tasks-list">
        {parentTasks.length === 0 ? (
          <div
            style={{
              padding: '32px 16px',
              textAlign: 'center',
              fontSize: '12.5px',
              color: 'var(--color-text-tertiary)',
            }}
          >
            暂无父任务
          </div>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {parentTasks.map((pt, idx) => {
              const childTasks = data.tasks
                .filter((t) => t.parent_id === pt.id)
                .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
              return (
                <ParentTaskRow
                  key={pt.id}
                  index={idx + 1}
                  parent={pt}
                  children={childTasks}
                  tree={taskTree}
                  collapsed={collapsedIds.has(pt.id)}
                  onToggle={() => toggleCollapse(pt.id)}
                  onAddChild={() => handleAddChild(pt.id)}
                  onEdit={() => handleEditTask(pt)}
                  onDelete={() => setDeleteTarget(pt)}
                  onEditChild={(c) => handleEditTask(c)}
                  onDeleteChild={(c) => setDeleteTarget(c)}
                  onRefresh={onRefresh}
                />
              )
            })}
          </ul>
        )}
      </div>

      {/* TaskEditModal · create 模式（新增父 / 新增子）*/}
      {adding && (
        <TaskEditModal
          mode="create"
          task={null}
          parentId={adding.parentId}
          defaultStartDate={defaultStart}
          defaultEndDate={defaultEnd}
          busy={busy}
          error={error}
          onSave={handleTaskSave}
          onCancel={handleTaskModalCloseRequested}
          onCloseRequested={handleTaskModalCloseRequested}
        />
      )}

      {/* TaskEditModal · edit 模式 */}
      {editingTask && (
        <TaskEditModal
          mode="edit"
          task={editingTask}
          parentId={editingTask.parent_id}
          defaultStartDate={editingTask.start_date ?? defaultStart}
          defaultEndDate={editingTask.end_date ?? defaultEnd}
          busy={busy}
          error={error}
          onSave={handleTaskSave}
          onCancel={handleTaskModalCloseRequested}
          onCloseRequested={handleTaskModalCloseRequested}
          phaseOnly={editingTask.parent_id === null}
        />
      )}

      {/* 删除任务确认（维护者 2026-08-27 · 替换不可用的 window.confirm）*/}
      {deleteTarget && (
        <TaskDeleteConfirm
          task={deleteTarget}
          busy={busy}
          onConfirm={() => {
            const t = deleteTarget
            setDeleteTarget(null)
            void handleDelete(t.id)
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* 导入确认 modal · 预览前 50 条 + 确认按钮 */}
      {importConfirm !== null && (
        <div
          style={confirmOverlayStyle}
          onClick={handleImportCancel}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              ...confirmBoxStyle,
              width: '480px',
              maxHeight: '80vh',
              overflowY: 'auto',
            }}
          >
            <h3 style={confirmTitleStyle}>导入项目任务</h3>
            <p style={confirmDescStyle}>
              从 <code>{importFile?.name ?? ''}</code> 解析到{' '}
              {importConfirm.length} 条任务（含父子层级），是否追加到当前项目？
            </p>
            <ul
              style={{
                margin: '0 0 16px',
                padding: 0,
                listStyle: 'none',
                maxHeight: '260px',
                overflowY: 'auto',
                border: '1px solid var(--color-border-thin)',
                borderRadius: 'var(--radius)',
              }}
            >
              {importConfirm.slice(0, 50).map((t, idx) => (
                <li
                  key={idx}
                  style={{
                    padding: '6px 6px',
                    borderBottom: '1px solid var(--color-border-thin)',
                    fontSize: 12,
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  {idx + 1}.{' '}
                  {t.parent_id === null
                    ? `[父] ${t.task_name}`
                    : `[子/${t.parent_id}] ${t.task_name}`}
                  {t.owner ? ` · ${t.owner}` : ''}
                </li>
              ))}
              {importConfirm.length > 50 && (
                <li
                  style={{
                    padding: '6px 6px',
                    fontSize: 11,
                    color: 'var(--color-text-tertiary)',
                  }}
                >
                  ... 共 {importConfirm.length} 条
                </li>
              )}
            </ul>
            {error && <div style={confirmErrorStyle}>{error}</div>}
            {overwritePrompt && (
              <div
                style={{
                  margin: '0 0 12px',
                  padding: '12px 14px',
                  background: 'rgba(245, 158, 11, 0.08)',
                  border: '1px solid rgba(245, 158, 11, 0.35)',
                  borderRadius: 8,
                  fontSize: 12.5,
                  color: 'var(--color-text)',
                  lineHeight: 1.55,
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--color-status-warning)' }}>
                  ⚠ 当前项目已有 {overwritePrompt.existing} 条任务数据
                </div>
                <div>
                  确认覆盖将<b>先清空这 {overwritePrompt.existing} 条</b>，再写入 Excel 中的 {overwritePrompt.imported} 条。
                  清空后无法恢复，请确认。
                </div>
              </div>
            )}
            <div style={confirmFooterStyle}>
              <button
                type="button"
                onClick={handleImportCancel}
                disabled={busy}
                style={ghostBtnStyle}
              >
                取消
              </button>
              {overwritePrompt ? (
                <>
                  <button
                    type="button"
                    onClick={() => setOverwritePrompt(null)}
                    disabled={busy}
                    style={ghostBtnStyle}
                  >
                    返回
                  </button>
                  <button
                    type="button"
                    onClick={() => void executeImport(false, overwritePrompt.existing)}
                    disabled={busy}
                    style={ghostBtnStyle}
                  >
                    追加（不清空）
                  </button>
                  <button
                    type="button"
                    onClick={() => void executeImport(true, overwritePrompt.existing)}
                    disabled={busy}
                    style={dangerBtnStyle}
                  >
                    {busy ? '导入中…' : `覆盖导入 ${overwritePrompt.imported} 条`}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleImportConfirm()}
                  disabled={busy}
                  style={primaryBtnStyle}
                >
                  {busy ? '导入中…' : `确认导入 ${importConfirm.length} 条`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** 大阶段卡 · 维护者 2026-08-26 Excel 风格
 *  - 粗体 · 浅蓝底 · 序号 + 阶段名 + 进度条 + 状态徽章 + 折叠按钮
 *  - 展开时下方渲染子任务明细（8 列表格）
 *  - 行尾 [+] 新增子任务 · [编辑] 编辑父任务
 */
/**
 * 模块级 NETWORKDAYS（排除周末 + 法定节假日）
 * 用于行内编辑子任务时自动算工作日工时
 */
function networkdaysPublic(start: string, end: string): number {
  if (!start || !end) return 0
  let count = 0
  const cur = new Date(start + 'T00:00:00')
  const endD = new Date(end + 'T00:00:00')
  while (cur <= endD) {
    const ds = formatLocalDate(cur)
    const day = cur.getDay()
    if (day !== 0 && day !== 6 && !defaultHolidayProvider.isHoliday(ds)) count++
    cur.setDate(cur.getDate() + 1)
  }
  return count
}

function ParentTaskRow({
  index,
  parent,
  children,
  tree,
  collapsed,
  onToggle,
  onAddChild,
  onEdit,
  onDelete,
  onEditChild,
  onDeleteChild,
  onRefresh,
}: {
  index: number
  parent: ProjectTask
  children: ProjectTask[]
  tree: Map<number | null, ProjectTask[]>
  collapsed: boolean
  onToggle: () => void
  onAddChild: () => void
  onEdit: () => void
  onDelete: () => void
  onEditChild: (child: ProjectTask) => void
  onDeleteChild: (child: ProjectTask) => void
  onRefresh: () => Promise<void>
}) {
  const completed = children.filter((t) => t.status === 'COMPLETED').length
  const total = children.length
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0
  // 进度条颜色：100% 绿 · 1-99% 橙 · 0% 灰
  const accentColor =
    pct === 100
      ? 'var(--color-status-success)'
      : pct > 0
        ? 'var(--color-status-warning)'
        : 'var(--color-text-tertiary)'
  const statusLabel = pct === 100 ? '完成' : pct > 0 ? '进行' : '未开始'
  const hasChildren = children.length > 0

  // 递归渲染阶段明细：任意层级（4.1 → 4.1.1）都按 parent_id 子树继续下钻，序号按层级拼接（prefix.序号）
  const renderLevel = (levelTasks: ProjectTask[], prefix: string, depth: number): React.ReactNode[] =>
    levelTasks.map((c, k) => {
      const seq = `${prefix}${k + 1}`
      const grandkids = tree.get(c.id) ?? []
      const isSubParent = grandkids.length > 0
      return (
        <Fragment key={c.id}>
          <tr
            data-testid={`child-task-row-${c.id}`}
            style={isSubParent ? { background: 'rgba(59,130,246,0.05)' } : undefined}
          >
            <td
              style={{
                ...taskPlanTdStyle('80px', 'mono'),
                whiteSpace: 'nowrap',
                paddingLeft: depth > 0 ? 10 + (depth - 1) * 6 : 6,
                color: depth > 0 ? 'var(--color-text-secondary)' : undefined,
              }}
            >
              {seq}
            </td>
            <td style={taskPlanTdStyle()}>
              <InlineEditableCell
                value={c.task_name}
                placeholder="任务名称"
                onCommit={(v) => saveChildCell(c, { task_name: v })}
              />
            </td>
            <td style={taskPlanTdStyle('76px')}>
              <InlineEditableCell
                value={c.owner}
                placeholder="跟进人"
                onCommit={(v) => saveChildCell(c, { owner: v || null })}
              />
            </td>
            <td style={taskPlanTdStyle('96px', 'mono')}>
              <InlineEditableCell
                value={c.start_date}
                type="date"
                mono
                onCommit={(v) => saveChildCell(c, { start_date: v || null })}
              />
            </td>
            <td style={taskPlanTdStyle('96px', 'mono')} title="= 启动日期 + 自然日工时 - 1">
              <InlineEditableCell value={c.end_date} mono readonly />
            </td>
            <td style={taskPlanTdStyle('64px', 'mono')}>
              <InlineEditableCell
                value={c.natural_days}
                type="number"
                mono
                onCommit={(v) => saveChildCell(c, { natural_days: Math.max(0, Number(v) || 0) })}
              />
            </td>
            <td style={taskPlanTdStyle('72px', 'mono')}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <InlineEditableCell
                  value={Math.round(c.progress)}
                  type="number"
                  mono
                  onCommit={(v) =>
                    saveChildCell(c, { progress: Math.max(0, Math.min(100, Number(v) || 0)) })
                  }
                />
                <span style={{ color: 'var(--color-text-tertiary)', fontSize: 11 }}>%</span>
              </span>
            </td>
            <td style={taskPlanTdStyle('64px', 'mono')} title="按启动→完成之间的工作日（含法定节假日排除）">
              <InlineEditableCell
                value={c.work_days > 0 ? `${c.work_days}天` : ''}
                mono
                readonly
                displayFormatter={() => (c.work_days > 0 ? `${c.work_days}天` : '—')}
              />
            </td>
            <td style={taskPlanTdStyle()}>
              <InlineEditableCell
                value={c.remark}
                placeholder="任务完成情况说明"
                onCommit={(v) => saveChildCell(c, { remark: v || null })}
              />
            </td>
            <td style={taskPlanTdStyle('72px')}>
              <div style={{ display: 'inline-flex', gap: 4 }}>
                <button
                  type="button"
                  onClick={() => onDeleteChild(c)}
                  data-testid={`task-plan-child-delete-${c.id}`}
                  title="删除子任务"
                  style={{ ...rowIconBtnStyle, padding: '1px 4px', color: 'var(--color-status-danger)' }}
                >
                  <Trash2 size={11} />
                </button>
              </div>
            </td>
          </tr>
          {isSubParent && renderLevel(grandkids, `${seq}.`, depth + 1)}
        </Fragment>
      )
    })

  /**
   * 保存子任务单元格变更（行内编辑）
   * 关键：自动算 plan_end_date = start + natural_days -1、work_days = NETWORKDAYS(start,end)
   */
  const saveChildCell = async (
    child: ProjectTask,
    patch: {
      task_name?: string | null
      owner?: string | null
      start_date?: string | null
      natural_days?: number | null
      progress?: number | null
      remark?: string | null
    },
  ) => {
    const next = { ...child, ...patch }
    // 自动算计划完成日期 + 工作日工时
    let endDate = child.end_date
    let workDays = child.work_days
    let naturalDays = next.natural_days ?? child.natural_days
    if (next.start_date && naturalDays != null && naturalDays > 0) {
      // end = start + (naturalDays - 1) 天
      const startD = new Date(next.start_date + 'T00:00:00')
      startD.setDate(startD.getDate() + (naturalDays - 1))
      endDate = formatLocalDate(startD)
    } else if (!next.start_date || !naturalDays) {
      endDate = null
    }
    if (next.start_date && endDate) {
      workDays = networkdaysPublic(next.start_date, endDate)
    } else {
      workDays = 0
    }
    const status: ProjectTask['status'] =
      (next.progress ?? 0) >= 100
        ? 'COMPLETED'
        : (next.progress ?? 0) > 0
          ? 'IN_PROGRESS'
          : 'PENDING'
    try {
      await updateProjectTask(child.id, {
        task_name: patch.task_name !== undefined && patch.task_name !== null ? patch.task_name : (child.task_name || '未命名'),
        owner: patch.owner !== undefined ? patch.owner : child.owner,
        start_date: next.start_date,
        end_date: endDate,
        natural_days: naturalDays,
        work_days: workDays,
        progress: next.progress ?? child.progress,
        status,
        remark: patch.remark !== undefined ? patch.remark : child.remark,
      })
      // 🔑 关键：保存成功后必须 refresh，否则 UI 还是旧值
      await onRefresh()
      toast.success(`已保存：${child.task_name}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error('保存失败', msg)
    }
  }

  return (
    <li
      data-testid={`parent-task-row-${parent.id}`}
      style={{
        borderBottom: '1px solid var(--color-border-thin)',
        background: 'rgba(59,130,246,0.05)',
      }}
    >
      {/* 大阶段行 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '11px 16px',
        }}
      >
        {/* 折叠按钮 */}
        <button
          type="button"
          onClick={onToggle}
          data-testid={`task-plan-toggle-${parent.id}`}
          disabled={!hasChildren}
          style={{
            border: 'none',
            background: 'transparent',
            padding: 0,
            cursor: hasChildren ? 'pointer' : 'default',
            color: 'var(--color-text-tertiary)',
            display: 'inline-flex',
            flexShrink: 0,
            opacity: hasChildren ? 1 : 0.25,
          }}
          title={hasChildren ? (collapsed ? '展开' : '折叠') : ''}
        >
          {collapsed ? (
            <ChevronRight size={14} />
          ) : (
            <ChevronDown size={14} />
          )}
        </button>

        {/* 序号（实心圆 · 蓝色） */}
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: '50%',
            background: 'var(--color-accent)',
            color: 'var(--color-text-on-accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '11px',
            fontWeight: 700,
            fontFamily: 'var(--font-mono)',
            flexShrink: 0,
          }}
        >
          {index}
        </div>

        {/* 阶段名 */}
        <div
          style={{
            flex: '0 0 auto',
            fontSize: '13px',
            fontWeight: 700,
            color: 'var(--color-text)',
            maxWidth: 360,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={parent.task_name}
        >
          阶段 {index}: {parent.task_name}
        </div>

        {/* 进度条 + 数字 */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            minWidth: 100,
          }}
        >
          <div
            style={{
              flex: 1,
              height: 6,
              borderRadius: 3,
              background: 'var(--color-bg-subtle)',
              overflow: 'hidden',
              minWidth: 60,
            }}
          >
            <div
              style={{
                width: `${pct}%`,
                height: '100%',
                background: accentColor,
                transition: 'width 0.2s',
              }}
            />
          </div>
          <div
            style={{
              fontSize: '11px',
              color: 'var(--color-text-secondary)',
              fontFamily: 'var(--font-mono)',
              flexShrink: 0,
              minWidth: 92,
              textAlign: 'right',
            }}
          >
            <span style={{ color: accentColor, fontWeight: 600 }}>{pct}%</span>
            <span
              style={{ color: 'var(--color-text-tertiary)', marginLeft: 4 }}
            >
              ({completed}/{total})
            </span>
          </div>
        </div>

        {/* 状态徽章 */}
        <span
          style={{
            fontSize: '10px',
            padding: '2px 8px',
            borderRadius: 3,
            background: 'var(--color-bg-muted)',
            color: accentColor,
            fontWeight: 600,
            flexShrink: 0,
            letterSpacing: '0.02em',
          }}
        >
          {statusLabel}
        </span>

        {/* 行内操作：[+] 新增子任务 · [编辑] 编辑父任务 */}
        <div
          style={{
            display: 'inline-flex',
            gap: 4,
            marginLeft: 4,
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={onAddChild}
            data-testid={`task-plan-add-child-${parent.id}`}
            title="新增子任务"
            style={{
              ...rowIconBtnStyle,
              padding: '1px 4px',
              color: 'var(--color-accent)',
            }}
          >
            <Plus size={11} />
          </button>
          <button
            type="button"
            onClick={onEdit}
            data-testid={`task-plan-edit-${parent.id}`}
            title="编辑阶段（仅名称/负责人）"
            style={{ ...rowIconBtnStyle, padding: '1px 4px' }}
          >
            <Pencil size={11} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            data-testid={`task-plan-delete-${parent.id}`}
            title="删除阶段（含所有子任务）"
            style={{ ...rowIconBtnStyle, padding: '1px 4px', color: 'var(--color-status-danger)' }}
          >
            <Trash2 size={11} />
          </button>
        </div>
      </div>

      {/* 子任务明细（8 列 · 缩进 16px） */}
      {!collapsed && hasChildren && (
        <div
          style={{
            padding: '0 16px 12px 32px',
            borderTop: '1px dashed var(--color-border-thin)',
          }}
        >
          <table
            style={{
              width: '100%',
              tableLayout: 'fixed',
              borderCollapse: 'collapse',
              fontSize: '12px',
              marginTop: 6,
            }}
          >
            <thead>
              <tr>
                <th style={{ ...taskPlanThStyle('80px'), whiteSpace: 'nowrap' }}>序号</th>
                <th style={taskPlanThStyle()}>任务</th>
                <th style={taskPlanThStyle('76px')}>跟进人</th>
                <th style={taskPlanThStyle('96px')}>计划启动日期</th>
                <th style={taskPlanThStyle('96px')}>计划完成日期</th>
                <th style={taskPlanThStyle('64px')}>自然日工时</th>
                <th style={taskPlanThStyle('72px')}>当前完成度%</th>
                <th style={taskPlanThStyle('64px')}>工作日工时</th>
                <th style={taskPlanThStyle()}>任务完成情况说明</th>
                <th style={taskPlanThStyle('72px')}>操作</th>
              </tr>
            </thead>
            <tbody>
              {renderLevel(children, `${index}.`, 0)}
            </tbody>
          </table>
        </div>
      )}
    </li>
  )
}

const taskPlanThStyle = (width?: string): React.CSSProperties => ({
  width,
  padding: '5px 6px',
  fontSize: '10.5px',
  fontWeight: 500,
  color: 'var(--color-text-tertiary)',
  textAlign: 'left',
  borderBottom: '1px solid var(--color-border-thin)',
  whiteSpace: 'normal',
  wordBreak: 'break-word',
})

const taskPlanTdStyle = (
  width?: string,
  font?: 'mono' | 'normal',
): React.CSSProperties => ({
  width,
  padding: '5px 6px',
  fontSize: '12px',
  color: 'var(--color-text)',
  borderBottom: '1px solid var(--color-border-thin)',
  fontFamily: font === 'mono' ? 'var(--font-mono)' : 'inherit',
  whiteSpace: 'normal',
  wordBreak: 'break-word',
})

function getChildProgressColor(progress: number): string {
  if (progress >= 100) return 'var(--color-status-success)'
  if (progress > 0) return 'var(--color-status-warning)'
  return 'var(--color-text-tertiary)'
}

function ChildStatusBadge({ status }: { status: ProjectTask['status'] }) {
  const map: Record<ProjectTask['status'], { label: string; color: string }> = {
    PENDING: { label: '未开始', color: 'var(--color-text-tertiary)' },
    IN_PROGRESS: { label: '进行', color: 'var(--color-status-warning)' },
    COMPLETED: { label: '完成', color: 'var(--color-status-success)' },
    DELAYED: { label: '延期', color: 'var(--color-status-danger)' },
  }
  const it = map[status] ?? map.PENDING
  return (
    <span
      style={{
        fontSize: '10px',
        color: it.color,
        padding: '1px 6px',
        borderRadius: 3,
        background: 'var(--color-bg-muted)',
        whiteSpace: 'nowrap',
      }}
    >
      {it.label}
    </span>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: '11px',
        color: 'var(--color-text-tertiary)',
        marginBottom: '2px',
      }}
    >
      {children}
    </div>
  )
}

// ============================================================
// 一级 · 计划管理 · 每周任务（一行一周 · 维护者 2026-08-26 拍板）
// ============================================================

/** 周报 modal 内临时 entry（mode='create' 全 new；mode='view' 混合已有/新建） */
interface WeeklyModalEntry {
  id: number // 0 = new (草稿行未入库)
  task_name: string
  plan_start_date: string
  plan_end_date: string
  actual_start_date: string
  actual_end_date: string
  owner_party_a: string
  owner_party_b: string
  completion_note: string
  is_completed: WeeklyReportEntry['is_completed']
  section: WeeklyReportEntry['section']
}

/** 数字 → 中文（一~十）· 维护者 spec */
const cn = (n: number): string =>
  '一二三四五六七八九十'.split('')[n - 1] ?? String(n)

/** 取某日期所在周的周一 0:00 */
function startOfWeekMonday(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  const day = x.getDay()
  const diff = day === 0 ? -6 : 1 - day
  x.setDate(x.getDate() + diff)
  return x
}

/** 周编号 → 日期范围（按项目 start_date 推算） */
/**
 * 计算第 N 周的日期段
 * 维护者 2026-08-26：基准 = 项目任务最早 start_date 所在周的周一（不是项目元数据 start_date）
 * 第 1 周 = 任务最早 start_date 所在周
 */
function computeWeekDateRange(
  weekNumber: number,
  projectStartDate: string | null,
  taskMinStart?: string | null,
): { week_start_date: string; week_end_date: string } {
  // 优先任务最早 start_date · 退化为项目 start_date · 再退化为今天
  const baseSource = taskMinStart || projectStartDate
  const base = baseSource ? new Date(baseSource + 'T00:00:00') : new Date()
  const startMonday = startOfWeekMonday(base)
  const d = new Date(startMonday)
  d.setDate(d.getDate() + (weekNumber - 1) * 7)
  const end = new Date(d)
  end.setDate(end.getDate() + 6)
  return {
    week_start_date: formatLocalDate(d),
    week_end_date: formatLocalDate(end),
  }
}

/**
 * 周报 tab（每周工作情况及下周任务）· 原 WeeklyTasksTab 重命名
 * 维护者 2026-08-26 V2：从原 planning.weekly 二级 tab 升级
 * 保留全部 CRUD + Excel 导入导出 + 周详情 modal 逻辑
 */
function WeeklyTab({
  projectId,
  data,
  onRefresh,
}: {
  projectId: number
  data: ProjectDetailData
  onRefresh: () => Promise<void>
}) {
  // 列表数据（DB 镜像 · 行内编辑直接改这里）
  const [entries, setEntries] = useState<WeeklyReportEntry[]>([])
  const [loading, setLoading] = useState(false)

  // WeekDetailModal 状态
  const [mode, setMode] = useState<'create' | 'view'>('create')
  const [openWeekNumber, setOpenWeekNumber] = useState<number | null>(null)
  const [draftRow, setDraftRow] = useState<WeeklyModalEntry | null>(null)

  // 维护者 2026-08-31：新建模式改周号时，若目标周已存在则弹"打开已有周"确认
  const [weekNumberExistsConfirm, setWeekNumberExistsConfirm] = useState<
    number | null
  >(null)

  // 第几周详情确认删除（已保存的第几周后面要有删除 + 弹窗）
  const [deleteWeekConfirm, setDeleteWeekConfirm] = useState<number | null>(null)

  // 通用
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 维护者 2026-08-31：WeekDetailModal 的最大化状态（提到 WeeklyTab，让 sub-modal 知道 z-index 该用多少）
  const [weekModalMaximized, setWeekModalMaximized] = useState(false)

  // 维护者 2026-08-31：导入 / 结转 都从 modal 内触发，移出顶部工具栏
  const [importConfirm, setImportConfirm] = useState<WeeklyReportEntry[] | null>(
    null,
  )
  const [importFile, setImportFile] = useState<File | null>(null)
  const modalFileInputRef = useRef<HTMLInputElement | null>(null)

  // 维护者 2026-08-31：modal 内结转 —— 用户选源周号
  const [carryOverSourcePicker, setCarryOverSourcePicker] = useState<{
    targetWeek: number
    sourceWeek: number | null
  } | null>(null)

  // 拉数据
  const refreshEntries = async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await listWeeklyEntries(projectId)
      list.sort(
        (a, b) =>
          a.week_number - b.week_number || a.sort_order - b.sort_order,
      )
      setEntries(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refreshEntries()
  }, [projectId])

  // 维护者 2026-08-26：周报日期段基准 = 项目任务最早 start_date（不是项目元数据 start_date）
  // 任务最早 start_date 所在周 = 第 1 周
  const taskStartDates = data.tasks
    .map((t) => t.start_date)
    .filter((s): s is string => Boolean(s))
  const projectStartDate = taskStartDates.sort()[0] || data.project.start_date

  // 按 week_number 分组
  const weekGroups = useMemo(() => {
    const map = new Map<number, WeeklyReportEntry[]>()
    for (const e of entries) {
      const list = map.get(e.week_number) ?? []
      list.push(e)
      map.set(e.week_number, list)
    }
    return [...map.keys()]
      .sort((a, b) => a - b)
      .map((k) => {
        const list = map.get(k) ?? []
        list.sort((a, b) => a.sort_order - b.sort_order)
        const first = list[0]
        return {
          week_number: k,
          week_start_date: first?.week_start_date ?? '',
          week_end_date: first?.week_end_date ?? '',
          entries: list,
        }
      })
  }, [entries])

  // 下一个可用的周号（用于「新建」默认值）
  const nextWeekNumber = useMemo(() => {
    if (entries.length === 0) return 1
    return entries.reduce((m, e) => Math.max(m, e.week_number), 0) + 1
  }, [entries])

  // 打开 modal 的通用函数（create 模式）
  const openCreateModal = (n: number) => {
    setMode('create')
    setOpenWeekNumber(n)
    setDraftRow(null)
    setError(null)
  }

  // 打开详情 modal
  const handleOpenWeek = (weekNumber: number) => {
    setMode('view')
    setOpenWeekNumber(weekNumber)
    setDraftRow(null)
    setError(null)
  }

  const handleCloseModal = () => {
    setOpenWeekNumber(null)
    setDraftRow(null)
    setError(null)
    setWeekModalMaximized(false)
  }

  // 维护者 2026-08-31：新建按钮 —— 直接打开创建 modal（结转改在 modal 内显式触发）
  const handleCreate = () => {
    openCreateModal(nextWeekNumber)
  }

  // 维护者 2026-08-31：modal 内点击「结转…」 → 弹出源周号选择器
  const handleOpenCarryOverPicker = () => {
    if (openWeekNumber === null) return
    setCarryOverSourcePicker({ targetWeek: openWeekNumber, sourceWeek: null })
  }

  // 维护者 2026-08-31：modal 内点击「导入 Excel」 → 触发隐藏 file input
  const handleOpenImportPicker = () => {
    if (busy || openWeekNumber === null) return
    setError(null)
    // 用 requestAnimationFrame 包一层，Tauri webview 对 display:none 的 input.click()
    // 有时不响应；确保 layout 已稳定再 click
    requestAnimationFrame(() => {
      modalFileInputRef.current?.click()
    })
  }

  // 维护者 2026-08-31：确认结转（按用户选定的源周号）
  const handleCarryConfirm = async () => {
    if (!carryOverSourcePicker || carryOverSourcePicker.sourceWeek === null || busy) return
    const { targetWeek, sourceWeek } = carryOverSourcePicker
    setBusy(true)
    setError(null)
    try {
      const { week_start_date, week_end_date } = computeWeekDateRange(
        targetWeek,
        projectStartDate,
      )
      const items = entries.filter(
        (e) => e.week_number === sourceWeek && e.section === 'NEXT',
      )
      const existing = new Set(
        entries
          .filter((e) => e.week_number === targetWeek)
          .map((e) => e.task_name.trim()),
      )
      const queue = items.filter((it) => !existing.has(it.task_name.trim()))
      let sortOrder = entries.filter((e) => e.week_number === targetWeek).length
      for (const src of queue) {
        const isDone = src.is_completed === 'COMPLETED'
        await createWeeklyEntry({
          project_id: projectId,
          week_number: targetWeek,
          week_start_date,
          week_end_date,
          task_name: src.task_name,
          plan_start_date: isDone ? null : src.plan_start_date,
          plan_end_date: isDone ? null : src.plan_end_date,
          actual_start_date: src.actual_start_date,
          actual_end_date: src.actual_end_date,
          owner_party_a: src.owner_party_a,
          owner_party_b: src.owner_party_b,
          completion_note: src.completion_note,
          is_completed: isDone ? 'COMPLETED' : src.is_completed,
          section: isDone ? 'CURRENT' : 'NEXT',
          sort_order: sortOrder++,
        })
      }
      await refreshEntries()
      await onRefresh()
      setCarryOverSourcePicker(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  // 维护者 2026-08-31：新建模式改周号时，若目标周已存在则弹"打开已有周"确认
  const handleWeekNumberChange = (n: number) => {
    if (openWeekNumber === null) return
    if (n === openWeekNumber) return
    // 草稿行属于当前周，改周号前必须丢弃
    setDraftRow(null)
    setError(null)
    const exists = entries.some((e) => e.week_number === n)
    if (exists) {
      setWeekNumberExistsConfirm(n)
      return
    }
    setOpenWeekNumber(n)
  }

  const handleOpenExistingWeekAsView = (n: number) => {
    setWeekNumberExistsConfirm(null)
    handleOpenWeek(n)
  }

  const handleOpenExistingWeekAsCreate = (n: number) => {
    setWeekNumberExistsConfirm(null)
    // 强制 create 模式 + 切到目标周
    setMode('create')
    setOpenWeekNumber(n)
    setError(null)
  }

  // 维护者 2026-08-27：确认删除整周（第几周详情后的删除按钮 · 弹窗确认）
  const handleDeleteWeek = async (weekNumber: number) => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const targets = entries.filter((e) => e.week_number === weekNumber)
      for (const t of targets) {
        await deleteWeeklyEntry(t.id)
      }
      setDeleteWeekConfirm(null)
      await refreshEntries()
      await onRefresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  // 行内新增一行（id=0 表示草稿）
  const handleAddRow = (section: WeeklyReportEntry['section']) => {
    setDraftRow({
      id: 0,
      task_name: '',
      plan_start_date: '',
      plan_end_date: '',
      actual_start_date: '',
      actual_end_date: '',
      owner_party_a: '',
      owner_party_b: '',
      completion_note: '',
      is_completed: 'PENDING',
      section,
    })
  }

  // 行内编辑：cell 失焦提交 → 立即写库；本地 entries 做合并 patch（不整表 reload）
  const entryIsReadonly = (e: WeeklyModalEntry): boolean => {
    if (openWeekNumber === null) return false
    const weekEnd = computeWeekDateRange(openWeekNumber, projectStartDate).week_end_date
    const isPastWeek = weekEnd < formatLocalDate(new Date())
    return isPastWeek || e.is_completed === 'COMPLETED'
  }
  const handleWeeklyCellCommit = async (
    entry: WeeklyModalEntry,
    next: Partial<WeeklyModalEntry>,
  ) => {
    if (openWeekNumber === null || busy) return

    // 维护者 2026-09-01：已过期的周 + 已勾选 COMPLETED 的项，is_completed 只读
    if (next.is_completed !== undefined && entryIsReadonly(entry)) {
      toast.error('无法修改')
      setTimeout(() => {
        toast.info(
          '该周计划完成日期已过（' +
            week_end_date +
            '），且该项已标记为已完成，不能取消勾选。'
        )
      }, 100)
      return
    }

    const merged: WeeklyModalEntry = { ...entry, ...next }
    const { week_start_date, week_end_date } = computeWeekDateRange(
      openWeekNumber,
      projectStartDate,
    )
    const norm = {
      task_name: merged.task_name.trim(),
      plan_start_date: merged.plan_start_date || null,
      plan_end_date: merged.plan_end_date || null,
      actual_start_date: merged.actual_start_date || null,
      actual_end_date: merged.actual_end_date || null,
      owner_party_a: merged.owner_party_a.trim() || null,
      owner_party_b: merged.owner_party_b.trim() || null,
      completion_note: merged.completion_note.trim() || null,
      is_completed: merged.is_completed,
      section: merged.section,
    }
    setBusy(true)
    setError(null)
    try {
      if (entry.id === 0) {
        // 草稿行：任务名为空时保留在本地，不写库
        if (!norm.task_name) {
          setDraftRow(merged)
          return
        }
        const sortOrder = entries.filter(
          (e) => e.week_number === openWeekNumber,
        ).length
        const newId = await createWeeklyEntry({
          project_id: projectId,
          week_number: openWeekNumber,
          week_start_date,
          week_end_date,
          ...norm,
          sort_order: sortOrder,
        })
        setEntries((prev) => [
          ...prev,
          {
            id: newId,
            project_id: projectId,
            week_number: openWeekNumber,
            week_start_date,
            week_end_date,
            sort_order: sortOrder,
            ...norm,
            created_at: '',
            updated_at: '',
          },
        ])
        setDraftRow(null) // 草稿转正式行
      } else {
        await updateWeeklyEntry(entry.id, {
          ...norm,
          week_number: openWeekNumber,
        })
        setEntries((prev) =>
          prev.map((e) => (e.id === entry.id ? { ...e, ...norm } : e)),
        )
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  // 行内删除
  const handleWeeklyDeleteRow = async (entry: WeeklyModalEntry) => {
    if (entry.id === 0) {
      setDraftRow(null)
      return
    }
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await deleteWeeklyEntry(entry.id)
      setEntries((prev) => prev.filter((e) => e.id !== entry.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  // 「保存并新增」：当前周已落库（行内提交即时写），直接关闭并打开下一周
  const handleOpenNextWeek = () => {
    if (openWeekNumber === null) return
    openCreateModal(openWeekNumber + 1)
  }

  // 当前周视图 entries（DB → WeeklyModalEntry）+ 草稿行
  const viewEntries = useMemo<WeeklyModalEntry[]>(() => {
    if (openWeekNumber === null) return []
    const list = entries
      .filter((e) => e.week_number === openWeekNumber)
      .map<WeeklyModalEntry>((e) => ({
        id: e.id,
        task_name: e.task_name,
        plan_start_date: e.plan_start_date ?? '',
        plan_end_date: e.plan_end_date ?? '',
        actual_start_date: e.actual_start_date ?? '',
        actual_end_date: e.actual_end_date ?? '',
        owner_party_a: e.owner_party_a ?? '',
        owner_party_b: e.owner_party_b ?? '',
        completion_note: e.completion_note ?? '',
        is_completed: e.is_completed,
        section: e.section,
      }))
    if (draftRow) list.push(draftRow)
    return list
  }, [entries, openWeekNumber, draftRow])

  // 导出本周（行内保存后立即导出时强刷一次确保包含最新）
  const handleExportWeek = async (weekNumber: number) => {
    try {
      await refreshEntries()
      const weekEntries = entries.filter((e) => e.week_number === weekNumber)
      const blob = await exportWeeklyToExcel(weekEntries)
      const filename = `${data.project.project_name}-第${cn(weekNumber)}周周报-${todayLocal()}.xlsx`
      const ok = await saveBlobToDirectory(blob, filename)
      if (ok) toast.success(`已导出第 ${cn(weekNumber)} 周周报`, filename)
      else toast.error('导出失败', '浏览器拦截了下载')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error('导出周报失败', msg)
      setError(msg)
    }
  }

  // 维护者 2026-08-31：导入 = 强制写入当前 openWeekNumber（从 modal 内触发）
  const handleImportFile = async (file: File) => {
    if (openWeekNumber === null) return
    setBusy(true)
    setError(null)
    try {
      const parsed = await parseWeeklyExcel(file, projectId)
      if (modalFileInputRef.current) modalFileInputRef.current.value = ''
      if (parsed.length === 0) {
        setError('Excel 中未发现有效的周报条目 · 检查 sheet 名是否包含「每周工作情况」')
        return
      }
      setImportFile(file)
      setImportConfirm(parsed)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      if (modalFileInputRef.current) modalFileInputRef.current.value = ''
    } finally {
      setBusy(false)
    }
  }

  // 维护者 2026-08-31：追加到当前周 —— 全部条目强制 week_number = openWeekNumber + 当前日期段
  const handleImportAppend = async () => {
    if (!importConfirm || openWeekNumber === null || busy) return
    setBusy(true)
    setError(null)
    try {
      const { week_start_date, week_end_date } = computeWeekDateRange(
        openWeekNumber,
        projectStartDate,
      )
      const existing = new Set(
        entries
          .filter((e) => e.week_number === openWeekNumber)
          .map((e) => e.task_name.trim()),
      )
      let sortOrder = entries.filter(
        (e) => e.week_number === openWeekNumber,
      ).length
      for (const src of importConfirm) {
        if (existing.has(src.task_name.trim())) continue
        await createWeeklyEntry({
          project_id: projectId,
          week_number: openWeekNumber,
          week_start_date,
          week_end_date,
          task_name: src.task_name,
          plan_start_date: src.plan_start_date,
          plan_end_date: src.plan_end_date,
          actual_start_date: src.actual_start_date,
          actual_end_date: src.actual_end_date,
          owner_party_a: src.owner_party_a,
          owner_party_b: src.owner_party_b,
          completion_note: src.completion_note,
          is_completed: src.is_completed,
          section: src.section,
          sort_order: sortOrder++,
        })
      }
      setImportConfirm(null)
      setImportFile(null)
      await refreshEntries()
      await onRefresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  // 维护者 2026-08-31：覆盖当前周 —— 先删除该周全部条目，再写入（强制目标周）
  const handleImportReplace = async () => {
    if (!importConfirm || openWeekNumber === null || busy) return
    setBusy(true)
    setError(null)
    try {
      const { week_start_date, week_end_date } = computeWeekDateRange(
        openWeekNumber,
        projectStartDate,
      )
      const existingIds = entries
        .filter((e) => e.week_number === openWeekNumber)
        .map((e) => e.id)
      for (const id of existingIds) {
        await deleteWeeklyEntry(id)
      }
      let sortOrder = 0
      for (const src of importConfirm) {
        await createWeeklyEntry({
          project_id: projectId,
          week_number: openWeekNumber,
          week_start_date,
          week_end_date,
          task_name: src.task_name,
          plan_start_date: src.plan_start_date,
          plan_end_date: src.plan_end_date,
          actual_start_date: src.actual_start_date,
          actual_end_date: src.actual_end_date,
          owner_party_a: src.owner_party_a,
          owner_party_b: src.owner_party_b,
          completion_note: src.completion_note,
          is_completed: src.is_completed,
          section: src.section,
          sort_order: sortOrder++,
        })
      }
      setImportConfirm(null)
      setImportFile(null)
      await refreshEntries()
      await onRefresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const handleImportCancel = () => {
    setImportConfirm(null)
    setImportFile(null)
  }

  const showTopError =
    error !== null &&
    openWeekNumber === null &&
    importConfirm === null &&
    carryOverSourcePicker === null &&
    deleteWeekConfirm === null &&
    weekNumberExistsConfirm === null

  return (
    <Section
      title="项目工作周"
      icon={CalendarDays}
      accent="var(--color-accent)"
      rightSlot={
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <button
            type="button"
            onClick={() => handleExportWeek(nextWeekNumber - 1)}
            disabled={busy || entries.length === 0}
            data-testid="weekly-export-latest"
            title="导出最新一周"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 10px',
              border: '1px solid var(--color-border-thin)',
              borderRadius: 'var(--radius)',
              background: 'var(--color-bg-subtle)',
              color: 'var(--color-text)',
              fontSize: '12px',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <Upload size={11} />
            导出最新一周
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={busy}
            data-testid="weekly-create"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 10px',
              border: 'none',
              borderRadius: 'var(--radius)',
              background: 'var(--color-accent)',
              color: 'var(--color-text-on-accent)',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <Plus size={11} />
            新建
          </button>
        </div>
      }
    >
      {/* 维护者 2026-08-31：导入 / 结转 都从 modal 内触发。
          注意：Tauri webview 对 display:none 的 <input type="file"> 调用 .click() 不响应，
          必须用 opacity:0 + 占位 1×1 的隐藏方式（保留 DOM 渲染 + 事件） */}
      <input
        ref={modalFileInputRef}
        type="file"
        accept=".xlsx"
        aria-hidden
        tabIndex={-1}
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: 'hidden',
          clip: 'rect(0,0,0,0)',
          whiteSpace: 'nowrap',
          border: 0,
          opacity: 0,
          pointerEvents: 'none',
        }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void handleImportFile(f)
          e.target.value = ''
        }}
      />

      {showTopError && (
        <div
          style={{
            marginBottom: '10px',
            padding: '8px 12px',
            borderRadius: 'var(--radius)',
            background: 'rgba(239,68,68,0.08)',
            color: 'var(--color-status-danger)',
            fontSize: '12px',
          }}
        >
          {error}
        </div>
      )}

      {loading && entries.length === 0 ? (
        <EmptyHint text="加载中…" />
      ) : weekGroups.length === 0 ? (
        <EmptyHint text="该项目暂无周报 · 点 [新建] 创建或 [导入] 从 Excel 加载" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {weekGroups.map((g) => (
            <div
              key={g.week_number}
              data-testid={`week-row-${g.week_number}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 14px',
                border: '1px solid var(--color-border-thin)',
                borderRadius: 'var(--radius)',
                background: 'var(--color-surface)',
                fontSize: '13px',
              }}
            >
              <span
                style={{
                  fontWeight: 600,
                  color: 'var(--color-text)',
                }}
              >
                第 {cn(g.week_number)} 周
              </span>
              <span
                style={{
                  marginLeft: 'auto',
                  color: 'var(--color-text-tertiary)',
                  fontSize: '11px',
                }}
              >
                任务 {g.entries.length} 条
              </span>
              <button
                type="button"
                onClick={() => handleExportWeek(g.week_number)}
                disabled={busy}
                title={`导出第 ${cn(g.week_number)} 周`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '4px 8px',
                  border: '1px solid var(--color-border-thin)',
                  borderRadius: 'var(--radius)',
                  background: 'var(--color-bg-subtle)',
                  color: 'var(--color-text)',
                  fontSize: '11px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                <Upload size={10} />
                导出
              </button>
              <button
                type="button"
                onClick={() => handleOpenWeek(g.week_number)}
                data-testid={`week-detail-${g.week_number}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '4px 12px',
                  border: '1px solid var(--color-border-thin)',
                  borderRadius: 'var(--radius)',
                  background: 'var(--color-bg-subtle)',
                  color: 'var(--color-text)',
                  fontSize: '12px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                详情
              </button>
              <button
                type="button"
                onClick={() => setDeleteWeekConfirm(g.week_number)}
                data-testid={`week-delete-${g.week_number}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '4px 12px',
                  border: '1px solid var(--color-border-thin)',
                  borderRadius: 'var(--radius)',
                  background: 'var(--color-bg-subtle)',
                  color: 'var(--color-status-danger)',
                  fontSize: '12px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                <Trash2 size={11} />
                删除
              </button>
            </div>
          ))}
        </div>
      )}

      {openWeekNumber !== null && (
        <WeekDetailModal
          mode={mode}
          weekNumber={openWeekNumber}
          projectStartDate={projectStartDate}
          entries={viewEntries}
          saving={busy}
          error={
            openWeekNumber !== null &&
            importConfirm === null &&
            carryOverSourcePicker === null &&
            weekNumberExistsConfirm === null
              ? error
              : null
          }
          readonly={false}
          onAddRow={handleAddRow}
          onCommitCell={(e, next) => void handleWeeklyCellCommit(e, next)}
          onDeleteRow={(e) => void handleWeeklyDeleteRow(e)}
          onClose={handleCloseModal}
          onOpenNextWeek={
            mode === 'create' ? handleOpenNextWeek : undefined
          }
          onWeekNumberChange={
            mode === 'create'
              ? (n) => handleWeekNumberChange(n)
              : undefined
          }
          onOpenImport={handleOpenImportPicker}
          onOpenCarryOverPicker={
            mode === 'create' ? handleOpenCarryOverPicker : undefined
          }
          maximized={weekModalMaximized}
          onMaximizeChange={setWeekModalMaximized}
        />
      )}

      {importConfirm !== null && (
        <WeeklyImportConfirmModal
          weekNumber={openWeekNumber ?? 0}
          items={importConfirm}
          fileName={importFile?.name ?? ''}
          busy={busy}
          error={error}
          zIndex={weekModalMaximized ? 10000 : undefined}
          onCancel={handleImportCancel}
          onAppend={() => void handleImportAppend()}
          onReplace={() => void handleImportReplace()}
        />
      )}

      {/* 维护者 2026-08-31：modal 内「结转…」 → 源周选择器 */}
      {carryOverSourcePicker !== null && (
        <CarryOverSourcePickerModal
          entries={entries}
          targetWeek={carryOverSourcePicker.targetWeek}
          sourceWeek={carryOverSourcePicker.sourceWeek}
          onSelectSource={(w) =>
            setCarryOverSourcePicker((s) =>
              s ? { ...s, sourceWeek: w } : s,
            )
          }
          onCancel={() => setCarryOverSourcePicker(null)}
          onConfirm={() => void handleCarryConfirm()}
          busy={busy}
          zIndex={weekModalMaximized ? 10000 : undefined}
        />
      )}

      {deleteWeekConfirm !== null && (
        <div
          style={confirmOverlayStyle}
          onClick={() => setDeleteWeekConfirm(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={confirmBoxStyle}
          >
            <h3 style={confirmTitleStyle}>删除第 {cn(deleteWeekConfirm)} 周</h3>
            <p style={confirmDescStyle}>
              确定要删除「第 {cn(deleteWeekConfirm)} 周」的全部{' '}
              {entries.filter((e) => e.week_number === deleteWeekConfirm).length}{' '}
              条周报记录？该操作不可撤销。
            </p>
            <div style={confirmFooterStyle}>
              <button
                type="button"
                onClick={() => setDeleteWeekConfirm(null)}
                style={ghostBtnStyle}
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteWeek(deleteWeekConfirm)}
                disabled={busy}
                style={{
                  ...dangerBtnStyle,
                  opacity: busy ? 0.6 : 1,
                }}
              >
                {busy ? '删除中…' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 维护者 2026-08-31：新建模式改周号，目标周已存在时的二次确认 */}
      {weekNumberExistsConfirm !== null && (
        <div
          style={confirmOverlayStyle}
          onClick={() => setWeekNumberExistsConfirm(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={confirmBoxStyle}
          >
            <h3 style={confirmTitleStyle}>
              第 {cn(weekNumberExistsConfirm)} 周已存在
            </h3>
            <p style={confirmDescStyle}>
              「第 {cn(weekNumberExistsConfirm)} 周」已有{' '}
              {
                entries.filter(
                  (e) => e.week_number === weekNumberExistsConfirm,
                ).length
              }{' '}
              条记录。
              <br />
              要查看/编辑已有内容，还是作为新周新建？
            </p>
            <div style={confirmFooterStyle}>
              <button
                type="button"
                onClick={() => setWeekNumberExistsConfirm(null)}
                style={ghostBtnStyle}
              >
                取消
              </button>
              <button
                type="button"
                onClick={() =>
                  handleOpenExistingWeekAsView(weekNumberExistsConfirm)
                }
                style={ghostBtnStyle}
              >
                查看已有
              </button>
              <button
                type="button"
                onClick={() =>
                  handleOpenExistingWeekAsCreate(weekNumberExistsConfirm)
                }
                style={primaryBtnStyle}
              >
                新建（保留已有）
              </button>
            </div>
          </div>
        </div>
      )}
    </Section>
  )
}

/**
 * WeekDetailModal · 新建/详情 同 modal（行内直接编辑，列宽可拖拽）
 * 维护者 2026-08-28 重构：cells 失焦自动落库，modal 退化为只承载展示 + 容器
 * 维护者 2026-08-31 补：新建模式支持改周号（顶部 number 输入）· 详情/编辑支持最大化切换
 * 底部：view=[关闭] / create=[取消]+[保存并新增 → 下一周]
 * 维护者 2026-09-01：计划完成日期在今日之前的周，勾选框只读 + 弹窗提示
 */
function WeekDetailModal({
  mode,
  weekNumber,
  projectStartDate,
  entries,
  saving,
  error,
  readonly,
  onAddRow,
  onCommitCell,
  onDeleteRow,
  onClose,
  onOpenNextWeek,
  onWeekNumberChange,
  onOpenImport,
  onOpenCarryOverPicker,
  maximized,
  onMaximizeChange,
}: {
  mode: 'create' | 'view'
  weekNumber: number
  projectStartDate: string | null
  entries: WeeklyModalEntry[]
  saving: boolean
  error: string | null
  readonly: boolean
  onAddRow: (section: WeeklyReportEntry['section']) => void
  onCommitCell: (entry: WeeklyModalEntry, next: Partial<WeeklyModalEntry>) => Promise<void> | void
  onDeleteRow: (entry: WeeklyModalEntry) => Promise<void> | void
  onClose: () => void
  /** create 模式专用：保存并新增 = 关闭当前周、打开下一周（同 mode='create'） */
  onOpenNextWeek?: () => void
  /** create 模式专用：顶部 number 输入触发 · 父级判定该周是否已存在并弹确认 */
  onWeekNumberChange?: (n: number) => void
  /** 维护者 2026-08-31：modal 内「导入 Excel」按钮 → 触发隐藏 file input（强制写当前周）*/
  onOpenImport: () => void
  /** 维护者 2026-08-31：modal 内「结转…」按钮（仅 create 模式）→ 弹源周选择 */
  onOpenCarryOverPicker?: () => void
  /** 维护者 2026-08-31：最大化状态提到父级（WeeklyTab），便于 sub-modal 计算 z-index */
  maximized: boolean
  onMaximizeChange: (m: boolean) => void
}) {
  const today = todayLocal()
  const { week_start_date, week_end_date } = computeWeekDateRange(
    weekNumber,
    projectStartDate,
  )
  // 下周日期段 = 第 weekNumber+1 周
  const next = computeWeekDateRange(weekNumber + 1, projectStartDate)

  const currentEntries = entries.filter((e) => e.section === 'CURRENT')
  const nextEntries = entries.filter((e) => e.section === 'NEXT')

  // 判断该周是否已结束（本周计划完成日期 < 今日）
  const isPastWeek = week_end_date < today
  // 该周所有行的 is_completed 只读状态：已过期的周 + 已勾选 COMPLETED 的项
  const entryIsReadonly = (e: WeeklyModalEntry): boolean =>
    isPastWeek || e.is_completed === 'COMPLETED'

  // 维护者 2026-08-31：标题区 / 周号输入 / 最大化按钮 —— 嵌入态与全屏态共用
  const headerEl = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginBottom: maximized ? 12 : 4,
        flexShrink: 0,
      }}
    >
      <h3
        style={{
          ...confirmTitleStyle,
          margin: 0,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        {mode === 'create' ? '新建第' : '第'}
        {mode === 'create' && onWeekNumberChange ? (
          // 维护者 2026-08-31：新建模式支持改周号（顶部 number 输入）
          <input
            type="number"
            min={1}
            value={weekNumber}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10)
              if (!Number.isNaN(v) && v >= 1) onWeekNumberChange(v)
            }}
            disabled={saving}
            data-testid="week-number-input"
            style={{
              width: 56,
              padding: '2px 6px',
              fontSize: 14,
              fontWeight: 600,
              fontFamily: 'var(--font-mono)',
              textAlign: 'center',
              border: '1px solid var(--color-border-thin)',
              borderRadius: 4,
              background: 'var(--color-bg-subtle)',
              color: 'var(--color-text)',
              outline: 'none',
            }}
          />
        ) : (
          <span style={{ fontFamily: 'var(--font-mono)' }}>{cn(weekNumber)}</span>
        )}
        周
      </h3>
      <span
        style={{
          fontSize: 11,
          color: 'var(--color-text-tertiary)',
          fontFamily: 'var(--font-mono)',
          marginLeft: 4,
        }}
      >
        {week_start_date} ~ {week_end_date}
      </span>
      <div style={{ flex: 1 }} />
      {/* 维护者 2026-08-31：导入 / 结转 / 最大化 三按钮组（mode 相关条件渲染） */}
      {onOpenImport && (
        <button
          type="button"
          onClick={onOpenImport}
          disabled={saving}
          data-testid="week-modal-import"
          title="从 Excel 导入，强制写入到当前周"
          style={weekModalBtnStyle}
        >
          <Upload size={12} />
          导入 Excel
        </button>
      )}
      {mode === 'create' && onOpenCarryOverPicker && (
        <button
          type="button"
          onClick={onOpenCarryOverPicker}
          disabled={saving}
          data-testid="week-modal-carryover"
          title="从已存在的某一周结转「下周项目工作计划」到当前周"
          style={weekModalBtnStyle}
        >
          <ArrowRightLeft size={12} />
          结转…
        </button>
      )}
      <button
        type="button"
        onClick={() => onMaximizeChange(!maximized)}
        data-testid="week-modal-maximize-toggle"
        title={maximized ? '还原' : '最大化'}
        style={weekModalBtnStyle}
      >
        {maximized ? <Minimize size={12} /> : <Maximize size={12} />}
        {maximized ? '还原' : '最大化'}
      </button>
    </div>
  )

  const bodyEl = (
    <>
      <WeekDetailSection
        groups={[
          {
            key: 'CURRENT',
            title: '本周项目工作情况',
            dateRange: `${week_start_date} ~ ${week_end_date}`,
            entries: currentEntries,
            onAdd: () => onAddRow('CURRENT'),
          },
          {
            key: 'NEXT',
            title: '下周项目工作计划',
            dateRange: `${next.week_start_date} ~ ${next.week_end_date}`,
            entries: nextEntries,
            onAdd: () => onAddRow('NEXT'),
          },
        ]}
        saving={saving}
        readonly={readonly}
        onCommitCell={onCommitCell}
        onDelete={onDeleteRow}
        isPastWeek={isPastWeek}
      />

      {error && <div style={{ ...confirmErrorStyle, marginTop: 8 }}>{error}</div>}

      <div style={{ ...confirmFooterStyle, marginTop: 12 }}>
        {mode === 'view' ? (
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={primaryBtnStyle}
          >
            关闭
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              style={ghostBtnStyle}
            >
              取消
            </button>
            {/* 维护者 2026-08-31：保存 = 关闭 modal（行内 cell 已实时落库，无草稿残留） */}
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              style={ghostBtnStyle}
            >
              保存
            </button>
            {onOpenNextWeek && (
              <button
                type="button"
                onClick={onOpenNextWeek}
                disabled={saving}
                style={primaryBtnStyle}
              >
                保存并新增 → 下一周
              </button>
            )}
          </>
        )}
      </div>
    </>
  )

  // 维护者 2026-08-31：全屏态 = fixed 全视口覆盖（与 GanttTab / RisksTab 风格一致）
  if (maximized) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          background: 'var(--color-surface)',
          padding: 16,
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {headerEl}
        {bodyEl}
      </div>
    )
  }

  return (
    <div style={confirmOverlayStyle} onClick={() => !saving && onClose()}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          ...confirmBoxStyle,
          width: '900px',
          maxWidth: '900px',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        {headerEl}
        {bodyEl}
      </div>
    </div>
  )
}

/** 周报 modal 内的 section 表格（本周 / 下周 共用）· 行内直接编辑
 * 维护者 2026-08-28：单元格点击变输入框 · 失焦自动保存 · 列宽可拖拽
 * 维护者 2026-09-01：已过期的周，勾选框只读 + 提示
 */
function WeekDetailSection({
  groups,
  saving,
  readonly,
  onCommitCell,
  onDelete,
  isPastWeek,
}: {
  groups: {
    key: string
    title: string
    dateRange: string
    entries: WeeklyModalEntry[]
    onAdd: () => void
  }[]
  saving: boolean
  /** 查看模式：隐藏新增/编辑/删除按钮，只读展示 */
  readonly?: boolean
  onCommitCell: (entry: WeeklyModalEntry, next: Partial<WeeklyModalEntry>) => void
  onDelete: (entry: WeeklyModalEntry) => void
  /** 维护者 2026-09-01：判断该周是否已结束 */
  isPastWeek: boolean
}) {
  const { widths, dragHandle } = useResizableColumns('weekly', WEEKLY_COLUMN_DEFAULTS)
  const colCount = readonly ? 8 : 9
  // 是否完成：中文 ↔ 枚举 映射
  const statusToCn: Record<string, string> = {
    PENDING: '未开始',
    IN_PROGRESS: '进行中',
    COMPLETED: '已完成',
  }
  const entryIsReadonly = (e: WeeklyModalEntry): boolean =>
    isPastWeek || e.is_completed === 'COMPLETED'
  return (
    <div style={{ overflowX: 'auto' }}>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '12px',
          tableLayout: 'fixed',
        }}
      >
        <thead>
          <tr style={{ background: 'var(--color-bg-muted)' }}>
            <ResizableTh width={widths.idx} dragHandle={dragHandle('idx', 28, 80)} style={weeklyThStyle}>序号</ResizableTh>
            <ResizableTh width={widths.task} dragHandle={dragHandle('task')} style={weeklyThStyle}>任务</ResizableTh>
            <ResizableTh width={widths.plan} dragHandle={dragHandle('plan')} style={weeklyThStyle}>计划起止</ResizableTh>
            <ResizableTh width={widths.actual} dragHandle={dragHandle('actual')} style={weeklyThStyle}>实际起止</ResizableTh>
            <ResizableTh width={widths.partyA} dragHandle={dragHandle('partyA')} style={weeklyThStyle}>甲方</ResizableTh>
            <ResizableTh width={widths.partyB} dragHandle={dragHandle('partyB')} style={weeklyThStyle}>乙方</ResizableTh>
            <ResizableTh width={widths.note} dragHandle={dragHandle('note')} style={weeklyThStyle}>完成情况</ResizableTh>
            <ResizableTh width={widths.status} dragHandle={dragHandle('status')} style={weeklyThStyle}>是否完成</ResizableTh>
            {!readonly && (
              <ResizableTh width={widths.ops} dragHandle={dragHandle('ops')} style={weeklyThStyle}>操作</ResizableTh>
            )}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <Fragment key={g.key}>
              <tr style={{ background: 'var(--color-bg-muted)' }}>
                <td
                  colSpan={colCount}
                  style={{
                    padding: '6px 6px',
                    borderBottom: '1px solid var(--color-border-thin)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text)' }}>
                      {g.title}
                    </span>
                    <span
                      style={{
                        fontSize: '11px',
                        color: 'var(--color-text-tertiary)',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {g.dateRange}
                    </span>
                    <span
                      style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}
                    >
                      · {g.entries.length} 条
                    </span>
                    {!readonly && (
                      <button
                        type="button"
                        onClick={g.onAdd}
                        disabled={saving}
                        style={{
                          marginLeft: 'auto',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '3px 8px',
                          border: '1px solid var(--color-border-thin)',
                          borderRadius: 'var(--radius)',
                          background: 'var(--color-bg-subtle)',
                          color: 'var(--color-text-secondary)',
                          fontSize: '11px',
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        <Plus size={10} />
                        新增
                      </button>
                    )}
                  </div>
                </td>
              </tr>
              {g.entries.length === 0 ? (
                <tr>
                  <td
                    colSpan={colCount}
                    style={{
                      padding: '12px',
                      textAlign: 'center',
                      fontSize: '11.5px',
                      color: 'var(--color-text-tertiary)',
                    }}
                  >
                    暂无任务 · 点 [新增] 添加
                  </td>
                </tr>
              ) : (
                g.entries.map((e, idx) => (
                  <tr
                    key={e.id !== 0 ? e.id : `new-${g.key}-${idx}`}
                    data-testid={`modal-row-${e.id !== 0 ? e.id : idx}`}
                  >
                    <td
                      style={{
                        ...weeklyTdStyle,
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--color-text-tertiary)',
                        width: '36px',
                      }}
                    >
                      {idx + 1}
                    </td>
                    <td style={weeklyTdStyle}>
                      <InlineEditableCell
                        value={e.task_name}
                        readonly={readonly}
                        placeholder="任务名称"
                        onCommit={(v) => onCommitCell(e, { task_name: v })}
                      />
                    </td>
                    <td style={weeklyTdStyle}>
                      <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                        <InlineEditableCell
                          value={e.plan_start_date}
                          type="date"
                          mono
                          readonly={readonly}
                          placeholder="开始"
                          onCommit={(v) => onCommitCell(e, { plan_start_date: v || '' })}
                        />
                        <span style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }}>~</span>
                        <InlineEditableCell
                          value={e.plan_end_date}
                          type="date"
                          mono
                          readonly={readonly}
                          placeholder="结束"
                          onCommit={(v) => onCommitCell(e, { plan_end_date: v || '' })}
                        />
                      </div>
                    </td>
                    <td style={weeklyTdStyle}>
                      <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                        <InlineEditableCell
                          value={e.actual_start_date}
                          type="date"
                          mono
                          readonly={readonly}
                          placeholder="开始"
                          onCommit={(v) => onCommitCell(e, { actual_start_date: v || '' })}
                        />
                        <span style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }}>~</span>
                        <InlineEditableCell
                          value={e.actual_end_date}
                          type="date"
                          mono
                          readonly={readonly}
                          placeholder="结束"
                          onCommit={(v) => onCommitCell(e, { actual_end_date: v || '' })}
                        />
                      </div>
                    </td>
                    <td style={weeklyTdStyle}>
                      <InlineEditableCell
                        value={e.owner_party_a}
                        readonly={readonly}
                        placeholder="甲方负责人"
                        onCommit={(v) => onCommitCell(e, { owner_party_a: v })}
                      />
                    </td>
                    <td style={weeklyTdStyle}>
                      <InlineEditableCell
                        value={e.owner_party_b}
                        readonly={readonly}
                        placeholder="乙方负责人"
                        onCommit={(v) => onCommitCell(e, { owner_party_b: v })}
                      />
                    </td>
                    <td style={weeklyTdStyle}>
                      <InlineEditableCell
                        value={e.completion_note}
                        multiline
                        readonly={readonly}
                        placeholder="完成情况"
                        onCommit={(v) => onCommitCell(e, { completion_note: v })}
                      />
                    </td>
                    <td style={weeklyTdStyle}>
                      <InlineEditableCell
                        value={e.is_completed}
                        type="select"
                        options={['PENDING', 'IN_PROGRESS', 'COMPLETED']}
                        optionLabels={statusToCn}
                        readonly={entryIsReadonly(e)}
                        displayFormatter={(raw) => statusToCn[String(raw)] ?? String(raw)}
                        onCommit={(v) => onCommitCell(e, { is_completed: (v as WeeklyReportEntry['is_completed']) || 'PENDING' })}
                      />
                    </td>
                    {!readonly && (
                      <td style={weeklyTdStyle}>
                        <button
                          type="button"
                          onClick={() => onDelete(e)}
                          disabled={saving}
                          title="删除"
                          style={{
                            ...rowIconBtnStyle,
                            color: 'var(--color-status-danger)',
                          }}
                        >
                          <Trash2 size={11} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}


/**
 * 周报导入确认 modal · 维护者 2026-08-31 重构
 * 全部条目强制写入到当前打开的 weekNumber（原 Excel 中的 week_number 字段被忽略）
 */
function WeeklyImportConfirmModal({
  weekNumber,
  items,
  fileName,
  busy,
  error,
  zIndex,
  onCancel,
  onAppend,
  onReplace,
}: {
  weekNumber: number
  items: WeeklyReportEntry[]
  fileName: string
  busy: boolean
  error: string | null
  /** 维护者 2026-08-31：父 modal 最大化时传 10000，避免被 z-index:9999 遮挡 */
  zIndex?: number
  onCancel: () => void
  onAppend: () => void
  onReplace: () => void
}) {
  const preview = items.slice(0, 50)
  return (
    <div
      style={{ ...confirmOverlayStyle, zIndex: zIndex ?? 300 }}
      onClick={() => !busy && onCancel()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          ...confirmBoxStyle,
          width: '520px',
          maxHeight: '80vh',
          overflowY: 'auto',
        }}
      >
        <h3 style={confirmTitleStyle}>
          导入到「第 {cn(weekNumber)} 周」
        </h3>
        <p style={confirmDescStyle}>
          从 <code>{fileName}</code> 解析到 {items.length} 条任务，全部导入到当前打开的
          「第 {cn(weekNumber)} 周」（Excel 中的周编号会被忽略）。同任务名的条目按所选方式处理：
        </p>
        <ul
          style={{
            margin: '0 0 16px',
            padding: 0,
            listStyle: 'none',
            maxHeight: '240px',
            overflowY: 'auto',
            border: '1px solid var(--color-border-thin)',
            borderRadius: 'var(--radius)',
          }}
        >
          {preview.map((it, idx) => (
            <li
              key={idx}
              style={{
                padding: '6px 6px',
                borderBottom: '1px solid var(--color-border-thin)',
                fontSize: '12px',
                color: 'var(--color-text-secondary)',
              }}
            >
              {idx + 1}. {it.task_name || '(无标题)'}{' '}
              · {it.section === 'CURRENT' ? '本周' : '下周'} · {it.is_completed}
            </li>
          ))}
          {items.length > 50 && (
            <li
              style={{
                padding: '6px 6px',
                fontSize: '11px',
                color: 'var(--color-text-tertiary)',
              }}
            >
              ... 共 {items.length} 条
            </li>
          )}
        </ul>
        {error && <div style={confirmErrorStyle}>{error}</div>}
        <div style={confirmFooterStyle}>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            style={ghostBtnStyle}
          >
            取消
          </button>
          <button
            type="button"
            onClick={onAppend}
            disabled={busy}
            style={ghostBtnStyle}
            title="同任务名的条目跳过；其他条目追加到当前周"
          >
            {busy ? '追加中…' : '追加 · 跳过同名'}
          </button>
          <button
            type="button"
            onClick={onReplace}
            disabled={busy}
            style={{
              ...dangerBtnStyle,
              opacity: busy ? 0.6 : 1,
            }}
            title="先删除当前周全部条目，再写入 Excel 中的条目（不可撤销）"
          >
            {busy ? '覆盖中…' : `覆盖当前周 · 写 ${items.length} 条`}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * 维护者 2026-08-31：周报 modal 内「结转…」按钮 → 源周号选择器
 * 列出所有 < targetWeek 的周；选中后展示该周 NEXT 段条目预览；用户点确认才真正落库
 */
function CarryOverSourcePickerModal({
  entries,
  targetWeek,
  sourceWeek,
  onSelectSource,
  onCancel,
  onConfirm,
  busy,
  zIndex,
}: {
  entries: WeeklyReportEntry[]
  targetWeek: number
  sourceWeek: number | null
  onSelectSource: (w: number) => void
  onCancel: () => void
  onConfirm: () => void
  busy: boolean
  /** 维护者 2026-08-31：父 modal 最大化时传 10000，避免被 z-index:9999 遮挡 */
  zIndex?: number
}) {
  // 所有 < targetWeek 的周 + 该周 NEXT 段条目
  const candidates = useMemo(() => {
    const map = new Map<number, WeeklyReportEntry[]>()
    for (const e of entries) {
      if (e.week_number >= targetWeek) continue
      if (e.section !== 'NEXT') continue
      const list = map.get(e.week_number) ?? []
      list.push(e)
      map.set(e.week_number, list)
    }
    return [...map.keys()]
      .sort((a, b) => b - a) // 倒序：最近一周在最上
      .map((w) => ({ week_number: w, items: map.get(w) ?? [] }))
  }, [entries, targetWeek])

  const sourceItems =
    sourceWeek !== null
      ? candidates.find((c) => c.week_number === sourceWeek)?.items ?? []
      : []

  const noCandidates = candidates.length === 0

  return (
    <div
      style={{ ...confirmOverlayStyle, zIndex: zIndex ?? 300 }}
      onClick={() => !busy && onCancel()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          ...confirmBoxStyle,
          width: 560,
          maxWidth: '90vw',
          maxHeight: '85vh',
          overflowY: 'auto',
        }}
      >
        <h3 style={confirmTitleStyle}>
          结转到「第 {cn(targetWeek)} 周」
        </h3>
        <p style={confirmDescStyle}>
          选择要从中结转的源周号。源周「下周项目工作计划」中已完成的会进入「本周工作情况」，未完成的继续留在「下周项目工作计划」。
          <br />
          <span style={{ color: 'var(--color-status-warning)' }}>
            确认后立即写入数据库。
          </span>
        </p>

        {noCandidates ? (
          <div
            style={{
              padding: '20px 12px',
              textAlign: 'center',
              color: 'var(--color-text-tertiary)',
              fontSize: 12,
              border: '1px dashed var(--color-border-thin)',
              borderRadius: 'var(--radius)',
              marginBottom: 14,
            }}
          >
            暂无更早的周（小于第 {cn(targetWeek)} 周），无法结转。
          </div>
        ) : (
          <>
            <div
              style={{
                marginBottom: 14,
                fontSize: 12,
                color: 'var(--color-text-secondary)',
              }}
            >
              源周候选：
            </div>
            <div
              style={{
                maxHeight: 180,
                overflowY: 'auto',
                border: '1px solid var(--color-border-thin)',
                borderRadius: 'var(--radius)',
                marginBottom: 14,
              }}
            >
              {candidates.map((c) => (
                <label
                  key={c.week_number}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 6px',
                    borderBottom: '1px solid var(--color-border-thin)',
                    cursor: busy ? 'not-allowed' : 'pointer',
                    background:
                      sourceWeek === c.week_number
                        ? 'rgba(59,130,246,0.08)'
                        : 'transparent',
                  }}
                >
                  <input
                    type="radio"
                    name="carry-over-source"
                    checked={sourceWeek === c.week_number}
                    disabled={busy}
                    onChange={() => onSelectSource(c.week_number)}
                    style={{ margin: 0 }}
                  />
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--color-text)',
                      flexShrink: 0,
                    }}
                  >
                    第 {cn(c.week_number)} 周
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      color: 'var(--color-text-tertiary)',
                      marginLeft: 'auto',
                    }}
                  >
                    「下周计划」{c.items.length} 条
                  </span>
                </label>
              ))}
            </div>
          </>
        )}

        {sourceItems.length > 0 && (
          <>
            <div
              style={{
                marginBottom: 6,
                fontSize: 12,
                color: 'var(--color-text-secondary)',
              }}
            >
              即将结转到「第 {cn(targetWeek)} 周」的条目：
            </div>
            <div
              style={{
                maxHeight: 200,
                overflowY: 'auto',
                border: '1px solid var(--color-border-thin)',
                borderRadius: 'var(--radius)',
                marginBottom: 14,
                fontSize: 12,
              }}
            >
              {sourceItems.map((it, idx) => {
                const isDone = it.is_completed === 'COMPLETED'
                return (
                  <div
                    key={it.id}
                    style={{
                      padding: '6px 6px',
                      borderBottom:
                        idx < sourceItems.length - 1
                          ? '1px solid var(--color-border-thin)'
                          : 'none',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <span
                      style={{ flex: 1, color: 'var(--color-text)' }}
                    >
                      {it.task_name}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        color: isDone
                          ? 'var(--color-status-success, #16a34a)'
                          : 'var(--color-status-warning, #d97706)',
                        fontFamily: 'var(--font-mono)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {isDone ? '→ 本周工作情况' : '→ 继续：下周项目工作计划'}
                    </span>
                  </div>
                )
              })}
            </div>
          </>
        )}

        <div style={confirmFooterStyle}>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            style={ghostBtnStyle}
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || sourceWeek === null || sourceItems.length === 0}
            style={primaryBtnStyle}
          >
            {busy ? '结转中…' : `确认结转 ${sourceItems.length} 条`}
          </button>
        </div>
      </div>
    </div>
  )
}

const weeklyThStyle: React.CSSProperties = {
  padding: '8px 10px',
  fontSize: '11px',
  fontWeight: 500,
  color: 'var(--color-text-tertiary)',
  textAlign: 'left',
  borderBottom: '1px solid var(--color-border-thin)',
  whiteSpace: 'normal',
  wordBreak: 'break-word',
}

const weeklyTdStyle: React.CSSProperties = {
  padding: '8px 10px',
  fontSize: '12px',
  color: 'var(--color-text)',
  borderBottom: '1px solid var(--color-border-thin)',
  verticalAlign: 'top',
}


/** 行内小图标按钮（编辑/删除） */
const rowIconBtnStyle: React.CSSProperties = {
  border: '1px solid var(--color-border-thin)',
  background: 'transparent',
  borderRadius: '3px',
  padding: '2px 5px',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  color: 'var(--color-text-secondary)',
  flexShrink: 0,
}


/** 通用 confirm 模态框样式 */
const confirmOverlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 300,
  background: 'var(--glass-overlay)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const confirmBoxStyle: React.CSSProperties = {
  width: '420px',
  background: 'var(--glass-bg-strong)',
  backdropFilter: 'var(--glass-blur)',
  WebkitBackdropFilter: 'var(--glass-blur)',
  border: '1px solid var(--glass-border)',
  borderRadius: 'var(--radius-xl)',
  padding: '20px',

}

const confirmTitleStyle: React.CSSProperties = {
  fontSize: '15px',
  fontWeight: 600,
  margin: '0 0 12px',
  color: 'var(--color-text)',
}

const confirmDescStyle: React.CSSProperties = {
  fontSize: '13px',
  color: 'var(--color-text-secondary)',
  margin: '0 0 16px',
  lineHeight: 1.6,
}

const confirmErrorStyle: React.CSSProperties = {
  color: 'var(--color-status-danger)',
  fontSize: '12px',
  marginBottom: '12px',
}

const confirmFooterStyle: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  justifyContent: 'flex-end',
}

/** 危险按钮（红色 · 删除 / 确认） */
const dangerBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '5px 12px',
  border: 'none',
  borderRadius: 'var(--radius)',
  background: 'var(--color-status-danger)',
  color: 'white',
  fontSize: '12px',
  fontWeight: 500,
  cursor: 'pointer',
}

// ============================================================
// 一级 · 风险登记册（V2：从 planning.issues 升级为一级 tab）
// ============================================================

/**
 * 风险登记册 tab · 原 IssueRegisterTab 重命名
 * 维护者 2026-08-26 V2 spec：从 planning 二级 tab 升级为顶级 tab
 * 保留全部 CRUD + Excel 导入导出 + 状态自动推断逻辑
 */
function RisksTab({
  projectId,
  data,
  onRefresh,
}: {
  projectId: number
  data: ProjectDetailData
  onRefresh: () => Promise<void>
}) {
  // 行内编辑：本地 issues 镜像 + 草稿行
  const [issues, setIssues] = useState<ProjectIssue[]>(data.issues)
  const [draftIssue, setDraftIssue] = useState<ProjectIssue | null>(null)
  useEffect(() => {
    setIssues(data.issues)
  }, [data.issues])

  const [deleting, setDeleting] = useState<ProjectIssue | null>(null)
  const [importConfirm, setImportConfirm] = useState<ProjectIssue[] | null>(
    null,
  )
  const [importFile, setImportFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [overwritePrompt, setOverwritePrompt] = useState<{ existing: number; imported: number } | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  // 风险登记册全屏最大化
  const [maximized, setMaximized] = useState(false)

  // 列宽可拖拽 · localStorage 持久化
  const { widths, dragHandle } = useResizableColumns('risks', RISK_COLUMN_DEFAULTS)

  // 状态自动推断（不维护者 2026-08-26 拍板）
  //   actual_date 填 → RESOLVED
  //   plan_date 填 + actual_date 空 → IN_PROGRESS
  //   其它 → OPEN
  function deriveStatus(next: {
    plan_date: string | null
    actual_date: string | null
  }): ProjectIssue['status'] {
    if (next.actual_date) return 'RESOLVED'
    if (next.plan_date) return 'IN_PROGRESS'
    return 'OPEN'
  }

  // 行内 cell 失焦提交：写库 + 本地 patch（不整表 reload，避免覆盖并发提交）
  const handleIssueCellCommit = async (
    issue: ProjectIssue,
    next: Partial<ProjectIssue>,
  ) => {
    if (busy) return
    const merged: ProjectIssue = {
      ...issue,
      ...next,
      status: deriveStatus({
        plan_date: (next.plan_date ?? issue.plan_date) || null,
        actual_date: (next.actual_date ?? issue.actual_date) || null,
      }),
    }
    setBusy(true)
    setError(null)
    try {
      if (issue.id === 0) {
        // 草稿行：title 为空时保留在本地，不写库
        if (!merged.title.trim()) {
          setDraftIssue(merged)
          return
        }
        const newId = await createProjectIssue({
          project_id: projectId,
          title: merged.title.trim(),
          description: merged.description?.trim() || null,
          discovered_at: merged.discovered_at || null,
          level: merged.level,
          plan_date: merged.plan_date || null,
          owner: merged.owner?.trim() || null,
          actual_date: merged.actual_date || null,
          solution: merged.solution?.trim() || null,
          status: merged.status,
        })
        const persisted: ProjectIssue = {
          ...merged,
          id: newId,
          created_at: '',
          updated_at: '',
        }
        setIssues((prev) => [...prev, persisted])
        setDraftIssue(null) // 草稿转正式行
        void onRefresh() // fire-and-forget：让上方统计卡片也更新
      } else {
        await updateProjectIssue(issue.id, {
          title: merged.title.trim(),
          description: merged.description?.trim() || null,
          discovered_at: merged.discovered_at || null,
          level: merged.level,
          plan_date: merged.plan_date || null,
          owner: merged.owner?.trim() || null,
          actual_date: merged.actual_date || null,
          solution: merged.solution?.trim() || null,
          status: merged.status,
        })
        setIssues((prev) =>
          prev.map((it) => (it.id === issue.id ? merged : it)),
        )
        void onRefresh()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const handleIssueDeleteRow = async (issue: ProjectIssue) => {
    if (issue.id === 0) {
      setDraftIssue(null)
      return
    }
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await deleteProjectIssue(issue.id)
      setIssues((prev) => prev.filter((it) => it.id !== issue.id))
      void onRefresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  // 「登记问题」：插一行空白草稿（默认今天 · 中等）
  const handleAddIssue = () => {
    setDraftIssue({
      id: 0,
      project_id: projectId,
      title: '',
      description: null,
      level: 'MEDIUM',
      owner: null,
      plan_date: null,
      actual_date: null,
      discovered_at: todayLocal(),
      solution: null,
      resolution: null,
      status: 'OPEN',
      created_at: '',
      updated_at: '',
    })
  }

  // 导出
  const handleExport = async () => {
    try {
      const blob = await exportRisksToExcel(issues)
      const filename = `${data.project.project_name}-风险登记册-${todayLocal()}.xlsx`
      const ok = await saveBlobToDirectory(blob, filename)
      if (ok) toast.success(`已导出 ${issues.length} 条风险`, filename)
      else toast.error('导出失败', '浏览器拦截了下载')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error('导出风险登记册失败', msg)
      setError(msg)
    }
  }

  // 导入文件解析
  const handleImportFile = async (file: File) => {
    setBusy(true)
    setError(null)
    try {
      const parsed = await parseRisksExcel(file, projectId)
      if (fileInputRef.current) fileInputRef.current.value = ''
      if (parsed.length === 0) {
        setError('Excel 中未发现有效的风险条目')
        return
      }
      setImportFile(file)
      setImportConfirm(parsed)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      if (fileInputRef.current) fileInputRef.current.value = ''
    } finally {
      setBusy(false)
    }
  }

  // 追加导入：保留现有，只写入 Excel 中的条目
  const handleImportAppend = async () => {
    if (!importConfirm || busy) return
    setBusy(true)
    setError(null)
    try {
      for (const it of importConfirm) {
        await createProjectIssue({
          project_id: projectId,
          title: it.title,
          description: it.description,
          level: it.level,
          owner: it.owner,
          plan_date: it.plan_date,
          actual_date: it.actual_date,
          solution: it.solution,
          status: it.status,
        })
      }
      setImportConfirm(null)
      setImportFile(null)
      await onRefresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  // 覆盖导入：先删除现有全部风险条目，再写入 Excel 中的条目
  const handleImportReplace = async () => {
    if (!importConfirm || busy) return
    setBusy(true)
    setError(null)
    try {
      // 快照现有的 id 列表（避免遍历中变更）
      const existingIds = issues.map((it) => it.id)
      for (const id of existingIds) {
        await deleteProjectIssue(id)
      }
      // 乐观更新本地镜像
      setIssues((prev) => [])
      for (const it of importConfirm) {
        await createProjectIssue({
          project_id: projectId,
          title: it.title,
          description: it.description,
          level: it.level,
          owner: it.owner,
          plan_date: it.plan_date,
          actual_date: it.actual_date,
          solution: it.solution,
          status: it.status,
        })
      }
      setImportConfirm(null)
      setImportFile(null)
      await onRefresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  // 确认删除
  const handleDeleteConfirm = async () => {
    if (!deleting || busy) return
    setBusy(true)
    setError(null)
    try {
      await deleteProjectIssue(deleting.id)
      setDeleting(null)
      setIssues((prev) => prev.filter((it) => it.id !== deleting.id))
      await onRefresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const showTopError =
    error !== null &&
    deleting === null &&
    importConfirm === null &&
    draftIssue === null

  const sectionEl = (
    <Section
      title="风险登记册"
      icon={AlertOctagon}
      accent="var(--color-status-danger)"
      rightSlot={
        <div
          style={{
            display: 'flex',
            gap: '6px',
            alignItems: 'center',
            flexWrap: 'wrap',
            justifyContent: 'flex-end',
          }}
        >
          <button
            type="button"
            onClick={() => downloadProjectTemplate()}
            style={ghostBtnStyle}
            title="下载 Excel 模板"
            data-testid="issue-template"
          >
            <Download size={11} />
            下载模板
          </button>
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={busy || issues.length === 0}
            style={ghostBtnStyle}
            title="导出风险登记册"
            data-testid="issue-export"
          >
            <Upload size={11} />
            导出
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            style={ghostBtnStyle}
            title="从 Excel 导入"
            data-testid="issue-import"
          >
            <Upload size={11} />
            导入
          </button>
          <button
            type="button"
            onClick={handleAddIssue}
            disabled={busy}
            data-testid="add-issue"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 10px',
              border: 'none',
              borderRadius: 'var(--radius)',
              background: 'var(--color-status-danger)',
              color: 'white',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <Plus size={11} />
            登记问题
          </button>
          {/* 全屏最大化 / 还原 */}
          <button
            type="button"
            onClick={() => setMaximized((m) => !m)}
            data-testid="risk-maximize-toggle"
            style={ghostBtnStyle}
            title={maximized ? '还原' : '全屏最大化风险登记册'}
          >
            {maximized ? <Minimize size={11} /> : <Maximize size={11} />}
            {maximized ? '还原' : '最大化'}
          </button>
        </div>
      }
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void handleImportFile(f)
          e.target.value = ''
        }}
      />

      {showTopError && (
        <div
          style={{
            marginBottom: '10px',
            padding: '8px 12px',
            borderRadius: 'var(--radius)',
            background: 'rgba(239,68,68,0.08)',
            color: 'var(--color-status-danger)',
            fontSize: '12px',
          }}
        >
          {error}
        </div>
      )}

      {issues.length === 0 && !draftIssue ? (
        <EmptyHint text="该项目暂无问题 · 点 [登记问题] 或 [导入] 从 Excel 加载" />
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              tableLayout: 'fixed',
              borderCollapse: 'collapse',
              fontSize: '12px',
            }}
          >
            <thead>
              <tr style={{ background: 'var(--color-bg-muted)' }}>
                <ResizableTh width={widths.idx} dragHandle={dragHandle('idx', 28, 60)} style={weeklyThStyle}>序号</ResizableTh>
                <ResizableTh width={widths.title} dragHandle={dragHandle('title')} style={weeklyThStyle}>描述</ResizableTh>
                <ResizableTh width={widths.discovered} dragHandle={dragHandle('discovered')} style={weeklyThStyle}>发现时间</ResizableTh>
                <ResizableTh width={widths.description} dragHandle={dragHandle('description')} style={weeklyThStyle}>处理方法</ResizableTh>
                <ResizableTh width={widths.level} dragHandle={dragHandle('level', 50, 100)} style={weeklyThStyle}>等级</ResizableTh>
                <ResizableTh width={widths.plan} dragHandle={dragHandle('plan')} style={weeklyThStyle}>计划解决时间</ResizableTh>
                <ResizableTh width={widths.owner} dragHandle={dragHandle('owner')} style={weeklyThStyle}>责任人</ResizableTh>
                <ResizableTh width={widths.actual} dragHandle={dragHandle('actual')} style={weeklyThStyle}>实际解决时间</ResizableTh>
                <ResizableTh width={widths.solution} dragHandle={dragHandle('solution')} style={weeklyThStyle}>解决情况</ResizableTh>
                <ResizableTh width={widths.ops} dragHandle={dragHandle('ops', 50, 100)} style={weeklyThStyle}>操作</ResizableTh>
              </tr>
            </thead>
            <tbody>
              {issues.map((it, idx) => (
                <IssueRowDisplay
                  key={it.id}
                  issue={it}
                  index={idx + 1}
                  saving={busy}
                  onCommit={(next) => void handleIssueCellCommit(it, next)}
                  onDelete={() => setDeleting(it)}
                />
              ))}
              {draftIssue && (
                <IssueRowDisplay
                  key="new-issue"
                  issue={draftIssue}
                  index={issues.length + 1}
                  saving={busy}
                  isDraft
                  onCommit={(next) => void handleIssueCellCommit(draftIssue, next)}
                  onDelete={() => setDraftIssue(null)}
                />
              )}
            </tbody>
          </table>
        </div>
      )}

      {deleting !== null && (
        <div
          style={confirmOverlayStyle}
          onClick={() => !busy && setDeleting(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={confirmBoxStyle}
          >
            <h3 style={confirmTitleStyle}>删除风险条目</h3>
            <p style={confirmDescStyle}>
              确定要删除「{deleting.title || '(无标题)'}」？该操作不可撤销。
            </p>
            {error && <div style={confirmErrorStyle}>{error}</div>}
            <div style={confirmFooterStyle}>
              <button
                type="button"
                onClick={() => setDeleting(null)}
                disabled={busy}
                style={ghostBtnStyle}
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteConfirm()}
                disabled={busy}
                style={dangerBtnStyle}
              >
                {busy ? '处理中…' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}

      {importConfirm !== null && (
        <IssueImportConfirmModal
          items={importConfirm}
          fileName={importFile?.name ?? ''}
          existingCount={issues.length}
          busy={busy}
          error={error}
          onCancel={() => {
            setImportConfirm(null)
            setImportFile(null)
          }}
          onAppend={() => void handleImportAppend()}
          onReplace={() => void handleImportReplace()}
        />
      )}
    </Section>
  )

  // 全屏最大化浮窗（fixed 覆盖整个视口 · 表格自带横向滚动）
  if (maximized) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          background: 'var(--color-surface)',
          padding: 16,
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 12,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: 'var(--color-text)',
            }}
          >
            风险登记册（全屏）
          </div>
        </div>
        {sectionEl}
      </div>
    )
  }

  return sectionEl
}

/** 风险登记册表格行 · 行内编辑 · 维护者 2026-08-28 重构
 * 每个 cell 点击进入 InlineEditableCell，失焦自动写库
 */
function IssueRowDisplay({
  issue,
  index,
  saving,
  isDraft = false,
  onCommit,
  onDelete,
}: {
  issue: ProjectIssue
  index: number
  saving: boolean
  isDraft?: boolean
  onCommit: (next: Partial<ProjectIssue>) => void
  onDelete: () => void
}) {
  const levelToCn: Record<ProjectIssue['level'], string> = {
    LOW: '低',
    MEDIUM: '中',
    HIGH: '高',
    CRITICAL: '紧急',
  }
  const isClosed = issue.status === 'RESOLVED' || issue.status === 'CLOSED'
  return (
    <tr
      data-testid={isDraft ? 'issue-row-draft' : `issue-row-${issue.id}`}
      style={{ opacity: isClosed && !isDraft ? 0.55 : 1 }}
    >
      <td
        style={{
          ...weeklyTdStyle,
          fontFamily: 'var(--font-mono)',
          color: 'var(--color-text-tertiary)',
        }}
      >
        {index}
      </td>
      <td style={weeklyTdStyle}>
        <InlineEditableCell
          value={issue.title}
          placeholder={isDraft ? '问题描述（必填）' : '(无标题)'}
          onCommit={(v) => onCommit({ title: v })}
        />
      </td>
      <td style={weeklyTdStyle}>
        <InlineEditableCell
          value={issue.discovered_at}
          type="date"
          mono
          onCommit={(v) => onCommit({ discovered_at: v || null })}
        />
      </td>
      <td style={weeklyTdStyle}>
        <InlineEditableCell
          value={issue.description}
          multiline
          placeholder="处理方法"
          onCommit={(v) => onCommit({ description: v || null })}
        />
      </td>
      <td style={weeklyTdStyle}>
        <InlineEditableCell
          value={issue.level}
          type="select"
          options={['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']}
          optionLabels={levelToCn}
          displayFormatter={(raw) =>
            levelToCn[String(raw) as ProjectIssue['level']] ?? String(raw)
          }
          onCommit={(v) =>
            onCommit({ level: v as ProjectIssue['level'] })
          }
        />
      </td>
      <td style={weeklyTdStyle}>
        <InlineEditableCell
          value={issue.plan_date}
          type="date"
          mono
          onCommit={(v) => onCommit({ plan_date: v || null })}
        />
      </td>
      <td style={weeklyTdStyle}>
        <InlineEditableCell
          value={issue.owner}
          placeholder="责任人"
          onCommit={(v) => onCommit({ owner: v || null })}
        />
      </td>
      <td style={weeklyTdStyle}>
        <InlineEditableCell
          value={issue.actual_date}
          type="date"
          mono
          onCommit={(v) => onCommit({ actual_date: v || null })}
        />
      </td>
      <td style={weeklyTdStyle}>
        <InlineEditableCell
          value={issue.solution}
          multiline
          placeholder="解决情况"
          onCommit={(v) => onCommit({ solution: v || null })}
        />
      </td>
      <td style={weeklyTdStyle}>
        <button
          type="button"
          onClick={onDelete}
          disabled={saving}
          title="删除"
          data-testid={isDraft ? 'issue-delete-draft' : `issue-delete-${issue.id}`}
          style={{
            ...rowIconBtnStyle,
            color: 'var(--color-status-danger)',
          }}
        >
          <Trash2 size={11} />
        </button>
      </td>
    </tr>
  )
}

/** IssueImportConfirmModal · 风险条目导入确认 */
function IssueImportConfirmModal({
  items,
  fileName,
  existingCount,
  busy,
  error,
  onCancel,
  onAppend,
  onReplace,
}: {
  items: ProjectIssue[]
  fileName: string
  existingCount: number
  busy: boolean
  error: string | null
  onCancel: () => void
  onAppend: () => void
  onReplace: () => void
}) {
  const preview = items.slice(0, 50)
  return (
    <div style={confirmOverlayStyle} onClick={() => !busy && onCancel()}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          ...confirmBoxStyle,
          width: '520px',
          maxHeight: '80vh',
          overflowY: 'auto',
        }}
      >
        <h3 style={confirmTitleStyle}>导入风险条目</h3>
        <p style={confirmDescStyle}>
          从 <code>{fileName}</code> 解析到 {items.length} 条。 当前项目已有{' '}
          <strong>{existingCount}</strong> 条风险条目，请选择导入方式：
        </p>
        <ul
          style={{
            margin: '0 0 16px',
            padding: 0,
            listStyle: 'none',
            maxHeight: '240px',
            overflowY: 'auto',
            border: '1px solid var(--color-border-thin)',
            borderRadius: 'var(--radius)',
          }}
        >
          {preview.map((it, idx) => (
            <li
              key={idx}
              style={{
                padding: '6px 6px',
                borderBottom: '1px solid var(--color-border-thin)',
                fontSize: '12px',
                color: 'var(--color-text-secondary)',
              }}
            >
              {idx + 1}. {it.title || '(无标题)'} · {it.level} · {it.status}
            </li>
          ))}
          {items.length > 50 && (
            <li
              style={{
                padding: '6px 6px',
                fontSize: '11px',
                color: 'var(--color-text-tertiary)',
              }}
            >
              ... 共 {items.length} 条
            </li>
          )}
        </ul>
        {error && <div style={confirmErrorStyle}>{error}</div>}
        <div style={confirmFooterStyle}>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            style={ghostBtnStyle}
          >
            取消
          </button>
          <button
            type="button"
            onClick={onAppend}
            disabled={busy}
            style={ghostBtnStyle}
            title="保留现有风险条目，只追加导入的条目"
          >
            {busy ? '处理中…' : `追加 ${items.length} 条`}
          </button>
          <button
            type="button"
            onClick={onReplace}
            disabled={busy}
            style={{
              ...dangerBtnStyle,
              opacity: busy ? 0.6 : 1,
            }}
            title="删除现有全部风险条目，再写入导入的条目（不可撤销）"
          >
            {busy ? '覆盖中…' : `覆盖 · 删 ${existingCount} 写 ${items.length}`}
          </button>
        </div>
      </div>
    </div>
  )
}


// ============================================================
// 一级 · 知识中心（项目维度笔记 · 复用 KnowledgeSpaceView）
// ============================================================

// ============================================================
// 一级 tab 组件：知识中心
// ============================================================

function KnowledgeTab({ data }: { data: ProjectDetailData }) {
  const project = data.project
  const [spaces, setSpaces] = useState<KnowledgeSpace[]>([])
  const [activeSpaceId, setActiveSpaceId] = useState<number | null>(null)
  const [allSpaces, setAllSpaces] = useState<KnowledgeSpace[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [binding, setBinding] = useState(false)
  const [confirmUnbind, setConfirmUnbind] = useState(false)

  const reload = useCallback(async () => {
    // 该项目通过绑定关系可访问的所有知识库（M:N · 不依赖 space.project_id）
    const bound = await listProjectBindings(project.id)
    const resolved: KnowledgeSpace[] = []
    for (const b of bound) {
      try {
        const sp = await getKnowledgeSpace(b.knowledgeSpaceId)
        if (sp) resolved.push(sp)
      } catch { /* ignore */ }
    }
    setSpaces(resolved)
    setActiveSpaceId((cur) => (resolved.some((x) => x.id === cur) ? cur : resolved[0]?.id ?? null))
  }, [project.id])

  // 挂载时加载绑定 + 拉取知识中心所有项目知识库（供绑定选择）
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const all = await listAllProjectSpaces()
        if (alive) setAllSpaces(all)
      } catch { /* ignore */ }
    })()
    ;(async () => {
      try {
        await reload()
      } catch { /* ignore */ }
    })()
    return () => { alive = false }
  }, [reload])

  const activeSpace = spaces.find((sp) => sp.id === activeSpaceId) ?? null

  const handleBind = async (spaceId: number) => {
    setBinding(true)
    try {
      await createBinding({ projectId: project.id, knowledgeSpaceId: spaceId })
      toast.success('已绑定知识库')
      setPickerOpen(false)
      await reload()
      setActiveSpaceId(spaceId)
    } catch (e) {
      toast.error(`绑定失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBinding(false)
    }
  }

  const handleUnbind = async () => {
    if (activeSpaceId == null) return
    try {
      await deleteBinding(project.id, activeSpaceId)
      toast.success('已解绑该项目的知识库（知识已保留）')
      setConfirmUnbind(false)
      await reload()
    } catch (e) {
      toast.error(`解绑失败：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // 可选（未绑定的）知识库：知识中心里的 project 空间，排除已绑定的
  const unboundSpaces = allSpaces.filter((sp) => !spaces.some((b) => b.id === sp.id))

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 480 }}>
      {/* 顶部工具栏（参考项目文件管理布局） */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 14px',
          borderBottom: '1px solid var(--color-border)',
          background: 'var(--color-bg-subtle)',
          flexShrink: 0,
        }}
      >
        <BookOpen size={14} color="var(--color-text-secondary)" />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>
          项目知识库
        </span>
        <span
          style={{
            flex: 1, minWidth: 0, fontSize: 11, color: 'var(--color-text-tertiary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginLeft: 8,
          }}
          title={activeSpace?.name ?? ''}
        >
          {spaces.length > 1 ? (
            <select
              value={activeSpaceId ?? ''}
              onChange={(e) => setActiveSpaceId(Number(e.target.value))}
              style={{
                fontSize: 11, padding: '2px 6px', border: '1px solid var(--color-border)',
                borderRadius: 6, background: 'var(--color-bg)', color: 'var(--color-text)',
                maxWidth: 220,
              }}
              title="切换知识库"
            >
              {spaces.map((sp) => (
                <option key={sp.id} value={sp.id}>{sp.name}</option>
              ))}
            </select>
          ) : (
            activeSpace?.name
          )}
        </span>
        {activeSpaceId != null && (
          <button
            type="button"
            onClick={handleUnbind}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px',
              fontSize: 11, background: 'transparent', color: '#dc2626',
              border: '1px solid rgba(220,38,38,0.3)', borderRadius: 'var(--radius)',
              cursor: 'pointer',
            }}
            title="解绑：仅移除项目入口，知识保留在知识中心，可随时重新绑定"
          >
            <X size={11} /> 解绑
          </button>
        )}
      </div>

      {/* 主体 */}
      <div style={{ flex: 1, minHeight: 0 }}>
        {activeSpaceId == null ? (
          <div
            style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', gap: 14, color: 'var(--color-text-tertiary)', padding: 32,
              height: '100%',
            }}
          >
            <BookOpen size={48} strokeWidth={1.25} />
            <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
              绑定一个知识库，开始浏览与编辑项目知识
            </div>
            <div style={{ fontSize: 11, maxWidth: 480, textAlign: 'center', lineHeight: 1.6 }}>
              如需新建知识库，请前往「知识中心 → 项目知识中心」创建后再回到这里绑定。
            </div>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 6px',
                background: 'var(--color-accent)', color: 'var(--color-text-on-accent, #fff)',
                border: 'none', borderRadius: 'var(--radius)', fontSize: 12, fontWeight: 500,
                cursor: 'pointer', marginTop: 4,
              }}
            >
              <Plus size={12} /> 选择知识库
            </button>
          </div>
        ) : (
          <ProjectKnowledgeCenter
            spaceId={activeSpaceId}
            projectId={project.id}
            projectName={activeSpace?.name ?? project.project_name}
          />
        )}
      </div>

      {/* 选择知识库弹窗（绑定） */}
      {pickerOpen && (
        <div
          onClick={() => setPickerOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--color-bg)', borderRadius: 'var(--radius-md)', padding: 24,
              maxWidth: 440, width: '90%', boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            }}
          >
            <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 12px', color: 'var(--color-text)' }}>
              选择知识库
            </h3>
            {unboundSpaces.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>
                知识中心暂无可绑定的知识库。请先去「项目知识中心」新建，再回到这里绑定。
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 300, overflowY: 'auto' }}>
                {unboundSpaces.map((sp) => (
                  <button
                    key={sp.id}
                    type="button"
                    onClick={() => void handleBind(sp.id)}
                    disabled={binding}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                      background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border-thin)',
                      borderRadius: 'var(--radius)', cursor: binding ? 'not-allowed' : 'pointer',
                      fontSize: 13, color: 'var(--color-text)', textAlign: 'left', opacity: binding ? 0.5 : 1,
                    }}
                  >
                    <BookOpen size={13} color="var(--color-accent)" />
                    <span style={{ flex: 1 }}>{sp.name}</span>
                    <Plus size={12} />
                  </button>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                style={{
                  padding: '6px 6px', fontSize: 12, border: '1px solid var(--color-border)',
                  background: 'var(--color-bg)', color: 'var(--color-text)', borderRadius: 'var(--radius)',
                  cursor: 'pointer',
                }}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmUnbind && activeSpaceId != null && (
        <ConfirmUnbindKnowledgeDialog
          projectName={project.project_name}
          onConfirm={handleUnbind}
          onCancel={() => setConfirmUnbind(false)}
        />
      )}
    </div>
  )
}

function ConfirmUnbindKnowledgeDialog({
  projectName,
  onConfirm,
  onCancel,
}: {
  projectName: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--color-bg)',
          borderRadius: 'var(--radius-md)',
          padding: 24,
          maxWidth: 420,
          width: '90%',
          boxShadow: '0 4px 30px rgba(0,0,0,0.3)',
        }}
      >
        <h3 style={{ fontSize: 15, fontWeight: 670, margin: '0 0 12px', color: 'var(--color-text)' }}>
          解绑「{projectName}」的知识库？
        </h3>
        <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.6, margin: '0 0 20px' }}>
          解绑仅移除项目中心对该知识库的访问入口，<strong>不会删除</strong>该知识库下的目录、知识、附件。
          <br />
          知识仍保留在「知识中心 → 项目知识中心」，可随时重新添加。
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '7px 18px',
              fontSize: 13,
              border: '1px solid var(--color-border)',
              background: 'var(--color-bg)',
              color: 'var(--color-text)',
              borderRadius: 'var(--radius)',
              cursor: 'pointer',
            }}
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              padding: '7px 24px',
              fontSize: 13,
              border: 'none',
              background: 'var(--color-accent)',
              color: 'var(--color-text-on-accent, #fff)',
              borderRadius: 'var(--radius)',
              cursor: 'pointer',
              fontWeight: 500,
            }}
          >
            解绑
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// 一级 · 项目文件管理（维护者 2026-08-31 · 本地目录绑定 + 文件树 + 多类型预览）
// ============================================================

/** FilesTab 顶层错误边界 · 单个 chunk / 子组件挂掉时不让整个 tab 崩溃 */
class FilesTabErrorBoundary extends Component<
  { children: ReactNode; onError?: (e: unknown) => void },
  { hasError: boolean; message: string }
> {
  state = { hasError: false, message: '' }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error?.message ?? String(error) }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[FilesTab] render crash:', error, info)
    this.props.onError?.(error)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: 24,
            color: 'var(--color-text-secondary)',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border-thin)',
            borderRadius: 'var(--radius-md)',
            margin: 16,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: '#dc2626', marginBottom: 8 }}>
            文件管理面板渲染失败
          </div>
          <div style={{ fontSize: 12, marginBottom: 12, fontFamily: 'monospace' }}>
            {this.state.message}
          </div>
          <button
            type="button"
            style={{
              padding: '4px 10px',
              fontSize: 12,
              border: '1px solid var(--color-border)',
              borderRadius: 4,
              background: 'var(--color-bg)',
              color: 'var(--color-text)',
              cursor: 'pointer',
            }}
            onClick={() => this.setState({ hasError: false, message: '' })}
          >
            重试
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

function FilesTab({
  projectId,
  data,
  onRefresh,
}: {
  projectId: number
  data: ProjectDetailData
  onRefresh: () => Promise<void>
}) {
  // ⚠️ 维护者 2026-08-31 修复：所有 hooks 必须在条件 return 之前调用（Rules of Hooks）
  // 之前把 useState 写在 if (!data || !data.project) return 之后，导致 hooks 顺序跨渲染跳变，
  // 是 React 警告 / 偶发崩溃的根因之一。现在统一放顶部。

  const [tree, setTree] = useState<FileNode | null>(null)
  const [selected, setSelected] = useState<FileNode | null>(null)
  const [loadingTree, setLoadingTree] = useState(false)
  const [treeError, setTreeError] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  /** 新建文件 / 文件夹的弹窗状态 */
  const [createMode, setCreateMode] = useState<null | 'file' | 'dir'>(null)
  const [createName, setCreateName] = useState('')
  const [creating, setCreating] = useState(false)
  /** 「新建」操作的目标父目录路径（默认绑定的根目录） */
  const [createParent, setCreateParent] = useState<string>('')

  /**
   * 维护者 2026-08-31：Tauri webview 默认拦截 window.confirm，必须用 inline 二次确认
   * （之前 handleDelete / handleClear 走的 window.confirm → 用户点按钮"没反应"）
   * 用一个统一的 pendingConfirm state 表达「等待确认的操作」：
   *   - { kind: 'delete', node } 删选中节点
   *   - { kind: 'clear' }         解除本地目录绑定
   */
  type PendingConfirm =
    | { kind: 'delete'; node: FileNode }
    | { kind: 'clear' }
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null)

  // 防御：data 或 data.project 缺失时不崩溃（迁移期 / 加载期）
  if (!data || !data.project) {
    return (
      <div style={{ padding: 32, color: 'var(--color-text-tertiary)', fontSize: 13, textAlign: 'center' }}>
        项目数据未就绪
      </div>
    )
  }

  const boundPath = data.project.local_directory_path

  const loadTree = async (rootPath: string) => {
    setLoadingTree(true)
    setTreeError(null)
    try {
      const node = await listProjectFiles(rootPath, 8)
      setTree(node)
    } catch (e) {
      console.error('[FilesTab] loadTree error:', e)
      setTreeError(e instanceof Error ? e.message : String(e))
      setTree(null)
    } finally {
      setLoadingTree(false)
    }
  }

  // 初次挂载：若已绑定目录则自动加载
  useEffect(() => {
    if (boundPath) {
      loadTree(boundPath)
    } else {
      setTree(null)
      setSelected(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundPath])

  const handlePick = async () => {
    setPicking(true)
    try {
      const picked = await pickProjectDirectory()
      if (!picked) {
        // 用户取消
        return
      }
      await setProjectLocalDirectory(projectId, picked)
      await onRefresh() // 重新拉 data.project.local_directory_path
      await loadTree(picked)
    } catch (e) {
      setTreeError(e instanceof Error ? e.message : String(e))
    } finally {
      setPicking(false)
    }
  }

  const handleClear = () => {
    // 维护者 2026-08-31：Tauri webview 拦截 window.confirm → 改 inline 二次确认
    setPendingConfirm({ kind: 'clear' })
  }

  /** 实际执行清除绑定（在 inline confirm 确认按钮里调） */
  const executeClear = async () => {
    try {
      await setProjectLocalDirectory(projectId, null)
      setTree(null)
      setSelected(null)
      await onRefresh()
    } catch (e) {
      setTreeError(e instanceof Error ? e.message : String(e))
    } finally {
      setPendingConfirm(null)
    }
  }

  const handleRefresh = async () => {
    if (boundPath) await loadTree(boundPath)
  }

  const handleOpenExternally = async () => {
    if (!selected) return
    try {
      await openFileExternal(selected.path)
    } catch (e) {
      setTreeError(e instanceof Error ? e.message : String(e))
    }
  }

  /** 打开「新建文件/文件夹」弹窗。parent 默认为绑定的根目录 */
  const openCreate = (mode: 'file' | 'dir', parentPath?: string) => {
    setCreateMode(mode)
    setCreateName('')
    setCreateParent(parentPath ?? boundPath ?? '')
  }
  const cancelCreate = () => {
    setCreateMode(null)
    setCreateName('')
  }

  /** 提交新建：拼接 parent + name，调 Rust createFile / createDirectory，刷新树 */
  const submitCreate = async () => {
    if (!createMode || !createParent || !createName.trim()) return
    setCreating(true)
    try {
      // 兼容 macOS / Windows 分隔符
      const sep = createParent.includes('\\') && !createParent.includes('/') ? '\\' : '/'
      const fullPath = createParent.replace(/[\/\\]+$/, '') + sep + createName.trim()
      if (createMode === 'file') {
        await createFile(fullPath)
      } else {
        await createDirectory(fullPath)
      }
      cancelCreate()
      // 局部刷新整棵树（不重拉后端 project data）
      await loadTree(boundPath!)
    } catch (e) {
      setTreeError(e instanceof Error ? e.message : String(e))
    } finally {
      setCreating(false)
    }
  }

  /** 删除当前选中节点（文件或目录） */
  const handleDelete = () => {
    if (!selected) return
    // 维护者 2026-08-31：Tauri webview 拦截 window.confirm → 改 inline 二次确认
    setPendingConfirm({ kind: 'delete', node: selected })
  }

  /** 实际执行删除（在 inline confirm 确认按钮里调） */
  const executeDelete = async (node: FileNode) => {
    try {
      await removePath(node.path)
      setSelected(null)
      await loadTree(boundPath!)
    } catch (e) {
      setTreeError(e instanceof Error ? e.message : String(e))
    } finally {
      setPendingConfirm(null)
    }
  }

  // 工具栏按钮样式
  const toolbarBtn: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 10px',
    fontSize: 12,
    color: 'var(--color-text)',
    background: 'var(--color-bg)',
    border: '1px solid var(--color-border)',
    borderRadius: 4,
    cursor: 'pointer',
  }
  const primaryBtn: React.CSSProperties = {
    ...toolbarBtn,
    color: '#fff',
    background: 'var(--color-accent, #2563eb)',
    border: 'none',
  }
  const dangerBtn: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 10px',
    fontSize: 12,
    color: 'var(--color-status-danger, #dc2626)',
    background: 'transparent',
    border: '1px solid var(--color-border-thin)',
    borderRadius: 4,
    cursor: 'pointer',
  }

  return (
    <div
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border-thin)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        // 高度跟随父容器 · 父级是项目详情主区域
        minHeight: 480,
      }}
    >
      {/* 顶部工具栏 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 14px',
          borderBottom: '1px solid var(--color-border)',
          background: 'var(--color-bg-subtle)',
          flexShrink: 0,
        }}
      >
        <FolderOpen size={14} color="var(--color-text-secondary)" />
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--color-text)',
          }}
        >
          项目文件管理
        </span>
        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 11,
            color: 'var(--color-text-tertiary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            marginLeft: 8,
          }}
          title={boundPath ?? ''}
        >
          {boundPath ? (
            <>
              <Folder size={11} style={{ verticalAlign: 'middle', marginRight: 4 }} />
              {boundPath}
            </>
          ) : (
            '尚未绑定本地目录'
          )}
        </span>
        {boundPath ? (
          <>
            <button
              type="button"
              style={toolbarBtn}
              onClick={handleRefresh}
              disabled={loadingTree}
              title="刷新文件树"
            >
              <RefreshCw
                size={12}
                style={{
                  animation: loadingTree ? 'spin 1s linear infinite' : 'none',
                }}
              />
              刷新
            </button>
            <button
              type="button"
              style={toolbarBtn}
              onClick={() => openCreate('file')}
              title="在项目根目录新建空文件"
            >
              <Plus size={12} />
              新建文件
            </button>
            <button
              type="button"
              style={toolbarBtn}
              onClick={() => openCreate('dir')}
              title="在项目根目录新建子目录"
            >
              <FolderPlus size={12} />
              新建文件夹
            </button>
            <button
              type="button"
              style={toolbarBtn}
              onClick={handlePick}
              disabled={picking}
            >
              {picking ? '选择中…' : '重新选择目录'}
            </button>
            {selected && (
              <button
                type="button"
                style={dangerBtn}
                onClick={handleDelete}
                title={`删除${selected.isDir ? '目录（含全部内容）' : '文件'}「${selected.name}」`}
              >
                <Trash2 size={12} />
                删除
              </button>
            )}
            <button
              type="button"
              style={dangerBtn}
              onClick={handleClear}
              title="解绑本地目录绑定（不会删除文件）"
            >
              <X size={12} />
              解绑目录
            </button>
          </>
        ) : (
          <button
            type="button"
            style={primaryBtn}
            onClick={handlePick}
            disabled={picking}
          >
            <Plus size={12} />
            {picking ? '选择中…' : '选择项目目录'}
          </button>
        )}
      </div>

      {treeError && (
        <div
          style={{
            padding: '6px 6px',
            fontSize: 12,
            color: '#dc2626',
            background: '#fef2f2',
            borderBottom: '1px solid #fecaca',
            flexShrink: 0,
          }}
        >
          {treeError}
        </div>
      )}

      {/* 新建文件 / 文件夹弹窗 */}
      {createMode && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
  background: 'var(--glass-overlay)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) cancelCreate()
          }}
        >
          <div
            style={{
              background: 'var(--glass-bg-strong)',
              backdropFilter: 'var(--glass-blur)',
              WebkitBackdropFilter: 'var(--glass-blur)',
              border: '1px solid var(--glass-border)',
              borderRadius: 'var(--radius-xl)',

              padding: 20,
              minWidth: 380,
              maxWidth: 520,
              boxShadow: 'var(--glass-shadow)',
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') cancelCreate()
              if (e.key === 'Enter') submitCreate()
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                marginBottom: 12,
                color: 'var(--color-text)',
              }}
            >
              {createMode === 'file' ? '新建文件' : '新建文件夹'}
            </div>
            <div
              style={{
                fontSize: 11,
                color: 'var(--color-text-tertiary)',
                marginBottom: 8,
                wordBreak: 'break-all',
              }}
            >
              父目录：{createParent}
            </div>
            <input
              autoFocus
              type="text"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder={createMode === 'file' ? '例：会议纪要.md' : '例：02、需求调研'}
              style={{
                width: '100%',
                padding: '6px 6px',
                fontSize: 13,
                border: '1px solid var(--color-border)',
                borderRadius: 4,
                background: 'var(--color-bg)',
                color: 'var(--color-text)',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 8,
                marginTop: 16,
              }}
            >
              <button
                type="button"
                style={toolbarBtn}
                onClick={cancelCreate}
                disabled={creating}
              >
                取消
              </button>
              <button
                type="button"
                style={primaryBtn}
                onClick={submitCreate}
                disabled={creating || !createName.trim()}
              >
                {creating ? '创建中…' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 主体 · 树 + 预览 */}
      {!boundPath ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            color: 'var(--color-text-tertiary)',
            padding: 32,
          }}
        >
          <Folder size={48} strokeWidth={1.25} />
          <div style={{ fontSize: 13 }}>指定一个本地目录，开始浏览项目文件</div>
          <div
            style={{
              fontSize: 11,
              maxWidth: 480,
              textAlign: 'center',
              lineHeight: 1.6,
            }}
          >
            支持 PDF / Word / Excel / PPT / 图片 / Markdown / 代码 / HTML 预览
            <br />
            其它格式可一键用系统默认程序打开
          </div>
        </div>
      ) : (
        <div
          style={{
            flex: 1,
            display: 'grid',
            gridTemplateColumns: '260px 1fr',
            minHeight: 0,
          }}
        >
          {/* 左侧：文件树 */}
          <div
            style={{
              borderRight: '1px solid var(--color-border)',
              background: 'var(--color-bg)',
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {loadingTree && !tree ? (
              <div
                style={{
                  padding: 16,
                  fontSize: 12,
                  color: 'var(--color-text-tertiary)',
                  textAlign: 'center',
                }}
              >
                加载文件树…
              </div>
            ) : (
              <FileTree
                root={tree}
                selectedPath={selected?.path ?? null}
                onSelect={(node) => {
                  // 维护者 2026-08-31：根目录（tree 自身）永不进预览 · 目录节点也不进
                  if (node.isDir) return
                  if (tree && node.path === tree.path) return
                  setSelected(node)
                }}
              />
            )}
          </div>

          {/* 右侧：预览 */}
          <div style={{ minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            {selected && !selected.isDir ? (
              <FilePreview
                key={selected.path}
                path={selected.path}
                fileName={selected.name}
                size={selected.size}
                onOpenExternally={handleOpenExternally}
              />
            ) : (
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--color-text-tertiary)',
                  fontSize: 13,
                }}
              >
                <div style={{ textAlign: 'center' }}>
                  <ExternalLink
                    size={32}
                    color="var(--color-text-tertiary)"
                    style={{ marginBottom: 8 }}
                  />
                  <div>在左侧选择一个文件开始预览</div>
                  <div
                    style={{
                      fontSize: 11,
                      marginTop: 4,
                      color: 'var(--color-text-tertiary)',
                    }}
                  >
                    md/txt 当前为只读预览 · 编辑时点「本地编辑器打开」
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 维护者 2026-08-31：inline 二次确认 modal（Tauri 拦截 window.confirm） */}
      {pendingConfirm && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
          }}
          onClick={() => setPendingConfirm(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--color-surface, #fff)',
              borderRadius: 8,
              padding: '20px 24px',
              minWidth: 360,
              maxWidth: 480,
              boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            }}
          >
            <h3
              style={{
                margin: 0,
                marginBottom: 12,
                fontSize: 15,
                fontWeight: 600,
                color: 'var(--color-text)',
              }}
            >
              {pendingConfirm.kind === 'delete'
                ? `删除${pendingConfirm.node.isDir ? '目录（含全部内容）' : '文件'}`
                : '解除本地目录绑定'}
            </h3>
            <p
              style={{
                margin: 0,
                marginBottom: 18,
                fontSize: 13,
                lineHeight: 1.6,
                color: 'var(--color-text-secondary)',
              }}
            >
              {pendingConfirm.kind === 'delete' ? (
                <>
                  确定要删除「
                  <strong style={{ color: 'var(--color-text)' }}>
                    {pendingConfirm.node.name}
                  </strong>
                  」？{pendingConfirm.node.isDir && '目录内所有文件 / 子目录也会一并删除。'}
                  该操作不可撤销。
                </>
              ) : (
                <>解除后 FilesTab 不会删除磁盘上的任何文件，只是解绑目录。</>
              )}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                onClick={() => setPendingConfirm(null)}
                style={{
                  padding: '6px 6px',
                  fontSize: 13,
                  border: '1px solid var(--color-border)',
                  background: 'transparent',
                  color: 'var(--color-text)',
                  borderRadius: 4,
                  cursor: 'pointer',
                }}
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  if (pendingConfirm.kind === 'delete') {
                    void executeDelete(pendingConfirm.node)
                  } else {
                    void executeClear()
                  }
                }}
                style={{
                  padding: '6px 6px',
                  fontSize: 13,
                  border: 'none',
                  background: '#dc2626',
                  color: '#fff',
                  borderRadius: 4,
                  cursor: 'pointer',
                }}
              >
                {pendingConfirm.kind === 'delete' ? '确认删除' : '解绑目录'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================
// 一级 · 项目成员管理（甲方 / 乙方 · 维护者 2026-08-26 拍板）
// ============================================================

/** 成员表单（创建 / 编辑共用） */
interface MemberForm {
  role: string
  name: string
  contact: string
  participation: string
  impact: string
}

const EMPTY_MEMBER_FORM: MemberForm = {
  role: '',
  name: '',
  contact: '',
  participation: '',
  impact: '',
}

/** 参与度 / 影响度的可选值（与 Excel 模板 ★ 符号对应） */
const PARTICIPATION_OPTIONS: { value: string; label: string }[] = [
  { value: '★', label: '★ 极低' },
  { value: '★★', label: '★★ 低' },
  { value: '★★★', label: '★★★ 中' },
  { value: '★★★★', label: '★★★★ 高' },
  { value: '★★★★★', label: '★★★★★ 极高' },
]

function MembersTab({
  projectId,
  data,
  onRefresh,
}: {
  projectId: number
  data: ProjectDetailData
  onRefresh: () => Promise<void>
}) {
  const [membersA, setMembersA] = useState<ProjectMember[]>([])
  const [membersB, setMembersB] = useState<ProjectMember[]>([])
  const [editing, setEditing] = useState<ProjectMember | null>(null)
  const [creating, setCreating] = useState<'A' | 'B' | null>(null)
  const [deleting, setDeleting] = useState<ProjectMember | null>(null)
  const [importConfirm, setImportConfirm] = useState<ProjectMember[] | null>(
    null,
  )
  const [importFile, setImportFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [form, setForm] = useState<MemberForm>(EMPTY_MEMBER_FORM)

  // 拉取成员
  const refreshMembers = async () => {
    try {
      const list = await listProjectMembers(projectId)
      const a = list
        .filter((m) => m.party === 'PARTY_A')
        .sort((x, y) => x.sort_order - y.sort_order)
      const b = list
        .filter((m) => m.party === 'PARTY_B')
        .sort((x, y) => x.sort_order - y.sort_order)
      setMembersA(a)
      setMembersB(b)
    } catch (e) {
      console.error('[MembersTab] 加载成员失败', e)
    }
  }

  useEffect(() => {
    void refreshMembers()
  }, [projectId])

  // 编辑 / 创建时填充表单
  useEffect(() => {
    if (editing) {
      setForm({
        role: editing.role ?? '',
        name: editing.name,
        contact: editing.contact ?? '',
        participation: editing.participation ?? '',
        impact: editing.impact ?? '',
      })
      setError(null)
    } else if (creating) {
      setForm(EMPTY_MEMBER_FORM)
      setError(null)
    }
  }, [editing, creating])

  // 创建
  const handleCreate = async () => {
    if (!creating || !form.name.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const sortOrder =
        creating === 'A' ? membersA.length : membersB.length
      await createProjectMember({
        project_id: projectId,
        party: creating === 'A' ? 'PARTY_A' : 'PARTY_B',
        role: form.role.trim() || null,
        name: form.name.trim(),
        contact: form.contact.trim() || null,
        participation: form.participation || null,
        impact: form.impact.trim() || null,
        sort_order: sortOrder,
      })
      setCreating(null)
      await refreshMembers()
      await onRefresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  // 保存编辑
  const handleEditSave = async () => {
    if (!editing || !form.name.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      await updateProjectMember(editing.id, {
        party: editing.party,
        role: form.role.trim() || null,
        name: form.name.trim(),
        contact: form.contact.trim() || null,
        participation: form.participation || null,
        impact: form.impact.trim() || null,
      })
      setEditing(null)
      await refreshMembers()
      await onRefresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  // 删除
  const handleDeleteConfirm = async () => {
    if (!deleting || busy) return
    setBusy(true)
    setError(null)
    try {
      await deleteProjectMember(deleting.id)
      setDeleting(null)
      await refreshMembers()
      await onRefresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  // 导出
  const handleExport = async () => {
    try {
      const blob = await exportMembersToExcel([...membersA, ...membersB])
      const filename = `${data.project.project_name}-项目成员-${todayLocal()}.xlsx`
      const total = membersA.length + membersB.length
      const ok = await saveBlobToDirectory(blob, filename)
      if (ok) toast.success(`已导出 ${total} 位成员`, filename)
      else toast.error('导出失败', '浏览器拦截了下载')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error('导出成员失败', msg)
      setError(msg)
    }
  }

  // 导入
  const handleImportFile = async (file: File) => {
    setBusy(true)
    setError(null)
    try {
      const parsed = await parseMembersExcel(file, projectId)
      if (fileInputRef.current) fileInputRef.current.value = ''
      if (parsed.length === 0) {
        setError('Excel 中未发现有效的成员条目')
        return
      }
      setImportFile(file)
      setImportConfirm(parsed)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      if (fileInputRef.current) fileInputRef.current.value = ''
    } finally {
      setBusy(false)
    }
  }

  const handleImportConfirm = async () => {
    if (!importConfirm || busy) return
    setBusy(true)
    setError(null)
    try {
      for (const m of importConfirm) {
        await createProjectMember({
          project_id: projectId,
          party: m.party,
          role: m.role,
          name: m.name,
          contact: m.contact,
          participation: m.participation,
          impact: m.impact,
          sort_order: m.sort_order,
        })
      }
      setImportConfirm(null)
      setImportFile(null)
      await refreshMembers()
      await onRefresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const showTopError =
    error !== null &&
    deleting === null &&
    importConfirm === null &&
    editing === null &&
    creating === null

  return (
    <Section
      title="项目成员管理"
      icon={Users}
      accent="var(--color-accent)"
      rightSlot={
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <span
            style={{
              fontSize: '11px',
              color: 'var(--color-text-tertiary)',
            }}
          >
            甲方 {membersA.length} 人 · 乙方 {membersB.length} 人
          </span>
          <button
            type="button"
            onClick={() => downloadProjectTemplate()}
            style={ghostBtnStyle}
            title="下载 Excel 模板"
            data-testid="members-template"
          >
            <Download size={11} />
            下载模板
          </button>
          <button
            type="button"
            onClick={() => void handleExport()}
            style={ghostBtnStyle}
            title="导出全部成员"
            data-testid="members-export"
          >
            <Upload size={11} />
            导出
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            style={ghostBtnStyle}
            title="从 Excel 导入"
            data-testid="members-import"
          >
            <Upload size={11} />
            导入
          </button>
        </div>
      }
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void handleImportFile(f)
        }}
      />

      {showTopError && (
        <div
          style={{
            marginBottom: '10px',
            padding: '8px 12px',
            borderRadius: 'var(--radius)',
            background: 'rgba(239,68,68,0.08)',
            color: 'var(--color-status-danger)',
            fontSize: '12px',
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
          gap: '16px',
        }}
      >
        <MemberPartyCard
          title="甲方相关方"
          accent="var(--color-accent)"
          members={membersA}
          onAdd={() => setCreating('A')}
          onEdit={setEditing}
          onDelete={setDeleting}
        />
        <MemberPartyCard
          title="乙方相关方"
          accent="var(--color-status-warning)"
          members={membersB}
          onAdd={() => setCreating('B')}
          onEdit={setEditing}
          onDelete={setDeleting}
        />
      </div>

      {/* 新增 / 编辑 modal */}
      {(creating !== null || editing !== null) && (
        <MemberFormModal
          mode={editing ? 'edit' : 'create'}
          partyLabel={editing ? partyToLabel(editing.party) : creating === 'A' ? '甲方' : '乙方'}
          form={form}
          setForm={setForm}
          busy={busy}
          error={error}
          onSave={() =>
            void (editing ? handleEditSave() : handleCreate())
          }
          onCancel={() => {
            setCreating(null)
            setEditing(null)
          }}
        />
      )}

      {/* 删除确认 modal */}
      {deleting !== null && (
        <div
          style={confirmOverlayStyle}
          onClick={() => !busy && setDeleting(null)}
        >
          <div onClick={(e) => e.stopPropagation()} style={confirmBoxStyle}>
            <h3 style={confirmTitleStyle}>删除项目成员</h3>
            <p style={confirmDescStyle}>
              确定要删除「{deleting.name}」（{partyToLabel(deleting.party)}）？该操作不可撤销。
            </p>
            {error && <div style={confirmErrorStyle}>{error}</div>}
            <div style={confirmFooterStyle}>
              <button
                type="button"
                onClick={() => setDeleting(null)}
                style={ghostBtnStyle}
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteConfirm()}
                disabled={busy}
                style={dangerBtnStyle}
              >
                {busy ? '处理中…' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 导入确认 modal */}
      {importConfirm !== null && (
        <div
          style={confirmOverlayStyle}
          onClick={() => !busy && setImportConfirm(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ ...confirmBoxStyle, width: '480px', maxHeight: '80vh', overflowY: 'auto' }}
          >
            <h3 style={confirmTitleStyle}>导入项目成员</h3>
            <p style={confirmDescStyle}>
              从 <code>{importFile?.name ?? ''}</code> 解析到 {importConfirm.length}{' '}
              人，确认导入？
            </p>
            <ul
              style={{
                margin: '0 0 16px',
                padding: '0',
                listStyle: 'none',
                maxHeight: '260px',
                overflowY: 'auto',
                border: '1px solid var(--color-border-thin)',
                borderRadius: 'var(--radius)',
              }}
            >
              {importConfirm.slice(0, 50).map((m, idx) => (
                <li
                  key={idx}
                  style={{
                    padding: '6px 6px',
                    borderBottom: '1px solid var(--color-border-thin)',
                    fontSize: '12px',
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  {idx + 1}. {partyToLabel(m.party)} · {m.role ?? '—'} · {m.name || '(无姓名)'}
                </li>
              ))}
              {importConfirm.length > 50 && (
                <li
                  style={{
                    padding: '6px 6px',
                    fontSize: '11px',
                    color: 'var(--color-text-tertiary)',
                  }}
                >
                  ... 共 {importConfirm.length} 人
                </li>
              )}
            </ul>
            {error && <div style={confirmErrorStyle}>{error}</div>}
            <div style={confirmFooterStyle}>
              <button
                type="button"
                onClick={() => {
                  setImportConfirm(null)
                  setImportFile(null)
                }}
                style={ghostBtnStyle}
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => void handleImportConfirm()}
                disabled={busy}
                style={primaryBtnStyle}
              >
                {busy ? '导入中…' : `确认导入 ${importConfirm.length} 人`}
              </button>
            </div>
          </div>
        </div>
      )}
    </Section>
  )
}

/** 一块阵营卡片（甲方 / 乙方） */
function MemberPartyCard({
  title,
  accent,
  members,
  onAdd,
  onEdit,
  onDelete,
}: {
  title: string
  accent: string
  members: ProjectMember[]
  onAdd: () => void
  onEdit: (m: ProjectMember) => void
  onDelete: (m: ProjectMember) => void
}) {
  return (
    <div
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border-thin)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '12px 16px',
          borderBottom: '1px solid var(--color-border-thin)',
        }}
      >
        <Users size={13} strokeWidth={1.75} color={accent} />
        <h3
          style={{
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--color-text)',
            margin: 0,
            flex: 1,
          }}
        >
          {title} · {members.length} 人
        </h3>
        <button
          type="button"
          onClick={onAdd}
          data-testid={`members-add-${title}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '3px',
            padding: '4px 10px',
            border: '1px solid var(--color-border-thin)',
            borderRadius: 'var(--radius)',
            background: 'transparent',
            color: accent,
            fontSize: '11px',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          <Plus size={10} />
          新增
        </button>
      </div>
      {members.length === 0 ? (
        <div
          style={{
            padding: '24px 16px',
            textAlign: 'center',
            fontSize: '12px',
            color: 'var(--color-text-tertiary)',
          }}
        >
          暂无成员 · 点 [+] 新增或 [导入] 从 Excel
        </div>
      ) : (
        <table
          style={{
            width: '100%',
            tableLayout: 'fixed',
            borderCollapse: 'collapse',
            fontSize: '12px',
          }}
        >
          <thead>
            <tr style={{ background: 'var(--color-bg-muted)' }}>
              <th style={weeklyThStyle}>角色</th>
              <th style={weeklyThStyle}>姓名</th>
              <th style={weeklyThStyle}>联系方式</th>
              <th style={weeklyThStyle}>参与度</th>
              <th style={weeklyThStyle}>影响度</th>
              <th style={{ ...weeklyThStyle, width: '90px' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} data-testid={`member-row-${m.id}`}>
                <td style={weeklyTdStyle}>{m.role ?? '—'}</td>
                <td style={{ ...weeklyTdStyle, fontWeight: 500 }}>{m.name}</td>
                <td style={weeklyTdStyle}>{m.contact ?? '—'}</td>
                <td style={weeklyTdStyle}>
                  {m.participation ? (
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-status-warning)' }}>
                      {m.participation}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>
                  )}
                </td>
                <td style={weeklyTdStyle}>
                  {m.impact ? (
                    <span style={{ fontSize: '11px' }}>{m.impact}</span>
                  ) : (
                    <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>
                  )}
                </td>
                <td style={weeklyTdStyle}>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      type="button"
                      onClick={() => onEdit(m)}
                      title="编辑"
                      data-testid={`member-edit-${m.id}`}
                      style={rowIconBtnStyle}
                    >
                      <Pencil size={11} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(m)}
                      title="删除"
                      data-testid={`member-delete-${m.id}`}
                      style={{ ...rowIconBtnStyle, color: 'var(--color-status-danger)' }}
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

/** 成员表单 modal（创建 / 编辑共用） */
function MemberFormModal({
  mode,
  partyLabel,
  form,
  setForm,
  busy,
  error,
  onSave,
  onCancel,
}: {
  mode: 'create' | 'edit'
  partyLabel: string
  form: MemberForm
  setForm: (f: MemberForm) => void
  busy: boolean
  error: string | null
  onSave: () => void
  onCancel: () => void
}) {
  const update = <K extends keyof MemberForm>(key: K, value: MemberForm[K]) => {
    setForm({ ...form, [key]: value })
  }
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '6px 6px',
    border: '1px solid var(--color-border-thin)',
    borderRadius: 'var(--radius)',
    background: 'var(--color-bg)',
    fontSize: '12px',
    color: 'var(--color-text)',
    fontFamily: 'inherit',
  }
  const labelStyle: React.CSSProperties = {
    fontSize: '11px',
    color: 'var(--color-text-tertiary)',
    marginBottom: '3px',
  }
  return (
    <div style={confirmOverlayStyle} onClick={() => !busy && onCancel()}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ ...confirmBoxStyle, width: '460px' }}
      >
        <h3 style={confirmTitleStyle}>
          {mode === 'create' ? '新增' : '编辑'}成员 · {partyLabel}
        </h3>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            marginBottom: '12px',
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <div style={labelStyle}>姓名（必填）</div>
              <input
                type="text"
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
                placeholder="例：张三"
                style={inputStyle}
              />
            </div>
            <div>
              <div style={labelStyle}>角色</div>
              <input
                type="text"
                value={form.role}
                onChange={(e) => update('role', e.target.value)}
                placeholder="例：项目经理 / 法务"
                style={inputStyle}
              />
            </div>
          </div>
          <div>
            <div style={labelStyle}>联系方式</div>
            <input
              type="text"
              value={form.contact}
              onChange={(e) => update('contact', e.target.value)}
              placeholder="例：zhangsan@example.com / 13800138000"
              style={inputStyle}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <div style={labelStyle}>项目参与程度</div>
              <select
                value={form.participation}
                onChange={(e) => update('participation', e.target.value)}
                style={inputStyle}
              >
                <option value="">未指定</option>
                {PARTICIPATION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div style={labelStyle}>对项目影响度</div>
              <select
                value={form.impact}
                onChange={(e) => update('impact', e.target.value)}
                style={inputStyle}
              >
                <option value="">未指定</option>
                {PARTICIPATION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
        {error && <div style={confirmErrorStyle}>{error}</div>}
        <div style={confirmFooterStyle}>
          <button type="button" onClick={onCancel} style={ghostBtnStyle}>
            取消
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={busy || !form.name.trim()}
            style={{
              ...primaryBtnStyle,
              opacity: busy || !form.name.trim() ? 0.5 : 1,
              cursor: busy || !form.name.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            {busy ? '保存中…' : mode === 'create' ? '新增' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

/** party → 中文标签 */
function partyToLabel(party: ProjectMember['party']): string {
  return party === 'PARTY_A' ? '甲方' : '乙方'
}

// ============================================================
// 通用 Section + 工具
// ============================================================

function Section({
  title,
  icon: Icon,
  accent,
  rightSlot,
  children,
}: {
  title: string
  icon: LucideIcon
  accent: string
  rightSlot?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border-thin)',
        borderRadius: 'var(--radius-md)',
        padding: '16px 18px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '12px',
        }}
      >
        <Icon size={14} strokeWidth={1.75} color={accent} />
        <h2
          style={{
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--color-text)',
            margin: 0,
            flex: 1,
          }}
        >
          {title}
        </h2>
        {rightSlot}
      </div>
      {children}
    </div>
  )
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div
      style={{
        padding: '24px 0',
        textAlign: 'center',
        fontSize: '12px',
        color: 'var(--color-text-tertiary)',
      }}
    >
      {text}
    </div>
  )
}

function todayLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatFileSize(bytes: number | null): string {
  if (bytes === null) return '—'
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)}GB`
}

function formatTotalSize(bytes: number): string {
  if (bytes === 0) return '0B'
  return formatFileSize(bytes)
}
// ============================================================
// 列宽拖拽通用组件（周报 / 风险登记册 共用）
// 维护者 2026-08-28：参考甘特图标签列拖拽 · 列宽持久化到 localStorage
// ============================================================

/** 周报表列宽默认值 */
const WEEKLY_COLUMN_DEFAULTS = {
  idx: 36,
  task: 170,
  plan: 150,
  actual: 150,
  partyA: 76,
  partyB: 76,
  note: 170,
  status: 90,
  ops: 56,
}

/** 风险登记册列宽默认值 */
const RISK_COLUMN_DEFAULTS = {
  idx: 40,
  title: 180,
  discovered: 110,
  description: 200,
  level: 70,
  plan: 110,
  owner: 90,
  actual: 110,
  solution: 200,
  ops: 90,
}

/** 列宽 state + 拖拽手柄（persisted to localStorage） */
function useResizableColumns<K extends string>(tableKey: string, defaults: Record<K, number>) {
  const [widths, setWidths] = useState<Record<K, number>>(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem(`pmtool.colwidth.${tableKey}`) ?? '{}',
      ) as Record<string, unknown>
      const merged = {} as Record<K, number>
      for (const k of Object.keys(defaults) as K[]) {
        merged[k] =
          typeof saved[k] === 'number' && (saved[k] as number) >= 24
            ? (saved[k] as number)
            : defaults[k]
      }
      return merged
    } catch {
      return { ...defaults }
    }
  })
  const dragHandle = (k: K, min = 40, max = 420) => (e: React.PointerEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = widths[k]
    const onMove = (ev: PointerEvent) => {
      const w = Math.max(min, Math.min(startW + (ev.clientX - startX), max))
      setWidths((prev) => {
        const next = { ...prev, [k]: w }
        try {
          localStorage.setItem(`pmtool.colwidth.${tableKey}`, JSON.stringify(next))
        } catch {
          /* ignore quota */
        }
        return next
      })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }
  return { widths, dragHandle }
}

/** 可拖拽列宽的 th */
function ResizableTh({
  width,
  dragHandle,
  children,
  style,
}: {
  width: number
  dragHandle: (e: React.PointerEvent) => void
  children: React.ReactNode
  style?: React.CSSProperties
}) {
  return (
    <th style={{ ...style, width, position: 'relative' }}>
      {children}
      <div
        onPointerDown={dragHandle}
        title="拖动调整列宽"
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          right: -3,
          width: 7,
          cursor: 'col-resize',
          zIndex: 30,
          touchAction: 'none',
        }}
      />
    </th>
  )
}
