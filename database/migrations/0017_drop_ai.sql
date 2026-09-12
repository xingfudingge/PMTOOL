-- PMTool · 0017 移除全部 AI 功能（2026-09-11 · 维护者拍板：PMTool 不再需要 AI）
-- 说明：AI 工作台/设置 AI 配置/报告 AI 占位页已从前端删除；
--       这里清理数据库里只定义、从未被使用的 AI 表，以及知识中心遗留的 AI 标记/目录。

-- 1. 知识笔记的 is_ai_generated 标记列（先删其索引，再删列）
DROP INDEX IF EXISTS idx_kn_ai;

--> statement-breakpoint

ALTER TABLE knowledge_notes DROP COLUMN is_ai_generated;

--> statement-breakpoint

-- 2. 知识目录：原 SYSTEM_AI（AI 生成）系统目录转回普通目录
UPDATE knowledge_folders SET system_type = 'USER' WHERE system_type = 'SYSTEM_AI';

--> statement-breakpoint

-- 3. AI 相关死表（仅 schema 定义，代码从未使用）
DROP TABLE IF EXISTS ai_messages;
DROP TABLE IF EXISTS ai_sessions;
DROP TABLE IF EXISTS ai_models;
DROP TABLE IF EXISTS knowledge_ai_records;

--> statement-breakpoint

-- 4. AI 会话索引随表删除
DROP INDEX IF EXISTS idx_ai_msg_session;

--> statement-breakpoint

-- 5. 设置项：ai_enabled 默认配置行
DELETE FROM app_settings WHERE key = 'ai_enabled';
