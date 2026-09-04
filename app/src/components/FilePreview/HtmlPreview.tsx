/**
 * HTML 预览 · sandbox iframe
 *
 * 通过 blob URL 注入，避免 sandbox 之外直接执行外部脚本
 * sandbox="allow-same-origin"：允许 blob URL 同源渲染；不允许 JS 执行
 */
import { useEffect, useState } from 'react'
import { PreviewToolbar } from './PreviewToolbar'
import type { FilePreviewProps } from './types'
import { readTextFile } from '@/services/projectFiles'

export function HtmlPreview({ path, fileName, onOpenExternally }: FilePreviewProps) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setUrl(null)
    ;(async () => {
      try {
        const text = await readTextFile(path)
        if (cancelled) return
        const blob = new Blob([text], { type: 'text/html; charset=utf-8' })
        const u = URL.createObjectURL(blob)
        if (cancelled) {
          URL.revokeObjectURL(u)
          return
        }
        setUrl(u)
        setLoading(false)
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : String(e))
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
      setUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
    }
  }, [path])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PreviewToolbar
        fileName={fileName}
        onOpenExternally={onOpenExternally}
        loading={loading}
        error={error}
      />
      {url && (
        <iframe
          src={url}
          sandbox="allow-same-origin"
          style={{
            flex: 1,
            width: '100%',
            border: 'none',
            background: '#fff',
          }}
          title={fileName}
        />
      )}
    </div>
  )
}
