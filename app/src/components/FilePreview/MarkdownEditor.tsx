/**
 * PMTool · FilePreview/MarkdownEditor（维护者 2026-08-31 · Phase D）
 *
 * 项目文件管理 · .md 文件的编辑器入口（替代原只读 MarkdownPreview）
 * 复用统一 DocumentEditor · kind: 'project-file'
 *
 * 维护者 2026-08-31：保存状态徽标已并到 PreviewToolbar · 「最大化」= 真窗口
 * 维护者 2026-08-31：保存按钮在 PreviewToolbar 上（通过 saveRef + onSaveReady/onStatusChange
 * 从 DocumentEditor 推到外层，避免外层每次状态变化重渲 DocumentEditor）
 * 维护者 2026-08-31 修复 .md 打开空白：先 readTextFileWithMtime 把内容读到 initialMarkdown，
 * DocumentEditor 用 editor.pmSchema 转 blocks 注入。load 完成前不渲染 DocumentEditor。
 */

import { useEffect, useRef, useState } from 'react'
import { DocumentEditor } from '@/components/DocumentEditor'
import { PreviewToolbar } from './PreviewToolbar'
import { readTextFileWithMtime } from '@/services/projectFiles'
import type { SaveStatus } from '@/components/DocumentEditor/types'
import type { FilePreviewProps } from './types'

export function MarkdownEditor({
  path,
  fileName,
  onOpenExternally,
}: FilePreviewProps) {
  // 维护者 2026-08-31：保存回调 + 状态由 DocumentEditor 推到外层
  const saveRef = useRef<(() => Promise<boolean>) | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('loading')
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)

  // 维护者 2026-08-31 修复 .md 打开空白：先 load 文件 → 拿到 markdown 字符串 + mtime
  const [initialMarkdown, setInitialMarkdown] = useState<string | null>(null)
  const [initialMtime, setInitialMtime] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setInitialMarkdown(null)
    setInitialMtime(null)
    setLoadError(null)
    setSaveStatus('loading')
    ;(async () => {
      try {
        const { content, modifiedAt } = await readTextFileWithMtime(path)
        if (cancelled) return
        setInitialMarkdown(content)
        setInitialMtime(modifiedAt)
        setLastSavedAt(modifiedAt)
        setSaveStatus('clean')
      } catch (e) {
        if (cancelled) return
        setLoadError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [path])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PreviewToolbar
        fileName={fileName}
        onOpenExternally={onOpenExternally}
        saveStatus={saveStatus}
        lastSavedAt={lastSavedAt}
        saveRef={saveRef}
        extra={
          <span
            style={{
              fontSize: 11,
              color: 'var(--color-text-tertiary)',
              padding: '2px 8px',
              background: 'var(--color-bg-subtle)',
              border: '1px solid var(--color-border-thin)',
              borderRadius: 10,
            }}
            title="项目文件管理 · 共用 BlockNote 编辑器"
          >
            ✏️ BlockNote 编辑
          </span>
        }
      />
      <div style={{ flex: 1, minHeight: 0 }}>
        {loadError ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: '#b91c1c',
              fontSize: 13,
              padding: 24,
            }}
          >
            加载失败：{loadError}
          </div>
        ) : initialMarkdown === null ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: 'var(--color-text-tertiary)',
              fontSize: 13,
            }}
          >
            加载中…
          </div>
        ) : (
          <DocumentEditor
            source={{ kind: 'project-file', filePath: path, fileName }}
            initialMarkdown={initialMarkdown}
            initialMtime={initialMtime ?? undefined}
            onSaveReady={(fn: () => Promise<boolean>) => {
              saveRef.current = fn
            }}
            onStatusChange={(s: SaveStatus, at: string | null) => {
              setSaveStatus(s)
              if (at) setLastSavedAt(at)
            }}
          />
        )}
      </div>
    </div>
  )
}