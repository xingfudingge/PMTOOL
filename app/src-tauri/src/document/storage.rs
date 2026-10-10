/**
 * PMTool · Document Engine 产物文件存储（2026-09-18）
 *
 * 设计依据：docs/document-engine-rfc-2026-09-18.md §8
 *   二进制产物（source/export/preview）落 PMToolData/doc/{doc_id}/，DB 只存 storage_path 引用。
 *
 * 安全：拒绝 .. / 绝对路径逃逸（对齐 services::file_storage 的规则）。
 * 冲突：同名文件以随机后缀重命名。
 */

use std::fs;
use std::path::{Component, Path, PathBuf};

#[derive(Clone)]
pub struct DocumentStorage {
    /// 数据根（data_dir/PMToolData）
    data_root: PathBuf,
}

impl DocumentStorage {
    pub fn new(data_root: PathBuf) -> Self {
        Self { data_root }
    }

    /// 文档产物根：<data_root>/doc/{doc_id}
    pub fn doc_dir(&self, doc_id: &str) -> PathBuf {
        self.data_root.join("doc").join(doc_id)
    }

    fn safe_relative(&self, relative: &str) -> Result<PathBuf, String> {
        let p = Path::new(relative);
        if p.is_absolute() {
            return Err(format!("拒绝绝对路径：{}", relative));
        }
        for comp in p.components() {
            match comp {
                Component::ParentDir => return Err(format!("拒绝路径逃逸：{}", relative)),
                Component::RootDir => return Err(format!("拒绝根路径：{}", relative)),
                _ => {}
            }
        }
        // root 先 canonicalize，避免 Windows 下 canonical 结果带 `\\?\` 前缀与原始 root 不一致
        let root = self.data_root.canonicalize().unwrap_or_else(|_| self.data_root.clone());
        let abs = root.join(p);
        let canonical = abs.canonicalize().unwrap_or(abs);
        if !canonical.starts_with(&root) {
            return Err(format!("路径逃逸 data_root：{}", relative));
        }
        Ok(p.to_path_buf())
    }

    fn unique_filename(&self, dir: &Path, original: &str) -> String {
        if !dir.join(original).exists() {
            return original.to_string();
        }
        let p = Path::new(original);
        let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("file");
        let ext = p.extension().and_then(|s| s.to_str()).unwrap_or("");
        let suffix = random_hex();
        if ext.is_empty() {
            format!("{}_{}", stem, suffix)
        } else {
            format!("{}_{}.{}", stem, suffix, ext)
        }
    }

    /// 写产物文件到 doc_id 的子目录（source/export/preview），返回相对 PMToolData 的路径
    pub fn write_product(
        &self,
        doc_id: &str,
        subdir: &str,
        file_name: &str,
        bytes: &[u8],
    ) -> Result<String, String> {
        // file_name 来自前端导出名，先做路径校验：拒绝绝对路径 / .. / 子目录逃逸
        if Path::new(file_name).is_absolute() {
            return Err(format!("拒绝绝对路径：{}", file_name));
        }
        for comp in Path::new(file_name).components() {
            match comp {
                Component::ParentDir => return Err(format!("拒绝路径逃逸：{}", file_name)),
                Component::RootDir => return Err(format!("拒绝根路径：{}", file_name)),
                _ => {}
            }
        }
        let dir = self.doc_dir(doc_id).join(subdir);
        fs::create_dir_all(&dir).map_err(|e| format!("创建目录失败：{}", e))?;
        let final_name = self.unique_filename(&dir, file_name);
        let target = dir.join(&final_name);
        fs::write(&target, bytes).map_err(|e| format!("写入失败：{}", e))?;
        Ok(format!("doc/{}/{}/{}", doc_id, subdir, final_name))
    }

    /// 取产物绝对路径（用于 reveal / open）
    pub fn absolute(&self, relative_path: &str) -> Result<PathBuf, String> {
        let safe = self.safe_relative(relative_path)?;
        Ok(self.data_root.join(safe))
    }
}

/// 短随机十六进制后缀（时间纳秒节选，足够区分同目录冲突）
fn random_hex() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.subsec_nanos())
        .unwrap_or(0);
    format!("{:06x}", nanos)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_and_keeps_rel_path_inside_root() {
        let tmp = tempfile::tempdir().unwrap();
        let storage = DocumentStorage::new(tmp.path().to_path_buf());
        let rel = storage
            .write_product("doc_1", "export", "周报.docx", b"hello")
            .unwrap();
        assert!(rel.starts_with("doc/doc_1/export/"));
        assert!(rel.ends_with(".docx"));
        let abs = storage.absolute(&rel).unwrap();
        assert!(abs.starts_with(tmp.path()));
    }

    #[test]
    fn rejects_path_escape_and_absolute() {
        let tmp = tempfile::tempdir().unwrap();
        let storage = DocumentStorage::new(tmp.path().to_path_buf());
        assert!(storage.absolute("../../etc/passwd").is_err());
        assert!(storage.absolute("/abs/path").is_err());
        assert!(storage.absolute("doc/doc_1/export/a.docx").is_ok());
    }
}