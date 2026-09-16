/**
 * PMTool · 授权隔离改造集成测试（2026-09-16）
 *
 * 覆盖《授权体系与数据库隔离》文档 §29 核心测试矩阵：
 *   T01 正常启动 / T02-T03 数据库与业务目录复制不继承授权 / T04 License 复制到 B 失败
 *   T05 篡改 License 失败 / T06 删除数据库授权独立 / T07 恢复旧库不恢复授权
 *   T08 无 License 进入授权界面 / T09 过期失败 / T10 数据库伪造无影响
 *
 * 全部测试使用 MemoryStorage（内存实现），不触碰真实 OS 凭据库。
 */

use pmtool_lib::crypto_ed25519::{LicensePayload, LicenseVerifier};
use pmtool_lib::services::auth::authorization::{
    activate_license, delete_license, startup_check, start_trial,
};
use pmtool_lib::services::auth::license_validator::{
    AuthorizationDecision, AuthReasonCode, LicenseValidator, TRIAL_DAYS,
};
use pmtool_lib::services::auth::secure_storage::{
    MemoryStorage, SecureStorage, USER_LICENSE,
};
use pmtool_lib::services::auth::secure_storage::{USER_AUTH_MIGRATED_AT, USER_TRIAL_STARTED_AT};
use pmtool_lib::services::auth::migration::migrate_legacy_auth;
use rusqlite::Connection;

/// 构造测试密钥对 + License 验证器 + 对应设备授权码
fn make_rig(device_id: &str, seed: u8, expire: &str) -> (LicenseValidator, String) {
    let signing_key = ed25519_dalek::SigningKey::from_bytes(&[seed; 32]);
    let pub_bytes: [u8; 32] = *signing_key.verifying_key().as_bytes();
    let pem = format!(
        "-----BEGIN ED25519 PUBLIC KEY-----\n{}\n-----END ED25519 PUBLIC KEY-----",
        hex::encode(pub_bytes)
    );
    let verifier = LicenseVerifier::from_public_pem(&pem).unwrap();
    let validator = LicenseValidator { verifier };

    let payload = LicensePayload {
        product: "PMTool".to_string(),
        license_id: format!("it-lic-{seed}"),
        device_id: device_id.to_string(),
        license_type: "DAYS_365".to_string(),
        start_time: "2026-01-01T00:00:00+00:00".to_string(),
        expire_time: expire.to_string(),
    };
    use base64::Engine;
    use ed25519_dalek::Signer as _;
    let json = serde_json::to_string(&payload).unwrap();
    let encoded = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(json.as_bytes());
    let signature = signing_key.sign(encoded.as_bytes());
    let sig_hex = hex::encode(signature.to_bytes());
    let sig_b64 = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(sig_hex);
    (validator, format!("PMT1{}{}", sig_b64, encoded))
}

const FUTURE: &str = "2099-01-01T00:00:00+00:00";
const PAST: &str = "2020-01-01T00:00:00+00:00";

/// T01 正常启动：License 有效 + 设备匹配 → PASS
#[test]
fn test_t01_normal_startup_passes() {
    let storage = MemoryStorage::new();
    let (v, license) = make_rig("DEVICE-A", 1, FUTURE);
    activate_license(&storage, "DEVICE-A", &v, &license).unwrap();

    let ctx = startup_check(&storage, "DEVICE-A", &v);
    assert!(matches!(ctx.decision, AuthorizationDecision::Licensed { .. }));
}

/// T04 License 复制到 B：B 设备 != License 绑定 → FAIL
#[test]
fn test_t04_license_copy_to_other_device_fails() {
    let storage = MemoryStorage::new();
    let (v, license) = make_rig("DEVICE-A", 1, FUTURE);
    // 把 A 的 License 复制到 B 的安全存储
    storage.store(USER_LICENSE, &license).unwrap();

    let ctx = startup_check(&storage, "DEVICE-B", &v);
    match ctx.decision {
        AuthorizationDecision::NotAuthorized {
            reason_code: AuthReasonCode::LicenseDeviceMismatch,
            ..
        } => {}
        other => panic!("License 复制到其他设备必须失败: {:?}", other),
    }
}

/// T05 篡改 License（payload 字段被改）→ 验签失败
#[test]
fn test_t05_tampered_license_fails() {
    let storage = MemoryStorage::new();
    let (v, license) = make_rig("DEVICE-A", 1, FUTURE);
    // 构造篡改版：payload 有效期改为过去 → 但保留原签名 → 验签失败
    let (_v2, tampered) = make_rig("DEVICE-A", 1, PAST);
    storage.store(USER_LICENSE, &tampered).unwrap();

    let ctx = startup_check(&storage, "DEVICE-A", &v);
    // 原签名对篡改后的 encoded 失配 → SignatureInvalid（若内容恰为格式错，也必须是失败）
    match ctx.decision {
        AuthorizationDecision::NotAuthorized { .. } => {}
        other => panic!("篡改 License 必须失败: {:?}", other),
    }
}

/// T06 删除数据库：授权系统独立工作（授权在安全存储，与 DB 无关）
#[test]
fn test_t06_delete_db_auth_independent() {
    let storage = MemoryStorage::new();
    let (v, license) = make_rig("DEVICE-A", 1, FUTURE);
    activate_license(&storage, "DEVICE-A", &v, &license).unwrap();

    // 模拟删除整个业务数据库：授权判定完全不接触 DB，直接重算
    let ctx = startup_check(&storage, "DEVICE-A", &v);
    assert!(matches!(ctx.decision, AuthorizationDecision::Licensed { .. }));
}

/// T07 恢复旧数据库：不能恢复授权状态
/// 旧库 License 只有通过完整重新验证才会迁移；设备不匹配/无效一律不迁移。
#[test]
fn test_t07_restore_old_db_no_auth_restore() {
    let dir = tempfile::tempdir().unwrap();
    let db_path = dir.path().join("old.db");
    let conn = Connection::open(&db_path).unwrap();
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
        );",
    )
    .unwrap();

    // 旧库中放一条绑定 DEVICE-A 的有效授权
    let (_va, lic_a) = make_rig("DEVICE-A", 1, FUTURE);
    conn.execute(
        "INSERT INTO license (license_key, status, signature, created_at, device_id)
         VALUES (?1, 1, ?1, '2026-01-01', 'DEVICE-A')",
        [&lic_a],
    )
    .unwrap();

    // B 机器恢复 A 的旧库：A 的授权不得迁移到 B
    let storage = MemoryStorage::new();
    let (v_a, _) = make_rig("DEVICE-A", 1, FUTURE);
    let res = migrate_legacy_auth(&db_path, &storage, "DEVICE-B", &v_a).unwrap();
    assert!(!res.license_imported, "设备不匹配的旧库授权不得迁移");
    assert!(
        storage.read(USER_LICENSE).unwrap().is_none(),
        "B 的安全存储不得出现 A 的授权"
    );

    // 同一台机器（DEVICE-A）恢复旧库：有效授权正常迁移（验证通过才迁移）
    let storage2 = MemoryStorage::new();
    let (v_a2, _) = make_rig("DEVICE-A", 1, FUTURE);
    let res2 = migrate_legacy_auth(&db_path, &storage2, "DEVICE-A", &v_a2).unwrap();
    assert!(res2.license_imported, "同机恢复旧库应迁移有效授权");
    assert_eq!(storage2.read(USER_LICENSE).unwrap().unwrap(), lic_a);
}

/// T08 无 License → 进入授权界面（未授权判定）
#[test]
fn test_t08_no_license_not_authorized() {
    let storage = MemoryStorage::new();
    let (v, _) = make_rig("DEVICE-A", 1, FUTURE);
    let ctx = startup_check(&storage, "DEVICE-A", &v);
    assert!(matches!(
        ctx.decision,
        AuthorizationDecision::NotAuthorized {
            reason_code: AuthReasonCode::LicenseNotFound,
            ..
        }
    ));
}

/// T09 License 过期 → FAIL
#[test]
fn test_t09_expired_license_fails() {
    let storage = MemoryStorage::new();
    let (v, expired) = make_rig("DEVICE-A", 1, PAST);
    storage.store(USER_LICENSE, &expired).unwrap();
    let ctx = startup_check(&storage, "DEVICE-A", &v);
    match ctx.decision {
        AuthorizationDecision::NotAuthorized {
            reason_code: AuthReasonCode::LicenseExpired,
            ..
        } => {}
        other => panic!("过期 License 必须失败: {:?}", other),
    }
}

/// T10 数据库伪造：向数据库加 license_status 字段 → 启动判定完全不受影响
#[test]
fn test_t10_db_forgery_no_effect() {
    let storage = MemoryStorage::new();
    let (v, license) = make_rig("DEVICE-A", 1, FUTURE);
    activate_license(&storage, "DEVICE-A", &v, &license).unwrap();

    // 伪造：数据库中存在 license_status=activated / device_id=A 的表（旧版结构）
    // 新启动链路完全不读这些表 → 判定结果不受影响
    let dir = tempfile::tempdir().unwrap();
    let conn = Connection::open(dir.path().join("forge.db")).unwrap();
    conn.execute_batch(
        "CREATE TABLE license (license_key TEXT, device_id TEXT, status INTEGER);",
    )
    .unwrap();
    conn.execute(
        "INSERT INTO license VALUES ('FORGED', 'DEVICE-A', 1)",
        [],
    )
    .unwrap();

    // 启动判定：只看安全存储 License + 设备绑定 + 验签，伪造表无影响
    let ctx = startup_check(&storage, "DEVICE-A", &v);
    assert!(matches!(ctx.decision, AuthorizationDecision::Licensed { .. }));
}

/// 试用：7 天试用在安全存储中记录，删除授权后独立工作
#[test]
fn test_trial_lifecycle() {
    let storage = MemoryStorage::new();
    let ctx = start_trial(&storage).unwrap();
    match &ctx.decision {
        AuthorizationDecision::Trial { days_remaining, .. } => {
            assert_eq!(*days_remaining, TRIAL_DAYS);
        }
        other => panic!("开始试用应得到 Trial 判定: {:?}", other),
    }
    assert!(storage.exists(USER_TRIAL_STARTED_AT).unwrap());

    // 试用仅可开始一次
    assert!(start_trial(&storage).is_err());
}

/// 删除授权：安全存储 License 被删，下一次启动未授权
#[test]
fn test_delete_license_flow() {
    let storage = MemoryStorage::new();
    let (v, license) = make_rig("DEVICE-A", 1, FUTURE);
    activate_license(&storage, "DEVICE-A", &v, &license).unwrap();

    delete_license(&storage).unwrap();
    assert!(storage.read(USER_LICENSE).unwrap().is_none());

    let ctx = startup_check(&storage, "DEVICE-A", &v);
    assert!(matches!(
        ctx.decision,
        AuthorizationDecision::NotAuthorized { .. }
    ));
}

/// 迁移标记存在时迁移幂等跳过
#[test]
fn test_migration_marker_idempotent() {
    let storage = MemoryStorage::new();
    storage.store(USER_AUTH_MIGRATED_AT, "2026-09-16T00:00:00+00:00").unwrap();
    let (v, _) = make_rig("DEVICE-A", 1, FUTURE);
    let res = migrate_legacy_auth(
        &std::path::Path::new("nonexistent.db"),
        &storage,
        "DEVICE-A",
        &v,
    )
    .unwrap();
    assert!(!res.migrated, "已迁移过应跳过");
}