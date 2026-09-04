/**
 * PMTool · FileTree 递归文件树（维护者 2026-08-31）
 *
 * 行为：
 *   - 目录默认折叠 · 点击切换展开
 *   - 选中态：背景 var(--color-bg-subtle) + 左边 2px accent 边
 *   - 键盘：↑↓ 上下选择 · ←→ 折叠/展开 · Enter 选中
 *   - 图标：按扩展名 lucide 分发
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronRight,
  Folder,
  FolderOpen,
  FileText,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FilePieChart,
  File as FileIcon,
  Pencil,
  Trash2,
  Copy,
} from 'lucide-react'
import type { FileNode } from '@/services/projectFiles'

interface FileTreeProps {
  root: FileNode | null
  selectedPath: string | null
  /** 选中节点回调（FilesTab 会过滤掉目录 · FileTree 内部对目录 click 不调此回调） */
  onSelect: (node: FileNode) => void
  /** 维护者 2026-08-31：行内重命名触发回调（外层弹 inline modal 收新名字 → 调 renamePath） */
  onRequestRename?: (node: FileNode) => void
  /** 维护者 2026-08-31：行内删除触发回调（外层弹 inline modal 二次确认 → 调 removePath） */
  onRequestDelete?: (node: FileNode) => void
  /** 维护者 2026-08-31：行内复制触发回调（外层调 copyPath → 成功后刷新树 + toast） */
  onRequestCopy?: (node: FileNode) => void
}

function getNodeIcon(node: FileNode, expanded: boolean) {
  if (node.isDir) {
    const Icon = expanded ? FolderOpen : Folder
    return <Icon size={14} color="#d4a017" />
  }
  const ext = node.extension ?? ''
  if (ext === 'pdf') return <FileText size={14} color="#dc2626" />
  if (ext === 'docx' || ext === 'doc') return <FileText size={14} color="#2563eb" />
  if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') return <FileSpreadsheet size={14} color="#16a34a" />
  if (ext === 'pptx' || ext === 'ppt') return <FilePieChart size={14} color="#ea580c" />
  if (
    ext === 'png' || ext === 'jpg' || ext === 'jpeg' ||
    ext === 'gif' || ext === 'webp' || ext === 'bmp' || ext === 'svg'
  ) return <FileImage size={14} color="#9333ea" />
  if (ext === 'md' || ext === 'markdown' || ext === 'txt' || ext === 'log') {
    return <FileText size={14} color="var(--color-text-secondary)" />
  }
  if (
    ext === 'json' || ext === 'xml' || ext === 'yaml' || ext === 'yml' ||
    ext === 'ts' || ext === 'tsx' || ext === 'js' || ext === 'jsx' ||
    ext === 'py' || ext === 'css' || ext === 'scss' || ext === 'java' ||
    ext === 'go' || ext === 'rs' || ext === 'sh' || ext === 'sql' ||
    ext === 'html' || ext === 'htm'
  ) return <FileCode size={14} color="#0891b2" />
  return <FileIcon size={14} color="var(--color-text-tertiary)" />
}

interface FlatRow {
  node: FileNode
  depth: number
  expanded: boolean
}

/** 扁平化可见行（已折叠的子树跳过） */
function flatten(root: FileNode | null, expanded: Set<string>): FlatRow[] {
  if (!root) return []
  const out: FlatRow[] = []
  const walk = (node: FileNode, depth: number) => {
    const isExp = expanded.has(node.path)
    out.push({ node, depth, expanded: isExp })
    if (node.isDir && isExp) {
      for (const child of node.children) {
        walk(child, depth + 1)
      }
    }
  }
  walk(root, 0)
  return out
}

export function FileTree({
  root,
  selectedPath,
  onSelect,
  onRequestRename,
  onRequestDelete,
  onRequestCopy,
}: FileTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const containerRef = useRef<HTMLDivElement>(null)
  // 维护者 2026-08-31：鼠标 hover 哪一行 → 该行展示重命名 + 删除按钮
  const [hoverPath, setHoverPath] = useState<string | null>(null)

  // 根目录默认展开
  useEffect(() => {
    if (root && !expanded.has(root.path)) {
      setExpanded((prev) => {
        const next = new Set(prev)
        next.add(root.path)
        return next
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root?.path])

  const rows = useMemo(() => flatten(root, expanded), [root, expanded])

  const selectedIdx = useMemo(
    () => rows.findIndex((r) => r.node.path === selectedPath),
    [rows, selectedPath],
  )

  const toggle = (node: FileNode) => {
    // 维护者 2026-08-31：目录点击只展开/折叠，永远不触发 onSelect（避免 FilesTab 把目录当文件预览）
    if (!node.isDir) {
      onSelect(node)
      return
    }
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(node.path)) next.delete(node.path)
      else next.add(node.path)
      return next
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (rows.length === 0) return
    if (selectedIdx < 0) return
    const cur = rows[selectedIdx]

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const next = rows[Math.min(rows.length - 1, selectedIdx + 1)]
      // 维护者 2026-08-31：上下键选文件不选目录（目录继续由 ←→ 折叠/展开）
      if (!next.node.isDir) onSelect(next.node)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const prev = rows[Math.max(0, selectedIdx - 1)]
      if (!prev.node.isDir) onSelect(prev.node)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      if (cur.node.isDir && !expanded.has(cur.node.path)) {
        setExpanded((prev) => new Set(prev).add(cur.node.path))
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      if (cur.node.isDir && expanded.has(cur.node.path)) {
        setExpanded((prev) => {
          const next = new Set(prev)
          next.delete(cur.node.path)
          return next
        })
      }
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (cur.node.isDir) toggle(cur.node)
      else onSelect(cur.node)
    }
  }

  if (!root) {
    return (
      <div
        style={{
          padding: 16,
          fontSize: 12,
          color: 'var(--color-text-tertiary)',
          textAlign: 'center',
        }}
      >
        请先选择项目目录
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      style={{
        fontSize: 12,
        fontFamily: 'var(--font-mono)',
        outline: 'none',
        // 维护者 2026-08-31：左侧目录树独立滚动 · flex:1 + minHeight:0 撑出滚动区域
        // （不能在 flex column 父容器里用 height:100% · 那样高度没边界 → 不滚动）
        flex: 1,
        minHeight: 0,
        overflow: 'auto',
        padding: '4px 0',
      }}
    >
      {rows.map(({ node, depth, expanded: isExp }) => {
        const isSelected = node.path === selectedPath
        const isHover = hoverPath === node.path
        const showActions = isHover || isSelected
        return (
          <div
            key={node.path}
            onClick={() => (node.isDir ? toggle(node) : onSelect(node))}
            onDoubleClick={() => {
              if (node.isDir) toggle(node)
              else if (onRequestRename) onRequestRename(node)
            }}
            onMouseEnter={() => setHoverPath(node.path)}
            onMouseLeave={() => setHoverPath((prev) => (prev === node.path ? null : prev))}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '3px 8px 3px 4px',
              paddingLeft: 4 + depth * 14,
              cursor: 'pointer',
              background: isSelected ? 'var(--color-bg-subtle)' : 'transparent',
              borderLeft: isSelected
                ? '2px solid var(--color-accent, #2563eb)'
                : '2px solid transparent',
              color: 'var(--color-text)',
              userSelect: 'none',
              whiteSpace: 'nowrap',
            }}
            title={node.path}
          >
            {node.isDir ? (
              <ChevronRight
                size={12}
                style={{
                  transform: isExp ? 'rotate(90deg)' : 'rotate(0deg)',
                  transition: 'transform 0.1s',
                  flexShrink: 0,
                }}
                color="var(--color-text-tertiary)"
              />
            ) : (
              <span style={{ width: 12, flexShrink: 0 }} />
            )}
            <span style={{ flexShrink: 0 }}>{getNodeIcon(node, isExp)}</span>
            <span
              style={{
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {node.name}
            </span>
            {/* 维护者 2026-08-31：hover / 选中时显复制 + 重命名 + 删除按钮（缩树里操作） */}
            {showActions && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 2,
                  marginLeft: 4,
                  flexShrink: 0,
                }}
              >
                {onRequestCopy && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onRequestCopy(node)
                    }}
                    title={node.isDir ? '复制目录' : '复制文件'}
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
                      borderRadius: 3,
                      padding: 0,
                    }}
                  >
                    <Copy size={10} />
                  </button>
                )}
                {onRequestRename && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onRequestRename(node)
                    }}
                    title="重命名"
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
                      borderRadius: 3,
                      padding: 0,
                    }}
                  >
                    <Pencil size={10} />
                  </button>
                )}
                {onRequestDelete && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onRequestDelete(node)
                    }}
                    title="删除"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 18,
                      height: 18,
                      border: 'none',
                      background: 'transparent',
                      color: '#dc2626',
                      cursor: 'pointer',
                      borderRadius: 3,
                      padding: 0,
                    }}
                  >
                    <Trash2 size={10} />
                  </button>
                )}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
