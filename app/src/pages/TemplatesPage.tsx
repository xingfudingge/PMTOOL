/**
 * PMTool V2.0 · 模板中心
 * Phase A 产品结构纠偏（2026-08-24 · 维护者拍板）
 *
 * 设计依据（维护者 P3 7 类文档）：
 *   1. 需求确认单
 *   2. 需求规格说明书
 *   3. 项目计划
 *   4. 启动会 PPT
 *   5. 培训资料
 *   6. 验收单
 *   7. 转客服运维单
 *
 * 整改核心：让模板中心真正可用
 *   - 7 套完整 Markdown 模板（含字段定义 + 渲染函数）
 *   - 点击模板 → 填写表单 → 实时预览 → 一键复制
 *   - 模板定义在 services/templates.ts · 不在本页面
 *
 * 风格延续：CSS 变量 + Lucide + 卡片化
 */

import { useState } from 'react'
import { Sparkles, Clock } from 'lucide-react'
import {
  DOCUMENT_TEMPLATES,
  type ProjectDocumentTemplate,
} from '@/services/templates'
import { TemplatePreviewDialog } from '@/components/TemplatePreviewDialog'

// 5 类文档的描述已从 services/templates.ts 拿（数据与展示分离）
// 保留 metadata only 用于列表展示
interface TemplateMeta {
  used: number
  updated: string
}

const TEMPLATE_META: Record<string, TemplateMeta> = {
  requirement: { used: 0, updated: '按需生成' },
  plan: { used: 0, updated: '按需生成' },
  training: { used: 0, updated: '按需生成' },
  acceptance: { used: 0, updated: '按需生成' },
  handover: { used: 0, updated: '按需生成' },
}

export function TemplatesPage() {
  const [activeTemplate, setActiveTemplate] =
    useState<ProjectDocumentTemplate | null>(null)

  return (
    <div
      style={{
        padding: '32px 40px',
        maxWidth: '1280px',
        height: '100%',
        overflow: 'auto',
      }}
    >
      <div style={{ marginBottom: '24px' }}>
        <h1
          style={{
            fontSize: '24px',
            fontWeight: 600,
            letterSpacing: '-0.01em',
            margin: 0,
            marginBottom: '4px',
          }}
        >
          模板中心
        </h1>
        <p
          style={{
            fontSize: '13px',
            color: 'var(--color-text-secondary)',
          }}
        >
          7 类项目交付文档模板 · 实施交付全流程 · 点击填写字段 · 实时预览 · 一键复制
        </p>
      </div>

      {/* 模板卡片 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: '12px',
        }}
      >
        {DOCUMENT_TEMPLATES.map((t) => (
          <TemplateCard
            key={t.id}
            template={t}
            meta={TEMPLATE_META[t.id] ?? { used: 0, updated: '' }}
            onOpen={() => setActiveTemplate(t)}
          />
        ))}
      </div>

      {/* AI 优化入口 */}
      <div
        style={{
          marginTop: '24px',
          padding: '16px 20px',
          background: 'var(--color-accent-subtle)',
          borderRadius: 'var(--radius-md)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}
      >
        <Sparkles size={16} strokeWidth={1.75} color="var(--color-accent)" />
        <div style={{ flex: 1, fontSize: '13px' }}>
          <span style={{ color: 'var(--color-text)', fontWeight: 500 }}>AI 模板优化 · </span>
          <span style={{ color: 'var(--color-text-secondary)' }}>
            上传你的模板，AI 帮你提炼为可复用结构
          </span>
        </div>
      </div>

      {/* 模板预览/填写对话框 */}
      <TemplatePreviewDialog
        template={activeTemplate}
        onClose={() => setActiveTemplate(null)}
      />
    </div>
  )
}

function TemplateCard({
  template,
  meta,
  onOpen,
}: {
  template: ProjectDocumentTemplate
  meta: TemplateMeta
  onOpen: () => void
}) {
  const { Icon, title, description, fields } = template
  return (
    <div
      data-testid={`template-${template.id}`}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onOpen()
      }}
      style={{
        padding: '16px 18px',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border-thin)',
        borderRadius: 'var(--radius-md)',
        cursor: 'pointer',
        transition: 'border-color 0.12s, transform 0.12s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--color-accent)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--color-border-thin)'
      }}
    >
      {/* 顶部：图标 + 标题 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          marginBottom: '10px',
        }}
      >
        <div
          style={{
            width: '32px',
            height: '32px',
            borderRadius: 'var(--radius)',
            background: 'var(--color-accent-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon size={16} strokeWidth={1.75} color="var(--color-accent)" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: '13.5px',
              fontWeight: 500,
              color: 'var(--color-text)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {title}
          </div>
        </div>
      </div>

      {/* 描述 */}
      <p
        style={{
          fontSize: '12px',
          color: 'var(--color-text-secondary)',
          lineHeight: 1.5,
          marginBottom: '12px',
          minHeight: '32px',
        }}
      >
        {description}
      </p>

      {/* 元数据：字段数 + 提示 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          fontSize: '11px',
          color: 'var(--color-text-tertiary)',
          paddingTop: '10px',
          borderTop: '1px solid var(--color-border-thin)',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
          字段{' '}
          <span
            style={{
              color: 'var(--color-text-secondary)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {fields.length}
          </span>{' '}
          个
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
          <Clock size={10} strokeWidth={1.75} />
          {meta.updated}
        </span>
      </div>
    </div>
  )
}