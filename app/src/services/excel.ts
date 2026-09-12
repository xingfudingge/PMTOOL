/**
 * PMTool V2.0 · Excel 导入导出（SheetJS 集成骨架）
 * Phase 4 · T4.5
 *
 * 设计依据：V8/页面规格/projects.md §7
 *   - SheetJS（开源）
 *   - 支持导入计划 / 导出计划
 *
 * ⚠️ 实际数据依赖 project_tasks 命令（Phase 0 未实现）
 *    当前实现：SheetJS 安装 + 解析器 + 导出器骨架
 *
 * Phase 4 进度：
 *   ✅ Excel 字段映射定义
 *   ✅ 解析器 / 导出器接口
 *   ⏳ xlsx npm 包安装（待网络）
 *   ⏳ 真实数据集成（Phase 0 commands 解冻后）
 */

import { invoke } from '@tauri-apps/api/core'
import type { ProjectTask } from './project'

/** Excel 列定义（测试科技测试样板格式 · V8/页面规格/projects.md）*/
export const EXCEL_COLUMNS = [
  { key: 'id', label: '序号', width: 8 },
  { key: 'task_name', label: '任务', width: 33 },
  { key: 'owner', label: '跟进人', width: 12 },
  { key: 'start_date', label: '计划启动日期', width: 16 },
  { key: 'end_date', label: '计划完成日期', width: 16 },
  { key: 'work_days', label: '自然日工时', width: 12 },
  { key: 'progress', label: '当前完成度%', width: 12 },
  { key: 'workday_count', label: '工作日工时', width: 12 },
  { key: 'remark', label: '任务完成情况说明', width: 40 },
] as const

/** Excel 导入选项 */
export interface ExcelImportOptions {
  /** 是否覆盖现有数据 */
  overwrite?: boolean
  /** 父任务 ID 列名（用于层级关系）*/
  parentColumn?: string
}

/** Excel 导出选项 */
export interface ExcelExportOptions {
  /** 文件名（不含扩展名）*/
  filename?: string
  /** 是否包含表头 */
  includeHeader?: boolean
  /** Sheet 名 */
  sheetName?: string
}

/**
 * Excel 解析器（骨架 · Phase 4）
 * 真实实现需装 xlsx（SheetJS）包
 */
export async function parseProjectPlanExcel(
  _file: File | ArrayBuffer,
  _options?: ExcelImportOptions,
): Promise<ProjectTask[]> {
  // TODO Phase 4 接入 xlsx：
  //   import * as XLSX from 'xlsx'
  //   const workbook = XLSX.read(arrayBuffer, { type: 'array' })
  //   const sheet = workbook.Sheets[workbook.SheetNames[0]]
  //   const json = XLSX.utils.sheet_to_json(sheet)
  //   映射到 ProjectTask[]

  console.warn('[excel] SheetJS 未安装 · 需网络装包')
  return []
}

/**
 * Excel 导出器（骨架 · Phase 4）
 * 真实实现需装 xlsx（SheetJS）包
 */
export async function exportProjectPlanToExcel(
  _tasks: ProjectTask[],
  _options?: ExcelExportOptions,
): Promise<Blob> {
  // TODO Phase 4 接入 xlsx：
  //   const data = tasks.map(t => ({
  //     id: t.id,
  //     task_name: t.taskName,
  //     owner: t.owner ?? '',
  //     ...
  //   }))
  //   const worksheet = XLSX.utils.json_to_sheet(data)
  //   const workbook = XLSX.utils.book_new()
  //   XLSX.utils.book_append_sheet(workbook, worksheet, '项目计划')
  //   const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })
  //   return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })

  console.warn('[excel] SheetJS 未安装 · 需网络装包')
  return new Blob(['placeholder'], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

/**
 * 导出到用户选择的目录（Tauri 原生 rfd「另存为」对话框）
 * @returns true 保存成功 / false 用户取消或失败（调用处可弹提示）
 */
export async function saveBlobToDirectory(blob: Blob, filename: string): Promise<boolean> {
  try {
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const path = await invoke<string | null>('save_export_file', {
      defaultName: filename,
      data: Array.from(bytes),
    })
    // Tauri：弹出原生保存对话框，用户选目录+文件名后由后端写入
    if (path) return true
    // 用户取消了保存对话框
    return false
  } catch (err) {
    // 非 Tauri（浏览器开发模式）回退为直接浏览器下载
    console.warn('[saveBlobToDirectory] 回退浏览器下载', err)
    return triggerDownload(blob, filename)
  }
}

/**
 * 触发浏览器下载（辅助函数）
 */
export function triggerDownload(blob: Blob, filename: string): boolean {
  try {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    // 给浏览器一点时间触发下载
    setTimeout(() => {
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }, 100)
    return true
  } catch (err) {
    console.error('[triggerDownload] 失败', err)
    return false
  }
}

/**
 * 字段映射表（数据库 → Excel）
 */
export function taskToExcelRow(task: ProjectTask): Record<string, string | number> {
  return {
    id: task.id,
    task_name: task.task_name,
    owner: task.owner ?? '',
    start_date: task.start_date ?? '',
    end_date: task.end_date ?? '',
    work_days: task.work_days,
    progress: Math.round(task.progress),
    workday_count: task.work_days, // Phase 4 简化版：与 work_days 同
    remark: task.remark ?? '',
  }
}

/**
 * 字段映射表（Excel → 数据库）
 */
export function excelRowToTask(row: Record<string, unknown>, projectId: number): Partial<ProjectTask> {
  return {
    project_id: projectId,
    task_name: String(row.task_name ?? '').trim(),
    owner: row.owner ? String(row.owner) : null,
    start_date: row.start_date ? String(row.start_date) : null,
    end_date: row.end_date ? String(row.end_date) : null,
    work_days: typeof row.work_days === 'number' ? row.work_days : 0,
    progress: typeof row.progress === 'number' ? row.progress : 0,
    remark: row.remark ? String(row.remark) : null,
  }
}