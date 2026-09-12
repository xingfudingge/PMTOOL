/**
 * PMTool · 知识中心 .md 导入工具（维护者 2026-08-31）
 *
 * 流程：
 *   1. rfd 选 .md 文件（限制 .md 后缀）
 *   2. read_text_file 读内容（Rust 端 5MB 上限 + 二进制检测）
 *   3. 直接 upsert 到 knowledge_notes（content=md, content_type=MARKDOWN）
 *      让 DocumentEditor 加载时走 markdownToBlocks 转换路径
 *   4. 返回新建的 note · KnowledgeSpaceView 打开抽屉编辑
 */

import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { readTextFile } from '@/services/projectFiles'
import { upsertKnowledgeNote, type KnowledgeNote, type KnowledgeSpace } from '@/services/knowledge'

interface ImportOpts {
  space: KnowledgeSpace
  projectId: number | null
  spaceId?: number
}

export async function importMarkdownFile(opts: ImportOpts): Promise<KnowledgeNote | null> {
  const selected = await openDialog({
    title: '导入 Markdown 文件',
    multiple: false,
    directory: false,
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
  })
  if (!selected || typeof selected !== 'string') return null

  const content = await readTextFile(selected)
  const fileName = selected.split(/[\\/]/).pop() ?? '导入笔记.md'
  const title = fileName.replace(/\.md$/i, '').replace(/[-_]/g, ' ').trim() || '导入笔记'

  const created = await upsertKnowledgeNote({
    spaceId: opts.spaceId || 0,
    space: opts.space,
    title,
    content: content,
    contentType: 'MARKDOWN',
    contentMd: content,
    pinned: false,
    sourceType: 'IMPORT',
    systemType: 'USER',
  })
  return created
}
