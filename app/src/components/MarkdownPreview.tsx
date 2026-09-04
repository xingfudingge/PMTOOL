/**
 * PMTool V2.0 · 极简 Markdown 预览组件
 * Phase A · P3 模板 + P4 AI 共用（2026-08-24）
 *
 * 不引入外部 Markdown 库 · 渲染基础语法：
 *   - # / ## / ### 标题
 *   - 段落
 *   - 列表（有序 + 无序）
 *   - 表格（|xxx|xxx|）
 *   - **bold** inline
 *   - --- 分隔线
 *   - > 引用
 *   - {{field}} 占位符高亮
 */

import type { ReactNode } from 'react'
import { FileText, type LucideIcon } from 'lucide-react'

interface Props {
  markdown: string
  icon?: LucideIcon
}

export function MarkdownPreview({ markdown, icon: Icon }: Props) {
  return (
    <div>
      {Icon && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginBottom: '12px',
            fontSize: '11px',
            color: 'var(--color-text-tertiary)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          <FileText size={11} strokeWidth={1.75} />
          实时预览
        </div>
      )}
      <div
        style={{
          fontSize: '13px',
          lineHeight: 1.7,
          color: 'var(--color-text)',
          fontFamily: 'var(--font-mono, monospace)',
        }}
      >
        {markdown.split('\n').map((line, i) => (
          <PreviewLine key={i} line={line} />
        ))}
      </div>
    </div>
  )
}

function PreviewLine({ line }: { line: string }) {
  // H1: # xxx
  if (line.startsWith('# ')) {
    return (
      <h1
        style={{
          fontSize: '18px',
          fontWeight: 600,
          marginTop: '0',
          marginBottom: '12px',
          paddingBottom: '8px',
          borderBottom: '1px solid var(--color-border-thin)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        {line.slice(2)}
      </h1>
    )
  }
  // H2: ## xxx
  if (line.startsWith('## ')) {
    return (
      <h2
        style={{
          fontSize: '14px',
          fontWeight: 600,
          marginTop: '16px',
          marginBottom: '8px',
          color: 'var(--color-text)',
        }}
      >
        {line.slice(3)}
      </h2>
    )
  }
  // H3: ### xxx
  if (line.startsWith('### ')) {
    return (
      <h3
        style={{
          fontSize: '13px',
          fontWeight: 600,
          marginTop: '12px',
          marginBottom: '6px',
          color: 'var(--color-text-secondary)',
        }}
      >
        {line.slice(4)}
      </h3>
    )
  }
  // 表格行
  if (line.startsWith('|') && line.endsWith('|')) {
    if (/^\|[\s\-|:-]+\|$/.test(line)) return null
    const cells = line.slice(1, -1).split('|').map((c) => c.trim())
    return (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cells.length}, 1fr)`,
          gap: '8px',
          padding: '4px 8px',
          borderBottom: '1px solid var(--color-border-thin)',
          fontSize: '12px',
        }}
      >
        {cells.map((c, i) => (
          <span key={i}>{renderInline(c)}</span>
        ))}
      </div>
    )
  }
  // 无序列表
  if (line.startsWith('- ') || line.startsWith('-  ')) {
    return (
      <div
        style={{
          paddingLeft: '12px',
          fontSize: '13px',
          color: 'var(--color-text-secondary)',
        }}
      >
        <span style={{ color: 'var(--color-text-tertiary)', marginRight: '4px' }}>·</span>
        {renderInline(line.replace(/^-\s+/, ''))}
      </div>
    )
  }
  // 有序列表
  if (/^\d+\.\s/.test(line)) {
    return (
      <div
        style={{
          paddingLeft: '16px',
          fontSize: '13px',
          color: 'var(--color-text-secondary)',
        }}
      >
        {renderInline(line)}
      </div>
    )
  }
  // 分隔线
  if (line.trim() === '---') {
    return (
      <hr
        style={{
          border: 'none',
          borderTop: '1px solid var(--color-border-thin)',
          margin: '16px 0',
        }}
      />
    )
  }
  // 引用
  if (line.startsWith('> ')) {
    return (
      <div
        style={{
          padding: '8px 12px',
          borderLeft: '2px solid var(--color-accent)',
          background: 'var(--color-bg-subtle)',
          color: 'var(--color-text-secondary)',
          fontSize: '12.5px',
          margin: '8px 0',
        }}
      >
        {renderInline(line.slice(2))}
      </div>
    )
  }
  // 占位符未填写（高亮）
  if (/\{\{(\w+)\}\}/.test(line)) {
    return (
      <div
        style={{
          color: 'var(--color-status-warning)',
          fontSize: '13px',
          background: 'var(--color-bg-subtle)',
          padding: '2px 6px',
          borderRadius: 'var(--radius)',
          display: 'inline-block',
          margin: '2px 0',
        }}
      >
        {line}
      </div>
    )
  }
  // 空行
  if (line.trim() === '') return <div style={{ height: '8px' }} />
  // 普通段落
  return (
    <p
      style={{
        margin: '4px 0',
        color: 'var(--color-text)',
      }}
    >
      {renderInline(line)}
    </p>
  )
}

function renderInline(text: string): ReactNode {
  const parts: ReactNode[] = []
  let remaining = text
  let key = 0
  const boldRegex = /\*\*([^*]+)\*\*/
  let match: RegExpExecArray | null
  while ((match = boldRegex.exec(remaining)) !== null) {
    if (match.index > 0) {
      parts.push(remaining.slice(0, match.index))
    }
    parts.push(
      <strong
        key={key++}
        style={{ color: 'var(--color-text)', fontWeight: 600 }}
      >
        {match[1]}
      </strong>,
    )
    remaining = remaining.slice(match.index + match[0].length)
  }
  if (remaining) parts.push(remaining)
  return <>{parts}</>
}