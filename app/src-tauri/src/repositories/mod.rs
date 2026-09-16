/**
 * PMTool · 数据访问层（Repository Pattern）
 * Phase 0 · T0.4e
 *
 * 职责：纯 SQL 操作，不含业务逻辑
 * 业务规则在 services 层（Phase 1+ 补充）
 */

pub mod projects;
pub mod todos;
pub mod project_tasks;
pub mod project_issues;
pub mod project_members;
pub mod weekly_entries;
pub mod project_requirements;
pub mod project_issue_log;
pub mod project_todo_items;
pub mod work_notes;
pub mod attachments;
pub mod holidays;
pub mod reports;
pub mod knowledge_notes;
pub mod knowledge_folders;
pub mod knowledge_spaces;
pub mod project_knowledge_bindings;
pub mod template_config;
pub mod app_settings;

// re-export 常用 struct · service / command 层直接 use repositories::ProjectMember
pub use project_members::ProjectMember;
pub use weekly_entries::WeeklyReportEntry;