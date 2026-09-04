/**
 * Markdown 预览 · react-markdown + remark-gfm（GFM 表格 / 任务列表 / 删除线）
 *
 * 只读 · 编辑器接口预留（write_text_file 已就绪）
 */
import { useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { PreviewToolbar } from './PreviewToolbar'
import type { FilePreviewProps } from './types'
import { readTextFile } from '@/services/projectFiles'

export function MarkdownPreview({ path, fileName, onOpenExternally }: FilePreviewProps) {
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
          padding: '20px 32px',
          background: 'var(--color-bg)',
          color: 'var(--color-text)',
        }}
      >
        <article
          style={{
            maxWidth: 880,
            margin: '0 auto',
            fontSize: 14,
            lineHeight: 1.7,
          }}
          className="md-preview"
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </article>
        <MarkdownStyles />
      </div>
    </div>
  )
}

function MarkdownStyles() {
  // 局部样式（不污染全局）· 通过 className 限定
  return (
    <style>{`
      .md-preview {
        white-space: pre-wrap;
        word-wrap: break-word;
      }
      .md-preview h1 { font-size: 24px; font-weight: 700; margin: 24px 0 12px; border-bottom: 1px solid var(--color-border); padding-bottom: 6px; }
      .md-preview h2 { font-size: 20px; font-weight: 600; margin: 20px 0 10px; border-bottom: 1px solid var(--color-border-subtle, var(--color-border)); padding-bottom: 4px; }
      .md-preview h3 { font-size: 17px; font-weight: 600; margin: 16px 0 8px; }
      .md-preview h4 { font-size: 15px; font-weight: 600; margin: 12px 0 6px; }
      .md-preview p { margin: 8px 0; white-space: pre-wrap; }
      .md-preview ul, .md-preview ol { padding-left: 28px; margin: 8px 0; }
      .md-preview li { margin: 2px 0; white-space: pre-wrap; }
      .md-preview blockquote { border-left: 3px solid var(--color-border); padding: 2px 12px; color: var(--color-text-secondary); margin: 8px 0; background: var(--color-bg-subtle); white-space: pre-wrap; }
      .md-preview code { background: var(--color-bg-subtle); padding: 1px 5px; border-radius: 3px; font-family: var(--font-mono); font-size: 0.9em; }
      .md-preview pre { background: var(--color-bg-subtle); border: 1px solid var(--color-border); padding: 10px 14px; border-radius: 6px; overflow-x: auto; white-space: pre; }
      .md-preview pre code { background: transparent; padding: 0; white-space: pre; }
      .md-preview table { border-collapse: collapse; margin: 10px 0; }
      .md-preview th, .md-preview td { border: 1px solid var(--color-border); padding: 5px 10px; }
      .md-preview th { background: var(--color-bg-subtle); font-weight: 600; }
      .md-preview a { color: #2563eb; text-decoration: underline; }
      .md-preview hr { border: none; border-top: 1px solid var(--color-border); margin: 16px 0; }
      .md-preview img { max-width: 100%; }
    `}</style>
  )
}
