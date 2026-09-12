/**
 * PMTool V2.0 · 通用登记册表格组件
 * 2026-09-11 · 登记册体系（风险/需求/问题/待办 四册共用）
 *
 * 要点：枚举列中文显示 · 列宽可拖拽 · 登记按钮统一蓝色 · 最大化铺满屏幕
 */
import { useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Download, Maximize, Minimize, Plus, Trash2, Upload, type LucideIcon } from 'lucide-react'
import { InlineEditableCell } from '@/components/InlineEditableCell'

export interface RegisterColumn<R> {
  key: keyof R & string
  label: string
  width?: number
  type: 'text' | 'date' | 'select' | 'multiline'
  options?: string[]
  optionLabels?: Record<string, string>
  placeholder?: string
}

interface RegisterTableProps<R> {
  title: string
  icon: LucideIcon
  accent: string
  addLabel: string
  emptyText: string
  columns: RegisterColumn<R>[]
  items: R[]
  draft: R | null
  saving: boolean
  error: string | null
  onAdd: () => void
  onCommit: (item: R, next: Partial<R>) => void
  onDelete: (item: R) => void
  onExport: () => Promise<void>
  onImportFile: (f: File) => void
  importPreview: { title: string; meta: string }[] | null
  existingCount: number
  onImportAppend: () => void
  onImportReplace: () => void
  onImportCancel: () => void
  rowText: (item: R) => string
}

function useResizable<K extends string>() {
  const [widths, setWidths] = useState<Record<K, number>>({} as Record<K, number>)
  const drag = (k: K) => (e: React.PointerEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = widths[k] ?? 80
    const move = (ev: PointerEvent) => {
      const w = Math.max(50, startW + (ev.clientX - startX))
      setWidths((prev) => ({ ...prev, [k]: w }))
    }
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  return { widths, drag }
}

export function RegisterTable<R>({
  title, icon: Icon, accent, addLabel, emptyText, columns, items, draft, saving, error,
  onAdd, onCommit, onDelete, onExport, onImportFile, importPreview, existingCount,
  onImportAppend, onImportReplace, onImportCancel, rowText,
}: RegisterTableProps<R>) {
  const [maximized, setMaximized] = useState(false)
  const [deleting, setDeleting] = useState<R | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const { widths, drag } = useResizable<string>()

  return (
    <div style={maximized ? maxStyle : undefined}>
      <div style={barStyle}>
        <Icon size={16} strokeWidth={1.8} />
        <h3 style={titleStyle}>{title} · {items.length} 条</h3>
        <div style={barRightStyle}>
          <button type="button" style={ghostBtnStyle} onClick={() => void onExport()} data-testid={title + '-export'}><Download size={11} /> 导出</button>
          <button type="button" style={ghostBtnStyle} onClick={() => fileInputRef.current?.click()} data-testid={title + '-import'}><Upload size={11} /> 导入</button>
          <button type="button" style={{ ...accentBtnStyle, background: 'var(--color-accent)' }} onClick={onAdd} disabled={saving} data-testid={title + '-add'}><Plus size={11} /> {addLabel}</button>
          <button type="button" style={ghostBtnStyle} onClick={() => setMaximized((m) => !m)} title={maximized ? '还原' : '全屏最大化'}>{maximized ? <Minimize size={11} /> : <Maximize size={11} />}{maximized ? '还原' : '最大化'}</button>
        </div>
      </div>
      {error !== null && deleting === null && importPreview === null && <div style={errorStyle}>{error}</div>}
      <div style={maximized ? scrollStyleMax : scrollStyle}>
        {!items.length && !draft ? <div style={emptyStyle}>{emptyText}</div> : (
          <table style={tableStyle} data-testid={title + '-table'}>
            <thead><tr style={theadStyle}>
              {columns.map((col) => (
                <ResizableTh key={col.key} width={widths[col.key as string] as number} drag={drag(col.key as string)}>{col.label}</ResizableTh>
              ))}
              <ResizableTh width={undefined} drag={undefined}>操作</ResizableTh>
            </tr></thead>
            <tbody>
              {draft && <RowDisplay key="new-draft" item={draft} saving={saving} columns={columns} widths={widths} isDraft onCommit={onCommit} onDelete={() => setDeleting(null)} />}
              {items.map((item) => (
                <RowDisplay key={(item as { id: number }).id} item={item} saving={saving} columns={columns} widths={widths} onCommit={onCommit} onDelete={() => setDeleting(item)} />
              ))}
            </tbody>
          </table>
        )}
      </div>
      {deleting !== null && <ConfirmOverlay title={'删除' + title} desc={rowText(deleting)} saving={saving} error={error} onCancel={() => setDeleting(null)} onConfirm={() => { onDelete(deleting); setDeleting(null) }} />}
      {importPreview !== null && <ImportModal itemCount={importPreview.length} existingCount={existingCount} saving={saving} error={error} preview={importPreview} onCancel={onImportCancel} onAppend={onImportAppend} onReplace={onImportReplace} />}
      <input ref={fileInputRef} type="file" accept=".xlsx" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) onImportFile(f); e.target.value = '' }} />
    </div>
  )
}

function RowDisplay<R>({ item, saving, columns, widths, isDraft = false, onCommit, onDelete }: { item: R; saving: boolean; columns: RegisterColumn<R>[]; widths: Record<string, number>; isDraft?: boolean; onCommit: (item: R, next: Partial<R>) => void; onDelete: () => void }) {
  return (
    <tr data-testid={isDraft ? 'register-row-draft' : 'register-row-' + (item as { id: number }).id}>
      {columns.map((col) => {
        const raw = (item as Record<string, unknown>)[col.key] as string | number | null
        const fmt = col.type === 'select' && col.optionLabels ? (v: string | number | null) => col.optionLabels![String(v)] ?? String(v) : undefined
        return (
          <td key={col.key} style={tdStyle}>
            <InlineEditableCell value={raw} type={col.type === 'multiline' ? 'text' : col.type} options={col.type === 'select' ? col.options : undefined} optionLabels={col.type === 'select' ? col.optionLabels : undefined} multiline={col.type === 'multiline'} mono={col.type === 'date'} placeholder={col.placeholder} displayFormatter={fmt} onCommit={(v) => onCommit(item, { [col.key]: v } as Partial<R>)} />
          </td>
        )
      })}
      <td style={tdStyle}><button type="button" onClick={onDelete} disabled={saving} title="删除" style={{ ...iconBtnStyle, color: 'var(--color-status-danger)' }}><Trash2 size={13} /></button></td>
    </tr>
  )
}

function ResizableTh({ width, drag, children }: { width?: number | undefined; drag?: ((e: React.PointerEvent) => void) | undefined; children: React.ReactNode }) {
  return (
    <th style={{ ...thStyle, width, position: 'relative' }}>{children}{drag && <div onPointerDown={drag} title="拖动调整列宽" style={dragStyle} />}</th>
  )
}

function ConfirmOverlay({ title, desc, saving, error, onCancel, onConfirm }: { title: string; desc: string; saving: boolean; error: string | null; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div style={confOverlayStyle} onClick={() => !saving && onCancel()}>
      <div style={confBoxStyle} onClick={(e) => e.stopPropagation()}>
        <h3 style={confTitleStyle}>{title}</h3>
        <p style={confDescStyle}>确定要删除「{desc}」？该操作不可撤销。</p>
        {error && <div style={confErrorStyle}>{error}</div>}
        <div style={confFooterStyle}>
          <button type="button" onClick={onCancel} disabled={saving} style={ghostBtnStyle}>取消</button>
          <button type="button" onClick={onConfirm} disabled={saving} style={dangerBtnStyle}>{saving ? '处理中…' : '确认删除'}</button>
        </div>
      </div>
    </div>
  )
}

function ImportModal({ itemCount, existingCount, saving, error, preview, onCancel, onAppend, onReplace }: { itemCount: number; existingCount: number; saving: boolean; error: string | null; preview: { title: string; meta: string }[]; onCancel: () => void; onAppend: () => void; onReplace: () => void }) {
  return (
    <div style={imOverlayStyle} onClick={() => !saving && onCancel()}>
      <div style={imBoxStyle} onClick={(e) => e.stopPropagation()}>
        <h3 style={imTitleStyle}>导入条目</h3>
        <p style={imDescStyle}>解析到 <strong>{itemCount}</strong> 条，当前已有 <strong>{existingCount}</strong> 条，请选择处理方式：</p>
        <ul style={imListStyle}>
          {preview.map((it, idx) => (
            <li key={idx} style={imItemStyle}>
              <span style={imNumStyle}>{idx + 1}</span>
              <span style={imTextStyle}>{it.title || '(无)'}</span>
              <span style={imMetaStyle}>{it.meta}</span>
            </li>
          ))}
        </ul>
        {error && <div style={imErrStyle}>{error}</div>}
        <div style={imFootStyle}>
          <button type="button" onClick={onCancel} disabled={saving} style={ghostBtnStyle}>取消</button>
          <button type="button" onClick={onAppend} disabled={saving} style={accentBtnStyle}>{saving ? '处理中…' : '追加 ' + itemCount + ' 条'}</button>
          <button type="button" onClick={onReplace} disabled={saving} style={{ ...dangerBtnStyle, opacity: saving ? 0.5 : 1 }}>{saving ? '覆盖中…' : '覆盖 · 删 ' + existingCount + ' 写 ' + itemCount}</button>
        </div>
      </div>
    </div>
  )
}

const maxStyle: CSSProperties = { position: 'fixed', inset: '0', background: 'var(--color-bg)', zIndex: 733, display: 'flex', flexDirection: 'column' }
const barStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '12px 0 8px', marginBottom: '0' }
const barRightStyle: CSSProperties = { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }
const titleStyle: CSSProperties = { margin: '0', fontSize: 'inherit', color: 'var(--color-text)' }
const ghostBtnStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: '1px solid var(--color-border-thin)', borderRadius: 'var(--radius)', background: 'var(--color-bg-subtle)', color: 'var(--color-text-secondary)', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit' }
const accentBtnStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 12px', border: 'none', borderRadius: 'var(--radius)', background: 'var(--color-accent)', color: 'var(--color-text-on-accent)', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }
const dangerBtnStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 12px', border: 'none', borderRadius: 'var(--radius)', background: '#ef4444', color: '#fff', fontSize: '12px', fontWeight: 500, cursor: 'pointer' }
const iconBtnStyle: CSSProperties = { display: 'inline-flex', padding: '0', border: 'none', background: 'transparent', cursor: 'pointer' }
const thStyle: CSSProperties = { padding: '8px 14px', textAlign: 'left', fontSize: 'inherit', color: 'var(--color-text-secondary)', borderBottom: '1px solid var(--color-border-thin)', wordBreak: 'break-word' }
const tdStyle: CSSProperties = { padding: '8px 14px', borderBottom: '1px solid var(--color-border-thin)', verticalAlign: 'top', wordBreak: 'break-word' }
const scrollStyle: CSSProperties = { overflow: 'auto', border: '1px solid var(--color-border-thin)', borderRadius: 'var(--radius)', background: 'var(--color-surface)' }
const scrollStyleMax: CSSProperties = { flex: '1', overflow: 'auto', border: '1px solid var(--color-border-thin)', borderRadius: 'var(--radius)', background: 'var(--color-surface)' }
const tableStyle: CSSProperties = { width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', fontSize: 'inherit' }
const theadStyle: CSSProperties = { background: 'var(--color-bg-muted)' }
const emptyStyle: CSSProperties = { padding: '0', color: 'var(--color-text-tertiary)', fontSize: 'inherit' }
const dragStyle: CSSProperties = { position: 'absolute', top: '0', bottom: '0', right: '0', width: '7px', cursor: 'col-resize', zIndex: '99', touchAction: 'none' }
const overlayStyle: CSSProperties = { position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: '999' }
const boxStyle: CSSProperties = { background: 'var(--color-surface)', borderRadius: 'var(--radius)', padding: '0', maxWidth: '640px', width: '90%' }
const boxTitleStyle: CSSProperties = { margin: '0', fontSize: 'inherit' }
const boxDescStyle: CSSProperties = { margin: '0', fontSize: 'inherit', color: 'var(--color-text-secondary)' }
const boxErrStyle: CSSProperties = { margin: '0', padding: '0', background: 'rgba(239,68,68,0.06)', color: '#ef4444', fontSize: 'inherit' }
const boxFootStyle: CSSProperties = { display: 'flex', justifyContent: 'flex-end' }
const errorStyle: CSSProperties = { marginBottom: '0', padding: '0', background: 'rgba(239,68,68,0.08)', color: '#ef4444', fontSize: 'inherit' }
const listStyle: CSSProperties = { margin: '0', padding: '0', listStyle: 'none', maxHeight: '240px', overflowY: 'auto', border: '1px solid var(--color-border-thin)', borderRadius: 'var(--radius)' }
const itemStyle: CSSProperties = { padding: '8px 14px', borderBottom: '1px solid var(--color-border-thin)', fontSize: 'inherit', color: 'var(--color-text-secondary)' }

const confOverlayStyle: CSSProperties = { position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }
const confBoxStyle: CSSProperties = { width: '420px', background: 'var(--color-surface)', borderRadius: 'var(--radius-md)', padding: '20px', border: '1px solid var(--color-border-thin)' }
const confTitleStyle: CSSProperties = { fontSize: '15px', fontWeight: 600, margin: '0 0 12px', color: 'var(--color-text)' }
const confDescStyle: CSSProperties = { fontSize: '13px', color: 'var(--color-text-secondary)', margin: '0 0 16px', lineHeight: 1.6 }
const confErrorStyle: CSSProperties = { color: 'var(--color-status-danger)', fontSize: '12px', marginBottom: '12px' }
const confFooterStyle: CSSProperties = { display: 'flex', gap: '8px', justifyContent: 'flex-end' }

const imOverlayStyle: CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }
const imBoxStyle: CSSProperties = { width: '460px', maxHeight: '80vh', overflowY: 'auto', background: 'var(--color-surface)', borderRadius: 'var(--radius-md)', padding: '20px', border: '1px solid var(--color-border-thin)', boxShadow: 'inherit' }
const imTitleStyle: CSSProperties = { fontSize: '15px', fontWeight: 600, margin: '0 0 12px', color: 'var(--color-text)' }
const imDescStyle: CSSProperties = { fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: 1.6, margin: '0 0 8px' }
const imListStyle: CSSProperties = { margin: '0', padding: '0', listStyle: 'none', maxHeight: '220px', overflowY: 'auto', border: '1px solid var(--color-border-thin)', borderRadius: 'var(--radius)' }
const imItemStyle: CSSProperties = { padding: '8px 10px', borderBottom: '1px solid var(--color-border-thin)', display: 'flex', alignItems: 'baseline', gap: '8px', fontSize: '13px', color: 'var(--color-text-secondary)' }
const imNumStyle: CSSProperties = { width: '18px', textAlign: 'right', flexShrink: 0, fontWeight: 600, color: 'var(--color-text-tertiary)' }
const imTextStyle: CSSProperties = { flex: 1, minWidth: 0, wordBreak: 'break-word' }
const imMetaStyle: CSSProperties = { color: 'var(--color-text-tertiary)' }
const imErrStyle: CSSProperties = { color: 'var(--color-status-danger)', fontSize: '12px', margin: '8px 0' }
const imFootStyle: CSSProperties = { display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }
