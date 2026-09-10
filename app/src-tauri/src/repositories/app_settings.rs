/**
 * PMTool · 应用设置：key-value 持久化（维护者 2026-09-09 · 设置中心）
 *
 * 所有设置以字符串统一存储（theme / userName / aiApiKey ...），
 * 前端负责类型转换。单表 app_settings(key PRIMARY KEY, value)。
 */

use rusqlite::{params, Connection};

/// 读取某个设置（不存在返回 None）
pub fn get_setting(conn: &Connection, key: &str) -> rusqlite::Result<Option<String>> {
    let mut stmt = conn.prepare("SELECT value FROM app_settings WHERE key = ?1")?;
    let mut rows = stmt.query(params![key])?;
    if let Some(row) = rows.next()? {
        Ok(row.get(0)?)
    } else {
        Ok(None)
    }
}

/// 读取全部设置（key -> value）
pub fn get_all_settings(conn: &Connection) -> rusqlite::Result<std::collections::HashMap<String, String>> {
    let mut stmt = conn.prepare("SELECT key, value FROM app_settings")?;
    let mut rows = stmt.query([])?;
    let mut map = std::collections::HashMap::new();
    while let Some(row) = rows.next()? {
        let k: String = row.get(0)?;
        let v: Option<String> = row.get(1)?;
        if let Some(v) = v {
            map.insert(k, v);
        }
    }
    Ok(map)
}

/// 写入 / 更新设置（UPSERT）
pub fn set_setting(conn: &Connection, key: &str, value: &str) -> rusqlite::Result<bool> {
    conn.execute(
        "INSERT INTO app_settings (key, value, updated_at) VALUES (?1, ?2, CURRENT_TIMESTAMP) \
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP",
        params![key, value],
    )?;
    Ok(true)
}
