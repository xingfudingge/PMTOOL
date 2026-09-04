/**
 * Vitest 测试 setup
 * Phase 0 · T0.4d
 *
 * 职责：
 *   - Mock Tauri invoke（不依赖真实 Tauri runtime）
 *   - Mock fetch（schema.sql 不再从 WebView fetch）
 */

import { vi, beforeEach, afterEach } from 'vitest'

// Mock @tauri-apps/api/core（所有 WebView 端 DB 访问都通过 invoke）
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (_cmd: string, _args?: unknown) => {
    // 默认 mock：返回空数据 · 实际测试用例可用 vi.mocked(invoke).mockResolvedValueOnce 覆盖
    return []
  }),
}))

// 全局 beforeEach：清理 mock
beforeEach(() => {
  vi.clearAllMocks()
})

// 全局 afterEach：清理
afterEach(() => {
  vi.restoreAllMocks()
})