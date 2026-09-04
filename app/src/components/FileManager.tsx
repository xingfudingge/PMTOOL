/**
 * PMTool V2.0 · FileManager 项目文件管理组件
 * Phase 4 · T4.9
 *
 * 设计依据：维护者 T4.9 决策 + RFC-03 §2
 *   - 仅在受管数据根目录内允许删除/重命名/预览
 *   - 文件实际存在 PMToolData/projects/{project_id}/files/
 *   - attachments 表存 metadata（file_path 是相对路径）
 *   - 点击附件 → OS 默认程序打开
 */

import { useEffect, useState, useRef } from 'react'
import {
  listAttachments,
  uploadAttachment,
  deleteAttachment,
  openAttachment,
  refreshAttachment,
  formatFileSize,
  getFileIcon,
  type Attachment,
} from '@/services/fileStorage'

interface FileManagerProps {
  projectId: number
}

export function FileManager({ projectId }: FileManagerProps) {
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    load()
  }, [projectId])

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const atts = await listAttachments('PROJECT', projectId)
      setAttachments(atts)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    setUploading(true)
    setError(null)
    try {
      for (const file of Array.from(files)) {
        await uploadAttachment('PROJECT', projectId, file)
      }
      await load()
    } catch (e) {
      setError(`上传失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  /**
   * 用 OS 默认程序打开附件（Phase 4 T4.9c · 核心场景）
   * 用户可在外部程序编辑保存回原文件
   */
  const handleOpen = async (att: Attachment) => {
    try {
      const path = await openAttachment(att.id)
      console.log('[FileManager] opened via OS:', path)
      // 不需要弹窗（OS 程序已在前台打开）
      // 后续可加"文件已在外部程序中打开"提示
    } catch (e) {
      setError(`打开失败：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  /**
   * 刷新附件元信息（检测外部修改）
   * 用户编辑保存后调此方法获取最新 mtime + sha256
   */
  const handleRefresh = async (att: Attachment) => {
    try {
      const updated = await refreshAttachment(att.id)
      setAttachments((prev) =>
        prev.map((a) => (a.id === att.id ? updated : a)),
      )
    } catch (e) {
      setError(`刷新失败：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const handleDelete = async (att: Attachment) => {
    if (!confirm(`确定删除「${att.file_name}」？`)) return
    try {
      await deleteAttachment(att.id)
      await load()
    } catch (e) {
      setError(`删除失败：${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return (
    <div data-testid="file-manager" style={{ padding: '16px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '12px',
        }}
      >
        <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
          📁 项目文件（{attachments.length} 个）
        </div>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleUpload}
            disabled={uploading}
            style={{ display: 'none' }}
            data-testid="file-upload-input"
          />
          <button
            data-testid="file-upload-button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={{
              padding: '6px 12px',
              background: 'var(--primary)',
              color: 'var(--primary-text)',
              borderRadius: '6px',
              fontSize: '12px',
            }}
          >
            {uploading ? '上传中...' : '📤 上传文件'}
          </button>
        </div>
      </div>

      {error && (
        <div
          data-testid="file-manager-error"
          style={{
            padding: '10px',
            background: '#fff1f0',
            border: '1px solid #ffa39e',
            borderRadius: '4px',
            color: '#cf1322',
            fontSize: '12px',
            marginBottom: '12px',
          }}
        >
          ❌ {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          加载中...
        </div>
      ) : attachments.length === 0 ? (
        <div
          data-testid="file-manager-empty"
          style={{
            padding: '24px',
            textAlign: 'center',
            color: 'var(--text-secondary)',
            fontSize: '13px',
            border: '1px dashed var(--border)',
            borderRadius: '6px',
          }}
        >
          暂无文件 · 点击右上角"上传文件"添加项目附件
        </div>
      ) : (
        <table
          data-testid="file-manager-table"
          style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}
        >
          <thead>
            <tr style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>
              <th style={{ padding: '6px 0', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                文件
              </th>
              <th style={{ padding: '6px 0', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                大小
              </th>
              <th style={{ padding: '6px 0', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                上传时间
              </th>
              <th style={{ padding: '6px 0', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                SHA-256
              </th>
              <th style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}></th>
            </tr>
          </thead>
          <tbody>
            {attachments.map((att) => (
              <tr key={att.id} data-testid={`file-row-${att.id}`}>
                <td
                  style={{
                    padding: '8px 0',
                    borderBottom: '1px solid var(--hover)',
                    cursor: 'pointer',
                  }}
                  onClick={() => handleOpen(att)}
                >
                  <span style={{ marginRight: '6px' }}>{getFileIcon(att.file_type, att.file_name)}</span>
                  <span>{att.file_name}</span>
                </td>
                <td
                  style={{
                    padding: '8px 0',
                    borderBottom: '1px solid var(--hover)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {formatFileSize(att.file_size)}
                </td>
                <td
                  style={{
                    padding: '8px 0',
                    borderBottom: '1px solid var(--hover)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {att.created_at.substring(0, 10)}
                </td>
                <td
                  style={{
                    padding: '8px 0',
                    borderBottom: '1px solid var(--hover)',
                    color: 'var(--text-secondary)',
                    fontFamily: 'monospace',
                    fontSize: '11px',
                  }}
                  title={att.sha256 ?? ''}
                >
                  {att.sha256 ? `${att.sha256.substring(0, 12)}...` : '-'}
                </td>
                <td
                  style={{
                    padding: '8px 0',
                    borderBottom: '1px solid var(--hover)',
                    textAlign: 'right',
                  }}
                >
                  <button
                    data-testid={`file-refresh-${att.id}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleRefresh(att)
                    }}
                    style={{
                      padding: '2px 8px',
                      background: 'transparent',
                      color: 'var(--text-secondary)',
                      fontSize: '11px',
                    }}
                    title="刷新 mtime + sha256（检测外部修改）"
                  >
                    🔄
                  </button>
                  <button
                    data-testid={`file-delete-${att.id}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete(att)
                    }}
                    style={{
                      padding: '2px 8px',
                      background: 'transparent',
                      color: '#cf1322',
                      fontSize: '11px',
                    }}
                  >
                    删除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}