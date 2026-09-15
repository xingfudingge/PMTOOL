use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

static LOG_FILE: OnceLock<PathBuf> = OnceLock::new();
static GUARD: Mutex<()> = Mutex::new(());

/// 初始化日志：设置 panic 钩子（Rust 崩溃/expect 失败落盘）+ 记录启动。返回日志文件路径。
pub fn init(data_dir: &Path) -> PathBuf {
    let _ = std::fs::create_dir_all(data_dir);
    let path = data_dir.join("pmtool.log");
    let _ = LOG_FILE.set(path.clone());

    // 捕获 Rust panic（setup/命令里的 expect/unwrap 一旦失败都会到这里），写进日志文件
    std::panic::set_hook(Box::new(|info| {
        log_line(&format!("[PANIC] {}", info));
    }));

    log_line(&format!(
        "==== BOOT ==== app start; data_dir={}",
        data_dir.display()
    ));
    path
}

/// 追加一行带时间戳的日志到 `<数据目录>/pmtool.log`（线程安全）
#[allow(dead_code)]
pub fn log_line(msg: &str) {
    if let Some(path) = LOG_FILE.get() {
        let _g = GUARD.lock();
        if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(path) {
            let _ = writeln!(
                f,
                "{} {}",
                chrono::Local::now().format("%Y-%m-%d %H:%M:%S"),
                msg
            );
        }
    }
}
