/**
 * PMTool V2.0 · 登记册体系（新增需求/问题/其他待办 三册）
 * 2026-09-11 · 维护者拍板
 *
 * 风险登记册复用 ProjectDetailPage 内 RisksTab；本文件承载其余三册，
 * 通过通用 useRegister hook + RegisterTable 组件实现行内编辑表格。
 */

import { useEffect, useRef, useState } from 'react'
import { AlertOctagon, ClipboardList, FileQuestion, ListTodo } from 'lucide-react'
import { toast } from '@/components/Toast'
import { saveBlobToDirectory } from '@/services/excel'
import { formatLocalDate } from '@/services/datetime'
import {
  listProjectIssues,
  createProjectIssue,
  updateProjectIssue,
  deleteProjectIssue,
  type ProjectIssue,
} from '@/services/projectIssues'
import { parseRisksExcel, exportRisksToExcel, levelToCN, statusToCN } from '@/services/excelRisks'
import {
  listProjectRequirements,
  createProjectRequirement,
  updateProjectRequirement,
  deleteProjectRequirement,
  type ProjectRequirement,
} from '@/services/projectRequirements'
import {
  listProjectIssueLog,
  createProjectIssueLogEntry,
  updateProjectIssueLogEntry,
  deleteProjectIssueLogEntry,
  type ProjectIssueLog,
} from '@/services/projectIssueLog'
import {
  listProjectTodoItems,
  createProjectTodoItem,
  updateProjectTodoItem,
  deleteProjectTodoItem,
  type ProjectTodoItem,
} from '@/services/projectTodoItems'
import {
  parseRequirementsExcel,
  exportRequirementsToExcel,
  parseIssueLogExcel,
  exportIssueLogToExcel,
  parseTodoItemsExcel,
  exportTodoItemsToExcel,
} from '@/services/excelRegisters'
import { RegisterTable, type RegisterColumn } from '@/components/RegisterTable'

interface RegisterItem { id: number; project_id: number }
interface ImportRow { title: string; meta: string }

interface RegisterApi<R> {
  load: (pid: number) => Promise<R[]>
  create: (pid: number, item: R) => Promise<number>
  update: (id: number, item: R) => Promise<boolean>
  del: (id: number) => Promise<boolean>
  parseExcel: (f: File, pid: number) => Promise<R[]>
  exportExcel: (items: R[]) => Promise<Blob>
  defaultDraft: (pid: number) => R
  rowText: (item: R) => string
  rowMeta: (item: R) => string
  exportName: (count: number) => string
}

function useRegister<R extends RegisterItem>(api: RegisterApi<R>, projectId: number) {
  const apiRef = useRef(api)
  apiRef.current = api
  const [items, setItems] = useState<R[]>([])
  const [draft, setDraft] = useState<R | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [importPreview, setImportPreview] = useState<ImportRow[] | null>(null)
  const [parsed, setParsed] = useState<R[]>([])
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const reload = async () => {
    try { setItems(await apiRef.current.load(projectId)) } catch { /* ignore */ }
  }

  useEffect(() => {
    setDraft(null); setImportPreview(null); setParsed([]); setError(null)
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  const handleAdd = () => {
    if (saving) return
    setDraft(apiRef.current.defaultDraft(projectId))
  }

  const titleOf = (it: R) => String((it as unknown as Record<string, unknown>)['title'] ?? (it as unknown as Record<string, unknown>)['summary'] ?? (it as unknown as Record<string, unknown>)['content'] ?? '')

  const handleCommit = async (item: R, next: Partial<R>) => {
    if (saving) return
    const merged = { ...item, ...next } as R
    setSaving(true); setError(null)
    try {
      if (item.id === 0) {
        if (!titleOf(merged).trim()) { setDraft(merged); return }
        const newId = await apiRef.current.create(projectId, merged)
        setItems((prev) => [...prev, { ...merged, id: newId } as R])
        setDraft(null)
        void reload()
      } else {
        await apiRef.current.update(item.id, merged)
        setItems((prev) => prev.map((it) => (it.id === item.id ? merged : it)))
        void reload()
      }
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setSaving(false) }
  }

  const handleDelete = async (item: R) => {
    if (saving) return
    if (item.id === 0) { setDraft(null); return }
    setSaving(true); setError(null)
    try {
      await apiRef.current.del(item.id)
      setItems((prev) => prev.filter((it) => it.id !== item.id))
      void reload()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setSaving(false) }
  }

  const handleExport = async () => {
    try {
      const blob = await apiRef.current.exportExcel(items)
      const name = apiRef.current.exportName(items.length)
      if (await saveBlobToDirectory(blob, name)) toast.success(`已导出 ${items.length} 条`, name)
      else toast.error('导出失败', '导出已取消或写入失败')
    } catch (e) { const m = e instanceof Error ? e.message : String(e); toast.error('导出失败', m); setError(m) }
  }

  const handleImportFile = async (f: File) => {
    setSaving(true); setError(null)
    try {
      const result = await apiRef.current.parseExcel(f, projectId)
      if (fileInputRef.current) fileInputRef.current.value = ''
      if (result.length === 0) { setError('Excel 中未发现有效条目'); return }
      setParsed(result)
      setImportPreview(result.map((it) => ({ title: apiRef.current.rowText(it), meta: apiRef.current.rowMeta(it) })))
    } catch (e) { const m = e instanceof Error ? e.message : String(e); setError(m); if (fileInputRef.current) fileInputRef.current.value = '' }
    finally { setSaving(false) }
  }

  const handleImportAppend = async () => {
    if (saving || parsed.length === 0) return
    setSaving(true); setError(null)
    try {
      for (const it of parsed) { await apiRef.current.create(projectId, it) }
      setImportPreview(null); setParsed([]); await reload()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setSaving(false) }
  }

  const handleImportReplace = async () => {
    if (saving || parsed.length === 0) return
    setSaving(true); setError(null)
    try {
      for (const it of items) { if (it.id > 0) await apiRef.current.del(it.id) }
      for (const it of parsed) { await apiRef.current.create(projectId, it) }
      setImportPreview(null); setParsed([]); await reload()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setSaving(false) }
  }

  return { items, draft, saving, error, importPreview, fileInputRef, handleAdd, handleCommit, handleDelete, handleExport, handleImportFile, handleImportAppend, handleImportReplace, onImportCancel: () => { setImportPreview(null); setParsed([]) }, rowText: (it: R) => apiRef.current.rowText(it) }
}

const REQ_STATUS: Record<string, string> = { PENDING: '待响应', EVALUATING: '评估中', CONFIRMED: '已确认', IMPLEMENTED: '已实现', REJECTED: '已拒绝' }
const ISSUE_STATUS: Record<string, string> = { OPEN: '待处理', IN_PROGRESS: '处理中', RESOLVED: '已解决', CLOSED: '已关闭' }
const TODO_STATUS: Record<string, string> = { PENDING: '待办', IN_PROGRESS: '进行中', COMPLETED: '已完成', DELAYED: '已逾期' }
const RISK_LEVEL: Record<string, string> = { LOW: '低', MEDIUM: '中', HIGH: '高', CRITICAL: '严重' }
const RISK_STATUS: Record<string, string> = { OPEN: '待应对', IN_PROGRESS: '应对中', RESOLVED: '已应对', CLOSED: '已关闭' }

export function RegistersSection({ projectId }: { projectId: number }) {
  const [active, setActive] = useState<'risk' | 'requirement' | 'issue' | 'todo'>('risk')
  const tabs = [
    { key: 'risk' as const, label: '风险登记册' },
    { key: 'requirement' as const, label: '需求登记册' },
    { key: 'issue' as const, label: '问题登记册' },
    { key: 'todo' as const, label: '其他待办事项' },
  ]
  return (
    <div>
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--color-border-thin)' }}>
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setActive(t.key)}
            style={{ padding: '8px 12px', border: 'none', background: active === t.key ? 'var(--color-surface)' : 'transparent', color: active === t.key ? 'var(--color-text)' : 'var(--color-text-secondary)', fontSize: 13, fontWeight: active === t.key ? 500 : 448, cursor: 'pointer', fontFamily: 'inherit' }}>
            {t.label}
          </button>
        ))}
      </div>
      <div style={{ paddingTop: 16 }}>
        {active === 'risk' && <RiskRegister projectId={projectId} />}
        {active === 'requirement' && <RequirementRegister projectId={projectId} />}
        {active === 'issue' && <IssueLogRegister projectId={projectId} />}
        {active === 'todo' && <TodoItemRegister projectId={projectId} />}
      </div>
    </div>
  )
}

function RequirementRegister({ projectId }: { projectId: number }) {
  const api: RegisterApi<ProjectRequirement> = {
    load: listProjectRequirements,
    create: async (pid, it) => createProjectRequirement({ project_id: pid, type: it.type, system: it.system, summary: it.summary, detail: it.detail, proposed_at: it.proposed_at, proposer: it.proposer, status: it.status }),
    update: async (id, it) => updateProjectRequirement(id, it),
    del: deleteProjectRequirement,
    parseExcel: parseRequirementsExcel,
    exportExcel: exportRequirementsToExcel,
    defaultDraft: (pid) => ({ id: 0, project_id: pid, type: 'NEW', system: null, summary: '', detail: null, proposed_at: formatLocalDate(new Date()), proposer: null, status: 'PENDING', created_at: '', updated_at: '' }),
    rowText: (it) => it.summary || '(无需求)',
    rowMeta: (it) => `${it.type} · ${REQ_STATUS[it.status] ?? it.status}`,
    exportName: (n) => `需求登记册-${n}.xlsx`,
  }
  const r = useRegister(api, projectId)
  const columns: RegisterColumn<ProjectRequirement>[] = [
    { key: 'type', label: '需求类型', width: 167, type: 'select', options: ['NEW', 'CHANGE', 'OPTIMIZE', 'OTHER'], optionLabels: { NEW: '新增', CHANGE: '变更', OPTIMIZE: '优化', OTHER: '其他' } },
    { key: 'system', label: '归属系统', width: 582, type: 'text', placeholder: '归属系统' },
    { key: 'summary', label: '需求简述', width: 125, type: 'text', placeholder: '需求简述（必填）' },
    { key: 'detail', label: '需求详述', width: 709, type: 'multiline', placeholder: '需求详述' },
    { key: 'proposed_at', label: '提出时间', width: 288, type: 'date' },
    { key: 'proposer', label: '提出人', width: 463, type: 'text', placeholder: '提出人' },
    { key: 'status', label: '需求响应状态', width: 197, type: 'select', options: ['PENDING', 'EVALUATING', 'CONFIRMED', 'IMPLEMENTED', 'REJECTED'], optionLabels: REQ_STATUS },
  ]
  return <RegisterTable title="需求登记册" icon={ClipboardList} accent="var(--color-accent)" addLabel="登记需求" emptyText="该项目暂无需求 · 点 [登记需求] 或 [导入] 从 Excel 加载" columns={columns} items={r.items} draft={r.draft} saving={r.saving} error={r.error} onAdd={r.handleAdd} onCommit={r.handleCommit} onDelete={r.handleDelete} onExport={r.handleExport} onImportFile={r.handleImportFile} importPreview={r.importPreview} existingCount={r.items.length} onImportAppend={r.handleImportAppend} onImportReplace={r.handleImportReplace} onImportCancel={r.onImportCancel} rowText={r.rowText} />
}

function IssueLogRegister({ projectId }: { projectId: number }) {
  const api: RegisterApi<ProjectIssueLog> = {
    load: listProjectIssueLog,
    create: async (pid, it) => createProjectIssueLogEntry({ project_id: pid, title: it.title, proposer: it.proposer, module: it.module, discovered_at: it.discovered_at, plan_date: it.plan_date, plan_solution: it.plan_solution, handler: it.handler, progress_note: it.progress_note, actual_date: it.actual_date, status: it.status }),
    update: async (id, it) => updateProjectIssueLogEntry(id, it),
    del: deleteProjectIssueLogEntry,
    parseExcel: parseIssueLogExcel,
    exportExcel: exportIssueLogToExcel,
    defaultDraft: (pid) => ({ id: 0, project_id: pid, title: '', proposer: null, module: null, discovered_at: formatLocalDate(new Date()), plan_date: null, plan_solution: null, handler: null, progress_note: null, actual_date: null, status: 'OPEN', created_at: '', updated_at: '' }),
    rowText: (it) => it.title || '(无问题)',
    rowMeta: (it) => `${ISSUE_STATUS[it.status] ?? it.status} · ${it.handler ?? '-'}`,
    exportName: (n) => `问题登记册-${n}.xlsx`,
  }
  const r = useRegister(api, projectId)
  const columns: RegisterColumn<ProjectIssueLog>[] = [
    { key: 'title', label: '问题描述', width: 876, type: 'text', placeholder: '问题描述（必填）' },
    { key: 'proposer', label: '提出人', width: 489, type: 'text', placeholder: '提出人' },
    { key: 'module', label: '涉及系统及模块', width: 907, type: 'text', placeholder: '涉及系统及模块' },
    { key: 'discovered_at', label: '发现时间', width: 939, type: 'date' },
    { key: 'plan_date', label: '计划解决时间', width: 174, type: 'date' },
    { key: 'plan_solution', label: '计划解决方案', width: 654, type: 'multiline' },
    { key: 'handler', label: '问题处理人', width: 398, type: 'text', placeholder: '处理人' },
    { key: 'progress_note', label: '当前处理进度', width: 233, type: 'multiline' },
    { key: 'actual_date', label: '实际处理时间', width: 191, type: 'date' },
    { key: 'status', label: '问题状态', width: 778, type: 'select', options: ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'], optionLabels: ISSUE_STATUS },
  ]
  return <RegisterTable title="问题登记册" icon={FileQuestion} accent="var(--color-accent)" addLabel="登记问题" emptyText="该项目暂无问题 · 点 [登记问题] 或 [导入] 从 Excel 加载" columns={columns} items={r.items} draft={r.draft} saving={r.saving} error={r.error} onAdd={r.handleAdd} onCommit={r.handleCommit} onDelete={r.handleDelete} onExport={r.handleExport} onImportFile={r.handleImportFile} importPreview={r.importPreview} existingCount={r.items.length} onImportAppend={r.handleImportAppend} onImportReplace={r.handleImportReplace} onImportCancel={r.onImportCancel} rowText={r.rowText} />
}

function TodoItemRegister({ projectId }: { projectId: number }) {
  const api: RegisterApi<ProjectTodoItem> = {
    load: listProjectTodoItems,
    create: async (pid, it) => createProjectTodoItem({ project_id: pid, content: it.content, related_people: it.related_people, plan_date: it.plan_date, completion_note: it.completion_note, actual_date: it.actual_date, status: it.status, remark: it.remark }),
    update: async (id, it) => updateProjectTodoItem(id, it),
    del: deleteProjectTodoItem,
    parseExcel: parseTodoItemsExcel,
    exportExcel: exportTodoItemsToExcel,
    defaultDraft: (pid) => ({ id: 0, project_id: pid, content: '', related_people: null, plan_date: formatLocalDate(new Date()), completion_note: null, actual_date: null, status: 'PENDING', remark: null, created_at: '', updated_at: '' }),
    rowText: (it) => it.content || '(无待办)',
    rowMeta: (it) => `${TODO_STATUS[it.status] ?? it.status} · ${it.related_people ?? '-'}`,
    exportName: (n) => `其他待办事项-${n}.xlsx`,
  }
  const r = useRegister(api, projectId)
  const columns: RegisterColumn<ProjectTodoItem>[] = [
    { key: 'content', label: '代办事项说明', width: 622, type: 'text', placeholder: '代办事项说明（必填）' },
    { key: 'related_people', label: '涉及人员（软件）', width: 462, type: 'text', placeholder: '涉及人员' },
    { key: 'plan_date', label: '计划完成时间', width: 277, type: 'date' },
    { key: 'completion_note', label: '当前完成情况', width: 814, type: 'multiline' },
    { key: 'actual_date', label: '实际完成时间', width: 547, type: 'date' },
    { key: 'status', label: '任务状态', width: 660, type: 'select', options: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'DELAYED'], optionLabels: TODO_STATUS },
    { key: 'remark', label: '备注', width: 153, type: 'text', placeholder: '备注' },
  ]
  return <RegisterTable title="其他待办事项" icon={ListTodo} accent="var(--color-accent)" addLabel="登记任务" emptyText="该项目暂无待办事项 · 点 [登记任务] 或 [导入] 从 Excel 加载" columns={columns} items={r.items} draft={r.draft} saving={r.saving} error={r.error} onAdd={r.handleAdd} onCommit={r.handleCommit} onDelete={r.handleDelete} onExport={r.handleExport} onImportFile={r.handleImportFile} importPreview={r.importPreview} existingCount={r.items.length} onImportAppend={r.handleImportAppend} onImportReplace={r.handleImportReplace} onImportCancel={r.onImportCancel} rowText={r.rowText} />
}
function RiskRegister({ projectId }: { projectId: number }) {
  const api: RegisterApi<ProjectIssue> = {
    load: listProjectIssues,
    create: async (pid, it) => createProjectIssue({ project_id: pid, title: it.title, description: it.description, level: it.level, owner: it.owner, discovered_at: it.discovered_at, solution: it.solution, resolution: it.resolution, status: it.status }),
    update: async (id, it) => updateProjectIssue(id, it),
    del: deleteProjectIssue,
    parseExcel: parseRisksExcel,
    exportExcel: exportRisksToExcel,
    defaultDraft: (pid) => ({ id: 0, project_id: pid, title: '', description: null, level: 'MEDIUM', owner: null, plan_date: null, actual_date: null, discovered_at: formatLocalDate(new Date()), solution: null, resolution: null, status: 'OPEN', created_at: '', updated_at: '' }),
    rowText: (it) => it.title || '(无风险)',
    rowMeta: (it) => `${RISK_STATUS[it.status] ?? it.status} · ${RISK_LEVEL[it.level] ?? it.level}`,
    exportName: (n) => `项目风险登记册-${n}.xlsx`,
  }
  const r = useRegister(api, projectId)
  const columns: RegisterColumn<ProjectIssue>[] = [
    { key: 'title', label: '风险描述', width: 478, type: 'text', placeholder: '风险描述（必填）' },
    { key: 'level', label: '等级', width: 287, type: 'select', options: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], optionLabels: RISK_LEVEL },
    { key: 'discovered_at', label: '发现时间', width: 914, type: 'date' },
    { key: 'description', label: '风险对项目推进可能产生的影响', width: 745, type: 'multiline', placeholder: '影响' },
    { key: 'solution', label: '风险应对方案', width: 198, type: 'multiline', placeholder: '应对方案' },
    { key: 'owner', label: '相关人员', width: 717, type: 'text', placeholder: '相关人员' },
    { key: 'resolution', label: '当前风险应对情况说明', width: 460, type: 'multiline', placeholder: '当前应对情况' },
    { key: 'status', label: '风险状态', width: 523, type: 'select', options: ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'], optionLabels: RISK_STATUS },
  ]
  return <RegisterTable title="项目风险登记册" icon={AlertOctagon} accent="var(--color-status-danger)" addLabel="登记风险" emptyText="该项目暂无风险 · 点 [登记风险] 或 [导入] 从 Excel 加载" columns={columns} items={r.items} draft={r.draft} saving={r.saving} error={r.error} onAdd={r.handleAdd} onCommit={r.handleCommit} onDelete={r.handleDelete} onExport={r.handleExport} onImportFile={r.handleImportFile} importPreview={r.importPreview} existingCount={r.items.length} onImportAppend={r.handleImportAppend} onImportReplace={r.handleImportReplace} onImportCancel={r.onImportCancel} rowText={r.rowText} />
}
