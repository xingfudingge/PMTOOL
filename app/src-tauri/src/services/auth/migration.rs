/**
 * PMTool · 旧版数据库授权数据迁移（DB → OS 安全存储）
 *
 * 设计依据：授权体系与数据库隔离改造（2026-09-16）§27
 *   - 旧版本把 License / 设备指纹 / 试用记录存在业务数据库。升级后必须把
 *     授权相关数据从数据库迁出到安全存储，随后由 SQL 迁移 DROP 授权表。
 *   - 原则：旧库授权数据【不得直接恢复授权状态】。只有通过完整重新验证
 *     （签名 + 有效期 + 设备绑定）的 Ed25519 License 才会导入。
 *     RSA 旧格式 / 无设备绑定 / 过期 / 设备不匹配 → 一律不导入，用户需重新输入。
 *   - 若旧库数据不足以保证安全迁移，宁可要求用户重新输入 License（§27）。
 *
 * 执行时机：必须在 db::init 跑 SQL 迁移【之前】执行，否则授权表已被 DROP。
 */

use super::license_validator::LicenseValidator;
use super::secure_storage::{SecureStorage, USER_AUTH_MIGRATED_AT, USER_LICENSE, USER_TRIAL_STARTED_AT};
use crate::services::logging;
use std::path::Path;

/// 迁移结果
#[derive(Debug)]
pub struct MigrationResult {
    /// 是否迁移了任何授权数据
    pub migrated: bool,
    /// 是否导入了旧 License
    pub license_imported: bool,
    /// 是否导入了试用开始时间
    pub trial_imported: bool,
}

/// 执行旧授权数据迁移（幂等：安全存储中的迁移标记存在则跳过）
pub fn migrate_legacy_auth(
    db_path: &Path,
    storage: &dyn SecureStorage,
    device_id: &str,
    validator: &LicenseValidator,
) -> Result<MigrationResult, String> {
    // 已迁移过 → 幂等跳过
    if storage.exists(USER_AUTH_MIGRATED_AT).unwrap_or(false) {
        return Ok(MigrationResult {
            migrated: false,
            license_imported: false,
            trial_imported: false,
        });
    }

    let mut result = MigrationResult {
        migrated: false,
        license_imported: false,
        trial_imported: false,
    };

    // 数据库文件不存在 → 全新安装，无旧数据
    if !db_path.exists() {
        mark_migrated(storage)?;
        return Ok(result);
    }

    // 打开原始连接（不跑迁移，保持旧表存在）
    let conn = match rusqlite::Connection::open(db_path) {
        Ok(c) => c,
        Err(e) => {
            logging::log_line(&format!(
                "[WARN] auth migration: 无法打开旧数据库({})，跳过迁移",
                e
            ));
            return Ok(result);
        }
    };

    // 1. 迁移 License（仅 Ed25519 格式 + 完整重新验证通过）
    if table_exists(&conn, "license") {
        if let Ok(row) = conn.query_row(
            "SELECT license_key, status, device_id FROM license ORDER BY id DESC LIMIT 1",
            [],
            |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, i64>(1)?,
                    r.get::<_, Option<String>>(2)?,
                ))
            },
        ) {
            let (license_key, _status, _db_device_id) = row;
            // 仅处理 Ed25519 格式（LC1 = 授权管理平台，PMT1 = 旧生成器）
            let trimmed = license_key.trim_start();
            if trimmed.starts_with(crate::crypto_ed25519::LICENSE_PREFIX)
                || trimmed.starts_with(crate::crypto_ed25519::LEGACY_PREFIX)
            {
                let validation = validator.validate(&license_key, device_id);
                if validation.valid {
                    storage
                        .store(USER_LICENSE, &license_key)
                        .map_err(|e| format!("授权迁移写入安全存储失败：{}", e))?;
                    result.license_imported = true;
                    logging::log_line("[OK] auth migration: 旧库 Ed25519 授权已验证通过并迁移");
                } else {
                    let code = validation
                        .reason_code
                        .map(|c| c.code())
                        .unwrap_or("UNKNOWN");
                    logging::log_line(&format!(
                        "[WARN] auth migration: 旧库授权重新验证未通过(code={})，不迁移，需重新输入",
                        code
                    ));
                }
            } else {
                logging::log_line("[WARN] auth migration: 旧库 License 为 RSA 旧格式，不迁移，需重新输入");
            }
        }
    }

    // 2. 迁移试用开始时间（活跃试用才迁移；防篡改检测由计算层保证）
    if table_exists(&conn, "trial_records") {
        if let Ok(started_at) = conn.query_row(
            "SELECT started_at FROM trial_records WHERE is_active = 1 ORDER BY id DESC LIMIT 1",
            [],
            |r| r.get::<_, String>(0),
        ) {
            if !started_at.is_empty() {
                storage
                    .store(USER_TRIAL_STARTED_AT, &started_at)
                    .map_err(|e| format!("试用迁移写入安全存储失败：{}", e))?;
                result.trial_imported = true;
                logging::log_line("[OK] auth migration: 旧库活跃试用已迁移");
            }
        }
    }

    // 3. 打迁移标记（无论是否导入数据，之后由 SQL 迁移 DROP 旧表）
    mark_migrated(storage)?;
    result.migrated = true;

    Ok(result)
}

/// 表是否存在
fn table_exists(conn: &rusqlite::Connection, name: &str) -> bool {
    conn.query_row(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1",
        [name],
        |_| Ok(()),
    )
    .is_ok()
}

/// 写迁移标记
fn mark_migrated(storage: &dyn SecureStorage) -> Result<(), String> {
    let now = chrono::Utc::now().to_rfc3339();
    storage.store(USER_AUTH_MIGRATED_AT, &now)
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::SigningKey;
    use rusqlite::Connection;

    fn test_conn() -> (Connection, tempfile::TempDir) {
        let dir = tempfile::tempdir().unwrap();
        let conn = Connection::open(dir.path().join("t.db")).unwrap();
        (conn, dir)
    }

    fn make_validator(seed: u8) -> LicenseValidator {
        let signing_key = SigningKey::from_bytes(&[seed; 32]);
        let pub_bytes: [u8; 32] = *signing_key.verifying_key().as_bytes();
        let pem = format!(
            "-----BEGIN ED25519 PUBLIC KEY-----\n{}\n-----END ED25519 PUBLIC KEY-----",
            hex::encode(pub_bytes)
        );
        let verifier = crate::crypto_ed25519::LicenseVerifier::from_public_pem(&pem).unwrap();
        LicenseValidator { verifier }
    }

    fn make_license(device_id: &str, seed: u8) -> String {
        use base64::Engine;
        use ed25519_dalek::Signer as _;
        let signing_key = SigningKey::from_bytes(&[seed; 32]);
        let payload = crate::crypto_ed25519::LicensePayload {
            product: crate::crypto_ed25519::PRODUCT_CODE.to_string(),
            license_id: "mig-001".to_string(),
            device_id: device_id.to_string(),
            license_type: "DAYS_365".to_string(),
            start_time: "2026-01-01T00:00:00+00:00".to_string(),
            expire_time: "2099-01-01T00:00:00+00:00".to_string(),
        };
        let json = serde_json::to_string(&payload).unwrap();
        let encoded = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(json.as_bytes());
        let signature = signing_key.sign(encoded.as_bytes());
        let sig_hex = hex::encode(signature.to_bytes());
        let sig_b64 = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(sig_hex);
        format!("{}{}{}", crate::crypto_ed25519::LICENSE_PREFIX, sig_b64, encoded)
    }

    /// Test 07 关联：恢复旧数据库不能恢复授权状态
    #[test]
    fn test_migrate_legacy_ed25519_license() {
        let (conn, dir) = test_conn();
        conn.execute_batch(
            "CREATE TABLE license (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                license_key TEXT NOT NULL UNIQUE,
                customer_name TEXT,
                expire_date TEXT,
                status INTEGER DEFAULT 1,
                signature TEXT,
                created_at TEXT,
                device_id TEXT
            );"
        )
        .unwrap();
        // 插入一条 Ed25519 授权（对应设备 DEVICE-A）
        let lic = make_license("DEVICE-A", 3);
        conn.execute(
            "INSERT INTO license (license_key, status, signature, created_at) VALUES (?1, 1, ?1, '2026-01-01')",
            [&lic],
        )
        .unwrap();

        let storage = crate::services::auth::secure_storage::MemoryStorage::new();
        let validator = make_validator(3);
        let res = migrate_legacy_auth(&dir.path().join("t.db"), &storage, "DEVICE-A", &validator).unwrap();
        assert!(res.license_imported, "Ed25519 有效授权应迁移");
        assert_eq!(
            storage.read(USER_LICENSE).unwrap().unwrap(),
            lic,
            "迁移后安全存储应有完整 License"
        );
        assert!(storage.exists(USER_AUTH_MIGRATED_AT).unwrap(), "应打迁移标记");
    }

    /// 设备不匹配的旧授权不得迁移（Test 04）
    #[test]
    fn test_migrate_legacy_device_mismatch_skipped() {
        let (conn, dir) = test_conn();
        conn.execute_batch(
            "CREATE TABLE license (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                license_key TEXT NOT NULL UNIQUE,
                customer_name TEXT,
                expire_date TEXT,
                status INTEGER DEFAULT 1,
                signature TEXT,
                created_at TEXT,
                device_id TEXT
            );"
        )
        .unwrap();
        let lic = make_license("DEVICE-A", 3);
        conn.execute(
            "INSERT INTO license (license_key, status, signature, created_at) VALUES (?1, 1, ?1, '2026-01-01')",
            [&lic],
        )
        .unwrap();

        let storage = crate::services::auth::secure_storage::MemoryStorage::new();
        let validator = make_validator(3);
        // 当前设备是 DEVICE-B → 绑定不匹配 → 不得迁移
        let res = migrate_legacy_auth(&dir.path().join("t.db"), &storage, "DEVICE-B", &validator).unwrap();
        assert!(!res.license_imported, "设备不匹配的旧授权不得迁移");
        assert!(
            storage.read(USER_LICENSE).unwrap().is_none(),
            "安全存储不应有授权"
        );
    }

    /// 幂等：迁移一次后再次调用不再动作
    #[test]
    fn test_migrate_idempotent() {
        let (conn, dir) = test_conn();
        conn.execute_batch(
            "CREATE TABLE license (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                license_key TEXT NOT NULL UNIQUE,
                customer_name TEXT,
                expire_date TEXT,
                status INTEGER DEFAULT 1,
                signature TEXT,
                created_at TEXT,
                device_id TEXT
            );"
        )
        .unwrap();
        let lic = make_license("DEVICE-A", 3);
        conn.execute(
            "INSERT INTO license (license_key, status, signature, created_at) VALUES (?1, 1, ?1, '2026-01-01')",
            [&lic],
        )
        .unwrap();

        let storage = crate::services::auth::secure_storage::MemoryStorage::new();
        let validator = make_validator(3);
        let first = migrate_legacy_auth(&dir.path().join("t.db"), &storage, "DEVICE-A", &validator).unwrap();
        assert!(first.license_imported);

        // 第二次调用：迁移标记已存在 → 跳过
        let second = migrate_legacy_auth(&dir.path().join("t.db"), &storage, "DEVICE-A", &validator).unwrap();
        assert!(!second.migrated, "已迁移过则不再动作");
        assert!(!second.license_imported);
    }
}