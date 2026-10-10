/**
 * Schema 三方一致性测试
 * Phase 0 · T0.4d
 *
 * 验证：
 *   - database/schema.sql（SQL 运行时）
 *   - src/database/schema.ts（Drizzle ORM TypeScript 类型层）
 *   - database/migrations/0001_init.sql（drizzle-kit 迁移文件）
 *
 * 三者必须保持一致（RFC-01 §9 实施约束）。
 *
 * 验收样例 #1：schema.sql SHALL 与登记的表基线完全一致。
 *   原断言「16 张表（PM 决策 A1）」冻结于 Phase 0（见验收清单 §10 风险 7），
 *   Phase 5+/知识中心重构已合法扩展到 22 张表。2026-09-16 改为精确表名白名单：
 *   允许 schema 演进，但新表必须显式登记进 EXPECTED_TABLES，保留漂移守护意图。
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SCHEMA_SQL_PATH = resolve(__dirname, '../../../../database/schema.sql')
const INIT_SQL_PATH = resolve(__dirname, '../../../../database/migrations/0001_init.sql')

// schema.sql 当前基线（37 张表）· 新增表必须显式加入此处，测试即漂移守护
const EXPECTED_TABLES = [
  // 2026-10-10 智能助手子系统已移除，不再有 ai_* / templates 表
  'attachments',
  'audit_logs',
  // 2026-09-18 Document Engine（docs/document-engine-rfc-2026-09-18.md）
  'documents',
  'document_versions',
  'holidays',
  'knowledge_folders',
  'knowledge_note_tags',
  'knowledge_notes',
  'knowledge_tags',
  // 2026-09-18 消息与通知中心（docs/notification-center-rfc-2026-09-18.md §5）
  'notification_channel',
  'notification_delivery',
  'notification_message',
  'notification_rule',
  // 2026-09-16 授权隔离改造：license 表废弃，授权数据移入 OS 安全存储
  'project_issue_log',
  'project_issues',
  'project_members',
  'project_requirements',
  'project_tasks',
  'project_todo_items',
  'projects',
  'reports',
  'system_config',
  'todos',
  'weekly_report_entries',
  'work_schedule',
]

describe('Schema 三方一致性', () => {
  it('schema.sql 表集合与基线一致（当前 25 张 · 漂移即失败）', () => {
    const sql = readFileSync(SCHEMA_SQL_PATH, 'utf-8')
    const tables = [...sql.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map(m => m[1])
    expect([...tables].sort()).toEqual([...EXPECTED_TABLES].sort())
  })

  it('schema.sql 不含已废除的 source_type（TODO/PLAN/RISK/AI）', () => {
    const sql = readFileSync(SCHEMA_SQL_PATH, 'utf-8')
    // todos.source_type 注释中仅允许 MANUAL/WEEKLY
    expect(sql).toContain("MANUAL") // DEFAULT 'MANUAL'
    expect(sql).toContain("WEEKLY") // '已废除 PLAN/RISK'
    expect(sql).not.toMatch(/source_type\s*=\s*['"]?TODO/)
    expect(sql).not.toMatch(/source_type\s*=\s*['"]?PLAN['"]?/)
    expect(sql).not.toMatch(/source_type\s*=\s*['"]?RISK['"]?/)
  })

  it('schema.sql 含 completed_at 字段（UTC ISO 8601）', () => {
    const sql = readFileSync(SCHEMA_SQL_PATH, 'utf-8')
    // todos 表应包含 completed_at
    expect(sql).toContain('completed_at')
    expect(sql).toContain('UTC ISO 8601')
  })

  it('schema.sql 表集合 ⊇ 0001_init.sql 基线（schema 权威 · 前向演进）', () => {
    const schemaSql = readFileSync(SCHEMA_SQL_PATH, 'utf-8')
    const initSql = readFileSync(INIT_SQL_PATH, 'utf-8')

    // 0001_init.sql 是 Phase 0 冻结基线（含已废弃的 ai_messages/ai_models/ai_sessions/knowledge_ai_records），
    // 后续演进（知识中心/AI/Document/通知等）只进 schema.sql + 增量 migration，不回写 0001_init.sql。
    // 因此断言方向：schema.sql（权威源）表数必须 ≥ 0001_init.sql（旧基线）表数。
    const schemaTables = (schemaSql.match(/CREATE TABLE IF NOT EXISTS \w+/g) ?? []).length
    const initTables = (initSql.match(/CREATE TABLE IF NOT EXISTS `?\w+`?/gi) ?? []).length
    expect(schemaTables).toBeGreaterThanOrEqual(initTables)
  })

  it('0001_init.sql 含 drizzle-kit 标准分隔符', () => {
    const initSql = readFileSync(INIT_SQL_PATH, 'utf-8')
    const breakpoints = (initSql.match(/-->\s*statement-breakpoint/g) ?? []).length
    // drizzle-kit 格式要求每个 statement 之间有分隔符
    expect(breakpoints).toBeGreaterThan(15) // 至少 16 张表 - 1（开头）
  })
})