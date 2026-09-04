/**
 * PMTool V2.0 · AI 工作台（不是聊天窗口）
 * Phase A · P4 AI 助手整改（2026-08-24 维护者拍板）
 *
 * 维护者原话：「AI 助手结合实际交付工作，而不是一个聊天窗口。」
 *
 * 设计原则：
 *   - ❌ 不提供自由聊天输入框
 *   - ✅ 4 个结构化 AI 能力卡片 · 每个绑定项目数据
 *   - ✅ 点击 → 选项目 → 生成 Markdown → 复制
 *   - ✅ 输出可保存到 knowledge_notes / 直接粘到 Word
 *
 * 不新增 Rust command · 不引入新表 · Phase 8 接真实 AI 模型时无缝替换
 */

import { useState } from 'react'
import { Sparkles, Clock } from 'lucide-react'
import { AI_CAPABILITIES, type AICapability } from '@/services/aiCapabilities'
import { AICapabilityDialog } from '@/components/AICapabilityDialog'

interface CapabilityMeta {
  used: number
  updated: string
}

const CAPABILITY_META: Record<string, CapabilityMeta> = {
  risk_scan: { used: 0, updated: '基于任务+问题' },
  weekly_report: { used: 0, updated: '基于本周完成' },
  acceptance_review: { used: 0, updated: '基于完成度' },
  handover_doc: { used: 0, updated: '基于项目数据' },
}

export function AIPage() {
  const [activeCapability, setActiveCapability] =
    useState<AICapability | null>(null)

  return (
    <div
      style={{
        padding: '32px 40px',
        maxWidth: '1280px',
        height: '100%',
        overflow: 'auto',
      }}
    >
      {/* 顶部：标题 + 说明 */}
      <div style={{ marginBottom: '24px' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '8px',
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
            <Sparkles size={16} strokeWidth={1.75} color="var(--color-accent)" />
          </div>
          <h1
            style={{
              fontSize: '22px',
              fontWeight: 600,
              letterSpacing: '-0.01em',
              margin: 0,
            }}
          >
            AI 工作台
          </h1>
        </div>
        <p
          style={{
            fontSize: '13px',
            color: 'var(--color-text-secondary)',
            maxWidth: '640px',
          }}
        >
          基于 PMTool 项目数据自动生成文档 · 每个能力都绑定具体项目数据源 ·
          点击能力卡片 → 选择项目 → 生成 Markdown → 可复制或保存
        </p>
      </div>

      {/* AI 能力卡片网格 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '12px',
          marginBottom: '24px',
        }}
      >
        {AI_CAPABILITIES.map((cap) => (
          <AICapabilityCard
            key={cap.id}
            capability={cap}
            meta={CAPABILITY_META[cap.id] ?? { used: 0, updated: '' }}
            onOpen={() => setActiveCapability(cap)}
          />
        ))}
      </div>

      {/* AI 助手说明区 */}
      <div
        style={{
          padding: '16px 20px',
          background: 'var(--color-accent-subtle)',
          borderRadius: 'var(--radius-md)',
          fontSize: '12px',
          color: 'var(--color-text-secondary)',
          lineHeight: 1.7,
        }}
      >
        <div style={{ fontWeight: 500, color: 'var(--color-text)', marginBottom: '6px' }}>
          💡 设计说明
        </div>
        <div>
          · 当前为 Phase 4 占位版：使用真实项目数据 + 模板生成 · 不依赖外部 AI 模型
          <br />
          · Phase 8 将接入真实 AI 模型（OpenAI / Claude / DeepSeek 等）·
          无缝替换当前模板生成逻辑
          <br />
          · 输出内容可直接复制到 Word / 邮件 / WPS · 也可保存到知识库归档
        </div>
      </div>

      {/* 能力执行对话框 */}
      <AICapabilityDialog
        capability={activeCapability}
        onClose={() => setActiveCapability(null)}
      />
    </div>
  )
}

function AICapabilityCard({
  capability,
  meta,
  onOpen,
}: {
  capability: AICapability
  meta: CapabilityMeta
  onOpen: () => void
}) {
  const { Icon, title, description } = capability
  return (
    <button
      data-testid={`ai-capability-${capability.id}`}
      onClick={onOpen}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: '12px',
        padding: '16px 18px',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border-thin)',
        borderRadius: 'var(--radius-md)',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'border-color 0.12s, transform 0.12s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--color-accent)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--color-border-thin)'
      }}
    >
      {/* 图标 + 标题 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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
        <div
          style={{
            fontSize: '13.5px',
            fontWeight: 500,
            color: 'var(--color-text)',
          }}
        >
          {title}
        </div>
      </div>

      {/* 描述 */}
      <p
        style={{
          fontSize: '12px',
          color: 'var(--color-text-secondary)',
          lineHeight: 1.5,
          margin: 0,
          minHeight: '32px',
        }}
      >
        {description}
      </p>

      {/* 元数据：数据源 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: '11px',
          color: 'var(--color-text-tertiary)',
          paddingTop: '8px',
          borderTop: '1px solid var(--color-border-thin)',
          width: '100%',
        }}
      >
        <Clock size={10} strokeWidth={1.75} />
        {meta.updated}
      </div>
    </button>
  )
}