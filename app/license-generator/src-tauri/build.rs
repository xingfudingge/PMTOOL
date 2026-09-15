fn main() {
    // 方案 A：编译期将官方私钥写入 OUT_DIR 的 official_private_key.pem，供 main.rs 用 include_bytes!
    // 嵌入二进制，实现私钥随安装包固化、不随工作目录变化、不自动重新生成。
    //
    // 私钥来源（按优先级）：
    //   1. 环境变量 LG_PRIVATE_KEY      —— GitHub Actions 构建时注入（生产）
    //   2. 环境变量 LG_PRIVATE_KEY_FILE —— 指向密钥文件的路径（本地开发验证，避免私钥进环境变量）
    // 两者都未提供时写空占位，main.rs 会据此提示需要官方密钥而不静默新造。
    let out_dir = std::path::PathBuf::from(std::env::var("OUT_DIR").expect("OUT_DIR"));
    let private_pem_path = out_dir.join("official_private_key.pem");

    let content = if let Ok(v) = std::env::var("LG_PRIVATE_KEY") {
        v.trim().to_string()
    } else if let Ok(fpath) = std::env::var("LG_PRIVATE_KEY_FILE") {
        std::fs::read_to_string(&fpath).unwrap_or_default()
    } else {
        String::new()
    };
    let _ = std::fs::write(&private_pem_path, content);
    println!("cargo:rerun-if-env-changed=LG_PRIVATE_KEY");
    println!("cargo:rerun-if-env-changed=LG_PRIVATE_KEY_FILE");

    tauri_build::build()
}
