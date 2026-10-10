/**
 * PMTool V2.0 · Drizzle ORM TypeScript 类型层
 * Phase 0 · T0.4 / T0.4e
 *
 * 设计依据：RFC-01 + RFC-03 §1 + PM 决策 A1
 *   - 16 张核心表（schema.sql 权威源）
 *   - 表结构 1:1 对应 database/schema.sql
 *   - 字段名/枚举严格对齐 Rust 端 repository struct
 *
 * 用途：
 *   - TypeScript 类型层（编译期类型校验）
 *   - drizzle-kit migration 生成（按列定义 → SQL）
 *
 * 严格遵守：
 *   - ✅ schema.sql 是字段权威来源 · 此文件仅做 TypeScript 类型映射
 */

import { sqliteTable, integer, text, real, index } from 'drizzle-orm/sqlite-core'

// ============================================================
// 1. 系统表
// ============================================================

/** 软件配置（KV 表）*/
export const systemConfig = sqliteTable('system_config', {
  id: integer('id').primaryKey(),
  configKey: text('config_key').notNull().unique(),
  configValue: text('config_value'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

// License 授权
// 2026-09-16 授权隔离改造：license 表已废弃，授权数据移入 OS 安全存储。
// 本表定义不再导出，数据库为纯业务库。

// ============================================================
// 2. 项目相关表
// ============================================================

/** 项目 */
export const projects = sqliteTable('projects', {
  id: integer('id').primaryKey(),
  projectCode: text('project_code').notNull().unique(),
  projectName: text('project_name').notNull(),
  customerName: text('customer_name'),
  status: text('status').notNull().default('START'),
  priority: text('priority').notNull().default('NORMAL'),
  owner: text('owner'),
  startDate: text('start_date'),
  endDate: text('end_date'),
  contractAmount: real('contract_amount'),
  background: text('background'),
  objective: text('objective'),
  scope: text('scope'),
  description: text('description'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

/** 项目任务（支持父任务 + 无限子任务）*/
export const projectTasks = sqliteTable(
  'project_tasks',
  {
    id: integer('id').primaryKey(),
    projectId: integer('project_id').notNull(),
    parentId: integer('parent_id'),
    taskName: text('task_name').notNull(),
    owner: text('owner'),
    startDate: text('start_date'),
    endDate: text('end_date'),
    workDays: integer('work_days').default(0),
    progress: real('progress').default(0),
    status: text('status').notNull().default('PENDING'),
    remark: text('remark'),
    sortOrder: integer('sort_order').default(0),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => ({
    idxProject: index('idx_task_project').on(t.projectId),
    idxParent: index('idx_task_parent').on(t.parentId),
  }),
)

/** 项目问题登记 */
export const projectIssues = sqliteTable(
  'project_issues',
  {
    id: integer('id').primaryKey(),
    projectId: integer('project_id').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    level: text('level').notNull().default('MEDIUM'), // LOW/MEDIUM/HIGH/CRITICAL
    owner: text('owner'),
    planDate: text('plan_date'),
    actualDate: text('actual_date'),
    discoveredAt: text('discovered_at'),
    solution: text('solution'),
    resolution: text('resolution'), // 2026-09-11 补 · 风险登记册「当前风险应对情况说明」
    status: text('status').notNull().default('OPEN'), // OPEN/IN_PROGRESS/RESOLVED/CLOSED
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => ({
    idxProject: index('idx_issue_project').on(t.projectId),
  }),
)

/** 需求登记册（与 Excel 需求登记册 sheet 对齐 · 2026-09-11 补）*/
export const projectRequirements = sqliteTable(
  'project_requirements',
  {
    id: integer('id').primaryKey(),
    projectId: integer('project_id').notNull(),
    type: text('type').notNull().default('NEW'), // NEW/CHANGE/OPTIMIZE/OTHER
    system: text('system'), // 归属系统
    summary: text('summary').notNull(), // 需求简述（必填）
    detail: text('detail'), // 需求详述
    proposedAt: text('proposed_at'), // 提出时间
    proposer: text('proposer'), // 提出人
    status: text('status').notNull().default('PENDING'), // PENDING/EVALUATING/CONFIRMED/IMPLEMENTED/REJECTED
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => ({
    idxProject: index('idx_req_project').on(t.projectId),
  }),
)

/** 问题登记册（与 Excel 问题登记册 sheet 对齐 · 2026-09-11 补）*/
export const projectIssueLog = sqliteTable(
  'project_issue_log',
  {
    id: integer('id').primaryKey(),
    projectId: integer('project_id').notNull(),
    title: text('title').notNull(), // 问题描述（必填）
    proposer: text('proposer'), // 提出人
    module: text('module'), // 涉及系统及模块（参考需规）
    discoveredAt: text('discovered_at'), // 发现时间
    planDate: text('plan_date'), // 计划解决时间
    planSolution: text('plan_solution'), // 计划解决方案
    handler: text('handler'), // 问题处理人
    progressNote: text('progress_note'), // 当前处理进度说明
    actualDate: text('actual_date'), // 实际处理时间
    status: text('status').notNull().default('OPEN'), // OPEN/IN_PROGRESS/RESOLVED/CLOSED
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => ({
    idxProject: index('idx_issuelog_project').on(t.projectId),
  }),
)

/** 其他待办事项（与 Excel 其他待办事项 sheet 对齐 · 2026-09-11 补）*/
export const projectTodoItems = sqliteTable(
  'project_todo_items',
  {
    id: integer('id').primaryKey(),
    projectId: integer('project_id').notNull(),
    content: text('content').notNull(), // 代办事项说明（必填）
    relatedPeople: text('related_people'), // 涉及人员（软件）
    planDate: text('plan_date'), // 计划完成时间
    completionNote: text('completion_note'), // 当前完成情况说明
    actualDate: text('actual_date'), // 实际完成时间
    status: text('status').notNull().default('PENDING'), // PENDING/IN_PROGRESS/COMPLETED/DELAYED
    remark: text('remark'), // 备注
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => ({
    idxProject: index('idx_todoitem_project').on(t.projectId),
  }),
)

// ============================================================
// 3. 待办表（仅 manual + weekly）
// ============================================================

export const todos = sqliteTable('todos', {
  id: integer('id').primaryKey(),
  title: text('title').notNull(),
  content: text('content'),
  priority: text('priority').notNull().default('NORMAL'), // LOW/NORMAL/HIGH/URGENT
  status: text('status').notNull().default('PENDING'), // PENDING/IN_PROGRESS/COMPLETED/DELAYED
  startDate: text('start_date'),
  dueDate: text('due_date'),
  completedAt: text('completed_at'),
  sourceType: text('source_type').notNull().default('MANUAL'), // MANUAL/WEEKLY
  sourceId: integer('source_id'),
  remindTime: text('remind_time'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

// ============================================================
// 4. 报告表
// ============================================================

export const reports = sqliteTable('reports', {
  id: integer('id').primaryKey(),
  type: text('type').notNull(), // DAILY/WEEKLY/MONTHLY/PROJECT_DAILY/PROJECT_WEEKLY/PROJECT_MONTHLY/PROJECT_DELIVERY
  projectId: integer('project_id'), // NULL=个人报告，有值=项目报告
  title: text('title').notNull(),
  content: text('content'),
  templateId: integer('template_id'),
  generateType: text('generate_type').notNull().default('MANUAL'), // MANUAL/AUTO/AI
  status: text('status').notNull().default('DRAFT'), // DRAFT/PUBLISHED/ARCHIVED
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

// ============================================================
// 5. 知识库表
// ============================================================

/** 知识笔记（project_id NULL=个人知识库，有值=项目知识库）*/
export const knowledgeNotes = sqliteTable(
  'knowledge_notes',
  {
    id: integer('id').primaryKey(),
    projectId: integer('project_id'), // NULL=个人，有值=项目
    title: text('title').notNull(),
    content: text('content'),
    contentType: text('content_type').notNull().default('MARKDOWN'), // MARKDOWN/TEXT/IMAGE/FILE/LINK
    folderId: integer('folder_id'), // 所属目录，指向 knowledge_folders.id
    category: text('category'),
    sourceType: text('source_type').notNull().default('USER'), // USER/IMPORT
    createdBy: text('created_by'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => ({
    idxProject: index('idx_knowledge_project').on(t.projectId),
    idxSource: index('idx_knowledge_source').on(t.sourceType),
  }),
)

/** 知识标签 */
export const knowledgeTags = sqliteTable('knowledge_tags', {
  id: integer('id').primaryKey(),
  tagName: text('tag_name').notNull().unique(),
  createdAt: text('created_at').notNull(),
})

/** 知识 - 标签关联 */
export const knowledgeNoteTags = sqliteTable('knowledge_note_tags', {
  id: integer('id').primaryKey(),
  noteId: integer('note_id').notNull(),
  tagId: integer('tag_id').notNull(),
})

// ============================================================
// ============================================================

// ============================================================
// 8. 日历和节假日
// ============================================================

export const holidays = sqliteTable('holidays', {
  id: integer('id').primaryKey(),
  date: text('date').notNull().unique(),
  name: text('name').notNull(), // 元旦/春节/...
  type: text('type').notNull(), // HOLIDAY/WORKDAY_SHIFT（调休）
  isWorkday: integer('is_workday').notNull().default(0), // 1=调休上班，0=放假
  source: text('source').default('NATIONAL_API'), // NATIONAL_API/MANUAL
  createdAt: text('created_at').notNull(),
})

/** 排班配置 */
export const workSchedule = sqliteTable('work_schedule', {
  id: integer('id').primaryKey(),
  weekday: integer('weekday').notNull().unique(), // 1=周一 ... 7=周日
  isWorkday: integer('is_workday').notNull().default(1), // 0=休息 1=工作
  workHours: real('work_hours').default(8.0),
})

// ============================================================
// 9. 附件表
// ============================================================

export const attachments = sqliteTable('attachments', {
  id: integer('id').primaryKey(),
  ownerType: text('owner_type').notNull(), // PROJECT/REPORT/KNOWLEDGE/TEMPLATE
  ownerId: integer('owner_id').notNull(),
  fileName: text('file_name').notNull(),
  filePath: text('file_path').notNull(),
  fileSize: integer('file_size'),
  fileType: text('file_type'),
  createdAt: text('created_at').notNull(),
})

// ============================================================
// 10. 操作日志
// ============================================================

export const auditLogs = sqliteTable('audit_logs', {
  id: integer('id').primaryKey(),
  action: text('action').notNull(), // DELETE/MODIFY/IMPORT/EXPORT
  targetType: text('target_type').notNull(),
  targetId: integer('target_id'),
  content: text('content'),
  createdAt: text('created_at').notNull(),
})

// ============================================================
// 21. 周报条目表（与 Excel 周报 sheet 对齐）
// ============================================================

export const weeklyReportEntries = sqliteTable('weekly_report_entries', {
  id: integer('id').primaryKey(),
  projectId: integer('project_id').notNull(),
  weekNumber: integer('week_number').notNull(),
  weekStartDate: text('week_start_date').notNull(),
  weekEndDate: text('week_end_date').notNull(),
  taskName: text('task_name').notNull(),
  planStartDate: text('plan_start_date'),
  planEndDate: text('plan_end_date'),
  actualStartDate: text('actual_start_date'),
  actualEndDate: text('actual_end_date'),
  ownerPartyA: text('owner_party_a'),
  ownerPartyB: text('owner_party_b'),
  completionNote: text('completion_note'),
  isCompleted: text('is_completed').notNull().default('PENDING'),
  section: text('section').notNull().default('CURRENT'), // CURRENT/HISTORY
  sortOrder: integer('sort_order').default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

// ============================================================
// 22. 项目成员表（与 Excel 项目成员 sheet 对齐）
// ============================================================

export const projectMembers = sqliteTable('project_members', {
  id: integer('id').primaryKey(),
  projectId: integer('project_id').notNull(),
  party: text('party').notNull(),
  role: text('role'),
  name: text('name').notNull(),
  contact: text('contact'),
  participation: text('participation'),
  impact: text('impact'),
  sortOrder: integer('sort_order').default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

// ============================================================
// 安全约定：API Key 绝不落库，只存 credential_reference（安全存储用户名）
// ============================================================

/** AI Provider（供应商配置 · 非机密部分） */
/** AI Conversation（对话会话） */
/** AI Message（对话消息） */
/** AI Execution Log（工具调用/任务执行日志） */
/** AI 变更单（Change Set 确认机制 · L2/L3 操作必须经用户确认） */
/** AI 变更项（每一项操作） */
/** AI 工作流定义 */
/** AI 工作流节点 */
/** AI 工作流执行记录 */
/** AI 产物（与业务数据隔离） */
/** Document 元数据（一条 = 一个逻辑文档） */
export const documents = sqliteTable('documents', {
  id: integer('id').primaryKey(),
  docId: text('doc_id').notNull().unique(), // doc_xxx
  type: text('type').notNull(), // TEXT/MARKDOWN/RICHTEXT/DOCX
  title: text('title').notNull(),
  spaceType: text('space_type'), // KNOWLEDGE/REPORT/PROJECT_FILE/TEMPLATE
  refId: integer('ref_id'),
  currentVersion: integer('current_version').notNull().default(1),
  storagePath: text('storage_path'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (t) => ({ idxSpace: index('idx_doc_space').on(t.spaceType, t.refId) }))

/** Document 版本（生成默认建新版不覆盖） */
export const documentVersions = sqliteTable('document_versions', {
  id: integer('id').primaryKey(),
  documentId: integer('document_id').notNull().references(() => documents.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  content: text('content'),
  contentType: text('content_type').notNull(), // TEXT/MARKDOWN/BLOCKNOTE_JSON/PROTO
  contentMd: text('content_md'),
  createdBy: text('created_by').notNull().default('USER'), // USER/AI/AUTO
  createdAt: text('created_at').notNull(),
}, (t) => ({ idxVersion: index('idx_docver_document').on(t.documentId) }))

// ============================================================
// 27. 消息与通知中心（2026-09-18· V1 精简闭环）
//    设计依据：docs/notification-center-rfc-2026-09-18.md §5
// ============================================================

/** 通知渠道（一条 = 一种「可发送出口」· V1 本地：IN_APP/WINDOWS/MACOS） */
export const notificationChannels = sqliteTable('notification_channel', {
  id: integer('id').primaryKey(),
  channelType: text('channel_type').notNull().unique(), // IN_APP/WINDOWS/MACOS/EMAIL/FEISHU/DINGTALK/WECOM
  name: text('name').notNull(),
  enabled: integer('enabled').notNull().default(1),
  config: text('config'), // JSON：渠道级配置（外部渠道用）+ credential_ref 指 keyring
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})

/** 通知消息（一条 = 一条逻辑消息，不绑定渠道） */
export const notificationMessages = sqliteTable('notification_message', {
  id: integer('id').primaryKey(),
  messageId: text('message_id').notNull().unique(), // msg_xxxx
  title: text('title').notNull(),
  content: text('content').notNull(),
  eventType: text('event_type').notNull(), // TASK_DUE_SOON/TASK_OVERDUE/...
  sourceType: text('source_type').notNull(), // PROJECT/TASK/REPORT/ISSUE/BACKUP/AI/SYSTEM
  sourceId: integer('source_id'),
  projectId: integer('project_id'),
  priority: text('priority').notNull().default('NORMAL'), // LOW/NORMAL/HIGH/CRITICAL
  dedupKey: text('dedup_key').notNull(),
  status: text('status').notNull().default('UNREAD'), // UNREAD/READ
  createdAt: text('created_at').notNull(),
  readAt: text('read_at'),
}, (t) => ({ idxStatus: index('idx_notif_msg_status').on(t.status, t.createdAt), idxSource: index('idx_notif_msg_source').on(t.sourceType, t.sourceId) }))

/** 通知派发（一条消息 -> 一个渠道 -> 一次发送记录） */
export const notificationDeliveries = sqliteTable('notification_delivery', {
  id: integer('id').primaryKey(),
  messageId: integer('message_id').notNull().references(() => notificationMessages.id, { onDelete: 'cascade' }),
  channelType: text('channel_type').notNull(), // 对 notification_channel.channel_type
  recipient: text('recipient'), // 外部渠道接收人/群（本地可空）
  status: text('status').notNull().default('PENDING'), // PENDING/SENT/FAILED/CANCELLED
  attempt: integer('attempt').notNull().default(0),
  lastError: text('last_error'),
  scheduledAt: text('scheduled_at'),
  sentAt: text('sent_at'),
  createdAt: text('created_at').notNull(),
}, (t) => ({ idxStatus: index('idx_notif_deliv_status').on(t.status, t.createdAt) }))

/** 通知规则（V1 = 系统内置事件类别的启停/渠道/优先级） */
export const notificationRules = sqliteTable('notification_rule', {
  id: integer('id').primaryKey(),
  eventType: text('event_type').notNull().unique(), // 每个事件类别一条
  name: text('name').notNull(),
  enabled: integer('enabled').notNull().default(1),
  channelIds: text('channel_ids').notNull(), // JSON 数组字符串
  priority: text('priority').notNull().default('NORMAL'),
  builtin: integer('builtin').notNull().default(1),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
})