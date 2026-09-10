-- 主工作区·今日工作内容/下个工作日计划 持久化（2026-09-08）
-- 之前存 localStorage（pmtool.home.workNotes）· WebView 缓存清理即丢 · 改为入库
-- 结构：按 note_date 唯一（一天一条）· today=今日工作内容 · next=下个工作日计划
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS work_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  note_date TEXT NOT NULL UNIQUE,        -- YYYY-MM-DD
  today_content TEXT DEFAULT '',         -- 今日工作内容（多行自由文本）
  next_workday TEXT DEFAULT '',          -- 下个工作日标题/日期描述
  next_content TEXT DEFAULT '',          -- 下个工作日计划（多行自由文本）
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_work_notes_date ON work_notes(note_date);