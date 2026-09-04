/**
 * 纯文本预览 · 等宽字体 + 行号
 *
 * 超 5MB 走「本地编辑器打开」（Rust 端已拦截）
 */
import { useEffect, useMemo, useState } from 'react'
import { PreviewToolbar } from './PreviewToolbar'
import type { FilePreviewProps } from './types'
import { readTextFile } from '@/services/projectFiles'

export function TextPreview({ path, fileName, onOpenExternally }: FilePreviewProps) {
  const [content, setContent] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const text = await readTextFile(path)
        if (cancelled) return
        setContent(text)
        setLoading(false)
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : String(e))
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [path])

  const lines = useMemo(() => content.split(/\r?\n/), [content])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PreviewToolbar
        fileName={fileName}
        onOpenExternally={onOpenExternally}
        loading={loading}
        error={error}
      />
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: 0,
          background: 'var(--color-bg)',
          color: 'var(--color-text)',
          display: 'flex',
        }}
      >
        <div
          style={{
            padding: '10px 8px 10px 14px',
            background: 'var(--color-bg-subtle)',
            borderRight: '1px solid var(--color-border)',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            lineHeight: 1.55,
            color: 'var(--color-text-tertiary)',
            textAlign: 'right',
            userSelect: 'none',
            minWidth: 50,
          }}
        >
          {lines.map((_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        <pre
          style={{
            margin: 0,
            padding: '10px 16px',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            lineHeight: 1.55,
            whiteSpace: 'pre',
            flex: 1,
          }}
        >
          {content}
        </pre>
      </div>
    </div>
  )
}
