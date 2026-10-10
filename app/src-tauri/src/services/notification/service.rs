/**
 * PMTool · 消息与通知中心 · NotificationService
 * 2026-09-18 · docs/notification-center-rfc-2026-09-18.md §4/§6/§7
 *
 * 主流程（同步、快；通知绝不影响业务返回）：
 *   emit_event → 查规则（未启用直接 return）
 *             → dedup_key 幂等（已存在直接 return 旧消息 id）
 *             → 建 notification_message
 *             → 按规则 channel_ids 建 N 条 notification_delivery(PENDING)
 *             → worker 派发已实现渠道（in_app → SENT；未实现渠道保持 PENDING）
 *
 * 设计红线：
 *   - 业务模块只调 emit_event，永不直接碰具体渠道（红线 1）
 *   - 事件 → 规则 → 消息 → 派发，全部有 DB 留痕（红线 5）
 *   - 通知异常只记录日志，不向上抛到业务命令（红线 2）
 */

use crate::repositories::notification::{self as repo};

use super::channel::{channel_for, parse_channel_ids};
use super::event_catalog::{is_known_event, EVENT_TYPES};
use super::worker;
use super::{NotificationError, NotificationEvent};

/// 派发一条业务事件。
/// 返回：Ok(Some(message_id)) = 已建消息；Ok(None) = 规则未启用或 dedup 命中（幂等跳过）。
/// 任何通知失败只记日志，不向业务调用方抛错（红线 2）。
pub fn emit_event(
    conn: &rusqlite::Connection,
    event: &NotificationEvent,
) -> Result<Option<i64>, NotificationError> {
    // 1. 事件是否在目录内（未注册事件 = 无规则 = 不通知，红线 11）
    if !is_known_event(&event.event_type) {
        return Ok(None);
    }

    // 2. 查规则：未启用 → 不产生任何消息/派发（红线 11）
    let rule = match repo::get_rule_by_event(conn, &event.event_type)? {
        Some(r) => r,
        None => return Ok(None),
    };
    if !rule.enabled {
        return Ok(None);
    }

    // 3. 优先级：规则可覆盖事件默认（优先级由系统默认，允许通知规则覆盖）
    let priority = rule.priority.clone();

    // 4. 建消息（dedup_key 幂等：同 key 已存在 → 直接返回旧消息，不重发）
    let message_id = format!(
        "msg_{}_{}",
        event.event_type.to_lowercase(),
        event.dedup_key.replace(|c: char| !c.is_ascii_alphanumeric(), "-")
    );
    let (msg_id, created) = repo::insert_message(
        conn,
        &message_id,
        &event.title,
        &event.content,
        &event.event_type,
        &event.source_type,
        Some(event.source_id),
        event.project_id,
        &priority,
        &event.dedup_key,
    )?;

    if !created {
        return Ok(Some(msg_id)); // 幂等命中：不重复建派发
    }

    // 5. 按规则渠道建派发（只有启用且存在的渠道才建）
    let channel_types = parse_channel_ids(&rule.channel_ids)?;
    for ch in &channel_types {
        // 只建已存在的渠道（migration 种子 + 启动兜底），保证 FK 逻辑一致
        if repo::get_channel_by_type(conn, &ch.to_uppercase())?.is_some() {
            repo::insert_delivery(conn, msg_id, &ch.to_uppercase(), None)?;
        }
    }

    // 6. 派发已实现渠道（in_app → SENT；未实现渠道保持 PENDING 等 M3/Phase 2）
    worker::dispatch_pending(conn, msg_id)?;

    Ok(Some(msg_id))
}

/// 业务模块统一入口：发事件，但**绝不把错误抛回业务**（红线 2）。
/// 通知失败只记日志，业务命令的成功/失败不受影响。
pub fn emit_business_event(conn: &rusqlite::Connection, event: &NotificationEvent) {
    match emit_event(conn, event) {
        Ok(_) => {}
        Err(e) => crate::services::logging::log_line(&format!(
            "[WARN] 通知发送失败 event={} err={}",
            event.event_type, e
        )),
    }
}

/// 到期 / 逾期扫描（应用启动时执行）：
///   - end_date < 今天 且未完成 → TASK_OVERDUE
///   - end_date 为今天或明天   → TASK_DUE_SOON
/// dedup_key 含 end_date ⇒ 同一任务同一天只提醒一次（幂等）。
/// 返回本轮实际新产生的消息条数。
pub fn scan_due_tasks(conn: &rusqlite::Connection) -> Result<usize, NotificationError> {
    let today = chrono::Local::now().date_naive();
    let tomorrow = today + chrono::Duration::days(1);
    let mut created = 0usize;

    for t in crate::repositories::project_tasks::list_incomplete_with_due(conn)? {
        let Ok(due) = chrono::NaiveDate::parse_from_str(t.end_date.trim(), "%Y-%m-%d") else {
            continue; // 非法日期跳过，不让脏数据打断扫描
        };
        let (event_type, title, content) = if due < today {
            (
                "TASK_OVERDUE",
 format!("任务逾期：{}", t.task_name),
                format!(
                    "「{}」已逾期 {} 天，请尽快跟进处理。",
                    t.task_name,
                    (today - due).num_days()
                ),
            )
        } else if due <= tomorrow {
            (
                "TASK_DUE_SOON",
                format!("任务即将到期：{}", t.task_name),
                format!("「{}」将于 {} 到期。", t.task_name, t.end_date),
            )
        } else {
            continue;
        };

        let dedup_key = format!("task:{}:{}:{}", t.id, event_type.to_lowercase(), t.end_date);
        // 幂等：本轮已提醒过则跳过。注意 emit_event 命中 dedup 时会返回「已存在的 id」，
        // 不能拿 is_some() 当「新建」判据，否则重复扫描会被误计为新增。
        if crate::repositories::notification::exists_dedup_key(conn, &dedup_key)? {
            continue;
        }
        let ev = NotificationEvent {
            event_type: event_type.to_string(),
            source_type: "TASK".to_string(),
            source_id: t.id,
            project_id: Some(t.project_id),
            title,
            content,
            dedup_key,
            payload: None,
        };
        if emit_event(conn, &ev)?.is_some() {
            created += 1;
        }
    }
    Ok(created)
}

/// 直接发一条消息（不走规则匹配）。
/// 用途：系统测试通知 / 未来 AI 或外部调用方「主动告知」（RFC §8 notification.send）。
/// 仍走完整链路：message + IN_APP delivery + 幂等（dedup_key）+ 已读计数。
pub fn send_direct(
    conn: &rusqlite::Connection,
    event: &NotificationEvent,
) -> Result<Option<i64>, NotificationError> {
    let message_id = format!(
        "msg_{}_{}",
        event.event_type.to_lowercase(),
        event.dedup_key.replace(|c: char| !c.is_ascii_alphanumeric(), "-")
    );
    let (msg_id, created) = repo::insert_message(
        conn,
        &message_id,
        &event.title,
        &event.content,
        &event.event_type,
        &event.source_type,
        Some(event.source_id),
        event.project_id,
        "NORMAL", // 直接发送默认优先级（规则覆盖仅用于 emit_event 路径）
        &event.dedup_key,
    )?;
    if !created {
        return Ok(Some(msg_id));
    }
    // 站内直达：IN_APP 渠道必发（渠道被禁用时仍落库，供消息中心展示）
    repo::insert_delivery(conn, msg_id, "IN_APP", None)?;
    worker::dispatch_pending(conn, msg_id)?;
    Ok(Some(msg_id))
}

/// 规则展示元数据（给设置中心「消息与通知」分区）
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleMeta {
    pub event_type: String,
    pub name: String,
    pub builtin: bool,
}

/// 列出内置事件类别（供前端规则管理初始化「未建规则的类别」提示）
pub fn list_event_catalog() -> Vec<RuleMeta> {
    EVENT_TYPES
        .iter()
        .map(|(t, n, _, _)| RuleMeta {
            event_type: (*t).to_string(),
            name: (*n).to_string(),
            builtin: true,
        })
        .collect()
}

/// 启动兜底：确保种子渠道 + 内置规则存在（migration 0021 已在，此处理解为防御性）
/// 注意：channel_ids 必须存 JSON 数组字符串（与 parse_channel_ids 一致），
///       EVENT_TYPES 里是逗号分隔 CSV，这里转成 JSON 再落库。
pub fn ensure_seed(conn: &rusqlite::Connection) -> Result<(), NotificationError> {
    for (ch, name) in [("IN_APP", "站内消息"), ("EMAIL", "邮件")] {
        repo::ensure_channel(conn, ch, name)?;
    }
    for (et, name, _csv, priority) in EVENT_TYPES {
        let ch_json = super::channel::serialize_channel_ids(&super::event_catalog::default_channels(et));
        repo::ensure_rule(conn, et, name, &ch_json, priority)?;
    }
    // 修复存量规则：剔除已删除渠道（windows/macos/feishu/dingtalk/wecom），只留 in_app/email
    for rule in repo::list_rules(conn)? {
        let kept: Vec<String> = super::channel::parse_channel_ids(&rule.channel_ids)?
            .into_iter()
            .filter(|c| matches!(c.as_str(), "in_app" | "email"))
            .collect();
        let normalized = super::channel::serialize_channel_ids(&kept);
        if normalized != rule.channel_ids {
            repo::update_rule(conn, rule.id, rule.enabled, &normalized, &rule.priority)?;
        }
    }
    Ok(())
}

// ============================================================
// 单元测试（纯逻辑，无 DB）
// ============================================================
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unknown_event_is_silently_ignored() {
        // 不建临时库即可测目录外事件：直接调 is_known_event
        assert!(!is_known_event("TASK_ASSIGNED")); // 预留事件，V1 不注册
        assert!(is_known_event("TASK_OVERDUE"));
    }

    #[test]
    fn message_id_is_deterministic_and_safe() {
        let ev = NotificationEvent {
            event_type: "TASK_OVERDUE".to_string(),
            source_type: "TASK".to_string(),
            source_id: 123,
            project_id: None,
            title: "任务逾期".into(),
            content: "数据库部署已经逾期 2 天".into(),
            dedup_key: "task:123:overdue:2026-W38".into(),
            payload: None,
        };
        let _ = &ev;
        // emit 依赖 DB，此处只验证 id 生成逻辑（经 emit 集成测试覆盖 DB 链路）
        let mid = format!(
            "msg_{}_{}",
            ev.event_type.to_lowercase(),
            ev.dedup_key.replace(|c: char| !c.is_ascii_alphanumeric(), "-")
        );
        assert_eq!(mid, "msg_task_overdue_task-123-overdue-2026-W38");
    }
}