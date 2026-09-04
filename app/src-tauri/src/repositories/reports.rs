/**
 * PMTool · Reports 数据访问层
 * 维护者 2026-08-25 · 报告中心重构
 *
 * 对应表：reports（schema 0003 + period 列）
 *  - type: 'DAILY' | 'WEEKLY' | 'MONTHLY'
 *  - project_id: NULL = personal, value = project
 *  - period: 'YYYY-MM-DD' | 'YYYY-Www' | 'YYYY-MM' · 报告归属周期
 *  - content: 完整 Markdown
 *  - 唯一索引：(type, project_id, period) · 一个周期一条 · 重复生成覆盖
 */

use rusqlite::{params, Row};

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Report {
    pub id: i64,
    /// 'DAILY' | 'WEEKLY' | 'MONTHLY'
    #[serde(rename = "reportType")]
    pub r#type: String,
    /// NULL = personal, value = project · 必须始终序列化（即便 null）
    /// 之前用 skip_serializing_if 导致 webview 收到 undefined，过滤 `=== null` miss
    pub project_id: Option<i64>,
    pub title: String,
    pub content: Option<String>,
    pub template_id: Option<i64>,
    /// 'MANUAL' | 'AUTO' | 'AI'
    #[serde(rename = "generateType")]
    pub generate_type: String,
    /// 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
    pub status: String,
    pub period: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

fn row_to_report(row: &Row) -> rusqlite::Result<Report> {
    Ok(Report {
        id: row.get(0)?,
        r#type: row.get(1)?,
        project_id: row.get(2)?,
        title: row.get(3)?,
        content: row.get(4)?,
        template_id: row.get(5)?,
        generate_type: row.get(6)?,
        status: row.get(7)?,
        period: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
}

/// 列出报告（按 type / project_id / period 过滤）
#[allow(clippy::too_many_arguments)]
pub fn list(
    conn: &rusqlite::Connection,
    report_type: Option<&str>,
    project_id: Option<i64>,
    period: Option<&str>,
) -> rusqlite::Result<Vec<Report>> {
    let mut sql = String::from(
        "SELECT id, type, project_id, title, content, template_id, generate_type, status, period, created_at, updated_at FROM reports WHERE 1=1",
    );
    if report_type.is_some() {
        sql.push_str(" AND UPPER(type) = UPPER(?)");
    }
    if project_id.is_some() {
        sql.push_str(" AND project_id = ?");
    }
    if period.is_some() {
        sql.push_str(" AND period = ?");
    }
    sql.push_str(" ORDER BY created_at DESC");

    let mut stmt = conn.prepare(&sql)?;
    let rows = match (report_type, project_id, period) {
        (Some(t), Some(p), Some(per)) => stmt.query_map(params![t, p, per], row_to_report)?,
        (Some(t), Some(p), None) => stmt.query_map(params![t, p], row_to_report)?,
        (Some(t), None, Some(per)) => stmt.query_map(params![t, per], row_to_report)?,
        (None, Some(p), Some(per)) => stmt.query_map(params![p, per], row_to_report)?,
        (Some(t), None, None) => stmt.query_map(params![t], row_to_report)?,
        (None, Some(p), None) => stmt.query_map(params![p], row_to_report)?,
        (None, None, Some(per)) => stmt.query_map(params![per], row_to_report)?,
        (None, None, None) => stmt.query_map([], row_to_report)?,
    };
    rows.collect()
}

/// 获取单个报告
pub fn get_by_id(conn: &rusqlite::Connection, id: i64) -> rusqlite::Result<Option<Report>> {
    let mut stmt = conn.prepare(
        "SELECT id, type, project_id, title, content, template_id, generate_type, status, period, created_at, updated_at FROM reports WHERE id = ?1",
    )?;
    let mut rows = stmt.query_map([id], row_to_report)?;
    rows.next().transpose()
}

/// 查找同 (type, project_id, period) 的已有报告 id · 用于 upsert
fn find_existing_id(
    conn: &rusqlite::Connection,
    db_type: &str,
    project_id: Option<i64>,
    period: &str,
) -> rusqlite::Result<Option<i64>> {
    // 用动态 SQL 拼接 NULL 安全分支
    let mut sql = String::from(
        "SELECT id FROM reports WHERE UPPER(type) = UPPER(?1) AND period = ?2",
    );
    if project_id.is_some() {
        sql.push_str(" AND project_id = ?3");
    } else {
        sql.push_str(" AND project_id IS NULL");
    }
    sql.push_str(" LIMIT 1");

    // 用命名函数（fn pointer）而不是内联 closure · 保证两个 match 分支类型一致
    fn map_first_id(row: &Row) -> rusqlite::Result<i64> {
        row.get::<_, i64>(0)
    }

    let mut stmt = conn.prepare(&sql)?;
    let mut rows = match project_id {
        Some(p) => stmt.query_map(params![db_type, period, p], map_first_id)?,
        None => stmt.query_map(params![db_type, period], map_first_id)?,
    };
    rows.next().transpose()
}

/// 创建或覆盖报告
///   - 同 (type, project_id, period) 已存在 → UPDATE content/title
///   - 否则 INSERT
///   - 维护者原话："一天一个日报 · 重新生成就覆盖之前的"
#[allow(clippy::too_many_arguments)]
pub fn upsert(
    conn: &rusqlite::Connection,
    report_type: &str,
    project_id: Option<i64>,
    title: &str,
    content: &str,
    generate_type: &str,
    period: &str,
) -> rusqlite::Result<i64> {
    let db_type = report_type.to_uppercase();
    if let Some(existing_id) = find_existing_id(conn, &db_type, project_id, period)? {
        conn.execute(
            "UPDATE reports SET title = ?1, content = ?2, generate_type = ?3, updated_at = CURRENT_TIMESTAMP WHERE id = ?4",
            params![title, content, generate_type, existing_id],
        )?;
        Ok(existing_id)
    } else {
        conn.execute(
            "INSERT INTO reports (type, project_id, title, content, generate_type, status, period) VALUES (?1, ?2, ?3, ?4, ?5, 'PUBLISHED', ?6)",
            params![db_type, project_id, title, content, generate_type, period],
        )?;
        Ok(conn.last_insert_rowid())
    }
}

/// 更新报告（编辑内容时用）
pub fn update(
    conn: &rusqlite::Connection,
    id: i64,
    title: &str,
    content: &str,
) -> rusqlite::Result<bool> {
    let n = conn.execute(
        "UPDATE reports SET title = ?1, content = ?2, updated_at = CURRENT_TIMESTAMP WHERE id = ?3",
        params![title, content, id],
    )?;
    Ok(n > 0)
}

/// 删除报告
pub fn delete(conn: &rusqlite::Connection, id: i64) -> rusqlite::Result<bool> {
    let n = conn.execute("DELETE FROM reports WHERE id = ?1", [id])?;
    Ok(n > 0)
}