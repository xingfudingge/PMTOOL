/**
 * PMTool · FileTree 递归文件树（维护者 2026-08-31）
 *
 * 行为：
 *   - 目录默认折叠 · 点击切换展开
 *   - 选中态：背景 var(--color-bg-subtle) + 左边 2px accent 边
 *   - 键盘：↑↓ 上下选择 · ←→ 折叠/展开 · Enter 选中 · F2 重命名 · Delete 删除
 *   - 图标：按扩展名 lucide 分发
 *   - 拖拽移动：拖到目录行 / 树空白区（= 根目录）→ onMoveToDir
 *   - 右键菜单（2026-09-16）：打开 / 在文件管理器中打开 · 复制 / 剪切 / 粘贴 · 新建 · 重命名 / 删除
 *   - 行内重命名：双击行（或 F2 / 右键重命名）→ 就地输入框
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
  Scissors,
  ClipboardPaste,
  ExternalLink,
  FilePlus,
  FolderPlus,
} from 'lucide-react'
import type { FileNode } from '@/services/projectFiles'
import { FileContextMenu, type ContextMenuItem } from '@/components/FileContextMenu'

interface FileTreeProps {
  root: FileNode | null
  selectedPath: string | null
  /** 选中节点回调（FilesTab 会过滤掉目录 · FileTree 内部对目录 click 不调此回调） */
  onSelect: (node: FileNode) => void
  /** 行内重命名触发回调（外层弹 inline modal 收新名字 → 调 renamePath）· onRename 未传时的回落 */
  onRequestRename?: (node: FileNode) => void
  /** 行内删除触发回调（外层弹 inline modal 二次确认 → 调 removePath） */
  onRequestDelete?: (node: FileNode) => void
  /** 行内复制触发回调（外层调 copyPath → 成功后刷新树 + toast）· 语义 = 就地创建副本 */
  onRequestCopy?: (node: FileNode) => void
  /**
   * 拖拽移动回调（维护者 2026-09-16 · 对齐知识中心 KnowledgeTreeView 的交互）：
   * 传入即启用拖拽 + 剪切粘贴 —— 拖动文件/目录 → 悬停目录行（或树空白区 = 根目录）高亮 → 落下触发移动。
   * FileTree 内部已校验：目标必须是目录 / 不能移入自身或子树 / 不能移入当前所在目录。
   */
  onMoveToDir?: (node: FileNode, targetDir: FileNode) => void
  /**
   * 右键「粘贴」回调 · 复制模式（维护者 2026-09-16）
   * 与 onMoveToDir 的区别：复制保留源（cut 用 onMoveToDir · copy 用本回调）。
   */
  onCopyToDir?: (node: FileNode, targetDir: FileNode) => void
  /**
   * 行内重命名提交（维护者 2026-09-16）：双击行 / F2 / 右键重命名 → 就地输入 → 回车提交。
   * 传了它双击才是就地重命名（没传则回落 onRequestRename 的弹窗模式）。
   */
  onRename?: (node: FileNode, newName: string) => void
  /** 在系统文件管理器中打开 / 显示该节点（右键「在文件管理器中打开」） */
  onReveal?: (node: FileNode) => void
  /** 用系统默认程序打开文件（右键「打开」· 与预览区「本地编辑器打开」同一后端命令） */
  onOpenExternal?: (node: FileNode) => void
  /** 右键「新建文件 / 新建文件夹」（在指定目录下新建 · 外层弹既有新建弹窗） */
  onRequestCreate?: (mode: 'file' | 'dir', dir: FileNode) => void
}

// ── 路径工具（Windows \ 与 POSIX / 兼容 · 与 FilesTab submitCreate 同口径） ──
export const stripSep = (p: string) => p.replace(/[\\/]+$/, '')
export const pathSepOf = (p: string) => (p.includes('\\') ? '\\' : '/')
export function parentOfPath(p: string): string {
  const s = stripSep(p)
  const i = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'))
  return i <= 0 ? '' : s.slice(0, i)
}
/** target 是否 dir 自身或其子孙（大小写不敏感 · Windows 路径不区分大小写） */
function isSelfOrDescendant(dir: string, target: string): boolean {
  const d = stripSep(dir).toLowerCase()
  const t = stripSep(target).toLowerCase()
  return d === t || t.startsWith(d + pathSepOf(dir))
}

/** 拖拽悬停高亮的特殊 key：树容器空白区（= 移动到根目录） */
const BG_DROP_KEY = '__tree_bg__'

/** 剪贴板（右键复制 / 剪切 → 粘贴） */
interface Clipboard {
  node: FileNode
  mode: 'copy' | 'cut'
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
  onMoveToDir,
  onCopyToDir,
  onRename,
  onReveal,
  onOpenExternal,
  onRequestCreate,
}: FileTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const containerRef = useRef<HTMLDivElement>(null)
  // 维护者 2026-08-31：鼠标 hover 哪一行 → 该行展示重命名 + 删除按钮
  const [hoverPath, setHoverPath] = useState<string | null>(null)
  // 维护者 2026-09-16：拖拽移动状态（交互与视觉反馈对齐知识中心 KnowledgeTreeView）
  const [drag, setDrag] = useState<FileNode | null>(null)
  const [dropPath, setDropPath] = useState<string | null>(null)
  const canDrag = !!onMoveToDir

  // 维护者 2026-09-16：右键菜单 + 剪贴板 + 行内重命名
  /** node = null 表示「树空白区」（等价于对根目录操作） */
  const [menu, setMenu] = useState<{ x: number; y: number; node: FileNode | null } | null>(null)
  const [clipboard, setClipboard] = useState<Clipboard | null>(null)
  const [renamingPath, setRenamingPath] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const resetDrag = () => {
    setDrag(null)
    setDropPath(null)
  }

  /** 拖起的就是根目录行 → 永远不可移动（整棵树的边界） */
  const dragIsRoot = !!drag && !!root && drag.path === root.path

  /** 放置目标判定：null = 不可放置。目录行 / 根目录行可作目标 */
  const dropTargetOf = (node: FileNode): FileNode | null => {
    if (!canDrag || !drag || dragIsRoot) return null
    if (!node.isDir) return null
    // 目录不能移入自身或其子孙（会破坏数据 / 文件系统必然报错）
    if (drag.isDir && isSelfOrDescendant(drag.path, node.path)) return null
    // 已在该目录下 → 非有效目标（不点亮、落下 no-op）
    if (
      stripSep(parentOfPath(drag.path)).toLowerCase() ===
      stripSep(node.path).toLowerCase()
    ) {
      return null
    }
    return node
  }

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

  // ── 行内重命名（维护者 2026-09-16） ──
  const startRename = (node: FileNode) => {
    if (!onRename) return
    if (root && node.path === root.path) return // 根目录 = 绑定的目录本身，不允许改名
    setRenameValue(node.name)
    setRenamingPath(node.path)
  }
  const cancelRename = () => {
    setRenamingPath(null)
    setRenameValue('')
  }
  const submitRename = (node: FileNode) => {
    const v = renameValue.trim()
    const wasRenaming = renamingPath === node.path
    cancelRename()
    if (!wasRenaming || !v || v === node.name) return
    if (/[\\/]/.test(v)) return // 带分隔符会拼成别处的路径
    onRename?.(node, v)
  }

  // ── 粘贴（维护者 2026-09-16）：复制 → onCopyToDir；剪切 → onMoveToDir ──
  /** 该目录是否可作粘贴目标（源不能粘到自己/自己的子树/原地） */
  const canPasteInto = (targetDir: FileNode): boolean => {
    if (!clipboard) return false
    const src = clipboard.node
    if (clipboard.mode === 'cut' && !onMoveToDir) return false
    if (clipboard.mode === 'copy' && !onCopyToDir) return false
    if (src.isDir && isSelfOrDescendant(src.path, targetDir.path)) return false
    if (
      clipboard.mode === 'cut' &&
      stripSep(parentOfPath(src.path)).toLowerCase() === stripSep(targetDir.path).toLowerCase()
    ) {
      return false // 剪切到原地 = 无意义
    }
    return true
  }

  const pasteInto = (targetDir: FileNode) => {
    if (!clipboard || !canPasteInto(targetDir)) return
    const { node: src, mode } = clipboard
    if (mode === 'cut') {
      onMoveToDir?.(src, targetDir)
      // 剪切粘贴后清空剪贴板（与资源管理器一致）；复制保留，可连续粘贴
      setClipboard(null)
    } else {
      onCopyToDir?.(src, targetDir)
    }
  }

  /** 组装右键菜单项（target = null 表示树空白区） */
  const menuItemsFor = (target: FileNode | null): ContextMenuItem[] => {
    const items: ContextMenuItem[] = []
    const dirForPaste = target ?? root
    const isRootRow = !!target && !!root && target.path === root.path

    if (!target) {
      // 空白区右键 = 对根目录的新建 / 粘贴 / 打开
      if (onReveal && root) {
        items.push({
          key: 'reveal-root',
          label: '在文件管理器中打开',
          icon: <FolderOpen size={12} />,
          onSelect: () => onReveal(root),
        })
      }
      if (dirForPaste) {
        items.push({
          key: 'paste-root',
          dividerBefore: items.length > 0,
          label: '粘贴',
          icon: <ClipboardPaste size={12} />,
          disabled: !canPasteInto(dirForPaste),
          onSelect: () => pasteInto(dirForPaste),
        })
      }
      if (onRequestCreate && dirForPaste) {
        items.push({
          key: 'new-file-root',
          dividerBefore: true,
          label: '新建文件',
          icon: <FilePlus size={12} />,
          onSelect: () => onRequestCreate('file', dirForPaste),
        })
        items.push({
          key: 'new-dir-root',
          label: '新建文件夹',
          icon: <FolderPlus size={12} />,
          onSelect: () => onRequestCreate('dir', dirForPaste),
        })
      }
      return items
    }

    // 打开（文件 → 系统默认程序；目录 → 在文件管理器中打开）
    if (!target.isDir && onOpenExternal) {
      items.push({
        key: 'open',
        label: '打开',
        icon: <ExternalLink size={12} />,
        onSelect: () => onOpenExternal(target),
      })
    }
    if (onReveal) {
      items.push({
        key: 'reveal',
        label: target.isDir ? '在文件管理器中打开' : '在文件管理器中显示',
        icon: <FolderOpen size={12} />,
        onSelect: () => onReveal(target),
      })
    }
    // 复制 / 剪切（根目录行除外 —— 它代表绑定目录本身，不能挪走）
    if (!isRootRow && (onCopyToDir || onMoveToDir)) {
      items.push({
        key: 'copy',
        dividerBefore: items.length > 0,
        label: '复制',
        icon: <Copy size={12} />,
        onSelect: () => setClipboard({ node: target, mode: 'copy' }),
      })
      if (onMoveToDir) {
        items.push({
          key: 'cut',
          label: '剪切',
          icon: <Scissors size={12} />,
          onSelect: () => setClipboard({ node: target, mode: 'cut' }),
        })
      }
    }
    // 目录行（含根目录行）：粘贴 / 新建
    if (target.isDir) {
      items.push({
        key: 'paste',
        dividerBefore: true,
        label: '粘贴',
        icon: <ClipboardPaste size={12} />,
        disabled: !canPasteInto(target),
        onSelect: () => pasteInto(target),
      })
      if (onRequestCreate) {
        items.push({
          key: 'new-file',
          label: '新建文件',
          icon: <FilePlus size={12} />,
          onSelect: () => onRequestCreate('file', target),
        })
        items.push({
          key: 'new-dir',
          label: '新建文件夹',
          icon: <FolderPlus size={12} />,
          onSelect: () => onRequestCreate('dir', target),
        })
      }
    }
    // 重命名 / 删除（根目录行除外）
    if (!isRootRow && (onRename || onRequestRename)) {
      items.push({
        key: 'rename',
        dividerBefore: true,
        label: '重命名',
        icon: <Pencil size={12} />,
        onSelect: () => {
          if (onRename) startRename(target)
          else onRequestRename?.(target)
        },
      })
    }
    if (!isRootRow && onRequestDelete) {
      items.push({
        key: 'delete',
        label: '删除',
        icon: <Trash2 size={12} />,
        danger: true,
        onSelect: () => onRequestDelete(target),
      })
    }
    return items
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (renamingPath) return // 输入框自己处理键盘
    if (rows.length === 0) return
    if (selectedIdx < 0) return
    const cur = rows[selectedIdx]
    const curIsRoot = !!root && cur.node.path === root.path

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
    } else if (e.key === 'F2') {
      // 资源管理器习惯
      if (onRename && !curIsRoot) {
        e.preventDefault()
        startRename(cur.node)
      }
    } else if (e.key === 'Delete') {
      if (onRequestDelete && !curIsRoot) {
        e.preventDefault()
        onRequestDelete(cur.node)
      }
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
      // 维护者 2026-09-16：拖到树空白区 = 移动到根目录（行级 onDragOver 会 stopPropagation，两者不冲突）
      onDragOver={(e) => {
        if (!drag || !onMoveToDir || dragIsRoot) return
        if (e.target !== containerRef.current) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        if (parentOfPath(drag.path).toLowerCase() !== stripSep(root!.path).toLowerCase()) {
          setDropPath(BG_DROP_KEY)
        }
      }}
      onDrop={(e) => {
        if (!drag || !onMoveToDir || !root || dragIsRoot) return
        if (e.target !== containerRef.current) return
        e.preventDefault()
        if (parentOfPath(drag.path).toLowerCase() !== stripSep(root.path).toLowerCase()) {
          onMoveToDir(drag, root)
        }
        resetDrag()
      }}
      // 维护者 2026-09-16：空白区右键 = 对根目录的操作（粘贴 / 新建）
      onContextMenu={(e) => {
        if (e.target !== containerRef.current) return
        e.preventDefault()
        // 没有任何可用操作时不弹空菜单
        if (menuItemsFor(null).length === 0) return
        setMenu({ x: e.clientX, y: e.clientY, node: null })
      }}
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
        background: dropPath === BG_DROP_KEY ? 'var(--color-bg-subtle)' : 'transparent',
      }}
    >
      {rows.map(({ node, depth, expanded: isExp }) => {
        const isSelected = node.path === selectedPath
        const isHover = hoverPath === node.path
        const showActions = isHover || isSelected
        const isDragging = drag?.path === node.path
        const isDropTarget = dropPath === node.path
        const isRootRow = node.path === root.path
        const isCut = clipboard?.mode === 'cut' && clipboard.node.path === node.path
        const isMenuTarget = menu?.node?.path === node.path
        const isRenaming = renamingPath === node.path
        return (
          <div
            key={node.path}
            onClick={() => (node.isDir ? toggle(node) : onSelect(node))}
            onDoubleClick={() => {
              // 维护者 2026-09-16：双击就地重命名（对齐知识中心目录树）· 未接 onRename 时回落旧行为
              if (onRename && !isRootRow) startRename(node)
              else if (node.isDir) toggle(node)
              else if (onRequestRename) onRequestRename(node)
            }}
            onContextMenu={(e) => {
              e.preventDefault()
              e.stopPropagation()
              // 没有任何可用操作时不弹空菜单（调用方没接操作回调的情况）
              if (menuItemsFor(node).length === 0) return
              // 右键文件 → 同步选中（顶部工具栏「删除」/ 预览区跟随）
              if (!node.isDir && !isRenaming) onSelect(node)
              setMenu({ x: e.clientX, y: e.clientY, node })
            }}
            onMouseEnter={() => setHoverPath(node.path)}
            onMouseLeave={() => setHoverPath((prev) => (prev === node.path ? null : prev))}
            // 维护者 2026-09-16：拖起 / 悬停目标 / 落下（移动语义校验在 dropTargetOf · 根目录行不可拖）
            // 重命名中不可拖（否则拖拽会抢走输入框里的文字选择）
            draggable={canDrag && !isRootRow && !isRenaming}
            onDragStart={(e) => {
              if (!canDrag || isRenaming) return
              e.dataTransfer.effectAllowed = 'move'
              try {
                e.dataTransfer.setData('text/plain', node.path)
              } catch {
                /* WebView 个别情况下 setData 受限，不影响组件内状态拖拽 */
              }
              setDrag(node)
            }}
            onDragEnd={resetDrag}
            onDragOver={(e) => {
              if (!drag) return
              // 行内吃掉事件，阻止冒泡到容器（否则拖到文件/无效目标上会误亮「根目录」高亮）
              e.stopPropagation()
              const target = dropTargetOf(node)
              if (target) {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                if (dropPath !== node.path) setDropPath(node.path)
              } else if (dropPath) {
                setDropPath(null)
              }
            }}
            onDrop={(e) => {
              if (!drag) return
              e.stopPropagation()
              const target = dropTargetOf(node)
              if (!target || !onMoveToDir) return
              e.preventDefault()
              onMoveToDir(drag, target)
              resetDrag()
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '3px 8px 3px 4px',
              paddingLeft: 4 + depth * 14,
              cursor: 'pointer',
              background:
                isDropTarget || isMenuTarget
                  ? 'var(--color-bg-active)'
                  : isSelected
                    ? 'var(--color-bg-subtle)'
                    : 'transparent',
              boxShadow: isDropTarget ? 'inset 0 0 0 1.5px var(--color-accent)' : undefined,
              borderLeft: isSelected
                ? '2px solid var(--color-accent, #2563eb)'
                : '2px solid transparent',
              color: 'var(--color-text)',
              userSelect: 'none',
              whiteSpace: 'nowrap',
              // 已剪切的行淡显（提示「它将被移走」· 与资源管理器一致）
              opacity: isDragging ? 0.45 : isCut ? 0.5 : 1,
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
            {isRenaming ? (
              <input
                autoFocus
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onDoubleClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    submitRename(node)
                  } else if (e.key === 'Escape') {
                    e.preventDefault()
                    cancelRename()
                  }
                }}
                onBlur={() => submitRename(node)}
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: '1px 4px',
                  fontSize: 12,
                  fontFamily: 'inherit',
                  color: 'var(--color-text)',
                  background: 'var(--color-bg)',
                  border: '1px solid var(--color-accent, #2563eb)',
                  borderRadius: 3,
                  outline: 'none',
                }}
              />
            ) : (
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
            )}
            {/* 维护者 2026-08-31：hover / 选中时显复制 + 重命名 + 删除按钮（缩树里操作） */}
            {showActions && !isRenaming && (
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
                    title={node.isDir ? '创建副本（就地复制目录）' : '创建副本（就地复制文件）'}
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
                {(onRename || onRequestRename) && !isRootRow && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (onRename) startRename(node)
                      else onRequestRename?.(node)
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
                {onRequestDelete && !isRootRow && (
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

      {/* 右键菜单（fixed 定位 · 不受树滚动容器裁剪） */}
      {menu && (
        <FileContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItemsFor(menu.node)}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  )
}
