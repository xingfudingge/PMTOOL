/**
 * Drizzle Kit 配置
 * Phase 0 · T0.4c · drizzle-kit migration 工具配置
 *
 * 用途：
 *   1. pnpm drizzle-kit generate  → 从 src/database/schema.ts 生成 SQL migration
 *   2. pnpm drizzle-kit push     → 直接推送 schema 到数据库（开发用）
 *   3. pnpm drizzle-kit studio   → 启动可视化数据库管理界面（开发用）
 *
 * 注意：
 *   - schema.ts 当前作为 TypeScript 类型层使用，实际运行时通过 src-tauri/src/commands/ 业务命名接口
 *   - Drizzle schema.ts 与 database/schema.sql 是**双重数据合同**，必须保持一致
 *   - 迁移文件输出到 ../database/migrations/（canonical，与 Rust 端 db.rs 一致）
 *
 * 验证命令（待 Tauri 编译网络恢复）：
 *   pnpm drizzle-kit check   # 检查 schema 一致性
 *   pnpm drizzle-kit generate # 生成 migration
 */

import type { Config } from 'drizzle-kit'

export default {
  schema: './src/database/schema.ts',
  out: '../database/migrations',
  dialect: 'sqlite',
  // 不使用 Drizzle 的 SQLite driver（我们用 Tauri + rusqlite）
  // 只用 drizzle-kit 生成 SQL 迁移文件
  verbose: true,
  strict: true,
} satisfies Config