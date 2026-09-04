# PMTool V2.0 · Todo 数据模型 RFC（06）

> 状态：实施基线 · 2026-08-22 · Phase 3 T3.1
> 目的：检查现有 todos 表是否满足 Phase 3 需求（日/周/月视图、自动顺延、节假日跳过、邮件提醒），列出 schema 变更设计。

---

## 1. 现有 todos 表（RFC-01 §3.3 · 16 张核心表之一）

```sql
CREATE TABLE IF NOT EXISTS todos (
    id             INTEGER PRIMARY KEY,
    title          TEXT NOT NULL,
    content        TEXT,
    priority       TEXT NOT NULL DEFAULT 'NORMAL',         -- LOW/NORMAL/HIGH/URGENT
    status         TEXT NOT NULL DEFAULT 'PENDING',         -- PENDING/IN_PROGRESS/COMPLETED/DELAYED
    start_date     DATE,
    due_date       DATE,
    completed_at   TEXT,                                  -- UTC ISO 8601（RFC-02 §4）
    source_type    TEXT NOT NULL DEFAULT 'MANUAL',          -- **仅 MANUAL/WEEKLY**（PM A1）
    source_id      INTEGER,
    remind_time    DATETIME,
    created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

## 2. Phase 3 需求 vs 现有字段

| 需求 | 现有字段 | 状态 |
|---|---|---|
| 日视图（按 due_date 过滤）| ✅ due_date DATE | 满足 |
| 周视图（按 start_date/due_date 范围过滤）| ✅ start_date + due_date | 满足 |
| 月视图（月历 + due_date 标注）| ✅ due_date | 满足 |
| 自动顺延（更新 due_date）| ✅ due_date 可更新 | 满足 |
| 法定节假日跳过 | ❌ 需要 holidays 表 | **holidays 表已存在**（Phase 0 T0.4a）|
| 邮件提醒（到期当天 08:00）| ⚠️ remind_time 字段存在 | **提醒执行策略需 system_config 配置**（RFC-07）|
| 邮件提醒（逾期每天 08:00）| ⚠️ 同上 | 同上 |
| 高优先级提前一天 | ⚠️ priority 字段有 | 需要配置 reminder_days |
| 来源关联（手动/项目任务/AI）| ⚠️ source_type 仅 MANUAL/WEEKLY | **⚠️ 与维护者原话冲突，见 §4**|

**结论**：现有 todos 表对 Phase 3 **核心需求够**。补充需求（节假日 + 邮件提醒）通过：
- holidays 表（已存在，Phase 3 用 webview 端缓存）
- system_config 表（已存在，加新 config_key）
- WebView 端 services 层实现自动顺延算法（不依赖新 Rust commands）

## 3. 不需要新增表

Phase 3 **不需要**修改 schema 或新增表。所有功能通过现有 16 张核心表实现：
- todos（CRUD + 自动顺延）
- holidays（节假日查询，WebView 端缓存）
- system_config（邮件提醒配置 + 自动顺延开关 `todo_auto_postpone`）
- audit_logs（自动顺延事件记录）

## 4. ✅ 维护者 2026-08-22 决策：source_type 严格 MANUAL/WEEKLY（PM A1 确认）

**维护者决策原话（2026-08-22 T3.6 弹窗回复）**：
> 选择方案1，保持 PM A1。
> 1. todos.source_type 继续严格保持：MANUAL / WEEKLY
> 2. 「项目任务/AI 来源」调整理解：Todo 表负责个人待办管理，不负责承载所有业务来源。
>    项目任务、AI 生成内容如果需要进入 Todo，采用「生成待办」的方式进入：
>    项目任务 → 用户确认 → 创建 Todo → source_type = MANUAL
>    AI 建议 → 用户确认 → 创建 Todo → source_type = MANUAL
> 3. 不修改：schema.sql / schema.ts / RFC-01 / RFC-02 · 不打破 Phase 0 冻结。
> 4. Phase 3 继续推进。
> 5. T3.1 验收调整：删除「source_type 支持项目任务/AI」的要求。改为：
>    Todo 支持：手动创建 / 周任务 / 用户确认后的外部生成事项
> 6. 如果未来确实需要追踪 Todo 来源：新增独立字段或关联表。例如 todo_origin，但必须单独提交 RFC。

**已遵守的处理**：
- ⏳ 不修改 schema.sql / schema.ts（保持 PM A1）
- ⏳ source_type 仅 MANUAL/WEEKLY（TypeScript 类型层面已强制）
- ⏳ 业务逻辑：项目任务 / AI 建议通过"用户确认 → createTodo(sourceType='MANUAL')"进入
- ⏳ T3.7 测试文件「验收 #6 项目任务同步 Todo」改为 MANUAL 占位说明

**未来如果需要追踪 Todo 真实来源**：新增独立字段 todo_origin（或独立 origin 表），需单独 RFC，不在 Phase 3 范围。

## 5. system_config 新增字段（Phase 3 + Phase 9 配置共用）

```sql
-- Phase 3 自动顺延开关（设计稿 §5 自动顺延规则）
INSERT OR IGNORE INTO system_config (config_key, config_value) VALUES
    ('todo_auto_postpone',         '1'),              -- 默认开启
    ('todo_remind_time',           '08:00'),           -- 邮件提醒时间
    ('high_priority_remind_days',  '1'),              -- 高优先级提前天数
    ('smtp_host',                  ''),                -- SMTP 服务器
    ('smtp_port',                  '587'),
    ('smtp_user',                  ''),
    -- 注意：smtp_password 存系统钥匙串（RFC-03 §4），不在 SQLite
    ('smtp_sender_email',          '');
```

## 6. Phase 3 不修改 schema 的实施策略

| 子任务 | 数据层 | WebView 端 |
|---|---|---|
| T3.1 数据模型确认 | 无变更（RFC-06）| N/A |
| T3.2 Service 层 | 无变更 | src/services/todo.ts + datetime.ts + holidayProvider.ts |
| T3.3 三视图 UI | 无变更 | src/pages/TodoPage.tsx（重写占位）|
| T3.5 邮件提醒设计 | system_config 字段（INSERT OR IGNORE）| V8/RFC/07-email-reminder.md |
| T3.6 测试 | N/A | src/database/__tests__/todo.test.ts |

**Phase 0 冻结遵守**：
- ❌ 不修改 T0.1~T0.4f 任何文件
- ❌ 不修改 schema.sql / schema.ts
- ❌ 不修改 lib.rs / commands/mod.rs（不新增 Rust commands）
- ✅ 仅新增文件（services/ + RFC + tests）

## 7. PM 决策关联

- **PM A1**：source_type 仅 MANUAL/WEEKLY（已遵守）
- **PM B1**：所有数据通过 commands::todos 业务命名（已遵守，无 execute_sql/query_sql）
- **PM C1**：7 项门禁严格执行（T3.2 ~ T3.6 全部应用）

---

**版本**：2026-08-22（Phase 3 数据模型基线）
**下一阶段**：T3.2 Service 层实施