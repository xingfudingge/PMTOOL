/**
 * PMTool V2.0 · 项目中心列表页
 * Phase A · alpha 化（2026-08-24 · 维护者要求）
 *
 * 改动：
 *   - 卡片点击 → onOpenProject(id) → 跳详情页（ProjectDetailPage）
 *   - 移除行内展开面板（详情页接管 · 8 要素详情）
 *   - 表格行点击 → onOpenProject
 *
 * 仍保留：
 *   - 卡片 5 要素摘要（ProjectOverviewCard · P1 已实现）
 *   - 表格视图（按 P1 简化版）
 *   - 创建 / 删除 / 搜索 / 状态筛选
 */

import { useEffect, useMemo, useState } from 'react'
import {
  Plus,
  Search,
  LayoutGrid,
  Rows3,
  CircleDot,
} from 'lucide-react'
import {
  listProjects,
  createProject,
  type Project,
} from '@/services/project'
import {
  loadProjectOverviews,
  type ProjectOverview,
} from '@/services/projectSummary'
import { ProjectOverviewCard } from '@/components/ProjectOverviewCard'
import { ProjectDeleteModal } from '@/components/ProjectDeleteModal'

type ViewMode = 'card' | 'table'

interface Props {
  onOpenProject?: (id: number) => void
}

export function ProjectsPage({ onOpenProject }: Props = {}) {
  const [projects, setProjects] = useState<Project[]>([])
  const [overviews, setOverviews] = useState<ProjectOverview[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<ViewMode>('card')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Project | null>(null)

  const reload = async () => {
    setLoading(true)
    setError(null)
    try {
      const filter =
        statusFilter === 'ALL'
          ? undefined
          : { status: statusFilter as Project['status'] }
      const list = await listProjects(filter)
      setProjects(list)
      if (list.length > 0) {
        try {
          setOverviews(await loadProjectOverviews())
        } catch (ovErr) {
          console.warn('项目摘要加载失败', ovErr)
          setOverviews([])
        }
      } else {
        setOverviews([])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    reload()
  }, [statusFilter])

  const filtered = useMemo(() => {
    if (!search.trim()) return projects
    const q = search.trim().toLowerCase()
    return projects.filter(
      (p) =>
        p.project_name.toLowerCase().includes(q) ||
        (p.customer_name ?? '').toLowerCase().includes(q) ||
        p.project_code.toLowerCase().includes(q),
    )
  }, [projects, search])

  const filteredOverviews = useMemo(() => {
    if (filtered.length === 0) return []
    const ids = new Set(filtered.map((p) => p.id))
    return overviews.filter((o) => ids.has(o.project.id))
  }, [filtered, overviews])

  const handleCreate = async (input: {
    projectCode: string
    projectName: string
  }) => {
    try {
      await createProject({
        projectCode: input.projectCode,
        projectName: input.projectName,
        status: 'PLANNING',
        priority: 'NORMAL',
      })
      setShowCreate(false)
      // 维护者 2026-09-01：项目中心只创建项目，不再自动建/绑任何知识库
      // 知识库归属于知识中心；项目知识中心是「知识中心·项目知识中心」的入口
      // 需要时用户手动到「知识中心」新建根 → 回项目详情绑定
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const requestDelete = (id: number) => {
    const target = projects.find((p) => p.id === id)
    if (!target) return
    setPendingDelete(target)
  }

  const handleDeleted = async () => {
    try {
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div
      data-testid="projects-page"
      style={{
        padding: '24px 32px',
        height: '100%',
        overflow: 'auto',
        maxWidth: '1400px',
      }}
    >
      {/* 顶部 */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}
      >
        <h1
          style={{
            fontSize: '24px',
            fontWeight: 600,
            letterSpacing: '-0.01em',
            margin: 0,
          }}
        >
          项目
        </h1>
        <span
          style={{
            fontSize: '12px',
            color: 'var(--color-text-tertiary)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {filtered.length}
        </span>
        <div style={{ flex: 1 }} />

        {/* 搜索 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '0 10px',
            width: '240px',
            height: '30px',
            background: 'var(--color-bg-subtle)',
            border: '1px solid var(--color-border-thin)',
            borderRadius: 'var(--radius)',
          }}
        >
          <Search size={13} strokeWidth={1.75} color="var(--color-text-tertiary)" />
          <input
            type="search"
            placeholder="搜索项目..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontSize: '13px',
              color: 'var(--color-text)',
            }}
          />
        </div>

        {/* 状态筛选 */}
        <select
          data-testid="status-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={selectStyle}
        >
          <option value="ALL">全部状态</option>
          <option value="PLANNING">规划中</option>
          <option value="IN_PROGRESS">进行中</option>
          <option value="SUSPENDED">已暂停</option>
          <option value="COMPLETED">已完成</option>
          <option value="CANCELLED">已取消</option>
        </select>

        {/* 视图切换 */}
        <div
          style={{
            display: 'flex',
            background: 'var(--color-bg-subtle)',
            border: '1px solid var(--color-border-thin)',
            borderRadius: 'var(--radius)',
            padding: '2px',
          }}
        >
          <ViewToggleBtn
            Icon={LayoutGrid}
            label="卡片"
            active={view === 'card'}
            onClick={() => setView('card')}
            testid="view-card"
          />
          <ViewToggleBtn
            Icon={Rows3}
            label="表格"
            active={view === 'table'}
            onClick={() => setView('table')}
            testid="view-table"
          />
        </div>

        <button
          data-testid="new-project"
          onClick={() => setShowCreate(true)}
          style={primaryBtnStyle}
        >
          <Plus size={13} strokeWidth={2} />
          新建项目
        </button>
      </div>

      {error && (
        <div
          data-testid="projects-error"
          style={{
            padding: '10px 14px',
            marginBottom: '12px',
            background: 'var(--color-bg-subtle)',
            border: '1px solid var(--color-border-thin)',
            borderRadius: 'var(--radius)',
            color: 'var(--color-status-danger)',
            fontSize: '13px',
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ color: 'var(--color-text-tertiary)', fontSize: '13px', padding: '32px 0' }}>
          加载中…
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState onCreate={() => setShowCreate(true)} />
      ) : view === 'card' ? (
        <CardGrid
          overviews={filteredOverviews}
          onOpenProject={onOpenProject}
          onDelete={requestDelete}
        />
      ) : (
        <TableList
          projects={filtered}
          onOpenProject={onOpenProject}
          onDelete={requestDelete}
        />
      )}

      {showCreate && (
        <CreateDialog
          onClose={() => setShowCreate(false)}
          onCreate={handleCreate}
        />
      )}

      <ProjectDeleteModal
        project={pendingDelete}
        onClose={() => setPendingDelete(null)}
        onDeleted={handleDeleted}
      />
    </div>
  )
}

// ============================================================
// 卡片网格
// ============================================================

function CardGrid({
  overviews,
  onOpenProject,
  onDelete,
}: {
  overviews: import('@/services/projectSummary').ProjectOverview[]
  onOpenProject?: (id: number) => void
  onDelete?: (id: number) => void
}) {
  if (overviews.length === 0) {
    return (
      <div
        data-testid="projects-card-view-empty"
        style={{
          padding: '40px 20px',
          textAlign: 'center',
          color: 'var(--color-text-tertiary)',
          fontSize: '13px',
        }}
      >
        项目摘要加载中…（表格视图可用）
      </div>
    )
  }
  return (
    <div
      data-testid="projects-card-view"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
        gap: '12px',
      }}
    >
      {overviews.map((o) => (
        <ProjectOverviewCard
          key={o.project.id}
          overview={o}
          expanded={false}
          onToggleExpand={() => onOpenProject?.(o.project.id)}
          onDelete={() => onDelete?.(o.project.id)}
        />
      ))}
    </div>
  )
}

// ============================================================
// 表格列表
// ============================================================

function TableList({
  projects,
  onOpenProject,
  onDelete,
}: {
  projects: Project[]
  onOpenProject?: (id: number) => void
  onDelete: (id: number) => void
}) {
  return (
    <table
      style={{
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: '13px',
      }}
    >
      <thead>
        <tr
          style={{
            textAlign: 'left',
            color: 'var(--color-text-tertiary)',
            fontSize: '11.5px',
            fontWeight: 500,
          }}
        >
          <th style={thStyle}>项目</th>
          <th style={thStyle}>客户</th>
          <th style={thStyle}>阶段</th>
          <th style={thStyle}>负责人</th>
          <th style={thStyle}>状态</th>
          <th style={thStyle}>截止</th>
          <th style={{ ...thStyle, width: '120px' }}></th>
        </tr>
      </thead>
      <tbody>
        {projects.map((p) => (
          <tr
            key={p.id}
            data-testid={`project-row-${p.id}`}
            style={{ borderTop: '1px solid var(--color-border-thin)', cursor: 'pointer' }}
            onClick={() => onOpenProject?.(p.id)}
          >
            <td style={tdStyle}>
              <div style={{ fontWeight: 500 }}>{p.project_name}</div>
              <div
                style={{
                  fontSize: '11px',
                  color: 'var(--color-text-tertiary)',
                  fontFamily: 'var(--font-mono)',
                  marginTop: '2px',
                }}
              >
                {p.project_code}
              </div>
            </td>
            <td style={tdStyle}>{p.customer_name ?? '—'}</td>
            <td style={tdStyle}>{inferStage(p)}</td>
            <td style={tdStyle}>{p.owner ?? '—'}</td>
            <td style={tdStyle}>
              <StatusBadge status={p.status} />
            </td>
            <td
              style={{
                ...tdStyle,
                fontVariantNumeric: 'tabular-nums',
                color: 'var(--color-text-tertiary)',
              }}
            >
              {p.end_date ?? '—'}
            </td>
            <td style={tdStyle}>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(p.id)
                }}
                style={{
                  fontSize: '11px',
                  color: 'var(--color-text-tertiary)',
                }}
              >
                删除
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ============================================================
// 状态 / 阶段 工具（TableList 仍用 inferStage + StatusBadge）
// ============================================================

function inferStage(p: Project): string {
  if (p.status === 'PLANNING') return '启动'
  if (p.status === 'IN_PROGRESS') return '实施'
  if (p.status === 'SUSPENDED') return '暂停'
  if (p.status === 'COMPLETED') return '已验收'
  if (p.status === 'CANCELLED') return '已终止'
  return '—'
}

const STATUS_MAP: Record<
  Project['status'],
  { label: string; fg: string; bg: string }
> = {
  PLANNING: { label: '规划', fg: '#5b5ce2', bg: '#eeeefb' },
  IN_PROGRESS: { label: '实施', fg: '#d97706', bg: '#fff1e6' },
  SUSPENDED: { label: '暂停', fg: '#6b7280', bg: '#f3f4f6' },
  COMPLETED: { label: '完成', fg: '#059669', bg: '#ecfdf5' },
  CANCELLED: { label: '终止', fg: '#6b7280', bg: '#f3f4f6' },
}

function StatusBadge({ status }: { status: Project['status'] }) {
  const c = STATUS_MAP[status]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '1px 7px',
        background: c.bg,
        color: c.fg,
        borderRadius: '3px',
        fontSize: '11px',
        fontWeight: 500,
      }}
    >
      {c.label}
    </span>
  )
}

// ============================================================
// 空态 + 创建对话框
// ============================================================

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div
      data-testid="projects-empty"
      style={{
        padding: '80px 20px',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          background: 'var(--color-bg-subtle)',
          margin: '0 auto 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <CircleDot size={22} strokeWidth={1.25} color="var(--color-text-tertiary)" />
      </div>
      <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '16px' }}>
        暂无项目
      </p>
      <button onClick={onCreate} style={primaryBtnStyle}>
        <Plus size={13} strokeWidth={2} />
        新建第一个项目
      </button>
    </div>
  )
}

function CreateDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void
  onCreate: (input: { projectCode: string; projectName: string }) => Promise<void>
}) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  // 维护者 2026-08-26 反馈：新建项目点不了创建（Tauri webview IME 输入时
  // onChange 不触发 compositionend，导致 state 滞后 disabled 误判）。
  // 修法：去掉 disabled，改为提交时校验（busy 期间禁用避免双击）。
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const handleSubmit = async () => {
    if (busy) return
    if (!code.trim() || !name.trim()) {
      setErr('请填写项目编号和项目名称')
      return
    }
    setErr(null)
    setBusy(true)
    try {
      await onCreate({ projectCode: code, projectName: name })
    } finally {
      setBusy(false)
    }
  }
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
      }}
      onClick={busy ? undefined : onClose}
    >
      <div
        data-testid="create-project-dialog"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !busy) void handleSubmit()
          if (e.key === 'Escape' && !busy) onClose()
        }}
        style={{
          width: '420px',
          background: 'var(--color-surface)',
          borderRadius: 'var(--radius-md)',
          padding: '24px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
        }}
      >
        <h2 style={{ fontSize: '17px', fontWeight: 600, marginBottom: '20px' }}>新建项目</h2>

        <Field
          label="项目编号"
          testid="new-project-code"
          value={code}
          onChange={setCode}
          placeholder="PM-2026-001"
        />
        <Field
          label="项目名称"
          testid="new-project-name"
          value={name}
          onChange={setName}
          placeholder="测试科技智能合同项目"
        />

        {/* 维护者 2026-09-01：弹窗不再问「是否建立知识库」· 多个项目可能共享一个库，
            建库时机由用户事后手动到知识中心处理（新建或绑定已有）*/}

        {err && (
          <div
            data-testid="create-project-error"
            style={{
              padding: '6px 10px',
              marginBottom: '12px',
              background: 'rgba(217, 45, 32, 0.08)',
              border: '1px solid rgba(217, 45, 32, 0.2)',
              borderRadius: 'var(--radius)',
              color: 'var(--color-status-danger)',
              fontSize: '12px',
            }}
          >
            {err}
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }}>
          <button data-testid="create-cancel" onClick={onClose} disabled={busy} style={ghostBtnStyle}>
            取消
          </button>
          <button
            data-testid="create-confirm"
            disabled={busy}
            onClick={handleSubmit}
            style={{
              ...primaryBtnStyle,
              opacity: busy ? 0.6 : 1,
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            {busy ? '创建中…' : '创建'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  testid,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  testid?: string
}) {
  return (
    <div style={{ marginBottom: '14px' }}>
      <label
        style={{
          display: 'block',
          fontSize: '12px',
          color: 'var(--color-text-secondary)',
          marginBottom: '4px',
        }}
      >
        {label}
      </label>
      <input
        data-testid={testid}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%',
          padding: '7px 10px',
          background: 'var(--color-bg-subtle)',
          border: '1px solid var(--color-border-thin)',
          borderRadius: 'var(--radius)',
          fontSize: '13px',
          color: 'var(--color-text)',
          outline: 'none',
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = 'var(--color-accent)'
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = 'var(--color-border-thin)'
        }}
      />
    </div>
  )
}

// 维护者 2026-09-01：旧版「是否建立知识库」三选一已删除 — 新建项目不再自动建库
// 用户需要时手动到知识中心建库 + 回项目详情绑定（多个项目可共享一个库）

function ViewToggleBtn({
  Icon,
  label,
  active,
  onClick,
  testid,
}: {
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number }>
  label: string
  active: boolean
  onClick: () => void
  testid: string
}) {
  return (
    <button
      onClick={onClick}
      data-testid={testid}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        padding: '4px 8px',
        background: active ? 'var(--color-surface)' : 'transparent',
        borderRadius: '4px',
        color: active ? 'var(--color-text)' : 'var(--color-text-tertiary)',
        fontSize: '12px',
      }}
    >
      <Icon size={12} strokeWidth={1.75} />
      {label}
    </button>
  )
}

// ============================================================
// 通用样式
// ============================================================

const selectStyle: React.CSSProperties = {
  padding: '5px 10px',
  background: 'var(--color-bg-subtle)',
  border: '1px solid var(--color-border-thin)',
  borderRadius: 'var(--radius)',
  fontSize: '12.5px',
  color: 'var(--color-text)',
  outline: 'none',
  height: '30px',
}

const thStyle: React.CSSProperties = {
  padding: '10px 12px',
  fontWeight: 500,
  borderBottom: '1px solid var(--color-border-thin)',
}

const tdStyle: React.CSSProperties = {
  padding: '10px 12px',
  fontSize: '13px',
  color: 'var(--color-text)',
}

const ghostBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  padding: '5px 12px',
  background: 'transparent',
  color: 'var(--color-text-secondary)',
  borderRadius: 'var(--radius)',
  fontSize: '12.5px',
  fontWeight: 500,
  border: '1px solid var(--color-border-thin)',
  height: '30px',
}

const primaryBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  padding: '5px 12px',
  background: 'var(--color-accent)',
  color: 'var(--color-text-on-accent)',
  borderRadius: 'var(--radius)',
  fontSize: '12.5px',
  fontWeight: 500,
  height: '30px',
}
