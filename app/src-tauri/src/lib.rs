/**
 * PMTool Tauri 2.x · 后端入口
 * Phase 0 · T0.4e 架构重构后版本
 * Phase 4 · T4.7/T4.8/T4.9 新增 commands 注册
 *
 * 设计依据：
 *   - RFC-01 数据合同（16 张表）
 *   - RFC-02 业务规则
 *   - RFC-03 桌面运行与安全（架构边界 + capability）
 *   - PM 决策 B1：严格执行分层，禁止 WebView 直 SQL
 *   - PM 2026-08-22 拍板 A：Phase 4 capability expansion 可修改 lib.rs 注册新 commands
 *     但禁止修改 schema / 分层架构 / 已有 command 行为
 *
 * 后续 Phase 会陆续加入：
 *   - Phase 1: License 授权（已加）
 *   - Phase 2: 主工作区 API
 *   - Phase 3: 待办 API（已加）
 *   - Phase 4: 项目 API · 项目任务 API · 项目问题 API · 文件管理 API（已加）
 *   - Phase 5-9: 陆续加入
 */

pub mod commands;
pub mod crypto;
pub mod crypto_ed25519;  // Ed25519 签名验签工具
pub mod db;
pub mod repositories;
pub mod services;

use std::sync::{Arc, Mutex};
use tauri::Manager;

/// 文件存储 Provider 类型别名（Phase 4 T4.9）
pub type BoxedProvider = Arc<dyn services::file_storage::FileStorageProvider>;

/// 应用全局状态
/// RFC-03 §1：State 由 Tauri 管理，commands 通过 State<AppState> 注入
pub struct AppState {
    /// rusqlite 连接（Mutex 保护）
    pub db: Mutex<rusqlite::Connection>,
    /// 文件存储 Provider（Phase 4 T4.9）
    pub file_storage: BoxedProvider,
    /// 应用数据目录 app_data_dir（设置中心「数据」分区用）
    pub data_dir: std::path::PathBuf,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // 获取应用数据目录（RFC-03 §2：使用 OS 应用数据目录）
            let default_data_dir = app
                .path()
                .app_data_dir()
                .expect("无法获取 app_data_dir");

            // 数据目录支持覆盖（设置中心「数据目录自定义」· 读 <默认目录>/data_root.override）
            let override_file = default_data_dir.join("data_root.override");
            let data_dir = services::data_maintenance::read_data_root_override(&override_file)
                .unwrap_or_else(|| default_data_dir.clone());

            // 初始化数据库（建库 + migration）
            let pool = db::init(&data_dir)
                .map_err(|e| format!("DB init failed: {}", e))?;

            // 初始化文件存储 Provider（Phase 4 T4.9）
            let file_storage: BoxedProvider =
                Arc::new(services::file_storage_local::LocalFileStorageProvider::new(
                    data_dir.join("PMToolData"),
                ));

            // 注册应用状态
            app.manage(AppState {
                db: pool,
                file_storage,
                data_dir: data_dir.clone(),
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // 项目 commands（PM 决策 B1 优先级最高）
            commands::projects::list_projects,
            commands::projects::get_project,
            commands::projects::create_project,
            commands::projects::update_project,
            commands::projects::delete_project,
            // 项目任务 commands（Phase 4 T4.7）
            commands::project_tasks::list_project_tasks,
            commands::project_tasks::list_project_leaf_tasks,
            commands::project_tasks::get_project_task,
            commands::project_tasks::create_project_task,
            commands::project_tasks::import_project_tasks_bulk,
            commands::project_tasks::update_project_task,
            commands::project_tasks::delete_project_task,
            // 项目问题 commands（Phase 4 T4.8）
            commands::project_issues::list_project_issues,
            commands::project_issues::get_project_issue,
            commands::project_issues::create_project_issue,
            commands::project_issues::update_project_issue,
            commands::project_issues::delete_project_issue,
            // 项目成员 commands（Phase 5 · 2026-08-26 维护者拍板）
            commands::project_members::list_project_members,
            commands::project_members::get_project_member,
            commands::project_members::create_project_member,
            commands::project_members::update_project_member,
            commands::project_members::delete_project_member,
            // 周报条目 commands（Phase 5 · 2026-08-26 维护者拍板）
            commands::weekly_entries::list_weekly_entries,
            commands::weekly_entries::get_weekly_entry,
            commands::weekly_entries::create_weekly_entry,
            commands::weekly_entries::update_weekly_entry,
            commands::weekly_entries::delete_weekly_entry,
            // 附件 commands（Phase 4 T4.9）
            commands::attachments::list_attachments,
            commands::attachments::upload_attachment,
            commands::attachments::delete_attachment,
            commands::attachments::get_attachment_path,
            commands::attachments::open_attachment,
            commands::attachments::refresh_attachment,
            // 待办 commands（Phase 3）
            commands::todos::list_todos,
            commands::todos::get_todo,
            commands::todos::create_todo,
            commands::todos::update_todo,
            commands::todos::complete_todo,
            commands::todos::uncomplete_todo,
            commands::todos::delete_todo,
            // License commands (Phase 1 - 简化授权系统)
            commands::license::verify_license,              // 旧版 (向后兼容)
            commands::license::get_license_status,          // 旧版 (向后兼容)
            commands::license::deactivate_license,          // 旧版 (向后兼容)
            commands::license::get_device_id,               // 新：获取设备 ID
            commands::license::activate_license_simple,     // 新：授权码激活
            commands::license::check_trial_status,          // 新：检查试用状态
            commands::license::start_trial,                 // 新：主动开始 7 天试用
            commands::license::expire_overdue_licenses,     // 新：清理过期授权
            commands::clipboard::copy_to_clipboard,          // 新：复制到剪贴板
            // Holidays commands（Phase 4.5 · 维护者 2026-08-25 反馈补全）
            commands::holidays::list_holidays,
            // Reports commands（维护者 2026-08-25 · 报告中心重构）
            commands::reports::list_reports,
            commands::reports::get_report,
            commands::reports::create_report,
            commands::reports::update_report,
            commands::reports::delete_report,
            commands::work_notes::get_work_note,
            commands::work_notes::save_work_note,
            // 项目文件 commands（维护者 2026-08-31 · FilesTab 后端）
            commands::project_files::pick_project_directory,
            commands::project_files::set_project_local_directory,
            commands::project_files::get_project_local_directory,
            commands::project_files::list_project_files,
            commands::project_files::read_text_file,
            commands::project_files::write_text_file,
            commands::project_files::read_file_bytes,
            commands::project_files::create_file,
            commands::project_files::create_directory_cmd,
            commands::project_files::remove_path_cmd,
            commands::project_files::rename_path_cmd,
            commands::project_files::copy_path_cmd,
            commands::project_files::open_file_external,
            commands::project_files::read_text_file_with_mtime,
            // 知识中心 commands（维护者 2026-08-31 · DocumentEditor 后端）
            commands::knowledge::list_knowledge_notes,
            commands::knowledge::get_knowledge_note,
            commands::knowledge::upsert_knowledge_note,
            commands::knowledge::delete_knowledge_note,
            commands::knowledge::search_knowledge_notes,
            commands::knowledge::search_knowledge_notes_by_space_type,
            // 知识目录 commands（维护者 2026-08-31 · Phase C 三栏布局）
            commands::knowledge_folders::list_knowledge_folders,
            commands::knowledge_folders::list_knowledge_folders_by_project,
            commands::knowledge_folders::list_knowledge_folders_by_space_id,
            commands::knowledge_folders::upsert_knowledge_folder,
            commands::knowledge_folders::ensure_project_knowledge_library,
            commands::knowledge_folders::ensure_ai_knowledge_folder,
            commands::knowledge_folders::ensure_knowledge_ai_folder,
            commands::knowledge_folders::delete_knowledge_folder,
            // 知识空间 commands（2026-09-03 知识中心重构）
            commands::knowledge_spaces::list_personal_knowledge_spaces,
            commands::knowledge_spaces::list_project_knowledge_spaces,
            commands::knowledge_spaces::list_all_project_spaces,
            commands::knowledge_spaces::get_knowledge_space,
            commands::knowledge_spaces::create_knowledge_space,
            commands::knowledge_spaces::delete_knowledge_space,
            // 项目知识绑定 commands（2026-09-03 知识中心重构）
            commands::project_knowledge_bindings::list_project_bindings,
            commands::project_knowledge_bindings::list_space_bindings,
            commands::project_knowledge_bindings::get_binding,
            commands::project_knowledge_bindings::create_binding,
            commands::project_knowledge_bindings::delete_binding,
            commands::project_knowledge_bindings::delete_all_project_bindings,
            // 模板中心 commands（维护者 2026-09-09 · 全局模板目录绑定）
            commands::template_directory::get_template_directory,
            commands::template_directory::set_template_directory,
            // 设置中心 commands（维护者 2026-09-09 · 应用设置持久化 + 数据目录）
            commands::settings::get_all_settings,
            commands::settings::get_setting,
            commands::settings::set_setting,
            commands::settings::get_data_dir,
            // 数据维护 commands（维护者 2026-09-09 · 备份/还原/数据目录迁移）
            commands::backup::backup_data,
            commands::backup::restore_data,
            commands::backup::set_data_root,
            commands::backup::get_backup_location,
            commands::backup::set_backup_location,
            commands::backup::list_backups,
            commands::backup::reveal_path,
            // 工作日同步（维护者 2026-09-09 · 节假日源同步）
            commands::holidays::sync_holidays,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
