/**
 * PMTool · FilePreview 分发器（维护者 2026-08-31）
 *
 * 根据文件扩展名分发到对应子组件：
 *   .pdf             -> PdfPreview
 *   .docx / .doc     -> DocxPreview
 *   .xlsx / .xls/.csv -> XlsxPreview
 *   .pptx            -> PptxPreview
 *   .png/.jpg/.../svg -> ImagePreview
 *   .md              -> MarkdownPreview（只读 + 本地编辑器按钮）
 *   .txt / .log      -> TextPreview
 *   .html / .htm     -> HtmlPreview（sandbox iframe）
 *   代码类（json/xml/yaml/ts/...）-> CodeHighlightPreview
 *   其它              -> UnknownPreview（元信息 + 本地编辑器按钮）
 *
 * 每个子组件统一接收 path / fileName / onOpenExternally。
 */

import { lazy, Suspense } from 'react'
import React from 'react'
import { FileText } from 'lucide-react'
import type { FilePreviewProps } from './types'
import { UnknownPreview } from './UnknownPreview'

// 大体积预览库用 lazy chunk · 首屏不阻塞
const PdfPreview = lazy(() => import('./PdfPreview').then((m) => ({ default: m.PdfPreview })))
const DocxPreview = lazy(() => import('./DocxPreview').then((m) => ({ default: m.DocxPreview })))
const PptxPreview = lazy(() => import('./PptxPreview').then((m) => ({ default: m.PptxPreview })))

import { XlsxPreview } from './XlsxPreview'
import { ImagePreview } from './ImagePreview'
import { MarkdownFileView } from './MarkdownFileView'
import { TxtEditor } from './TxtEditor'
import { TextPreview } from './TextPreview'
import { HtmlPreview } from './HtmlPreview'
import { CodeHighlightPreview } from './CodeHighlightPreview'

/** 归一化扩展名（小写 · 去前导点） */
export function extOf(name: string): string {
  const i = name.lastIndexOf('.')
  if (i < 0 || i === name.length - 1) return ''
  return name.slice(i + 1).toLowerCase()
}

/** 代码类扩展名白名单（highlight.js 着色） */
const CODE_EXTS = new Set([
  'json', 'xml', 'yaml', 'yml', 'ts', 'tsx', 'js', 'jsx',
  'py', 'css', 'scss', 'less', 'java', 'go', 'rs', 'sh',
  'bash', 'sql', 'toml', 'ini', 'conf', 'dockerfile',
  'mdx', 'vue', 'svelte',
])

/** 加载占位（lazy chunk 解码时显示） */
function LoadingBlock({ label }: { label: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        height: '100%',
        color: 'var(--color-text-tertiary)',
        fontSize: 12,
      }}
    >
      <FileText size={24} />
      正在加载{label}预览…
    </div>
  )
}

/** 子组件渲染失败时降级到 UnknownPreview（不让单个 chunk 失败炸掉整个 tab） */
class PreviewErrorBoundary extends React.Component<
  { fallback: () => React.ReactNode; children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false }
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  componentDidCatch(error: unknown) {
    console.error('[FilePreview] render error:', error)
  }
  render() {
    if (this.state.hasError) return this.props.fallback()
    return this.props.children
  }
}

export function FilePreview(props: FilePreviewProps) {
  const ext = extOf(props.fileName)

  const wrap = (node: React.ReactNode) => (
    <PreviewErrorBoundary fallback={() => <UnknownPreview {...props} />}>
      {node}
    </PreviewErrorBoundary>
  )

  if (ext === 'pdf') {
    return wrap(
      <Suspense fallback={<LoadingBlock label="PDF" />}>
        <PdfPreview {...props} />
      </Suspense>,
    )
  }
  if (ext === 'docx' || ext === 'doc') {
    return wrap(
      <Suspense fallback={<LoadingBlock label="Word" />}>
        <DocxPreview {...props} />
      </Suspense>,
    )
  }
  if (ext === 'pptx' || ext === 'ppt') {
    return wrap(
      <Suspense fallback={<LoadingBlock label="PPT" />}>
        <PptxPreview {...props} />
      </Suspense>,
    )
  }
  if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
    return wrap(<XlsxPreview {...props} />)
  }
  if (
    ext === 'png' ||
    ext === 'jpg' ||
    ext === 'jpeg' ||
    ext === 'gif' ||
    ext === 'webp' ||
    ext === 'bmp' ||
    ext === 'svg'
  ) {
    return wrap(<ImagePreview {...props} />)
  }
  if (ext === 'md' || ext === 'markdown') {
    // 2026-09-19：可编辑，且支持「富文本 / 纯文本」两种编辑器切换
    return wrap(<MarkdownFileView {...props} />)
  }
  if (ext === 'txt') {
    return wrap(<TxtEditor {...props} />)
  }
  if (ext === 'log') {
    return wrap(<TextPreview {...props} />)
  }
  if (ext === 'html' || ext === 'htm') {
    return wrap(<HtmlPreview {...props} />)
  }
  if (CODE_EXTS.has(ext)) {
    return wrap(<CodeHighlightPreview {...props} />)
  }
  return <UnknownPreview {...props} />
}
