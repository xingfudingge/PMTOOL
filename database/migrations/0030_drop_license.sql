-- PMTool · 彻底移除授权/试用/设备绑定残留表（2026-11-26）
--
-- 背景：PMTool 取消授权/试用/设备绑定，启动即用、全功能可用。
--   历史迁移 0018 已把授权数据移入 OS 安全存储并 DROP 过旧表，
--   但为保证任何历史库（可能因旧版本/恢复备份）都回到纯业务库，
--   这里再做一次幂等清理。

--> statement-breakpoint

DROP TABLE IF EXISTS license;

--> statement-breakpoint

DROP TABLE IF EXISTS device_fingerprints;

--> statement-breakpoint

DROP TABLE IF EXISTS trial_records;

--> statement-breakpoint

-- 清除 system_config 中遗留的授权相关配置键
DELETE FROM system_config WHERE config_key IN ('device_id', 'trial_started_at', 'license_protocol_version');
