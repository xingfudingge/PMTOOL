/**
 * PMTool V2.0 · Excel 模板下载（内置模板 · 维护者 2026-08-26 拍板）
 *
 * 用途：把 `app/src/assets/templates/pmtool_project_template.xlsx`（301K）下载到本地
 * Vite 处理 · `?url` query 返回打包后的静态资源 URL
 */

import templateUrl from '@/assets/templates/pmtool_project_template.xlsx?url'
import { saveBlobToDirectory } from './excel'

/** 内置模板默认文件名 */
const TEMPLATE_FILENAME = 'xx项目实施计划模板.xlsx'

/**
 * 下载内置模板（浏览器触发下载）
 * @returns true 成功 / false 失败（调用处可弹提示）
 */
export async function downloadProjectTemplate(): Promise<boolean> {
  try {
    const res = await fetch(templateUrl)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const blob = await res.blob()
    await saveBlobToDirectory(blob, TEMPLATE_FILENAME)
    return true
  } catch (err) {
    console.error('[template] 下载内置模板失败', err)
    return false
  }
}

/** 模板 URL（供调试用） */
export const PROJECT_TEMPLATE_URL = templateUrl