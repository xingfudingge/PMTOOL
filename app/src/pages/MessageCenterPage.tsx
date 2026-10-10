/**
 * PMTool V2.0 · 消息中心
 * 2026-09-18 · V1 精简闭环（docs/notification-center-rfc-2026-09-18.md §十九/二十）
 *
 * 设计：
 *   - 顶部 tab：全部 / 未读 / 任务 / 项目 / 报告 / AI / 系统
 *   - 消息列表：标题 + 内容 + 事件名 + 时间 + 已读状态 + 深链跳转
 *   - 点击消息 → 标记已读 → 跳转对应页面（messageHash）
 *   - 顶栏「全部已读」操作
 *
 * 数据源：services/notification.ts（invoke → Rust notification_*）
 */

import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { Bell, CheckCheck, Inbox, ExternalLink, Trash2, Eraser } from 'lucide-react'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import {
  listMessages,
  markRead,
  markAllRead,
  deleteMessage,
  clearRead,
  messageHash,
  EVENT_DISPLAY_NAMES,
  type NotificationMessage,
} from '@/services/notification'

type TabKey = 'ALL' | 'UNREAD' | 'TASK' | 'PROJECT' | 'REPORT' | 'SYSTEM'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'ALL', label: '全部' },
  { key: 'UNREAD', label: '未读' },
  { key: 'TASK', label: '任务' },
  { key: 'PROJECT', label: '项目' },
  { key: 'REPORT', label: '报告' },
  { key: 'SYSTEM', label: '系统' },
]

function fmtTime(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const sameYear = d.getFullYear() === now.getFullYear()
  if (sameDay) return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  if (sameYear) return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
  return d.toLocaleDateString('zh-CN')
}

function priorityColor(p: string): string {
  switch (p) {
    case 'CRITICAL':
      return 'var(--danger, #dc2626)'
    case 'HIGH':
      return 'var(--warning, #d97706)'
    case 'LOW':
      return 'var(--color-text-tertiary)'
    default:
      return 'var(--color-text-secondary)'
  }
}

function sourceBadgeLabel(src: string): string {
  switch (src) {
    case 'TASK':
      return '任务'
    case 'PROJECT':
      return '项目'
    case 'REPORT':
      return '报告'
    case 'ISSUE':
      return '风险'
    case 'BACKUP':
      return '备份'
    case 'AI':
      return 'AI'
    default:
      return '系统'
  }
}

export function MessageCenterPage() {
  const [tab, setTab] = useState<TabKey>('ALL')
  const [messages, setMessages] = useState<NotificationMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 删除类操作一律二次确认（产品铁律）
  const [pendingDelete, setPendingDelete] = useState<NotificationMessage | null>(null)
  const [pendingClearRead, setPendingClearRead] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const loadSeq = useRef(0)
  const load = useCallback(async (active: TabKey) => {
    const seq = ++loadSeq.current
    setLoading(true)
    setError(null)
    try {
      const isUnread = active === 'UNREAD'
      const src =
        active === 'ALL' || active === 'UNREAD' ? undefined : active
      const data = await listMessages(
        isUnread ? 'UNREAD' : 'ALL',
        src,
        200,
        0,
      )
      // 丢弃过期响应：快速切换 tab 时旧请求的返回不得覆盖当前 tab
      if (seq === loadSeq.current) setMessages(data)
    } catch (e) {
      if (seq === loadSeq.current) setError(String(e))
    } finally {
      if (seq === loadSeq.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load(tab)
  }, [tab, load])

  const unreadCount = useMemo(
    () => messages.filter((m) => m.status === 'UNREAD').length,
    [messages],
  )

  const handleOpen = async (m: NotificationMessage) => {
    if (m.status === 'UNREAD') {
      try {
        await markRead(m.id)
        setMessages((prev) =>
          prev.map((x) => (x.id === m.id ? { ...x, status: 'READ' as const, readAt: new Date().toISOString() } : x)),
        )
      } catch {
        // 标记失败不阻塞跳转
      }
    }
    window.location.hash = messageHash(m)
  }

  const handleMarkAll = async () => {
    try {
      await markAllRead()
      setMessages((prev) => prev.map((x) => ({ ...x, status: 'READ' as const, readAt: x.readAt ?? new Date().toISOString() })))
    } catch (e) {
      setError(String(e))
    }
  }

  /** 删除单条消息：先弹二次确认（产品铁律：删除不可直接执行） */
  const handleDelete = (e: React.MouseEvent, m: NotificationMessage) => {
    e.stopPropagation() // 不要触发「打开消息」
    setPendingDelete(m)
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      await deleteMessage(pendingDelete.id)
      setMessages((prev) => prev.filter((x) => x.id !== pendingDelete.id))
    } catch (err) {
      setError(String(err))
    } finally {
      setDeleting(false)
      setPendingDelete(null)
    }
  }

  /** 清空已读消息：先弹二次确认（产品铁律：删除不可直接执行） */
  const handleClearRead = () => setPendingClearRead(true)

  const confirmClearRead = async () => {
    setDeleting(true)
    try {
      await clearRead()
      setMessages((prev) => prev.filter((x) => x.status === 'UNREAD'))
    } catch (e) {
      setError(String(e))
    } finally {
      setDeleting(false)
      setPendingClearRead(false)
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--color-bg)',
      }}
    >
      {/* 顶栏：标题 + 全部已读 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 20px',
          borderBottom: '1px solid var(--color-border-thin)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Bell size={16} strokeWidth={1.75} />
          <h1 style={{ fontSize: '15px', fontWeight: 600, margin: 0 }}>消息中心</h1>
          {unreadCount > 0 && (
            <span
              style={{
                background: 'var(--accent, #2563eb)',
                color: '#fff',
                fontSize: '11px',
                fontWeight: 600,
                borderRadius: '999px',
                padding: '1px 8px',
              }}
            >
              {unreadCount}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            onClick={handleClearRead}
            data-testid="msg-clear-read"
            title="清空已读消息"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              padding: '5px 10px',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--color-text-secondary)',
              background: 'transparent',
              cursor: 'pointer',
            }}
          >
            <Eraser size={13} strokeWidth={1.75} />
            清空已读
          </button>
          <button
            onClick={handleMarkAll}
            data-testid="msg-mark-all"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              padding: '5px 10px',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--color-text-secondary)',
              background: 'transparent',
              cursor: 'pointer',
            }}
          >
            <CheckCheck size={13} strokeWidth={1.75} />
            全部已读
          </button>
        </div>
      </div>

      {/* tab 栏 */}
      <div
        style={{
          display: 'flex',
          gap: '4px',
          padding: '8px 16px',
          borderBottom: '1px solid var(--color-border-thin)',
          overflowX: 'auto',
        }}
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            data-testid={`msg-tab-${t.key}`}
            onClick={() => setTab(t.key)}
            style={{
              padding: '4px 12px',
              borderRadius: '999px',
              fontSize: '12.5px',
              fontWeight: tab === t.key ? 500 : 400,
              color:
                tab === t.key ? 'var(--color-text)' : 'var(--color-text-secondary)',
              background:
                tab === t.key ? 'var(--color-bg-active)' : 'transparent',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 列表 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px 24px' }}>
        {loading && (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: '13px' }}>
            加载中…
          </div>
        )}
        {error && (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--danger, #dc2626)', fontSize: '13px' }}>
            {error}
          </div>
        )}
        {!loading && !error && messages.length === 0 && (
          <div
            style={{
              padding: '48px 20px',
              textAlign: 'center',
              color: 'var(--color-text-tertiary)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <Inbox size={28} strokeWidth={1.25} />
            <div style={{ fontSize: '13px' }}>暂无消息</div>
          </div>
        )}
        {messages.map((m) => {
          const unread = m.status === 'UNREAD'
          return (
            <div
              key={m.id}
              data-testid="msg-item"
              onClick={() => handleOpen(m)}
              style={{
                display: 'flex',
                gap: '10px',
                alignItems: 'flex-start',
                padding: '12px 12px',
                borderRadius: 'var(--radius)',
                cursor: 'pointer',
                background: unread ? 'var(--color-bg-subtle)' : 'transparent',
                borderLeft: `3px solid ${unread ? priorityColor(m.priority) : 'transparent'}`,
                marginBottom: '2px',
              }}
              onMouseEnter={(e) => {
                if (!unread) e.currentTarget.style.background = 'var(--color-bg-hover)'
              }}
              onMouseLeave={(e) => {
                if (!unread) e.currentTarget.style.background = 'transparent'
              }}
            >
              {/* 未读点 */}
              <span
                style={{
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  background: unread ? 'var(--accent, #2563eb)' : 'transparent',
                  marginTop: '5px',
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span
                    style={{
                      fontSize: '10.5px',
                      fontWeight: 500,
                      color: priorityColor(m.priority),
                      background: 'var(--color-bg-subtle)',
                      borderRadius: '4px',
                      padding: '1px 6px',
                    }}
                  >
                    {EVENT_DISPLAY_NAMES[m.eventType] ?? m.eventType}
                  </span>
                  <span
                    style={{
                      fontSize: '10.5px',
                      color: 'var(--color-text-tertiary)',
                    }}
                  >
                    {sourceBadgeLabel(m.sourceType)}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: '13.5px',
                    fontWeight: unread ? 600 : 500,
                    color: 'var(--color-text)',
                    marginTop: '4px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {m.title}
                </div>
                <div
                  style={{
                    fontSize: '12.5px',
                    color: 'var(--color-text-secondary)',
                    marginTop: '2px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {m.content}
                </div>
              </div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-end',
                  gap: '4px',
                  flexShrink: 0,
                }}
              >
                <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
                  {fmtTime(m.createdAt)}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <ExternalLink size={12} strokeWidth={1.5} color="var(--color-text-tertiary)" />
                  <button
                    onClick={(e) => handleDelete(e, m)}
                    data-testid="msg-delete"
                    title="删除这条消息"
                    aria-label="删除这条消息"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '20px',
                      height: '20px',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--color-text-tertiary)',
                      background: 'transparent',
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--color-bg-hover)'
                      e.currentTarget.style.color = 'var(--danger, #dc2626)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent'
                      e.currentTarget.style.color = 'var(--color-text-tertiary)'
                    }}
                  >
                    <Trash2 size={12} strokeWidth={1.75} />
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* 删除确认（产品铁律：所有删除必须二次确认，不可直接执行） */}
      <ConfirmDialog
        open={pendingDelete !== null}
        title="删除消息"
        message={
          <>
            确定要删除「<strong>{pendingDelete?.title}</strong>」？该操作不可撤销。
          </>
        }
        busy={deleting}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => void confirmDelete()}
      />
      <ConfirmDialog
        open={pendingClearRead}
        title="清空已读消息"
        message="确定要清空全部已读消息？该操作不可撤销。"
        confirmText="清空"
        busy={deleting}
        onCancel={() => setPendingClearRead(false)}
        onConfirm={() => void confirmClearRead()}
      />
    </div>
  )
}

export default MessageCenterPage