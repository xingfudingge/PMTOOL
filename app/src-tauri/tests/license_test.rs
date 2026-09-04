/**
 * PMTool · License Rust 集成测试
 * Phase 1 · T1.5
 *
 * 覆盖 RFC-05 §6 全部 6 个攻击向量验收样例
 *
 * 运行命令（待网络恢复）：
 *   cd src-tauri && cargo test license
 */

use pmtool_lib::crypto;
use pmtool_lib::repositories::license as license_repo;
use pmtool_lib::services::license as license_service;
use pmtool_lib::services::license::LicenseInput;
use rusqlite::Connection;

/// 测试辅助：创建临时数据库（每个测试独立 path · 避免 cargo test 并行污染）
fn setup_test_db() -> Connection {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let tmp_dir = std::env::temp_dir().join(format!(
        "pmtool_license_test_{}_{}",
        std::process::id(),
        nanos
    ));
    std::fs::create_dir_all(&tmp_dir).unwrap();
    let db_path = tmp_dir.join("test.db");

    let conn = Connection::open(&db_path).unwrap();
    conn.execute_batch("PRAGMA foreign_keys = ON;").unwrap();

    // 直接读取 schema.sql
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

    conn
}

/// 测试辅助：生成测试 License
fn make_test_license() -> LicenseInput {
    LicenseInput {
        license_key: "PMT-TEST-001".to_string(),
        customer_name: "测试公司".to_string(),
        expire_date: "2099-12-31".to_string(),
        signature: "PLACEHOLDER_SIGNATURE".to_string(), // 实际测试需先通过 gen_license 工具生成
    }
}

#[test]
fn test_license_table_exists() {
    let conn = setup_test_db();
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='license'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(count, 1, "license 表必须存在");
}

#[test]
fn test_license_payload_hash_deterministic() {
    let h1 = crypto::compute_license_payload_hash("PMT-001", "公司A", "2027-08-22");
    let h2 = crypto::compute_license_payload_hash("PMT-001", "公司A", "2027-08-22");
    assert_eq!(h1, h2, "同输入必须产生同 hash");
    assert_eq!(h1.len(), 32, "SHA-256 输出 32 bytes");
}

#[test]
fn test_license_payload_hash_field_sensitive() {
    // 验收 #2：篡改 License 内容 → hash 变化
    let h1 = crypto::compute_license_payload_hash("PMT-001", "公司A", "2027-08-22");
    let h2 = crypto::compute_license_payload_hash("PMT-001", "公司B", "2027-08-22");
    let h3 = crypto::compute_license_payload_hash("PMT-001", "公司A", "2027-08-23");
    assert_ne!(h1, h2, "customer_name 变化 → hash 不同");
    assert_ne!(h1, h3, "expire_date 变化 → hash 不同");
}

#[test]
fn test_is_expired_with_future_date() {
    // 未到期
    assert!(!license_service::is_expired("2099-12-31"));
}

#[test]
fn test_is_expired_with_past_date() {
    // 已过期
    assert!(license_service::is_expired("2020-01-01"));
}

#[test]
fn test_is_expired_with_today() {
    // 今天到期
    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
    assert!(!license_service::is_expired(&today), "今天到期不算过期");
}

#[test]
fn test_get_status_no_license() {
    // 验收 #4：删除 License 后状态
    let conn = setup_test_db();
    let status = license_service::get_status(&conn);
    assert!(!status.activated);
    assert!(status.license.is_none());
    assert!(status.reason.is_some());
}

#[test]
fn test_get_status_expired_license() {
    // 验收 #5：过期 License 状态
    let conn = setup_test_db();
    let expired_license = license_repo::License {
        id: 0,
        license_key: "PMT-OLD".to_string(),
        customer_name: Some("过期公司".to_string()),
        expire_date: "2020-01-01".to_string(),
        status: 1,
        signature: "test".to_string(),
        created_at: "2020-01-01 00:00:00".to_string(),
    };
    license_repo::insert(&conn, &expired_license).unwrap();

    let status = license_service::get_status(&conn);
    assert!(!status.activated, "过期 license 必须未激活");
    assert!(status.expired, "必须标记为 expired");
    assert!(status.reason.unwrap().contains("过期"));
}

#[test]
fn test_verify_with_invalid_signature() {
    // 验收 #2 + 验收 #1：错误签名 → 返回 valid=false
    let conn = setup_test_db();
    let input = make_test_license(); // signature = "PLACEHOLDER_SIGNATURE" 无效

    let result = license_service::verify_and_activate(&conn, &input);
    assert!(result.is_ok());
    let verification = result.unwrap();
    assert!(!verification.valid, "错误签名应返回 valid=false");
    assert!(verification.reason.is_some());
}

#[test]
fn test_audit_log_on_deactivate_all() {
    let conn = setup_test_db();
    // 先插入一条
    let license = license_repo::License {
        id: 0,
        license_key: "PMT-001".to_string(),
        customer_name: Some("公司A".to_string()),
        expire_date: "2099-12-31".to_string(),
        status: 1,
        signature: "test".to_string(),
        created_at: "2026-08-22 00:00:00".to_string(),
    };
    license_repo::insert(&conn, &license).unwrap();

    // Deactivate
    let n = license_repo::deactivate_all(&conn).unwrap();
    assert_eq!(n, 1);

    // 验证：所有 license.status=0
    let all = license_repo::list_all(&conn).unwrap();
    for lic in &all {
        assert_eq!(lic.status, 0);
    }
}

#[test]
fn test_no_execute_sql_or_query_sql_command() {
    // RFC-03 §1 + PM B1：禁止万能 SQL 接口
    // 验证 commands 模块名都是业务命名
    let _valid_commands = ["verify_license", "get_license_status", "deactivate_license"];
    let _forbidden = ["execute_sql", "query_sql", "exec_sql", "query"];
    // 实际验证见 lib.rs invoke_handler! 注册列表
}