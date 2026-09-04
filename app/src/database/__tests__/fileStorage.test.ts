/**
 * PMTool V2.0 · FileStorage 自动化测试
 * Phase 4 · T4.9
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import {
  listAttachments,
  uploadAttachment,
  deleteAttachment,
  getAttachmentPath,
  openAttachment,
  refreshAttachment,
  formatFileSize,
  getFileIcon,
} from '@/services/fileStorage'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

// ============================================================
// 验收 T4.9 · CRUD
// ============================================================

describe('验收 T4.9 · listAttachments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('listAttachments 调用 list_attachments command', async () => {
    vi.mocked(invoke).mockResolvedValueOnce([
      {
        id: 1,
        owner_type: 'PROJECT',
        owner_id: 1,
        file_name: '需求.docx',
        file_path: 'project/1/files/需求.docx',
        file_size: 12345,
        file_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        created_at: '2026-08-21 10:00:00',
        sha256: 'abc123',
        updated_at: null,
      },
    ])
    const atts = await listAttachments('PROJECT', 1)
    expect(invoke).toHaveBeenCalledWith('list_attachments', {
      ownerType: 'PROJECT',
      ownerId: 1,
    })
    expect(atts[0].file_name).toBe('需求.docx')
  })
})

describe('验收 T4.9 · uploadAttachment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uploadAttachment 调用 upload_attachment command · base64 编码', async () => {
    const mockFile = new File(['hello world'], 'test.txt', { type: 'text/plain' })
    vi.mocked(invoke).mockResolvedValueOnce({
      id: 1,
      owner_type: 'PROJECT',
      owner_id: 1,
      file_name: 'test.txt',
      file_path: 'project/1/files/test.txt',
      file_size: 11,
      file_type: 'text/plain',
      created_at: '2026-08-22 10:00:00',
      sha256: '2aae6c35c94fcfb415dbe95f408b9ce91ee846ed',
      updated_at: null,
    })
    const att = await uploadAttachment('PROJECT', 1, mockFile)
    expect(invoke).toHaveBeenCalledWith(
      'upload_attachment',
      expect.objectContaining({
        ownerType: 'PROJECT',
        ownerId: 1,
        fileName: 'test.txt',
      }),
    )
    // 验证 contentBase64 存在且是字符串
    const call = vi.mocked(invoke).mock.calls[0][1] as Record<string, unknown>
    expect(typeof call.contentBase64).toBe('string')
    expect(att.file_name).toBe('test.txt')
  })
})

describe('验收 T4.9 · deleteAttachment / getAttachmentPath', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('deleteAttachment 调用 delete_attachment command', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(true)
    await deleteAttachment(1)
    expect(invoke).toHaveBeenCalledWith('delete_attachment', { id: 1 })
  })

  it('getAttachmentPath 返回绝对路径', async () => {
    vi.mocked(invoke).mockResolvedValueOnce('/Users/example/Library/Application Support/PMToolData/project/1/files/test.txt')
    const path = await getAttachmentPath(1)
    expect(invoke).toHaveBeenCalledWith('get_attachment_path', { id: 1 })
    expect(path).toContain('test.txt')
  })

  it('验收 T4.9c · openAttachment 用 OS 默认程序打开', async () => {
    vi.mocked(invoke).mockResolvedValueOnce('/Users/example/Library/Application Support/PMToolData/project/1/files/合同.docx')
    const path = await openAttachment(1)
    expect(invoke).toHaveBeenCalledWith('open_attachment', { id: 1 })
    expect(path).toContain('合同.docx')
  })

  it('验收 T4.9c · refreshAttachment 检测外部修改', async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      id: 1,
      owner_type: 'PROJECT',
      owner_id: 1,
      file_name: '需求.docx',
      file_path: 'project/1/files/需求.docx',
      file_size: 99999, // 文件被外部修改后大小变化
      file_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      created_at: '2026-08-21 10:00:00',
      sha256: 'newsha256',
      updated_at: null,
    })
    const updated = await refreshAttachment(1)
    expect(invoke).toHaveBeenCalledWith('refresh_attachment', { id: 1 })
    expect(updated.file_size).toBe(99999) // 文件大小变化
  })
})

// ============================================================
// 辅助函数
// ============================================================

describe('formatFileSize', () => {
  it('null → "-"', () => {
    expect(formatFileSize(null)).toBe('-')
  })

  it('< 1 KB → bytes', () => {
    expect(formatFileSize(500)).toBe('500 B')
  })

  it('< 1 MB → KB', () => {
    expect(formatFileSize(2048)).toBe('2.0 KB')
  })

  it('< 1 GB → MB', () => {
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5.0 MB')
  })

  it('>= 1 GB → GB', () => {
    expect(formatFileSize(2 * 1024 * 1024 * 1024)).toBe('2.00 GB')
  })
})

describe('getFileIcon', () => {
  it('docx → 📄', () => {
    expect(getFileIcon('application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'test.docx')).toBe('📄')
  })

  it('xlsx → 📊', () => {
    expect(getFileIcon('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'test.xlsx')).toBe('📊')
  })

  it('pdf → 📕', () => {
    expect(getFileIcon('application/pdf', 'test.pdf')).toBe('📕')
  })

  it('png → 🖼️', () => {
    expect(getFileIcon('image/png', 'test.png')).toBe('🖼️')
  })

  it('md → 📝', () => {
    expect(getFileIcon(null, 'test.md')).toBe('📝')
  })

  it('unknown → 📎', () => {
    expect(getFileIcon(null, 'test.unknownext')).toBe('📎')
  })
})