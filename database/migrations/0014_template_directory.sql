-- 维护者 2026-09-09 · 模板中心：全局模板目录绑定（单行）
-- 模板中心与项目文件管理逻辑一致：用户自选本地模板目录（全局唯一，不属某项目）。
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS template_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),   -- 单行表，恒为 1
  directory_path TEXT,                     -- 绑定的模板目录绝对路径（NULL = 未绑定）
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
INSERT OR IGNORE INTO template_config (id) VALUES (1);
