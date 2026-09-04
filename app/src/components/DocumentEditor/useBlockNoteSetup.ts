/**
 * PMTool · BlockNote 配置 hook（维护者 2026-08-31）
 *
 * 职责：
 *   - 创建 BlockNote editor 实例
 *   - 提供 markdown <-> blocks 转换辅助
 *
 * ⚠️ BlockNote 0.54 + React 19 · useCreateBlockNote 只在 mount 时读 initialContent
 * （这是 ProseMirror TiptapEditor 的特性）。换内容只能通过 _tiptapEditor.commands
 * 注入，或整个组件 remount（外层 React key）。这里提供 resolveInitialBlocks
 * 返回 ProseMirror 节点数组（content[]），由 DocumentEditor 用 setContent 注入。
 */

import { useCreateBlockNote } from '@blocknote/react'
import {
  markdownToBlocks as coreMarkdownToBlocks,
  type Block,
  type BlockNoteEditor,
  type Dictionary,
} from '@blocknote/core'
import { zh } from '@blocknote/core/locales'

/**
 * 通用 BlockNote 配置：空文档 · initialContent 由 load 完成后 inject 注入
 *
 * 默认传 BlockNote 自带的官方 zh 词典 —— 所有斜杠命令、占位符、工具栏 tooltip、
 * 表格 / 文件 / 链接面板、评论、颜色面板全部中文化。特殊需求可传 dictionary
 * 覆盖。
 *
 * ⚠️ BlockNote 0.54 useCreateBlockNote 只在 mount 时读 initialContent
 * → source 变化时外层必须加 React key remount 整个 DocumentEditor
 */
export function useBlockNoteSetup(initialBlocks?: Block[], dictionary?: Dictionary, onDocChange?: () => void) {
  return useCreateBlockNote({
    initialContent: initialBlocks && initialBlocks.length > 0 ? initialBlocks : undefined,
    dictionary: dictionary ?? zh,
    onChange: onDocChange,
  })
}

/**
 * 解析初始 blocks（优先级由 DocumentEditor 决定）：
 *   1. JSON 字符串（BLOCKNOTE_JSON）非空 → 直接解析
 *   2. 否则 markdown 字符串非空 → markdownToBlocks(md, pmSchema)
 *   3. 否则 undefined
 *
 * 返回值是 BlockNote Block[]（直接对应 ProseMirror 节点结构，可作为
 * Tiptap setContent 的 content 数组使用）。
 */
export function resolveInitialBlocks(
  contentType: 'BLOCKNOTE_JSON' | 'MARKDOWN' | 'TEXT',
  jsonContent: string,
  markdownContent: string,
  pmSchema: any,
): Block[] | undefined {
  if (contentType === 'BLOCKNOTE_JSON' && jsonContent.trim()) {
    try {
      const parsed = JSON.parse(jsonContent)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed as Block[]
    } catch {
      // 解析失败 · 退到 markdown
    }
  }
  if (markdownContent.trim() && pmSchema) {
    try {
      return coreMarkdownToBlocks(markdownContent, pmSchema) as Block[]
    } catch {
      return undefined
    }
  }
  return undefined
}

/**
 * 导出 .md 字符串 —— 用 editor.blocksToMarkdownLossy（BlockNote 0.54 推荐入口）
 */
export function blocksToMarkdownString(
  editor: BlockNoteEditor | null,
  blocks: Block[],
): string {
  if (!blocks || blocks.length === 0) return ''
  try {
    if (editor) {
      const fn = (editor as any).blocksToMarkdownLossy
      if (typeof fn === 'function') {
        return fn.call(editor, blocks) as string
      }
    }
    return ''
  } catch {
    return ''
  }
}
