/**
 * PMTool · 消息与通知中心 前端服务
 * 2026-09-18 · V1 精简闭环（docs/notification-center-rfc-2026-09-18.md §8）
 *
 * 对应 Rust commands/notification.rs（全部 camelCase 参数）。
 * 数据模型见 app/src/database/schema.ts notificationMessages/Deliveries/Rules/Channels。
 */

import { invoke } from '@tauri-apps/api/core'

// ============================================================
// 消息
// ============================================================

export interface NotificationMessage {
  id: number
  messageId: string
  title: string
  content: string
  eventType: string
  sourceType: string
  sourceId: number | null
  projectId: number | null
  priority: string
  dedupKey: string
  status: 'UNREAD' | 'READ'
  createdAt: string
  readAt: string | null
}

/** 消息列表。filter: 'ALL' | 'UNREAD' | 'READ'；sourceType 可选（'TASK'/'REPORT'/...） */
export async function listMessages(
  filter: 'ALL' | 'UNREAD' | 'READ' = 'ALL',
  sourceType?: string,
  limit = 100,
  offset = 0,
): Promise<NotificationMessage[]> {
  return await invoke<NotificationMessage[]>('notification_list', {
    filter,
    sourceType,
    limit,
    offset,
  })
}

export async function getMessage(id: number): Promise<NotificationMessage | null> {
  return await invoke<NotificationMessage | null>('notification_get', { id })
}

export async function markRead(id: number): Promise<boolean> {
  return await invoke<boolean>('notification_mark_read', { id })
}

export async function markAllRead(): Promise<number> {
  return await invoke<number>('notification_mark_all_read')
}

export async function unreadCount(): Promise<number> {
  return await invoke<number>('notification_unread_count')
}

/** 删除单条消息（连带其派发记录） */
export async function deleteMessage(id: number): Promise<boolean> {
  return await invoke<boolean>('notification_delete', { id })
}

/** 清空已读消息（未读保留） */
export async function clearRead(): Promise<number> {
  return await invoke<number>('notification_clear_read')
}

/** 清空全部消息（含未读 · 调用方需二次确认） */
export async function clearAll(): Promise<number> {
  return await invoke<number>('notification_clear_all')
}

// ============================================================
// 规则
// ============================================================

export interface NotificationRule {
  id: number
  eventType: string
  name: string
  enabled: boolean
  channelIds: string
  priority: string
  builtin: boolean
  createdAt: string
  updatedAt: string
}

/** 列出全部规则（含内置） */
export async function listRules(): Promise<NotificationRule[]> {
  return await invoke<NotificationRule[]>('notification_rule_list')
}

/** 更新规则：启停 / 渠道 / 优先级 */
export async function setRule(
  id: number,
  enabled: boolean,
  channelIds: string[],
  priority?: string,
): Promise<boolean> {
  return await invoke<boolean>('notification_rule_set', {
    id,
    enabled,
    channelIds,
    priority,
  })
}

/** 事件目录元数据 */
export interface RuleMeta {
  eventType: string
  name: string
  builtin: boolean
}

export async function eventCatalog(): Promise<RuleMeta[]> {
  return await invoke<RuleMeta[]>('notification_event_catalog')
}

// ============================================================
// 渠道
// ============================================================

export interface NotificationChannel {
  id: number
  channelType: string
  name: string
  enabled: boolean
  config: string | null
  createdAt: string
  updatedAt: string
}

export async function listChannels(): Promise<NotificationChannel[]> {
  return await invoke<NotificationChannel[]>('notification_channel_list')
}

export async function setChannel(
  id: number,
  enabled: boolean,
  config?: string | null,
): Promise<boolean> {
  return await invoke<boolean>('notification_channel_set', { id, enabled, config })
}

/** 外部渠道配置（非机密部分 · 与 Rust ChannelConfig 字段一一对应） */
export interface ChannelConfig {
  // 邮件 SMTP
  smtpHost?: string
  smtpPort?: number
  /** 'SSL'（465）/ 'STARTTLS'（587）/ 'NONE'（25） */
  encryption?: string
  username?: string
  fromEmail?: string
  fromName?: string
  /** 默认收件人（多个用逗号分隔） */
  recipient?: string
}

/** 保存外部渠道配置；secret 为机密凭证（SMTP 密码/签名密钥），写入 OS 安全存储 */
export async function saveChannel(
  id: number,
  config: ChannelConfig,
  secret?: string,
): Promise<boolean> {
  return await invoke<boolean>('notification_channel_save', {
    id,
    config: JSON.stringify(config),
    secret: secret && secret.length > 0 ? secret : null,
  })
}

/** 该渠道是否已存凭证（不返回凭证内容） */
export async function channelHasSecret(id: number): Promise<boolean> {
  return await invoke<boolean>('notification_channel_has_secret', { id })
}

/** 删除该渠道凭证 */
export async function clearChannelSecret(id: number): Promise<boolean> {
  return await invoke<boolean>('notification_channel_clear_secret', { id })
}

/** 渠道测试发送（真实调用渠道，返回成功提示或错误原因） */
export async function testChannel(id: number): Promise<string> {
  return await invoke<string>('notification_channel_test', { id })
}

// ============================================================
// 派发
// ============================================================

export interface NotificationDelivery {
  id: number
  messageId: number
  channelType: string
  recipient: string | null
  status: 'PENDING' | 'SENT' | 'FAILED' | 'CANCELLED'
  attempt: number
  lastError: string | null
  scheduledAt: string | null
  sentAt: string | null
  createdAt: string
}

export async function listDeliveries(messageId: number): Promise<NotificationDelivery[]> {
  return await invoke<NotificationDelivery[]>('notification_delivery_list', { messageId })
}

export async function retryDelivery(id: number): Promise<boolean> {
  return await invoke<boolean>('notification_delivery_retry', { id })
}

// ============================================================
// 测试 / 深链
// ============================================================

/** 发送一条测试通知（验证链路） */
export async function sendTest(): Promise<number> {
  return await invoke<number>('notification_test')
}

/** 事件类别显示名 */
export async function eventName(eventType: string): Promise<string> {
  return await invoke<string>('notification_event_name', { eventType })
}

/** 深链目标（点击消息跳转用） */
export interface DeepLinkTarget {
  kind: string
  id: number | null
  projectId: number | null
  hash: string
}

export async function deepLink(
  sourceType: string,
  sourceId: number,
  projectId?: number | null,
): Promise<DeepLinkTarget> {
  return await invoke<DeepLinkTarget>('notification_deep_link', {
    sourceType,
    sourceId,
    projectId: projectId ?? null,
  })
}

/**
 * 由消息直接算深链 hash（不 invoke，纯前端；与 Rust deep_link::target_for 逻辑一致）
 * 消息中心点击时前端可直接跳转，无需往返后端。
 */
export function messageHash(msg: NotificationMessage): string {
  switch (msg.sourceType) {
    case 'PROJECT':
      return msg.sourceId ? `#/projectDetail/${msg.sourceId}` : '#/messages'
    case 'TASK':
      // 任务 → 项目 → 计划管理 → 整体计划 → 滚动定位到该任务行
      return msg.projectId
        ? `#/projectDetail/${msg.projectId}?tab=planning&focusTask=${msg.sourceId ?? ''}`
        : '#/projects'
    case 'ISSUE':
      // 风险/问题 → 项目 → 登记册 → 滚动定位到该风险行
      return msg.projectId
        ? `#/projectDetail/${msg.projectId}?tab=registers&focusIssue=${msg.sourceId ?? ''}`
        : '#/projects'
    case 'REPORT':
      return '#/reports'
    default:
      return '#/messages'
  }
}

/** 消息中心显示名 */
export const EVENT_DISPLAY_NAMES: Record<string, string> = {
  TASK_DUE_SOON: '任务即将到期',
  TASK_OVERDUE: '任务逾期',
  TASK_COMPLETED: '任务完成',
  HIGH_RISK_CREATED: '新增高风险',
  REPORT_GENERATED: '报告已生成',
  BACKUP_COMPLETED: '备份完成',
  BACKUP_FAILED: '备份失败',
  SYSTEM_TEST: '系统通知',
}