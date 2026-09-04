-- PMTool · 知识中心目录树（维护者 2026-08-31 · Phase C）
--
-- 设计：
--   - knowledge_folders 是一棵 self-FK 的树（parent_id nullable → root 节点）
--   - space: 'personal' | 'project' · project 维度下 project_id 必填
--   - knowledge_notes 加 folder_id 外键（nullable · 根节点笔记 = NULL）
--   - 唯一索引 (space, project_id, parent_id, name) 防止同级重名
--
-- 删除策略：手动级联（应用层删 folder 前先把该 folder 下笔记 folder_id 置 NULL）

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS knowledge_folders (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id   INTEGER REFERENCES knowledge_folders(id) ON DELETE RESTRICT,
    space       TEXT    NOT NULL DEFAULT 'personal' CHECK (space IN ('personal', 'project')),
    project_id  INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    name        TEXT    NOT NULL,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_knowledge_folders_parent  ON knowledge_folders(parent_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_knowledge_folders_space   ON knowledge_folders(space, project_id);

--> statement-breakpoint
ALTER TABLE knowledge_notes ADD COLUMN folder_id INTEGER REFERENCES knowledge_folders(id) ON DELETE SET NULL;

--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_knowledge_notes_folder ON knowledge_notes(folder_id);
