fn main() {
    // 旧 License Generator 已停用（见 ../../DEPRECATED.md）：不再从环境变量注入私钥。
    // 仍写入空占位，保证 main.rs 的 include_bytes! 可编译；空私钥会让签发入口
    // 直接报错，绝不会静默生成新密钥。
    let out_dir = std::path::PathBuf::from(std::env::var("OUT_DIR").expect("OUT_DIR"));
    let private_pem_path = out_dir.join("official_private_key.pem");
    let _ = std::fs::write(&private_pem_path, "");

    tauri_build::build()
}
