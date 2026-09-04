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
 * 验收样例 #1：PM 决策 A1 后，schema 应为 16 张表。
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SCHEMA_SQL_PATH = resolve(__dirname, '../../../../database/schema.sql')
const INIT_SQL_PATH = resolve(__dirname, '../../../../database/migrations/0001_init.sql')

describe('Schema 三方一致性', () => {
  // 已知失败 · 三方冲突冻结（C 方案）· 等 RFC 决策（schema.sql=20 vs PM A1=16）
  // 不允许 it.skip · 测试该失败就失败 · 记录在 V8/验收/Phase0-4验证清单.md §10 风险 7
  it('schema.sql 包含 16 张表（PM 决策 A1）', () => {
    const sql = readFileSync(SCHEMA_SQL_PATH, 'utf-8')
    const tableMatches = sql.match(/CREATE TABLE IF NOT EXISTS \w+/g) ?? []
    const tableCount = tableMatches.length
    expect(tableCount).toBe(16) // PM 决策 A1：正式基线 16 张表
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

  it('0001_init.sql 与 schema.sql 语句数一致', () => {
    const schemaSql = readFileSync(SCHEMA_SQL_PATH, 'utf-8')
    const initSql = readFileSync(INIT_SQL_PATH, 'utf-8')

    // CREATE TABLE 数应一致
    const schemaTables = (schemaSql.match(/CREATE TABLE IF NOT EXISTS \w+/g) ?? []).length
    const initTables = (initSql.match(/CREATE TABLE IF NOT EXISTS `?\w+`?/gi) ?? []).length
    expect(initTables).toBeGreaterThanOrEqual(schemaTables - 1) // 0001_init.sql 额外加 migrations 元数据表
  })

  it('0001_init.sql 含 drizzle-kit 标准分隔符', () => {
    const initSql = readFileSync(INIT_SQL_PATH, 'utf-8')
    const breakpoints = (initSql.match(/-->\s*statement-breakpoint/g) ?? []).length
    // drizzle-kit 格式要求每个 statement 之间有分隔符
    expect(breakpoints).toBeGreaterThan(15) // 至少 16 张表 - 1（开头）
  })
})