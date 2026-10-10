# PMTool 消息与通知中心 · 架构评审与精简方案（RFC）

- 版本：1.0 · 2026-09-18
- 依据：《PMTool 消息与通知中心最终开发设计稿 V1.0》+ 现状代码盘点
- 目标读者：维护者（产品决策）· 实现者（Rust/React）
- 定位：**评审 + 精简实施路线**。本稿**不写代码**，只给出可落地范围、数据模型、技术选型与里程碑，供拍板后动手。

---

## 0. 结论先行

设计稿的**核心分层方向正确、值得完全采纳**：

1. **消息 ≠ 渠道 ≠ 派发**（§6/§31）——一条业务事实可产生多条渠道派发，「Notification Message ↔ Notification Delivery」分开是**正确且必须**的抽象。
2. **业务模块绝不直接碰 SMTP/飞书/钉钉/Windows/macOS API**（红线 1）——统一经 Notification Service。
3. **报告生成与发送解耦 + Notification 不负责文档生成**（红线 9/10）——与现有 Document Engine 完全吻合。
4. **`deduplication_key` 幂等** + **敏感凭证走系统安全存储**（红线 4/6）——与现有 `services/auth/secure_storage.rs`（keyring）一致，可复用。

但设计稿有**三处前提与项目现状不符**，**必须先修正再落地**，否则 Phase 1 就会失控：

1. **「事件总线 Event Bus」和「自动化引擎 Automation Engine」目前根本不存在。**
   代码库 grep 无 `event_bus` / `automation` 模块。而设计稿的整张架构图、以及「定时发送（每周五 18:00）/ 每日汇总 / 报告自动发送」这些**核心卖点，恰恰依赖自动化引擎**。若在 Phase 1 就造事件总线 + 调度器，等于先干整个自动化系统，远超「通知中心」本身。

2. **「任务优先级 = 高」条件在当前 schema 里不成立。**
   `database/schema.sql` 的 `project_tasks` 表**没有 `priority` 列**；`priority` 只存在于 `projects`/`project_issues`/`todos`。设计稿 §11/§56 反复用「任务优先级」「剩余时间 ≤ 2天」做条件示例——前者**缺字段**，后者需用 `end_date` 实时算。所谓「事件条件系统」若照稿做 10 种算子 + AND/OR 自由组合，是**一个规则引擎**，不是通知功能。

3. **「通知中心完全用户可配置」= 规则引擎 + 模板引擎组合，重量级。**
   设计稿 §21 五步向导（事件/条件/对象/渠道/时间）+ §30 模板变量系统 + §七 任意事件可发任意渠道 + §22 频率策略。这是**成品级通知 SaaS** 的形态，对**单机个人桌面 PM 工具**而言**过度设计**（SOUL §52：软件不是功能越多越好）。

**V1 最小闭环（本稿推荐）**：`站内消息 + 本机系统通知 + 事件触发（内置事件类别）+ 消息/渠道/派发三分离 + 幂等 + 失败重试 + 深链接 + 每事件启停`。**先跑通「事件 → 规则 → 消息 → 派发 → 留痕 → 重试 → 深链」整条链路**；**外部渠道、自动化定时、规则向导、模板系统**逐 phase 加。

---

## 1. 现状盘点（引用真实代码）

| 模块 | 现状 | 缺口 / 可用性 |
|---|---|---|
| 事件来源 · 项目 | `projects`：`status`(五态) / `priority` / `owner` / `end_date` | 可产生 项目创建/状态变更/里程碑 事件 |
| 事件来源 · 项目任务 | `project_tasks`：`owner` / `start_date` / `end_date` / `status`(PENDING/IN_PROGRESS/COMPLETED/DELAYED) / `progress`。**无 `priority`** | 可产生 到期/逾期/指派/完成 事件；**无优先级**——「任务优先级」条件需补列或改用项目级 |
| 事件来源 · 风险 | `project_issues`：`priority` / `status` | 可产生 高风险/问题变更 事件 |
| 事件来源 · 报告 | `reports`：`type`(DAILY…MONTHLY) / `generate_type`(MANUAL/AUTO) / `status` | 与 Document Engine 已打通；**只差「生成完成事件 → 通知」** |
| 事件来源 · 待办 todos | `todos`：`priority` / `status` / `due_date` / `remind_time` | 可产生 待办到期/提醒 事件 |
| AI 中台 | `services/ai` + `commands/ai.rs`（2026-09-18 已建） | 可发 AI 任务事件；本轮通知只做消费方 |
| 事件总线 / 自动化引擎 | **不存在** | **本轮不建**（见 §3） |
| 后台异步模式 | `commands/holidays.rs` 用 `tauri::async_runtime::spawn_blocking`；`commands/ai.rs` 同 | 派发 Worker 可复用此模式 |
| 安全存储 | `services/auth/secure_storage.rs`（keyring，KeyringStorage） | **直接复用**存第三方渠道凭证（SMTP 密码 / Webhook Secret） |
| 本地通知 | `Cargo.toml` 无 notification / deep-link 插件 | 新增（见 §6） |
| 设置中心 | `SettingsPage` 已有 `LicenseSection/AboutSection` 等分区 | 挂「消息与通知」分区 |

**结论**：V1 不重造任何东西。**缺的是**：① 一个统一的 `NotificationService`；② 一个本地通知/深链路；③ 消息+派发两张表；④ 少量规则载体。事件**来源**全部现成，只需在现有 write 命令成功落库后「发一个事件」。

---

## 2. 目标与范围（V1）

**目标**：业务模块把「发生的事实」交给 `notification` 模块，由它决定「是否/何时/经何渠道通知谁」，并全程留痕。业务模块**永不直接**调 SMTP / 飞书 / 钉钉 / 系统通知 API。

**V1 支持矩阵**：

| 能力 | V1 |
|---|---|
| 站内消息（消息中心列表 / 已读 / 未读数 / 深链） | ✅ |
| 本机系统通知（Windows toast + macOS UserNotifications） | ✅ |
| 通知权限检测（OS 层） | ✅ |
| 事件触发（内置类别：任务到期/逾期/指派/完成、高风险、报告生成、备份完成等） | ✅ |
| 每事件启停 / 每事件选渠道 / 覆盖优先级 | ✅（内置规则可启停） |
| 派发记录 + 失败重试 + 幂等 | ✅ |
| 点击通知深链接到项目/任务/报告页 | ✅ |
| 邮件 / 飞书 / 钉钉 / 企微外部渠道 | 🔻 **推迟 Phase 2** |
| 免打扰 / 工作时间 / 每日/每周汇总 / 定时 | 🔻 **推迟（依赖自动化引擎）Phase 3** |
| 规则向导（条件 AND/OR + 10 算子）+ 模板变量系统 | 🔻 **推迟 Phase 4**（先用「内置事件 + 每事件启停」） |
| AI 生成通知规则草稿 | 🔻 **推迟 Phase 5** |

**V1 不做**：事件总线独立组件、自动化引擎 / 调度器、`notification_aggregate/_schedule/_event/_template/_recipient/_device` 等表、模板引擎、规则 DSL。

---

## 3. 依赖方向规则（写进规范，源自红线）

```
业务模块 ──┐   (创建/更新/完成……后 emit event)
AI 中台 ───┤
报告中心 ──┤   (生成完成后 emit event)
           ▼
   Notification Service
       ├──-> Rule 匹配（事件类别 + 启停 + 渠道 + 优先级）
       ├──-> 建 Message  + 建 N 个 Delivery
       └──-> 异步派发（本地：立即；外部：后台 + 重试）
                 │
                 ├── Windows/macOS 系统通知  (tauri-plugin-notification)
                 ├── 站内消息               (DB)
                 └── SMTP/飞书/钉钉/企微    (Phase 2 · Channel Adapter)
```

- **任何业务模块不得直接调**系统通知 / SMTP / 飞书 / 钉钉 / 企微 API（红线 1）。
- **Notification Service 不负责** Word/PDF 生成（红线 10）；报告生成完成后只 emit 事件，发送由通知层做。
- **AI 不得获取**任何第三方渠道凭证 / API Key（红线 7/8）；AI 只作为事件来源与(未来)消费方。
- **用户停用某事件后，该事件不再产生对应派发**（红线 11）；**内置规则必须可查看/启停**（红线 12）。
- 所有外部发送**异步**（红线 3）、有 Delivery 记录（红线 5）、可重试操作幂等（红线 6）、Secret 安全存储（红线 4）。

---

## 4. 模块结构（Rust 后端）

```
app/src-tauri/src/
├── services/
│   └── notification/           # 新增（services 平级，独立域）
│       ├── mod.rs              # 模块入口 + NotificationError
│       ├── service.rs          # NotificationService：emit_event / match_rules / build_message /
│       │                       #   ensure_deliveries / mark_read / unread_count / request_send
│       ├── channel.rs          # Channel 抽象 trait + 本地/站内实现（外部渠道 Phase 2 在此挂 Adapter）
│       ├── worker.rs           # 派发 Worker：pending 队列 → 系统通知/站内 → 更新 Delivery（重试退避）
│       ├── deep_link.rs        # event payload → 前端 hash 路由 (pmtool://task/123 → #/project/…)
│       ├── event_catalog.rs    # 内置事件类别 + 默认规则（可启停 / 默认渠道 / 默认优先级）
│       └── template.rs         # 内置文案模板 + {{var}} 插值（V2 前不做用户可编辑模板系统）
├── repositories/notification.rs       # notification_message / notification_delivery / notification_rule / notification_channel 存取
└── commands/notification.rs           # Tauri 命令注册（见 §8）
```

`repositories/notification.rs` 走 DB；`service.rs` 编排（命令层只做校验，业务在 service，沿用现有分层）。

**crate 选择**：`tauri-plugin-notification`（官方 v2，封装 Windows toast + macOS UserNotifications + `isPermissionGranted/requestPermission`）+ `tauri-plugin-deep-link`（点击系统通知→应用内路由）。**不引入** winrt-notification / notify-rust 等自行封装。

---

## 5. 数据模型（DB）

新 migration **`0021_notification.sql`**（下一序号，沿用 drizzle 多文件格式 + `--> statement-breakpoint`）。`database/schema.sql` 同步维护（权威 schema；drizzle 生成 `app/src/database/schema.ts`；测试夹具读 schema.sql）。

> **从设计稿 11 张表精简到 4 张**：`_aggregate/_schedule/_event/_device` 属自动化/设备域（推迟）；`_template` 用代码内置 + 插值（V1 不建表）；`_recipient` 并入 delivery；`_preference` 并入 rule（规则即「事件类别 + 启停 + 渠道 + 优先级」，兼当默认通知）。

```sql
-- 通知渠道（一条 = 一种「可发送出口」；V1 只有本地=windows/macos + in_app）
-- 外部渠道(邮件/飞书/钉钉/企微) Phase 2 扩 channel_type，凭证存 keyring，不落库
CREATE TABLE IF NOT EXISTS notification_channel (
    id            INTEGER PRIMARY KEY,
    channel_type  TEXT NOT NULL UNIQUE,            -- WINDOWS/MACOS/IN_APP/EMAIL/FEISHU/DINGTALK/WECOM
    name          TEXT NOT NULL,
    enabled       INTEGER NOT NULL DEFAULT 1,
    config        TEXT,                            -- JSON：渠道级配置(外部渠道) + credential_ref 指 keyring
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 通知消息（一条 = 一条逻辑消息，不绑定渠道）
CREATE TABLE IF NOT EXISTS notification_message (
    id                INTEGER PRIMARY KEY,
    message_id        TEXT NOT NULL UNIQUE,        -- 'msg_xxxx'
    title             TEXT NOT NULL,
    content           TEXT NOT NULL,
    event_type        TEXT NOT NULL,               -- TASK_DUE_SOON/TASK_OVERDUE/...（见 §7 catalog）
    source_type       TEXT NOT NULL,               -- PROJECT/TASK/REPORT/ISSUE/BACKUP/AI/SYSTEM
    source_id        INTEGER,                      -- 对应业务实体 id
    project_id        INTEGER,                     -- 快捷深链定位
    priority          TEXT NOT NULL DEFAULT 'NORMAL',  -- LOW/NORMAL/HIGH/CRITICAL
    dedup_key         TEXT NOT NULL,               -- 幂等键(unique)
    status            TEXT NOT NULL DEFAULT 'UNREAD',  -- UNREAD/READ
    created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    read_at           DATETIME,
    UNIQUE(dedup_key)
);

-- 通知派发（一条消息 -> 一个渠道 -> 一次发送记录）
CREATE TABLE IF NOT EXISTS notification_delivery (
    id            INTEGER PRIMARY KEY,
    message_id    INTEGER NOT NULL,
    channel_type  TEXT NOT NULL,                   -- WINDOWS/MACOS/IN_APP/...
    recipient     TEXT,                            -- 外部渠道接收人/群(本地可空)
    status        TEXT NOT NULL DEFAULT 'PENDING', -- PENDING/SENT/FAILED/CANCELLED
    attempt       INTEGER NOT NULL DEFAULT 0,
    last_error    TEXT,
    scheduled_at  DATETIME,
    sent_at       DATETIME,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (message_id) REFERENCES notification_message(id) ON DELETE CASCADE,
    UNIQUE(message_id, channel_type)
);

-- 通知规则（V1 = 系统内置事件类别的启停/渠道/优先级，兼当「默认通知」）
-- 用户可查看/启停/改渠道（红线 11/12）。V1 不做自由条件表达式。
CREATE TABLE IF NOT EXISTS notification_rule (
    id            INTEGER PRIMARY KEY,
    event_type    TEXT NOT NULL UNIQUE,            -- 每个事件类一条
    name          TEXT NOT NULL,                   -- '任务逾期提醒'
    enabled       INTEGER NOT NULL DEFAULT 1,
    channel_ids   TEXT NOT NULL,                   -- JSON [channel_id]（默认含 WINDOWS/MACOS + IN_APP）
    priority      TEXT NOT NULL DEFAULT 'NORMAL',  -- 覆盖事件默认优先级
    builtin       INTEGER NOT NULL DEFAULT 1,      -- 内置规则(可改可停不可删) / 用户自建(Phase 4)
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

> 说明：**`project_tasks` 无 `priority` 列**——「任务优先级」条件在 V1 **不做**；已完成的「任务完成」等事件依赖现有 `status`。若后续要「高优先级任务提醒」，**先给 `project_tasks` 补 `priority` 列**（独立 migration），再在规则里开放该条件。

---

## 6. 事件触发机制（V1 权衡）

**不在 V1 建独立「事件总线」**。理由：桌面单进程，无跨服务解耦硬需求；事件总线是**多订阅者编排**工具，通知是第一（当前唯一）消费者，为其造总线是过度设计（SOUL §39）。

**V1 做法**：既有 write/update 命令在**成功落库后**，直接调 `notification::service::emit_event(event)`——同步、单点、无总线。事件结构：

```rust
struct NotificationEvent {
    event_type: String,       // 见 §7
    source_type: String,
    source_id: i64,
    project_id: Option<i64>,
    priority: Option<String>, // None = 用规则/目录默认
    payload: serde_json::Value, // {task_name, due_date, owner, ...} 供模板插值
    dedup_key: String,        // 如 task:123:overdue:2026-W38
}
```

`emit_event` 流程（全部同步，快）：

```
event -> 查 notification_rule(event_type) 匹配
       -> 未启停就 return（红线 11）
       -> 建 notification_message(dedup_key 冲突则跳过 = 幂等)
       -> 按 rule.channel_ids 建 N 条 notification_delivery(PENDING)
       -> worker 异步派发（本地通知走 tauri、站内直接 status=UNREAD）
```

**谁调用**：在 `commands/project_tasks.rs` / `projects.rs` / `project_issues.rs` / `reports.rs` / `backup.rs` 的写命令末尾，成功提交后 emit（不阻塞 UI）。**任务到期/逾期**这类**非写入触发**的时效事件，V1 用「应用启动 + 定时 tick（可选 `std::thread` + 轻量 sleep 轮询）」扫 `project_tasks.end_date` 补发；**真正的定时调度推迟到自动化引擎**。

---

## 7. 内置事件类别（V1 Event Catalog）

V1 只做**最接近用户价值**的 7 类（每类对应 `notification_rule` 一行，默认启用）：

| event_type | 来源 | 触发点 | 默认渠道 | 默认优先级 |
|---|---|---|---|---|
| `TASK_DUE_SOON` | `project_tasks.end_date` | 到期前 1 天扫描 / 创建时计入 | WINDOWS+MACOS+IN_APP | NORMAL |
| `TASK_OVERDUE` | `project_tasks.status=DELAYED` 或超 `end_date` | 写命令 / 启动扫描 | WINDOWS+MACOS+IN_APP | HIGH |
| `TASK_COMPLETED` | `project_tasks.status→COMPLETED` | 写命令 | IN_APP | LOW |
| `HIGH_RISK_CREATED` | `project_issues.priority=HIGH/URGENT` | 写命令 | WINDOWS+MACOS+IN_APP | HIGH |
| `REPORT_GENERATED` | `reports` 生成完成 | 报告生成成功（Document Engine 产出后） | IN_APP | NORMAL |
| `BACKUP_COMPLETED` | `backup` 成功 | 备份命令成功提交 | IN_APP | LOW |
| `BACKUP_FAILED` | `backup` 失败 | 备份命令失败 | IN_APP | HIGH |

> 其余（任务指派/项目状态/里程碑/需求/问题变更/AI/WORKFLOW）V1 预留在 catalog 常量，**不注册规则**，等有明确价值再接。

---

## 8. 命令面

`commands/notification.rs`，`invoke` 前端封装在 `app/src/services/notification.ts`。命名 camelCase：

| 命令 | 说明 |
|---|---|
| `notification.list({filter, limit, offset})` | 消息列表（全部/未读/按 source_type 过滤） |
| `notification.markRead({messageId})` / `notification.markAllRead()` | 已读 |
| `notification.unreadCount()` | 未读数（顶栏 🔔 角标） |
| `notification.rule.list()` / `notification.rule.set({eventType,enabled,channelIds,priority})` | 启停/改渠道/改优先级（红线 11/12） |
| `notification.channel.list()` / `notification.channel.set({channelType,enabled,config})` | 渠道启停/配置（外部渠道 Phase 2） |
| `notification.delivery.list({messageId})`；`notification.delivery.retry({deliveryId})` | 派发记录 / 手动重试 |
| `notification.test({channelType})` | 系统通知测试（设置页「测试通知」） |
| `notification.permission({platform})` | OS 通知权限检测 |
| `notification.send({title,content,deepLink,...})` | API 直接发一条（供 AI/报告/外部工具调用，统一走 service） |
| `notification.deepLink({targetType,sourceId})` | 深链解析 → 前端路由（点击系统通知回调） |

> 深链：`tauri-plugin-deep-link` 在应用已运行时把点击系统通知的 payload 发给前端 → hash 路由跳转；未运行时由启动参数解析。V1 支持 `项目详情 / 任务详情 / 报告 / 消息中心` 四类目标。

---

## 9. 前端结构

```
app/src/
├── notification/                 # 新增目录（对齐设计稿 五十三 但精简）
│   ├── MessageCenterPage.tsx     # 消息中心（全部/未读/任务/项目/报告/AI/系统 tab + 单条深链）
│   ├── MessagePopover.tsx        # 顶栏 🔔 未读角标 + 下拉预览
│   ├── NotificationSettings.tsx  # 设置中心「消息与通知」分区（本地通道启停/测试/权限/规则启停）
│   ├── RuleManager.tsx           # 内置事件启停/渠道/优先级（V1；引导向导 Phase 4）
│   ├── ChannelManager.tsx        # 渠道配置（V1 本地；外部 Phase 2）
│   ├── DeliveryLogs.tsx          # 派发记录（时间/消息/渠道/状态/重试/错误）
│   └── deepLink.ts               # 深链 → react-router hash 路由
└── services/notification.ts      # invoke 封装
```

**复用**：顶栏结构（现有 `SettingsPage` 分区布局）、`LicenseGuard`/`RouteGuard` 路由守卫、消息/通知样式沿用现有组件库。

---

## 10. 里程碑（每阶段可独立验证）

- **M1 · 数据 + 服务骨架**：`0021_notification.sql` + `repositories/notification.rs` + `service.rs` + `channel.rs`(本地) + `event_catalog.rs`。验证：`cargo test` 新增迁移/仓储测试；`schema.test.ts` `EXPECTED_TABLES` 同步补 4 张表。
- **M2 · 站内消息闭环（第一个用户可见价值）**：`notification.list/markRead/unreadCount/rule.*` + 顶栏角标 + `MessageCenterPage`（未读/已读/深链）。验证：生成一条任务消息 → 顶栏出现未读 → 点击路由到任务详情 → 已读。
- **M3 · 本地系统通知 + 权限 + 深链**：接 `tauri-plugin-notification` + `deep-link`；Worker 派发本地；`notification.test/permission`。验证：Windows 弹 toast → 点击直达任务/项目页；权限单测。
- **M4 · 事件接入**：在 `project_tasks/projects/issues/reports/backup` 写命令成功处 emit + 内置规则；启动扫描补到期/逾期。验证：新建高风险/任务完成/备份完成各产生一条消息+系统通知。
- **M5 · 失败重试 + 幂等**：Delivery 状态机、退避重试、`dedup_key` 去重、`delivery.list/retry`。

**M2 即交付价值**；M3-M5 形成完整「事件→通知→留痕→重试→深链」闭环。**外部渠道 / 定时汇总 / 规则向导 / 模板系统 / AI 生成 / 自动化引擎** 全部推迟，留到 Phase 2-5。

---

## 11. 验证方式

- Rust：`cargo test`（新增：dedup_key 幂等去重、rule 启停路由、delivery 状态机/重试退避、emit→message+delivery 链路、深链解析）；`cargo check` 需先 `vite build`。
- 前端：`pnpm build`（tsc && vite build）+ `vitest run`。
- 真实验证：Windows 装包后建一个任务设为 1 天后到期 → 触发到期扫描 → 站内+toast 均出现 → 点击 toast 直达任务详情；停用「任务逾期提醒」后逾期事件不再发。
- **Rust/命令注册/capability 改动必须重启 `tauri dev` 生效**；纯前端 HMR 即时。

---

## 12. Rust 依赖新增

`app/src-tauri/Cargo.toml` 增：`tauri-plugin-notification`（v2，官方）、`tauri-plugin-deep-link`（v2，官方）、`chrono`（若未引用于到期扫描）。渠道凭证复用现有 `keyring`（`secure_storage.rs`）。**前端依赖**：`@tauri-apps/plugin-notification`、`@tauri-apps/plugin-deep-link`（官方 JS 封装）。

---

## 13. 关键风险与对策

| 风险 | 对策 |
|---|---|
| 无事件总线，业务写命令耦合通知 | 通知调用放**命令层末尾成功提交后**，用 `try` 包裹 + 日志，**通知异常绝不影响业务返回**（红线 2） |
| 到期/逾期属「非写入触发」，需后台扫描 | V1 用轻量启动扫描 + 可选 sleep tick；**真定时一律推迟到自动化引擎** |
| `project_tasks` 无 `priority`，「高优任务提醒」做不了 | V1 明确不做该条件；需要时**先补 priority 列**（独立 migration）再开放 |
| 本地通知平台差异（WebView2 旧 / macOS 权限） | 用**官方插件**统一封装；`permission` 命令运行时返回真实状态，设置页引导去系统设置开启 |
| 深链在应用未运行 vs 已运行行为不同 | 已运行走 `deep-link` 事件；未运行由启动参数解析后 jump；都收敛到 `deepLink.ts` |
| migration 与 schema.sql 双处同步 | 沿用现有约定：schema.sql 权威 → drizzle 生成 schema.ts → 测试夹具同步 |
| 事件向通知耦合导致泛化 | 事件仅携带**最小 payload**（id + 名称 + 归属 + 时间），不把 DB 全行塞进事件 |

---

## 14. 与设计稿差异汇总（采纳 / 修正 / 推迟）

| 设计稿说法 | 本 RFC |
|---|---|
| §6/§31 消息≠渠道≠派发 | ✅ 采纳（message/delivery 分离 + channel 抽象） |
| §四十七-四十九 职责边界（业务/AI/报告/文档/通知） | ✅ 采纳（§3 写规范） |
| §38-44 11 张 notification_* 表 | ⚠️ **修正**：精简到 4 张（message/delivery/channel/rule）；`_event/_aggregate/_schedule/_device/_template/_recipient/_preference` 推迟或并入 |
| §45-46 事件总线 + 规则引擎 | ⚠️ **修正**：V1 不建独立事件总线（单进程单消费者）；规则用「内置事件 + 启停/渠道/优先级」 |
| §11/§22/§24/§25 条件 AND/OR / 10 算子 / 免打扰 / 汇总 / 频率 | 🔻 **推迟 Phase 3-4**（依赖自动化引擎；先用内置事件 + 启停） |
| §十八-十九 邮件/飞书/钉钉/企微配置+测试发送 | 🔻 **推迟 Phase 2**（Channel Adapter 挂点已在 §4 预留） |
| §30 模板变量系统 | 🔻 **推迟 Phase 4**（V1 用代码内置模板 + 插值） |
| §48/§六 AI 生成规则 | 🔻 **推迟 Phase 5** |
| §50 / §二十-二十七 定时自动发送报告 / 报告中心自动发送 | 🔻 **推迟**（依赖自动化引擎 + Document Engine，报告生成完成事件已预留） |
| §三十二-三十三 深链接 | ✅ 采纳（`deep-link` 插件 + 4 类目标） |

---

## 15. 实施状态（2026-09-18 更新）

**已交付（M1 + M2）**，验证全绿：

| 里程碑 | 状态 | 验证 |
|---|---|---|
| M1 · 数据 + 服务骨架 | ✅ | `0021_notification.sql` + schema.sql/schema.ts/测试基线（33→37 张表，含 AI 工作流外部新增同步）+ `repositories/notification.rs` + `services/notification/`（event_catalog/channel/worker/deep_link/service/mod）+ 启动兜底 `ensure_seed` |
| M1 · 命令面 | ✅ | `commands/notification.rs` 16 个命令注册进 lib.rs；`cargo check` 通过 |
| M2 · 站内消息闭环 | ✅ | `services/notification.ts` + `MessageCenterPage`（tab/已读/深链/全部已读）+ `NotificationSettingsPanel`（渠道/规则启停/测试）+ Sidebar 🔔 未读角标（30s 轮询）+ 路由 `#/messages` |
| 测试 | ✅ | `cargo test` 全绿（lib 94 + integration 12 含 5 条通知链路测试 + license 11 + e2e 1 + migration 1）；`tsc --noEmit` 0 错；`vitest run` 274/274；`vite build` 通过 |

**实施中修正的设计稿偏差**：

1. **`notification_test` 直发路径**：测试通知不属事件目录，`emit_event` 会因无规则静默丢弃。新增 `service::send_direct()`（message + IN_APP delivery + 幂等，不走规则匹配），供测试通知与未来 `notification.send` 使用。
2. **`ensure_seed` 的 channel_ids 格式**：EVENT_TYPES 是 CSV，但 DB 存 JSON 数组（与 migration 种子一致）——已统一为 JSON。
3. **顺带修复两处他人未提交代码的编译阻塞**（同工作区 AI/Document 开发中代码）：
   - `document/engine/docx.rs`：pulldown-cmark 0.11 API 变化（`Tag::BlockQuote(_)` / `TagEnd::*`），修 3 处。
   - `services/ai/tools.rs`：模块文档代码块被 rustdoc 当 doctest 编译失败，改 ````text` fence。
4. **schema.test.ts 基线漂移**：AI 工作流新增 `ai_artifact/ai_workflow/ai_workflow_node/ai_workflow_run` 未登记，已并入 EXPECTED_TABLES；`0001_init.sql` 语句数断言方向反转（0001 是 Phase-0 冻结基线，schema.sql 是权威超集）。

**V1 剩余（M3-M5 待做）**：本地系统通知（tauri-plugin-notification + deep-link，`notification_permission` 目前返回占位 granted）、WINDOWS/MACOS 派发落地、启动扫描补到期/逾期、失败重试退避、业务写命令 emit 接入。

## 16. 建议下一步

1. **确认精简**：V1 按本 RFC 的 4 表 + 内置事件 + 7 类事件闭环（不做规则 DSL / 自动化 / 外部渠道）。
2. **第一价值点已交付**：M2「站内消息 + 顶栏角标 + 消息中心 + 深链」已可用；下一里程碑 M3「本地系统通知 + 权限 + 深链」。

若你更希望**一次性照设计稿做满（含事件总线 + 自动化引擎 + 外部渠道 + 规则向导 + 模板系统）**，那将是一个**数周级**工程，建议拆分并按「先打通本地闭环，再外部渠道，再自动化」的顺序排期——但我不建议在 V1 就做全量（SOUL §52）。