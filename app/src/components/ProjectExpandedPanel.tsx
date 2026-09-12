/**
 * PMTool V2.0 · 项目中心 · 行内展开面板（5 要素完整）
 * Phase A · P1 项目中心整改（2026-08-24）
 *
 * 显示 5 要素详细数据：
 *   1. 当前风险（OPEN issues · 按 level 倒序）
 *   2. 待办事项（PENDING + IN_PROGRESS tasks · 按 end_date 升序）
 *   3. 交付资料（attachments · 文件名 + 大小 + 类型）
 *   4. 项目阶段（5 阶段条 + 详细描述）
 *   5. 项目概况（客户 / 负责人 / 起止 / 合同金额）
 */

import { useEffect, useState } from 'react'
import {
  AlertOctagon,
  BookOpen,
  Calendar,
  CheckCircle2,
  FileQuestion,
  FileText,
  ListTodo,
  Loader2,
  type LucideIcon,
} from 'lucide-react'
import {
  loadProjectSummary,
  type ProjectSummary,
  STAGES,
} from '@/services/projectSummary'

interface Props {
  projectId: number
}

export function ProjectExpandedPanel({ projectId }: Props) {
  const [summary, setSummary] = useState<ProjectSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    loadProjectSummary(projectId)
      .then((d) => {
        if (!cancelled) {
          setSummary(d)
          setLoading(false)
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e))
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [projectId])

  if (loading) {
    return (
      <div
        data-testid={`project-expanded-loading-${projectId}`}
        style={{
          padding: '20px',
          color: 'var(--color-text-tertiary)',
          fontSize: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          justifyContent: 'center',
        }}
      >
        <Loader2
          size={12}
          strokeWidth={1.75}
          style={{ animation: 'spin 1s linear infinite' }}
        />
        加载项目详情…
      </div>
    )
  }

  if (error || !summary) {
    return (
      <div
        style={{
          padding: '16px',
          color: 'var(--color-status-danger)',
          fontSize: '12px',
        }}
      >
        加载失败：{error ?? '未知错误'}
      </div>
    )
  }

  const { project, issues, pendingTasks, attachments, stageOrder, riskCount, issueCount, todoCount, requirementCount } = summary
  const openIssues = issues.filter((i) => i.status === 'OPEN')
  const closedIssues = issues.length - openIssues.length

  return (
    <div
      data-testid={`project-expanded-${projectId}`}
      style={{
        padding: '16px',
        background: 'var(--color-bg-subtle)',
        borderRadius: 'var(--radius)',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
      }}
    >
      {/* 0. 登记册汇总 chips（风险 / 问题 / 代办 / 新增需求）*/}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Chip icon={AlertOctagon} label="风险" count={riskCount} />
        <Chip icon={FileQuestion} label="问题" count={issueCount} />
        <Chip icon={ListTodo} label="代办" count={todoCount} />
        <Chip icon={BookOpen} label="新增需求" count={requirementCount} />
      </div>

      {/* 1. 当前风险 */}
      <Section title="当前风险" icon={AlertOctagon} count={openIssues.length}>
        {openIssues.length === 0 ? (
          <EmptyHint
            icon={CheckCircle2}
            text={issues.length === 0 ? '暂无登记问题' : `${closedIssues} 个问题已关闭`}
          />
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {openIssues
              .sort((a, b) => levelRank(b.level) - levelRank(a.level))
              .map((issue) => (
                <li
                  key={issue.id}
                  data-testid={`issue-row-${issue.id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    padding: '8px 0',
                    borderBottom: '1px solid var(--color-border-thin)',
                  }}
                >
                  <LevelTag level={issue.level} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: '12px',
                        color: 'var(--color-text)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {issue.title}
                    </div>
                    {issue.owner && (
                      <div
                        style={{
                          fontSize: '11px',
                          color: 'var(--color-text-tertiary)',
                          marginTop: '2px',
                        }}
                      >
                        负责人 · {issue.owner}
                      </div>
                    )}
                  </div>
                </li>
              ))}
          </ul>
        )}
      </Section>

      {/* 2. 待办事项 */}
      <Section
        title="待办事项"
        icon={ListTodo}
        count={pendingTasks.length}
      >
        {pendingTasks.length === 0 ? (
          <EmptyHint icon={CheckCircle2} text="暂无待办任务" />
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {pendingTasks.slice(0, 8).map((task) => (
              <li
                key={task.id}
                data-testid={`task-row-${task.id}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 0',
                  borderBottom: '1px solid var(--color-border-thin)',
                }}
              >
                <StatusDot status={task.status} />
                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: '12px',
                    color: 'var(--color-text)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {task.task_name}
                </div>
                {task.end_date && (
                  <span
                    style={{
                      fontSize: '11px',
                      color:
                        task.end_date < formatToday()
                          ? 'var(--color-status-danger)'
                          : 'var(--color-text-tertiary)',
                      fontVariantNumeric: 'tabular-nums',
                      flexShrink: 0,
                    }}
                  >
                    {task.end_date}
                  </span>
                )}
              </li>
            ))}
            {pendingTasks.length > 8 && (
              <li
                style={{
                  fontSize: '11px',
                  color: 'var(--color-text-tertiary)',
                  padding: '4px 0',
                  textAlign: 'center',
                }}
              >
                还有 {pendingTasks.length - 8} 个任务…
              </li>
            )}
          </ul>
        )}
      </Section>

      {/* 3. 交付资料入口 */}
      <Section
        title="交付资料"
        icon={FileText}
        count={attachments.length}
      >
        {attachments.length === 0 ? (
          <EmptyHint icon={FileText} text="暂无交付资料" />
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {attachments.slice(0, 6).map((att) => (
              <li
                key={att.id}
                data-testid={`attachment-row-${att.id}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 0',
                  borderBottom: '1px solid var(--color-border-thin)',
                  fontSize: '12px',
                }}
              >
                <FileText
                  size={12}
                  strokeWidth={1.75}
                  color="var(--color-text-tertiary)"
                />
                <span
                  style={{
                    flex: 1,
                    color: 'var(--color-text)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {att.file_name}
                </span>
                {att.file_size && (
                  <span
                    style={{
                      fontSize: '11px',
                      color: 'var(--color-text-tertiary)',
                      fontVariantNumeric: 'tabular-nums',
                      flexShrink: 0,
                    }}
                  >
                    {formatFileSize(att.file_size)}
                  </span>
                )}
              </li>
            ))}
            {attachments.length > 6 && (
              <li
                style={{
                  fontSize: '11px',
                  color: 'var(--color-text-tertiary)',
                  padding: '4px 0',
                  textAlign: 'center',
                }}
              >
                还有 {attachments.length - 6} 个文件…
              </li>
            )}
          </ul>
        )}
      </Section>

      {/* 4. 项目阶段（5 阶段条）*/}
      <Section title="项目阶段" icon={Calendar}>
        <div
          style={{
            display: 'flex',
            gap: '6px',
            marginBottom: '8px',
          }}
        >
          {STAGES.map((s) => {
            const passed = s.order <= stageOrder
            const current = s.order === stageOrder
            return (
              <div
                key={s.key}
                style={{
                  flex: 1,
                  textAlign: 'center',
                  fontSize: '11px',
                  color: passed
                    ? current
                      ? 'var(--color-text)'
                      : 'var(--color-text-secondary)'
                    : 'var(--color-text-tertiary)',
                  fontWeight: current ? 600 : 400,
                  padding: '4px 0',
                  background: current
                    ? 'var(--color-bg-subtle)'
                    : 'transparent',
                  borderRadius: 'var(--radius)',
                }}
              >
                {s.label}
              </div>
            )
          })}
        </div>
      </Section>

      {/* 5. 项目概况 */}
      <Section title="项目概况" icon={Calendar}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '6px 14px',
            fontSize: '12px',
            color: 'var(--color-text-secondary)',
          }}
        >
          <MetaRow label="客户" value={project.customer_name ?? '未指定'} />
          <MetaRow label="负责人" value={project.owner ?? '未指派'} />
          <MetaRow
            label="起止"
            value={
              project.start_date && project.end_date
                ? `${project.start_date} → ${project.end_date}`
                : '未设定'
            }
          />
          <MetaRow
            label="合同金额"
            value={
              project.contract_amount
                ? `¥${project.contract_amount.toLocaleString()}`
                : '未设定'
            }
          />
        </div>
      </Section>
    </div>
  )
}

// ============================================================
// 子组件
// ============================================================

function Section({
  title,
  icon: Icon,
  count,
  children,
}: {
  title: string
  icon: LucideIcon
  count?: number
  children: React.ReactNode
}) {
  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          marginBottom: '8px',
        }}
      >
        <Icon size={12} strokeWidth={1.75} color="var(--color-text-secondary)" />
        <span
          style={{
            fontSize: '11px',
            fontWeight: 500,
            color: 'var(--color-text)',
            letterSpacing: '0.02em',
            textTransform: 'uppercase',
          }}
        >
          {title}
        </span>
        {typeof count === 'number' && (
          <span
            style={{
              fontSize: '10px',
              color: 'var(--color-text-tertiary)',
              fontVariantNumeric: 'tabular-nums',
              padding: '1px 5px',
              background: 'var(--color-bg-muted)',
              borderRadius: '8px',
            }}
          >
            {count}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

function EmptyHint({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <div
      style={{
        padding: '8px 12px',
        fontSize: '11px',
        color: 'var(--color-text-tertiary)',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
      }}
    >
      <Icon size={12} strokeWidth={1.5} color="var(--color-text-tertiary)" />
      <span>{text}</span>
    </div>
  )
}

function LevelTag({ level }: { level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' }) {
  const cfg = {
    CRITICAL: { label: '严重', color: 'var(--color-status-danger)' },
    HIGH: { label: '高', color: 'var(--color-status-warning)' },
    MEDIUM: { label: '中', color: 'var(--color-text-secondary)' },
    LOW: { label: '低', color: 'var(--color-text-tertiary)' },
  }[level]
  return (
    <span
      style={{
        fontSize: '10px',
        color: cfg.color,
        fontWeight: 500,
        padding: '1px 5px',
        borderRadius: '3px',
        background: 'var(--color-bg-muted)',
        border: `1px solid ${cfg.color}`,
        flexShrink: 0,
      }}
    >
      {cfg.label}
    </span>
  )
}

function StatusDot({
  status,
}: {
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'DELAYED'
}) {
  const color = {
    PENDING: 'var(--color-text-tertiary)',
    IN_PROGRESS: 'var(--color-status-warning)',
    COMPLETED: 'var(--color-status-success)',
    DELAYED: 'var(--color-status-danger)',
  }[status]
  return (
    <span
      style={{
        width: '6px',
        height: '6px',
        borderRadius: '50%',
        background: color,
        flexShrink: 0,
      }}
    />
  )
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: '4px', minWidth: 0 }}>
      <span style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }}>
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

// ============================================================
// 工具函数
// ============================================================

function Chip({ icon: Icon, label, count }: { icon: LucideIcon; label: string; count: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 506, padding: '3px 17px', background: 'var(--color-bg-subtle)', border: '1px solid var(--color-border-thin)', borderRadius: 'var(--radius)', fontSize: 35, color: 'var(--color-text-secondary)' }}>
      <Icon size={11} strokeWidth={1.658} />
      <span>{label}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 281, color: 'var(--color-text)' }}>{count}</span>
    </span>
  )
}

function levelRank(level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'): number {
  return { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 }[level]
}

function formatToday(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)}GB`
}