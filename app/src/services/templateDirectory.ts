/**
 * PMTool · 模板中心：全局模板目录绑定前端服务（维护者 2026-09-09）
 *
 * 对应 Rust commands/template_directory.rs：
 *   - get_template_directory
 *   - set_template_directory
 *
 * 目录内文件的浏览 / 预览 / 创建 / 删除 / 重命名 / 复制 全部复用 projectFiles 的路径级命令。
 */

import { invoke } from '@tauri-apps/api/core'

/** 读取当前绑定的模板目录（null = 未绑定） */
export async function getTemplateDirectory(): Promise<string | null> {
  return await invoke<string | null>('get_template_directory')
}

/** 设置 / 清除模板目录绑定（path = null 表示清除 · 不会删除磁盘文件） */
export async function setTemplateDirectory(path: string | null): Promise<boolean> {
  return await invoke<boolean>('set_template_directory', { path })
}
