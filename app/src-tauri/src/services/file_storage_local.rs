/**
 * PMTool · LocalFileStorageProvider 实现
 * Phase 4 · T4.9
 *
 * 实际存储：PMToolData/projects/{project_id}/files/{相对路径}
 * 文件名冲突以 UUID 重命名（RFC-03 §2）
 * 仅在受管数据根目录内操作（路径校验拒绝 .. 和符号链接逃逸）
 */

use std::fs;
use std::path::{Component, Path, PathBuf};

use super::file_storage::{FileMetadata, FileStorageProvider, StoredFile};

pub struct LocalFileStorageProvider {
    /// 数据根目录（PMToolData）
    data_root: PathBuf,
}

impl LocalFileStorageProvider {
    pub fn new(data_root: PathBuf) -> Self {
        Self { data_root }
    }

    /// 路径校验：拒绝 .. / 符号链接逃逸 / 外部绝对路径
    /// 返回规范化后的安全相对路径
    fn safe_relative(&self, relative: &str) -> Result<PathBuf, String> {
        let p = Path::new(relative);
        // 1. 拒绝绝对路径
        if p.is_absolute() {
            return Err(format!("拒绝绝对路径：{}", relative));
        }
        // 2. 检查每个 component，拒绝 .. 和根目录
        for comp in p.components() {
            match comp {
                Component::ParentDir => {
                    return Err(format!("拒绝路径逃逸：{}", relative));
                }
                Component::RootDir => {
                    return Err(format!("拒绝根路径：{}", relative));
                }
                _ => {}
            }
        }
        // 3. 解析符号链接（如有）后检查仍在 data_root 内
        let abs = self.data_root.join(p);
        let canonical = abs.canonicalize().unwrap_or(abs);
        if !canonical.starts_with(&self.data_root) {
            return Err(format!("路径逃逸 data_root：{}", relative));
        }
        Ok(p.to_path_buf())
    }

    /// 文件名冲突处理：UUID 重命名
    /// 合同.docx → 合同_a1b2c3.docx
    fn unique_filename(&self, target_dir: &Path, original: &str) -> String {
        if !target_dir.join(original).exists() {
            return original.to_string();
        }
        let p = Path::new(original);
        let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("file");
        let ext = p.extension().and_then(|s| s.to_str()).unwrap_or("");
        // 6 位 UUID 前缀
        let prefix: String = (0..6)
            .map(|_| {
                let idx = (uuid_v4_byte() % 16) as usize;
                format!("{:x}", idx)
            })
            .collect();
        if ext.is_empty() {
            format!("{}_{}", stem, prefix)
        } else {
            format!("{}_{}.{}", stem, prefix, ext)
        }
    }
}

fn uuid_v4_byte() -> u8 {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.subsec_nanos())
        .unwrap_or(0);
    (nanos % 256) as u8
}

impl FileStorageProvider for LocalFileStorageProvider {
    fn save_file(
        &self,
        owner_type: &str,
        owner_id: i64,
        file_name: &str,
        content: &[u8],
    ) -> Result<StoredFile, String> {
        // 1. 计算目标目录
        let target_dir = self.data_root.join(owner_type.to_lowercase()).join(owner_id.to_string()).join("files");
        fs::create_dir_all(&target_dir).map_err(|e| format!("创建目录失败：{}", e))?;

        // 2. 处理文件名冲突
        let final_name = self.unique_filename(&target_dir, file_name);
        let target_path = target_dir.join(&final_name);

        // 3. 写入
        fs::write(&target_path, content).map_err(|e| format!("写入失败：{}", e))?;

        // 4. 计算相对路径
        let relative = format!("{}/{}/{}/{}", owner_type.to_lowercase(), owner_id, "files", final_name);

        // 5. 计算 SHA-256
        let sha256 = self.compute_sha256(content);

        // 6. 获取 MIME
        let mime_type = super::file_storage::infer_mime_type(file_name);

        Ok(StoredFile {
            relative_path: relative,
            file_size: content.len() as u64,
            mime_type,
            sha256,
        })
    }

    fn absolute_path(&self, relative_path: &str) -> Result<PathBuf, String> {
        let safe = self.safe_relative(relative_path)?;
        Ok(self.data_root.join(safe))
    }

    /// 用 OS 默认程序打开文件（PMTool 核心场景）
    /// 使用 `open` crate 跨平台调用：
    ///   - macOS: open <path>
    ///   - Linux: xdg-open <path>
    ///   - Windows: cmd /c start "" <path>
    /// 不阻塞 Rust 进程（OS 程序独立运行）
    fn open_file(&self, relative_path: &str) -> Result<String, String> {
        let abs = self.absolute_path(relative_path)?;
        if !abs.exists() {
            return Err(format!("文件不存在：{}", relative_path));
        }
        // open crate 跨平台调用 OS 默认程序
        // 文档参考：https://docs.rs/open/5
        open::that(&abs).map_err(|e| format!("打开文件失败：{}", e))?;
        Ok(abs.to_string_lossy().to_string())
    }

    fn delete_file(&self, relative_path: &str) -> Result<(), String> {
        let abs = self.absolute_path(relative_path)?;
        if !abs.exists() {
            return Ok(()); // 不存在视为已删
        }
        fs::remove_file(&abs).map_err(|e| format!("删除失败：{}", e))?;
        Ok(())
    }

    fn get_file_info(&self, relative_path: &str) -> Result<FileMetadata, String> {
        let abs = self.absolute_path(relative_path)?;
        if !abs.exists() {
            return Err(format!("文件不存在：{}", relative_path));
        }
        let metadata = fs::metadata(&abs).map_err(|e| format!("读取元信息失败：{}", e))?;
        Ok(FileMetadata {
            relative_path: relative_path.to_string(),
            absolute_path: abs,
            file_size: metadata.len(),
            modified_time: metadata.modified().ok(),
            sha256: None, // 避免大文件重计算
        })
    }

    fn list_files(&self, owner_type: &str, owner_id: i64) -> Result<Vec<String>, String> {
        let target_dir = self
            .data_root
            .join(owner_type.to_lowercase())
            .join(owner_id.to_string())
            .join("files");
        if !target_dir.exists() {
            return Ok(vec![]);
        }
        let mut results = vec![];
        for entry in fs::read_dir(&target_dir).map_err(|e| format!("读取目录失败：{}", e))? {
            let entry = entry.map_err(|e| e.to_string())?;
            if entry.file_type().map(|t| t.is_file()).unwrap_or(false) {
                if let Some(name) = entry.file_name().to_str() {
                    let relative = format!(
                        "{}/{}/files/{}",
                        owner_type.to_lowercase(),
                        owner_id,
                        name
                    );
                    results.push(relative);
                }
            }
        }
        Ok(results)
    }
}

/// 默认 Provider（Phase 4 T4.9）
pub fn default_local_provider() -> LocalFileStorageProvider {
    // data_root 从 db 模块获取（应用启动时设置）
    // Phase 4 简化版：假设 PMToolData 在用户主目录
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| ".".to_string());
    LocalFileStorageProvider::new(PathBuf::from(home).join("Library").join("Application Support").join("PMToolData"))
}