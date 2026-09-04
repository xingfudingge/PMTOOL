/**
 * PMTool V2.0 · FileStorage WebView 端 Service
 * Phase 4 · T4.9
 *
 * 架构：通过 Tauri commands 桥接 Rust FileStorageProvider
 */

import { invoke } from '@tauri-apps/api/core'

export interface Attachment {
  id: number
  owner_type: string
  owner_id: number
  file_name: string
  file_path: string
  file_size: number | null
  file_type: string | null
  created_at: string
  sha256: string | null
  updated_at: string | null
}

/** 列出附件 */
export async function listAttachments(
  ownerType: string,
  ownerId: number,
): Promise<Attachment[]> {
  return invoke<Attachment[]>('list_attachments', {
    ownerType,
    ownerId,
  })
}

/** 上传附件（WebView 端 file 转 base64）*/
export async function uploadAttachment(
  ownerType: string,
  ownerId: number,
  file: File,
): Promise<Attachment> {
  // 1. File → ArrayBuffer → base64
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  const contentBase64 = btoa(binary)

  // 2. 调用 Rust commands::attachments::upload_attachment
  return invoke<Attachment>('upload_attachment', {
    ownerType,
    ownerId,
    fileName: file.name,
    contentBase64,
  })
}

/** 删除附件 */
export async function deleteAttachment(id: number): Promise<boolean> {
  return invoke<boolean>('delete_attachment', { id })
}

/** 获取附件绝对路径（OS 默认程序打开用）*/
export async function getAttachmentPath(id: number): Promise<string> {
  return invoke<string>('get_attachment_path', { id })
}

/** 用 OS 默认程序打开附件（PMTool 核心场景）*/
export async function openAttachment(id: number): Promise<string> {
  return invoke<string>('open_attachment', { id })
}

/** 刷新附件元信息（检测外部修改）*/
export async function refreshAttachment(id: number): Promise<Attachment> {
  return invoke<Attachment>('refresh_attachment', { id })
}

/** 触发浏览器下载（辅助函数）*/
export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** 格式化文件大小（人类可读）*/
export function formatFileSize(bytes: number | null): string {
  if (bytes === null) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

/** 文件类型图标 */
export function getFileIcon(fileType: string | null, fileName: string): string {
  if (!fileType) {
    // 从文件名推断
    const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
    if (['doc', 'docx'].includes(ext)) return '📄'
    if (['xls', 'xlsx'].includes(ext)) return '📊'
    if (['ppt', 'pptx'].includes(ext)) return '📽️'
    if (['pdf'].includes(ext)) return '📕'
    if (['png', 'jpg', 'jpeg', 'gif', 'svg'].includes(ext)) return '🖼️'
    if (['md', 'markdown'].includes(ext)) return '📝'
    if (['zip'].includes(ext)) return '🗜️'
    return '📎'
  }
  if (fileType.startsWith('image/')) return '🖼️'
  if (fileType.startsWith('video/')) return '🎬'
  if (fileType.startsWith('audio/')) return '🎵'
  if (fileType.includes('pdf')) return '📕'
  // Office Open XML 精确匹配优先（spreadsheetml 含 "document" 字串）
  if (fileType.includes('spreadsheetml') || fileType.includes('excel')) return '📊'
  if (fileType.includes('wordprocessingml') || fileType.includes('document')) return '📄'
  if (fileType.includes('presentationml') || fileType.includes('powerpoint')) return '📽️'
  if (fileType.includes('zip') || fileType.includes('archive')) return '🗜️'
  return '📎'
}