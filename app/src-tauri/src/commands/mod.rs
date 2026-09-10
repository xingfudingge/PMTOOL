/**
 * PMTool · Tauri Commands 业务命名层
 * Phase 0 · T0.4e
 *
 * 设计依据：RFC-03 §1 分层架构
 *   React Page → Feature Service → Tauri Typed Command → Rust Service → Repository → SQLite
 *
 * 限制：
 *   - 只提供业务语义 commands（如 list_projects / create_todo）
 *   - 禁止 execute_sql / query_sql 万能接口
 *   - WebView 端通过 invoke('list_projects', { status }) 调用
 */

pub mod projects;
pub mod todos;
pub mod license;
pub mod clipboard;
pub mod project_tasks;
pub mod project_issues;
pub mod project_members;
pub mod weekly_entries;
pub mod work_notes;
pub mod attachments;
pub mod holidays;
pub mod reports;
pub mod project_files;
pub mod knowledge;
pub mod knowledge_folders;
pub mod knowledge_spaces;
pub mod project_knowledge_bindings;
pub mod template_directory;
pub mod settings;
pub mod backup;
