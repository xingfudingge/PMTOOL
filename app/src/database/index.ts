/**
 * PMTool V2.0 · database barrel export
 * Phase 0 · T0.4
 *
 * 统一对外入口 · 重导出 api.ts 业务命名层 + schema.ts Drizzle 类型层
 *
 * 约定：
 *   - 业务调用方: import { listProjects, type Project } from '@/database'
 *   - Drizzle 类型: import { projects, todos } from '@/database'
 */

export * from './api'
export * as schema from './schema'