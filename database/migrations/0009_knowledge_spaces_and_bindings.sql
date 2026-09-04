-- PMTool · 知识中心重构迁移
-- 设计依据：PMTOOL 知识中心重构设计 2026-09-03
--
-- 核心变更：
-- 1. 新增 knowledge_spaces 表（独立的个人/项目知识空间）
-- 2. 新增 project_knowledge_bindings 表（项目与知识空间绑定关系）
-- 3. 修改 knowledge_notes 表，用 space_id 替代 project_id 区分空间
-- 4. 迁移现有数据到新的空间体系
-- 5. 创建 AI 生成目录的系统级标记

-- ============================================================
-- 1. 创建知识空间表
-- ============================================================

CREATE TABLE IF NOT EXISTS knowledge_spaces (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    space_type  TEXT NOT NULL,                -- 'personal' / 'project'
    project_id  INTEGER,                      -- 仅当 space_type='project'时有效，否则为 NULL
    name        TEXT NOT NULL,                -- 空间名称（personal 用"个人知识中心"）
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    UNIQUE(space_type, project_id)            -- personal 只能有一个（project_id=NULL）
);

-- 个人知识空间索引
CREATE INDEX IF NOT EXISTS idx_ksp_type ON knowledge_spaces(space_type);
CREATE INDEX IF NOT EXISTS idx_ksp_project ON knowledge_spaces(project_id);

-- ============================================================
-- 2. 创建项目知识绑定表
-- ============================================================

CREATE TABLE IF NOT EXISTS project_knowledge_bindings (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id      INTEGER NOT NULL,
    knowledge_space_id INTEGER NOT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (knowledge_space_id) REFERENCES knowledge_spaces(id) ON DELETE CASCADE,
    UNIQUE(project_id, knowledge_space_id)
);

CREATE INDEX IF NOT EXISTS idx_pkbind_project ON project_knowledge_bindings(project_id);
CREATE INDEX IF NOT EXISTS idx_pkbind_space ON project_knowledge_bindings(knowledge_space_id);

-- ============================================================
-- 5. 迁移现有数据到新的空间体系（先创建空间，再迁移数据）
-- ============================================================

-- 5.1 创建个人知识空间（必须先创建，后续迁移笔记需要用到）
INSERT OR IGNORE INTO knowledge_spaces (space_type, project_id, name)
VALUES ('personal', NULL, '个人知识中心');

-- 5.2 为每个现有项目创建对应的知识空间
INSERT INTO knowledge_spaces (space_type, project_id, name)
SELECT 'project', p.id, p.project_name
FROM projects p
WHERE p.id NOT IN (SELECT project_id FROM knowledge_spaces WHERE space_type = 'project');

-- 5.3 自动绑定所有已有项目到其知识空间
INSERT OR IGNORE INTO project_knowledge_bindings (project_id, knowledge_space_id)
SELECT
    p.id as project_id,
    ks.id as knowledge_space_id
FROM projects p
JOIN knowledge_spaces ks ON ks.space_type = 'project' AND ks.project_id = p.id
WHERE NOT EXISTS (
    SELECT 1 FROM project_knowledge_bindings pb WHERE pb.project_id = p.id
);

-- ============================================================
-- 3. 修改 knowledge_notes 表结构
-- ============================================================

-- 备份旧表（用于迁移）
CREATE TABLE IF NOT EXISTS knowledge_notes_backup AS
SELECT * FROM knowledge_notes;

-- 创建新表结构
CREATE TABLE IF NOT EXISTS knowledge_notes_new (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    space_id      INTEGER NOT NULL,           -- 新增：知识空间 ID
    title         TEXT NOT NULL,
    content       TEXT,                       -- BlockNote JSON
    content_md    TEXT,                       -- Markdown 快照（搜索用）
    content_type  TEXT NOT NULL DEFAULT 'BLOCKNOTE_JSON',
    folder_id     INTEGER,                    -- 所属目录
    category      TEXT,
    source_type   TEXT NOT NULL DEFAULT 'USER',
    is_ai_generated INTEGER NOT NULL DEFAULT 0,
    created_by    TEXT,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (space_id) REFERENCES knowledge_spaces(id) ON DELETE CASCADE,
    FOREIGN KEY (folder_id) REFERENCES knowledge_folders(id) ON DELETE SET NULL
);

-- 迁移数据：personal -> 个人空间，project -> 对应项目空间
INSERT INTO knowledge_notes_new (
    space_id, title, content, content_md, content_type, folder_id,
    category, source_type, is_ai_generated, created_by, created_at, updated_at
)
SELECT
    CASE
        -- 原 project_id=NULL 的记录 -> 个人空间
        WHEN kn.project_id IS NULL THEN
            (SELECT id FROM knowledge_spaces WHERE space_type = 'PERSONAL' AND project_id IS NULL)
        -- 原 project_id 有值的记录 -> 对应项目空间
        ELSE
            (SELECT ks.id FROM knowledge_spaces ks
             WHERE ks.space_type = 'PROJECT' AND ks.project_id = kn.project_id)
    END as space_id,
    kn.title,
    kn.content,
    kn.content_md,
    kn.content_type,
    kn.folder_id,
    kn.category,
    kn.source_type,
    kn.is_ai_generated,
    kn.created_by,
    kn.created_at,
    kn.updated_at
FROM knowledge_notes_backup kn;

-- 替换旧表
DROP TABLE knowledge_notes;
ALTER TABLE knowledge_notes_new RENAME TO knowledge_notes;

-- 重建索引
CREATE INDEX IF NOT EXISTS idx_kn_space ON knowledge_notes(space_id);
CREATE INDEX IF NOT EXISTS idx_kn_folder ON knowledge_notes(folder_id);
CREATE INDEX IF NOT EXISTS idx_kn_source ON knowledge_notes(source_type);
CREATE INDEX IF NOT EXISTS idx_kn_ai ON knowledge_notes(is_ai_generated);

-- ============================================================
-- 4. 修改 knowledge_folders 表结构
-- ============================================================

-- 添加 sort_order 字段（如不存在）
ALTER TABLE knowledge_folders ADD COLUMN sort_order INTEGER DEFAULT 0;

-- 添加 system_type 字段（标记 AI 生成目录等特殊目录）
ALTER TABLE knowledge_folders ADD COLUMN system_type TEXT DEFAULT 'USER';
-- system_type: USER / SYSTEM_AI / PROJECT_ROOT

-- 重建索引（包含 system_type 和 sort_order）
DROP INDEX IF EXISTS idx_kf_space;
CREATE INDEX IF NOT EXISTS idx_kf_space ON knowledge_folders(space, project_id, system_type);

-- ============================================================
-- 6. 迁移 knowledge_folders 数据
-- ============================================================

-- 为现有目录添加 system_type（默认为 USER）
UPDATE knowledge_folders
SET system_type = 'USER'
WHERE system_type IS NULL;

-- 为每个项目空间创建系统根目录（PROJECT_ROOT）
-- 这个目录在项目中心显示为项目名称本身
INSERT INTO knowledge_folders (
    parent_id, space, project_id, name, sort_order, system_type, created_at, updated_at
)
SELECT
    NULL,           -- 根目录
    'personal',
    NULL,
    '根目录',
    0,
    'PROJECT_ROOT',
    datetime('now'),
    datetime('now')
FROM knowledge_spaces
WHERE space_type = 'PERSONAL'
AND NOT EXISTS (
    SELECT 1 FROM knowledge_folders kf
    WHERE kf.space = 'personal' AND kf.project_id IS NULL AND kf.system_type = 'PROJECT_ROOT'
);

-- 为项目空间创建系统根目录
INSERT INTO knowledge_folders (
    parent_id, space, project_id, name, sort_order, system_type, created_at, updated_at
)
SELECT
    NULL,
    'project',
    ks.project_id,
    p.project_name,  -- 项目名作为根目录名
    0,
    'PROJECT_ROOT',
    datetime('now'),
    datetime('now')
FROM knowledge_spaces ks
JOIN projects p ON p.id = ks.project_id
WHERE ks.space_type = 'PROJECT'
AND NOT EXISTS (
    SELECT 1 FROM knowledge_folders kf
    WHERE kf.space = 'project' AND kf.project_id = ks.project_id AND kf.system_type = 'PROJECT_ROOT'
);

-- 迁移现有项目的文件夹到对应的项目空间
UPDATE knowledge_folders
SET space = 'project', project_id = (
    SELECT project_id FROM knowledge_spaces WHERE space_type = 'PROJECT' AND project_id = knowledge_folders.project_id
)
WHERE space = 'personal' AND project_id IS NOT NULL;

-- ============================================================
-- 7. 清理工作
-- ============================================================

-- 清理旧备份表（可选，如需回滚可保留）
DROP TABLE IF EXISTS knowledge_notes_backup;
DROP TABLE IF EXISTS knowledge_folders_backup;

-- ============================================================
-- 8. 更新 system_config 记录版本
-- ============================================================

INSERT OR REPLACE INTO system_config (config_key, config_value, updated_at)
VALUES ('schema_version', '2.1.0', datetime('now'));

-- ============================================================
-- 迁移验证查询（供开发者测试）
-- ============================================================

-- 查看个人知识空间
-- SELECT * FROM knowledge_spaces WHERE space_type = 'PERSONAL';

-- 查看项目知识空间
-- SELECT * FROM knowledge_spaces WHERE space_type = 'PROJECT';

-- 查看绑定关系
-- SELECT pb.*, ks.name as space_name, p.project_name
-- FROM project_knowledge_bindings pb
-- JOIN knowledge_spaces ks ON ks.id = pb.knowledge_space_id
-- JOIN projects p ON p.id = pb.project_id;

-- 查看知识笔记统计
-- SELECT ks.space_type, COUNT(kn.id) as note_count
-- FROM knowledge_notes kn
-- JOIN knowledge_spaces ks ON ks.id = kn.space_id
-- GROUP BY ks.space_type;

-- 查看目录统计
-- SELECT ks.space_type, kf.system_type, COUNT(kf.id) as folder_count
-- FROM knowledge_folders kf
-- JOIN knowledge_spaces ks ON ks.id = kf.space_id  -- 需要添加此关联
-- GROUP BY ks.space_type, kf.system_type;
