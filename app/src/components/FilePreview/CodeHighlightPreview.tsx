/**
 * 代码类预览 · highlight.js 语法着色
 *
 * 自动按扩展名选语言 · 失败回退 plaintext
 */
import { useEffect, useMemo, useState } from 'react'
import { PreviewToolbar } from './PreviewToolbar'
import type { FilePreviewProps } from './types'
import { readTextFile } from '@/services/projectFiles'
import { extOf } from './index'

// 只引核心 · highlight.js 体积大
import hljs from 'highlight.js/lib/core'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import json from 'highlight.js/lib/languages/json'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'
import python from 'highlight.js/lib/languages/python'
import css from 'highlight.js/lib/languages/css'
import scss from 'highlight.js/lib/languages/scss'
import java from 'highlight.js/lib/languages/java'
import go from 'highlight.js/lib/languages/go'
import rust from 'highlight.js/lib/languages/rust'
import bash from 'highlight.js/lib/languages/bash'
import sql from 'highlight.js/lib/languages/sql'
import markdown from 'highlight.js/lib/languages/markdown'

hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('json', json)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('html', xml)
hljs.registerLanguage('yaml', yaml)
hljs.registerLanguage('yml', yaml)
hljs.registerLanguage('python', python)
hljs.registerLanguage('css', css)
hljs.registerLanguage('scss', scss)
hljs.registerLanguage('java', java)
hljs.registerLanguage('go', go)
hljs.registerLanguage('rust', rust)
hljs.registerLanguage('rs', rust)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('sh', bash)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('markdown', markdown)

/** 扩展名 → highlight.js 语言 ID */
const LANG_MAP: Record<string, string> = {
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', tsx: 'typescript',
  json: 'json',
  xml: 'xml', svg: 'xml',
  yaml: 'yaml', yml: 'yaml',
  py: 'python',
  css: 'css', scss: 'scss', less: 'css',
  java: 'java',
  go: 'go',
  rs: 'rust',
  sh: 'bash', bash: 'bash', zsh: 'bash',
  sql: 'sql',
  md: 'markdown', mdx: 'markdown',
}

export function CodeHighlightPreview({ path, fileName, onOpenExternally }: FilePreviewProps) {
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

  const ext = extOf(fileName)
  const lang = LANG_MAP[ext]

  const highlighted = useMemo(() => {
    try {
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(content, { language: lang, ignoreIllegals: true }).value
      }
      return hljs.highlightAuto(content).value
    } catch {
      // fallback · 直接转义
      return content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
    }
  }, [content, lang])

  const lines = useMemo(() => highlighted.split('\n'), [highlighted])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PreviewToolbar
        fileName={fileName}
        onOpenExternally={onOpenExternally}
        loading={loading}
        error={error}
        extra={
          lang ? (
            <span
              style={{
                fontSize: 11,
                color: 'var(--color-text-tertiary)',
                padding: '2px 6px',
                background: 'var(--color-bg)',
                border: '1px solid var(--color-border)',
                borderRadius: 3,
              }}
            >
              {lang}
            </span>
          ) : undefined
        }
      />
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: 0,
          background: '#fafafa',
          color: '#1f2328',
          display: 'flex',
        }}
      >
        <div
          style={{
            padding: '10px 8px 10px 14px',
            background: '#f3f4f6',
            borderRight: '1px solid #e5e7eb',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            lineHeight: 1.55,
            color: '#6b7280',
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
          <code
            className={lang ? `hljs language-${lang}` : 'hljs'}
            dangerouslySetInnerHTML={{ __html: highlighted }}
          />
        </pre>
      </div>
    </div>
  )
}
