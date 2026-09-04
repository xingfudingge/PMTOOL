-- 0002 · 维护者 2026-08-25 反馈
-- 主工作区"项目维度"日报 + @ 项目提名 + 报告中心重构

-- 1. todos 加 project_id（关联项目 · 日报按项目分组用）
ALTER TABLE todos ADD COLUMN project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL;

-- 2. todos 加 mentions（JSON 数组 · 存 @ 提名的 project_id 列表）
ALTER TABLE todos ADD COLUMN mentions TEXT DEFAULT '[]';

-- 3. 新建 reports 表（常规报告 + AI 报告统一存）
-- 检查 reports 表是否存在，不存在才创建
CREATE TABLE reports (
    id              INTEGER PRIMARY KEY,
    report_type     TEXT NOT NULL,                          -- 'daily' | 'weekly' | 'monthly' | 'project_summary' | 'phase_report'
    scope           TEXT NOT NULL,                          -- 'personal' | 'project'
    project_id      INTEGER REFERENCES projects(id) ON DELETE SET NULL,
    period          TEXT NOT NULL,                          -- 'YYYY-MM-DD' | 'YYYY-Www' | 'YYYY-MM' | 自定义
    title           TEXT NOT NULL,
    content         TEXT NOT NULL,                          -- 完整 Markdown
    source          TEXT DEFAULT 'NORMAL',                   -- 'NORMAL' | 'AI'
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX idx_report_type        ON reports(report_type);
CREATE INDEX idx_report_scope       ON reports(scope);
CREATE INDEX idx_report_project     ON reports(project_id);
CREATE INDEX idx_report_period      ON reports(period);
