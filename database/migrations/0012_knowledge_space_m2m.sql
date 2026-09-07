-- PMTool · 知识中心：知识空间改为「一库多项目共享」(M:N)（2026-09-07）
--
-- 背景：原来 knowledge_spaces.project_id 把空间锁死为某项目专属（1:1），
-- 且前端用大写 'PROJECT' / 后端查小写 'project' 大小写不一致，导致：
--   - 创建空间后查不到（不展示）；再添加撞 UNIQUE(space_type, project_id) 报错。
--   - 无法让「一个集团知识库被拆分出的多个项目」共享。
--
-- 目标：
--   - 知识空间成为独立容器：project 型空间 project_id=NULL，通过 project_knowledge_bindings 多对多关联项目。
--   - 目录 knowledge_folders 增加 space_id 列，按空间归属（共享库的目录不再锁单个项目）。
--   - space_type 全小写统一。
--
-- 说明：不重建 knowledge_spaces 表去 UNIQUE——SQLite 的 UNIQUE 索引视 NULL 为互异，
-- 因此把 project 空间全置 project_id=NULL 后，可无限个 project 空间共存，无需重建表（避免 DROP 父表级联清子数据）。

-- 1. 统一 space_type 小写（修正历史大写 'PROJECT'/'PERSONAL'）
UPDATE knowledge_spaces SET space_type = lower(space_type) WHERE space_type IS NOT NULL;

--> statement-breakpoint

-- 2. 统一 folders.space 小写
UPDATE knowledge_folders SET space = lower(space) WHERE space IS NOT NULL;

--> statement-breakpoint

-- 3. 给 folders 加 space_id（该列此前在 list_by_space_id 被引用但从未创建 → 潜在 SQL 错误）
ALTER TABLE knowledge_folders ADD COLUMN space_id INTEGER REFERENCES knowledge_spaces(id) ON DELETE CASCADE;

--> statement-breakpoint

-- 4. 回填 folders.space_id：personal 目录→个人空间；project 目录→其所属项目绑定到的空间
UPDATE knowledge_folders
SET space_id = (
    SELECT ks.id FROM knowledge_spaces ks
    WHERE ks.space_type = 'personal'
    ORDER BY ks.id LIMIT 1
)
WHERE space = 'personal' AND space_id IS NULL;

--> statement-breakpoint

UPDATE knowledge_folders
SET space_id = (
    SELECT ks.id FROM knowledge_spaces ks
    WHERE ks.space_type = 'project'
      AND EXISTS (
          SELECT 1 FROM project_knowledge_bindings pb
          WHERE pb.project_id = knowledge_folders.project_id
            AND pb.knowledge_space_id = ks.id
      )
    ORDER BY ks.id LIMIT 1
)
WHERE space = 'project' AND project_id IS NOT NULL AND space_id IS NULL;

--> statement-breakpoint

-- 5. 把 project 空间 project_id 置 NULL（成为独立容器；UNIQUE 对 NULL 互异，不影响多空间共存）
UPDATE knowledge_spaces SET project_id = NULL WHERE space_type = 'project';

--> statement-breakpoint

-- 6. 为 folders 建 space_id 索引
CREATE INDEX IF NOT EXISTS idx_kf_space_id ON knowledge_folders(space_id);

--> statement-breakpoint

-- 7. 记录版本
INSERT OR REPLACE INTO system_config (config_key, config_value, updated_at)
VALUES ('schema_version', '3.0.0', datetime('now'));
