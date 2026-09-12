/**
 * PMTool V2.0 · 项目中心 · 项目卡片（含 5 要素摘要）
 * Phase A · P1 项目中心整改（2026-08-24）
 *
 * 设计依据：维护者 P1 5 要素
 *   - 客户
 *   - 项目阶段（实施/需求/启动等 5 阶段 · 真实计算）
 *   - 当前风险（OPEN issues + 剩余天数）
 *   - 待办事项（未完成任务数）
 *   - 交付资料入口（附件数）
 *
 * 风格延续：CSS 变量 + Lucide + 无 emoji · 卡片化
 */

import {
  AlertOctagon,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  FileQuestion,
  FileText,
  ListTodo,
  type LucideIcon,
} from 'lucide-react'
import type { ProjectOverview } from '@/services/projectSummary'

interface Props {
  overview: ProjectOverview
  expanded: boolean
  onToggleExpand: () => void
  onExport?: () => void
  onDelete?: () => void
}

export function ProjectOverviewCard({
  overview,
  expanded,
  onToggleExpand,
  onExport,
  onDelete,
}: Props) {
  const {
    project,
    overallProgress,
    stage,
    stageOrder,
    stageTotal,
    remainingDays,
    isOverdue,
    openIssueCount,
    urgentIssueCount,
    pendingTaskCount,
    overdueTaskCount,
    attachmentCount,
    riskCount,
    issueCount,
    todoCount,
    requirementCount,
  } = overview

  const hasUrgent = urgentIssueCount > 0 || overdueTaskCount > 0 || isOverdue

  return (
    <div
      data-testid={`project-card-${project.id}`}
      style={{
        background: 'var(--color-surface)',
        border: `1px solid ${hasUrgent ? 'var(--color-status-warning)' : 'var(--color-border-thin)'}`,
        borderRadius: 'var(--radius-md)',
        padding: '16px',
        transition: 'border-color 0.12s',
      }}
    >
      {/* 顶部：项目名 + 风险标识 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '8px',
          marginBottom: '10px',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: '14px',
              fontWeight: 500,
              color: 'var(--color-text)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {project.project_name}
          </div>
          <div
            style={{
              fontSize: '11px',
              color: 'var(--color-text-tertiary)',
              marginTop: '2px',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {project.project_code}
          </div>
        </div>
        {hasUrgent && (
          <UrgentBadge
            overdueTasks={overdueTaskCount}
            urgentIssues={urgentIssueCount}
            isOverdue={isOverdue}
          />
        )}
      </div>

      {/* 客户 + 负责人 + 阶段 */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          fontSize: '12px',
          color: 'var(--color-text-secondary)',
          marginBottom: '12px',
        }}
      >
        <Row label="客户" value={project.customer_name ?? '未指定'} />
        <Row label="负责人" value={project.owner ?? '未指派'} />
      </div>

      {/* 项目阶段（5 阶段进度）*/}
      <div style={{ marginBottom: '12px' }}>
        <StageBar
          stageOrder={stageOrder}
          stageTotal={stageTotal}
          stageLabel={stage}
        />
      </div>

      {/* 整体进度（真实加权平均）*/}
      <div style={{ marginBottom: '12px' }}>
        <ProgressLine
          progress={overallProgress}
          remainingDays={remainingDays}
          isOverdue={isOverdue}
        />
      </div>

      {/* 5 要素摘要 chips */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          flexWrap: 'wrap',
          paddingTop: '12px',
          borderTop: '1px solid var(--color-border-thin)',
        }}
      >
        <Chip
          icon={AlertOctagon}
          label="风险"
          count={riskCount}
          urgent={urgentIssueCount > 0}
        />
        <Chip icon={FileQuestion} label="问题" count={issueCount} />
        <Chip
          icon={ListTodo}
          label="代办"
          count={todoCount}
          urgent={overdueTaskCount > 0}
        />
        <Chip icon={BookOpen} label="新增需求" count={requirementCount} />
      </div>

      {/* 底部：展开按钮 + 删除 */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: '12px',
        }}
      >
        <button
          data-testid={`project-expand-${project.id}`}
          onClick={onToggleExpand}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 8px',
            background: 'transparent',
            border: '1px solid var(--color-border-thin)',
            borderRadius: 'var(--radius)',
            color: 'var(--color-text-secondary)',
            fontSize: '12px',
            cursor: 'pointer',
          }}
        >
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {expanded ? '收起详情' : '展开详情'}
        </button>
        {onExport && (
          <button
            data-testid={`project-export-${project.id}`}
            onClick={onExport}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 8px',
              background: 'transparent',
              border: '1px solid var(--color-border-thin)',
              borderRadius: 'var(--radius)',
              color: 'var(--color-text-secondary)',
              fontSize: '12px',
              cursor: 'pointer',
            }}
            title="导出整个项目到模板"
          >
            <Download size={12} />
            导出项目
          </button>
        )}
        {onDelete && (
          <button
            onClick={onDelete}
            style={{
              fontSize: '11px',
              color: 'var(--color-text-tertiary)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            删除
          </button>
        )}
      </div>
    </div>
  )
}

// ============================================================
// 子组件
// ============================================================

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: '6px' }}>
      <span style={{ color: 'var(--color-text-tertiary)', minWidth: '40px' }}>
        {label}
      </span>
      <span
        style={{
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </span>
    </div>
  )
}

function StageBar({
  stageOrder,
  stageTotal,
  stageLabel,
}: {
  stageOrder: number
  stageTotal: number
  stageLabel: string
}) {
  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: '4px',
        }}
      >
        <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
          阶段
        </span>
        <span
          style={{
            fontSize: '11px',
            color: 'var(--color-text-secondary)',
            fontWeight: 500,
          }}
        >
          {stageLabel}
        </span>
      </div>
      <div
        style={{
          display: 'flex',
          gap: '3px',
        }}
      >
        {Array.from({ length: stageTotal }, (_, i) => i + 1).map((step) => {
          const active = step <= stageOrder
          const current = step === stageOrder
          return (
            <div
              key={step}
              style={{
                flex: 1,
                height: '4px',
                background: active
                  ? current
                    ? 'var(--color-accent)'
                    : 'var(--color-accent-muted, var(--color-accent))'
                  : 'var(--color-bg-muted)',
                borderRadius: '2px',
                opacity: active ? 1 : 0.5,
              }}
            />
          )
        })}
      </div>
    </div>
  )
}

function ProgressLine({
  progress,
  remainingDays,
  isOverdue,
}: {
  progress: number
  remainingDays: number | null
  isOverdue: boolean
}) {
  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: '4px',
        }}
      >
        <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
          整体进度
        </span>
        <span
          style={{
            fontSize: '11px',
            color: 'var(--color-text-secondary)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {progress}%
        </span>
      </div>
      <div
        style={{
          height: '3px',
          background: 'var(--color-bg-muted)',
          borderRadius: '2px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${progress}%`,
            background: 'var(--color-accent)',
            borderRadius: '2px',
            transition: 'width 0.3s',
          }}
        />
      </div>
      {remainingDays !== null && (
        <div
          style={{
            marginTop: '4px',
            fontSize: '11px',
            color: isOverdue
              ? 'var(--color-status-danger)'
              : remainingDays < 7
                ? 'var(--color-status-warning)'
                : 'var(--color-text-tertiary)',
            fontVariantNumeric: 'tabular-nums',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          {isOverdue ? (
            <>已逾期 {Math.abs(remainingDays)} 天</>
          ) : remainingDays === 0 ? (
            <>今天截止</>
          ) : (
            <>剩 {remainingDays} 天</>
          )}
        </div>
      )}
    </div>
  )
}

function Chip({
  icon: Icon,
  label,
  count,
  urgent = false,
}: {
  icon: LucideIcon
  label: string
  count: number
  urgent?: boolean
}) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '3px 8px',
        background: urgent
          ? 'var(--color-status-warning-bg, var(--color-bg-subtle))'
          : 'var(--color-bg-subtle)',
        border: `1px solid ${urgent ? 'var(--color-status-warning)' : 'var(--color-border-thin)'}`,
        borderRadius: 'var(--radius)',
        fontSize: '11px',
        color: urgent
          ? 'var(--color-status-warning)'
          : 'var(--color-text-secondary)',
      }}
    >
      <Icon size={11} strokeWidth={1.75} />
      <span>{label}</span>
      <span
        style={{
          fontVariantNumeric: 'tabular-nums',
          fontWeight: 500,
          color: urgent ? 'var(--color-status-warning)' : 'var(--color-text)',
        }}
      >
        {count}
      </span>
    </div>
  )
}

function UrgentBadge({
  overdueTasks,
  urgentIssues,
  isOverdue,
}: {
  overdueTasks: number
  urgentIssues: number
  isOverdue: boolean
}) {
  const reasons: string[] = []
  if (isOverdue) reasons.push('已逾期')
  if (urgentIssues > 0) reasons.push(`${urgentIssues} 个高优先级问题`)
  if (overdueTasks > 0) reasons.push(`${overdueTasks} 个延期任务`)
  return (
    <div title={reasons.join('·')}>
      <AlertOctagon
        size={16}
        strokeWidth={1.75}
        color="var(--color-status-danger)"
      />
    </div>
  )
}

// Re-export CheckCircle2 to keep tree-shaking happy for future
export { CheckCircle2 }