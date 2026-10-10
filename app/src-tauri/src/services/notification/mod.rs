/**
 * PMTool · 消息与通知中心 服务层模块入口
 * 2026-09-18 · V1 精简闭环（docs/notification-center-rfc-2026-09-18.md）
 *
 * 职责（红线 §3）：
 *   - 业务模块只调 service::emit_event()，绝不直接碰系统通知/SMTP/飞书/钉钉/企微
 *   - 通知异常绝不影响业务返回（emit 失败只记录日志）
 *   - 消息 ≠ 派发 ≠ 渠道；一切发送有 Delivery 记录；dedup_key 幂等
 *
 * 模块文件：
 *   - event_catalog.rs  内置事件类别 + 默认规则（V1 7 类）
 *   - channel.rs        Channel 抽象 + 本地渠道实现（in_app；系统通知 M3 接插件）
 *   - service.rs        NotificationService：emit_event 主流程
 *   - worker.rs         派发 Worker（V1 同步处理已实现渠道，外部渠道 Phase 2 异步+重试）
 *   - deep_link.rs      深链接（payload → 前端 hash 路由）
 */

pub mod channel;
pub mod credentials;
pub mod deep_link;
pub mod event_catalog;
pub mod service;
pub mod worker;

use serde_json::Value;

/// 通知模块统一错误类型
#[derive(Debug)]
pub enum NotificationError {
    /// DB 访问失败
    Db(String),
    /// 事件/规则/渠道参数非法
    Invalid(String),
    /// 渠道发送失败
    Channel(String),
}

impl std::fmt::Display for NotificationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            NotificationError::Db(m) => write!(f, "数据库错误: {}", m),
            NotificationError::Invalid(m) => write!(f, "无效参数: {}", m),
            NotificationError::Channel(m) => write!(f, "渠道错误: {}", m),
        }
    }
}

impl std::error::Error for NotificationError {}

impl From<rusqlite::Error> for NotificationError {
    fn from(e: rusqlite::Error) -> Self {
        NotificationError::Db(e.to_string())
    }
}

/// 业务事件（业务模块提交给 Notification Service 的最小事实）
/// V1 由业务写命令成功落库后构造，payload 只携带最小字段（不把整行 DB 塞进事件）。
#[derive(Debug, Clone)]
pub struct NotificationEvent {
    /// 事件类别（见 event_catalog::EVENT_TYPES）
    pub event_type: String,
    /// 来源类型：PROJECT/TASK/REPORT/ISSUE/BACKUP/AI/SYSTEM
    pub source_type: String,
    /// 来源实体 id
    pub source_id: i64,
    /// 所属项目 id（可空，深链定位用）
    pub project_id: Option<i64>,
    /// 消息标题（业务模块给最终文案；模板系统 Phase 4）
    pub title: String,
    /// 消息正文（业务模块给最终文案）
    pub content: String,
    /// 幂等键（同一业务事实重复触发不重发），如 `task:123:overdue:2026-W38`
    pub dedup_key: String,
    /// 附加负载（deep_link 用；可空）
    pub payload: Option<Value>,
}