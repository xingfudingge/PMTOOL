/**
 * 图片预览 · 原生 <img> + 缩放
 *
 * 维护者 2026-08-31 修复：之前用 `convertFileSrc(path)` 拿 asset:// URL，
 * 但 tauri.conf.json 没配 assetProtocol scope，WebView 拒绝加载。
 * 改用 Rust `read_file_bytes` 拿到 Uint8Array，new Blob → URL.createObjectURL，
 * 跟 DocxPreview / PptxPreview 一致，绕过 assetProtocol。
 */
import { useEffect, useState } from 'react'
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react'
import { PreviewToolbar } from './PreviewToolbar'
import type { FilePreviewProps } from './types'
import { readFileBytes } from '@/services/projectFiles'

export function ImagePreview({ path, fileName, onOpenExternally }: FilePreviewProps) {
  const [zoom, setZoom] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setError(null)
    let createdUrl: string | null = null
    ;(async () => {
      try {
        const bytes = await readFileBytes(path)
        if (cancelled) return
        // 根据扩展名给 MIME（多数浏览器靠扩展识别；给个兜底 image/*）
        const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
        const mime =
          ext === 'png' ? 'image/png'
            : ext === 'gif' ? 'image/gif'
            : ext === 'webp' ? 'image/webp'
            : ext === 'svg' ? 'image/svg+xml'
            : ext === 'bmp' ? 'image/bmp'
            : 'image/jpeg'
        const blob = new Blob([bytes], { type: mime })
        createdUrl = URL.createObjectURL(blob)
        setUrl(createdUrl)
      } catch (e) {
        if (cancelled) return
        setError(`图片加载失败：${e instanceof Error ? e.message : String(e)}`)
      }
    })()
    return () => {
      cancelled = true
      if (createdUrl) URL.revokeObjectURL(createdUrl)
    }
  }, [path, fileName])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PreviewToolbar
        fileName={fileName}
        onOpenExternally={onOpenExternally}
        error={error}
        extra={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <button
              type="button"
              style={navBtnStyle}
              onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}
            >
              <ZoomOut size={12} />
            </button>
            <span style={{ minWidth: 48, textAlign: 'center', fontSize: 12, color: 'var(--color-text-secondary)' }}>
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              style={navBtnStyle}
              onClick={() => setZoom((z) => Math.min(4, z + 0.25))}
            >
              <ZoomIn size={12} />
            </button>
            <button
              type="button"
              style={navBtnStyle}
              onClick={() => setZoom(1)}
            >
              <RotateCcw size={12} />
            </button>
          </span>
        }
      />
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: 16,
          background: '#1f2937',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <img
          src={url ?? ''}
          alt={fileName}
          style={{
            maxWidth: 'none',
            transform: `scale(${zoom})`,
            transformOrigin: 'center center',
            transition: 'transform 0.15s ease',
            display: url ? 'block' : 'none',
          }}
          onError={() => setError('图片加载失败')}
        />
      </div>
    </div>
  )
}

const navBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 22,
  height: 22,
  padding: 0,
  background: 'var(--color-bg)',
  border: '1px solid var(--color-border)',
  borderRadius: 3,
  cursor: 'pointer',
  color: 'var(--color-text)',
}
