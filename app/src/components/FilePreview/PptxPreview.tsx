/**
 * PPT 预览 · pptx-preview 1.0.7（npm alias pptxjs）
 *
 * API：init(dom, options) -> previewer
 *   previewer.preview(arrayBuffer) - 渲染
 *   previewer.destroy()
 *
 * 维护者 2026-08-31 修复：与 DocxPreview 同理，改走 Rust read_file_bytes 拿 Uint8Array，
 * 避免 assetProtocol scope 未配置导致 fetch 失败。
 */
import { useEffect, useRef, useState } from 'react'
import { PreviewToolbar } from './PreviewToolbar'
import type { FilePreviewProps } from './types'
import { readFileBytes } from '@/services/projectFiles'

export function PptxPreview({ path, fileName, onOpenExternally }: FilePreviewProps) {
  const domRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [slideCount, setSlideCount] = useState(0)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const previewerRef = useRef<any>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setSlideCount(0)
    if (!domRef.current) return

    ;(async () => {
      try {
        const { init } = await import('pptxjs')
        const bytes = await readFileBytes(path)
        if (cancelled) return
        // Uint8Array.buffer.slice 返回 ArrayBuffer（pptx-preview 接受 ArrayBuffer）
        const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)

        // 清空容器（pptxjs init 会创建一个 wrapper）
        domRef.current!.innerHTML = ''
        const previewer = init(domRef.current!, {
          width: 900,
          height: 600,
          mode: 'slide',
        })
        previewerRef.current = previewer
        await previewer.preview(buf)
        if (cancelled) return
        setSlideCount(previewer.slideCount)
        setLoading(false)
      } catch (e) {
        if (cancelled) return
        setError(`PPT 加载失败：${e instanceof Error ? e.message : String(e)}`)
        setLoading(false)
      }
    })()

    return () => {
      cancelled = true
      try {
        previewerRef.current?.destroy?.()
      } catch {
        // ignore
      }
      previewerRef.current = null
    }
  }, [path])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PreviewToolbar
        fileName={fileName}
        onOpenExternally={onOpenExternally}
        loading={loading}
        error={error}
        extra={
          slideCount > 0 ? (
            <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
              共 {slideCount} 页
            </span>
          ) : undefined
        }
      />
      <div
        ref={domRef}
        style={{
          flex: 1,
          overflow: 'auto',
          padding: 16,
          background: '#f3f4f6',
        }}
      />
    </div>
  )
}
