/**
 * PMTool · 消息与通知中心 · 内置事件类别目录（V1）
 * 2026-09-18 · docs/notification-center-rfc-2026-09-18.md §7
 *
 * V1 只做最接近用户价值的 7 类；其余事件（任务指派/项目状态/里程碑/
 * 需求/问题变更/AI）预留在 EVENT_TYPES 注释，不注册默认规则，等有明确价值再接。
 *
 * 每类对应 notification_rule 一行（migration 0021 种子；用户可启停/改渠道/改优先级）。
 * 红线 11/12：用户停用某类事件后，该类事件不再产生对应派发。
 */

/// 事件类别 → 显示名（与 migration 0021 种子规则一致）
pub const EVENT_TYPES: &[(&str, &str, &str, &str)] = &[
    // (event_type, name, 默认渠道, 默认优先级)
    // 2026-09-2?：默认渠道只保留 站内消息；邮件为可选项（配置后在规则里勾选）。
    // 已移除 Windows/macOS 系统通知、飞书/钉钉/企微。
    ("TASK_DUE_SOON", "任务即将到期", "in_app", "NORMAL"),
    ("TASK_OVERDUE", "任务逾期", "in_app", "HIGH"),
    ("TASK_COMPLETED", "任务完成", "in_app", "LOW"),
    ("HIGH_RISK_CREATED", "新增高风险", "in_app", "HIGH"),
    ("REPORT_GENERATED", "报告已生成", "in_app", "NORMAL"),
    ("BACKUP_COMPLETED", "备份完成", "in_app", "LOW"),
    ("BACKUP_FAILED", "备份失败", "in_app", "HIGH"),
];

/// 事件是否在目录内（未注册的事件 = 无规则 = 不通知）
pub fn is_known_event(event_type: &str) -> bool {
    EVENT_TYPES.iter().any(|(t, _, _, _)| *t == event_type)
}

/// 取事件的默认渠道（逗号分隔字符串 → 数组）。未知事件返回空。
pub fn default_channels(event_type: &str) -> Vec<String> {
    EVENT_TYPES
        .iter()
        .find(|(t, _, _, _)| *t == event_type)
        .map(|(_, _, ch, _)| ch.split(',').map(|s| s.to_string()).collect())
        .unwrap_or_default()
}

/// 取事件的默认优先级
pub fn default_priority(event_type: &str) -> Option<String> {
    EVENT_TYPES
        .iter()
        .find(|(t, _, _, _)| *t == event_type)
        .map(|(_, _, _, p)| p.to_string())
}

/// 事件显示名（消息中心 tab/列表用）
pub fn event_display_name(event_type: &str) -> String {
    EVENT_TYPES
        .iter()
        .find(|(t, _, _, _)| *t == event_type)
        .map(|(_, n, _, _)| n.to_string())
        .unwrap_or_else(|| event_type.to_string())
}