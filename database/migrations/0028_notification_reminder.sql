-- PMTool · 0028 通知扫描独立提醒锚点（2026-10-10 · 修复「清空已读后又冒出一堆」）
--
-- 背景：scan_due_tasks 此前用 notification_message.dedup_key（UNIQUE 挂在消息行）做去重，
--   用户「清空已读」删除消息 → 锚点一并消失 → 下次启动扫描把同一批逾期任务重新生成为新未读消息。
--
-- 处理：新增独立 notification_reminder 表保存「扫描类提醒」的幂等锚点。
--   扫描：只在 reminder 表无该 key 时生成消息，生成后写 reminder。
--   消息可被删除/清空，但 reminder 保留 ⇒ 清理后不再重复生成。
--
-- 关键：建表后把存量 notification_message 里 task:* 的 dedup_key 抄进 reminder，
--   避免首次启动扫描又重新生成一遍既有消息。

CREATE TABLE IF NOT EXISTS notification_reminder (
    id          INTEGER PRIMARY KEY,
    dedup_key   TEXT NOT NULL UNIQUE,       -- 扫描类提醒幂等锚点，如 task:12:overdue:2026-09-30
    event_type  TEXT NOT NULL,              -- TASK_OVERDUE / TASK_DUE_SOON / ...
    source_id   INTEGER,                    -- 任务 id
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

--> statement-breakpoint

-- 存量迁移：把已有的 task:* 扫描消息锚点登记为已提醒，防止首次启动重复生成
INSERT OR IGNORE INTO notification_reminder (dedup_key, event_type, source_id)
SELECT dedup_key, event_type, source_id
FROM notification_message
WHERE dedup_key LIKE 'task:%';