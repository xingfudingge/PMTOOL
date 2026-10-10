-- PMTool · 0020 Document Engine 核心表（2026-09-18 · 统一文档基础设施）
-- 设计依据：docs/document-engine-rfc-2026-09-18.md §5
--   文档：documents（元数据）+ document_versions（版本）
-- 约定：
--   - 文档二进制产物（source/export/preview）落 PMToolData/doc/{doc_id}/，不落库
--   - DB 只存元数据 + 版本序列化内容 + Markdown 快照（搜索用）
--   - 生成默认建新版（version+1），不覆盖旧版，防后台任务覆盖用户编辑
-- 序号说明：0020 起于 0018 之后；0019 已被 AI 中台（0019_ai_dialog.sql）使用，本项目 DOC 不占用 0019。

-- ============================================================
-- 文档元数据（一条 = 一个逻辑文档）
-- ============================================================
CREATE TABLE IF NOT EXISTS documents (
    id              INTEGER PRIMARY KEY,
    doc_id          TEXT NOT NULL UNIQUE,           -- 'doc_xxx'（业务弱引用）
    type            TEXT NOT NULL,                  -- TEXT/MARKDOWN/RICHTEXT/DOCX
    title           TEXT NOT NULL,
    space_type      TEXT,                           -- KNOWLEDGE/REPORT/PROJECT_FILE/TEMPLATE（NULL=独立文档）
    ref_id          INTEGER,                        -- 对应业务实体 id
    current_version INTEGER NOT NULL DEFAULT 1,
    storage_path    TEXT,                           -- 相对 PMToolData/doc/{doc_id}/ 的产物路径
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_doc_space ON documents(space_type, ref_id);

--> statement-breakpoint

-- ============================================================
-- 文档版本（一个文档多版本）
-- ============================================================
CREATE TABLE IF NOT EXISTS document_versions (
    id           INTEGER PRIMARY KEY,
    document_id  INTEGER NOT NULL,
    version      INTEGER NOT NULL,
    content      TEXT,                              -- 序列化内容（Text/Markdown/RichText JSON）
    content_type TEXT NOT NULL,                     -- TEXT/MARKDOWN/BLOCKNOTE_JSON/PROTO
    content_md   TEXT,                              -- Markdown 快照（搜索用）
    created_by   TEXT NOT NULL DEFAULT 'USER',      -- USER/AI/AUTO
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
    UNIQUE(document_id, version)
);
CREATE INDEX IF NOT EXISTS idx_docver_document ON document_versions(document_id);
