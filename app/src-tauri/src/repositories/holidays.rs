/**
 * PMTool · Holidays 数据访问层
 * Phase 4.5 · 节假日 Provider 补全（维护者 2026-08-25 反馈）
 *
 * 职责：纯 SQL 操作 holidays 表
 *
 * schema.sql 定义：
 *   id, date, name, type, is_workday, source, created_at
 *
 * 用途：
 *   - WebView 启动时通过 list_holidays 一次性加载到内存
 *   - HolidayProvider 用缓存判断某天是法定节假日 / 调休工作日
 *
 * 注意：
 *   - date 字段 SQLite DATE 类型存储为 'YYYY-MM-DD' 字符串
 *   - WebView 端 HolidayEntry 接口期望 snake_case JSON 字段
 */

use rusqlite::{params, Connection, Row};
use serde::{Deserialize, Serialize};

/// Holidays 数据行
///
/// 注意：#[serde(rename_all = "camelCase")] 把 snake_case Rust 字段序列化成 camelCase JSON
/// 让 WebView 端可以直接用 entry.isWorkday / entry.workdayShift 访问
/// （之前没加这个 attribute → WebView 端 isWorkday 一直 undefined → 节假日无法识别）
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HolidayEntry {
    pub id: i64,
    pub date: String,        // 'YYYY-MM-DD'
    pub name: String,        // '国庆节' / '中秋调休上班' ...
    pub r#type: String,      // 'HOLIDAY' / 'WORKDAY_SHIFT'  (JSON 字段: "type")
    pub is_workday: i64,     // 1 = 调休上班 / 0 = 放假  (JSON 字段: "isWorkday")
    pub source: String,      // 'NATIONAL_API' / 'MANUAL'
}

fn row_to_holiday(row: &Row) -> rusqlite::Result<HolidayEntry> {
    Ok(HolidayEntry {
        id: row.get(0)?,
        date: row.get(1)?,
        name: row.get(2)?,
        r#type: row.get(3)?,
        is_workday: row.get(4)?,
        source: row.get(5)?,
    })
}

/**
 * 列出全部节假日（按 date 升序）
 * WebView 启动时一次性调用 · 缓存到 HolidayProvider 内存
 */
pub fn list_all(conn: &Connection) -> rusqlite::Result<Vec<HolidayEntry>> {
    let mut stmt = conn.prepare(
        "SELECT id, date, name, type, is_workday, source FROM holidays ORDER BY date ASC",
    )?;
    let entries = stmt
        .query_map(params![], row_to_holiday)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(entries)
}
