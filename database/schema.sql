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

-- ============================================================
-- 2. 项目相关表
-- ============================================================

-- 项目
CREATE TABLE IF NOT EXISTS projects (
    id              INTEGER PRIMARY KEY,
    project_code    TEXT NOT NULL UNIQUE,
    project_name    TEXT NOT NULL,
    customer_name   TEXT,
    status          TEXT NOT NULL DEFAULT 'PLANNING',  -- 五态：START/PLANNING/EXECUTING/MONITORING/CLOSING
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
    discovered_at DATE,                                  -- 维护者 2026-08-26 补 · 与 Excel 风险登记册「发现时间」列对齐
    solution    TEXT,
    resolution  TEXT,                                    -- 2026-09-11 补 · 风险登记册「当前风险应对情况说明」
    status      TEXT NOT NULL DEFAULT 'OPEN',             -- OPEN/IN_PROGRESS/RESOLVED/CLOSED
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

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
    generate_type TEXT NOT NULL DEFAULT 'MANUAL',           -- MANUAL/AUTO
    status       TEXT NOT NULL DEFAULT 'DRAFT',             -- DRAFT/PUBLISHED/ARCHIVED
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
    FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE SET NULL
);

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
    folder_id     INTEGER,                                  -- 所属目录，指向 knowledge_folders.id
    category      TEXT,
    source_type   TEXT NOT NULL DEFAULT 'USER',             -- USER/IMPORT
    created_by    TEXT,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (folder_id) REFERENCES knowledge_folders(id) ON DELETE SET NULL
);

-- 知识标签
CREATE TABLE IF NOT EXISTS knowledge_tags (
    id        INTEGER PRIMARY KEY,
    tag_name  TEXT NOT NULL UNIQUE,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 知识-标签关联
CREATE TABLE IF NOT EXISTS knowledge_note_tags (
    id      INTEGER PRIMARY KEY,
    note_id INTEGER NOT NULL,
    tag_id  INTEGER NOT NULL,
    UNIQUE(note_id, tag_id),
    FOREIGN KEY (note_id) REFERENCES knowledge_notes(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES knowledge_tags(id) ON DELETE CASCADE
);

-- ============================================================
-- 6. 模板表
-- ============================================================

CREATE TABLE IF NOT EXISTS templates (
    id         INTEGER PRIMARY KEY,
    name       TEXT NOT NULL,
    type       TEXT NOT NULL DEFAULT 'BASE',              -- BASE
    category   TEXT NOT NULL,                              -- DAILY_REPORT/WEEKLY_REPORT/MONTHLY_REPORT/PROJECT_DOC
    content    TEXT NOT NULL,
    is_system  INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

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

-- ============================================================
-- 7. 日历和节假日
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

-- 排班配置
CREATE TABLE IF NOT EXISTS work_schedule (
    id         INTEGER PRIMARY KEY,
    weekday    INTEGER NOT NULL UNIQUE,                      -- 1=周一 ... 7=周日
    is_workday INTEGER NOT NULL DEFAULT 1,                  -- 0=休息 1=工作
    work_hours REAL DEFAULT 8.0
);

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

-- ============================================================
-- 索引（设计稿 §17）
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_project_status       ON projects(status);
CREATE INDEX IF NOT EXISTS idx_task_project         ON project_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_task_parent          ON project_tasks(parent_id);
CREATE INDEX IF NOT EXISTS idx_task_date            ON project_tasks(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_issue_project        ON project_issues(project_id);
CREATE INDEX IF NOT EXISTS idx_todo_status          ON todos(status);
CREATE INDEX IF NOT EXISTS idx_todo_due             ON todos(due_date);
CREATE INDEX IF NOT EXISTS idx_todo_source          ON todos(source_type);
CREATE INDEX IF NOT EXISTS idx_report_type          ON reports(type);
CREATE INDEX IF NOT EXISTS idx_report_project       ON reports(project_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_project    ON knowledge_notes(project_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_source     ON knowledge_notes(source_type);
CREATE INDEX IF NOT EXISTS idx_holiday_date         ON holidays(date);
CREATE INDEX IF NOT EXISTS idx_audit_action         ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_target         ON audit_logs(target_type, target_id);

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
    ('theme', 'light');                    -- 默认主题

-- ============================================================
-- schema 版本（用于未来 migration）
-- ============================================================

INSERT OR IGNORE INTO system_config (config_key, config_value) VALUES
    ('schema_version', '2.0.0'),
    ('schema_migrated_at', datetime('now'));

-- ============================================================
-- 21. 周报条目表（2026-08-26 维护者拍板 · 与 Excel 周报 sheet 对齐）
-- ============================================================
CREATE TABLE IF NOT EXISTS weekly_report_entries (
    id              INTEGER PRIMARY KEY,
    project_id      INTEGER NOT NULL,
    week_number     INTEGER NOT NULL,
    week_start_date DATE NOT NULL,
    week_end_date   DATE NOT NULL,
    task_name       TEXT NOT NULL,
    plan_start_date DATE,
    plan_end_date   DATE,
    actual_start_date DATE,
    actual_end_date   DATE,
    owner_party_a    TEXT,
    owner_party_b    TEXT,
    completion_note  TEXT,
    is_completed    TEXT NOT NULL DEFAULT 'PENDING',
    section         TEXT NOT NULL DEFAULT 'CURRENT',
    sort_order      INTEGER DEFAULT 0,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_w_work_project_week ON weekly_report_entries(project_id, week_number);

-- ============================================================
-- 22. 项目成员表（2026-08-26 维护者拍板 · 与 Excel 项目成员 sheet 对齐）
-- ============================================================
CREATE TABLE IF NOT EXISTS project_members (
    id              INTEGER PRIMARY KEY,
    project_id      INTEGER NOT NULL,
    party           TEXT NOT NULL,
    role            TEXT,
    name            TEXT NOT NULL,
    contact         TEXT,
    participation   TEXT,
    impact          TEXT,
    sort_order      INTEGER DEFAULT 0,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_p_member_project_party ON project_members(project_id, party);

-- ============================================================
-- 23. project_tasks 加字段：自然日工时（Excel "自然日工时"）
-- 单独一行 · ALTER TABLE ADD COLUMN 不能放进 CREATE TABLE 块
-- ============================================================
ALTER TABLE project_tasks ADD COLUMN natural_days INTEGER DEFAULT 0;

-- ============================================================
-- 24. 知识中心树状目录（支持无限层级，维护者 2026-09-02 补）
-- ============================================================
CREATE TABLE IF NOT EXISTS knowledge_folders (
    id          INTEGER PRIMARY KEY,
    parent_id   INTEGER,                                  -- 父目录 ID（NULL=根目录）
    space       TEXT NOT NULL DEFAULT 'PERSONAL',         -- PERSONAL/PROJECT/TEAM
    project_id  INTEGER,                                  -- 项目空间（仅当 space=PROJECT 时有效）
    name        TEXT NOT NULL,
    sort_order  INTEGER DEFAULT 0,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_id) REFERENCES knowledge_folders(id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    UNIQUE(space, project_id, parent_id, name)            -- 同一父目录下的名称唯一
);
CREATE INDEX IF NOT EXISTS idx_kf_parent ON knowledge_folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_kf_space ON knowledge_folders(space, project_id);

-- ============================================================
-- 25. 登记册体系（2026-09-11 维护者拍板 · 与 Excel 登记册 sheet 对齐）
-- ============================================================
CREATE TABLE IF NOT EXISTS project_requirements (
    id          INTEGER PRIMARY KEY,
    project_id  INTEGER NOT NULL,
    type        TEXT NOT NULL DEFAULT 'NEW',     -- 需求类型：NEW/CHANGE/OPTIMIZE/OTHER
    system      TEXT,                            -- 归属系统
    summary     TEXT NOT NULL,                   -- 需求简述（必填）
    detail      TEXT,                            -- 需求详述
    proposed_at DATE,                            -- 提出时间
    proposer    TEXT,                            -- 提出人
    status      TEXT NOT NULL DEFAULT 'PENDING', -- 需求响应状态：PENDING/EVALUATING/CONFIRMED/IMPLEMENTED/REJECTED
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_req_project ON project_requirements(project_id);

CREATE TABLE IF NOT EXISTS project_issue_log (
    id            INTEGER PRIMARY KEY,
    project_id    INTEGER NOT NULL,
    title         TEXT NOT NULL,                 -- 问题描述（必填）
    proposer      TEXT,                          -- 提出人
    module        TEXT,                          -- 涉及系统及模块（参考需规）
    discovered_at DATE,                          -- 发现时间
    plan_date     DATE,                          -- 计划解决时间
    plan_solution TEXT,                          -- 计划解决方案
    handler       TEXT,                          -- 问题处理人
    progress_note TEXT,                          -- 当前处理进度说明
    actual_date   DATE,                          -- 实际处理时间
    status        TEXT NOT NULL DEFAULT 'OPEN',  -- 问题状态：OPEN/IN_PROGRESS/RESOLVED/CLOSED
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_issuelog_project ON project_issue_log(project_id);

CREATE TABLE IF NOT EXISTS project_todo_items (
    id              INTEGER PRIMARY KEY,
    project_id      INTEGER NOT NULL,
    content         TEXT NOT NULL,               -- 代办事项说明（必填）
    related_people  TEXT,                        -- 涉及人员（软件）
    plan_date       DATE,                        -- 计划完成时间
    completion_note TEXT,                        -- 当前完成情况说明
    actual_date     DATE,                        -- 实际完成时间
    status          TEXT NOT NULL DEFAULT 'PENDING', -- 任务状态：PENDING/IN_PROGRESS/COMPLETED/DELAYED
    remark          TEXT,                        -- 备注
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_todoitem_project ON project_todo_items(project_id);
