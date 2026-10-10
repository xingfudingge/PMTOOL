/**
 * PMTool · 消息与通知中心 Tauri Commands
 * 2026-09-18 · V1 精简闭环（docs/notification-center-rfc-2026-09-18.md §8）
 *
 * 命令面（invoke 前端封装在 app/src/services/notification.ts）：
 *   - notification.list / markRead / markAllRead / unreadCount  站内消息
 *   - notification.rule.list / rule.set                       事件启停/渠道/优先级
 *   - notification.channel.list / channel.set                 渠道启停/配置
 *   - notification.delivery.list / delivery.retry             派发记录 / 重试
 *   - notification.test / permission / device                 测试/权限/设备
 *   - notification.send                                       API 直接发一条（统一走 service）
 *   - notification.deepLink                                  深链解析
 *
 * 设计红线：
 *   - 业务模块永不直接碰渠道 API（统一经 service::emit_event）
 *   - 通知异常只记录日志，不阻塞业务返回
 *   - 只读/配置命令在命令层做参数校验，业务在 service/repo（沿用现有分层）
 */

use tauri::State;

use crate::AppState;
use crate::repositories::notification::{self as repo};
use crate::services::notification::{self as notif_svc, deep_link, event_catalog};

// ============================================================
// 站内消息
// ============================================================

/// 消息列表
/// filter: 'ALL' | 'UNREAD' | 'READ'；sourceType: 可选（'TASK'/'REPORT'/...）
#[tauri::command]
pub fn notification_list(
    state: State<'_, AppState>,
    filter: Option<String>,
    source_type: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Vec<repo::NotificationMessage>, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    repo::list_messages(&pool, filter.as_deref(), source_type.as_deref(), limit.unwrap_or(50), offset.unwrap_or(0))
        .map_err(|e| e.to_string())
}

/// 单条消息（含派发）
#[tauri::command]
pub fn notification_get(
    state: State<'_, AppState>,
    id: i64,
) -> Result<Option<repo::NotificationMessage>, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    repo::get_message_by_id(&pool, id).map_err(|e| e.to_string())
}

/// 标记单条已读
#[tauri::command]
pub fn notification_mark_read(
    state: State<'_, AppState>,
    id: i64,
) -> Result<bool, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    repo::mark_read(&pool, id).map_err(|e| e.to_string())
}

/// 全部已读
#[tauri::command]
pub fn notification_mark_all_read(state: State<'_, AppState>) -> Result<usize, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    repo::mark_all_read(&pool).map_err(|e| e.to_string())
}

/// 未读数
#[tauri::command]
pub fn notification_unread_count(state: State<'_, AppState>) -> Result<i64, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    repo::unread_count(&pool).map_err(|e| e.to_string())
}

/// 删除单条消息（连带其派发记录）
#[tauri::command]
pub fn notification_delete(state: State<'_, AppState>, id: i64) -> Result<bool, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    repo::delete_message(&pool, id).map_err(|e| e.to_string())
}

/// 清空已读消息（未读保留）
#[tauri::command]
pub fn notification_clear_read(state: State<'_, AppState>) -> Result<usize, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    repo::clear_read(&pool).map_err(|e| e.to_string())
}

/// 清空全部消息（含未读 · 二次确认由前端负责）
#[tauri::command]
pub fn notification_clear_all(state: State<'_, AppState>) -> Result<usize, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    repo::clear_all(&pool).map_err(|e| e.to_string())
}

// ============================================================
// 规则
// ============================================================

/// 列出所有通知规则（含内置规则）
#[tauri::command]
pub fn notification_rule_list(
    state: State<'_, AppState>,
) -> Result<Vec<repo::NotificationRule>, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    repo::list_rules(&pool).map_err(|e| e.to_string())
}

/// 更新规则（启停 / 渠道 / 优先级）
#[tauri::command]
pub fn notification_rule_set(
    state: State<'_, AppState>,
    id: i64,
    enabled: bool,
    channel_ids: Vec<String>,
    priority: Option<String>,
) -> Result<bool, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    let ch_json = notif_svc::channel::serialize_channel_ids(&channel_ids);
    let prio = priority.unwrap_or_else(|| "NORMAL".to_string());
    repo::update_rule(&pool, id, enabled, &ch_json, &prio).map_err(|e| e.to_string())
}

/// 事件目录（前端规则管理可展示未建规则的类别）
#[tauri::command]
pub fn notification_event_catalog() -> Result<Vec<notif_svc::service::RuleMeta>, String> {
    Ok(notif_svc::service::list_event_catalog())
}

// ============================================================
// 渠道
// ============================================================

/// 列出所有渠道
#[tauri::command]
pub fn notification_channel_list(
    state: State<'_, AppState>,
) -> Result<Vec<repo::NotificationChannel>, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    repo::list_channels(&pool).map_err(|e| e.to_string())
}

/// 更新渠道（启停 / 配置）
#[tauri::command]
pub fn notification_channel_set(
    state: State<'_, AppState>,
    id: i64,
    enabled: bool,
    config: Option<String>,
) -> Result<bool, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    repo::update_channel(&pool, id, enabled, config.as_deref()).map_err(|e| e.to_string())
}

/// 保存外部渠道配置（config 非机密部分落库；secret 进 OS 安全存储）
/// - config: JSON 字符串（smtpHost/smtpPort/encryption/username/fromEmail/fromName/recipient/webhook/keyword/groupName）
/// - secret: SMTP 密码/授权码、飞书签名密钥、钉钉加签 Secret（可空 = 不改动已有凭证）
#[tauri::command]
pub fn notification_channel_save(
    state: State<'_, AppState>,
    id: i64,
    config: String,
    secret: Option<String>,
) -> Result<bool, String> {
    // 先写凭证（失败则不落 config，避免「配置存了但密码没存」的半成品状态）
    if let Some(s) = secret.as_deref() {
        if !s.is_empty() {
            notif_svc::credentials::save_channel_secret(id, s)
                .map_err(|e| format!("凭证保存失败：{}", e))?;
        }
    }
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    repo::update_channel_config(&pool, id, &config).map_err(|e| e.to_string())
}

/// 渠道是否已配置凭证（不返回凭证内容本身 · 红线 7）
#[tauri::command]
pub fn notification_channel_has_secret(id: i64) -> Result<bool, String> {
    Ok(notif_svc::credentials::has_channel_secret(id))
}

/// 删除渠道凭证
#[tauri::command]
pub fn notification_channel_clear_secret(id: i64) -> Result<bool, String> {
    notif_svc::credentials::delete_channel_secret(id)
        .map(|_| true)
        .map_err(|e| e.to_string())
}

/// 渠道测试发送（走真实渠道实现，验证配置是否正确）
///
/// 注意：SMTP/Webhook 是阻塞网络 I/O，必须**在释放 DB 锁之后**执行
/// ——持锁做网络请求会阻塞所有其他 DB 命令，导致整个界面卡死。
#[tauri::command]
pub async fn notification_channel_test(
    state: State<'_, AppState>,
    id: i64,
) -> Result<String, String> {
    // 1. 持锁只读：渠道类型 + 非机密配置 + keyring 凭证，随即释放锁
    let (ch_type, config_json, secret) = {
        let pool = state.db.lock().map_err(|e| e.to_string())?;
        let ch = repo::get_channel_by_id(&pool, id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "渠道不存在".to_string())?;
        let secret = notif_svc::credentials::read_channel_secret(ch.id);
        (
            ch.channel_type.clone(),
            ch.config.clone().unwrap_or_else(|| "{}".to_string()),
            secret,
        )
    };

    // 2. 锁外发送（spawn_blocking：阻塞 I/O 不得占用 Tauri 异步线程）
    tauri::async_runtime::spawn_blocking(move || {
        let chan = notif_svc::channel::channel_for(&ch_type, &config_json, secret)
            .ok_or_else(|| format!("{} 渠道尚未实现", ch_type))?;

        // 构造测试消息（不落库，只走渠道发送）
        let msg = repo::NotificationMessage {
            id: 0,
            message_id: "msg_test".into(),
            title: "PMTool 测试通知".into(),
            content: "这是一条来自 PMTool 的测试通知，收到即表示渠道配置正确。".into(),
            event_type: "SYSTEM_TEST".into(),
            source_type: "SYSTEM".into(),
            source_id: Some(0),
            project_id: None,
            priority: "NORMAL".into(),
            dedup_key: "system:test".into(),
            status: "UNREAD".into(),
            created_at: String::new(),
            read_at: None,
        };
        let delivery = repo::NotificationDelivery {
            id: 0,
            message_id: 0,
            channel_type: ch_type.clone(),
            recipient: None,
            status: "PENDING".into(),
            attempt: 0,
            last_error: None,
            scheduled_at: None,
            sent_at: None,
            created_at: String::new(),
        };

        match chan.send(&msg, &delivery) {
            notif_svc::channel::SendOutcome::Sent => Ok("测试发送成功".into()),
            notif_svc::channel::SendOutcome::Skipped => {
                Err("渠道尚未配置完整（请检查服务器地址/Webhook/收件人等必填项）".into())
            }
            notif_svc::channel::SendOutcome::Failed(e) => Err(format!("测试发送失败：{}", e)),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

// ============================================================
// 派发
// ============================================================

/// 某消息的派发记录
#[tauri::command]
pub fn notification_delivery_list(
    state: State<'_, AppState>,
    message_id: i64,
) -> Result<Vec<repo::NotificationDelivery>, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    repo::list_deliveries(&pool, message_id).map_err(|e| e.to_string())
}

/// 手动重试失败派发（重置为 PENDING 后立即派发一次）
///
/// 网络 I/O（SMTP/Webhook）在锁外执行：持锁重置+收集作业 → 放锁发送 → 持锁写回结果。
#[tauri::command]
pub async fn notification_delivery_retry(
    state: State<'_, AppState>,
    id: i64,
) -> Result<bool, String> {
    // 1. 持锁：校验存在 + 重置为 PENDING + 收集待派发作业（只读，无网络 I/O）
    let jobs = {
        let pool = state.db.lock().map_err(|e| e.to_string())?;
        let d = repo::get_delivery(&pool, id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "派发记录不存在".to_string())?;
        repo::reset_delivery_pending(&pool, id).map_err(|e| e.to_string())?;
        notif_svc::worker::collect_pending_jobs(&pool, d.message_id).map_err(|e| e.to_string())?
    };

    // 2. 锁外发送（阻塞 I/O 放 spawn_blocking）
    let outcomes = tauri::async_runtime::spawn_blocking(move || notif_svc::worker::run_jobs(jobs))
        .await
        .map_err(|e| e.to_string())?;

    // 3. 持锁写回结果
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    for (delivery_id, outcome) in &outcomes {
        notif_svc::worker::apply_outcome(&pool, *delivery_id, outcome)
            .map_err(|e| e.to_string())?;
    }
    Ok(true)
}

// ============================================================
// 测试 / 权限 / 深链
// ============================================================

/// 发送测试消息（走 send_direct 直发链路，验证 消息+站内派发+幂等）
#[tauri::command]
pub fn notification_test(state: State<'_, AppState>) -> Result<i64, String> {
    let event = notif_svc::NotificationEvent {
        event_type: "SYSTEM_TEST".to_string(),
        source_type: "SYSTEM".to_string(),
        source_id: 0,
        project_id: None,
        title: "PMTool 测试通知".into(),
        content: "这是一条测试通知。如果你看到了它，说明通知链路正常。".into(),
        dedup_key: format!(
            "system:test:{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis())
                .unwrap_or(0)
        ),
        payload: None,
    };
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    match notif_svc::service::send_direct(&pool, &event) {
        Ok(Some(id)) => Ok(id),
        Ok(None) => Ok(0),
        Err(e) => {
            // 测试消息静默失败：记录日志即可
            crate::services::logging::log_line(&format!("[WARN] notification.test: {}", e));
            Ok(0)
        }
    }
}

/// 主动发一条站内消息（供 AI / 报告 / 外部调用方用；统一走 service 直发，不碰规则）
#[tauri::command]
pub fn notification_send(
    state: State<'_, AppState>,
    title: String,
    content: String,
    source_type: Option<String>,
    source_id: Option<i64>,
    project_id: Option<i64>,
    dedup_key: Option<String>,
) -> Result<i64, String> {
    let event = notif_svc::NotificationEvent {
        event_type: "SYSTEM".to_string(),
        source_type: source_type.unwrap_or_else(|| "SYSTEM".to_string()),
        source_id: source_id.unwrap_or(0),
        project_id,
        title,
        content,
        dedup_key: dedup_key.unwrap_or_else(|| format!(
            "send:{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis())
                .unwrap_or(0)
        )),
        payload: None,
    };
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    match notif_svc::service::send_direct(&pool, &event) {
        Ok(Some(id)) => Ok(id),
        Ok(None) => Ok(0),
        Err(e) => Err(e.to_string()),
    }
}

/// 深链解析（点击站内消息 → 前端导航）
#[tauri::command]
pub fn notification_deep_link(
    source_type: String,
    source_id: i64,
    project_id: Option<i64>,
) -> Result<deep_link::DeepLinkTarget, String> {
    Ok(deep_link::target_for(&source_type, source_id, project_id))
}

/// 事件目录展示名（消息中心 tab / 列表用）
#[tauri::command]
pub fn notification_event_name(event_type: String) -> Result<String, String> {
    Ok(event_catalog::event_display_name(&event_type))
}