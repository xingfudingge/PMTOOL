/**
 * PDF 预览 · pdfjs-dist 4.x
 *
 * 通过 ?url 导入 worker（Vite 静态资源处理）
 * 渲染策略：每页渲染到一个 canvas · 简单翻页按钮
 *
 * 维护者 2026-08-31 修复：之前用 convertFileSrc + getDocument 拿 URL，
 * assetProtocol scope 未配置时会失败。改成 Rust read_file_bytes 拿到字节，
 * 生成 Blob URL 喂给 pdfjs。
 */
import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react'
import { PreviewToolbar } from './PreviewToolbar'
import type { FilePreviewProps } from './types'
import { readFileBytes } from '@/services/projectFiles'

// pdfjs-dist 4.x 是 ESM · ?url 让 Vite 处理 worker 静态路径
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

export function PdfPreview({ path, fileName, onOpenExternally }: FilePreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [numPages, setNumPages] = useState(0)
  const [pageNum, setPageNum] = useState(1)
  const [scale, setScale] = useState(1.25)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setNumPages(0)
    setPageNum(1)
    let createdUrl: string | null = null

    ;(async () => {
      try {
        const bytes = await readFileBytes(path)
        if (cancelled) return
        const blob = new Blob([bytes], { type: 'application/pdf' })
        createdUrl = URL.createObjectURL(blob)
        setPdfUrl(createdUrl)
      } catch (e) {
        if (cancelled) return
        setError(`PDF 加载失败：${e instanceof Error ? e.message : String(e)}`)
        setLoading(false)
      }
    })()

    return () => {
      cancelled = true
      if (createdUrl) URL.revokeObjectURL(createdUrl)
    }
  }, [path])

  useEffect(() => {
    if (!pdfUrl) return
    let cancelled = false

    ;(async () => {
      try {
        const loadingTask = pdfjsLib.getDocument(pdfUrl)
        const pdf = await loadingTask.promise
        if (cancelled) return
        setNumPages(pdf.numPages)
        setLoading(false)
      } catch (e) {
        if (cancelled) return
        setError(`PDF 加载失败：${e instanceof Error ? e.message : String(e)}`)
        setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [pdfUrl])

  useEffect(() => {
    if (numPages === 0 || !pdfUrl) return
    let cancelled = false
    const container = containerRef.current
    if (!container) return

    ;(async () => {
      try {
        renderTaskRef.current?.cancel()
        container.innerHTML = ''
        const loadingTask = pdfjsLib.getDocument(pdfUrl)
        const pdf = await loadingTask.promise
        if (cancelled) return
        const page = await pdf.getPage(pageNum)
        if (cancelled) return
        const viewport = page.getViewport({ scale })
        const canvas = document.createElement('canvas')
        canvas.width = viewport.width
        canvas.height = viewport.height
        canvas.style.display = 'block'
        canvas.style.margin = '0 auto 12px'
        canvas.style.boxShadow = '0 1px 4px rgba(0,0,0,0.1)'
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        const task = page.render({ canvasContext: ctx, viewport })
        renderTaskRef.current = task
        await task.promise
        if (cancelled) return
        container.appendChild(canvas)
      } catch (e) {
        if (cancelled) return
        setError(`渲染失败：${e instanceof Error ? e.message : String(e)}`)
      }
    })()

    return () => {
      cancelled = true
      renderTaskRef.current?.cancel()
    }
  }, [pdfUrl, pageNum, scale, numPages])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PreviewToolbar
        fileName={fileName}
        onOpenExternally={onOpenExternally}
        loading={loading}
        error={error}
        extra={
          numPages > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
              <button
                type="button"
                style={navBtnStyle}
                onClick={() => setPageNum((n) => Math.max(1, n - 1))}
                disabled={pageNum <= 1}
              >
                <ChevronLeft size={12} />
              </button>
              <span style={{ minWidth: 60, textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                {pageNum} / {numPages}
              </span>
              <button
                type="button"
                style={navBtnStyle}
                onClick={() => setPageNum((n) => Math.min(numPages, n + 1))}
                disabled={pageNum >= numPages}
              >
                <ChevronRight size={12} />
              </button>
              <span style={{ width: 1, height: 14, background: 'var(--color-border)', margin: '0 4px' }} />
              <button
                type="button"
                style={navBtnStyle}
                onClick={() => setScale((s) => Math.max(0.5, s - 0.25))}
              >
                <ZoomOut size={12} />
              </button>
              <span style={{ minWidth: 44, textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                {Math.round(scale * 100)}%
              </span>
              <button
                type="button"
                style={navBtnStyle}
                onClick={() => setScale((s) => Math.min(3, s + 0.25))}
              >
                <ZoomIn size={12} />
              </button>
            </span>
          )
        }
      />
      <div
        ref={containerRef}
        style={{
          flex: 1,
          overflow: 'auto',
          padding: 16,
          background: '#525659',
        }}
      />
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
