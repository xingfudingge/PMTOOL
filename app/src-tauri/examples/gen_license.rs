/**
 * PMTool · License 生成工具（dev only）
 * Phase 1 · T1.2
 *
 * 用法（待网络恢复 + cargo run 跑得通后）：
 *   cargo run --example gen_license -- \
 *     --key PMT-TEST-001 \
 *     --customer 测试公司 \
 *     --expire 2099-12-31 \
 *     --key-file src-tauri/keys/private.pem
 *
 * 输出：JSON License（含 RSA 签名）→ 粘贴到 LicenseActivation UI
 *
 * 注意：
 *   - 仅 dev 用（私钥不入产品包）
 *   - 不打包入产品二进制
 */

use std::env;
use std::fs;
use std::path::Path;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // 1. 解析参数
    let args: Vec<String> = env::args().collect();
    let mut license_key = String::new();
    let mut customer_name = String::new();
    let mut expire_date = String::new();
    let mut key_file = String::from("src-tauri/keys/private.pem");

    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "--key" => {
                license_key = args[i + 1].clone();
                i += 2;
            }
            "--customer" => {
                customer_name = args[i + 1].clone();
                i += 2;
            }
            "--expire" => {
                expire_date = args[i + 1].clone();
                i += 2;
            }
            "--key-file" => {
                key_file = args[i + 1].clone();
                i += 2;
            }
            _ => {
                eprintln!("未知参数: {}", args[i]);
                std::process::exit(1);
            }
        }
    }

    if license_key.is_empty() || customer_name.is_empty() || expire_date.is_empty() {
        eprintln!("用法：gen_license --key <KEY> --customer <CUSTOMER> --expire <YYYY-MM-DD> [--key-file <PATH>]");
        std::process::exit(1);
    }

    // 2. 读取私钥
    let private_pem = fs::read_to_string(&key_file).map_err(|e| {
        format!(
            "读取私钥失败 {}: {}（先跑 `openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out src-tauri/keys/private.pem`）",
            key_file, e
        )
    })?;

    // 3. 计算 payload hash
    use sha2::{Digest, Sha256};
    let payload = format!("{}:{}:{}", license_key, customer_name, expire_date);
    let mut hasher = Sha256::new();
    hasher.update(payload.as_bytes());
    let hash = hasher.finalize();

    // 4. RSA 签名
    use rsa::pkcs8::{DecodePrivateKey, DecodePublicKey};
    use rsa::pkcs1v15::{Signature, SigningKey};
    use rsa::signature::{SignatureEncoding, Signer};
    let private_key = rsa::RsaPrivateKey::from_pkcs8_pem(&private_pem)?;
    let signing_key = SigningKey::<Sha256>::new(private_key);
    let signature: Signature = signing_key.sign(&hash);

    // 5. base64 编码
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    let signature_b64 = STANDARD.encode(signature.to_bytes());

    // 6. 输出 JSON License
    let license_json = format!(
        r#"{{
  "license_key": "{}",
  "customer_name": "{}",
  "expire_date": "{}",
  "signature": "{}"
}}"#,
        license_key, customer_name, expire_date, signature_b64
    );

    println!("{}", license_json);

    // 7. 验证（用公钥自验）
    if Path::new("src-tauri/keys/public.pem").exists() {
        let public_pem = fs::read_to_string("src-tauri/keys/public.pem")?;
        let public_key = rsa::RsaPublicKey::from_public_key_pem(&public_pem)?;
        use rsa::pkcs1v15::VerifyingKey;
        use rsa::signature::Verifier;
        let verifying_key = VerifyingKey::<Sha256>::new(public_key);
        let sig_bytes = STANDARD.decode(&signature_b64)?;
        let sig = Signature::try_from(sig_bytes.as_slice())?;
        match verifying_key.verify(&hash, &sig) {
            Ok(_) => eprintln!("\n✅ 自验签名通过"),
            Err(e) => eprintln!("\n❌ 自验签名失败: {}", e),
        }
    }

    Ok(())
}