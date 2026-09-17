/**
 * PMTool · 全新数据库完整迁移回归测试（2026-09-17 加）
 *
 * 背景：授权体系隔离改造时，0001 移除了 license/device_fingerprints/trial_records 表定义，
 *   但旧迁移 0010_license_rearch.sql 仍在 ALTER license —— 全新装机从 0001 一路跑到 0018，
 *   0010 因 license 表不存在而报「no such table: license」，DB init 失败 → 应用启动闪退。
 *   （老库因 0010 已记录应用而跳过，故开发机未暴露；现有 integration.rs 又只跑 schema.sql，未覆盖。）
 *
 * 本测试直接走 db::open_and_migrate（与启动同路径的 migrations 框架），在全新临时库上：
 *   1. 完整迁移必须成功（不抛 no such table 类错误）
 *   2. 授权三表必须不存在（0018 隔离后，数据库为纯业务库）
 *   3. 关键业务表必须存在
 */

use pmtool_lib::db::open_and_migrate;
use rusqlite::params;
use std::path::PathBuf;

fn fresh_db_dir() -> PathBuf {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let tmp = std::env::temp_dir().join(format!("pmtool_fresh_{}_{}", std::process::id(), nanos));
    std::fs::create_dir_all(&tmp).unwrap();
    tmp
}

fn table_exists(conn: &rusqlite::Connection, name: &str) -> bool {
    conn.query_row(
        "SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
        params![name],
        |r| r.get::<_, i64>(0),
    )
    .unwrap_or(0)
        > 0
}

#[test]
fn fresh_db_full_migration_applies_and_drops_auth_tables() {
    let dir = fresh_db_dir();
    let conn = open_and_migrate(&dir).expect("全新库完整迁移应成功（0010 不得再引用已删除的 license 表）");

    // 授权三表已被 0018 隔离，全新库不应存在
    for t in ["license", "device_fingerprints", "trial_records"] {
        assert!(!table_exists(&conn, t), "全新库不应存在授权表: {}", t);
    }

    // 关键业务表应存在
    for t in ["knowledge_notes", "knowledge_folders", "projects", "system_config", "migrations"] {
        assert!(table_exists(&conn, t), "全新库应存在业务表: {}", t);
    }

    let _ = std::fs::remove_dir_all(&dir);
}
