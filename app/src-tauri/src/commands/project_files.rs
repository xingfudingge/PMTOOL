/**
 * PMTool · 项目文件管理 Tauri Commands（维护者 2026-08-31 · FilesTab 后端）
 *
 * 设计依据：RFC-03 §1 分层架构
 *   React Page → Feature Service → Tauri Typed Command → Rust Service → Repository → SQLite
 *
 * 职责：
 *   - 项目绑定本地目录（路径存 projects.local_directory_path）
 *   - 列出目录文件树（递归 · max_depth 兜底）
 *   - 读 / 写文本文件（编辑器接口预留 · FilesTab 不主动写）
 *   - 用 OS 默认程序打开文件（复用 open crate）
 *
 * 与 attachments 模块的边界：
 *   - attachments：受管目录（PMToolData）· UUID 命名
 *   - project_files：用户自由目录（项目本地文件夹）· 不修改不迁移
 */

use std::path::PathBuf;
use tauri::State;

use crate::AppState;
use crate::repositories::projects as projects_repo;
use crate::services::file_browser;

/// 原生文件夹选择器（阻塞 UI 线程直到用户选完 · rfd）
/// 返回 None = 用户取消（前端视为「未选」）
#[tauri::command]
pub fn pick_project_directory() -> Result<Option<String>, String> {
    file_browser::pick_directory()
}

/// 设置项目本地目录（写 projects.local_directory_path）
/// path = None 表示清除绑定
#[tauri::command]
pub fn set_project_local_directory(
    state: State<'_, AppState>,
    project_id: i64,
    path: Option<String>,
) -> Result<bool, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    projects_repo::update_local_directory(&pool, project_id, path.as_deref())
        .map_err(|e| e.to_string())
}

/// 读取项目当前绑定的本地目录
#[tauri::command]
pub fn get_project_local_directory(
    state: State<'_, AppState>,
    project_id: i64,
) -> Result<Option<String>, String> {
    let pool = state.db.lock().map_err(|e| e.to_string())?;
    let project = projects_repo::get_by_id(&pool, project_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("项目 {} 不存在", project_id))?;
    Ok(project.local_directory_path)
}

/// 递归列出目录（前端 FilesTab 左侧树）
/// max_depth 默认 8 层（前端可调 · None = 不限）
#[tauri::command]
pub fn list_project_files(
    path: String,
    max_depth: Option<usize>,
) -> Result<file_browser::FileNode, String> {
    let p = PathBuf::from(&path);
    file_browser::list_directory_recursive(&p, max_depth)
}

/// 读取文本文件（前端 md / txt / 代码类预览）
#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    let p = PathBuf::from(&path);
    file_browser::read_text_file(&p)
}

/// 写入文本文件（接口预留 · 等知识中心编辑器使用）
#[tauri::command]
pub fn write_text_file(path: String, content: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    file_browser::write_text_file(&p, &content)
}

/// 读取任意文件原始字节（前端 docx/pptx/xlsx 等二进制预览用）
/// 返回 Vec<u8>，Tauri 会自动序列化为 number[]，前端用 Uint8Array 接
#[tauri::command]
pub fn read_file_bytes(path: String) -> Result<Vec<u8>, String> {
    let p = PathBuf::from(&path);
    file_browser::read_file_bytes(&p)
}

/// 读取文本文件 + mtime（DocumentEditor 专用 · 外部修改冲突检测）
#[tauri::command]
pub fn read_text_file_with_mtime(path: String) -> Result<file_browser::TextFileContent, String> {
    let p = PathBuf::from(&path);
    file_browser::read_text_file_with_mtime(&p)
}

/// 新建空文件（FilesTab「+ 新建文件」）
#[tauri::command]
pub fn create_file(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    file_browser::create_empty_file(&p)
}

/// 新建目录（FilesTab「+ 新建文件夹」）
#[tauri::command]
pub fn create_directory_cmd(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    file_browser::create_directory(&p)
}

/// 删除文件 / 目录（递归删除目录 · FilesTab「删除」按钮）
#[tauri::command]
pub fn remove_path_cmd(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    file_browser::remove_path(&p)
}

/// 重命名 / 移动 文件或目录（FilesTab 后续「重命名」按钮）
#[tauri::command]
pub fn rename_path_cmd(from: String, to: String) -> Result<(), String> {
    let f = PathBuf::from(&from);
    let t = PathBuf::from(&to);
    file_browser::rename_path(&f, &t)
}

/// 复制文件 / 目录（FilesTab「复制」按钮 · 维护者 2026-08-31）
/// 返回最终写入的目标路径（前端刷新文件树用）
#[tauri::command]
pub fn copy_path_cmd(path: String) -> Result<String, String> {
    let p = PathBuf::from(&path);
    file_browser::copy_path(&p).map(|pb| pb.to_string_lossy().to_string())
}

/// 用 OS 默认程序打开文件（open crate）
#[tauri::command]
pub fn open_file_external(path: String) -> Result<String, String> {
    let p = PathBuf::from(&path);
    file_browser::open_file_external(&p)
}
