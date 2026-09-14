import { useState, useEffect } from 'react'
import {
  FolderOpen,
  Folder,
  FolderPlus,
  Plus,
  Trash2,
  X,
  RefreshCw,
  ExternalLink,
 } from 'lucide-react'
import { FileTree } from '@/components/FileTree'
import { FilePreview } from '@/components/FilePreview'
import {
  listProjectFiles,
  pickProjectDirectory,
  createFile,
  createDirectory,
  removePath,
  openFileExternal,
  type FileNode,
 } from '@/services/projectFiles'
import { getTemplateDirectory, setTemplateDirectory } from '@/services/templateDirectory'

export function TemplatesPage() {
  // ⚠️ 维护者 2026-08-31 修复：所有 hooks 必须在条件 return 之前调用（Rules of Hooks）
  // 之前把 useState 写在 if (false) return 之后，导致 hooks 顺序跨渲染跳变，
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
   *   - { kind: 'clear' }         解除模板目录绑定
   */
  type PendingConfirm =
    | { kind: 'delete'; node: FileNode }
    | { kind: 'clear' }
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null)

  const [boundPath, setBoundPath] = useState<string | null>(null)


  const loadTree = async (rootPath: string) => {
    setLoadingTree(true)
    setTreeError(null)
    try {
      const node = await listProjectFiles(rootPath, 8)
      setTree(node)
    } catch (e) {
      console.error('[TemplatesPage] loadTree error:', e)
      setTreeError(e instanceof Error ? e.message : String(e))
      setTree(null)
    } finally {
      setLoadingTree(false)
    }
  }

  // 初次挂载：读全局模板目录并加载
  useEffect(() => {
    ;(async () => {
      try {
        const p = await getTemplateDirectory()
        setBoundPath(p)
        if (p) await loadTree(p)
      } catch (e) {
        setTreeError(e instanceof Error ? e.message : String(e))
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handlePick = async () => {
    setPicking(true)
    try {
      const picked = await pickProjectDirectory()
      if (!picked) {
        // 用户取消
        return
      }
      await setTemplateDirectory(picked)
      setBoundPath(picked)
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
      await setTemplateDirectory(null)
      setBoundPath(null)
      setTree(null)
      setSelected(null)
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
    <div style={{ height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      <div
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border-thin)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        // 高度跟随父容器 · 父级是模板页面区域
        height: '100%',
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
          模板中心
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
            '尚未绑定模板目录'
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
              title="在模板根目录新建空文件"
            >
              <Plus size={12} />
              新建文件
            </button>
            <button
              type="button"
              style={toolbarBtn}
              onClick={() => openCreate('dir')}
              title="在模板根目录新建子目录"
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
              title="解绑模板目录绑定（不会删除文件）"
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
            {picking ? '选择中…' : '选择模板目录'}
          </button>
        )}
      </div>

      {treeError && (
        <div
          style={{
            padding: '6px 14px',
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
                padding: '6px 10px',
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
          <div style={{ fontSize: 13 }}>绑定一个本地模板目录，开始浏览模板文件</div>
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
            gridTemplateRows: '1fr',
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
              background: 'var(--glass-bg-strong)',
              backdropFilter: 'var(--glass-blur)',
              WebkitBackdropFilter: 'var(--glass-blur)',
              border: '1px solid var(--glass-border)',
              borderRadius: 8,
              padding: '20px 24px',
              minWidth: 360,
              maxWidth: 480,
              boxShadow: 'var(--glass-shadow)',
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
                : '解除模板目录绑定'}
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
                <>解除后模板中心不会删除磁盘上的任何文件，只是解绑目录。</>
              )}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                onClick={() => setPendingConfirm(null)}
                style={{
                  padding: '6px 14px',
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
                  padding: '6px 14px',
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
      </div>
  )
}
