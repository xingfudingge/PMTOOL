/**
 * Vitest 配置
 * Phase 0 · T0.4d · 自动化测试基建
 *
 * 设计依据：
 *   - PM 决策 C1：每个任务完成必须提供「自动化测试结果」
 *   - RFC-02 §6：3 个验收样例（Given-When-Then）
 *
 * 测试范围（Phase 0）：
 *   - schema.test.ts：验证 schema.sql 与 schema.ts 三方一致
 *   - api.test.ts：业务 API 包装类型正确性
 *   - mocks/tauri.ts：Tauri invoke mock
 *
 * 验证命令（待 Tauri 编译网络恢复）：
 *   pnpm test           # 单次跑
 *   pnpm test:watch     # 监听模式
 *   pnpm test:coverage  # 覆盖率
 */

import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist', 'src-tauri'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/**/*.{test,spec}.{ts,tsx}', 'src/database/__tests__/**'],
    },
    setupFiles: ['./src/database/__tests__/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})