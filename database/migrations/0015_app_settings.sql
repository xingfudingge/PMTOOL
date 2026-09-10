-- 设置中心：应用设置持久化（key-value 单行键值表 · 2026-09-09）
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,            -- 设置键，如 theme / userName / aiApiKey ...
  value TEXT,                      -- 设置值（统一字符串存储）
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
