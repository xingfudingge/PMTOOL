# PMTool V2.0 · 邮件提醒系统 RFC（07）

> 状态：实施基线 · 2026-08-22 · Phase 3 T3.4 / T3.5
> 目的：定义 Todo 邮件提醒策略、配置接口、SMTP 集成方式（本期不接 SMTP）。

---

## 1. 提醒策略（RFC-02 §5）

| 触发条件 | 时间 | 默认 |
|---|---|---|
| **到期当天** | 08:00 提醒 | ✅ |
| **逾期** | 每天 08:00 提醒 | ✅ |
| **高优先级**（priority = HIGH/URGENT） | 提前 `high_priority_remind_days` 天 | 默认 1 天 |

**RFC-02 §6 验收样例**：
```
验收 #1：周五未完成 → 自动顺延到下一工作日（Phase 3 T3.4 实现）
验收 #3：节假日前一天不触发高优先级提前提醒（节假日跳过）
```

## 2. system_config 配置字段（无 schema 变更）

| config_key | 默认值 | 说明 |
|---|---|---|
| `todo_auto_postpone` | `1` | 自动顺延开关（0/1）|
| `todo_remind_time` | `08:00` | 邮件提醒时间（HH:MM）|
| `high_priority_remind_days` | `1` | 高优先级提前天数 |
| `smtp_host` | `''` | SMTP 服务器 |
| `smtp_port` | `587` | SMTP 端口 |
| `smtp_user` | `''` | SMTP 用户名 |
| `smtp_sender_email` | `''` | 发件人邮箱 |
| **smtp_password** | _系统钥匙串_ | **不在 SQLite**（RFC-03 §4）|

## 3. 不接 SMTP（Phase 3 限制）

**本期（Phase 3）实现**：
- 提醒策略代码（本地检测到期/逾期）
- system_config 字段定义
- LocalReminderExecutor 接口（仅写入 audit_logs，不发邮件）

**本期不实现**：
- 真实 SMTP 连接（RFC-03 §3 留给 Phase 9 设置中心）
- 邮件历史表（待 Phase 5 报告中心决定是否独立）

**LocalReminderExecutor**（Phase 3）：
```typescript
export interface ReminderRecord {
  todoId: number
  scheduledAt: string  // UTC ISO
  reason: 'DUE_TODAY' | 'OVERDUE' | 'HIGH_PRIORITY'
  executed: boolean   // Phase 3 永远 true（本地已记录）
  error?: string
}

export async function executeReminders(): Promise<ReminderRecord[]>
```

## 4. 幂等键（RFC-03 §3）

每次提醒执行使用：
```
job_type = 'TODO_REMINDER'
business_period = 'YYYY-MM-DD-HHMM'
target_id = todo.id
```

确保同一天同一任务不会重复提醒。

## 5. PM 决策关联

- **PM A1**：邮件配置字段属于 system_config 表（16 张核心表之一）
- **PM B1**：所有提醒操作通过 commands::todos 业务命名
- **PM C1**：7 项门禁严格执行

---

**版本**：2026-08-22（Phase 3 邮件提醒设计基线）
**下一阶段**：Phase 9 设置中心实接 SMTP