-- PMTool · 0005 风险登记册加 discovered_at 字段（与 Excel 风险登记册 sheet「发现时间」列对齐）
ALTER TABLE project_issues ADD COLUMN discovered_at DATE;