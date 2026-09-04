/**
 * PMTool · License 业务逻辑层
 * Phase 1 · T1.2
 *
 * 职责：
 *   1. RSA 验签（crypto::verify_license）
 *   2. 过期检测（基于系统时间，不受时区影响）
 *   3. License 激活/失效管理
 *   4. 写入 audit_logs（RFC-03 §6）
 */

use crate::crypto;
use crate::repositories::license as license_repo;
use serde::{Deserialize, Serialize};

/// WebView 传入的 License 数据
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LicenseInput {
    pub license_key: String,
    pub customer_name: String,
    pub expire_date: String,
    pub signature: String,
}

/// 验证结果（返回给 WebView）
#[derive(Debug, Serialize, Deserialize)]
pub struct LicenseVerification {
    pub valid: bool,
    pub reason: Option<String>, // valid=false 时说明原因
}

/// 当前 License 状态
#[derive(Debug, Serialize, Deserialize)]
pub struct LicenseStatus {
    pub activated: bool,
    pub license: Option<license_repo::License>,
    pub expired: bool,
    pub reason: Option<String>,
}

/// 验证并激活 License
pub fn verify_and_activate(
    conn: &rusqlite::Connection,
    input: &LicenseInput,
) -> Result<LicenseVerification, String> {
    // 1. RSA 验签
    // crypto::verify_license 返回 Err 时（如 base64 解码失败 / 公钥格式错误），
    // 也归类为"签名无效"，让上层 UI 显示统一错误信息而非 panic
    let signature_valid = match crypto::verify_license(
        &input.license_key,
        &input.customer_name,
        &input.expire_date,
        &input.signature,
    ) {
        Ok(v) => v,
        Err(e) => {
            return Ok(LicenseVerification {
                valid: false,
                reason: Some(format!("License 签名无效：{}", e)),
            });
        }
    };

    if !signature_valid {
        return Ok(LicenseVerification {
            valid: false,
            reason: Some("License 签名无效（可能被篡改或密钥错误）".to_string()),
        });
    }

    // 2. 过期检测（基于系统当前时间）
    if is_expired(&input.expire_date) {
        return Ok(LicenseVerification {
            valid: false,
            reason: Some(format!(
                "License 已过期（到期日：{}）",
                input.expire_date
            )),
        });
    }

    // 3. 验签通过 + 未过期 → 激活（deactivate all + insert new）
    activate(conn, input)?;

    Ok(LicenseVerification {
        valid: true,
        reason: None,
    })
}

/// 激活 License（deactivate 旧的 + insert 新的 + audit log）
fn activate(
    conn: &rusqlite::Connection,
    input: &LicenseInput,
) -> Result<(), String> {
    // 1. Deactivate 所有旧 License
    let deactivated = license_repo::deactivate_all(conn).map_err(|e| e.to_string())?;

    // 2. 写 audit_logs（deactivate）
    if deactivated > 0 {
        write_audit_log(
            conn,
            "DEACTIVATE",
            &format!("Deactivated {} old license(s)", deactivated),
        )
        .map_err(|e| e.to_string())?;
    }

    // 3. Insert 新 License
    let license = license_repo::License {
        id: 0, // DB 自动生成
        license_key: input.license_key.clone(),
        customer_name: Some(input.customer_name.clone()),
        expire_date: input.expire_date.clone(),
        status: 1,
        signature: input.signature.clone(),
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    let new_id = license_repo::insert(conn, &license).map_err(|e| e.to_string())?;

    // 4. 写 audit_logs（activate）
    write_audit_log(
        conn,
        "ACTIVATE",
        &format!(
            "License activated: id={}, key={}, customer={}, expire={}",
            new_id, input.license_key, input.customer_name, input.expire_date
        ),
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// 获取 License 状态
pub fn get_status(conn: &rusqlite::Connection) -> LicenseStatus {
    match license_repo::get_current(conn) {
        Ok(Some(license)) => {
            let expired = is_expired(&license.expire_date);
            LicenseStatus {
                activated: !expired,
                license: Some(license),
                expired,
                reason: if expired {
                    Some("License 已过期".to_string())
                } else {
                    None
                },
            }
        }
        Ok(None) => LicenseStatus {
            activated: false,
            license: None,
            expired: false,
            reason: Some("未激活 License".to_string()),
        },
        Err(e) => LicenseStatus {
            activated: false,
            license: None,
            expired: false,
            reason: Some(format!("License 查询失败: {}", e)),
        },
    }
}

/// 过期检测（RFC-05 §6 验收 #3）
/// 使用系统当前时间（YYYY-MM-DD）与 expire_date 字符串比较
/// 字符串字典序 = 日期序（YYYY-MM-DD 格式保证）
/// **永久授权**：expire_date 为空字符串 → 永不过期
pub fn is_expired(expire_date: &str) -> bool {
    if expire_date.is_empty() {
        return false; // 永久授权
    }
    let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
    expire_date < today.as_str()
}

/// 写 audit_log
fn write_audit_log(
    conn: &rusqlite::Connection,
    action: &str,
    content: &str,
) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO audit_logs (action, target_type, target_id, content) VALUES (?1, 'license', NULL, ?2)",
        rusqlite::params![action, content],
    )?;
    Ok(())
}