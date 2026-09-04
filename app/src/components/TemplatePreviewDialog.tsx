/**
 * PMTool V2.0 · 模板预览/填写对话框
 * Phase A · P3 文档/模板中心整改（2026-08-24）
 *
 * 功能：
 *   - 表单输入（按模板字段定义动态渲染）
 *   - Markdown 实时预览（替换占位符）
 *   - 复制到剪贴板（一键）
 *   - 默认值回填（字段定义里的 defaultValue）
 *
 * 设计原则：用户实际工作流
 *   1. 点模板 → 弹窗
 *   2. 填字段 → 实时看右侧预览
 *   3. 满意后点"复制" → 粘到 Word / 邮件 / WPS
 *   4. 关闭弹窗（可下次再填）
 */

import { useEffect, useMemo, useState } from 'react'
import {
  Copy,
  Check,
  X,
} from 'lucide-react'
import {
  renderTemplate,
  getTemplateStats,
  type ProjectDocumentTemplate,
} from '@/services/templates'
import { MarkdownPreview } from './MarkdownPreview'

interface Props {
  template: ProjectDocumentTemplate | null
  onClose: () => void
}

export function TemplatePreviewDialog({ template, onClose }: Props) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [copied, setCopied] = useState(false)

  // 打开模板时，初始化默认值
  useEffect(() => {
    if (!template) return
    const init: Record<string, string> = {}
    for (const f of template.fields) {
      init[f.key] = f.defaultValue ?? ''
    }
    setValues(init)
    setCopied(false)
  }, [template?.id])

  const rendered = useMemo(() => {
    if (!template) return ''
    return renderTemplate(template.template, values)
  }, [template, values])

  const stats = useMemo(() => {
    if (!template) return null
    return getTemplateStats(template, values)
  }, [template, values])

  if (!template) return null

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(rendered)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // 降级：select + execCommand（旧浏览器）
      const ta = document.createElement('textarea')
      ta.value = rendered
      document.body.appendChild(ta)
      ta.select()
      try {
        document.execCommand('copy')
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      } catch {}
      document.body.removeChild(ta)
    }
  }

  return (
    <div
      data-testid="template-dialog"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 200,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '960px',
          height: '80vh',
          maxHeight: '720px',
          background: 'var(--color-surface)',
          borderRadius: 'var(--radius-md)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.16)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* 头部 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '16px 20px',
            borderBottom: '1px solid var(--color-border-thin)',
          }}
        >
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: 'var(--radius)',
              background: 'var(--color-accent-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <template.Icon size={18} strokeWidth={1.75} color="var(--color-accent)" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-text)' }}>
              {template.title}
            </div>
            <div
              style={{
                fontSize: '12px',
                color: 'var(--color-text-tertiary)',
                marginTop: '2px',
              }}
            >
              {template.description}
            </div>
          </div>
          <button
            onClick={onClose}
            data-testid="template-close"
            style={{
              background: 'transparent',
              border: 'none',
              padding: '6px',
              cursor: 'pointer',
              color: 'var(--color-text-tertiary)',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        {/* 主体：左表单 + 右预览 */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* 左：表单 */}
          <div
            data-testid="template-form"
            style={{
              width: '380px',
              flexShrink: 0,
              overflowY: 'auto',
              padding: '16px 20px',
              borderRight: '1px solid var(--color-border-thin)',
            }}
          >
            <div
              style={{
                fontSize: '11px',
                color: 'var(--color-text-tertiary)',
                marginBottom: '12px',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              填写字段
              {stats && (
                <span style={{ marginLeft: '8px', color: 'var(--color-text-secondary)' }}>
                  · 已填 {stats.filled} / {stats.total}
                </span>
              )}
            </div>
            {template.fields.map((field) => (
              <FormField
                key={field.key}
                label={field.label}
                required={!field.defaultValue}
                multiline={field.multiline}
                value={values[field.key] ?? ''}
                placeholder={field.placeholder}
                onChange={(v) =>
                  setValues((prev) => ({ ...prev, [field.key]: v }))
                }
              />
            ))}
          </div>

          {/* 右：预览 */}
          <div
            data-testid="template-preview"
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '20px 28px',
              background: 'var(--color-bg)',
            }}
          >
            <MarkdownPreview markdown={rendered} icon={template.Icon} />
          </div>
        </div>

        {/* 底部：复制按钮 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '8px',
            padding: '12px 20px',
            borderTop: '1px solid var(--color-border-thin)',
            background: 'var(--color-bg-subtle)',
          }}
        >
          {stats && stats.empty > 0 && (
            <span
              style={{
                fontSize: '11px',
                color: 'var(--color-text-tertiary)',
                marginRight: 'auto',
              }}
            >
              还有 {stats.empty} 个占位符未填写（将保留为 {'{{key}}'}）
            </span>
          )}
          <button
            onClick={onClose}
            style={{
              padding: '6px 14px',
              background: 'transparent',
              border: '1px solid var(--color-border-thin)',
              borderRadius: 'var(--radius)',
              fontSize: '12.5px',
              color: 'var(--color-text-secondary)',
              cursor: 'pointer',
            }}
          >
            取消
          </button>
          <button
            data-testid="template-copy"
            onClick={handleCopy}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '6px 14px',
              background: copied ? 'var(--color-status-success)' : 'var(--color-accent)',
              color: 'var(--color-text-on-accent)',
              border: 'none',
              borderRadius: 'var(--radius)',
              fontSize: '12.5px',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'background 0.15s',
            }}
          >
            {copied ? <Check size={13} strokeWidth={2} /> : <Copy size={13} strokeWidth={1.75} />}
            {copied ? '已复制' : '复制到剪贴板'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// 子组件
// ============================================================

function FormField({
  label,
  required,
  multiline,
  value,
  placeholder,
  onChange,
}: {
  label: string
  required: boolean
  multiline?: boolean
  value: string
  placeholder?: string
  onChange: (v: string) => void
}) {
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '6px 10px',
    background: 'var(--color-bg)',
    border: '1px solid var(--color-border-thin)',
    borderRadius: 'var(--radius)',
    fontSize: '13px',
    color: 'var(--color-text)',
    outline: 'none',
    fontFamily: 'var(--font-sans, inherit)',
    boxSizing: 'border-box',
  }
  return (
    <div style={{ marginBottom: '14px' }}>
      <label
        style={{
          display: 'block',
          fontSize: '11px',
          fontWeight: 500,
          color: 'var(--color-text-secondary)',
          marginBottom: '4px',
        }}
      >
        {label}
        {required && (
          <span style={{ color: 'var(--color-status-danger)', marginLeft: '2px' }}>
            *
          </span>
        )}
      </label>
      {multiline ? (
        <textarea
          data-testid={`field-${label}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={4}
          style={{
            ...inputStyle,
            resize: 'vertical',
            minHeight: '80px',
            fontFamily: 'var(--font-mono, monospace)',
          }}
        />
      ) : (
        <input
          data-testid={`field-${label}`}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={inputStyle}
        />
      )}
    </div>
  )
}

