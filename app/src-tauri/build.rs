use std::{env, fs, path::PathBuf};

fn main() {
    tauri_build::build();

    // 编译期嵌入 database/migrations/*.sql（生产安装后 cwd 不再是项目根，
    // 运行时相对路径找不到迁移，须嵌入二进制，db.rs 才能建表）。
    let manifest = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    // CARGO_MANIFEST_DIR = <repo>/app/src-tauri → ../../database/migrations
    let mig_dir = manifest.join("../..").join("database").join("migrations");
    let out = PathBuf::from(env::var("OUT_DIR").unwrap());

    let mut files: Vec<PathBuf> = fs::read_dir(&mig_dir)
        .ok()
        .into_iter()
        .flatten()
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.extension().and_then(|x| x.to_str()) == Some("sql"))
        .collect();
    files.sort();

    let mut code = String::from("pub const MIGRATIONS: &[(&str, &str)] = &[\n");
    for p in &files {
        let name = p.file_name().unwrap().to_string_lossy().to_string();
        let abs = p
            .canonicalize()
            .map(|c| c.to_string_lossy().to_string())
            .unwrap_or_else(|_| name.clone());
        code.push_str(&format!("    ({:?}, include_str!({:?})),\n", name, abs));
    }
    code.push_str("];\n");
    fs::write(out.join("migrations.rs"), code).unwrap();

    if let Ok(read) = fs::read_dir(&mig_dir) {
        for e in read.filter_map(|e| e.ok()) {
            println!("cargo:rerun-if-changed={}", e.path().display());
        }
    }
    println!("cargo:rerun-if-changed={}", mig_dir.display());
}
