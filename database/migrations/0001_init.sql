-- PMTool V2.0 · SQLite 数据库 schema
-- 设计稿 §13-16 · 20 张表 · 索引齐全
-- 版本：2026-08-21 · Phase 0 T0.4

-- ============================================================
-- 1. 系统表
-- ============================================================

-- 软件配置（KV 表）
CREATE TABLE IF NOT EXISTS system_config (
    id          INTEGER PRIMARY KEY,
    config_key  TEXT NOT NULL UNIQUE,
    config_value TEXT,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint

-- License 授权
CREATE TABLE IF NOT EXISTS license (
    id            INTEGER PRIMARY KEY,
    license_key   TEXT NOT NULL UNIQUE,
    customer_name TEXT,
    expire_date   DATE NOT NULL,
    status        INTEGER NOT NULL DEFAULT 1,  -- 0=无效 1=有效
    signature     TEXT NOT NULL,                 -- RSA 签名
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint

-- ============================================================
-- 2. 项目相关表
-- ============================================================

-- 项目
CREATE TABLE IF NOT EXISTS projects (
    id              INTEGER PRIMARY KEY,
    project_code    TEXT NOT NULL UNIQUE,
    project_name    TEXT NOT NULL,
    customer_name   TEXT,
    status          TEXT NOT NULL DEFAULT 'PLANNING',  -- PLANNING/IN_PROGRESS/SUSPENDED/COMPLETED/CANCELLED
    priority        TEXT NOT NULL DEFAULT 'NORMAL',    -- LOW/NORMAL/HIGH/URGENT
    owner           TEXT,                                -- 项目负责人
    start_date      DATE,
    end_date        DATE,
    contract_amount REAL,
    background      TEXT,                                -- 项目背景
    objective       TEXT,                                -- 建设目标
    scope           TEXT,                                -- 实施范围
    description     TEXT,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint

-- 项目任务（支持父任务 + 无限子任务）
CREATE TABLE IF NOT EXISTS project_tasks (
    id          INTEGER PRIMARY KEY,
    project_id  INTEGER NOT NULL,
    parent_id   INTEGER,                                  -- 父任务 ID（NULL = 顶层任务）
    task_name   TEXT NOT NULL,
    owner       TEXT,                                     -- 跟进人
    start_date  DATE,
    end_date    DATE,
    work_days   INTEGER DEFAULT 0,                        -- 工作日工时
    progress    REAL DEFAULT 0,                            -- 完成度 0-100
    status      TEXT NOT NULL DEFAULT 'PENDING',          -- PENDING/IN_PROGRESS/COMPLETED/DELAYED
    remark      TEXT,
    sort_order  INTEGER DEFAULT 0,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES project_tasks(id) ON DELETE CASCADE
);
--> statement-breakpoint

-- 项目问题登记
CREATE TABLE IF NOT EXISTS project_issues (
    id          INTEGER PRIMARY KEY,
    project_id  INTEGER NOT NULL,
    title       TEXT NOT NULL,
    description TEXT,
    level       TEXT NOT NULL DEFAULT 'MEDIUM',           -- LOW/MEDIUM/HIGH/CRITICAL
    owner       TEXT,
    plan_date   DATE,
    actual_date DATE,
    solution    TEXT,
    status      TEXT NOT NULL DEFAULT 'OPEN',             -- OPEN/IN_PROGRESS/RESOLVED/CLOSED
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
--> statement-breakpoint

-- ============================================================
-- 3. 待办表（仅 manual + weekly，维护者 2026-08-21 立 · 废除 plan/risk）
-- ============================================================

CREATE TABLE IF NOT EXISTS todos (
    id             INTEGER PRIMARY KEY,
    title          TEXT NOT NULL,
    content        TEXT,
    priority       TEXT NOT NULL DEFAULT 'NORMAL',         -- LOW/NORMAL/HIGH/URGENT
    status         TEXT NOT NULL DEFAULT 'PENDING',         -- PENDING/IN_PROGRESS/COMPLETED/DELAYED
    start_date     DATE,
    due_date       DATE,
    completed_at   TEXT,                                  -- UTC ISO 8601；用于首页按实际完成日归档
    source_type    TEXT NOT NULL DEFAULT 'MANUAL',          -- MANUAL/WEEKLY（**已废除 PLAN/RISK**）
    source_id      INTEGER,
    remind_time    DATETIME,
    created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint

-- ============================================================
-- 4. 报告表
-- ============================================================

CREATE TABLE IF NOT EXISTS reports (
    id           INTEGER PRIMARY KEY,
    type         TEXT NOT NULL,                            -- DAILY/WEEKLY/MONTHLY/PROJECT_DAILY/PROJECT_WEEKLY/PROJECT_MONTHLY/PROJECT_DELIVERY
    project_id   INTEGER,                                   -- NULL = 个人报告，有值 = 项目报告
    title        TEXT NOT NULL,
    content      TEXT,
    template_id  INTEGER,
    generate_type TEXT NOT NULL DEFAULT 'MANUAL',           -- MANUAL/AUTO/AI
    status       TEXT NOT NULL DEFAULT 'DRAFT',             -- DRAFT/PUBLISHED/ARCHIVED
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
    FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE SET NULL
);
--> statement-breakpoint

-- ============================================================
-- 5. 知识库表
-- ============================================================

-- 知识笔记（project_id NULL=个人知识库，有值=项目知识库）
CREATE TABLE IF NOT EXISTS knowledge_notes (
    id            INTEGER PRIMARY KEY,
    project_id    INTEGER,                                  -- NULL=个人，有值=项目
    title         TEXT NOT NULL,
    content       TEXT,
    content_type  TEXT NOT NULL DEFAULT 'MARKDOWN',         -- MARKDOWN/TEXT/IMAGE/FILE/LINK
    category      TEXT,
    source_type   TEXT NOT NULL DEFAULT 'USER',             -- USER/AI/IMPORT
    is_ai_generated INTEGER NOT NULL DEFAULT 0,
    created_by    TEXT,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
--> statement-breakpoint

-- 知识标签
CREATE TABLE IF NOT EXISTS knowledge_tags (
    id        INTEGER PRIMARY KEY,
    tag_name  TEXT NOT NULL UNIQUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint

-- 知识-标签关联
CREATE TABLE IF NOT EXISTS knowledge_note_tags (
    id      INTEGER PRIMARY KEY,
    note_id INTEGER NOT NULL,
    tag_id  INTEGER NOT NULL,
    UNIQUE(note_id, tag_id),
    FOREIGN KEY (note_id) REFERENCES knowledge_notes(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES knowledge_tags(id) ON DELETE CASCADE
);
--> statement-breakpoint

-- AI 操作记录
CREATE TABLE IF NOT EXISTS knowledge_ai_records (
    id             INTEGER PRIMARY KEY,
    note_id        INTEGER NOT NULL,
    action         TEXT NOT NULL,                          -- SUMMARY/REWRITE/EXTRACT/GENERATE
    input_content  TEXT,
    output_content TEXT,
    created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (note_id) REFERENCES knowledge_notes(id) ON DELETE CASCADE
);
--> statement-breakpoint

-- ============================================================
-- 6. 模板表
-- ============================================================

CREATE TABLE IF NOT EXISTS templates (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    type       TEXT NOT NULL DEFAULT 'BASE',              -- BASE/AI
    category   TEXT NOT NULL,                              -- DAILY_REPORT/WEEKLY_REPORT/MONTHLY_REPORT/PROJECT_DOC
    content    TEXT NOT NULL,
    is_system  INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint

-- 模板变量
CREATE TABLE IF NOT EXISTS template_variables (
    id             INTEGER PRIMARY KEY,
    template_id    INTEGER NOT NULL,
    variable_key    TEXT NOT NULL,                          -- {{project_name}}
    variable_name   TEXT NOT NULL,                          -- 项目名称
    required        INTEGER NOT NULL DEFAULT 1,
    default_value   TEXT,
    FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE CASCADE,
    UNIQUE(template_id, variable_key)
);
--> statement-breakpoint

-- ============================================================
-- 7. AI 表
-- ============================================================

-- AI 模型配置
CREATE TABLE IF NOT EXISTS ai_models (
    id         INTEGER PRIMARY KEY,
    provider   TEXT NOT NULL,                              -- OPENAI/CLAUDE/GEMINI/DEEPSEEK/QWEN/ZHIPU/OLLAMA/CUSTOM
    model_name TEXT NOT NULL,
    api_url    TEXT,
    api_key    TEXT,
    enabled    INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(provider, model_name)
);
--> statement-breakpoint

-- AI 会话
CREATE TABLE IF NOT EXISTS ai_sessions (
    id         INTEGER PRIMARY KEY,
    title      TEXT,
    model_id   INTEGER NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (model_id) REFERENCES ai_models(id) ON DELETE CASCADE
);
--> statement-breakpoint

-- AI 消息
CREATE TABLE IF NOT EXISTS ai_messages (
    id         INTEGER PRIMARY KEY,
    session_id INTEGER NOT NULL,
    role       TEXT NOT NULL,                               -- USER/ASSISTANT/SYSTEM
    content    TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES ai_sessions(id) ON DELETE CASCADE
);
--> statement-breakpoint

-- ============================================================
-- 8. 日历和节假日
-- ============================================================

CREATE TABLE IF NOT EXISTS holidays (
    id          INTEGER PRIMARY KEY,
    date        DATE NOT NULL UNIQUE,
    name        TEXT NOT NULL,                              -- 元旦/春节/...
    type        TEXT NOT NULL,                              -- HOLIDAY/WORKDAY_SHIFT（调休）
    is_workday  INTEGER NOT NULL DEFAULT 0,                  -- 1=调休上班，0=放假
    source      TEXT DEFAULT 'NATIONAL_API',                 -- NATIONAL_API/MANUAL
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint

-- 排班配置
CREATE TABLE IF NOT EXISTS work_schedule (
    id         INTEGER PRIMARY KEY,
    weekday    INTEGER NOT NULL UNIQUE,                      -- 1=周一 ... 7=周日
    is_workday INTEGER NOT NULL DEFAULT 1,                  -- 0=休息 1=工作
    work_hours REAL DEFAULT 8.0
);
--> statement-breakpoint

-- ============================================================
-- 9. 附件表
-- ============================================================

CREATE TABLE IF NOT EXISTS attachments (
    id          INTEGER PRIMARY KEY,
    owner_type  TEXT NOT NULL,                              -- PROJECT/REPORT/KNOWLEDGE/TEMPLATE
    owner_id    INTEGER NOT NULL,
    file_name   TEXT NOT NULL,
    file_path   TEXT NOT NULL,
    file_size   INTEGER,
    file_type   TEXT,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(owner_type, owner_id, file_name)
);
--> statement-breakpoint

-- ============================================================
-- 10. 操作日志
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_logs (
    id          INTEGER PRIMARY KEY,
    action      TEXT NOT NULL,                              -- DELETE/MODIFY/IMPORT/EXPORT
    target_type TEXT NOT NULL,
    target_id   INTEGER,
    content     TEXT,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint

-- ============================================================
-- 索引（设计稿 §17）
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_project_status       ON projects(status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_task_project         ON project_tasks(project_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_task_parent          ON project_tasks(parent_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_task_date            ON project_tasks(start_date, end_date);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_issue_project        ON project_issues(project_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_todo_status          ON todos(status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_todo_due             ON todos(due_date);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_todo_source          ON todos(source_type);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_report_type          ON reports(type);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_report_project       ON reports(project_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_knowledge_project    ON knowledge_notes(project_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_knowledge_source     ON knowledge_notes(source_type);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_ai_msg_session       ON ai_messages(session_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_holiday_date         ON holidays(date);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_audit_action         ON audit_logs(action);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_audit_target         ON audit_logs(target_type, target_id);
--> statement-breakpoint

-- ============================================================
-- 默认数据（应用启动时插入）
-- ============================================================

-- 工作日默认配置（周一-周五工作，周六周日休息）
INSERT OR IGNORE INTO work_schedule (weekday, is_workday, work_hours) VALUES
    (1, 1, 8.0),  -- 周一
    (2, 1, 8.0),  -- 周二
    (3, 1, 8.0),  -- 周三
    (4, 1, 8.0),  -- 周四
    (5, 1, 8.0),  -- 周五
    (6, 0, 0.0),  -- 周六
    (7, 0, 0.0);  -- 周日

-- 默认系统配置
INSERT OR IGNORE INTO system_config (config_key, config_value) VALUES
    ('todo_auto_delay', '1'),              -- 默认开启自动顺延
    ('report_auto_generate', '1'),         -- 默认开启报告自动生成
    ('report_daily_time', '18:00'),        -- 每天 18:00 生成日报
    ('report_weekly_time', 'fri_18:00'),   -- 每周五 18:00 生成周报
    ('report_monthly_time', 'last_day_18:00'), -- 每月最后一天 18:00 生成月报
    ('data_dir', '~/PMToolData'),          -- 默认数据目录
    ('ai_enabled', '1'),                   -- 默认开启 AI
    ('theme', 'light');                    -- 默认主题

-- ============================================================
-- schema 版本（用于未来 migration）
-- ============================================================

INSERT OR IGNORE INTO system_config (config_key, config_value) VALUES
    ('schema_version', '2.0.0'),
    ('schema_migrated_at', datetime('now'));
--> statement-breakpoint


--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `migrations` (
    `id` INTEGER PRIMARY KEY AUTOINCREMENT,
    `filename` TEXT NOT NULL UNIQUE,
    `applied_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
INSERT OR IGNORE INTO `migrations` (`filename`) VALUES ('0001_init.sql');
