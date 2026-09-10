/**
 * PMTool · 模板中心：全局模板目录绑定持久化（维护者 2026-09-09）
 *
 * 模板中心与项目文件管理逻辑一致，但模板目录是全局唯一的（不属某项目）。
 * 单行表 template_config(id=1)，存绑定的模板目录绝对路径。
 */

use rusqlite::Connection;

/// 读取当前绑定的模板目录（NULL = 未绑定）
pub fn get_template_directory(conn: &Connection) -> rusqlite::Result<Option<String>> {
    let mut stmt = conn.prepare("SELECT directory_path FROM template_config WHERE id = 1")?;
    let mut rows = stmt.query([])?;
    if let Some(row) = rows.next()? {
        Ok(row.get(0)?)
    } else {
        Ok(None)
    }
}

/// 设置 / 清除模板目录绑定（None = 清除）
pub fn set_template_directory(
    conn: &Connection,
    path: Option<&str>,
) -> rusqlite::Result<bool> {
    conn.execute(
        "UPDATE template_config SET directory_path = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = 1",
        rusqlite::params![path],
    )?;
    Ok(true)
}
