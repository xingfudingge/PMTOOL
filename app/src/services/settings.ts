/**
 * PMTool · 设置中心前端服务（2026-09-09）
 *
 * 对应 Rust commands/settings.rs + commands/backup.rs：
 *   - get_all_settings / get_setting / set_setting
 *   - get_data_dir（真实数据目录 + db 路径）
 *   - backup_data / restore_data / set_data_root / set+get_backup_location / list_backups / reveal_path
 *   - sync_holidays（工作日/节假日源同步）
 */

import { invoke } from '@tauri-apps/api/core'

/** 读取全部设置（key -> value） */
export async function getSettings(): Promise<Record<string, string>> {
  return await invoke<Record<string, string>>('get_all_settings')
}

/** 读取单个设置 */
export async function getSetting(key: string): Promise<string | null> {
  return await invoke<string | null>('get_setting', { key })
}

/** 写入 / 更新设置 */
export async function setSetting(key: string, value: string): Promise<boolean> {
  return await invoke<boolean>('set_setting', { key, value })
}

/** 真实数据目录：返回 [数据目录, 数据库文件路径] */
export async function getDataDir(): Promise<[string, string]> {
  return await invoke<[string, string]>('get_data_dir')
}

/** 是否已由用户自选过数据目录（首启检测用） */
export async function isDataRootSet(): Promise<boolean> {
  return await invoke<boolean>('is_data_root_set')
}

/** 首启：弹出原生目录选择器自选数据存放目录（需重启生效），返回所选目录；取消返回 null */
export async function pickDataRoot(): Promise<string | null> {
  return await invoke<string | null>('pick_data_root')
}

/** 立即备份到 dest_dir/<时间戳>/，返回生成的备份目录绝对路径 */
export async function backupData(destDir: string): Promise<string> {
  return await invoke<string>('backup_data', { destDir })
}

/** 用备份目录还原（还原前自动备份当前；返回提示，需重启生效） */
export async function restoreData(srcDir: string): Promise<string> {
  return await invoke<string>('restore_data', { srcDir })
}

/** 删除指定备份目录 */
export async function deleteBackup(dir: string, name: string): Promise<boolean> {
  return await invoke<boolean>('delete_backup', { dir, name })
}

/** 把当前数据目录切换到自选位置（需重启生效） */
export async function setDataRoot(path: string): Promise<string> {
  return await invoke<string>('set_data_root', { path })
}

/** 读取备份位置设置 */
export async function getBackupLocation(): Promise<string | null> {
  return await invoke<string | null>('get_backup_location')
}

/** 设置备份位置（null 清除） */
export async function setBackupLocation(path: string | null): Promise<boolean> {
  return await invoke<boolean>('set_backup_location', { path })
}

/** 备份项 */
export interface BackupItem {
  name: string
  size: number
}

/** 列出备份目录下的备份项 */
export async function listBackups(dir: string): Promise<BackupItem[]> {
  return await invoke<BackupItem[]>('list_backups', { dir })
}

/** 在系统文件管理器中打开路径 */
export async function revealPath(path: string): Promise<boolean> {
  return await invoke<boolean>('reveal_path', { path })
}

/** 拉取并同步某年度节假日数据（写入 holidays 表），返回同步结果描述 */
export async function syncHolidays(sourceUrl: string, year: number): Promise<string> {
  return await invoke<string>('sync_holidays', { sourceUrl, year })
}

/** 清空全部法定节假日数据（用于测试与工作日历的关联） */
export async function clearHolidays(): Promise<number> {
  return await invoke<number>('clear_holidays')
}
