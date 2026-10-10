/**
 * PMTool · 消息与通知中心 · 派发 Worker
 * 2026-09-18 · docs/notification-center-rfc-2026-09-18.md §4
 *
 * V1：同步派发已实现渠道
 *   - in_app  → 落库即 SENT
 *   - email / feishu / dingtalk / wecom → 读 config + keyring 凭证后实际发送
 * 未实现渠道（windows/macos 系统通知 → M3 接插件）保持 PENDING，等实现落地后由同一 worker 补派发。
 *
 * 外部渠道失败 → 记 last_error + FAILED，可经 notification_delivery_retry 重试。
 * 渠道未配置（Skipped）→ 保持 PENDING，不算失败。
 */

use crate::repositories::notification::{self as repo, NotificationDelivery, NotificationMessage};

use super::channel::{channel_for, is_external_channel, NotificationChannel, SendOutcome};
use super::credentials;
use super::NotificationError;

/// 一次待派发作业：把「发送所需数据」预先从 DB 读出，
/// 使真实网络 I/O 可以在 **DB 锁外** 执行（见 collect_pending_jobs 的说明）。
pub struct SendJob {
    pub delivery_id: i64,
    pub message: NotificationMessage,
    pub delivery: NotificationDelivery,
    pub channel: Box<dyn NotificationChannel>,
}

/// 只读收集：某消息所有「PENDING 且渠道已启用、已实现」的派发作业。
///
/// **本函数不产生任何网络 I/O**（只读 DB + 读 keyring 凭证），可在持锁时调用。
/// 收集到的作业必须交给 [`run_jobs`] 在 **锁外** 执行，再用 [`apply_outcome`] 写回。
pub fn collect_pending_jobs(
    conn: &rusqlite::Connection,
    message_id: i64,
) -> Result<Vec<SendJob>, NotificationError> {
    let Some(message) = repo::get_message_by_id(conn, message_id)? else {
        return Ok(Vec::new());
    };
    let mut jobs = Vec::new();
    for d in repo::list_deliveries(conn, message_id)? {
        if d.status != "PENDING" {
            continue;
        }
        let ch_type = d.channel_type.to_ascii_lowercase();

        // 渠道行（拿 config + id + 启停）
        let ch_row = repo::get_channel_by_type(conn, &d.channel_type)?;
        if let Some(row) = &ch_row {
            if !row.enabled {
                continue; // 渠道被用户停用 → 不发送（保持 PENDING）
            }
        }
        let config_json = ch_row
            .as_ref()
            .and_then(|c| c.config.clone())
            .unwrap_or_else(|| "{}".to_string());
        let secret = ch_row
            .as_ref()
            .and_then(|c| credentials::read_channel_secret(c.id));

        let Some(chan) = channel_for(&ch_type, &config_json, secret) else {
            continue; // 未实现渠道保持 PENDING
        };
        jobs.push(SendJob {
            delivery_id: d.id,
            message: message.clone(),
            delivery: d.clone(),
            channel: chan,
        });
    }
    Ok(jobs)
}

/// 自动重试上限（FAILED 且 attempt < 此值时会被后台线程重试）
pub const MAX_ATTEMPTS: i64 = 3;

/// 收集**全库**待派发的外界渠道作业（PENDING + 未超限的 FAILED）。
///
/// 供后台派发线程使用：只读 DB，**无网络 I/O**，可在持锁时调用；
/// 结果必须交给 [`run_jobs`] 在锁外执行。
/// 本地渠道（in_app）在 emit_event 时已同步送达，这里只关心外部渠道。
pub fn collect_all_pending(
    conn: &rusqlite::Connection,
) -> Result<Vec<SendJob>, NotificationError> {
    let mut jobs = Vec::new();
    for d in repo::list_dispatchable(conn, MAX_ATTEMPTS)? {
        let ch_type = d.channel_type.to_ascii_lowercase();
        // 只处理已实现的外部渠道；本地渠道/未实现渠道跳过
        if !is_external_channel(&ch_type) {
            continue;
        }
        // 渠道行：拿 config + id（读凭证）+ 启停状态
        let Some(row) = repo::get_channel_by_type(conn, &d.channel_type)? else {
            continue;
        };
        if !row.enabled {
            continue; // 用户停用了该渠道
        }
        let config_json = row.config.clone().unwrap_or_else(|| "{}".to_string());
        let secret = credentials::read_channel_secret(row.id);
        let Some(chan) = channel_for(&ch_type, &config_json, secret) else {
            continue;
        };
        let Some(message) = repo::get_message_by_id(conn, d.message_id)? else {
            continue;

        };
        jobs.push(SendJob {
            delivery_id: d.id,
            message,
            delivery: d,
            channel: chan,
        });
    }
    Ok(jobs)
}

/// 执行一批作业 → (delivery_id, outcome)。
///
/// **绝不能在持有 DB 锁（state.db.lock()）时调用**：外部渠道会发起 SMTP/Webhook
/// 网络请求，持锁执行会阻塞所有其他 DB 命令，导致整个界面卡死。
pub fn run_jobs(jobs: Vec<SendJob>) -> Vec<(i64, SendOutcome)> {
    jobs.into_iter()
        .map(|j| {
            let outcome = j.channel.send(&j.message, &j.delivery);
            (j.delivery_id, outcome)
        })
        .collect()
}

/// 写回单条派发结果（只写 DB，无网络 I/O），可在持锁时调用。
pub fn apply_outcome(
    conn: &rusqlite::Connection,
    delivery_id: i64,
    outcome: &SendOutcome,
) -> Result<(), NotificationError> {
    match outcome {
        SendOutcome::Sent => {
            repo::mark_delivery_sent(conn, delivery_id, None)?;
        }
        SendOutcome::Skipped => {
            // 渠道不可用/未配置：不视为失败，保持 PENDING 等配置后补发
        }
        SendOutcome::Failed(err) => {
            repo::mark_delivery_failed(conn, delivery_id, err, None)?;
        }
    }
    Ok(())
}

/// 同步派发**本地渠道**（in_app 落库即达，无网络 I/O）。
///
/// 用途：emit_event / send_direct 这类「调用方已持有 DB 锁」的路径。
/// 外部渠道（email/feishu/dingtalk/wecom）会发起真实网络请求，在持锁路径执行会冻结
/// 整个应用，因此这里**只派发本地渠道**；外部渠道的派发由命令层按
/// `collect_pending_jobs → run_jobs（锁外）→ apply_outcome` 完成
/// （见 commands::notification::notification_channel_test / notification_delivery_retry）。
pub fn dispatch_pending(
    conn: &rusqlite::Connection,
    message_id: i64,
) -> Result<(), NotificationError> {
    for job in collect_pending_jobs(conn, message_id)? {
        // 外部渠道含网络 I/O：持锁路径跳过，交由命令层锁外派发
        if is_external_channel(job.channel.channel_type()) {
            continue;
        }
        let outcome = job.channel.send(&job.message, &job.delivery);
        apply_outcome(conn, job.delivery_id, &outcome)?;
    }
    Ok(())
}

/// 单条派发重试（手动）：重置为 PENDING 后立即派发一次。
///
/// 注意：本函数会在持锁下执行派发，仅适用于本地渠道；命令层请改用
/// `collect_pending_jobs` + `run_jobs`（锁外）+ `apply_outcome` 的拆分流程。
pub fn retry_delivery(conn: &rusqlite::Connection, delivery_id: i64) -> Result<(), NotificationError> {
    let Some(d) = repo::get_delivery(conn, delivery_id)? else {
        return Err(NotificationError::Invalid("派发记录不存在".into()));
    };
    repo::reset_delivery_pending(conn, delivery_id)?;
    dispatch_pending(conn, d.message_id)
}

// 系统级弹窗通知（Windows/macOS）已于 2026-09-2? 移除：只保留站内消息 + 邮件。