-- PMTool · 授权体系与数据库彻底隔离（2026-09-16）
--
-- 背景：旧版本把 License / 设备指纹 / 试用记录存在业务数据库，导致
--   数据库备份/恢复可复制授权、启动判定依赖数据库字段。
--   新版本授权核心数据移入 OS 安全存储（Windows Credential Manager /
--   macOS Keychain / Linux Secret Service），数据库不再保存任何授权数据。
--
-- 执行前提：本迁移由 services/auth/migration.rs 在 db::init 之前完成旧授权数据
--   的提取与重新验证（Rust 侧，幂等，迁移标记在安全存储）。本 SQL 只负责
--   DROP 旧授权表 + 清除 system_config 授权键，之后数据库成为纯业务库。
--
-- 注意：Rust 侧 auth 迁移失败/无旧数据时，这些表/键被直接 DROP，
--   用户重新输入授权即可——不降低安全边界（宁可重输，不恢复旧授权状态）。

--> statement-breakpoint

-- 1. 删除授权相关表（全部授权数据已迁移至 OS 安全存储）
DROP TABLE IF EXISTS license;

DROP TABLE IF EXISTS device_fingerprints;

DROP TABLE IF EXISTS trial_records;

--> statement-breakpoint

-- 2. 清除 system_config 中的授权相关配置键
--    （device_id / trial_started_at / license_protocol_version 不再属于数据库）
DELETE FROM system_config WHERE config_key IN ('device_id', 'trial_started_at', 'license_protocol_version');

--> statement-breakpoint

-- 3. 更新 schema 版本
UPDATE system_config
SET config_value = '2.2.0', updated_at = datetime('now')
WHERE config_key = 'schema_version';