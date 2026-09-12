-- PMTool · 0017 项目状态收敛为五态（2026-09-11 维护者拍板）
-- 项目状态只允许：启动 START / 规划 PLANNING / 执行 EXECUTING / 监控 MONITORING / 收尾 CLOSING
-- 旧六态映射：
--   PLANNING     → PLANNING
--   IN_PROGRESS  → EXECUTING
--   SUSPENDED    → MONITORING
--   COMPLETED    → CLOSING
--   CANCELLED    → CLOSING（终止并入收尾；历史上已终止项目不再保留独立状态）
--> statement-breakpoint
UPDATE projects SET status = 'PLANNING' WHERE status = 'PLANNING';
--> statement-breakpoint
UPDATE projects SET status = 'EXECUTING' WHERE status = 'IN_PROGRESS';
--> statement-breakpoint
UPDATE projects SET status = 'MONITORING' WHERE status = 'SUSPENDED';
--> statement-breakpoint
UPDATE projects SET status = 'CLOSING' WHERE status IN ('COMPLETED', 'CANCELLED');
--> statement-breakpoint
-- 兜底：未知/遗留值统一回退到 规划
UPDATE projects SET status = 'PLANNING' WHERE status NOT IN ('START', 'PLANNING', 'EXECUTING', 'MONITORING', 'CLOSING');