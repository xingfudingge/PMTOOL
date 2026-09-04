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
}

/**
 * 维护者 2026-08-25：项目同步任务测试数据 seed
 *
 * 仅 debug build 跑 · 每次启动清理已有 seed 数据并按当前规则重新 seed
 * 找第一个 active 项目（status != 'CANCELLED'）→ 建 2 个 project_tasks + 2 个 todos
 * 分布到 上个工作日 / 今日 各 1 条（维护者 2026-08-25 后续反馈：不要明日）
 *
 * 注：项目同步 todo 不能在 UI 手动创建 · 清理是安全的
 */
/**
 * 维护者 2026-08-26：项目中心模块测试数据 seed
 *
 * 仅 debug build 跑 · 一次性建测试项目 + 任务 + 风险 + 周报 + 成员
 * 数据来自维护者提供的 xx项目实施计划.xlsx 模板（去掉后续需求调研/方案设计/开发上线
 * 这 3 个父任务，因为它们的 end_date 都在 2026-12 以后，与"本周结束 2026-07-17"
 * 模板不匹配 · 只 seed 项目启动与准备的 5 个子任务作为示范）
 *
 * - 项目：xxx智能合同项目（晨曦科技智能合同项目）
 * - 父任务：项目启动与准备（已完成 12.5%）
 * - 子任务：项目启动会 / 系统部署方案确认 / 服务器配置清单提供 / 测试环境部署 / 文档服务器准备
 * - 风险：3 条
 * - 周报：本周 3 条 + 下周 2 条
 * - 成员：甲方 4 个 + 乙方 4 个
 *
 * idempotent：每次启动清理之前 seed 的 marker 项目（project_code='PM-DEMO-001'）并重建
 */
#[cfg(debug_assertions)]
fn seed_demo_project_center_data(conn: &rusqlite::Connection) -> rusqlite::Result<()> {
    use rusqlite::params;

    const MARKER: &str = "PM-DEMO-001";

    // 1. 清理之前 seed 的 demo 项目（CASCADE 触发连带清理）
    conn.execute("DELETE FROM projects WHERE project_code = ?1", params![MARKER])?;

    // 2. 建测试项目
    conn.execute(
        "INSERT INTO projects (project_code, project_name, customer_name, status, priority, owner, start_date, end_date, contract_amount, background, objective, scope, description) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
        params![
            MARKER,
            "xxx智能合同项目",
            "晨曦科技",
            "IN_PROGRESS",
            "HIGH",
            "张三",
            "2026-06-29",
            "2027-01-17",
            Some(500_000.0_f64),
            "晨曦科技为提升合同管理效率，需要建设统一的智能合同管理系统，覆盖法务、营销、采购、财务全流程。",
            "3 个月内完成系统建设并投产，覆盖合同起草、审批、签署、归档、检索全生命周期。",
            "合同分类管理、模板管理、流程配置、审查规则、电子签章、与 CRM/SRM/ERP 集成。",
            "Phase 1：需求调研 + 方案设计 · Phase 2：开发集成 · Phase 3：测试上线 · 总周期 29 周。"
        ],
    )?;
    let pid = conn.last_insert_rowid();

    // 3. 建父任务：项目启动与准备
    conn.execute(
        "INSERT INTO project_tasks (project_id, parent_id, task_name, owner, start_date, end_date, work_days, natural_days, progress, status, remark, sort_order) VALUES (?1, NULL, ?2, NULL, ?3, ?4, ?5, ?6, ?7, ?8, NULL, ?9)",
        params![
            pid, "项目启动与准备", "2026-06-29", "2026-07-21",
            17_i64,  23_i64, 12.5_f64, "IN_PROGRESS", 0
        ],
    )?;
    let parent_id = conn.last_insert_rowid();

    // 4. 建 5 个子任务（进度混合：1 完成 / 1 进行中 / 3 未开始）
    let children: [(String, String, String, String, i64, i64, f64, String, i32); 5] = [
        ("项目启动会".to_string(),        "张三".to_string(), "2026-06-29".to_string(), "2026-06-29".to_string(), 1, 1, 100.0, "COMPLETED".to_string(),   1),
        ("系统部署方案确认".to_string(),   "张三".to_string(), "2026-07-02".to_string(), "2026-07-02".to_string(), 1, 1, 50.0,  "IN_PROGRESS".to_string(), 2),
        ("服务器配置清单提供".to_string(), "张三".to_string(), "2026-07-03".to_string(), "2026-07-03".to_string(), 1, 1, 100.0, "COMPLETED".to_string(),   3),
        ("测试环境部署".to_string(),      "张三".to_string(), "2026-07-04".to_string(), "2026-07-21".to_string(), 12, 18, 0.0,  "PENDING".to_string(),     4),
        ("文档服务器准备".to_string(),    "张三".to_string(), "2026-07-05".to_string(), "2026-07-11".to_string(), 5, 7,  0.0,  "PENDING".to_string(),     5),
    ];
    for (name, owner, sd, ed, wd, nd, prog, status, so) in children.iter() {
        conn.execute(
            "INSERT INTO project_tasks (project_id, parent_id, task_name, owner, start_date, end_date, work_days, natural_days, progress, status, remark, sort_order) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, NULL, ?11)",
            rusqlite::params![
                pid, parent_id, name, owner, sd, ed, wd, nd, prog, status, so
            ],
        )?;
    }

    // 5. 建 3 条风险（OPEN / IN_PROGRESS / RESOLVED 各 1 条）
    let risks: [(&str, &str, &str, &str, &str, &str, &str, &str, &str); 3] = [
        (
            "客户法务审批流程过长，可能影响上线时间",
            "通过预审批 + 并联审批压缩到 3 天内",
            "HIGH", "李四", "2026-08-10", "", "", "OPEN",
            "2026-08-05",
        ),
        (
            "服务器配置变更频繁，需要运维同事配合",
            "建立变更工单流程 + 提前 48 小时通知",
            "MEDIUM", "王五", "2026-08-15", "", "", "IN_PROGRESS",
            "2026-08-03",
        ),
        (
            "电子签章服务对接问题",
            "已与电子签厂商协调开通测试账户 + 文档",
            "CRITICAL", "赵六", "2026-08-08", "2026-08-08", "已闭环，等待复盘", "RESOLVED",
            "2026-08-01",
        ),
    ];
    for (title, desc, level, owner, plan, actual, sol, status, discovered) in risks.iter() {
        conn.execute(
            "INSERT INTO project_issues (project_id, title, description, level, owner, plan_date, actual_date, solution, status, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, CURRENT_TIMESTAMP)",
            params![
                pid, title, desc, level, owner,
                if plan.is_empty() { None } else { Some(*plan) },
                if actual.is_empty() { None } else { Some(*actual) },
                if sol.is_empty() { None } else { Some(*sol) },
                status,
                format!("{} 09:00:00", discovered)
            ],
        )?;
    }

    // 6. 建周报条目（本周 + 下周）
    // 周一锚定 2026-08-10（周三 8-12 那周）
    let week_current = [
        ("合同系统 PRD 评审".to_string(), "2026-08-10".to_string(), "2026-08-12".to_string(), "2026-08-10".to_string(), "2026-08-12".to_string(), "王五".to_string(), "".to_string(), "完成 100%".to_string(), "COMPLETED".to_string(),   "CURRENT".to_string()),
        ("电子签集成联调".to_string(),    "2026-08-10".to_string(), "2026-08-14".to_string(), "2026-08-11".to_string(), "".to_string(),            "赵六".to_string(), "李四".to_string(), "进行中".to_string(),   "IN_PROGRESS".to_string(), "CURRENT".to_string()),
        ("CRM 接口联调".to_string(),      "2026-08-12".to_string(), "2026-08-14".to_string(), "".to_string(), "".to_string(), "".to_string(), "".to_string(),  "本周未启动".to_string(),  "PENDING".to_string(),     "CURRENT".to_string()),
    ];
    let week_next = [
        ("测试环境数据初始化".to_string(), "2026-08-17".to_string(), "2026-08-18".to_string(), "".to_string(), "".to_string(), "赵六".to_string(), "".to_string(), "".to_string(),  "PENDING".to_string(),     "NEXT".to_string()),
        ("集成测试用例评审".to_string(),   "2026-08-19".to_string(), "2026-08-21".to_string(), "".to_string(), "".to_string(), "王五".to_string(), "李四".to_string(), "".to_string(),  "PENDING".to_string(),     "NEXT".to_string()),
    ];
    for (name, ps, pe, astart, aend, pb, pa, note, comp, sect) in week_current.iter().chain(week_next.iter()) {
        // 周编号：基于 plan_start_date 相对 2026-06-29 项目启动周一
        // 简化：直接 hardcode week_number 1（本周）和 2（下周）
        let week_number = if sect == "CURRENT" { 1 } else { 2 };
        let (ws, we) = if sect == "CURRENT" { ("2026-08-10".to_string(), "2026-08-16".to_string()) } else { ("2026-08-17".to_string(), "2026-08-23".to_string()) };
        conn.execute(
            "INSERT INTO weekly_report_entries (project_id, week_number, week_start_date, week_end_date, task_name, plan_start_date, plan_end_date, actual_start_date, actual_end_date, owner_party_a, owner_party_b, completion_note, is_completed, section, sort_order) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
            rusqlite::params![
                pid, week_number, ws, we, name, ps, pe,
                if astart.is_empty() { None } else { Some(astart.clone()) },
                if aend.is_empty() { None } else { Some(aend.clone()) },
                if pa.is_empty() { None } else { Some(pa.clone()) },
                if pb.is_empty() { None } else { Some(pb.clone()) },
                note.clone(), comp.clone(), sect.clone(), 0_i64
            ],
        )?;
    }

    // 7. 建项目成员（甲方 4 + 乙方 4）
    let members_a: [(String, String, String, String, String, i32); 4] = [
        ("项目经理".to_string(),   "王经理".to_string(),  "13800000001".to_string(), "★★★★★".to_string(), "★★★★".to_string(), 1),
        ("总经理".to_string(),     "李总".to_string(),    "13800000002".to_string(), "★".to_string(),      "★★★★★".to_string(), 2),
        ("法务负责人".to_string(), "刘法务".to_string(),  "13800000003".to_string(), "★★★".to_string(),   "★★★".to_string(),   3),
        ("业务负责人".to_string(), "赵业务".to_string(),  "13800000004".to_string(), "★★★★".to_string(),   "★★★".to_string(),   4),
    ];
    for (role, name, contact, part, impact, so) in members_a.iter() {
        conn.execute(
            "INSERT INTO project_members (project_id, party, role, name, contact, participation, impact, sort_order) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params![pid, "PARTY_A", role, name, contact, part, impact, so],
        )?;
    }
    let members_b: [(String, String, String, String, String, i32); 4] = [
        ("项目经理".to_string(),   "张三".to_string(), "13900000001".to_string(), "★★★★★".to_string(), "★★★".to_string(), 1),
        ("实施工程师".to_string(), "李四".to_string(), "13900000002".to_string(), "★★★★".to_string(),   "★★★".to_string(), 2),
        ("方案架构师".to_string(), "王五".to_string(), "13900000003".to_string(), "★★★".to_string(),     "★★★★".to_string(), 3),
        ("开发工程师".to_string(), "赵六".to_string(), "13900000004".to_string(), "★★★★★".to_string(),   "★★★".to_string(), 4),
    ];
    for (role, name, contact, part, impact, so) in members_b.iter() {
        conn.execute(
            "INSERT INTO project_members (project_id, party, role, name, contact, participation, impact, sort_order) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params![pid, "PARTY_B", role, name, contact, part, impact, so],
        )?;
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // 获取应用数据目录（RFC-03 §2：使用 OS 应用数据目录）
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("无法获取 app_data_dir");

            // 初始化数据库（建库 + migration）
            let pool = db::init(&app_data_dir)
                .map_err(|e| format!("DB init failed: {}", e))?;

            // 维护者 2026-08-26：仅保留项目中心 demo 数据 seed（方案 A 已删 seed_test_sync_todos 测试任务）
            #[cfg(debug_assertions)]
            {
                if let Ok(conn) = pool.lock() {
                    // 维护者 2026-08-26：项目中心模块测试数据（demo 项目 + 任务 + 风险 + 周报 + 成员）
                    if let Err(e) = seed_demo_project_center_data(&conn) {
                        eprintln!("[seed_demo_project_center_data] 跳过: {}", e);
                    } else {
                        eprintln!("[seed_demo_project_center_data] 完成（debug only）");
                    }
                }
            }

            // 初始化文件存储 Provider（Phase 4 T4.9）
            let file_storage: BoxedProvider =
                Arc::new(services::file_storage_local::LocalFileStorageProvider::new(
                    app_data_dir.join("PMToolData"),
                ));

            // 注册应用状态
            app.manage(AppState {
                db: pool,
                file_storage,
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
            commands::knowledge_folders::upsert_knowledge_folder,
            commands::knowledge_folders::ensure_project_knowledge_library,
            commands::knowledge_folders::delete_knowledge_folder,
            // 知识空间 commands（2026-09-03 知识中心重构）
            commands::knowledge_spaces::list_personal_knowledge_spaces,
            commands::knowledge_spaces::list_project_knowledge_spaces,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
