/**
 * PMTool · 消息与通知中心 · 渠道抽象与实现
 * 2026-09-18 · docs/notification-center-rfc-2026-09-18.md §4
 *
 * 已定案渠道列表（2026-09-2；去掉 Windows/macOS 系统通知 + 飞书/钉钉/企微，
 * 只保留 站内消息 + 邮件 —— 其余渠道经实测未生效，按维护者意见精简）：
 *   - in_app  → 站内消息（落库即达）
 *   - email   → 邮件（SMTP）
 *
 * 安全（红线 4/7）：SMTP 密码只进 OS 安全存储（keyring），绝不落库、
 *   绝不进 AI 上下文。DB 的 notification_channel.config 只存非机密字段。
 *
 * 未实现渠道 = 无 Channel 实现 = delivery 保持 PENDING。
 */

use crate::repositories::notification::{NotificationDelivery, NotificationMessage};

use super::NotificationError;

/// 渠道发送结果
#[derive(Debug, Clone, PartialEq)]
pub enum SendOutcome {
    /// 已送达
    Sent,
    /// 渠道当前不可用（如未配置）——不视为失败，不重试
    Skipped,
    /// 发送失败——记 last_error，进入失败/重试链路
    Failed(String),
}

/// 渠道抽象。Worker 按 channel_type 分发。
pub trait NotificationChannel: Send + Sync {
    fn channel_type(&self) -> &str;
    /// 执行一次实际发送。返回 outcome。
    fn send(&self, msg: &NotificationMessage, delivery: &NotificationDelivery) -> SendOutcome;
}

// ============================================================
// 渠道配置（DB notification_channel.config · 非机密）
// ============================================================

#[derive(Debug, Clone, Default, serde::Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ChannelConfig {
    // ---- 邮件 SMTP ----
    pub smtp_host: Option<String>,
    pub smtp_port: Option<u16>,
    /// 'SSL'（465）/ 'STARTTLS'（587）/ 'NONE'（25）
    pub encryption: Option<String>,
    pub username: Option<String>,
    pub from_email: Option<String>,
    pub from_name: Option<String>,
    /// 默认收件人（多个用逗号分隔）
    pub recipient: Option<String>,
}

fn parse_config(config_json: &str) -> ChannelConfig {
    serde_json::from_str(config_json).unwrap_or_default()
}

/// 消息纯文本（邮件用「标题\n正文」）
fn plain_text(msg: &NotificationMessage) -> String {
    if msg.title.is_empty() {
        msg.content.clone()
    } else {
        format!("{}\n{}", msg.title, msg.content)
    }
}

// ============================================================
// 站内消息
// ============================================================

/// 站内消息渠道：消息已落库即为「送达」，delivery 标记 SENT。
pub struct InAppChannel;

impl NotificationChannel for InAppChannel {
    fn channel_type(&self) -> &str {
        "in_app"
    }

    fn send(&self, _msg: &NotificationMessage, _delivery: &NotificationDelivery) -> SendOutcome {
        SendOutcome::Sent
    }
}

// ============================================================
// 邮件（SMTP）
// ============================================================

pub struct EmailChannel {
    pub config: ChannelConfig,
    /// SMTP 密码 / 授权码（来自 keyring）
    pub password: Option<String>,
}

impl NotificationChannel for EmailChannel {
    fn channel_type(&self) -> &str {
        "email"
    }

    fn send(&self, msg: &NotificationMessage, delivery: &NotificationDelivery) -> SendOutcome {
        let Some(host) = self.config.smtp_host.as_deref().filter(|s| !s.is_empty()) else {
            return SendOutcome::Skipped; // 未配置服务器
        };
        let Some(from) = self.config.from_email.as_deref().filter(|s| !s.is_empty()) else {
            return SendOutcome::Skipped;
        };
        // 收件人：派发记录优先，其次配置默认
        let to_raw = delivery
            .recipient
            .as_deref()
            .filter(|s| !s.is_empty())
            .or(self.config.recipient.as_deref())
            .unwrap_or("");
        let recipients: Vec<&str> = to_raw
            .split(',')
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .collect();
        if recipients.is_empty() {
            return SendOutcome::Failed("未配置收件人".into());
        }

        let port = self.config.smtp_port.unwrap_or(465);
        let encryption = self
            .config
            .encryption
            .as_deref()
            .unwrap_or("SSL")
            .to_uppercase();

        let from_name = self.config.from_name.as_deref().unwrap_or("PMTool");
        let from_mbox = match format!("{} <{}>", from_name, from).parse() {
            Ok(v) => v,
            Err(e) => return SendOutcome::Failed(format!("发件人地址非法: {}", e)),
        };

        let mut builder = lettre::Message::builder().from(from_mbox);
        for r in &recipients {
            match r.parse() {
                Ok(mbox) => builder = builder.to(mbox),
                Err(e) => return SendOutcome::Failed(format!("收件人 {} 非法: {}", r, e)),
            }
        }
        let email = match builder
            .subject(&msg.title)
            .header(lettre::message::header::ContentType::TEXT_PLAIN)
            .body(plain_text(msg))
        {
            Ok(m) => m,
            Err(e) => return SendOutcome::Failed(format!("构造邮件失败: {}", e)),
        };

        // 构建 SMTP transport
        let mut transport = match encryption.as_str() {
            "STARTTLS" => match lettre::SmtpTransport::starttls_relay(host) {
                Ok(t) => t.port(port),
                Err(e) => return SendOutcome::Failed(format!("SMTP 初始化失败: {}", e)),
            },
            "NONE" => lettre::SmtpTransport::builder_dangerous(host).port(port),
            // 默认 SSL（465）
            _ => match lettre::SmtpTransport::relay(host) {
                Ok(t) => t.port(port),
                Err(e) => return SendOutcome::Failed(format!("SMTP 初始化失败: {}", e)),
            },
        };
        if let (Some(user), Some(pwd)) = (self.config.username.as_deref(), self.password.as_deref())
        {
            if !user.is_empty() {
                transport =
                    transport.credentials(lettre::transport::smtp::authentication::Credentials::new(
                        user.to_string(),
                        pwd.to_string(),
                    ));
            }
        }
        let mailer = transport.build();

        match lettre::Transport::send(&mailer, &email) {
            Ok(_) => SendOutcome::Sent,
            Err(e) => SendOutcome::Failed(format!("邮件发送失败: {}", e)),
        }
    }
}

// ============================================================
// 工厂
// ============================================================

/// 取指定 channel_type 的渠道实现（未实现返回 None → delivery 保持 PENDING）
/// - config_json: DB notification_channel.config（非机密）
/// - secret: 该渠道的机密凭证（来自 keyring，可空）
pub fn channel_for(
    channel_type: &str,
    config_json: &str,
    secret: Option<String>,
) -> Option<Box<dyn NotificationChannel>> {
    let cfg = parse_config(config_json);
    match channel_type.to_ascii_lowercase().as_str() {
        "in_app" => Some(Box::new(InAppChannel)),
        "email" => Some(Box::new(EmailChannel {
            config: cfg,
            password: secret,
        })),
        _ => None,
    }
}

/// 渠道是否已实现（用于设置页展示与规则渠道勾选可用性）
pub fn is_implemented_channel(channel_type: &str) -> bool {
    matches!(channel_type.to_ascii_lowercase().as_str(), "in_app" | "email")
}

/// 是否外部渠道（邮件）——外部渠道含网络 I/O，须锁外派发
pub fn is_external_channel(channel_type: &str) -> bool {
    matches!(channel_type.to_ascii_lowercase().as_str(), "email")
}

/// 把仓库层的 channel_type 统一为小写（DB 存大写，事件/规则用小写）
pub fn normalize_channel_type(raw: &str) -> String {
    raw.to_ascii_lowercase()
}

/// 把规则的 channel_ids（JSON 数组字符串，如 '["in_app"]'）解析为 Vec<String>
pub fn parse_channel_ids(json: &str) -> Result<Vec<String>, NotificationError> {
    let v: serde_json::Value = serde_json::from_str(json)
        .map_err(|e| NotificationError::Invalid(format!("channel_ids JSON 解析失败: {}", e)))?;
    let arr = v
        .as_array()
        .ok_or_else(|| NotificationError::Invalid("channel_ids 应为 JSON 数组".into()))?;
    Ok(arr
        .iter()
        .filter_map(|x| x.as_str().map(|s| s.to_ascii_lowercase()))
        .collect())
}

/// 把 Vec<String> 序列化为规则可存的 channel_ids JSON
pub fn serialize_channel_ids(channels: &[String]) -> String {
    serde_json::to_string(channels).unwrap_or_else(|_| "[]".into())
}

// ============================================================
// 单元测试
// ============================================================
#[cfg(test)]
mod tests {
    use super::*;

    fn dummy_msg() -> NotificationMessage {
        NotificationMessage {
            id: 1,
            message_id: "msg_test".into(),
            title: "任务逾期".into(),
            content: "数据库部署已经逾期 2 天".into(),
            event_type: "TASK_OVERDUE".into(),
            source_type: "TASK".into(),
            source_id: Some(1),
            project_id: None,
            priority: "HIGH".into(),
            dedup_key: "k".into(),
            status: "UNREAD".into(),
            created_at: "2026-09-18".into(),
            read_at: None,
        }
    }

    fn dummy_delivery() -> NotificationDelivery {
        NotificationDelivery {
            id: 1,
            message_id: 1,
            channel_type: "in_app".into(),
            recipient: None,
            status: "PENDING".into(),
            attempt: 0,
            last_error: None,
            scheduled_at: None,
            sent_at: None,
            created_at: "2026-09-18".into(),
        }
    }

    #[test]
    fn parse_and_serialize_channel_ids() {
        let parsed = parse_channel_ids(r#"["in_app","EMAIL"]"#).unwrap();
        assert_eq!(parsed, vec!["in_app".to_string(), "email".to_string()]);
        let s = serialize_channel_ids(&["in_app".to_string()]);
        assert_eq!(s, r#"["in_app"]"#);
    }

    #[test]
    fn in_app_always_sent() {
        assert_eq!(
            InAppChannel.send(&dummy_msg(), &dummy_delivery()),
            SendOutcome::Sent
        );
    }

    #[test]
    fn only_in_app_and_email_implemented() {
        // 已删：Windows/macOS 系统通知、飞书/钉钉/企微
        assert!(is_implemented_channel("in_app"));
        assert!(is_implemented_channel("email"));
        assert!(!is_implemented_channel("windows"));
        assert!(!is_implemented_channel("macos"));
        assert!(!is_implemented_channel("feishu"));
        assert!(!is_implemented_channel("dingtalk"));
        assert!(!is_implemented_channel("wecom"));
        assert!(!is_implemented_channel("unknown"));
    }

    #[test]
    fn email_is_only_external_channel() {
        assert!(is_external_channel("email"));
        assert!(is_external_channel("EMAIL"));
        assert!(!is_external_channel("in_app"));
        assert!(!is_external_channel("feishu"));
    }

    #[test]
    fn email_without_recipient_fails_clearly() {
        let ch = EmailChannel {
            config: ChannelConfig {
                smtp_host: Some("smtp.example.com".into()),
                from_email: Some("a@example.com".into()),
                ..Default::default()
            },
            password: None,
        };
        match ch.send(&dummy_msg(), &dummy_delivery()) {
            SendOutcome::Failed(e) => assert!(e.contains("收件人")),
            other => panic!("应因缺收件人失败，实际 {:?}", other),
        }
    }

    #[test]
    fn email_unconfigured_is_skipped() {
        let ch = EmailChannel {
            config: ChannelConfig::default(),
            password: None,
        };
        assert_eq!(ch.send(&dummy_msg(), &dummy_delivery()), SendOutcome::Skipped);
    }

    #[test]
    fn config_json_parses_camel_case() {
        let cfg = parse_config(
            r#"{"smtpHost":"smtp.qq.com","smtpPort":465,"encryption":"SSL","fromEmail":"a@b.com"}"#,
        );
        assert_eq!(cfg.smtp_host.as_deref(), Some("smtp.qq.com"));
        assert_eq!(cfg.smtp_port, Some(465));
        assert_eq!(cfg.encryption.as_deref(), Some("SSL"));
        assert_eq!(cfg.from_email.as_deref(), Some("a@b.com"));
    }

    #[test]
    fn plain_text_joins_title_and_content() {
        assert_eq!(plain_text(&dummy_msg()), "任务逾期\n数据库部署已经逾期 2 天");
    }
}