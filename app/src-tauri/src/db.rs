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

// 编译期嵌入的迁移列表（build.rs 生成；生产安装后 cwd 变化，运行时找不到相对目录时回退用）
include!(concat!(env!("OUT_DIR"), "/migrations.rs"));

/// 应用数据库连接（带 Mutex 保护）
pub type DbPool = Mutex<Connection>;

/// 数据库路径：app_data_dir/pmtool.db
fn db_path(app_data_dir: &PathBuf) -> PathBuf {
    app_data_dir.join("pmtool.db")
}

/// 打开数据库连接并确保迁移（供启动 & 首启/迁移切换数据目录共用）
/// - 打开（不存在则创建）指定目录下的 pmtool.db
/// - 开启外键约束
/// - 执行 schema migration（幂等）
pub fn open_and_migrate(data_dir: &PathBuf) -> Result<Connection, rusqlite::Error> {
    let path = db_path(data_dir);
    eprintln!("[DB] 打开数据库: {:?}", path);

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

    Ok(conn)
}

/// 初始化数据库（应用启动时调用）
/// - 创建数据库文件
/// - 执行 schema migration
/// - 返回包装后的 Connection（供 AppState 管理）
pub fn init(app_data_dir: &PathBuf) -> Result<DbPool, rusqlite::Error> {
    eprintln!("[DB] 初始化数据库: {:?}", db_path(&app_data_dir));

    let conn = open_and_migrate(app_data_dir)?;

    // 维护者 2026-09-07 · 修正：不再启动时自动补建项目知识空间。
    // 知识空间只能从知识中心「添加项目」创建（前端 handleAdd 会先查后建，必要时自动创空间+绑定）。
    // 启动兜底会凭空给未绑定项目造空间，导致「项目知识树出现从未创建过的目录」「再添加就报错」。

    eprintln!("[DB] ✅ 数据库就绪");
    Ok(Mutex::new(conn))
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

    // 开发期 cwd=项目根能找到运行时目录；生产安装后 cwd 变化 → 回退编译期嵌入。
    if let Some(dir) = find_migrations_dir() {
        eprintln!("[Migration] 运行时目录: {:?}", dir);
        let entries = list_migration_files(&dir)?;
        let refs: Vec<(&str, &str)> = entries.iter().map(|(n, s)| (n.as_str(), s.as_str())).collect();
        run_migrations_from_list(conn, &refs)
    } else {
        eprintln!("[Migration] 运行时目录不可用，使用编译期嵌入的迁移");
        run_migrations_from_list(conn, &MIGRATIONS)
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

/// 按文件名排序收集运行时 .sql 文件（仅开发期 cwd=项目根可命中）
fn list_migration_files(dir: &PathBuf) -> Result<Vec<(String, String)>, rusqlite::Error> {
    let mut files: Vec<PathBuf> = std::fs::read_dir(dir)
        .map_err(|e| {
            eprintln!("[Migration] 读取目录失败: {:?}", e);
            rusqlite::Error::QueryReturnedNoRows
        })?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.extension().and_then(|s| s.to_str()) == Some("sql"))
        .collect();
    files.sort();

    let mut out = Vec::new();
    for path in files {
        let name = path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("unknown")
            .to_string();
        let sql = std::fs::read_to_string(&path).map_err(|e| {
            eprintln!("[Migration] 读取文件失败 {:?}: {:?}", path, e);
            rusqlite::Error::QueryReturnedNoRows
        })?;
        out.push((name, sql));
    }
    Ok(out)
}

/// 通用迁移执行：接收 (文件名, SQL) 列表（运行时读取 / 编译期嵌入共用）
fn run_migrations_from_list(
    conn: &Connection,
    migrations: &[(&str, &str)],
) -> Result<(), rusqlite::Error> {
    eprintln!("[Migration] 发现 {} 个迁移文件", migrations.len());

    for &(filename, sql) in migrations {
        // 检查是否已应用
        let already_applied: bool = conn
            .query_row(
                "SELECT 1 FROM migrations WHERE filename = ?1",
                rusqlite::params![filename],
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
            rusqlite::params![filename],
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