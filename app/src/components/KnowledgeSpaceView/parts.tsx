/**
 * PMTool · 知识中心共享部件（维护者 2026-09-01）
 *
 * 从旧版 KnowledgeSpaceView/index.tsx 抽出（2026-09-16 旧三栏 UI 已删除）：
 *   - GlobalSearchResults（知识中心·全局搜索）等仍在使用
 *
 * 包含：样式常量 / 目录树行 FolderTreeRow / 笔记行 NoteListRow /
 *       inline 新建目录行 NewFolderInlineRow / 编辑器面板 ActiveNoteEditor
 */

import { useState, useEffect, useMemo } from 'react'
import { ChevronRight, ChevronDown, FolderOpen, Folder, FolderPlus, Trash2, FileText, X, Sparkles, BookOpen, Pencil, Check, Link2 } from 'lucide-react'
import type { KnowledgeNote as DbNote, KnowledgeFolder as DbFolder } from '@/services/knowledge'
import type { FolderNode } from './tree'
import { DocumentEditor } from '@/components/DocumentEditor'
import { parseStoredUtc } from '@/services/datetime'

// ============================================================
// 样式常量
// ============================================================

export const rootStyle: React.CSSProperties = {
  display: 'flex',
  height: '100%',
  width: '100%',
  minWidth: 0,
  background: 'var(--color-bg)',
}

export const treePanelStyle: React.CSSProperties = {
  width: 240,
  flexShrink: 0,
  borderRight: '1px solid var(--color-border-thin)',
  background: 'var(--color-bg-subtle)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
}

export const listPanelStyle: React.CSSProperties = {
  width: 320,
  flexShrink: 0,
  borderRight: '1px solid var(--color-border-thin)',
  background: 'var(--color-bg)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
}

export const editorPanelStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
  background: 'var(--color-bg)',
}

export const headerStyle: React.CSSProperties = {
  padding: '14px 16px',
  borderBottom: '1px solid var(--color-border-thin)',
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexShrink: 0,
}

export const titleStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: 'var(--color-text)',
  flex: 1,
  margin: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

export const subtitleStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--color-text-tertiary)',
  padding: '0 16px 10px',
  borderBottom: '1px solid var(--color-border-thin)',
  flexShrink: 0,
}

export const searchWrapStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  margin: '0 16px 10px',
  padding: '0 10px',
  height: 28,
  background: 'var(--color-bg)',
  border: '1px solid var(--color-border-thin)',
  borderRadius: 'var(--radius)',
}

export const searchInputStyle: React.CSSProperties = {
  flex: 1,
  border: 'none',
  outline: 'none',
  background: 'transparent',
  fontSize: 12,
  color: 'var(--color-text)',
}

export const btnPrimaryStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '5px 10px',
  background: 'var(--color-accent)',
  color: 'var(--color-text-on-accent, #fff)',
  borderRadius: 'var(--radius)',
  fontSize: 12,
  fontWeight: 500,
  border: 'none',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

export const btnGhostStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '5px 10px',
  background: 'transparent',
  color: 'var(--color-text-secondary)',
  border: '1px solid var(--color-border-thin)',
  borderRadius: 'var(--radius)',
  fontSize: 12,
  fontWeight: 500,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

export const iconBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 22,
  height: 22,
  background: 'transparent',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
  color: 'var(--color-text-tertiary)',
  flexShrink: 0,
}

/** 维护者 2026-09-01：行内确认/取消小按钮（共享高度 22，跟 iconBtn 视觉一致）· 用于删除/重命名等内联确认态 */
export const inlineConfirmBtnStyle = (danger?: boolean): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: 22,
  padding: '0 8px',
  background: 'transparent',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 10.5,
  fontWeight: 500,
  color: danger ? '#dc2626' : 'var(--color-text-tertiary)',
  flexShrink: 0,
  fontFamily: 'inherit',
})

export const folderRowStyle = (active: boolean, depth: number): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: `5px 10px 5px ${8 + depth * 14}px`,
  fontSize: 12.5,
  fontWeight: active ? 500 : 400,
  color: active ? 'var(--color-text)' : 'var(--color-text-secondary)',
  background: active ? 'var(--color-bg-active)' : 'transparent',
  border: 'none',
  cursor: 'pointer',
  textAlign: 'left',
  width: '100%',
})

export const noteRowStyle = (active: boolean): React.CSSProperties => ({
  display: 'block',
  padding: '10px 14px',
  borderBottom: '1px solid var(--color-border-thin)',
  background: active ? 'var(--color-bg-subtle)' : 'transparent',
  cursor: 'pointer',
  position: 'relative',
})

export const emptyStyle: React.CSSProperties = {
  padding: '40px 16px',
  textAlign: 'center',
  fontSize: 12,
  color: 'var(--color-text-tertiary)',
}

export const editorEmptyStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  color: 'var(--color-text-tertiary)',
  fontSize: 13,
  gap: 12,
  padding: 32,
  textAlign: 'center',
}

export function formatRelative(iso: string): string {
  const t = parseStoredUtc(iso).getTime()
  if (Number.isNaN(t)) return ''
  const now = Date.now()
  const diff = Math.floor((now - t) / 60000)
  if (diff < 1) return '刚刚'
  if (diff < 60) return `${diff} 分钟前`
  if (diff < 60 * 24) return `${Math.floor(diff / 60)} 小时前`
  const days = Math.floor(diff / (60 * 24))
  if (days < 30) return `${days} 天前`
  return parseStoredUtc(iso).toLocaleDateString('zh-CN')
}

// ============================================================
// FolderTreeRow（递归目录树行 · 含删除确认 + 新建子目录）
// ============================================================

export function FolderTreeRow({
  node,
  depth,
  activeId,
  onSelect,
  onCreateChild,
  onDeleteFolder,
  onRenameFolder,
  creatingFolderParentId,
  onSubmitNewFolder,
  onCancelNewFolder,
}: {
  node: FolderNode
  depth: number
  activeId: number | null
  onSelect: (id: number) => void
  onCreateChild: (id: number) => void
  onDeleteFolder: (id: number) => void
  onRenameFolder?: (id: number, name: string) => void
  creatingFolderParentId?: number | null | undefined
  onSubmitNewFolder?: (name: string) => void
  onCancelNewFolder?: () => void
}) {
  const [expanded, setExpanded] = useState(true)
  // 维护者 2026-08-31：两态删除按钮（同 NoteListRow 模式）
  const [confirming, setConfirming] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(node.name)
  const hasChildren = node.children.length > 0
  const isActive = activeId === node.id
  const isSystem = node.isSystem === true

  const submitRename = () => {
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== node.name) {
      onRenameFolder?.(node.id, trimmed)
    }
    setRenaming(false)
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {renaming && !isSystem && onRenameFolder ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: `5px 10px 5px ${8 + depth * 14}px`,
              fontSize: 12.5,
              background: 'var(--color-bg-active)',
              borderRadius: 'var(--radius)',
              flex: 1,
              minWidth: 0,
            }}
          >
            <Folder size={12} strokeWidth={1.5} color="var(--color-accent)" style={{ flexShrink: 0 }} />
            <input
              autoFocus
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  submitRename()
                }
                if (e.key === 'Escape') {
                  e.preventDefault()
                  setRenameValue(node.name)
                  setRenaming(false)
                }
              }}
              onBlur={submitRename}
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                background: 'transparent',
                fontSize: 12.5,
                color: 'var(--color-text)',
                minWidth: 0,
                padding: 0,
              }}
            />
            <button type="button" style={iconBtnStyle} onClick={submitRename} title="确认 (Enter)">
              <Check size={10} />
            </button>
            <button type="button" style={iconBtnStyle} onClick={() => { setRenameValue(node.name); setRenaming(false) }} title="取消 (Esc)">
              <X size={10} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            style={folderRowStyle(isActive, depth)}
            onClick={() => onSelect(node.id)}
            onDoubleClick={() => { if (!isSystem && onRenameFolder) { setRenameValue(node.name); setRenaming(true) } }}
            title={isSystem ? `${node.name}（系统目录·不允许删除）` : node.name}
          >
            {hasChildren ? (
              <span
                onClick={(e) => {
                  e.stopPropagation()
                  setExpanded((v) => !v)
                }}
                style={{ display: 'inline-flex' }}
              >
                {expanded ? (
                  <ChevronDown size={11} strokeWidth={2} color="var(--color-text-tertiary)" />
                ) : (
                  <ChevronRight size={11} strokeWidth={2} color="var(--color-text-tertiary)" />
                )}
              </span>
            ) : (
              <span style={{ width: 11, display: 'inline-block' }} />
            )}
            {/* 维护者 2026-08-31：系统虚拟目录（AI 知识）用紫色 sparkle 图标 + 不允许删除 */}
            {isSystem ? (
              <Sparkles
                size={12}
                strokeWidth={1.75}
                color={isActive ? 'var(--color-accent)' : '#9333ea'}
              />
            ) : isActive ? (
              <FolderOpen size={12} strokeWidth={1.75} color="var(--color-accent)" />
            ) : (
              <Folder size={12} strokeWidth={1.5} color="var(--color-text-tertiary)" />
            )}
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {node.name}
            </span>
            {node.notes.length > 0 && (
              <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>
                {node.notes.length}
              </span>
            )}
          </button>
        )}
        {!isSystem && node.id > 0 && !renaming && (
          confirming ? (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setConfirming(false)
                }}
                style={{
                  ...iconBtnStyle,
                  marginRight: 6,
                  fontSize: 10,
                  color: 'var(--color-text-tertiary)',
                }}
                title="取消"
              >
                取消
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setConfirming(false)
                  onDeleteFolder(node.id)
                }}
                style={{
                  ...iconBtnStyle,
                  marginRight: 6,
                  fontSize: 10,
                  color: '#fff',
                  background: '#dc2626',
                  padding: '0 6px',
                  width: 'auto',
                  fontWeight: 500,
                }}
                title="确认删除目录"
              >
                确认删除
              </button>
            </>
          ) : (
            <>
              {onRenameFolder && (
                <button
                  type="button"
                  style={iconBtnStyle}
                  onClick={(e) => {
                    e.stopPropagation()
                    setRenameValue(node.name)
                    setRenaming(true)
                  }}
                  title="重命名目录"
                >
                  <Pencil size={11} />
                </button>
              )}
              <button
                type="button"
                style={iconBtnStyle}
                onClick={(e) => {
                  e.stopPropagation()
                  onCreateChild(node.id)
                }}
                title="新建子目录"
              >
                <FolderPlus size={12} />
              </button>
              <button
                type="button"
                style={{ ...iconBtnStyle, marginRight: 6 }}
                onClick={(e) => {
                  e.stopPropagation()
                  setConfirming(true)
                }}
                title="删除目录"
              >
                <Trash2 size={11} />
              </button>
            </>
          )
        )}
      </div>
      {hasChildren && expanded && (
        <div>
          {/* 维护者 2026-09-01：新建子目录输入框嵌在父节点下一行，而不是飘到树顶部 */}
          {creatingFolderParentId === node.id && node.id > 0 && onSubmitNewFolder && onCancelNewFolder && (
            <NewFolderInlineRow
              onCancel={onCancelNewFolder}
              onSubmit={onSubmitNewFolder}
            />
          )}
          {node.children.map((c) => (
            <FolderTreeRow
              key={c.id}
              node={c}
              depth={depth + 1}
              activeId={activeId}
              onSelect={onSelect}
              onCreateChild={onCreateChild}
              onDeleteFolder={onDeleteFolder}
              onRenameFolder={onRenameFolder}
              creatingFolderParentId={creatingFolderParentId}
              onSubmitNewFolder={onSubmitNewFolder}
              onCancelNewFolder={onCancelNewFolder}
            />
          ))}
        </div>
      )}
      {/* 叶子节点（无 children）也要支持新建子目录输入框显示 */}
      {!hasChildren && expanded && creatingFolderParentId === node.id && node.id > 0 && onSubmitNewFolder && onCancelNewFolder && (
        <NewFolderInlineRow
          onCancel={onCancelNewFolder}
          onSubmit={onSubmitNewFolder}
        />
      )}
      {/* 顶层目录新建输入框（creatingFolderParentId=null 时显示在树第一行的下面）*/}
      {depth === 0 && node.parentId == null && creatingFolderParentId === null && onSubmitNewFolder && onCancelNewFolder && (
        <NewFolderInlineRow
          onCancel={onCancelNewFolder}
          onSubmit={onSubmitNewFolder}
        />
      )}
    </div>
  )
}

// ============================================================
// NoteListRow（笔记行 · 含删除确认）
// ============================================================

export function NoteListRow({
  note,
  active,
  onClick,
  onDelete,
}: {
  note: DbNote
  active: boolean
  onClick: () => void
  onDelete: () => void
}) {
  // 维护者 2026-08-31：两态删除按钮 — 第一次点 trash 变"确认删除？"，再点真删
  const [confirming, setConfirming] = useState(false)
  return (
    <div
      style={noteRowStyle(active)}
      onClick={(e) => {
        if (confirming) return
        onClick()
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <FileText
          size={12}
          strokeWidth={1.75}
          color={active ? 'var(--color-accent)' : 'var(--color-text-tertiary)'}
          style={{ flexShrink: 0 }}
        />
        <span
          style={{
            flex: 1,
            fontSize: 12.5,
            fontWeight: 500,
            color: 'var(--color-text)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={note.title || '未命名'}
        >
          {note.title || '未命名'}
        </span>
        {confirming ? (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setConfirming(false)
              }}
              style={{ ...iconBtnStyle, fontSize: 10, color: 'var(--color-text-tertiary)' }}
              title="取消"
            >
              取消
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setConfirming(false)
                onDelete()
              }}
              style={{
                ...iconBtnStyle,
                fontSize: 10,
                color: '#fff',
                background: '#dc2626',
                padding: '0 6px',
                width: 'auto',
                fontWeight: 500,
              }}
              title="确认删除"
            >
              确认删除
            </button>
          </>
        ) : (
          <button
            type="button"
            style={iconBtnStyle}
            onClick={(e) => {
              e.stopPropagation()
              setConfirming(true)
            }}
            title="删除"
          >
            <Trash2 size={10} />
          </button>
        )}
      </div>
      <div
        style={{
          fontSize: 11,
          color: 'var(--color-text-tertiary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {note.contentMd?.trim() ? note.contentMd.slice(0, 80) : '（空白笔记）'}
      </div>
      <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
        {formatRelative(note.updatedAt)}
      </div>
    </div>
  )
}

// ============================================================
// NewFolderInlineRow（新建目录 inline 输入行）
// ============================================================

export function NewFolderInlineRow({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void
  onSubmit: (name: string) => void
}) {
  const [name, setName] = useState('')
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        margin: '6px 8px 4px',
        padding: '4px 8px',
        background: 'var(--color-bg-active)',
        borderRadius: 'var(--radius)',
        border: '1px solid var(--color-accent)',
      }}
    >
      <Folder size={12} strokeWidth={1.5} color="var(--color-accent)" style={{ flexShrink: 0 }} />
      <input
        autoFocus
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            if (name.trim()) onSubmit(name)
          }
          if (e.key === 'Escape') {
            e.preventDefault()
            onCancel()
          }
        }}
        placeholder="输入目录名 · 回车"
        style={{
          flex: 1,
          border: 'none',
          outline: 'none',
          background: 'transparent',
          fontSize: 12,
          color: 'var(--color-text)',
          minWidth: 0,
        }}
      />
      <button
        type="button"
        onClick={onCancel}
        title="取消 (Esc)"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 18,
          height: 18,
          border: 'none',
          background: 'transparent',
          color: 'var(--color-text-tertiary)',
          cursor: 'pointer',
          padding: 0,
          flexShrink: 0,
        }}
      >
        <X size={10} />
      </button>
    </div>
  )
}

// ============================================================
// ActiveNoteEditor（编辑器面板 · 三处共用）
// ============================================================

export function ActiveNoteEditor({
  activeNote,
  onExported,
  onDeleted,
}: {
  activeNote: DbNote
  onExported: (path: string) => void
  onDeleted: () => void
}) {
  return (
    <DocumentEditor
      key={activeNote.id}
      source={{ kind: 'knowledge', noteId: activeNote.id }}
      initialTitle={activeNote.title}
      initialUpdatedAt={activeNote.updatedAt}
      initialNote={activeNote}
      onExported={onExported}
      onDeleted={onDeleted}
    />
  )
}

// ============================================================
// EmptyEditor（编辑器空状态复用）
// ============================================================

export function EmptyEditor({
  title,
  subtitle,
}: {
  title: string
  subtitle: string
}) {
  return (
    <div style={editorEmptyStyle}>
      <BookOpen size={36} strokeWidth={1.25} opacity={0.5} />
      <div>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
          {title}
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
          {subtitle}
        </div>
      </div>
    </div>
  )
}

// re-export 供类型引用
export type { DbFolder }
