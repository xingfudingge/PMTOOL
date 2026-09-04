-- PMTool · 0003 reports 增加 period 列 + 唯一索引
-- 维护者 2026-08-25 · 一天一个日报 / 一周一个周报 / 一月一个月报
-- 重复生成覆盖（upsert by type + project_id + period）

ALTER TABLE reports ADD COLUMN period TEXT;

-- 已有记录按 created_at 反推 period（best-effort · 只对 0002 之后的有效）
-- UTC created_at 取前 10 位（YYYY-MM-DD）当作 period；后续 UI 会按本地时区纠正
UPDATE reports SET period = substr(created_at, 1, 10) WHERE period IS NULL;

-- 唯一索引：每个 (type, project_id, period) 只允许一条
-- 个人报告 project_id IS NULL · 多个 NULL 在 unique index 中视为不同，所以再加 IS NULL 分支
CREATE UNIQUE INDEX IF NOT EXISTS uq_reports_type_project_period
  ON reports(type, project_id, period);

-- 个人报告（project_id IS NULL）需要单独索引
CREATE UNIQUE INDEX IF NOT EXISTS uq_reports_type_null_project_period
  ON reports(type, period)
  WHERE project_id IS NULL;