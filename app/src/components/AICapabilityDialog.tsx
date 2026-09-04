/**
 * PMTool V2.0 · AI 工作台能力执行对话框
 * Phase A · P4 AI 助手整改（2026-08-24）
 *
 * 功能：
 *   - 项目选择器（所有 AI 能力都基于项目数据）
 *   - 执行按钮（调 executeCapability）
 *   - Markdown 输出预览
 *   - 复制到剪贴板
 *
 * 维护者原话：「AI 助手结合实际交付工作，而不是一个聊天窗口。」
 * 设计上不提供自由输入框 · 每个能力都是结构化输出
 */

import { useEffect, useState } from 'react'
import {
  Copy,
  Check,
  X,
  Sparkles,
  ChevronDown,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import {
  executeCapability,
  loadAvailableProjects,
  type AICapability,
  type AIOutput,
} from '@/services/aiCapabilities'
import { MarkdownPreview } from './MarkdownPreview'

interface Props {
  capability: AICapability | null
  onClose: () => void
}

export function AICapabilityDialog({ capability, onClose }: Props) {
  const [projects, setProjects] = useState<
    Array<{ id: number; label: string }>
  >([])
  const [projectId, setProjectId] = useState<number | null>(null)
  const [projectPickerOpen, setProjectPickerOpen] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [output, setOutput] = useState<AIOutput | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // 打开对话框时加载项目列表
  useEffect(() => {
    if (!capability) return
    setOutput(null)
    setError(null)
    setProjectId(null)
    loadAvailableProjects()
      .then((list) => {
        setProjects(
          list.map((p) => ({
            id: p.id,
            label: `${p.project_name} · ${p.customer_name ?? '未指定'}`,
          })),
        )
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : String(e)),
      )
  }, [capability?.id])

  if (!capability) return null

  const handleExecute = async () => {
    if (!projectId || executing) return
    setExecuting(true)
    setError(null)
    setOutput(null)
    try {
      const result = await executeCapability(capability.id, projectId)
      setOutput(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setExecuting(false)
    }
  }

  const handleCopy = async () => {
    if (!output) return
    try {
      await navigator.clipboard.writeText(output.markdown)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = output.markdown
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

  const selectedProject = projects.find((p) => p.id === projectId)

  return (
    <div
      data-testid="ai-dialog"
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
          width: '880px',
          height: '80vh',
          maxHeight: '680px',
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
            <capability.Icon size={18} strokeWidth={1.75} color="var(--color-accent)" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--color-text)' }}>
              {capability.title}
            </div>
            <div
              style={{
                fontSize: '12px',
                color: 'var(--color-text-tertiary)',
                marginTop: '2px',
              }}
            >
              {capability.description}
            </div>
          </div>
          <button
            onClick={onClose}
            data-testid="ai-close"
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

        {/* 项目选择 + 执行 */}
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid var(--color-border-thin)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <span
            style={{
              fontSize: '12px',
              color: 'var(--color-text-tertiary)',
              flexShrink: 0,
            }}
          >
            选择项目
          </span>

          <div style={{ position: 'relative', flex: 1, maxWidth: '480px' }}>
            <button
              data-testid="ai-project-select"
              onClick={() => setProjectPickerOpen(!projectPickerOpen)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 12px',
                background: 'var(--color-bg)',
                border: '1px solid var(--color-border-thin)',
                borderRadius: 'var(--radius)',
                fontSize: '13px',
                color: selectedProject ? 'var(--color-text)' : 'var(--color-text-tertiary)',
                cursor: 'pointer',
              }}
            >
              <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {selectedProject ? selectedProject.label : '点击选择项目...'}
              </span>
              <ChevronDown size={14} strokeWidth={1.75} />
            </button>
            {projectPickerOpen && (
              <div
                data-testid="ai-project-dropdown"
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  marginTop: '4px',
                  maxHeight: '240px',
                  overflowY: 'auto',
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border-thin)',
                  borderRadius: 'var(--radius)',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
                  zIndex: 10,
                }}
              >
                {projects.length === 0 ? (
                  <div
                    style={{
                      padding: '12px',
                      fontSize: '12px',
                      color: 'var(--color-text-tertiary)',
                      textAlign: 'center',
                    }}
                  >
                    暂无项目
                  </div>
                ) : (
                  projects.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setProjectId(p.id)
                        setProjectPickerOpen(false)
                      }}
                      data-testid={`ai-project-option-${p.id}`}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '8px 12px',
                        background: projectId === p.id ? 'var(--color-bg-active)' : 'transparent',
                        border: 'none',
                        fontSize: '13px',
                        color: 'var(--color-text)',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(e) => {
                        if (projectId !== p.id) {
                          ;(e.currentTarget as HTMLButtonElement).style.background =
                            'var(--color-bg-hover)'
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (projectId !== p.id) {
                          ;(e.currentTarget as HTMLButtonElement).style.background =
                            'transparent'
                        }
                      }}
                    >
                      {p.label}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <button
            data-testid="ai-execute"
            onClick={handleExecute}
            disabled={!projectId || executing}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '6px 14px',
              background: 'var(--color-accent)',
              color: 'var(--color-text-on-accent)',
              border: 'none',
              borderRadius: 'var(--radius)',
              fontSize: '12.5px',
              fontWeight: 500,
              cursor: projectId && !executing ? 'pointer' : 'not-allowed',
              opacity: projectId && !executing ? 1 : 0.5,
              transition: 'opacity 0.15s',
            }}
          >
            {executing ? (
              <>
                <Loader2
                  size={13}
                  strokeWidth={2}
                  style={{ animation: 'spin 1s linear infinite' }}
                />
                生成中...
              </>
            ) : (
              <>
                <Sparkles size={13} strokeWidth={1.75} />
                生成
              </>
            )}
          </button>
        </div>

        {/* 输出区 */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px 28px',
            background: 'var(--color-bg)',
          }}
        >
          {error && (
            <div
              data-testid="ai-error"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 14px',
                background: 'var(--color-bg-subtle)',
                border: '1px solid var(--color-status-danger)',
                borderRadius: 'var(--radius)',
                color: 'var(--color-status-danger)',
                fontSize: '13px',
              }}
            >
              <AlertCircle size={14} strokeWidth={1.75} />
              {error}
            </div>
          )}

          {!output && !error && !executing && (
            <EmptyHint />
          )}

          {output && (
            <div data-testid="ai-output">
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '12px',
                }}
              >
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text)' }}>
                    {output.title}
                  </div>
                  <div
                    style={{
                      fontSize: '11px',
                      color: 'var(--color-text-tertiary)',
                      marginTop: '2px',
                    }}
                  >
                    生成时间：{new Date(output.generatedAt).toLocaleString('zh-CN')}
                  </div>
                </div>
                <button
                  data-testid="ai-copy"
                  onClick={handleCopy}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 12px',
                    background: copied ? 'var(--color-status-success)' : 'var(--color-surface)',
                    border: '1px solid var(--color-border-thin)',
                    borderRadius: 'var(--radius)',
                    fontSize: '12px',
                    color: copied ? 'var(--color-text-on-accent)' : 'var(--color-text-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  {copied ? <Check size={12} strokeWidth={2} /> : <Copy size={12} strokeWidth={1.75} />}
                  {copied ? '已复制' : '复制到剪贴板'}
                </button>
              </div>
              <div
                style={{
                  padding: '16px 20px',
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border-thin)',
                  borderRadius: 'var(--radius)',
                }}
              >
                <MarkdownPreview markdown={output.markdown} />
              </div>
            </div>
          )}
        </div>

        {/* 底部 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 20px',
            borderTop: '1px solid var(--color-border-thin)',
            background: 'var(--color-bg-subtle)',
            fontSize: '11px',
            color: 'var(--color-text-tertiary)',
          }}
        >
          <span>
            基于 PMTool 实际项目数据生成 · 适合直接复制到 Word / 邮件
          </span>
          <button
            onClick={onClose}
            style={{
              padding: '5px 14px',
              background: 'transparent',
              border: '1px solid var(--color-border-thin)',
              borderRadius: 'var(--radius)',
              fontSize: '12px',
              color: 'var(--color-text-secondary)',
              cursor: 'pointer',
            }}
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}

function EmptyHint() {
  return (
    <div
      data-testid="ai-empty"
      style={{
        padding: '60px 20px',
        textAlign: 'center',
        color: 'var(--color-text-tertiary)',
      }}
    >
      <Sparkles
        size={32}
        strokeWidth={1.25}
        color="var(--color-text-tertiary)"
        style={{ margin: '0 auto 12px' }}
      />
      <div style={{ fontSize: '13px', marginBottom: '4px' }}>
        选择项目后点击「生成」
      </div>
      <div style={{ fontSize: '12px', opacity: 0.7 }}>
        AI 会自动聚合项目任务 / 问题 / 截止日期等数据
      </div>
    </div>
  )
}