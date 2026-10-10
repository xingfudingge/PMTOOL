/**
 * PMTool · Document Engine 导出组件（2026-09-18）
 *
 * 「导出 Word」统一入口：让用户选另存位置 → 建说明书文档 → 生成 docx 到目标 → 资源管理器定位。
 * 业务页面只调 exportDocxFromMarkdown，不直接碰文档存储细节。
 */

import { save as saveDialog } from '@tauri-apps/plugin-dialog'
import {
  documentCreate,
  documentExportDocx,
  documentGenerateInline,
  type GenerateFormat,
  type SpaceType,
} from '@/services/document'
import { revealPath } from '@/services/settings'

/**
 * 将 Markdown 内容导出为 Word（.docx）
 * @returns 另存路径；用户取消返回 null；失败抛错
 */
export async function exportDocxFromMarkdown(input: {
  title: string
  markdown: string
  refId?: number | null
  fileName?: string
  spaceType?: SpaceType
}): Promise<string | null> {
  const safeTitle = (input.title || '报告').trim() || '报告'
  const fileName = input.fileName ?? `${safeTitle}.docx`

  // 1. 用户选另存位置（取消 → null，不生成）
  const dest = await saveDialog({
    title: '导出 Word',
    defaultPath: fileName,
    filters: [{ name: 'Word 文档', extensions: ['docx'] }],
  })
  if (!dest) return null

  // 2. 建说明书文档 + 生成 docx 直接写目标
  const pm = await documentCreate({
    type: 'markdown',
    title: safeTitle,
    spaceType: input.spaceType ?? 'REPORT',
    refId: input.refId ?? null,
    content: { kind: 'markdown', markdown: input.markdown },
  })
  await documentExportDocx(pm.docId, fileName, dest)

  // 3. 资源管理器定位已生成文件
  await revealPath(dest)
  return dest
}

const FORMAT_META: Record<GenerateFormat, { label: string; ext: string }> = {
  docx: { label: 'Word 文档', ext: 'docx' },
  pptx: { label: 'PowerPoint 演示文稿', ext: 'pptx' },
  pdf: { label: 'PDF 文档', ext: 'pdf' },
}

/**
 * 将 Markdown 导出为 Word / PPT / PDF（Rust 侧 Document Engine 生成）。
 * @returns 另存路径；用户取消返回 null；失败抛错
 */
export async function exportDocFromMarkdown(input: {
  title: string
  markdown: string
  format: GenerateFormat
}): Promise<string | null> {
  const safeTitle = (input.title || '文档').trim() || '文档'
  const meta = FORMAT_META[input.format]
  const dest = await saveDialog({
    title: `导出 ${meta.label}`,
    defaultPath: `${safeTitle}.${meta.ext}`,
    filters: [{ name: meta.label, extensions: [meta.ext] }],
  })
  if (!dest) return null
  await documentGenerateInline({
    title: safeTitle,
    markdown: input.markdown,
    format: input.format,
    destPath: dest,
  })
  await revealPath(dest)
  return dest
}
