/**
 * PMTool · 试用期管理服务
 *
 * 设计依据：PMTOOL 设置中心 & 授权管理开发设计稿
 *
 * 7 天试用期机制：
 * 1. 首次启动自动激活 7 天试用
 * 2. 从首次使用时间开始计算，非每次启动重置
 * 3. 防篡改：记录 first_seen + last_seen
 * 4. 存储于应用数据目录 + 完整性校验
 *
 * 防篡改策略：
 * - first_seen_time：首次使用时间（不应大于当前时间）
 * - last_seen_time：最后使用时间（不应小于首次时间）
 * - 如果当前时间 < last_seen_time，判定系统时间回拨
 */

use chrono::{Duration, Utc};
use rusqlite::{params, Connection};

/// 试用期状态
#[derive(Debug, Clone)]
pub struct TrialStatus {
    /// 是否在试用中
    pub is_active: bool,
    /// 剩余天数
    pub days_remaining: i32,
    /// 试用开始时间
    pub started_at: Option<String>,
    /// 到期时间
    pub expire_at: Option<String>,
    /// 已使用天数
    pub days_used: i32,
    /// 防篡改标记（系统时间可能被回拨）
    pub time_tampered: bool,
}

/// 试用期记录
#[derive(Debug)]
pub struct TrialRecord {
    pub device_id: String,
    pub started_at: String,
    pub days_used: i32,
    pub is_active: bool,
}

impl TrialStatus {
    /// 创建新的试用状态
    pub fn new_active(started_at: chrono::DateTime<Utc>) -> Self {
        let expire_at = started_at + Duration::days(7);
        Self {
            is_active: true,
            days_remaining: 7,
            started_at: Some(started_at.to_rfc3339()),
            expire_at: Some(expire_at.to_rfc3339()),
            days_used: 0,
            time_tampered: false,
        }
    }

    /// 检查是否过期
    pub fn is_expired(&self) -> bool {
        !self.is_active || self.days_remaining <= 0
    }

    /// 检查是否即将到期（<= 30 天）
    pub fn is_expiring_soon(&self) -> bool {
        self.is_active && self.days_remaining <= 30
    }
}

/// 从数据库初始化连接
pub fn init_db(conn: &Connection) -> rusqlite::Result<()> {
    // 创建 trial_records 表（如果不存在）
    conn.execute(
        "CREATE TABLE IF NOT EXISTS trial_records (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id   TEXT NOT NULL UNIQUE,
            started_at  TEXT NOT NULL,
            days_used   INTEGER DEFAULT 0,
            is_active   INTEGER DEFAULT 1,
            created_at  TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
        )",
        [],
    )?;

    // 创建设备指纹表（如果不存在）
    conn.execute(
        "CREATE TABLE IF NOT EXISTS device_fingerprints (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            device_id     TEXT NOT NULL UNIQUE,
            first_seen    TEXT NOT NULL,
            last_seen     TEXT NOT NULL,
            hardware_hash TEXT NOT NULL,
            created_at    TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
        )",
        [],
    )?;

    // 创建设备指纹索引
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_df_device ON device_fingerprints(device_id)",
        [],
    )?;

    // 创建试用记录索引
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_trial_device ON trial_records(device_id)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_trial_active ON trial_records(is_active)",
        [],
    )?;

    Ok(())
}

/// 获取或创建设备指纹
pub fn get_or_create_device_fingerprint(conn: &Connection) -> rusqlite::Result<String> {
    use crate::services::device_fingerprint::DeviceFingerprint;

    // 尝试读取已保存的设备 ID
    if let Ok(Some(device_id)) = get_device_id(conn) {
        return Ok(device_id);
    }

    // 生成新指纹
    let fingerprint = DeviceFingerprint::generate();
    let device_id = fingerprint.formatted;
    let hardware_hash = fingerprint.hardware_hash;

    let now = Utc::now().to_rfc3339();

    // 保存设备指纹
    conn.execute(
        "INSERT OR REPLACE INTO device_fingerprints (device_id, first_seen, last_seen, hardware_hash, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            &device_id,
            &now,
            &now,
            &hardware_hash,
            &now,
            &now
        ],
    )?;

    // 同步保存到 system_config
    conn.execute(
        "INSERT OR REPLACE INTO system_config (config_key, config_value, updated_at)
         VALUES ('device_id', ?1, datetime('now'))",
        params![&device_id],
    )?;

    Ok(device_id)
}

/// 获取已保存的设备 ID
pub fn get_device_id(conn: &Connection) -> rusqlite::Result<Option<String>> {
    let mut stmt = conn.prepare("SELECT config_value FROM system_config WHERE config_key = 'device_id'")?;
    let device_id: Option<String> = stmt.query_row([], |row| row.get(0))?;
    Ok(device_id)
}

/// 检查是否有活跃的试用记录
pub fn has_active_trial(conn: &Connection, device_id: &str) -> rusqlite::Result<bool> {
    let mut stmt = conn.prepare(
        "SELECT COUNT(*) FROM trial_records WHERE device_id = ?1 AND is_active = 1"
    )?;
    let count: i64 = stmt.query_row(params![device_id], |row| row.get(0))?;
    Ok(count > 0)
}

/// 启动新的试用（首次激活）
pub fn activate_trial(conn: &Connection, device_id: &str) -> rusqlite::Result<TrialStatus> {
    let now = Utc::now();
    let started_at = now.to_rfc3339();
    let _expire_at = (now + Duration::days(7)).to_rfc3339();

    // 插入试用记录
    conn.execute(
        "INSERT OR REPLACE INTO trial_records (device_id, started_at, days_used, is_active, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![device_id, &started_at, 0, 1, &started_at],
    )?;

    // 更新设备指纹的 last_seen
    conn.execute(
        "UPDATE device_fingerprints SET last_seen = ?1, updated_at = ?1 WHERE device_id = ?2",
        params![&started_at, device_id],
    )?;

    // 同步到 system_config
    conn.execute(
        "INSERT OR REPLACE INTO system_config (config_key, config_value, updated_at)
         VALUES ('trial_started_at', ?1, datetime('now'))",
        params![&started_at],
    )?;

    Ok(TrialStatus::new_active(now))
}

/// 获取试用状态
pub fn get_trial_status(conn: &Connection, device_id: &str) -> rusqlite::Result<Option<TrialStatus>> {
    // 检查试用记录
    let mut stmt = conn.prepare(
        "SELECT started_at, days_used, is_active FROM trial_records WHERE device_id = ?1"
    )?;

    let result: Option<(String, i32, i32)> = stmt.query_row(params![device_id], |row| {
        Ok((row.get(0)?, row.get(1)?, row.get(2)?))
    }).ok();

    let (started_at_str, _days_used, is_active) = match result {
        Some(r) => r,
        None => return Ok(None),
    };

    if is_active == 0 {
        return Ok(None);
    }

    let started_at = match chrono::DateTime::parse_from_rfc3339(&started_at_str) {
        Ok(dt) => dt.with_timezone(&Utc),
        Err(_) => return Ok(None),
    };

    let now = Utc::now();
    // 按自然日差计算已用天数（跨天即 +1），避免"昨天启动、今天仍显示剩余 7 天"。
    let days_elapsed = (now.date_naive() - started_at.date_naive()).num_days().max(0) as i32;
    let days_remaining = 7 - days_elapsed;
    let _expire_at = (started_at + Duration::days(7)).to_rfc3339();

    // 检查时间篡改
    let time_tampered = now < started_at;

    Ok(Some(TrialStatus {
        is_active: days_remaining > 0,
        days_remaining,
        started_at: Some(started_at_str),
        expire_at: Some(_expire_at),
        days_used: days_elapsed.max(0),
        time_tampered,
    }))
}

/// 更新试用状态（检查是否过期）
pub fn update_trial_status(conn: &Connection, device_id: &str) -> rusqlite::Result<()> {
    let status = match get_trial_status(conn, device_id)? {
        Some(s) => s,
        None => return Ok(()),
    };

    if !status.is_active || status.days_remaining <= 0 {
        // 试用过期，标记为非活跃
        conn.execute(
            "UPDATE trial_records SET is_active = 0, days_used = ?1, updated_at = datetime('now') WHERE device_id = ?2",
            params![status.days_used, device_id],
        )?;
    } else {
        // 更新 last_seen
        conn.execute(
            "UPDATE trial_records SET days_used = ?1, updated_at = datetime('now') WHERE device_id = ?2",
            params![status.days_used, device_id],
        )?;

        // 更新设备指纹
        conn.execute(
            "UPDATE device_fingerprints SET last_seen = datetime('now'), updated_at = datetime('now') WHERE device_id = ?1",
            params![device_id],
        )?;
    }

    Ok(())
}

/// 检查系统时间是否被篡改
pub fn check_time_tampering(conn: &Connection, device_id: &str) -> rusqlite::Result<bool> {
    let mut stmt = conn.prepare(
        "SELECT first_seen, last_seen FROM device_fingerprints WHERE device_id = ?1"
    )?;

    let result: Option<(String, String)> = match stmt.query_row(params![device_id], |row| {
        Ok((row.get(0)?, row.get(1)?))
    }) {
        Ok(r) => Some(r),
        Err(_) => return Ok(false),
    };

    let (first_seen_str, last_seen_str) = match result {
        Some(r) => r,
        None => return Ok(false),
    };

    let first_seen = match chrono::DateTime::parse_from_rfc3339(&first_seen_str) {
        Ok(dt) => dt.with_timezone(&Utc),
        Err(_) => return Ok(false),
    };

    let last_seen = match chrono::DateTime::parse_from_rfc3339(&last_seen_str) {
        Ok(dt) => dt.with_timezone(&Utc),
        Err(_) => return Ok(false),
    };

    let now = Utc::now();

    // 检查：当前时间 < 最后使用时间 = 时间回拨
    let time_tampered = now < last_seen;

    // 也检查 first_seen > now（未来时间）
    let future_first_seen = first_seen > now;

    Ok(time_tampered || future_first_seen)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::device_fingerprint::DeviceFingerprint;

    fn test_db() -> (Connection, tempfile::TempDir) {
        let temp_dir = tempfile::tempdir().unwrap();
        let db_path = temp_dir.path().join("test.db");
        let conn = Connection::open(&db_path).unwrap();

        // 创建 system_config 表
        conn.execute(
            "CREATE TABLE IF NOT EXISTS system_config (
                config_key   TEXT PRIMARY KEY,
                config_value TEXT,
                updated_at   TEXT DEFAULT (datetime('now'))
            )",
            [],
        ).unwrap();

        init_db(&conn).unwrap();

        // 创建默认系统配置
        conn.execute(
            "INSERT OR IGNORE INTO system_config (config_key, config_value) VALUES ('device_id', NULL)",
            [],
        ).unwrap();
        conn.execute(
            "INSERT OR IGNORE INTO system_config (config_key, config_value) VALUES ('trial_started_at', NULL)",
            [],
        ).unwrap();

        (conn, temp_dir)
    }

    #[test]
    fn test_get_or_create_device_fingerprint() {
        let (conn, _temp) = test_db();
        let fp1 = get_or_create_device_fingerprint(&conn).unwrap();
        let fp2 = get_or_create_device_fingerprint(&conn).unwrap();

        assert_eq!(fp1, fp2);
        assert!(DeviceFingerprint::validate(&fp1));
    }

    #[test]
    fn test_trial_activation() {
        let (conn, _temp) = test_db();
        let device_id = get_or_create_device_fingerprint(&conn).unwrap();

        let status = activate_trial(&conn, &device_id).unwrap();

        assert!(status.is_active);
        assert_eq!(status.days_remaining, 7);
        assert!(status.started_at.is_some());
        assert!(status.expire_at.is_some());
    }

    #[test]
    fn test_trial_expiration() {
        let (conn, _temp) = test_db();
        let device_id = get_or_create_device_fingerprint(&conn).unwrap();

        // 直接插入一个过期的试用记录来测试过期逻辑
        use chrono::{Duration, Utc};
        let now = Utc::now();
        let started_at = (now - Duration::days(10)).to_rfc3339();
        let expire_at = (now - Duration::days(3)).to_rfc3339();

        conn.execute(
            "INSERT OR REPLACE INTO trial_records (device_id, started_at, days_used, is_active, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![device_id, &started_at, 10, 1, &expire_at],
        ).unwrap();

        // 同步到 system_config
        conn.execute(
            "INSERT OR REPLACE INTO system_config (config_key, config_value)
             VALUES ('trial_started_at', ?1)",
            params![&started_at],
        ).unwrap();

        let status = get_trial_status(&conn, &device_id).unwrap().unwrap();
        assert!(!status.is_active);
        assert!(status.days_remaining <= 0);
    }
}