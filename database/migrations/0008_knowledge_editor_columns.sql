-- 维护者 2026-08-31 · 知识中心 / DocumentEditor 接入
-- 复用已有 knowledge_notes 表（0001_init.sql），为它补 3 列 + 1 索引，兼容老数据

ALTER TABLE knowledge_notes ADD COLUMN content_md TEXT;
ALTER TABLE knowledge_notes ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;
ALTER TABLE knowledge_notes ADD COLUMN space TEXT NOT NULL DEFAULT 'personal';
CREATE INDEX IF NOT EXISTS idx_knowledge_notes_space ON knowledge_notes(space);