/**
 * PMTool · FileStorageProvider 抽象接口（Phase 4 T4.9 · 扩展版）
 *
 * 设计依据：维护者 2026-08-22 指示
 *   "PMTool 核心场景不是上传下载，而是：
 *    项目 → 附件 → 点击 → 调用系统程序打开 → 用户编辑 → 保存回原文件
 *    如果没有 open_file，这个抽象是不完整的。"
 *
 * 完整 trait（含 open_file）：
 *   - save_file：上传文件 → 受管目录
 *   - open_file：用 OS 默认程序打开（关键！）
 *   - delete_file：删除文件
 *   - get_file_info：获取元信息（mtime / size）
 *   - calculate_hash：运行时计算 SHA-256
 *   - list_files：列出 owner 的所有文件
 *
 * RFC-03 §2 边界规则：
 *   - 仅在受管数据根目录内允许删除/打开/预览
 *   - 拒绝 `..`、符号链接逃逸、外部绝对路径
 *   - 文件名冲突以 UUID 重命名
 *   - save_file 后文件路径必须在 data_root 内
 *   - open_file 不修改文件内容（仅调用 OS 程序）
 *
 * 用户编辑后检测：
 *   - open_file 不阻塞进程（OS 程序独立运行）
 *   - 用户重新打开附件时调 get_file_info 对比 mtime + sha256
 *   - 若 mtime 变化 → UI 提示"文件已被外部修改"
 *   - PMTool 不自动覆盖 attachments 表（避免数据竞态）
 */

use std::path::{Path, PathBuf};
use std::time::SystemTime;

#[derive(Debug, Clone)]
pub struct StoredFile {
    /// 相对 PMToolData 根的路径（存 attachments.file_path）
    pub relative_path: String,
    pub file_size: u64,
    pub mime_type: String,
    pub sha256: String,
}

#[derive(Debug, Clone)]
pub struct FileMetadata {
    pub relative_path: String,
    pub absolute_path: PathBuf,
    pub file_size: u64,
    pub modified_time: Option<SystemTime>,
    pub sha256: Option<String>, // 重新计算（开销大）
}

/// FileStorageProvider trait
/// 必须 Send + Sync（因为 Tauri app.manage<AppState> 要求 T: Send + Sync + 'static）
pub trait FileStorageProvider: Send + Sync {
    /// 保存文件到 owner 的受管目录（save_file 别名）
    fn save_file(
        &self,
        owner_type: &str,
        owner_id: i64,
        file_name: &str,
        content: &[u8],
    ) -> Result<StoredFile, String>;

    /// 用 OS 默认程序打开文件（关键能力 · PMTool 核心场景）
    /// - macOS: open 命令
    /// - Linux: xdg-open 命令
    /// - Windows: start 命令
    /// 不阻塞 Rust 进程（OS 程序独立运行）
    /// 返回：打开的文件绝对路径（用于 UI 显示"已打开"状态）
    fn open_file(&self, relative_path: &str) -> Result<String, String>;

    /// 删除文件
    fn delete_file(&self, relative_path: &str) -> Result<(), String>;

    /// 获取文件元信息（含 mtime · 用于检测外部修改）
    fn get_file_info(&self, relative_path: &str) -> Result<FileMetadata, String>;

    /// 计算 SHA-256（运行时 · 不存表）
    fn calculate_hash(&self, content: &[u8]) -> String {
        use sha2::{Digest, Sha256};
        let mut hasher = Sha256::new();
        hasher.update(content);
        format!("{:x}", hasher.finalize())
    }

    /// 列出 owner 的所有文件路径
    fn list_files(&self, owner_type: &str, owner_id: i64) -> Result<Vec<String>, String>;

    /// 获取文件绝对路径（用于 OS 调用 + UI 显示）
    fn absolute_path(&self, relative_path: &str) -> Result<PathBuf, String>;

    // 旧方法别名（保持向后兼容）
    #[deprecated(note = "use save_file instead")]
    fn save(
        &self,
        owner_type: &str,
        owner_id: i64,
        file_name: &str,
        content: &[u8],
    ) -> Result<StoredFile, String> {
        self.save_file(owner_type, owner_id, file_name, content)
    }

    #[deprecated(note = "use delete_file instead")]
    fn delete(&self, relative_path: &str) -> Result<(), String> {
        self.delete_file(relative_path)
    }

    #[deprecated(note = "use get_file_info instead")]
    fn get_metadata(&self, relative_path: &str) -> Result<FileMetadata, String> {
        self.get_file_info(relative_path)
    }

    #[deprecated(note = "use list_files instead")]
    fn list(&self, owner_type: &str, owner_id: i64) -> Result<Vec<String>, String> {
        self.list_files(owner_type, owner_id)
    }

    #[deprecated(note = "use calculate_hash instead")]
    fn compute_sha256(&self, content: &[u8]) -> String {
        self.calculate_hash(content)
    }
}

/// MIME 类型推断（按文件扩展名）
pub fn infer_mime_type(file_name: &str) -> String {
    let ext = Path::new(file_name)
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_lowercase())
        .unwrap_or_default();
    match ext.as_str() {
        "pdf" => "application/pdf".to_string(),
        "doc" => "application/msword".to_string(),
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document".to_string(),
        "xls" => "application/vnd.ms-excel".to_string(),
        "xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet".to_string(),
        "ppt" => "application/vnd.ms-powerpoint".to_string(),
        "pptx" => "application/vnd.openxmlformats-officedocument.presentationml.presentation".to_string(),
        "png" => "image/png".to_string(),
        "jpg" | "jpeg" => "image/jpeg".to_string(),
        "gif" => "image/gif".to_string(),
        "svg" => "image/svg+xml".to_string(),
        "md" | "markdown" => "text/markdown".to_string(),
        "txt" => "text/plain".to_string(),
        "json" => "application/json".to_string(),
        "zip" => "application/zip".to_string(),
        _ => "application/octet-stream".to_string(),
    }
}