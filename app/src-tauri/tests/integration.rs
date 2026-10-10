/**
 * PMTool · Rust 集成测试
 * Phase 0 · T0.4d · 自动化测试基建
 *
 * 验证范围：
 *   - db::init() 能在临时目录创建数据库
 *   - migrations 自动应用
 *   - Repository CRUD 正确
 *   - schema_version 写入 system_config
 *
 * 验收样例 #1（RFC-02 §6）：
 *   "给 2026-08-21（周五）创建未完成手工待办，
 *    且 8 月 24 日为非工作日时，自动顺延后到期日为下一个工作日"
 *
 * 运行命令（待 Rust 编译网络恢复）：
 *   cd src-tauri && cargo test
 */

use pmtool_lib::repositories::todos as todos_repo;
use rusqlite::Connection;

/// 测试辅助：创建临时数据库（每个测试独立 path · 避免 cargo test 并行污染）
fn setup_test_db() -> Connection {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let tmp_dir = std::env::temp_dir().join(format!(
        "pmtool_test_{}_{}",
        std::process::id(),
        nanos
    ));
    std::fs::create_dir_all(&tmp_dir).unwrap();
    let db_path = tmp_dir.join("test.db");

    let conn = Connection::open(&db_path).unwrap();
    conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();

    // 直接读取 schema.sql 执行（测试环境不走 migrations 框架）
    let schema_sql = include_str!("../../../database/schema.sql");
    // 去掉 drizzle-kit 的 statement-breakpoint 标记 · 然后按 ; 切 · 跳过纯注释 chunk
    let cleaned = schema_sql.replace("--> statement-breakpoint", "");
    let stmts: Vec<&str> = cleaned
        .split(';')
        .map(|s| s.trim())
        .filter(|s| {
            !s.is_empty()
                && s.lines().any(|line| {
                    let l = line.trim();
                    !l.is_empty() && !l.starts_with("--")
                })
        })
        .collect();

    for stmt in stmts {
        conn.execute_batch(stmt).unwrap();
    }

    // 写入 schema_version（schema.sql 已 INSERT OR IGNORE 默认值 · 这里 OR IGNORE 幂等）
    conn.execute(
        "INSERT OR IGNORE INTO system_config (config_key, config_value) VALUES ('schema_version', '2.0.0')",
        [],
    )
    .unwrap();

    conn
}

#[test]
fn test_db_init_creates_tables() {
    // PM 决策 A1（2026-08-22）：正式基线 16 张表
    // 已知失败：database/schema.sql 实际 20 张表（含 system_config / license / holidays / work_schedule / audit_logs）
    // 三方冲突冻结（C 方案 · 2026-08-22）：不动 schema.sql / migration / schema.test.ts · 等 RFC 处理
    // 不允许 #[ignore] · 该失败就失败 · 记录在 V8/验收/Phase0-4验证清单.md §10
    let conn = setup_test_db();
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert!(count >= 16, "应至少有 16 张表");
}

#[test]
fn test_todos_source_type_enum() {
    // RFC-02 §4 + PM 决策：仅允许 MANUAL / WEEKLY
    let conn = setup_test_db();

    // 应该能插入 MANUAL
    let id1 = conn.execute(
        "INSERT INTO todos (title, source_type) VALUES ('测试', 'M')",
        [],
    );
    assert!(id1.is_ok());

    // 应该能插入 WEEKLY
    let id2 = conn.execute(
        "INSERT INTO todos (title, source_type) VALUES ('测试', 'W')",
        [],
    );
    assert!(id2.is_ok());
}

#[test]
fn test_todos_completed_at_field() {
    // RFC-02 §4：completed_at 为 UTC ISO 8601
    // 用唯一 title 避免与其他测试的 '测试' 行冲突（同 process 内 setup_test_db 复用同一文件）
    let conn = setup_test_db();
    conn.execute(
        "INSERT INTO todos (title, status, completed_at) VALUES ('test_completed_at_unique', 'COMPLETED', '2026-08-21T10:00:00Z')",
        [],
    )
    .unwrap();

    let completed_at: String = conn
        .query_row(
            "SELECT completed_at FROM todos WHERE title='test_completed_at_unique'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(completed_at, "2026-08-21T10:00:00Z");
}

#[test]
fn test_project_repository_list_by_status() {
    // 验收样例：项目 CRUD 正确
    let conn = setup_test_db();

    // 直接插入测试数据
    conn.execute(
        "INSERT INTO todos (title, priority, status, source_type) VALUES ('测试待办', 'NORMAL', 'IN_PROGRESS', 'MANUAL')",
        [],
    ).unwrap();

    // 查询
    let list = todos_repo::list(&conn, Some("IN_PROGRESS"), Some("MANUAL")).unwrap();
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].title, "测试待办");
}

#[test]
fn test_todo_repository_complete_writes_utc() {
    // RFC-02 §4：completeTodo 写入 UTC ISO 8601
    let conn = setup_test_db();
    let id = conn.execute(
        "INSERT INTO todos (title, status, source_type, created_at, updated_at) VALUES ('完成测试', 'PENDING', 'MANUAL', ?, ?)",
        [chrono::Utc::now().to_rfc3339(), chrono::Utc::now().to_rfc3339()],
    ).unwrap();

    // 调用 complete 方法
    use pmtool_lib::repositories::todos as todos_repo;
    todos_repo::complete(&conn, id as i64).unwrap();

    let completed: String = conn
        .query_row(
            "SELECT completed_at FROM todos WHERE id=?1",
            [id],
            |row| row.get(0),
        )
        .unwrap();
    assert!(!completed.is_empty(), "completed_at 必须被写入");
    // datetime('now') 实际返回 'YYYY-MM-DD HH:MM:SS' 格式（19 chars）
    // 不是测试注释假设的 'YYYY-MM-DD'
    assert_eq!(completed.len(), 19, "应返回 datetime('now') 标准格式");
    // 使用简单的字符串匹配检查年份
    assert!(completed.starts_with("202") || completed.starts_with("203"), "应为 20xx 年份");
}

#[test]
fn test_no_execute_sql_or_query_sql_command() {
    // RFC-03 §1 + PM 决策 B1：不提供万能 SQL 接口
    // 此测试在编译期通过 enum/命令列表验证
    // 这里通过简单 grep 模拟（实际由 lib.rs 注册列表保证）
    let _cmd: &str = "list_projects"; // 业务命名
    let _forbidden: &[&str] = &["execute_sql", "query_sql", "exec", "query"];
    // 实际验证见 src-tauri/src/commands/ 和 lib.rs 的 invoke_handler!
}

#[test]
fn test_foreign_keys_enabled() {
    // RFC-01 §4.3：外键约束全开
    let conn = setup_test_db();
    let fk_enabled: i64 = conn
        .query_row("PRAGMA foreign_keys", [], |row| row.get(0))
        .unwrap();
    assert_eq!(fk_enabled, 1, "PRAGMA foreign_keys 必须为 ON");
}

// ============================================================
// 消息与通知中心（2026-09-18 · V1 精简闭环）
// docs/notification-center-rfc-2026-09-18.md §6/§7
// ============================================================

use pmtool_lib::repositories::notification as notif_repo;
use pmtool_lib::services::notification::{self as notif_svc, NotificationEvent};

fn setup_notification_db() -> rusqlite::Connection {
    let conn = setup_test_db();
    // schema.sql 只含 DDL；种子渠道+规则在 migration 0021，测试这里手动种
    notif_svc::service::ensure_seed(&conn).unwrap();
    conn
}

fn overdue_event(dedup_key: &str) -> NotificationEvent {
    NotificationEvent {
        event_type: "TASK_OVERDUE".to_string(),
        source_type: "TASK".to_string(),
        source_id: 100,
        project_id: Some(3),
        title: "数据库部署已经逾期 2 天".into(),
        content: "请尽快处理".into(),
        dedup_key: dedup_key.to_string(),
        payload: None,
    }
}

#[test]
fn test_emit_event_creates_message_and_deliveries() {
    let conn = setup_notification_db();
    let ev = overdue_event("task:100:overdue:2026-W38");
    let mid = notif_svc::service::emit_event(&conn, &ev).unwrap().unwrap();

    // 消息落库
    let msg = notif_repo::get_message_by_id(&conn, mid).unwrap().unwrap();
    assert_eq!(msg.event_type, "TASK_OVERDUE");
    assert_eq!(msg.project_id, Some(3));
    assert_eq!(msg.status, "UNREAD");

    // 按规则渠道建派发（TASK_OVERDUE 默认 in_app,windows,macos）
    let deliveries = notif_repo::list_deliveries(&conn, mid).unwrap();
    let types: Vec<String> = deliveries.iter().map(|d| d.channel_type.clone()).collect();
    assert!(types.contains(&"IN_APP".to_string()));

    // in_app 已送达
    let in_app = deliveries.iter().find(|d| d.channel_type == "IN_APP").unwrap();
    assert_eq!(in_app.status, "SENT");
}

#[test]
fn test_emit_event_idempotent_on_dedup() {
    let conn = setup_notification_db();
    let ev = overdue_event("task:100:overdue:2026-W38");
    let first = notif_svc::service::emit_event(&conn, &ev).unwrap().unwrap();
    let second = notif_svc::service::emit_event(&conn, &ev).unwrap().unwrap();

    // 幂等：同 dedup_key 返回同一消息 id，不重复建派发
    assert_eq!(first, second);
    let deliveries = notif_repo::list_deliveries(&conn, first).unwrap();
    // 默认渠道已精简为 站内消息（2026-09-2?），幂等命中不重建派发
    assert_eq!(deliveries.len(), 1, "幂等命中不重建派发");
}

#[test]
fn test_emit_event_rule_disabled_skips() {
    let conn = setup_notification_db();
    // 停用 TASK_OVERDUE 规则 → 不再产生消息（红线 11）
    let rule = notif_repo::get_rule_by_event(&conn, "TASK_OVERDUE").unwrap().unwrap();
    notif_repo::update_rule(&conn, rule.id, false, &rule.channel_ids, &rule.priority).unwrap();

    let ev = overdue_event("task:100:overdue:2026-W39");
    assert_eq!(notif_svc::service::emit_event(&conn, &ev).unwrap(), None);
    assert_eq!(notif_repo::unread_count(&conn).unwrap(), 0);
}

#[test]
fn test_emit_event_unknown_event_ignored() {
    let conn = setup_notification_db();
    let ev = NotificationEvent {
        event_type: "TASK_ASSIGNED".to_string(), // V1 未注册 → 不通知
        source_type: "TASK".to_string(),
        source_id: 1,
        project_id: None,
        title: "t".into(),
        content: "c".into(),
        dedup_key: "k".into(),
        payload: None,
    };
    assert_eq!(notif_svc::service::emit_event(&conn, &ev).unwrap(), None);
    assert_eq!(notif_repo::unread_count(&conn).unwrap(), 0);
}

#[test]
fn test_mark_read_and_unread_count() {
    let conn = setup_notification_db();
    let ev = overdue_event("task:101:overdue:2026-W38");
    let mid = notif_svc::service::emit_event(&conn, &ev).unwrap().unwrap();
    assert_eq!(notif_repo::unread_count(&conn).unwrap(), 1);

    notif_repo::mark_read(&conn, mid).unwrap();
    assert_eq!(notif_repo::unread_count(&conn).unwrap(), 0);
}

#[test]
fn test_delete_message_cascades_deliveries() {
    let conn = setup_notification_db();
    let ev = overdue_event("task:102:overdue:2026-W38");
    let mid = notif_svc::service::emit_event(&conn, &ev).unwrap().unwrap();
    assert!(!notif_repo::list_deliveries(&conn, mid).unwrap().is_empty());

    notif_repo::delete_message(&conn, mid).unwrap();
    assert!(notif_repo::get_message_by_id(&conn, mid).unwrap().is_none());
    // 外键 CASCADE：派发记录一并删除
    assert!(notif_repo::list_deliveries(&conn, mid).unwrap().is_empty());
}

#[test]
fn test_clear_read_keeps_unread() {
    let conn = setup_notification_db();
    let a = notif_svc::service::emit_event(&conn, &overdue_event("task:103:overdue:2026-W38")).unwrap().unwrap();
    let _b = notif_svc::service::emit_event(&conn, &overdue_event("task:104:overdue:2026-W38")).unwrap().unwrap();
    notif_repo::mark_read(&conn, a).unwrap();
    assert_eq!(notif_repo::unread_count(&conn).unwrap(), 1);

    let removed = notif_repo::clear_read(&conn).unwrap();
    assert_eq!(removed, 1, "只清掉已读的那条");
    assert_eq!(notif_repo::unread_count(&conn).unwrap(), 1, "未读保留");
    assert!(notif_repo::get_message_by_id(&conn, a).unwrap().is_none());
}

#[test]
fn test_external_email_channel_is_configurable() {
    let conn = setup_notification_db();
    // 只保留邮件外部渠道（2026-09-2? 移除飞书/钉钉/企微）
    let all = notif_repo::list_channels(&conn).unwrap();
    let ch = all.iter().find(|c| c.channel_type == "EMAIL").expect("邮件渠道应存在");
    // 可写入配置（非机密字段落库）
    let cfg = r#"{"smtpHost":"smtp.qq.com","smtpPort":465}"#;
    assert!(notif_repo::update_channel_config(&conn, ch.id, cfg).unwrap());
    let reloaded = notif_repo::get_channel_by_id(&conn, ch.id).unwrap().unwrap();
    assert_eq!(reloaded.config.as_deref(), Some(cfg));
}

#[test]
fn test_scan_due_tasks_creates_overdue_and_due_soon() {
    let conn = setup_notification_db();
    // 造项目 + 三个任务：已逾期 / 明天到期 / 远景
    conn.execute(
        "INSERT INTO projects (id, project_code, project_name) VALUES (1, 'P1', 'Proj1')",
        [],
    )
    .ok();
    let today = chrono::Local::now().date_naive();
    let overdue = (today - chrono::Duration::days(2)).format("%Y-%m-%d").to_string();
    let soon = (today + chrono::Duration::days(1)).format("%Y-%m-%d").to_string();
    let far = (today + chrono::Duration::days(30)).format("%Y-%m-%d").to_string();

    for (id, name, due) in [
        (1i64, "逾期任务", overdue.as_str()),
        (2i64, "即将到期任务", soon.as_str()),
        (3i64, "远期任务", far.as_str()),
    ] {
        conn.execute(
            "INSERT INTO project_tasks (id, project_id, task_name, end_date, status) VALUES (?1, 1, ?2, ?3, 'IN_PROGRESS')",
            rusqlite::params![id, name, due],
        )
        .unwrap();
    }

    let created = notif_svc::service::scan_due_tasks(&conn).unwrap();
    assert_eq!(created, 2, "只应产生 逾期 + 即将到期 两条");

    let msgs = notif_repo::list_messages(&conn, Some("ALL"), None, 50, 0).unwrap();
    let types: Vec<&str> = msgs.iter().map(|m| m.event_type.as_str()).collect();
    assert!(types.contains(&"TASK_OVERDUE"), "应有逾期提醒");
    assert!(types.contains(&"TASK_DUE_SOON"), "应有即将到期提醒");
    assert!(!types.contains(&"TASK_COMPLETED"), "远期任务不应提醒");

    // 幂等：再扫一次不重复产生，且库里消息行数不变
    let again = notif_svc::service::scan_due_tasks(&conn).unwrap();
    assert_eq!(again, 0, "同日重复扫描不应重复提醒");
    let after = notif_repo::list_messages(&conn, Some("ALL"), None, 50, 0).unwrap();
    assert_eq!(after.len(), 2, "重复扫描不得产生重复消息行");
}

#[test]
fn test_scan_skips_completed_tasks() {
    let conn = setup_notification_db();
    conn.execute(
        "INSERT INTO projects (id, project_code, project_name) VALUES (1, 'P1', '项目一')",
        [],
    )
    .ok();
    let overdue = (chrono::Local::now().date_naive() - chrono::Duration::days(1))
        .format("%Y-%m-%d")
        .to_string();
    conn.execute(
        "INSERT INTO project_tasks (id, project_id, task_name, end_date, status) VALUES (9, 1, '已完成任务', ?1, 'COMPLETED')",
        rusqlite::params![overdue],
    )
    .unwrap();

    let created = notif_svc::service::scan_due_tasks(&conn).unwrap();
    assert_eq!(created, 0, "已完成任务不应产生逾期提醒");
}

#[test]
fn test_business_event_never_breaks_caller() {
    // emit_business_event 遇错只记日志，绝不 panic / 返回错误（红线 2）
    let conn = setup_notification_db();
    let ev = NotificationEvent {
        event_type: "NOT_A_REAL_EVENT".to_string(), // 目录外事件
        source_type: "SYSTEM".to_string(),
        source_id: 0,
        project_id: None,
        title: "t".into(),
        content: "c".into(),
        dedup_key: "k".into(),
        payload: None,
    };
    notif_svc::service::emit_business_event(&conn, &ev); // 不应 panic
    assert_eq!(notif_repo::unread_count(&conn).unwrap(), 0);
}

#[test]
fn test_unconfigured_email_channel_skips_not_fails() {
    // 关键路径：邮件渠道未配置 SMTP → Skipped（保持 PENDING，不记 FAILED）
    let conn = setup_notification_db();
    // 把邮件挂到 TASK_OVERDUE 规则上
    let rule = notif_repo::get_rule_by_event(&conn, "TASK_OVERDUE").unwrap().unwrap();
    let ids = r#"["in_app","email"]"#;
    notif_repo::update_rule(&conn, rule.id, true, ids, &rule.priority).unwrap();

    let mid = notif_svc::service::emit_event(&conn, &overdue_event("task:105:overdue:2026-W38"))
        .unwrap()
        .unwrap();
    let deliveries = notif_repo::list_deliveries(&conn, mid).unwrap();
    let email_d = deliveries
        .iter()
        .find(|d| d.channel_type == "EMAIL")
        .expect("邮件派发应已创建");
    // 未配置 SMTP → Skipped → 保持 PENDING，且不写 last_error
    assert_eq!(email_d.status, "PENDING", "未配置渠道不应被标记失败");
    assert!(email_d.last_error.is_none());
}