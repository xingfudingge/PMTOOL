/**
 * PMTool · 项目文件管理前端服务（维护者 2026-08-31 · FilesTab）
 *
 * 对应 Rust commands/project_files.rs：
 *   - pick_project_directory
 *   - set_project_local_directory / get_project_local_directory
 *   - list_project_files
 *   - read_text_file / write_text_file（编辑器接口预留）
 *   - open_file_external
 */

import { invoke } from '@tauri-apps/api/core'

// ============================================================
// 类型（与 Rust services::file_browser::FileNode 对应）
// ============================================================

export interface FileNode {
  name: string
  /** 绝对路径（前端调 open / read_text_file 都用它） */
  path: string
  isDir: boolean
  size: number
  /** ISO 8601 字符串 */
  modifiedAt: string
  /** 空数组当叶子 · 前端不再递归判空 */
  children: FileNode[]
  extension: string | null
}

// ============================================================
// API
// ============================================================

/**
 * 弹出系统原生文件夹选择器（rfd）
 * 返回 null = 用户取消
 */
export async function pickProjectDirectory(): Promise<string | null> {
  return await invoke<string | null>('pick_project_directory')
}

/**
 * 设置项目绑定的本地目录（写 projects.local_directory_path）
 * path = null 表示清除绑定
 */
export async function setProjectLocalDirectory(
  projectId: number,
  path: string | null,
): Promise<boolean> {
  return await invoke<boolean>('set_project_local_directory', {
    projectId,
    path,
  })
}

/**
 * 读取项目当前绑定的本地目录（不触发文件系统）
 */
export async function getProjectLocalDirectory(
  projectId: number,
): Promise<string | null> {
  return await invoke<string | null>('get_project_local_directory', {
    projectId,
  })
}

/**
 * 递归扫描目录（FilesTab 左侧树）
 * maxDepth 默认 8 层（防深递归爆炸 · 经验值）
 */
export async function listProjectFiles(
  path: string,
  maxDepth: number | null = 8,
): Promise<FileNode> {
  return await invoke<FileNode>('list_project_files', {
    path,
    maxDepth,
  })
}

/**
 * 读取文本文件（md / txt / 代码类预览）
 * 超 5MB 或二进制会被 Rust 端拒绝
 */
export async function readTextFile(path: string): Promise<string> {
  return await invoke<string>('read_text_file', { path })
}

/**
 * 写入文本文件（接口预留 · FilesTab 不主动调用 · 等知识中心编辑器使用）
 */
export async function writeTextFile(
  path: string,
  content: string,
): Promise<void> {
  await invoke<void>('write_text_file', { path, content })
}

/**
 * 读取任意文件原始字节（docx / pptx / xlsx / 图片预览用）
 * 返回 Uint8Array · 前端用 new Blob([bytes]) 包成 Blob 给 docx-preview / SheetJS
 */
export async function readFileBytes(path: string): Promise<Uint8Array> {
  const arr = await invoke<number[]>('read_file_bytes', { path })
  return new Uint8Array(arr)
}

/**
 * 维护者 2026-08-31 · DocumentEditor 专用：
 * 读文本文件 + mtime（外部修改冲突检测）
 * 注意：4 个只读预览继续用 readTextFile，不要换。
 */
export interface TextFileContent {
  content: string
  /** ISO 8601 · FileNode 同款 · 用于编辑器 mtime 比对 */
  modifiedAt: string
}

export async function readTextFileWithMtime(
  path: string,
): Promise<TextFileContent> {
  return await invoke<TextFileContent>('read_text_file_with_mtime', { path })
}

/**
 * 在指定路径创建空文件（FilesTab「+ 新建文件」）
 * - 已存在返回错误（前端弹 toast）
 * - 父目录不存在会自动创建
 */
export async function createFile(path: string): Promise<void> {
  await invoke<void>('create_file', { path })
}

/**
 * 创建新目录（FilesTab「+ 新建文件夹」）
 */
export async function createDirectory(path: string): Promise<void> {
  await invoke<void>('create_directory_cmd', { path })
}

/**
 * 删除文件或目录（目录递归删除）
 * - 二次确认由前端负责
 */
export async function removePath(path: string): Promise<void> {
  await invoke<void>('remove_path_cmd', { path })
}

/**
 * 重命名 / 移动 文件或目录
 */
export async function renamePath(from: string, to: string): Promise<void> {
  await invoke<void>('rename_path_cmd', { from, to })
}

/**
 * 维护者 2026-08-31：复制文件 / 目录（递归复制目录）
 * 后端自动生成不冲突的目标路径（" - 副本" / " (2)" 后缀）
 * 返回最终写入的目标路径（前端用这个刷新文件树 / 选中新副本）
 */
export async function copyPath(path: string): Promise<string> {
  return await invoke<string>('copy_path_cmd', { path })
}

/**
 * 维护者 2026-09-16：复制文件 / 目录到指定目标目录（右键菜单「复制 → 粘贴」）
 * 与 copyPath 的区别：copyPath 是就地生成副本，本函数复制到别的目录。
 * 目标同名时后端自动「 - 副本」消解；返回最终写入路径。
 */
export async function copyPathToDir(path: string, destDir: string): Promise<string> {
  return await invoke<string>('copy_path_to_cmd', { path, destDir })
}

/**
 * 用 OS 默认程序打开文件（open crate）
 */
export async function openFileExternal(path: string): Promise<string> {
  return await invoke<string>('open_file_external', { path })
}
