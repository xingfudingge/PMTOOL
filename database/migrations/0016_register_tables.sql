-- PMTool · 0016 登记册体系（2026-09-11 · 维护者拍板）
-- 背景：把 Excel 模板「项目风险登记册」按模板字段重造，并新增三个 sheet 对应的登记册：
--   需求登记册 / 问题登记册 / 其他待办事项
-- 方案：project_issues 加 resolution 列承载风险「当前风险应对情况说明」；
--       新增 3 张项目级登记册表（均带 project_id 外键，随项目级联删除）。

-- 1. 风险登记册加字段：当前风险应对情况说明（Excel 列「当前风险应对情况说明」）
-- ALTER TABLE ADD COLUMN 重复执行会被 db.rs 吞掉 "duplicate column name" 错误 · 幂等
ALTER TABLE project_issues ADD COLUMN resolution TEXT;

--> statement-breakpoint

-- 2. 需求登记册（与 Excel 需求登记册 sheet 对齐）
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
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_req_project ON project_requirements(project_id);

--> statement-breakpoint

-- 3. 问题登记册（与 Excel 问题登记册 sheet 对齐）
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
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_issuelog_project ON project_issue_log(project_id);

--> statement-breakpoint

-- 4. 其他待办事项（与 Excel 其他待办事项 sheet 对齐）
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
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_todoitem_project ON project_todo_items(project_id);