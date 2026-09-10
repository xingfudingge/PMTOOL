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
    let url2 = url.clone();
    let fetched = tauri::async_runtime::spawn_blocking(move || -> Result<serde_json::Value, String> {
        let resp = ureq::get(&url2).call().map_err(|e| format!("请求失败: {}", e))?;
        let text = resp.into_string().map_err(|e| format!("读取响应失败: {}", e))?;
        serde_json::from_str(&text).map_err(|e| format!("JSON 解析失败: {}", e))
    }).await.map_err(|e| e.to_string())??;

    // 兼容 holiday-cn 结构: { \"MM-DD\": { name, date, isOffDay } } 或 { \"{year}\": {...} }
    let mut items = Vec::new();
    let obj = matched_obj(&fetched, year);
    if let Some(map) = obj {
        for (kk, v) in map {
            let v = v.as_object().ok_or("条目格式错误")?;
            let name = v.get("name").and_then(|x| x.as_str()).unwrap_or(kk).to_string();
            let date = v.get("date").and_then(|x| x.as_str()).map(|s| s.to_string())
                .unwrap_or_else(|| format!("{:04}-{}", year, kk));
            let off = v.get("isOffDay").and_then(|x| x.as_bool()).unwrap_or(true);
            items.push(holidays_repo::HolidayEntry {
                id: 0,
                date,
                name,
                r#type: if off { "HOLIDAY".into() } else { "WORKDAY_SHIFT".into() },
                is_workday: (!off) as i64,
                source: source_url.clone(),
            });
        }
    }

    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let _ = holidays_repo::delete_by_source(&conn, &source_url);
    let n = holidays_repo::upsert_many(&conn, &items).map_err(|e| format!("写入失败: {}", e))?;
    Ok(format!("已同步 {} 条节假日数据", n))
}

fn matched_obj(v: &serde_json::Value, year: i64) -> Option<&serde_json::Map<String, serde_json::Value>> {
    if let Some(m) = v.as_object() {
        if let Some(inner) = m.get(&year.to_string()) {
            if let Some(obj) = inner.as_object() { return Some(obj); }
        }
        Some(m)
    } else {
        None
    }
}
