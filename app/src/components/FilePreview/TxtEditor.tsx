/**
 * PMTool · FilePreview/TxtEditor（维护者 2026-08-31 · Phase D）
 *
 * 项目文件管理 · .txt 文件的轻量纯文本编辑器
 * 复用统一 DocumentEditor · kind: 'project-txt'（内部用 textarea，避开 BlockNote）
 *
 * 设计：
 *   - 不加载 BlockNote（体积大、对纯文本没必要）
 *   - 不需要 markdown↔blocks 转换
 *   - 但仍走同一套 save/Cmd+S/mtime/conflict 状态机
 *   - 主动 readTextFileWithMtime 把内容 + mtime 喂给 DocumentEditor
 *   - 维护者 2026-08-31：保存状态/冲突 UI 全部走 PreviewToolbar
 *   - 维护者 2026-08-31：PreviewToolbar 上的「最大化」= 真窗口 maximize
 *   - 维护者 2026-08-31：保存按钮在 PreviewToolbar 上（通过 saveRef + onSaveReady/onStatusChange
 *     从 DocumentEditor 推到外层，避免外层每次状态变化重渲 DocumentEditor）
 */

import { useEffect, useRef, useState } from 'react'
import { DocumentEditor } from '@/components/DocumentEditor'
import { PreviewToolbar } from './PreviewToolbar'
import { readTextFileWithMtime } from '@/services/projectFiles'
import type { SaveStatus } from '@/components/DocumentEditor/types'
import type { FilePreviewProps } from './types'

export function TxtEditor({
  path,
  fileName,
  onOpenExternally,
}: FilePreviewProps) {
  const [initialContent, setInitialContent] = useState<string | null>(null)
  const [initialMtime, setInitialMtime] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  // 维护者 2026-08-31：保存回调 + 状态由 DocumentEditor 推到外层
  const saveRef = useRef<(() => Promise<boolean>) | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('loading')
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { content, modifiedAt } = await readTextFileWithMtime(path)
        if (cancelled) return
        setInitialContent(content)
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
            title="项目文件管理 · 共用编辑器（纯文本分支 · 不走 BlockNote）"
          >
            📄 纯文本
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
        ) : initialContent === null ? (
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
            source={{ kind: 'project-txt', filePath: path, fileName }}
            initialContent={initialContent ?? undefined}
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