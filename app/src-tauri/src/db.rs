/**
 * PMTool Tauri 2.x · 数据库模块
 * Phase 0 · T0.4e + T0.4c
 *
 * 设计依据：RFC-03 §1 分层架构
 *   React Page → Feature Service → Tauri Typed Command → Rust Service → Repository → SQLite
 *
 * 本模块职责：
 *   1. 初始化 rusqlite 连接（应用启动时）
 *   2. 执行 schema migration（启动时）
 *   3. 提供 Connection 给 Repository 层（通过 AppState.db）
 *   4. 不暴露通用 SQL execute/query 接口
 *
 * T0.4c 变更：
 *   - 从 schema.sql 单文件迁移到 migrations/ 多文件（drizzle-kit 格式）
 *   - 加 migrations 表跟踪已应用迁移
 *   - 拆分 SQL 按 `--> statement-breakpoint` 分隔符
 */

use rusqlite::{Connection, OpenFlags, OptionalExtension};
use std::path::PathBuf;
use std::sync::Mutex;

/// 应用数据库连接（带 Mutex 保护）
pub type DbPool = Mutex<Connection>;

/// 数据库路径：app_data_dir/pmtool.db
fn db_path(app_data_dir: &PathBuf) -> PathBuf {
    app_data_dir.join("pmtool.db")
}

/// 初始化数据库（应用启动时调用）
/// - 创建数据库文件
/// - 执行 schema migration
/// - 返回包装后的 Connection（供 AppState 管理）
pub fn init(app_data_dir: &PathBuf) -> Result<DbPool, rusqlite::Error> {
    let path = db_path(&app_data_dir);
    eprintln!("[DB] 初始化数据库: {:?}", path);

    // 确保数据目录存在
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).ok();
    }

    let conn = Connection::open_with_flags(
        &path,
        OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_CREATE,
    )?;

    // 外键约束开启（SQLite 默认关闭）
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;

    // 执行 schema migration（drizzle-kit 格式）
    run_migrations(&conn)?;

    // 维护者 2026-09-04 · 设计文档 §15：为每个项目补建缺失的独立知识空间
    ensure_project_knowledge_spaces(&conn).ok();

    eprintln!("[DB] ✅ 数据库就绪");
    Ok(Mutex::new(conn))
}

/// 维护者 2026-09-04 · 设计文档 §15
/// 为 projects 表中每个项目补建缺失的独立知识空间（knowledge_spaces · space_type='project'）。
/// 项目知识中心要求“每个项目一个独立知识空间”，此函数作为兜底：老库中已有项目但无空间时补齐。
fn ensure_project_knowledge_spaces(conn: &Connection) -> rusqlite::Result<()> {
    let mut stmt = conn.prepare("SELECT id, project_name FROM projects")?;
    let projects: Vec<(i64, String)> = stmt
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?
        .collect::<Result<Vec<_>, _>>()?;

    for (pid, name) in projects {
        let exists: bool = conn
            .query_row(
                "SELECT 1 FROM knowledge_spaces WHERE space_type = 'project' AND project_id = ?1",
                [pid],
                |_| Ok(true),
            )
            .optional()?
            .unwrap_or(false);
        if !exists {
            conn.execute(
                "INSERT INTO knowledge_spaces (space_type, project_id, name, created_at, updated_at)
                 VALUES ('project', ?1, ?2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
                rusqlite::params![pid, name],
            )?;
            eprintln!("[DB] 补建项目知识空间: {:?} ({})", pid, name);
        }
    }
    Ok(())
}

/// 执行 migration（启动时）
/// T0.4c：支持 drizzle-kit 多文件 migration 格式
///   - 按文件名排序执行 database/migrations/*.sql
///   - 每个文件按 `--> statement-breakpoint` 拆分
///   - 通过 migrations 表跟踪已应用迁移（幂等）
fn run_migrations(conn: &Connection) -> Result<(), rusqlite::Error> {
    // 编译时嵌入 migrations（来自项目根 database/migrations/）
    // 注意：实际路径是 src-tauri/ → ../../../database/migrations/
    // 但因为 include_str! 在编译时确定，这里用 try_include_str! 风格不可行
    // 实际方案：开发期从相对路径读取，生产期由 build.rs 嵌入

    // 简化：先支持运行时读取 + 编译时 fallback
    let migrations_dir = find_migrations_dir();

    match migrations_dir {
        Some(dir) => {
            // 运行时读取模式（开发 + 生产）
            run_migrations_from_dir(conn, &dir)
        }
        None => {
            eprintln!("[Migration] ⚠️ 找不到 migrations 目录，使用空 schema（首次运行）");
            Ok(())
        }
    }
}

/// 查找 migrations 目录（多路径 fallback）
fn find_migrations_dir() -> Option<PathBuf> {
    let candidates = [
        // 开发期：从 src-tauri/target/debug/ 运行时 cwd 是项目根
        PathBuf::from("database/migrations"),
        PathBuf::from("../database/migrations"),
        PathBuf::from("../../database/migrations"),
        PathBuf::from("../../../database/migrations"),
    ];

    for candidate in &candidates {
        if candidate.is_dir() {
            eprintln!("[Migration] 使用 migrations 目录: {:?}", candidate);
            return Some(candidate.clone());
        }
    }
    None
}

/// 从目录读取并执行 migrations
fn run_migrations_from_dir(conn: &Connection, dir: &PathBuf) -> Result<(), rusqlite::Error> {
    // 收集 .sql 文件
    let entries: Vec<PathBuf> = std::fs::read_dir(dir)
        .map_err(|e| {
            eprintln!("[Migration] 读取目录失败: {:?}", e);
            rusqlite::Error::QueryReturnedNoRows // placeholder，实际应该自定义错误类型
        })?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.extension().and_then(|s| s.to_str()) == Some("sql"))
        .collect();

    // 按文件名排序（0001 → 0002 → ...）
    let mut entries = entries;
    entries.sort();

    eprintln!("[Migration] 发现 {} 个迁移文件", entries.len());

    for path in entries {
        let filename = path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("unknown")
            .to_string();

        // 检查是否已应用
        let already_applied: bool = conn
            .query_row(
                "SELECT 1 FROM migrations WHERE filename = ?1",
                [&filename],
                |_| Ok(true),
            )
            .optional()
            .unwrap_or(None)
            .is_some();

        if already_applied {
            eprintln!("[Migration] 跳过已应用: {}", filename);
            continue;
        }

        eprintln!("[Migration] 应用: {}", filename);

        let sql = std::fs::read_to_string(&path).map_err(|e| {
            eprintln!("[Migration] 读取文件失败 {:?}: {:?}", path, e);
            rusqlite::Error::QueryReturnedNoRows
        })?;

        // drizzle-kit 格式：按 `--> statement-breakpoint` 拆分
        let statements: Vec<&str> = sql
            .split("--> statement-breakpoint")
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .collect();

        for stmt in statements {
            match conn.execute_batch(stmt) {
                Ok(_) => {}
                Err(e) => {
                    let msg = e.to_string();
                    // 忽略 idempotent 错误（重复执行同一迁移时不应当 panic）
                    //  - "already exists"：CREATE TABLE/INDEX IF NOT EXISTS 已处理
                    //  - "duplicate column name"：ALTER TABLE ADD COLUMN 重复执行
                    if !msg.contains("already exists")
                        && !msg.contains("duplicate column name")
                    {
                        eprintln!("[Migration] 执行失败: {}", stmt);
                        return Err(e);
                    }
                }
            }
        }

        // 记录已应用（OR IGNORE · 兼容 schema.sql 末尾预插的 INSERT OR IGNORE INTO migrations）
        conn.execute(
            "INSERT OR IGNORE INTO migrations (filename) VALUES (?1)",
            [&filename],
        )?;
    }

    eprintln!("[Migration] ✅ 所有 migrations 已应用");
    Ok(())
}

/// 测试辅助：获取 schema 版本
pub fn get_schema_version(conn: &Connection) -> Option<String> {
    let mut stmt = conn
        .prepare("SELECT config_value FROM system_config WHERE config_key = 'schema_version'")
        .ok()?;
    let mut rows = stmt.query([]).ok()?;
    let row = rows.next().ok()??;
    row.get(0).ok()
}