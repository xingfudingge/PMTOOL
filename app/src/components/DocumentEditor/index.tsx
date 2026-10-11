/**
 * PMTool · DocumentEditor 主组件（维护者 2026-08-31）
 *
 * 状态机：
 *   loading → ready(clean)
 *     ↓ user edits
 *   ready(dirty) → Cmd+S / button → saving → ready(clean)
 *                          ↓ err
 *                       dirty + toast.error
 *
 *   project-file 模式独有：
 *     ready(*) → 后台 stat 发现 mtime 变化
 *       dirty + newMtime ≠ loadedMtime  → conflict（弹三选一）
 *       clean + newMtime ≠ loadedMtime  → 静默 reload 编辑器内容
 *
 *   关闭保护：dirty 时 onClose 触发 window.confirm
 *
 * ⚠️ 维护者 2026-08-31 修复"只读不写"bug：
 *   useCreateBlockNote 只在 mount 时读 initialContent —— 因此本组件必须在
 *   initialBlocks 已经就绪后才能挂载（外层 KnowledgeSpaceView / FilePreview
 *   自己先 load 数据，加载中显示占位，加载完才渲染 DocumentEditor）。
 *   source 变化时由调用方加 React key 触发整个 DocumentEditor remount。
 *
 * 模块命名锁定：必须是「知识中心」「项目文件管理」。
 */

import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { AlertTriangle } from 'lucide-react'
import { BlockNoteView } from '@blocknote/mantine'
import { save as saveDialog } from '@tauri-apps/plugin-dialog'
import '@blocknote/core/fonts/inter.css'
import '@blocknote/mantine/style.css'
import type { Block } from '@blocknote/core'

import {
  getKnowledgeNote,
  upsertKnowledgeNote,
  type KnowledgeNote as DbNote,
  type KnowledgeContentType,
  type KnowledgeSpace,
} from '@/services/knowledge'
import {
  readTextFileWithMtime,
  writeTextFile,
} from '@/services/projectFiles'
import {
  resolveInitialBlocks,
  useBlockNoteSetup,
} from './useBlockNoteSetup'
import { blocksToMarkdownString } from './blocksToMarkdownString'
import { EditorToolbar } from './EditorToolbar'
import type {
  ConflictResolution,
  DocumentEditorProps,
  SaveStatus,
} from './types'

/** mtime 轮询间隔（60s）· 仅 project-file 启用 */
const MTIME_POLL_MS = 60_000

const wrapStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  background: 'var(--color-bg)',
  minHeight: 0,
}

const editorAreaStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflow: 'auto',
  padding: '8px 16px',
}

const centerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  color: 'var(--color-text-tertiary)',
  fontSize: 13,
}

export function DocumentEditor(props: DocumentEditorProps) {
  const {
    source,
    initialBlocks,
    initialContent,
    initialMarkdown,
    onDirtyChange,
    onClose,
    onExported,
    onStatusChange,
    onSaveReady,
  } = props

  // ---------- 标题 ----------
  const [title, setTitle] = useState(props.initialTitle ?? '')

  // ---------- 保存状态 ----------
  const [status, setStatus] = useState<SaveStatus>('clean')
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(props.initialUpdatedAt ?? null)
  /**
   * lastSavedSnapshot 的含义按模式分支：
   *   - knowledge / project-file：BlockNote document 的 JSON 字符串（用于 dirty 比较）
   *   - project-txt：纯文本内容字符串（用于 dirty 比较）
   * 该 state 同时被 save() / resolveConflict('discard') / reloadFromDisk() 更新。
   */
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState<string>(
    source.kind === 'project-txt'
      ? (initialContent ?? '')
      : JSON.stringify(initialBlocks ?? []),
  )
  const [error, setError] = useState<string | null>(null)

  // ---------- 冲突（仅 project-file / project-txt） ----------
  const [loadedMtime, setLoadedMtime] = useState<string | null>(props.initialMtime ?? null)
  const [conflictMessage, setConflictMessage] = useState<string | null>(null)

  // ---------- 知识中心缓存的 note 元数据 ----------
  const [noteMeta, setNoteMeta] = useState<DbNote | null>(props.initialNote ?? null)

  // ---------- BlockNote ----------
  // initialBlocks 来自 prop —— 外层已 load 完才渲染本组件
  // project-file 模式：先创建空 editor，然后用 pmSchema 转换 markdown

  // 维护者 2026-09-02：添加 onChange 回调，编辑器内容变化时触发 dirty 状态
  const handleDocChange = useCallback(() => {
    if (status === 'clean') {
      setStatus('dirty')
    }
  }, [status])

  // 先创建空的 BlockNote editor
  const editor = useBlockNoteSetup(initialBlocks, undefined, handleDocChange)

  // project-file 模式：pmSchema 准备好后转换 initialMarkdown
  const [convertedBlocks, setConvertedBlocks] = useState<Block[] | undefined>(undefined)
  useEffect(() => {
    if (source.kind !== 'project-file') return
    if (!initialMarkdown) return
    if (!editor.pmSchema) return
    if (convertedBlocks) return // 已经转换过，跳过

    const blocks = resolveInitialBlocks('MARKDOWN', '', initialMarkdown, editor.pmSchema)
    setConvertedBlocks(blocks)
    if (blocks) {
      // 注入内容：必须用 BlockNote 官方的 replaceBlocks，不能用 tiptap 的 setContent。
      // 2026-10-11 修复「部分 md 富文本打开空白」：此前用
      //   _tiptapEditor.commands.setContent({ type: 'doc', content: blocks })
      // 在 tiptap 3.x 里对 BlockNote 的 block 格式抛
      //   RangeError: Invalid input for Fragment.fromJSON
      // → 注入静默失败 → editor 保持空文档 → 富文本空白（纯文本照常显示）。
      // BlockNote blocks（含 {type:'tableContent'...}、props、children 等专有结构）
      // 不是 tiptap 的 ProseMirror node JSON，必须走 editor.replaceBlocks 这条
      // BlockNote 自己的注入通道（BlockNote 内部 version 恢复用的正是
      // replaceBlocks(editor.document, blocks)）。
      ;(editor as any).replaceBlocks?.(editor.document, blocks)
      setLastSavedSnapshot(JSON.stringify(blocks))
      // 注入后把快照对齐到 editor.document 的真实序列化（BlockNote 可能规范化出不同结构），
      // 并重置为 clean：避免把「加载注入」误判成「用户编辑」而弹出未保存。
      setTimeout(() => {
        const docJson = JSON.stringify(editor.document)
        if (docJson) {
          setLastSavedSnapshot(docJson)
          setStatus((s) => (s === 'dirty' ? 'clean' : s))
        }
      }, 0)
    }
  }, [source.kind, initialMarkdown, editor.pmSchema])

  // 编辑 → dirty（可靠触发）：项目文件富文本内容由 setContent 注入，BlockNote 的 onChange
  // 有时不触发；改监听 tiptap editor 的 'update' 事务事件，与纯文本 textarea onChange 等效。
  // 2026-10-10 修复「富文本编辑不弹保存」。
  useEffect(() => {
    if (source.kind !== 'project-file') return
    const tiptap = (editor as any)?._tiptapEditor
    if (!tiptap?.on) return
    const h = () => {
      setStatus((s) => (s === 'clean' ? 'dirty' : s))
    }
    tiptap.on('update', h)
    return () => {
      tiptap?.off?.('update', h)
    }
  }, [editor, source.kind])

  // 2026-09-09 · 知识模式不再用 setContent 二次注入。
  // BlockNote 内容由 useCreateBlockNote(initialContent) 在 mount 时读取，且外层 key 用内容指纹
  // 强制 remount 载入最新块。此前这里用 tiptap.setContent(initialBlocks) 兜底——initialBlocks
  // 引用每次变化都会把编辑器重置回初始内容，导致「编辑成果被冲回默认、无法编辑」。故移除。

  // 知识中心模式：使用 initialBlocks
  // project-file 模式：使用 convertedBlocks
  const effectiveBlocks = source.kind === 'project-file' ? convertedBlocks : initialBlocks

  // 当前文档的稳定字符串（用于 dirty 比较）
  const currentDocJson = useMemo(() => {
    try {
      return JSON.stringify(editor.document)
    } catch {
      return ''
    }
  }, [editor.document])

  // ---------- project-txt 专有：纯文本 textarea state ----------
  // project-txt 不走 BlockNote：useCreateBlockNote 仍会 mount，但编辑器只读 textarea。
  // txt 内容维护在独立 state 里；save 时写这个 state，不读 editor.document。
  const isProjectTxt = source.kind === 'project-txt'
  const [txtContent, setTxtContent] = useState<string>(
    initialContent ?? '',
  )
  const [txtLoaded, setTxtLoaded] = useState<boolean>(
    // 已由外层 load 完（传了 initialContent）或 knowledge 不需要
    isProjectTxt ? initialContent != null : true,
  )
  const [txtLoadedMtime, setTxtLoadedMtime] = useState<string | null>(
    isProjectTxt ? props.initialMtime ?? null : null,
  )

  // project-txt 自动加载：若调用方没传 initialContent，内部 readTextFileWithMtime
  // 这样无论 TxtEditor 有没有预加载都能 work（防御性）
  useEffect(() => {
    if (!isProjectTxt || txtLoaded) return
    let cancelled = false
    ;(async () => {
      try {
        const { content, modifiedAt } = await readTextFileWithMtime(
          (source as { filePath: string }).filePath,
        )
        if (cancelled) return
        setTxtContent(content)
        setTxtLoadedMtime(modifiedAt)
        setLoadedMtime(modifiedAt)
        setTxtLoaded(true)
        setStatus('clean')
        setLastSavedAt(modifiedAt)
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : String(e))
        setStatus('error')
        setTxtLoaded(true)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isProjectTxt, txtLoaded, source.kind, (source as { filePath: string }).filePath])

  const isProjectFile = source.kind === 'project-file' || source.kind === 'project-txt'

  // dirty 判定
  // project-txt 基于纯文本字符串比较；其余基于 BlockNote document JSON
  const dirty = useMemo(() => {
    if (status === 'saving') return false
    if (status === 'conflict') return true
    if (isProjectTxt) {
      if (!txtLoaded) return false
      return txtContent !== lastSavedSnapshot
    }
    return currentDocJson !== lastSavedSnapshot
  }, [isProjectTxt, txtLoaded, txtContent, currentDocJson, lastSavedSnapshot, status])

  // 仅当 status / lastSavedAt 真正变化时回调 onStatusChange。
  // 避免「父回调产生新引用 → 子 effect 反复跑 → 父再 setState」的反馈回路。
  const lastStatusRef = useRef<{ s: SaveStatus; t: string | null }>({ s: status, t: lastSavedAt })
  useEffect(() => {
    const prev = lastStatusRef.current
    if (prev.s === status && prev.t === lastSavedAt) return
    lastStatusRef.current = { s: status, t: lastSavedAt }
    onStatusChange?.(status, lastSavedAt)
  }, [status, lastSavedAt, onStatusChange])

  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])

  // ==================== Save ====================

  const save = useCallback(async (): Promise<boolean> => {
    if (status === 'saving') return false
    setStatus('saving')
    setError(null)
    try {
      // project-txt：完全走纯文本路径，不读 BlockNote editor.document
      if (source.kind === 'project-txt') {
        const filePath = source.filePath
        const before = await readTextFileWithMtime(filePath)
        if (loadedMtime && before.modifiedAt !== loadedMtime) {
          setConflictMessage(`外部修改于 ${before.modifiedAt}`)
          setStatus('conflict')
          return false
        }
        await writeTextFile(filePath, txtContent)
        setLastSavedSnapshot(txtContent)
        const after = await readTextFileWithMtime(filePath)
        setLoadedMtime(after.modifiedAt)
        setTxtLoadedMtime(after.modifiedAt)
        setLastSavedAt(after.modifiedAt)
        setStatus('clean')
        return true
      }

      const blocks = editor.document
      const json = JSON.stringify(blocks)
      const md = blocksToMarkdownString(blocks)

      if (source.kind === 'knowledge') {
        if (source.noteId == null) {
          setError('笔记 ID 缺失')
          setStatus('error')
          return false
        }
        const updated = await upsertKnowledgeNote({
          id: source.noteId,
          spaceId: noteMeta?.spaceId ?? 0,
          space: (noteMeta?.space ?? 'personal') as KnowledgeSpace,
          title: title.trim() || '无标题',
          content: json,
          contentType: 'BLOCKNOTE_JSON',
          contentMd: md,
          pinned: noteMeta?.pinned ?? false,
          folderId: noteMeta?.folderId ?? null,
          category: noteMeta?.category ?? null,
          sourceType: noteMeta?.sourceType ?? 'USER',
          createdBy: noteMeta?.createdBy ?? null,
          systemType: noteMeta?.systemType ?? 'USER',
        })
        setNoteMeta(updated)
        setLastSavedSnapshot(json)
        setLastSavedAt(updated.updatedAt)
        setStatus('clean')
        return true
      }
      // project-file
      const filePath = source.filePath
      const before = await readTextFileWithMtime(filePath)
      if (loadedMtime && before.modifiedAt !== loadedMtime) {
        setConflictMessage(`外部修改于 ${before.modifiedAt}`)
        setStatus('conflict')
        return false
      }
      await writeTextFile(filePath, md)
      setLastSavedSnapshot(json)
      const after = await readTextFileWithMtime(filePath)
      setLoadedMtime(after.modifiedAt)
      setLastSavedAt(after.modifiedAt)
      setStatus('clean')
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStatus('error')
      return false
    }
  }, [status, editor, source, noteMeta, title, loadedMtime, txtContent])

  // 把当前 save 函数推给外层（PreviewToolbar 保存按钮 / 导出前保存 / 自动保存都依赖它）。
  // 2026-10-10 修复：此前 onSaveReady 从未被解构调用 → saveRef 恒为 null → 点保存无反应。
  // 无依赖数组：每次 render 后推最新 save，外层 saveRef.current 始终指向最新函数（闭包安全）。
  useEffect(() => {
    onSaveReady?.(save)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  })

  // ==================== 外部修改 → 静默 reload 内容 ====================
  // project-txt 走纯文本路径 · 反向：本地编辑器改了之后 webview 必须重读
  //（之前注释说"由 useEffect 处理"但根本没处理 — 反向刷新失效的根因）
  const reloadFromDisk = useCallback(async () => {
    if (!isProjectFile) return
    try {
      const filePath = (source as { filePath: string }).filePath
      const { content, modifiedAt } = await readTextFileWithMtime(filePath)
      if (source.kind === 'project-txt') {
        setTxtContent(content)
        setTxtLoadedMtime(modifiedAt)
        setLastSavedSnapshot(content)
      } else {
        const blocks = resolveInitialBlocks('MARKDOWN', '', content, editor.pmSchema)
        // 与注入 effect 相同：必须走 BlockNote 官方 replaceBlocks，不能走 tiptap setContent
        //（tiptap 3.x 对 BlockNote block 格式抛 RangeError: Invalid input for Fragment.fromJSON）。
        ;(editor as any).replaceBlocks?.(editor.document, blocks ?? [])
        setLastSavedSnapshot(JSON.stringify(blocks ?? []))
      }
      setLoadedMtime(modifiedAt)
      setLastSavedAt(modifiedAt)
      setStatus('clean')
    } catch (e) {
      console.error('[DocumentEditor] reload from disk failed:', e)
    }
  }, [isProjectFile, source, editor])

  // ==================== 冲突检测（project-file / project-txt） ====================

  useEffect(() => {
    if (!isProjectFile) return
    const filePath = (source as { filePath: string }).filePath
    const tick = async () => {
      if (status === 'saving' || status === 'conflict') return
      try {
        const { modifiedAt } = await readTextFileWithMtime(filePath)
        if (loadedMtime && modifiedAt !== loadedMtime) {
          if (dirty) {
            // 本地有未保存改动 + 外部也改了 → 冲突
            setConflictMessage(`外部修改于 ${modifiedAt}`)
            setStatus('conflict')
          } else {
            // 本地干净 · 外部改了 → 静默重新加载内容（反向刷新生效）
            await reloadFromDisk()
          }
        }
      } catch {
        // 临时不可访问 · 静默
      }
    }
    const id = setInterval(tick, MTIME_POLL_MS)
    const onVis = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [source, status, loadedMtime, dirty, isProjectFile, reloadFromDisk])

  const resolveConflict = useCallback(
    async (choice: ConflictResolution) => {
      if (!isProjectFile) return
      if (choice === 'cancel') {
        setStatus('dirty')
        setConflictMessage(null)
        return
      }
      if (choice === 'discard') {
        // 放弃本地修改 · 重新加载磁盘版
        setConflictMessage(null)
        await reloadFromDisk()
        return
      }
      // overwrite · 不做 mtime 比对（用户明确选覆盖）
      setConflictMessage(null)
      setLoadedMtime(null)
      setStatus('dirty')
      await save()
    },
    [isProjectFile, save, reloadFromDisk],
  )

  // ==================== Cmd/Ctrl+S ====================

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (dirty || status === 'error') {
          void save()
        }
      }
      if (e.key === 'Escape' && onClose) {
        if (dirty) {
          if (!window.confirm('当前文档未保存，确定关闭？')) return
        }
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dirty, status, save, onClose])

  const handleClose = useCallback(() => {
    if (!onClose) return
    if (dirty) {
      if (!window.confirm('当前文档未保存，确定关闭？')) return
    }
    onClose()
  }, [dirty, onClose])

  // ==================== 导出 .md（仅 knowledge） ====================

  const handleExport = useCallback(async () => {
    if (source.kind !== 'knowledge') return
    const md = blocksToMarkdownString(editor.document)
    try {
      const path = await saveDialog({
        title: '导出 Markdown',
        defaultPath: `${title.trim() || '未命名'}.md`,
        filters: [{ name: 'Markdown', extensions: ['md'] }],
      })
      if (!path) return
      await writeTextFile(path, md)
      onExported?.(path)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStatus('error')
    }
  }, [source, editor, title, onExported])

  // ==================== Render ====================

  return (
    <div style={wrapStyle}>
      {/* 维护者 2026-08-31：
          knowledge 模式渲染 EditorToolbar（标题输入 + 空间标签 + 保存状态 + 操作按钮）
          project-file / project-txt 模式不渲染（文件名 + 保存状态都由外层 PreviewToolbar 显示） */}
      {source.kind === 'knowledge' && (
        <EditorToolbar
          title={title}
          onTitleChange={(t) => {
            setTitle(t)
            if (status === 'clean') setStatus('dirty')
          }}
          status={status}
          lastSavedAt={lastSavedAt}
          onSave={save}
          onExportMarkdown={source.kind === 'knowledge' ? handleExport : undefined}
          onClose={onClose ? handleClose : undefined}
          spaceLabel={
            noteMeta?.space === 'project' ? '项目笔记' : '个人笔记'
          }
        />
      )}
      <div style={editorAreaStyle}>
        {status === 'error' && error && !dirty && (
          <div
            style={{
              ...centerStyle,
              color: '#b91c1c',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div>加载失败：{error}</div>
          </div>
        )}
        {source.kind === 'project-txt' ? (
          !txtLoaded ? (
            <div style={centerStyle}>加载中…</div>
          ) : status === 'error' && error ? (
            <div
              style={{
                ...centerStyle,
                color: '#b91c1c',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div>加载失败：{error}</div>
            </div>
          ) : (
            <textarea
              key={source.filePath}
              value={txtContent}
              onChange={(e) => {
                const next = e.target.value
                setTxtContent(next)
                if (status === 'clean' && next !== lastSavedSnapshot) {
                  setStatus('dirty')
                } else if (status === 'dirty' && next === lastSavedSnapshot) {
                  // 内容回滚到上次保存 → 重新 clean（discard/undo 场景）
                  setStatus('clean')
                }
              }}
              spellCheck={false}
              style={{
                width: '100%',
                height: '100%',
                minHeight: 0,
                boxSizing: 'border-box',
                padding: '8px 12px',
                border: '1px solid var(--color-border-thin)',
                borderRadius: 6,
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: 13,
                lineHeight: 1.7,
                color: 'var(--color-text)',
                background: 'var(--color-bg)',
                outline: 'none',
                resize: 'none',
              }}
            />
          )
        ) : (
          <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
            <BlockNoteView
              editor={editor as any}
              theme="light"
              style={{ flex: 1, minHeight: 0 }}
            />
          </div>
        )}
      </div>
      {isProjectFile && status === 'conflict' && (
        <div style={conflictBarStyle}>
          <AlertTriangle size={12} />
          <span>
            {conflictMessage || '文件被外部修改'} — 如何处理？
          </span>
          <button
            type="button"
            style={conflictBtnStyle}
            onClick={() => resolveConflict('discard')}
          >
            放弃修改（加载磁盘版）
          </button>
          <button
            type="button"
            style={conflictBtnStyle}
            onClick={() => resolveConflict('overwrite')}
          >
            仍要保存
          </button>
          <button
            type="button"
            style={conflictBtnStyle}
            onClick={() => resolveConflict('cancel')}
          >
            稍后处理
          </button>
        </div>
      )}
    </div>
  )
}

const conflictBarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '4px 12px',
  fontSize: 12,
  color: '#92400e',
  background: '#fef3c7',
  borderTop: '1px solid #fcd34d',
  flexShrink: 0,
}

const conflictBtnStyle: React.CSSProperties = {
  padding: '2px 10px',
  fontSize: 11,
  border: '1px solid #fcd34d',
  background: '#fff',
  color: '#92400e',
  borderRadius: 3,
  cursor: 'pointer',
}

export default DocumentEditor
