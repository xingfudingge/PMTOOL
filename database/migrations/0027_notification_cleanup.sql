-- PMTool · 0027 通知渠道精简（2026-09-2? · 维护者拍板：只留 站内消息 + 邮件）
--
-- 背景：Windows/macOS 系统弹窗通知、飞书/钉钉/企业微信 Webhook 渠道经实测未生效，
--   维护者意见："站内通知之外的没生效过，去掉 Windows/macOS，外部只留邮件，清理干净"。
--
-- 处理：
--   1. 删除已移除的渠道行（WINDOWS/MACOS/FEISHU/DINGTALK/WECOM）。
--      notification_delivery.channel_type 是文本映射（无 FK），删渠道行不影响历史派发记录。
--   2. 确保邮件渠道存在（默认停用，用户配置后启用）。
--   3. 规则 channel_ids 的修复放在 Rust 启动 ensure_seed（避免依赖 SQLite JSON1 扩展
--      是否被 bundled 编译启用），此处只清理渠道行。
--
-- 序号说明：0025 已被 ai_extension、0026 已被 agent_runtime 占用，本迁移取 0027。

-- 移除已删除的渠道行
DELETE FROM notification_channel WHERE channel_type IN ('WINDOWS', 'MACOS', 'FEISHU', 'DINGTALK', 'WECOM');

--> statement-breakpoint

-- 确保邮件渠道存在（默认停用，用户配置后启用）
INSERT OR IGNORE INTO notification_channel (channel_type, name, enabled, config) VALUES
    ('EMAIL', '邮件', 0, '{"encryption":"SSL","smtpPort":465}');