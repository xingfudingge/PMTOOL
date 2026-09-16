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
    /// 用 Mutex 包裹以支持首启/迁移时热切到自选目录（避免「写入默认库、重启读自选库」丢数据）
    pub data_dir: Mutex<std::path::PathBuf>,
    /// 授权运行时状态（2026-09-16 授权隔离改造：纯运行时，永不落库）
    /// 启动时由 Device Identity + 安全存储 License 独立计算
    pub authorization: Mutex<crate::services::auth::authorization::AuthorizationContext>,
    /// 当前设备绑定值（启动时计算，运行时只读）
    pub device_id: String,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        // 前端 @tauri-apps/plugin-dialog（DocumentEditor 导出 .md / 导入 Markdown）依赖此插件，
        // 未注册时 invoke plugin:dialog|* 会报 "Command not found"
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // 获取应用数据目录（RFC-03 §2：使用 OS 应用数据目录）
            let default_data_dir = app
                .path()
                .app_data_dir()
                .expect("无法获取 app_data_dir");

            // 数据目录支持覆盖（设置中心「数据目录自定义」· 读 <默认目录>/data_root.override）
            let override_file = default_data_dir.join("data_root.override");
            let override_data_dir = services::data_maintenance::read_data_root_override(&override_file);
            let data_dir = override_data_dir.clone().unwrap_or_else(|| default_data_dir.clone());

            // 2026-09-16 健康检查：
            // 若用户自选过目录（data_root.override 存在），但自选目录里没有 pmtool.db，
            // 而默认应用目录里却有 pmtool.db —— 说明旧版本曾把数据写进默认目录（当时切换未生效），
            // 而新版本会去读自选目录（空），导致用户“数据丢失”。
            // 处理：仅在自选目录无库时，把默认目录的库安全迁移到自选目录，绝不覆盖自选目录已有数据。
            if let Some(target) = &override_data_dir {
                let target_db = target.join("pmtool.db");
                let default_db = default_data_dir.join("pmtool.db");
                if !target_db.exists() && default_db.exists() {
                    if let Some(parent) = target_db.parent() {
                        let _ = std::fs::create_dir_all(parent);
                    }
                    std::fs::copy(&default_db, &target_db).map_err(|e| e.to_string()).ok();
                    services::logging::log_line(&format!(
                        "[WARN] 自选目录 {} 无库，检测到默认目录 {} 有数据，已自动迁移以防丢失",
                        target.display(),
                        default_db.display()
                    ));
                }
            }

            // 日志：启动即落盘（panic + 后续错误都进 <数据目录>/pmtool.log）
            let log_path = services::logging::init(&data_dir);
            services::logging::log_line(&format!("[INF] log file = {}", log_path.display()));
            services::logging::log_line(&format!("[INF] data_dir = {}", data_dir.display()));

            // ===== 授权体系启动链路（2026-09-16 隔离改造）=====
            // 1. 当前设备实时计算 Device Identity（纯硬件派生，无 DB）
            let device_identity = services::auth::device_identity::compute_current_identity()
                .unwrap_or_else(|e| {
                    services::logging::log_line(&format!("[ERR] 设备身份计算失败: {}", e));
                    services::auth::device_identity::DeviceIdentity {
                        binding_id: String::new(),
                        multi_feature_fingerprint: String::new(),
                    }
                });
            let device_id = device_identity.binding_id.clone();

            // 2. 旧版数据库授权数据迁移（必须在 db::init 前执行，之后 DROP 旧授权表）
            let storage = services::auth::secure_storage::KeyringStorage;
            let validator = services::auth::license_validator::LicenseValidator::new()
                .map_err(|e| {
                    services::logging::log_line(&format!("[ERR] 授权验证器初始化失败: {}", e));
                    e
                })?;
            match services::auth::migration::migrate_legacy_auth(
                &data_dir.join("pmtool.db"),
                &storage,
                &device_id,
                &validator,
            ) {
                Ok(r) => {
                    if r.migrated {
                        services::logging::log_line(&format!(
                            "[OK] 授权迁移完成 license_imported={} trial_imported={}",
                            r.license_imported, r.trial_imported
                        ));
                    }
                }
                Err(e) => services::logging::log_line(&format!("[WARN] 授权迁移失败: {}", e)),
            }

            // 3. 启动授权判定（Device Identity + 安全存储 License 独立验证，无 DB）
            let authorization_ctx = services::auth::authorization::startup_check(
                &storage,
                &device_id,
                &validator,
            );
            services::logging::log_line(&format!(
                "[INF] 授权状态 code={}",
                authorization_ctx.decision.reason_code().code()
            ));

            // 初始化数据库（建库 + migration）
            let pool = db::init(&data_dir).map_err(|e| {
                services::logging::log_line(&format!("[ERR] DB init failed: {}", e));
                format!("DB init failed: {}", e)
            })?;
            services::logging::log_line("[OK] DB init done");

            // 初始化文件存储 Provider（Phase 4 T4.9）
            let file_storage: BoxedProvider =
                Arc::new(services::file_storage_local::LocalFileStorageProvider::new(
                    data_dir.join("PMToolData"),
                ));

            // 注册应用状态
            app.manage(AppState {
                db: pool,
                file_storage,
                data_dir: Mutex::new(data_dir.clone()),
                authorization: Mutex::new(authorization_ctx),
                device_id,
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
            commands::project_requirements::list_project_requirements,
            commands::project_requirements::get_project_requirement,
            commands::project_requirements::create_project_requirement,
            commands::project_requirements::update_project_requirement,
            commands::project_requirements::delete_project_requirement,
            commands::project_issue_log::list_project_issue_log,
            commands::project_issue_log::get_project_issue_log_entry,
            commands::project_issue_log::create_project_issue_log_entry,
            commands::project_issue_log::update_project_issue_log_entry,
            commands::project_issue_log::delete_project_issue_log_entry,
            commands::project_todo_items::list_project_todo_items,
            commands::project_todo_items::get_project_todo_item,
            commands::project_todo_items::create_project_todo_item,
            commands::project_todo_items::update_project_todo_item,
            commands::project_todo_items::delete_project_todo_item,
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
            // License commands (2026-09-16 授权隔离改造：无 DB 授权数据)
            commands::license::get_device_id,               // 获取设备绑定值（纯计算）
            commands::license::get_authorization_state,     // 获取授权状态（运行时判定结果）
            commands::license::activate_license_simple,     // 授权码激活（安全存储）
            commands::license::start_trial,                 // 开始 7 天试用（安全存储）
            commands::license::delete_license,              // 删除授权（安全存储）
            commands::clipboard::copy_to_clipboard,          // 新：复制到剪贴板
            // 诊断/日志（前端 JS 错误落盘）
            commands::diagnostics::log_frontend_error,
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
            commands::project_files::copy_path_to_cmd,
            commands::project_files::open_file_external,
            commands::project_files::read_text_file_with_mtime,
            commands::project_files::save_export_file,
            // 知识中心 commands（维护者 2026-08-31 · DocumentEditor 后端）
            commands::knowledge::list_knowledge_notes,
            commands::knowledge::get_knowledge_note,
            commands::knowledge::upsert_knowledge_note,
            commands::knowledge::delete_knowledge_note,
            commands::knowledge::move_knowledge_note,
            commands::knowledge::copy_knowledge_note,
            commands::knowledge::search_knowledge_notes,
            commands::knowledge::search_knowledge_notes_by_space_type,
            // 知识目录 commands（维护者 2026-08-31 · Phase C 三栏布局）
            commands::knowledge_folders::list_knowledge_folders,
            commands::knowledge_folders::list_knowledge_folders_by_project,
            commands::knowledge_folders::list_knowledge_folders_by_space_id,
            commands::knowledge_folders::upsert_knowledge_folder,
            commands::knowledge_folders::ensure_project_knowledge_library,
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
            commands::backup::is_data_root_set,
            commands::backup::pick_data_root,
            commands::backup::get_backup_location,
            commands::backup::set_backup_location,
            commands::backup::list_backups,
            commands::backup::reveal_path,
            commands::backup::delete_backup,
            // 工作日同步（维护者 2026-09-09 · 节假日源同步）
            commands::holidays::sync_holidays,
            commands::holidays::clear_holidays,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
