-- PMTool · 0021 消息与通知中心核心表（2026-09-18 · V1 精简闭环）
-- 设计依据：docs/notification-center-rfc-2026-09-18.md §5
--   消息（notification_message）≠ 派发（notification_delivery）≠ 渠道（notification_channel）
--   规则（notification_rule）＝ 事件类别 + 启停 + 渠道 + 优先级（V1 内置规则，用户可启停/改渠道）
-- 从设计稿 11 张表精简到 4 张：
--   _event/_aggregate/_schedule/_device 属自动化/设备域（推迟）；_template 用代码内置+插值（不建表）；
--   _recipient 并入 delivery；_preference 并入 rule
--
-- 约定：
--   - 渠道凭证（外部渠道 SMTP 密码/Webhook Secret）绝不落库，走 OS 安全存储（keyring）
--   - dedup_key 唯一 ⇒ 幂等（PMTool 重启/重复事件不重复发）
--   - 内置规则 seeded（红线 11/12：用户可查看/修改/停用）
-- 序号说明：0021 紧接 0020_document_engine.sql（下一可用序号）

-- ============================================================
-- 通知渠道（一条 = 一种「可发送出口」）
-- V1 只有本地渠道：IN_APP（站内）/ WINDOWS / MACOS；外部渠道 Phase 2 扩 EMAIL/FEISHU/DINGTALK/WECOM
-- ============================================================
CREATE TABLE IF NOT EXISTS notification_channel (
    id            INTEGER PRIMARY KEY,
    channel_type  TEXT NOT NULL UNIQUE,            -- IN_APP / WINDOWS / MACOS / EMAIL / FEISHU / DINGTALK / WECOM
    name          TEXT NOT NULL,                   -- 显示名
    enabled       INTEGER NOT NULL DEFAULT 1,
    config        TEXT,                            -- JSON：渠道级配置（外部渠道用）+ credential_ref 指 keyring
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

--> statement-breakpoint

-- ============================================================
-- 通知消息（一条 = 一条逻辑消息，不绑定渠道）
-- ============================================================
CREATE TABLE IF NOT EXISTS notification_message (
    id            INTEGER PRIMARY KEY,
    message_id    TEXT NOT NULL UNIQUE,            -- 'msg_xxxx'
    title         TEXT NOT NULL,
    content       TEXT NOT NULL,
    event_type    TEXT NOT NULL,                   -- TASK_DUE_SOON / TASK_OVERDUE / ...（见 event_catalog）
    source_type   TEXT NOT NULL,                   -- PROJECT / TASK / REPORT / ISSUE / BACKUP / AI / SYSTEM
    source_id     INTEGER,                         -- 对应业务实体 id
    project_id    INTEGER,                         -- 快捷深链定位（可空）
    priority      TEXT NOT NULL DEFAULT 'NORMAL',  -- LOW / NORMAL / HIGH / CRITICAL
    dedup_key     TEXT NOT NULL,                   -- 幂等键（唯一）
    status        TEXT NOT NULL DEFAULT 'UNREAD',  -- UNREAD / READ
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    read_at       DATETIME,
    UNIQUE(dedup_key)
);
CREATE INDEX IF NOT EXISTS idx_notif_msg_status ON notification_message(status, created_at);
CREATE INDEX IF NOT EXISTS idx_notif_msg_source ON notification_message(source_type, source_id);

--> statement-breakpoint

-- ============================================================
-- 通知派发（一条消息 -> 一个渠道 -> 一次发送记录）
-- ============================================================
CREATE TABLE IF NOT EXISTS notification_delivery (
    id            INTEGER PRIMARY KEY,
    message_id    INTEGER NOT NULL,
    channel_type  TEXT NOT NULL,                   -- 对 notification_channel.channel_type
    recipient     TEXT,                            -- 外部渠道接收人/群（本地可空）
    status        TEXT NOT NULL DEFAULT 'PENDING', -- PENDING / SENT / FAILED / CANCELLED
    attempt       INTEGER NOT NULL DEFAULT 0,
    last_error    TEXT,
    scheduled_at  DATETIME,
    sent_at       DATETIME,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (message_id) REFERENCES notification_message(id) ON DELETE CASCADE,
    UNIQUE(message_id, channel_type)
);
CREATE INDEX IF NOT EXISTS idx_notif_deliv_status ON notification_delivery(status, created_at);

--> statement-breakpoint

-- ============================================================
-- 通知规则（V1 = 系统内置事件类别的启停/渠道/优先级，兼当「默认通知」）
-- ============================================================
CREATE TABLE IF NOT EXISTS notification_rule (
    id            INTEGER PRIMARY KEY,
    event_type    TEXT NOT NULL UNIQUE,            -- 每个事件类别一条
    name          TEXT NOT NULL,                   -- '任务逾期提醒'
    enabled       INTEGER NOT NULL DEFAULT 1,
    channel_ids   TEXT NOT NULL,                   -- JSON 数组字符串，如 '["in_app","windows","macos"]'
    priority      TEXT NOT NULL DEFAULT 'NORMAL',  -- 覆盖事件默认优先级
    builtin       INTEGER NOT NULL DEFAULT 1,      -- 内置规则（可改可停不可删）/ 用户自建（Phase 4）
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

--> statement-breakpoint

-- ============================================================
-- 种子数据：本地渠道 + 内置默认规则（红线 11/12）
-- ============================================================
INSERT OR IGNORE INTO notification_channel (channel_type, name, enabled) VALUES
    ('IN_APP', '站内消息', 1),
    ('WINDOWS', 'Windows 通知', 1),
    ('MACOS', 'macOS 通知', 1);

INSERT OR IGNORE INTO notification_rule (event_type, name, enabled, channel_ids, priority) VALUES
    ('TASK_DUE_SOON',     '任务即将到期',   1, '["in_app","windows","macos"]', 'NORMAL'),
    ('TASK_OVERDUE',      '任务逾期',       1, '["in_app","windows","macos"]', 'HIGH'),
    ('TASK_COMPLETED',    '任务完成',       1, '["in_app"]',                   'LOW'),
    ('HIGH_RISK_CREATED', '新增高风险',     1, '["in_app","windows","macos"]', 'HIGH'),
    ('REPORT_GENERATED',  '报告已生成',     1, '["in_app"]',                   'NORMAL'),
    ('BACKUP_COMPLETED',  '备份完成',       1, '["in_app"]',                   'LOW'),
    ('BACKUP_FAILED',     '备份失败',       1, '["in_app"]',                   'HIGH');