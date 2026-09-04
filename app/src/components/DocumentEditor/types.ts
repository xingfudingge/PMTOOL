/**
 * PMTool · DocumentEditor 类型（维护者 2026-08-31 · Phase C）
 *
 * DocumentEditor 是「知识中心」和「项目文件管理」+「纯文本文档」的统一编辑器组件。
 * 通过 source prop 决定持久化后端：
 *   - knowledge: 走 Rust knowledge_* commands（DB 持久化，content 存 BlockNote JSON）
 *   - project-file: 读本地 .md → BlockNote，保存时写回原路径
 *   - project-txt: 读本地 .txt → textarea，保存时写回原路径（轻量纯文本分支）
 *
 * ⚠️ initialBlocks 必须由调用方在外层 load 完传入；source 变化时调用方需加
 *    React key 触发整个 DocumentEditor remount（useCreateBlockNote 只读一次
 *    initialContent）。
 */

import type { Block } from '@blocknote/core'
import type { KnowledgeNote as DbNote } from '@/services/knowledge'

export type EditorSource =
  | { kind: 'knowledge'; noteId: number }
  | { kind: 'project-file'; filePath: string; fileName: string }
  | { kind: 'project-txt'; filePath: string; fileName: string }

export interface ProjectFileSource {
  kind: 'project-file' | 'project-txt'
  filePath: string
  fileName: string
}

export function isProjectFileSource(
  s: EditorSource,
): s is ProjectFileSource {
  return s.kind === 'project-file' || s.kind === 'project-txt'
}

export type SaveStatus =
  | 'loading'
  | 'clean'
  | 'dirty'
  | 'saving'
  | 'error'
  | 'conflict'

export type ConflictResolution = 'discard' | 'overwrite' | 'cancel'

export interface DocumentEditorProps {
  source: EditorSource
  /** 已 load 完的 BlockNote blocks · load 期间传 undefined 时 DocumentEditor 内部渲染占位 */
  initialBlocks?: Block[] | undefined
  /** 知识中心：初始标题（来自 DB note.title） */
  initialTitle?: string
  /** 知识中心：初始 updatedAt（用于显示"已保存 X 分钟前"） */
  initialUpdatedAt?: string | null
  /** project-file / project-txt：初始 mtime（冲突检测） */
  initialMtime?: string | null
  /** project-txt：初始文本内容（DocumentEditor 不自动 load · 由调用方传） */
  initialContent?: string
  /** project-file: 初始 markdown 字符串（DocumentEditor 内部转为 blocks） */
  initialMarkdown?: string
  /** 知识中心：完整 DB note（save 时回填 folderId / pinned / space 等字段） */
  initialNote?: DbNote | null
  /** 内部：dirty 状态变化回调 */
  onDirtyChange?: (dirty: boolean) => void
  /** 关闭按钮点击回调 */
  onClose?: () => void
  /** 笔记被删除回调 */
  onDeleted?: () => void
  /** 导出回调 */
  onExported?: (path: string) => void
  /** 内部：saveReady 回调（用于将 save 方法推到外层） */
  onSaveReady?: (fn: () => Promise<boolean>) => void
  /** 内部：status 变化回调（用于将 saveStatus 推到外层） */
  onStatusChange?: (status: SaveStatus, lastSavedAt: string | null) => void
}
