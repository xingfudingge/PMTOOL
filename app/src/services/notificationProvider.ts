/**
 * PMTool V2.0 · Notification Provider 抽象接口
 * Phase 3 收尾（按维护者 T3.6 决策 2 调整）
 *
 * 设计依据：V8/RFC/07-email-reminder.md
 *   - Phase 3 仅设计抽象接口 + NoOpProvider（不接 SMTP）
 *   - Phase 9 设置中心统一实接 SMTP
 *
 * 接口设计（维护者决策）：
 *   NotificationProvider
 *     ├── EmailProvider（Phase 9 实现）
 *     ├── SystemNotificationProvider（Phase 9 实现）
 *     └── FutureProvider
 *
 * 提醒策略：
 *   - 到期当天：08:00 提醒
 *   - 逾期：每天 08:00 提醒
 *   - 高优先级：提前 N 天提醒
 *
 * 幂等键（RFC-03 §3）：
 *   job_type + business_period + target_id
 */

export type NotificationChannel = 'EMAIL' | 'SYSTEM' | 'PUSH'

export interface NotificationPayload {
  /** 通知 ID（同 Todo ID 或业务 ID）*/
  targetId: number
  /** 通知类型 */
  jobType: 'TODO_REMINDER' | 'PROJECT_DEADLINE' | 'LICENSE_EXPIRY'
  /** 业务周期（如 '2026-08-22-0800'）*/
  businessPeriod: string
  /** 通知标题 */
  title: string
  /** 通知内容 */
  body: string
  /** 接收人邮箱（如 'user@example.com'）*/
  recipient?: string
}

export interface NotificationResult {
  success: boolean
  channel: NotificationChannel
  error?: string
  /** 实际发送时间戳 */
  sentAt: string
}

/**
 * NotificationProvider 抽象接口
 */
export interface NotificationProvider {
  /** Provider 名称（EmailProvider / SystemNotificationProvider / NoOpProvider）*/
  readonly name: NotificationChannel
  /** Provider 是否可用（如 SMTP 已配置 + 网络可达）*/
  isAvailable(): Promise<boolean>
  /** 发送通知 */
  send(payload: NotificationPayload): Promise<NotificationResult>
}

/**
 * NoOpProvider（Phase 3 默认）
 * 不实际发送，仅记录到 audit_logs（如未来需要）
 */
export class NoOpProvider implements NotificationProvider {
  readonly name: NotificationChannel = 'EMAIL' // 占位

  async isAvailable(): Promise<boolean> {
    return false // Phase 3 SMTP 不可用
  }

  async send(payload: NotificationPayload): Promise<NotificationResult> {
    console.warn(
      `[Notification] NoOpProvider: would send "${payload.title}" to ${payload.recipient ?? '(no recipient)'}`,
    )
    return {
      success: false,
      channel: 'EMAIL',
      error: 'SMTP 未配置（Phase 9 实施）',
      sentAt: new Date().toISOString(),
    }
  }
}

/**
 * 通知执行器（ReminderExecutor）
 * 根据 system_config.todo_auto_postpone + reminder 配置决定是否触发
 * Phase 3 简化版：仅 NoOp
 */
export class ReminderExecutor {
  private provider: NotificationProvider
  private sentCache = new Set<string>() // 幂等键缓存（防止重复）

  constructor(provider: NotificationProvider = defaultNotificationProvider) {
    this.provider = provider
  }

  /**
   * 执行单条提醒
   * @returns 实际发送结果（Phase 3 永远返回 success=false + error='SMTP 未配置'）
   */
  async executeReminder(payload: NotificationPayload): Promise<NotificationResult> {
    // 幂等检查（RFC-03 §3）
    const idempotencyKey = `${payload.jobType}|${payload.businessPeriod}|${payload.targetId}`
    if (this.sentCache.has(idempotencyKey)) {
      return {
        success: true,
        channel: 'EMAIL',
        error: '幂等命中（已发送）',
        sentAt: new Date().toISOString(),
      }
    }

    // 检查 Provider 是否可用
    const available = await this.provider.isAvailable()
    if (!available) {
      return await this.provider.send(payload) // 返回 NoOp 结果
    }

    // 实际发送（Phase 9 实施）
    const result = await this.provider.send(payload)
    if (result.success) {
      this.sentCache.add(idempotencyKey)
    }
    return result
  }
}

/**
 * 默认 Provider（NoOp · Phase 3 不接 SMTP）
 * Phase 9 替换为 EmailProvider（实现 SMTP 客户端）
 */
export const defaultNotificationProvider: NotificationProvider = new NoOpProvider()

/**
 * 便捷函数：Phase 3 提醒执行
 */
export async function executeTodoReminder(
  todoId: number,
  title: string,
  dueDate: string,
  reason: 'DUE_TODAY' | 'OVERDUE' | 'HIGH_PRIORITY',
): Promise<NotificationResult> {
  const now = new Date()
  const businessPeriod = `${dueDate}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
  const executor = new ReminderExecutor()
  return executor.executeReminder({
    targetId: todoId,
    jobType: 'TODO_REMINDER',
    businessPeriod,
    title,
    body: `待办「${title}」${reason === 'DUE_TODAY' ? '今天到期' : reason === 'OVERDUE' ? '已逾期' : '即将到期'}`,
  })
}