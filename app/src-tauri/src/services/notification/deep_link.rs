/**
 * PMTool · 消息与通知中心 · 深链接
 * 2026-09-18 · docs/notification-center-rfc-2026-09-18.md §三十二/三十三
 *
 * 消息 → 目标页面。桌面 hash 路由 `#/{page}/{param}`（App.tsx parseHash）。
 * 点击站内消息 / 系统通知 → 前端 deepLink.ts 按 target 导航。
 *
 * V1 支持：项目详情 / 任务（落项目详情并聚焦任务）/ 报告 / 消息中心。
 * V1 不做 pmtool:// 自定义协议深链（M3 接系统通知插件时评估）。
 */

/// 前端导航目标（camelCase 序列化）
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeepLinkTarget {
    /// 'project' | 'task' | 'report' | 'messages'
    pub kind: String,
    /// 目标实体 id（messages 无）
    pub id: Option<i64>,
    /// 所属项目 id（task 必须，深链定位）
    pub project_id: Option<i64>,
    /// 前端 hash（可直接 location.hash 跳转）
    pub hash: String,
}

/// 根据来源字段生成深链目标。未知来源回退到消息中心。
/// source_type 不做大小写假设，统一大写比较（避免 &'static str 生命周期约束）。
pub fn target_for(
    source_type: &str,
    source_id: i64,
    project_id: Option<i64>,
) -> DeepLinkTarget {
    match source_type.to_uppercase().as_str() {
        "PROJECT" => DeepLinkTarget {
            kind: "project".into(),
            id: Some(source_id),
            project_id,
            hash: format!("#/projectDetail/{}", source_id),
        },
        "TASK" => DeepLinkTarget {
            kind: "task".into(),
            id: Some(source_id),
            project_id,
            // 项目 → 计划管理 → 整体计划 → 定位到该任务行
            hash: project_id
                .map(|pid| format!("#/projectDetail/{}?tab=planning&focusTask={}", pid, source_id))
                .unwrap_or_else(|| "#/projects".into()),
        },
        "ISSUE" => DeepLinkTarget {
            kind: "issue".into(),
            id: Some(source_id),
            project_id,
            // 项目 → 登记册 → 定位到该风险行
            hash: project_id
                .map(|pid| format!("#/projectDetail/{}?tab=registers&focusIssue={}", pid, source_id))
                .unwrap_or_else(|| "#/projects".into()),
        },
        "REPORT" => DeepLinkTarget {
            kind: "report".into(),
            id: Some(source_id),
            project_id,
            hash: "#/reports".into(),
        },
        // 其他（ISSUE/BACKUP/AI/SYSTEM）→ 消息中心
        _ => DeepLinkTarget {
            kind: "messages".into(),
            id: None,
            project_id,
            hash: "#/messages".into(),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn task_targets_specific_task_row() {
        let t = target_for("TASK", 42, Some(7));
        assert_eq!(t.kind, "task");
        assert_eq!(t.hash, "#/projectDetail/7?tab=planning&focusTask=42");
    }

    #[test]
    fn issue_targets_specific_risk_row() {
        let t = target_for("ISSUE", 88, Some(7));
        assert_eq!(t.kind, "issue");
        assert_eq!(t.hash, "#/projectDetail/7?tab=registers&focusIssue=88");
    }

    #[test]
    fn project_targets_own_detail() {
        let t = target_for("PROJECT", 7, Some(7));
        assert_eq!(t.hash, "#/projectDetail/7");
    }

    #[test]
    fn report_targets_reports_page() {
        let t = target_for("REPORT", 9, None);
        assert_eq!(t.hash, "#/reports");
    }

    #[test]
    fn unknown_falls_back_to_messages() {
        let t = target_for("BACKUP", 1, None);
        assert_eq!(t.hash, "#/messages");
    }
}