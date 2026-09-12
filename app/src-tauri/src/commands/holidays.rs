/**
 * PMTool · Holidays Tauri Commands
 * Phase 4.5 · 节假日 Provider 补全（维护者 2026-08-25 反馈）
 *
 * WebView 调用: invoke('list_holidays')
 *
 * 背景：
 *   - lib.rs 之前 generate_handler! 没注册 list_holidays
 *   - WebView 端 LocalHolidayProvider.load() 调 invoke('list_holidays') 抛错
 *   - try/catch 静默吞错 · cache 永远空 · 日历只显示默认工作日/周末
 *   - 维护者手动 INSERT 的节假日数据无法显示
 *
 * 修复（2026-08-25）：
 *   - 本模块实现 list_holidays 命令
 *   - lib.rs generate_handler! 注册
 *   - commands/mod.rs pub mod holidays;
 *   - repositories/mod.rs pub mod holidays;
 */

use std::time::Duration;

use tauri::State;

use crate::AppState;
use crate::repositories::holidays as holidays_repo;

/// 列出全部节假日（一次性加载）
#[tauri::command]
pub fn list_holidays(
    state: State<'_, AppState>,
) -> Result<Vec<holidays_repo::HolidayEntry>, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    holidays_repo::list_all(&pool).map_err(|e| e.to_string())
}

/// 拉取并同步某年度节假日（写入 holidays 表，返回描述）
#[tauri::command]
pub async fn sync_holidays(state: State<'_, AppState>, source_url: String, year: i64) -> Result<String, String> {
    let url = source_url.replace("{year}", &year.to_string());
    let fetched = {
        let url2 = url.clone();
        tauri::async_runtime::spawn_blocking(move || -> Result<serde_json::Value, String> {
            // 20s 超时：避免国外源（如 GitHub Raw）卡住 UI 很久
            let agent = ureq::AgentBuilder::new()
                .timeout(Duration::from_secs(20))
                .build();
            let resp = agent.get(&url2).call().map_err(|e| format!("请求失败（请检查网络或接口地址）: {}", e))?;
            let text = resp.into_string().map_err(|e| format!("读取响应失败: {}", e))?;
            serde_json::from_str(&text).map_err(|e| format!("返回内容不是合法 JSON: {}", e))
        }).await.map_err(|e| e.to_string())??
    };

    let items = extract_holiday_items(&fetched, year, &source_url)
        .map_err(|e| format!("同步失败：{}", e))?;
    if items.is_empty() {
        return Err("同步失败：未识别到节假日数据（请确认接口符合接入规范，见设置页说明）".into());
    }

    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let _ = holidays_repo::delete_by_source(&conn, &source_url);
    let n = holidays_repo::upsert_many(&conn, &items).map_err(|e| format!("写入失败: {}", e))?;
    Ok(format!("已同步 {} 条节假日数据", n))
}

/// 解析节假日接口返回，支持两种接入规范：
///   ① holiday-cn 格式（jsDelivr / GitHub Raw 默认源）：
///      { "year": 2026, "days": [ { "name": "元旦", "date": "2026-01-01", "isOffDay": true }, ... ] }
///   ② 日期映射格式（timor.tech 默认源）：
///      { "holiday": { "01-01": { "name": "元旦", "holiday": true }, ... } }
///      兼容顶层直接是 "MM-DD" 映射，或嵌套在 {year} 键下
///
/// 字段约定：isOffDay / holiday = true 表示放假（HOLIDAY）· false 表示调休上班（WORKDAY_SHIFT）
fn extract_holiday_items(
    v: &serde_json::Value,
    year: i64,
    source_url: &str,
) -> Result<Vec<holidays_repo::HolidayEntry>, String> {
    let obj = v.as_object().ok_or("接口返回格式错误：顶层应为 JSON 对象")?;
    let mut items = Vec::new();

    // 形状 ①：holiday-cn 的 days 数组
    if let Some(days) = obj.get("days").and_then(|d| d.as_array()) {
        for d in days {
            let o = d.as_object().ok_or("days 数组元素格式错误")?;
            if let Some(entry) = parse_entry("", o, year, source_url) {
                items.push(entry);
            }
        }
        return Ok(items);
    }

    // 形状 ②：MM-DD 日期映射（holiday 键 / year 键 / 顶层直接是映射）
    let root = obj
        .get("holiday").and_then(|x| x.as_object())
        .or_else(|| obj.get(&year.to_string()).and_then(|x| x.as_object()))
        .unwrap_or(obj);
    for (kk, vv) in root {
        if let Some(o) = vv.as_object() {
            if let Some(entry) = parse_entry(kk, o, year, source_url) {
                items.push(entry);
            }
        }
    }

    Ok(items)
}

/// 把单个条目对象转成 HolidayEntry；识别不出日期则跳过
fn parse_entry(
    key: &str,
    o: &serde_json::Map<String, serde_json::Value>,
    year: i64,
    source_url: &str,
) -> Option<holidays_repo::HolidayEntry> {
    let name = o.get("name").and_then(|x| x.as_str()).unwrap_or(key).to_string();
    let date = o.get("date").and_then(|x| x.as_str()).map(|s| s.to_string())
        .or_else(|| {
            if is_mmdd(key) { Some(format!("{:04}-{}", year, key)) } else { None }
        })?;
    // isOffDay 优先（holiday-cn），holiday 兜底（timor.tech）
    let off = o.get("isOffDay").and_then(|x| x.as_bool())
        .or_else(|| o.get("holiday").and_then(|x| x.as_bool()))
        .unwrap_or(true);
    Some(holidays_repo::HolidayEntry {
        id: 0,
        date,
        name,
        r#type: if off { "HOLIDAY".into() } else { "WORKDAY_SHIFT".into() },
        is_workday: (!off) as i64,
        source: source_url.to_string(),
    })
}

/// 键是否为 "MM-DD" 形态（长度 5，中间是 -）
fn is_mmdd(k: &str) -> bool {
    let b = k.as_bytes();
    b.len() == 5 && b[2] == b'-'
}

#[cfg(test)]
mod tests {
    use super::extract_holiday_items;
    use serde_json::json;

    fn run(src: &serde_json::Value, year: i64) -> Vec<crate::repositories::holidays::HolidayEntry> {
        extract_holiday_items(src, year, "test").unwrap()
    }

    /// 默认源② jsDelivr / ③ GitHub Raw：holiday-cn days 数组格式
    #[test]
    fn parses_holiday_cn_days_format() {
        let json = json!({
            "$schema": "https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/schema.json",
            "$id": "https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/2026.json",
            "year": 2026,
            "papers": ["https://www.gov.cn/zhengce/zhengceku/202511/content_7047091.htm"],
            "days": [
                { "name": "元旦", "date": "2026-01-01", "isOffDay": true },
                { "name": "元旦", "date": "2026-01-02", "isOffDay": true },
                { "name": "元旦", "date": "2026-01-03", "isOffDay": true },
                { "name": "元旦", "date": "2026-01-04", "isOffDay": false },
                { "name": "春节", "date": "2026-02-14", "isOffDay": false }
            ]
        });
        let items = run(&json, 2026);
        assert_eq!(items.len(), 5);
        assert_eq!(items[0].r#type, "HOLIDAY");
        assert_eq!(items[0].is_workday, 0);
        assert_eq!(items[0].name, "元旦");
        assert_eq!(items[3].r#type, "WORKDAY_SHIFT");
        assert_eq!(items[3].is_workday, 1);
    }

    /// 默认源① timor.tech：holiday 日期映射 + holiday 布尔字段
    #[test]
    fn parses_timor_holiday_map() {
        let json = json!({
            "code": 0,
            "holiday": {
                "01-01": { "holiday": true, "name": "元旦", "wage": 3, "date": "2026-01-01" },
                "01-02": { "holiday": true, "name": "元旦", "wage": 3, "date": "2026-01-02" },
                "01-04": { "holiday": false, "name": "元旦", "wage": 1, "date": "2026-01-04" }
            }
        });
        let items = run(&json, 2026);
        assert_eq!(items.len(), 3);
        assert_eq!(items[0].r#type, "HOLIDAY");
        assert_eq!(items[2].r#type, "WORKDAY_SHIFT");
        assert_eq!(items[0].date, "2026-01-01");
    }

    /// 顶层直接是 MM-DD 映射（无 name 时用键名做名称）
    #[test]
    fn parses_bare_mmdd_map() {
        let json = json!({ "05-01": { "isOffDay": true }, "05-02": { "isOffDay": false } });
        let items = run(&json, 2026);
        assert_eq!(items.len(), 2);
        assert_eq!(items[0].date, "2026-05-01");
        assert_eq!(items[0].name, "05-01");
        assert_eq!(items[1].r#type, "WORKDAY_SHIFT");
    }

    /// 顶层不是对象 → 报格式错误
    #[test]
    fn rejects_non_object() {
        let r = extract_holiday_items(&json!(42), 2026, "test");
        assert!(r.is_err());
    }

    /// 对象但没有可识别数据 → 返回空
    #[test]
    fn empty_when_no_matches() {
        let json = json!({ "ok": true });
        let items = extract_holiday_items(&json, 2026, "test").unwrap();
        assert!(items.is_empty());
    }
}


/// 清空全部法定节假日数据（设置页「清除法定节假日」按钮 · 用于测试与工作日历关联）
#[tauri::command]
pub fn clear_holidays(state: State<'_ , AppState>) -> Result<usize, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    holidays_repo::clear_all(&conn).map_err(|e| e.to_string())
}
