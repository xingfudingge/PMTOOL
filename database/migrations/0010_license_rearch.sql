-- PMTool · 授权系统重构迁移
-- 设计依据：PMTOOL 设置中心 & 授权管理开发设计稿 2026-09-03
--
-- 核心变更：
-- 1. 扩展 license 表，支持 Ed25519 签名、设备绑定、功能许可
-- 2. 新增 device_fingerprints 表（防试用期篡改）
-- 3. 新增 trial_records 表（7 天试用记录）
-- 4. 添加系统配置项（设备唯一值、试用期状态）

-- ============================================================
-- 1. 扩展 license 表
-- ============================================================

-- 添加新字段（逐步迁移，不影响现有数据）
ALTER TABLE license ADD COLUMN protocol_version TEXT DEFAULT 'PMT1';
ALTER TABLE license ADD COLUMN product TEXT DEFAULT 'PMTOOL';
ALTER TABLE license ADD COLUMN license_id TEXT;
ALTER TABLE license ADD COLUMN device_id TEXT;
ALTER TABLE license ADD COLUMN license_type TEXT DEFAULT 'YEAR';
ALTER TABLE license ADD COLUMN edition TEXT DEFAULT 'PROFESSIONAL';
ALTER TABLE license ADD COLUMN features TEXT;  -- JSON 数组
ALTER TABLE license ADD COLUMN start_time TEXT;
ALTER TABLE license ADD COLUMN expire_time TEXT;

-- 重命名旧字段为兼容（如果存在）
-- expire_date -> expire_time (已通过 ADD COLUMN 处理，现在两列共存)
-- 后续清理时可考虑删除 expire_date 列

-- ============================================================
-- 2. 创建设备指纹表（防试用期篡改）
-- ============================================================

CREATE TABLE IF NOT EXISTS device_fingerprints (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id     TEXT NOT NULL UNIQUE,
    first_seen    TEXT NOT NULL,              -- 首次使用时间
    last_seen     TEXT NOT NULL,              -- 最后使用时间
    hardware_hash TEXT NOT NULL,              -- 硬件信息哈希
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_df_device ON device_fingerprints(device_id);

-- ============================================================
-- 3. 创建试用期记录表
-- ============================================================

CREATE TABLE IF NOT EXISTS trial_records (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id   TEXT NOT NULL UNIQUE,
    started_at  TEXT NOT NULL,                -- ISO 8601
    days_used   INTEGER DEFAULT 0,
    is_active   INTEGER DEFAULT 1,            -- 1=试用中，0=已结束/已授权
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (device_id) REFERENCES device_fingerprints(device_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_trial_device ON trial_records(device_id);
CREATE INDEX IF NOT EXISTS idx_trial_active ON trial_records(is_active);

-- ============================================================
-- 4. 添加系统配置项
-- ============================================================

-- 设备唯一值配置
INSERT OR IGNORE INTO system_config (config_key, config_value)
VALUES ('device_id', NULL);

-- 试用期配置
INSERT OR IGNORE INTO system_config (config_key, config_value)
VALUES ('trial_started_at', NULL);

-- 授权协议版本
INSERT OR IGNORE INTO system_config (config_key, config_value)
VALUES ('license_protocol_version', 'PMT1');

-- ============================================================
-- 5. 兼容性处理
-- ============================================================

-- 为现有 license 记录生成默认的 license_id 和 device_id（如果为空）
-- 注意：现有记录没有设备绑定，使用 NULL 或占位符
UPDATE license
SET license_id = lower(hex(randomblob(16)))
WHERE license_id IS NULL;

-- 标记所有现有记录为无设备绑定
UPDATE license
SET device_id = 'UNBOUND'
WHERE device_id IS NULL OR device_id = '';

-- ============================================================
-- 6. 清理过期试用记录
-- ============================================================

-- 清理已过期且无活动的试用记录
DELETE FROM trial_records
WHERE is_active = 0
  AND (julianday('now') - julianday(started_at)) > 30;

-- ============================================================
-- 7. 更新 schema 版本
-- ============================================================

UPDATE system_config
SET config_value = '2.1.1', updated_at = datetime('now')
WHERE config_key = 'schema_version';
