-- PMTool · 0004 周报条目 + 项目成员 + project_tasks 加 natural_days
-- 维护者 2026-08-26 拍板 · 与 Excel 周报 / 项目成员 sheet 对齐
-- 合并 1 个 migration 一次性应用

-- 1. 周报条目表（与 Excel 周报 sheet 对齐）
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
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_w_work_project_week ON weekly_report_entries(project_id, week_number);
--> statement-breakpoint

-- 2. 项目成员表（与 Excel 项目成员 sheet 对齐）
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
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_p_member_project_party ON project_members(project_id, party);
--> statement-breakpoint

-- 3. project_tasks 加字段：自然日工时（Excel "自然日工时"）
-- ALTER TABLE ADD COLUMN 重复执行会被 db.rs 吞掉 "duplicate column name" 错误 · 幂等
ALTER TABLE project_tasks ADD COLUMN natural_days INTEGER DEFAULT 0;