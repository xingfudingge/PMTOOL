-- PMTool · 0024 通知中心外部渠道（2026-09-18 · 邮件/飞书/钉钉/企业微信）
-- 设计依据：docs/notification-center-rfc-2026-09-18.md §十八/§五十四 Phase 2
--
-- 说明：
--   0021 已建 4 张 notification_* 表并种入本地渠道（IN_APP/WINDOWS/MACOS）。
--   本迁移只补外部渠道行，让「设置中心 → 消息与通知 → 通知渠道」能展示并配置它们。
--
-- 安全（红线 4）：
--   config 只存非机密字段（SMTP 服务器/端口/加密/发件人/Webhook/群名/关键词）；
--   SMTP 密码、飞书签名密钥、钉钉加签 Secret 走 OS 安全存储（keyring），绝不落库。
--
-- 序号说明：0022 已被 ai_change、0023 已被 ai_workflow 占用，本迁移取 0024。

-- 外部渠道种子（默认停用 · 用户配置后才启用）
INSERT OR IGNORE INTO notification_channel (channel_type, name, enabled, config) VALUES
    ('EMAIL',    '邮件',     0, '{"encryption":"SSL","smtpPort":465}'),
    ('FEISHU',   '飞书',     0, '{}'),
    ('DINGTALK', '钉钉',     0, '{}'),
    ('WECOM',    '企业微信', 0, '{}');
