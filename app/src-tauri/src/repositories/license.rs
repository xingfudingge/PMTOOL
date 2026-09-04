/**
 * PMTool · License 数据访问层
 * Phase 1 · T1.2
 *
 * 职责：纯 SQL 操作，不含业务逻辑
 * 业务逻辑（含 RSA 验签、过期检测）在 services::license 层
 */

use rusqlite::{params, Row};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct License {
    pub id: i64,
    pub license_key: String,
    pub customer_name: Option<String>,
    pub expire_date: String, // DATE 存为 ISO 字符串
    pub status: i64,         // 0=无效 1=有效
    pub signature: String,
    pub created_at: String,
}

/// 获取当前有效 License（status=1 + 最近一条）
pub fn get_current(conn: &rusqlite::Connection) -> rusqlite::Result<Option<License>> {
    let mut stmt = conn.prepare(
        "SELECT id, license_key, customer_name, expire_date, status, signature, created_at FROM license WHERE status = 1 ORDER BY id DESC LIMIT 1",
    )?;
    let mut rows = stmt.query_map([], row_to_license)?;
    rows.next().transpose()
}

/// 获取最近一条 license（**不论 status**），用于识别"过期授权"
pub fn get_latest(conn: &rusqlite::Connection) -> rusqlite::Result<Option<License>> {
    let mut stmt = conn.prepare(
        "SELECT id, license_key, customer_name, expire_date, status, signature, created_at FROM license ORDER BY id DESC LIMIT 1",
    )?;
    let mut rows = stmt.query_map([], row_to_license)?;
    rows.next().transpose()
}

/// 获取所有 License（按 id DESC）
pub fn list_all(conn: &rusqlite::Connection) -> rusqlite::Result<Vec<License>> {
    let mut stmt = conn.prepare(
        "SELECT id, license_key, customer_name, expire_date, status, signature, created_at FROM license ORDER BY id DESC",
    )?;
    let rows = stmt.query_map([], row_to_license)?;
    rows.collect()
}

/// 插入新 License（默认 status=1）
pub fn insert(
    conn: &rusqlite::Connection,
    license: &License,
) -> rusqlite::Result<i64> {
    conn.execute(
        "INSERT INTO license (license_key, customer_name, expire_date, status, signature) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            license.license_key,
            license.customer_name,
            license.expire_date,
            license.status,
            license.signature,
        ],
    )?;
    Ok(conn.last_insert_rowid())
}

/// 将所有 License 设为 status=0（deactivate all）
/// **改进**：同时删除与新 license_key 重复的旧记录（避免后续 INSERT 触发 UNIQUE 冲突）
pub fn deactivate_all(conn: &rusqlite::Connection) -> rusqlite::Result<usize> {
    let n = conn.execute("UPDATE license SET status = 0", [])?;
    Ok(n)
}

/// 删除与给定 license_key 不一致的旧记录（保留同 key 的以便 INSERT 覆盖）
/// 这是处理「同设备重新激活同 key」时的 UNIQUE 冲突修复
pub fn delete_other_keys(conn: &rusqlite::Connection, keep_key: &str) -> rusqlite::Result<usize> {
    let n = conn.execute(
        "DELETE FROM license WHERE license_key != ?1",
        params![keep_key],
    )?;
    Ok(n)
}

/// 删除 License（永久）
pub fn delete(conn: &rusqlite::Connection, id: i64) -> rusqlite::Result<bool> {
    let n = conn.execute("DELETE FROM license WHERE id = ?1", [id])?;
    Ok(n > 0)
}

fn row_to_license(row: &Row) -> rusqlite::Result<License> {
    Ok(License {
        id: row.get(0)?,
        license_key: row.get(1)?,
        customer_name: row.get(2)?,
        expire_date: row.get(3)?,
        status: row.get(4)?,
        signature: row.get(5)?,
        created_at: row.get(6)?,
    })
}