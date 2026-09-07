-- PMTool · 知识中心：补齐 knowledge_notes 丢失的 pinned / space 列（2026-09-05 修复）
-- 背景：0008 曾给 knowledge_notes 加 content_md / pinned / space；但 0009 重建
-- knowledge_notes_new 时只保留了 content_md，丢失了 pinned 与 space，
-- 导致 repositories/knowledge_notes.rs 的 SELECT_COLS 读取时报 no such column。
-- 本迁移为已建库（0009 已跑过）补齐两列，并按空间类型回填 space。

ALTER TABLE knowledge_notes ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;

--> statement-breakpoint

ALTER TABLE knowledge_notes ADD COLUMN space TEXT NOT NULL DEFAULT 'personal';

--> statement-breakpoint

-- 按空间类型回填 space：个人=personal / 项目=project
UPDATE knowledge_notes
SET space = (SELECT space_type FROM knowledge_spaces WHERE knowledge_spaces.id = knowledge_notes.space_id)
WHERE space_id IS NOT NULL;