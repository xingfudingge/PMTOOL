/**
 * PMTool · 项目文件浏览器（FilesTab 后端 · 维护者 2026-08-31）
 *
 * 职责：项目绑定一个本地目录后，提供目录选择、递归扫描、文本读写能力。
 *  与 file_storage / file_storage_local 是完全独立的关注点：
 *    - file_storage：附件（受管目录 · UUID 命名）
 *    - file_browser：项目文件（用户自由目录 · 不修改不管理）
 *
 * 文件预览策略由前端决定：pdfjs / docx-preview / SheetJS / pptxjs / 原生 img / react-markdown。
 *  编辑统一走「本地编辑器打开」按钮（open crate 调用 OS 默认程序）。
 */

use std::path::{Path, PathBuf};
use std::time::SystemTime;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// 单个文件 / 目录节点（前端 FileNode 类型来源）
///
/// ⚠️ 维护者 2026-08-31 修复：之前没有 `rename_all`，Rust 默认输出 snake_case
/// (`is_dir` / `modified_at`)，但前端 TS 类型是 camelCase (`isDir` / `modifiedAt`)，
/// 导致 FileTree 拿到的节点字段全是 undefined、整棵树渲染为空。
/// 现在统一 camelCase，前后端类型完全对齐。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileNode {
    pub name: String,
    /// 绝对路径（前端用于调 open / read_text_file）
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    /// ISO 8601 字符串（前端易处理；SystemTime 转字符串统一一次）
    pub modified_at: String,
    /// 空数组当叶子（前端不递归判空）
    pub children: Vec<FileNode>,
    pub extension: Option<String>,
}

/// 文本文件大小上限（5MB）· 超限请走本地编辑器
pub const MAX_TEXT_FILE_SIZE: u64 = 5 * 1024 * 1024;

/// 维护者 2026-08-31：原生文件夹选择器（rfd · 阻塞主线程直到用户选完）
/// 返回 None = 用户点了取消（前端视为「未选」）
pub fn pick_directory() -> Result<Option<String>, String> {
    let folder = rfd::FileDialog::new()
        .set_title("选择项目目录")
        .pick_folder();
    Ok(folder.map(|p| p.to_string_lossy().into_owned()))
}

/// 递归扫描目录
///
/// 设计决策：放弃 `ignore` crate —— 它会读 `.gitignore` / 全局 ignore，
/// 在 git 仓库上下文里会把用户目录全部跳过（实测空目录）。
/// 改用纯 std::fs + 简单的黑名单（dotfiles + node_modules / target / .git）。
///
/// - `max_depth`：None 表示不限深度；Some(8) 默认上限（FilesTab 调用时传 8）
/// - 跳过 `.dotfiles` 与常见构建产物目录（node_modules / target / dist / build / .git / .next / .nuxt / .cache / __pycache__）
/// - 单个目录无法访问时不中断整树
pub fn list_directory_recursive(
    root: &Path,
    max_depth: Option<usize>,
) -> Result<FileNode, String> {
    let canonical_root = root
        .canonicalize()
        .map_err(|e| format!("无法访问目录「{}」：{}", root.display(), e))?;

    let metadata = std::fs::metadata(&canonical_root)
        .map_err(|e| format!("读取目录元信息失败「{}」：{}", canonical_root.display(), e))?;

    if !metadata.is_dir() {
        return Err(format!(
            "路径不是目录「{}」",
            canonical_root.display()
        ));
    }

    /// 黑名单目录名（不递归进入 · 也不在树中展示太占地）
    fn is_blacklisted(name: &str) -> bool {
        matches!(
            name,
            ".git"
                | "node_modules"
                | "target"
                | "dist"
                | "build"
                | ".next"
                | ".nuxt"
                | ".cache"
                | ".parcel-cache"
                | "__pycache__"
                | ".venv"
                | "venv"
                | ".idea"
                | ".vscode"
                | ".DS_Store"
        )
    }

    /// 是否 dotfile（`.` 开头 · 不含 `..`）
    fn is_dotfile(name: &str) -> bool {
        name.starts_with('.') && name != "." && name != ".."
    }

    fn metadata_of(path: &Path) -> (u64, String, bool, SystemTime) {
        match std::fs::metadata(path) {
            Ok(m) => {
                let size = m.len();
                let mtime = m.modified().unwrap_or(SystemTime::UNIX_EPOCH);
                let mtime_str = mtime
                    .duration_since(SystemTime::UNIX_EPOCH)
                    .ok()
                    .map(|d| {
                        let dt: DateTime<Utc> = DateTime::<Utc>::from_timestamp(
                            d.as_secs() as i64,
                            d.subsec_nanos(),
                        )
                        .unwrap_or_else(|| DateTime::<Utc>::from_timestamp(0, 0).unwrap());
                        dt.to_rfc3339()
                    })
                    .unwrap_or_default();
                (size, mtime_str, m.is_dir(), mtime)
            }
            Err(_) => (0, String::new(), false, SystemTime::UNIX_EPOCH),
        }
    }

    fn build_recursive(
        path: &Path,
        depth: usize,
        max_depth: Option<usize>,
    ) -> FileNode {
        let (size, mtime_str, is_dir, _mtime) = metadata_of(path);
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();
        let extension = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|s| s.to_lowercase());

        let children = if is_dir && max_depth.map_or(true, |d| depth < d) {
            // 读目录条目
            let mut entries: Vec<(PathBuf, bool, u64, String, SystemTime)> = Vec::new();
            match std::fs::read_dir(path) {
                Ok(read_dir) => {
                    for entry in read_dir.flatten() {
                        let child_path = entry.path();
                        let child_name = entry
                            .file_name()
                            .to_str()
                            .unwrap_or("")
                            .to_string();
                        // 黑名单 / dotfile 直接跳过（不进树）
                        if is_blacklisted(&child_name) || is_dotfile(&child_name) {
                            continue;
                        }
                        let (csize, cmtime, cis_dir, cmtime_st) = metadata_of(&child_path);
                        entries.push((child_path, cis_dir, csize, cmtime, cmtime_st));
                    }
                }
                Err(_) => {
                    // 静默：子目录无权限时不影响其它目录
                }
            }
            // 目录优先，再按名称升序
            entries.sort_by(|a, b| match (a.1, b.1) {
                (true, false) => std::cmp::Ordering::Less,
                (false, true) => std::cmp::Ordering::Greater,
                _ => a.0.file_name().cmp(&b.0.file_name()),
            });
            entries
                .into_iter()
                .map(|(child_path, _, _, _, _)| {
                    let child_depth = depth + 1;
                    build_recursive(&child_path, child_depth, max_depth)
                })
                .collect()
        } else {
            Vec::new()
        };

        FileNode {
            name,
            path: path.to_string_lossy().into_owned(),
            is_dir,
            size,
            modified_at: mtime_str,
            children,
            extension,
        }
    }

    Ok(build_recursive(&canonical_root, 0, max_depth))
}

/// 读文本文件（前端 md/txt/代码类预览用）
/// - 超 5MB 返回错误（引导走本地编辑器）
/// - 二进制内容检测（replace-char 占比 > 10%）返回错误
pub fn read_text_file(path: &Path) -> Result<String, String> {
    let metadata = std::fs::metadata(path)
        .map_err(|e| format!("无法访问文件「{}」：{}", path.display(), e))?;

    if metadata.len() > MAX_TEXT_FILE_SIZE {
        return Err(format!(
            "文件过大（{:.1} MB），请在本地编辑器打开",
            metadata.len() as f64 / 1024.0 / 1024.0
        ));
    }

    let bytes = std::fs::read(path)
        .map_err(|e| format!("读取失败「{}」：{}", path.display(), e))?;

    // 二进制检测
    match String::from_utf8(bytes) {
        Ok(s) => Ok(s),
        Err(e) => {
            let bytes = e.into_bytes();
            let lossy = String::from_utf8_lossy(&bytes);
            let replaced = lossy.matches('\u{FFFD}').count();
            if replaced * 10 > bytes.len() {
                Err("二进制文件无法预览，请在本地编辑器打开".to_string())
            } else {
                // 替换字符占比小（多半是尾部 BOM 之类）· 仍以 lossy 输出
                Ok(lossy.into_owned())
            }
        }
    }
}

/// 写文本文件（接口预留 · FilesTab 不主动调用 · 等知识中心编辑器使用）
pub fn write_text_file(path: &Path, content: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("创建父目录失败「{}」：{}", parent.display(), e))?;
    }
    std::fs::write(path, content)
        .map_err(|e| format!("写入失败「{}」：{}", path.display(), e))
}

/// 读取文本文件 + mtime（DocumentEditor 专用）
///
/// ⚠️ 维护者 2026-08-31：与 `read_text_file` 共用 5MB 上限和二进制检测。
/// 区别：返回值是 `TextFileContent { content, modified_at }`，前端编辑器用它
/// 做「外部修改冲突检测」（记录 loadedMtime，定期重新 stat 比对）。
/// 4 个只读预览继续用 `read_text_file`，不动签名。
pub fn read_text_file_with_mtime(path: &Path) -> Result<TextFileContent, String> {
    let metadata = std::fs::metadata(path)
        .map_err(|e| format!("无法访问文件「{}」：{}", path.display(), e))?;

    if metadata.len() > MAX_TEXT_FILE_SIZE {
        return Err(format!(
            "文件过大（{:.1} MB），请在本地编辑器打开",
            metadata.len() as f64 / 1024.0 / 1024.0
        ));
    }

    let mtime_str = metadata
        .modified()
        .ok()
        .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
        .map(|d| {
            DateTime::<Utc>::from_timestamp(d.as_secs() as i64, d.subsec_nanos())
                .map(|dt| dt.to_rfc3339())
                .unwrap_or_default()
        })
        .unwrap_or_default();

    let bytes = std::fs::read(path)
        .map_err(|e| format!("读取失败「{}」：{}", path.display(), e))?;

    let content = match String::from_utf8(bytes) {
        Ok(s) => s,
        Err(e) => {
            let bytes = e.into_bytes();
            let lossy = String::from_utf8_lossy(&bytes);
            let replaced = lossy.matches('\u{FFFD}').count();
            if replaced * 10 > bytes.len() {
                return Err("二进制文件无法预览，请在本地编辑器打开".to_string());
            }
            lossy.into_owned()
        }
    };

    Ok(TextFileContent {
        content,
        modified_at: mtime_str,
    })
}

/// 文本文件 + mtime（DocumentEditor 专用 · 前端对应 `TextFileContent`）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextFileContent {
    pub content: String,
    pub modified_at: String,
}

/// 读取任意文件的原始字节（前端 docx/pptx/xlsx 等二进制预览用）
/// - 超 50MB 直接拒绝（前端无需也无法渲染这种大文件）
/// - 与 read_text_file 不同：本函数不做 UTF-8 检测，原样返回字节
pub fn read_file_bytes(path: &Path) -> Result<Vec<u8>, String> {
    const MAX_BIN: u64 = 50 * 1024 * 1024;
    let metadata = std::fs::metadata(path)
        .map_err(|e| format!("无法访问文件「{}」：{}", path.display(), e))?;
    if metadata.len() > MAX_BIN {
        return Err(format!(
            "文件过大（{:.1} MB），请在本地编辑器打开",
            metadata.len() as f64 / 1024.0 / 1024.0
        ));
    }
    std::fs::read(path).map_err(|e| format!("读取失败「{}」：{}", path.display(), e))
}

/// 创建一个空文件（FilesTab「新建文件」用）
/// - 若文件已存在则报错（不覆盖）
/// - 父目录不存在会自动创建
pub fn create_empty_file(path: &Path) -> Result<(), String> {
    if path.exists() {
        return Err(format!("已存在「{}」", path.display()));
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("创建父目录失败「{}」：{}", parent.display(), e))?;
    }
    std::fs::File::create(path)
        .map_err(|e| format!("创建文件失败「{}」：{}", path.display(), e))?;
    Ok(())
}

/// 创建一个新目录（FilesTab「新建文件夹」用）
/// - 已存在则报错
/// - 父目录不存在会自动创建
pub fn create_directory(path: &Path) -> Result<(), String> {
    if path.exists() {
        return Err(format!("已存在「{}」", path.display()));
    }
    std::fs::create_dir_all(path)
        .map_err(|e| format!("创建目录失败「{}」：{}", path.display(), e))
}

/// 删除一个文件或目录（递归删除目录）
/// - 二次确认由前端负责（window.confirm）
pub fn remove_path(path: &Path) -> Result<(), String> {
    let metadata = std::fs::metadata(path)
        .map_err(|e| format!("无法访问「{}」：{}", path.display(), e))?;
    if metadata.is_dir() {
        std::fs::remove_dir_all(path)
            .map_err(|e| format!("删除目录失败「{}」：{}", path.display(), e))
    } else {
        std::fs::remove_file(path)
            .map_err(|e| format!("删除文件失败「{}」：{}", path.display(), e))
    }
}

/// 重命名 / 移动 文件或目录
/// - 已存在则报错
pub fn rename_path(from: &Path, to: &Path) -> Result<(), String> {
    if to.exists() {
        return Err(format!("目标已存在「{}」", to.display()));
    }
    if let Some(parent) = to.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("创建父目录失败「{}」：{}", parent.display(), e))?;
    }
    std::fs::rename(from, to)
        .map_err(|e| format!("重命名失败「{}」→「{}」：{}", from.display(), to.display(), e))
}

/// 复制文件 / 目录（递归复制目录）
/// - 目标路径 = 生成不冲突的最终路径（带 " - 副本" / " (2)" / " (3)" … 后缀）
/// - 返回最终写入的目标路径（前端刷新树用）
pub fn copy_path(src: &Path) -> Result<PathBuf, String> {
    if !src.exists() {
        return Err(format!("源路径不存在「{}」", src.display()));
    }
    let parent = src
        .parent()
        .ok_or_else(|| format!("无法获取父目录「{}」", src.display()))?;
    let stem = src
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or_else(|| format!("无法解析文件名「{}」", src.display()))?;
    let ext = src.extension().and_then(|s| s.to_str()).unwrap_or("");

    // 第一次尝试：<stem> - 副本<ext>，存在则 (2) (3) … 后缀
    let mut target = build_copy_target(parent, stem, ext, 1);
    let mut counter = 2usize;
    while target.exists() {
        target = build_copy_target(parent, stem, ext, counter);
        counter += 1;
        if counter > 999 {
            return Err(format!("找不到可用副本名「{}」", src.display()));
        }
    }

    let metadata = std::fs::metadata(src)
        .map_err(|e| format!("无法访问「{}」：{}", src.display(), e))?;
    if metadata.is_dir() {
        copy_dir_recursive(src, &target)?;
    } else {
        std::fs::copy(src, &target)
            .map_err(|e| format!("复制文件失败「{}」→「{}」：{}", src.display(), target.display(), e))?;
    }
    Ok(target)
}

/// 生成第 n 个副本目标路径
///   n=1 → "stem - 副本.ext"（macOS Finder / Win 默认命名）
///   n≥2 → "stem - 副本 (n).ext"
fn build_copy_target(parent: &Path, stem: &str, ext: &str, n: usize) -> PathBuf {
    let suffix = if n == 1 {
        " - 副本".to_string()
    } else {
        format!(" - 副本 ({})", n)
    };
    let name = if ext.is_empty() {
        format!("{}{}", stem, suffix)
    } else {
        format!("{}{}.{}", stem, suffix, ext)
    };
    parent.join(name)
}

/// 递归复制目录（含子目录 + 文件）
fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    std::fs::create_dir_all(dst)
        .map_err(|e| format!("创建目录失败「{}」：{}", dst.display(), e))?;
    for entry in std::fs::read_dir(src)
        .map_err(|e| format!("读取目录失败「{}」：{}", src.display(), e))?
    {
        let entry = entry.map_err(|e| format!("读取目录项失败：{}", e))?;
        let entry_path = entry.path();
        let file_name = entry.file_name();
        let dst_child = dst.join(&file_name);
        let metadata = entry
            .metadata()
            .map_err(|e| format!("无法访问「{}」：{}", entry_path.display(), e))?;
        if metadata.is_dir() {
            copy_dir_recursive(&entry_path, &dst_child)?;
        } else {
            std::fs::copy(&entry_path, &dst_child).map_err(|e| {
                format!(
                    "复制文件失败「{}」→「{}」：{}",
                    entry_path.display(),
                    dst_child.display(),
                    e
                )
            })?;
        }
    }
    Ok(())
}

/// 用 OS 默认程序打开文件（复用 open crate）
pub fn open_file_external(path: &Path) -> Result<String, String> {
    let path_str = path.to_string_lossy().into_owned();
    open::that(&path_str).map_err(|e| format!("打开失败「{}」：{}", path_str, e))?;
    Ok(path_str)
}
