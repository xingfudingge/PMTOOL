/**
 * PMTool · Document Engine 前端服务（2026-09-18）
 *
 * 对应 Rust commands/document.rs · 统一文档能力 create/get/update/list/version_list/delete/export_docx
 * 数据模型对齐 document/model.rs（serde camelCase）。
 */

import { invoke } from '@tauri-apps/api/core'

// ============================================================
// 类型（与 Rust document::model 一致）
// ============================================================

export type DocType = 'text' | 'markdown' | 'richtext' | 'docx'
export type SpaceType = 'KNOWLEDGE' | 'REPORT' | 'PROJECT_FILE' | 'TEMPLATE'

/** 富文本块（内部稳定结构 · 非 BlockNote 直存） */
export interface RichBlock {
  type: 'heading' | 'para' | 'list' | 'code' | 'quote' | 'table' | 'link' | 'image'
  data: any
}

/** 统一文档内容（tag=kind） */
export type DocContent =
  | { kind: 'text'; text: string }
  | { kind: 'markdown'; markdown: string }
  | { kind: 'richtext'; richtext: RichBlock[] }
  | { kind: 'docxfile'; docxfile: string }

/** 统一文档（PmDocument） */
export interface PmDocument {
  docId: string
  docType: DocType
  title: string
  version: number
  content: DocContent
  spaceType: SpaceType | null
  refId: number | null
  storagePath: string | null
  createdAt: string
  updatedAt: string
}

export interface PmDocumentMeta {
  docId: string
  docType: DocType
  title: string
  version: number
  spaceType: SpaceType | null
  refId: number | null
  storagePath: string | null
  createdAt: string
  updatedAt: string
}

export interface PmDocumentVersionMeta {
  version: number
  contentType: string
  createdBy: string
  createdAt: string
}

export type SaveResult =
  | { outcome: 'saved'; newVersion: number }
  | { outcome: 'conflict'; serverVersion: number; currentVersion: number }

// ============================================================
// API
// ============================================================

/** 新建文档 → 返回 PmDocument（含 docId / version / content） */
export async function documentCreate(input: {
  type: DocType
  title: string
  spaceType?: SpaceType | null
  refId?: number | null
  content: DocContent
}): Promise<PmDocument> {
  return invoke<PmDocument>('document_create', {
    input: {
      type: input.type,
      title: input.title,
      spaceType: input.spaceType ?? null,
      refId: input.refId ?? null,
      content: input.content,
    },
  })
}

/** 获取文档（最新版本内容） */
export async function documentGet(docId: string): Promise<PmDocument> {
  return invoke<PmDocument>('document_get', { docId })
}

/** 更新文档（含版本冲突检测；createNewVersion=true 建新版不覆盖） */
export async function documentUpdate(input: {
  docId: string
  baseVersion?: number | null
  createNewVersion?: boolean
  title?: string
  content: DocContent
}): Promise<SaveResult> {
  return invoke<SaveResult>('document_update', {
    docId: input.docId,
    input: {
      baseVersion: input.baseVersion ?? null,
      createNewVersion: input.createNewVersion ?? false,
      title: input.title ?? null,
      content: input.content,
    },
  })
}

/** 列出文档元信息（按 spaceType / refId 过滤；都不传=全部） */
export async function documentList(filter?: {
  spaceType?: SpaceType | null
  refId?: number | null
}): Promise<PmDocumentMeta[]> {
  return invoke<PmDocumentMeta[]>('document_list', {
    spaceType: filter?.spaceType ?? null,
    refId: filter?.refId ?? null,
  })
}

/** 版本列表 */
export async function documentVersionList(docId: string): Promise<PmDocumentVersionMeta[]> {
  return invoke<PmDocumentVersionMeta[]>('document_version_list', { docId })
}

/** 删除文档 */
export async function documentDelete(docId: string): Promise<boolean> {
  return invoke<boolean>('document_delete', { docId })
}

/** 导出 DOCX
 *  - destPath 提供：直接写到用户另存位置（绝对路径）
 *  - 否则归档到 PMToolData/doc/{docId}/export/
 *  返回 PmDocument（含 storagePath）
 */
export async function documentExportDocx(
  docId: string,
  fileName: string,
  destPath?: string | null,
): Promise<PmDocument> {
  return invoke<PmDocument>('document_export_docx', { docId, fileName, destPath: destPath ?? null })
}

/** 转换文档类型：richtext ⇄ markdown（覆盖当前版本并更新 type） */
export async function documentConvert(docId: string, to: 'markdown' | 'richtext'): Promise<PmDocument> {
  return invoke<PmDocument>('document_convert', { docId, to })
}

/** 把前端生成的二进制产物写到用户指定路径 */
export async function writeBinaryFile(path: string, data: Uint8Array): Promise<void> {
  await invoke<void>('write_binary_file', { path, data: Array.from(data) })
}

export type GenerateFormat = 'docx' | 'pptx' | 'pdf'

/**
 * 由 Markdown 内容直接生成文件（DOCX / PPTX / PDF），不落 documents 表。
 * 生成在 Rust 侧（Document Engine）。
 * @returns 写入的路径
 */
export async function documentGenerateInline(input: {
  title: string
  markdown: string
  format: GenerateFormat
  /** 必填则写到用户指定位置；空/省略则归档到 PMToolData/documents/ */
  destPath?: string | null
}): Promise<string> {
  return invoke<string>('document_generate_inline', {
    title: input.title,
    markdown: input.markdown,
    format: input.format,
    destPath: input.destPath,
  })
}

/** 导入文本文件建文档（.md/.markdown → Markdown；其余 → Text） */
export async function documentImport(input: {
  filePath: string
  title: string
  spaceType?: SpaceType | null
  refId?: number | null
}): Promise<PmDocument> {
  return invoke<PmDocument>('document_import', {
    filePath: input.filePath,
    title: input.title,
    spaceType: input.spaceType ?? null,
    refId: input.refId ?? null,
  })
}
