/**
 * 未知类型预览 · 元信息 + 本地编辑器打开
 */
import { FileQuestion, HardDrive, Clock } from 'lucide-react'
import { PreviewToolbar } from './PreviewToolbar'
import type { FilePreviewProps } from './types'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

export function UnknownPreview({ path, fileName, size, onOpenExternally }: FilePreviewProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PreviewToolbar
        fileName={fileName}
        onOpenExternally={onOpenExternally}
      />
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          padding: 32,
          background: 'var(--color-bg)',
        }}
      >
        <FileQuestion size={48} color="var(--color-text-tertiary)" />
        <div
          style={{
            textAlign: 'center',
            color: 'var(--color-text-secondary)',
            fontSize: 13,
            maxWidth: 480,
          }}
        >
          此文件类型暂不支持在线预览
          <br />
          请使用本地默认程序打开查看 / 编辑
        </div>
        <div
          style={{
            padding: '10px 16px',
            border: '1px solid var(--color-border)',
            borderRadius: 6,
            background: 'var(--color-bg-subtle)',
            color: 'var(--color-text)',
            fontSize: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            minWidth: 280,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: 'var(--color-text-tertiary)', width: 70 }}>路径：</span>
            <span style={{ wordBreak: 'break-all' }}>{path}</span>
          </div>
          {size !== undefined && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <HardDrive size={12} color="var(--color-text-tertiary)" />
              <span style={{ color: 'var(--color-text-tertiary)', width: 64 }}>大小：</span>
              <span>{formatSize(size)}</span>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onOpenExternally}
          style={{
            padding: '6px 16px',
            fontSize: 13,
            color: '#fff',
            background: 'var(--color-accent, #2563eb)',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          用本地默认程序打开
        </button>
      </div>
    </div>
  )
}
