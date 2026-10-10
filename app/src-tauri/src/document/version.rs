/**
 * PMTool · Document Engine 版本管理（2026-09-18）
 *
 * 桌面单机场景：不存在多客户端乐观锁。唯一“并发”是“后台生成任务 vs 用户编辑同一文档”。
 * 因此用：
 *   - base_version 冲突判定：客户端 save 携带 baseVersion，若不等于当前 currentVersion，
 *     说明生成/其他操作已建新版 → 拒绝覆盖，返回 conflict；
 *   - 生成 / 自动任务默认 create_new_version=true，建新版而非覆盖用户当前编辑。
 */

/// 保存结果
#[derive(Debug, Clone)]
pub enum SaveOutcome {
    /// 保存成功 · 新版本号
    Saved { new_version: u64 },
    /// 冲突：客户端 base_version 落后于服务端 current_version ∷ 已被其他操作更新
    Conflict {
        server_version: u64,
        current_version: u64,
    },
}

/// 判定 base_version 是否需要拒绝：
///   - base 为 None（首次新增）→ 允许新建
///   - base == current → 允许
///   - 否则冲突（base 落后）
/// note: 仅当 base 显式传入时才做冲突检测（调用方可在“强制覆盖”时传 None）
pub fn check_conflict(base_version: Option<u64>, current_version: u64) -> Option<SaveOutcome> {
    match base_version {
        None => None, // 未做并发检测（首次 / 强制覆盖）
        Some(base) if base == current_version => None,
        Some(base) => Some(SaveOutcome::Conflict {
            server_version: current_version,
            current_version: base,
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn same_version_allows() {
        assert!(check_conflict(Some(3), 3).is_none());
    }

    #[test]
    fn stale_version_conflicts() {
        let c = check_conflict(Some(2), 3);
        assert!(matches!(c, Some(SaveOutcome::Conflict { server_version: 3, .. })));
    }

    #[test]
    fn no_base_skips_check() {
        assert!(check_conflict(None, 5).is_none());
    }
}