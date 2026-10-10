/**
 * PMTool · 消息与通知中心 数据访问层
 * 2026-09-18 · V1 精简闭环（docs/notification-center-rfc-2026-09-18.md §5）
 *
 * 对应 4 张表：
 *   - notification_channel  渠道（一条 = 一种可发送出口）
 *   - notification_message  消息（一条 = 一条逻辑消息，不绑定渠道）
 *   - notification_delivery 派发（一条消息 -> 一个渠道 -> 一次发送记录）
 *   - notification_rule     规则（事件类别 + 启停 + 渠道 + 优先级）
 *
 * 设计约定：
 *   - 消息 ≠ 派发 ≠ 渠道：业务事件先建 message，再按规则建 N 条 delivery
 *   - dedup_key 唯一 ⇒ 幂等（重复事件/重启不重复发）
 *   - 外部渠道凭证不落库（走 keyring），DB 只存渠道级非机密 config
 */

use rusqlite::{params, Row};

// ============================================================
// 渠道
// ============================================================

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NotificationChannel {
    pub id: i64,
    /// 'IN_APP' | 'WINDOWS' | 'MACOS' | 'EMAIL' | 'FEISHU' | 'DINGTALK' | 'WECOM'
    pub channel_type: String,
    pub name: String,
    /// 0/1
    pub enabled: bool,
    /// JSON：渠道级配置（外部渠道用）+ credential_ref 指 keyring
    pub config: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

fn row_to_channel(row: &Row) -> rusqlite::Result<NotificationChannel> {
    let enabled: i64 = row.get(3)?;
    Ok(NotificationChannel {
        id: row.get(0)?,
        channel_type: row.get(1)?,
        name: row.get(2)?,
        enabled: enabled != 0,
        config: row.get(4)?,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
    })
}

const CHANNEL_COLS: &str =
    "id, channel_type, name, enabled, config, created_at, updated_at";

/// 列出所有渠道（固定顺序：站内 → 本机 → 外部）
pub fn list_channels(conn: &rusqlite::Connection) -> rusqlite::Result<Vec<NotificationChannel>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {CHANNEL_COLS} FROM notification_channel ORDER BY id"
    ))?;
    let rows = stmt.query_map([], row_to_channel)?;
    rows.collect()
}

/// 按 channel_type 取单个渠道
pub fn get_channel_by_type(
    conn: &rusqlite::Connection,
    channel_type: &str,
) -> rusqlite::Result<Option<NotificationChannel>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {CHANNEL_COLS} FROM notification_channel WHERE channel_type = ?1"
    ))?;
    let mut rows = stmt.query_map([channel_type], row_to_channel)?;
    rows.next().transpose()
}

/// 按 id 取单个渠道
pub fn get_channel_by_id(
    conn: &rusqlite::Connection,
    id: i64,
) -> rusqlite::Result<Option<NotificationChannel>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {CHANNEL_COLS} FROM notification_channel WHERE id = ?1"
    ))?;
    let mut rows = stmt.query_map([id], row_to_channel)?;
    rows.next().transpose()
}

/// 只更新渠道 config（不动 enabled）—— 保存渠道配置用
pub fn update_channel_config(
    conn: &rusqlite::Connection,
    id: i64,
    config: &str,
) -> rusqlite::Result<bool> {
    let n = conn.execute(
        "UPDATE notification_channel SET config = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
        params![config, id],
    )?;
    Ok(n > 0)
}

/// 更新渠道（enabled / config）。channel_type 不变。
pub fn update_channel(
    conn: &rusqlite::Connection,
    id: i64,
    enabled: bool,
    config: Option<&str>,
) -> rusqlite::Result<bool> {
    let n = conn.execute(
        "UPDATE notification_channel SET enabled = ?1, config = ?2, updated_at = CURRENT_TIMESTAMP WHERE id = ?3",
        params![enabled as i64, config, id],
    )?;
    Ok(n > 0)
}

/// 确保渠道存在（启动兜底：migration 种子在，但被删后可重建）
pub fn ensure_channel(
    conn: &rusqlite::Connection,
    channel_type: &str,
    name: &str,
) -> rusqlite::Result<i64> {
    if let Some(c) = get_channel_by_type(conn, channel_type)? {
        return Ok(c.id);
    }
    conn.execute(
        "INSERT OR IGNORE INTO notification_channel (channel_type, name, enabled) VALUES (?1, ?2, 1)",
        params![channel_type, name],
    )?;
    Ok(conn.last_insert_rowid())
}

// ============================================================
// 消息
// ============================================================

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NotificationMessage {
    pub id: i64,
    /// 'msg_xxxx'
    pub message_id: String,
    pub title: String,
    pub content: String,
    /// 'TASK_DUE_SOON' / 'TASK_OVERDUE' / ...（event_catalog）
    pub event_type: String,
    /// 'PROJECT' | 'TASK' | 'REPORT' | 'ISSUE' | 'BACKUP' | 'AI' | 'SYSTEM'
    pub source_type: String,
    pub source_id: Option<i64>,
    pub project_id: Option<i64>,
    /// 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL'
    pub priority: String,
    pub dedup_key: String,
    /// 'UNREAD' | 'READ'
    pub status: String,
    pub created_at: String,
    pub read_at: Option<String>,
}

fn row_to_message(row: &Row) -> rusqlite::Result<NotificationMessage> {
    Ok(NotificationMessage {
        id: row.get(0)?,
        message_id: row.get(1)?,
        title: row.get(2)?,
        content: row.get(3)?,
        event_type: row.get(4)?,
        source_type: row.get(5)?,
        source_id: row.get(6)?,
        project_id: row.get(7)?,
        priority: row.get(8)?,
        dedup_key: row.get(9)?,
        status: row.get(10)?,
        created_at: row.get(11)?,
        read_at: row.get(12)?,
    })
}

const MESSAGE_COLS: &str =
    "id, message_id, title, content, event_type, source_type, source_id, project_id, priority, dedup_key, status, created_at, read_at";

/// 列出消息
/// - filter: 'ALL' | 'UNREAD' | 'READ'（默认 ALL）
/// - source_type: 可选过滤（'TASK' / 'REPORT' / ...）
#[allow(clippy::too_many_arguments)]
pub fn list_messages(
    conn: &rusqlite::Connection,
    filter: Option<&str>,
    source_type: Option<&str>,
    limit: i64,
    offset: i64,
) -> rusqlite::Result<Vec<NotificationMessage>> {
    let mut sql = format!("SELECT {MESSAGE_COLS} FROM notification_message WHERE 1=1");
    let mut conds: Vec<String> = Vec::new();
    let mut vals: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    match filter.unwrap_or("ALL").to_uppercase().as_str() {
        "UNREAD" => conds.push("status = 'UNREAD'".to_string()),
        "READ" => conds.push("status = 'READ'".to_string()),
        _ => {}
    }
    if let Some(st) = source_type {
        if !st.is_empty() {
            conds.push("source_type = ?".to_string());
            vals.push(Box::new(st.to_uppercase()));
        }
    }
    if !conds.is_empty() {
        sql.push_str(" AND ");
        sql.push_str(&conds.join(" AND "));
    }
    sql.push_str(" ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?");

    // 动态 SQL 用运行时参数绑定（reports.rs 同款分叉模式）
    let limit_b = limit.to_string();
    let offset_b = offset.to_string();
    let mut stmt = conn.prepare(&sql)?;
    let rows = if vals.is_empty() {
        stmt.query_map([&limit_b, &offset_b], row_to_message)?
    } else if vals.len() == 1 {
        let v = vals.remove(0);
        stmt.query_map(params![v, &limit_b, &offset_b], row_to_message)?
    } else {
        unreachable!("目前仅支持 0/1 个过滤值");
    };
    rows.collect()
}

/// 按 id 取消息（含该消息的所有派发）
pub fn get_message_by_id(
    conn: &rusqlite::Connection,
    id: i64,
) -> rusqlite::Result<Option<NotificationMessage>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {MESSAGE_COLS} FROM notification_message WHERE id = ?1"
    ))?;
    let mut rows = stmt.query_map([id], row_to_message)?;
    rows.next().transpose()
}

/// 插入消息（幂等：dedup_key 冲突返回 None = 重复事件，不建新消息）
/// 返回 (id, 是否新建)。true = 新建，false = dedup 命中已存在。
pub fn insert_message(
    conn: &rusqlite::Connection,
    message_id: &str,
    title: &str,
    content: &str,
    event_type: &str,
    source_type: &str,
    source_id: Option<i64>,
    project_id: Option<i64>,
    priority: &str,
    dedup_key: &str,
) -> rusqlite::Result<(i64, bool)> {
    // 幂等判断先行：同 dedup_key 已有消息 → 直接返回已有 id（不重复插入）
    if let Some(existing) = find_message_by_dedup(conn, dedup_key)? {
        return Ok((existing, false));
    }
    conn.execute(
        "INSERT INTO notification_message \
         (message_id, title, content, event_type, source_type, source_id, project_id, priority, dedup_key) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            message_id,
            title,
            content,
            event_type,
            source_type.to_uppercase(),
            source_id,
            project_id,
            priority,
            dedup_key
        ],
    )?;
    Ok((conn.last_insert_rowid(), true))
}

/// 幂等键是否已存在（供调用方在 emit 前判断「这条是不是新的」）
pub fn exists_dedup_key(
    conn: &rusqlite::Connection,
    dedup_key: &str,
) -> rusqlite::Result<bool> {
    Ok(find_message_by_dedup(conn, dedup_key)?.is_some())
}

fn find_message_by_dedup(
    conn: &rusqlite::Connection,
    dedup_key: &str,
) -> rusqlite::Result<Option<i64>> {
    use rusqlite::OptionalExtension;
    conn.query_row(
        "SELECT id FROM notification_message WHERE dedup_key = ?1",
        [dedup_key],
        |row| row.get(0),
    )
    .optional()
}

/// 标记单条已读
pub fn mark_read(conn: &rusqlite::Connection, id: i64) -> rusqlite::Result<bool> {
    let n = conn.execute(
        "UPDATE notification_message SET status = 'READ', read_at = CURRENT_TIMESTAMP WHERE id = ?1 AND status = 'UNREAD'",
        [id],
    )?;
    Ok(n > 0)
}

/// 标记全部已读
pub fn mark_all_read(conn: &rusqlite::Connection) -> rusqlite::Result<usize> {
    let n = conn.execute(
        "UPDATE notification_message SET status = 'READ', read_at = CURRENT_TIMESTAMP WHERE status = 'UNREAD'",
        [],
    )?;
    Ok(n)
}

/// 未读数
pub fn unread_count(conn: &rusqlite::Connection) -> rusqlite::Result<i64> {
    conn.query_row(
        "SELECT COUNT(*) FROM notification_message WHERE status = 'UNREAD'",
        [],
        |row| row.get(0),
    )
}

/// 删除消息（级联删除派发）
pub fn delete_message(conn: &rusqlite::Connection, id: i64) -> rusqlite::Result<bool> {
    let n = conn.execute("DELETE FROM notification_message WHERE id = ?1", [id])?;
    Ok(n > 0)
}

/// 清空全部已读消息（外键 CASCADE 一并删除其派发记录）。返回删除条数。
pub fn clear_read(conn: &rusqlite::Connection) -> rusqlite::Result<usize> {
    let n = conn.execute("DELETE FROM notification_message WHERE status = 'READ'", [])?;
    Ok(n)
}

/// 清空全部消息（含未读）。返回删除条数。
pub fn clear_all(conn: &rusqlite::Connection) -> rusqlite::Result<usize> {
    let n = conn.execute("DELETE FROM notification_message", [])?;
    Ok(n)
}

// ============================================================
// 派发
// ============================================================

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NotificationDelivery {
    pub id: i64,
    pub message_id: i64,
    pub channel_type: String,
    pub recipient: Option<String>,
    /// 'PENDING' | 'SENT' | 'FAILED' | 'CANCELLED'
    pub status: String,
    pub attempt: i64,
    pub last_error: Option<String>,
    pub scheduled_at: Option<String>,
    pub sent_at: Option<String>,
    pub created_at: String,
}

fn row_to_delivery(row: &Row) -> rusqlite::Result<NotificationDelivery> {
    Ok(NotificationDelivery {
        id: row.get(0)?,
        message_id: row.get(1)?,
        channel_type: row.get(2)?,
        recipient: row.get(3)?,
        status: row.get(4)?,
        attempt: row.get(5)?,
        last_error: row.get(6)?,
        scheduled_at: row.get(7)?,
        sent_at: row.get(8)?,
        created_at: row.get(9)?,
    })
}

const DELIVERY_COLS: &str =
    "id, message_id, channel_type, recipient, status, attempt, last_error, scheduled_at, sent_at, created_at";

/// 为一条消息建派发（幂等：同 message_id+channel_type 不重复建）
pub fn insert_delivery(
    conn: &rusqlite::Connection,
    message_id: i64,
    channel_type: &str,
    recipient: Option<&str>,
) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT OR IGNORE INTO notification_delivery (message_id, channel_type, recipient) VALUES (?1, ?2, ?3)",
        params![message_id, channel_type, recipient],
    )?;
    Ok(())
}

/// 列出某消息的所有派发
pub fn list_deliveries(
    conn: &rusqlite::Connection,
    message_id: i64,
) -> rusqlite::Result<Vec<NotificationDelivery>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {DELIVERY_COLS} FROM notification_delivery WHERE message_id = ?1 ORDER BY id"
    ))?;
    let rows = stmt.query_map([message_id], row_to_delivery)?;
    rows.collect()
}

/// 获取单条派发
pub fn get_delivery(
    conn: &rusqlite::Connection,
    id: i64,
) -> rusqlite::Result<Option<NotificationDelivery>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {DELIVERY_COLS} FROM notification_delivery WHERE id = ?1"
    ))?;
    let mut rows = stmt.query_map([id], row_to_delivery)?;
    rows.next().transpose()
}

/// 标记派发成功
pub fn mark_delivery_sent(
    conn: &rusqlite::Connection,
    id: i64,
    scheduled_at: Option<&str>,
) -> rusqlite::Result<bool> {
    let n = conn.execute(
        "UPDATE notification_delivery SET status = 'SENT', attempt = attempt + 1, sent_at = CURRENT_TIMESTAMP, last_error = NULL, scheduled_at = ?1 WHERE id = ?2",
        params![scheduled_at, id],
    )?;
    Ok(n > 0)
}

/// 标记派发失败（记录错误 + 累加尝试次数）
pub fn mark_delivery_failed(
    conn: &rusqlite::Connection,
    id: i64,
    error: &str,
    scheduled_at: Option<&str>,
) -> rusqlite::Result<bool> {
    let n = conn.execute(
        "UPDATE notification_delivery SET status = 'FAILED', attempt = attempt + 1, last_error = ?1, scheduled_at = ?2 WHERE id = ?3",
        params![error, scheduled_at, id],
    )?;
    Ok(n > 0)
}

/// 列出可派发的派发记录：PENDING，或 FAILED 且未超重试上限（自动重试）。
/// 按创建时间升序，单次批量上限 200，避免一次拉爆。
pub fn list_dispatchable(
    conn: &rusqlite::Connection,
    max_attempts: i64,
) -> rusqlite::Result<Vec<NotificationDelivery>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {DELIVERY_COLS} FROM notification_delivery \
         WHERE status = 'PENDING' OR (status = 'FAILED' AND attempt < ?1) \
         ORDER BY created_at ASC, id ASC LIMIT 200"
    ))?;
    let rows = stmt.query_map([max_attempts], row_to_delivery)?;
    rows.collect()
}

/// 重置派发为 PENDING（手动重试）
pub fn reset_delivery_pending(conn: &rusqlite::Connection, id: i64) -> rusqlite::Result<bool> {
    let n = conn.execute(
        "UPDATE notification_delivery SET status = 'PENDING', last_error = NULL WHERE id = ?1",
        [id],
    )?;
    Ok(n > 0)
}

// ============================================================
// 规则
// ============================================================

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NotificationRule {
    pub id: i64,
    pub event_type: String,
    pub name: String,
    pub enabled: bool,
    /// JSON 数组字符串，如 '["in_app","windows","macos"]'
    pub channel_ids: String,
    pub priority: String,
    pub builtin: bool,
    pub created_at: String,
    pub updated_at: String,
}

fn row_to_rule(row: &Row) -> rusqlite::Result<NotificationRule> {
    let enabled: i64 = row.get(3)?;
    let builtin: i64 = row.get(6)?;
    Ok(NotificationRule {
        id: row.get(0)?,
        event_type: row.get(1)?,
        name: row.get(2)?,
        enabled: enabled != 0,
        channel_ids: row.get(4)?,
        priority: row.get(5)?,
        builtin: builtin != 0,
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

const RULE_COLS: &str =
    "id, event_type, name, enabled, channel_ids, priority, builtin, created_at, updated_at";

/// 列出所有规则
pub fn list_rules(conn: &rusqlite::Connection) -> rusqlite::Result<Vec<NotificationRule>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {RULE_COLS} FROM notification_rule ORDER BY id"
    ))?;
    let rows = stmt.query_map([], row_to_rule)?;
    rows.collect()
}

/// 按 event_type 取规则
pub fn get_rule_by_event(
    conn: &rusqlite::Connection,
    event_type: &str,
) -> rusqlite::Result<Option<NotificationRule>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {RULE_COLS} FROM notification_rule WHERE event_type = ?1"
    ))?;
    let mut rows = stmt.query_map([event_type], row_to_rule)?;
    rows.next().transpose()
}

/// 更新规则（启停 / 渠道 / 优先级）。event_type 不变。
pub fn update_rule(
    conn: &rusqlite::Connection,
    id: i64,
    enabled: bool,
    channel_ids: &str,
    priority: &str,
) -> rusqlite::Result<bool> {
    let n = conn.execute(
        "UPDATE notification_rule SET enabled = ?1, channel_ids = ?2, priority = ?3, updated_at = CURRENT_TIMESTAMP WHERE id = ?4",
        params![enabled as i64, channel_ids, priority, id],
    )?;
    Ok(n > 0)
}

/// 确保规则存在（启动兜底：migration 种子在，但可被删除后重建）
pub fn ensure_rule(
    conn: &rusqlite::Connection,
    event_type: &str,
    name: &str,
    channel_ids: &str,
    priority: &str,
) -> rusqlite::Result<i64> {
    if let Some(r) = get_rule_by_event(conn, event_type)? {
        return Ok(r.id);
    }
    conn.execute(
        "INSERT OR IGNORE INTO notification_rule (event_type, name, enabled, channel_ids, priority, builtin) VALUES (?1, ?2, 1, ?3, ?4, 1)",
        params![event_type, name, channel_ids, priority],
    )?;
    Ok(conn.last_insert_rowid())
}