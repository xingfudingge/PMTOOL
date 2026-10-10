/**
 * PMTool · .md 文件视图（2026-09-19）
 *
 * 同一个 .md 文件可以用两种编辑器打开，用户在工具栏一键切换：
 *   - 富文本（BlockNote / MarkdownEditor）：所见即所得，写日报/纪要更顺
 *   - 纯文本（TxtEditor）：直接看/改 Markdown 源码，调格式或用惯用编辑器的人更顺
 *
 * 两种模式共用同一份磁盘文件；切换时用 key 强制 remount，
 * 让另一个编辑器重新从磁盘加载（避免两套 state 打架）。
 */

import { useState } from 'react'
import { MarkdownEditor } from './MarkdownEditor'
import { TxtEditor } from './TxtEditor'
import { EditorModeToggle, type EditorMode } from './EditorModeToggle'
import type { FilePreviewProps } from './types'

export function MarkdownFileView(props: FilePreviewProps) {
  const [mode, setMode] = useState<EditorMode>('rich')

  const toggle = <EditorModeToggle mode={mode} onChange={setMode} />

  // key 变化 → 重新挂载 → 新编辑器重新读盘
  return mode === 'rich' ? (
    <MarkdownEditor key={`rich:${props.path}`} {...props} toolbarExtra={toggle} />
  ) : (
    <TxtEditor key={`text:${props.path}`} {...props} toolbarExtra={toggle} />
  )
}