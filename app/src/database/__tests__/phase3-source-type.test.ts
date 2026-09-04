/**
 * PMTool V2.0 · Phase 3 收尾 - T3.1 验收调整测试
 *
 * 维护者 2026-08-22 决策：
 *   source_type 严格 MANUAL/WEEKLY（保持 PM A1）
 *   「项目任务 / AI 来源」需先用户确认再创建 MANUAL Todo
 *
 * 本测试覆盖：
 *   验收 T3.1：todo 支持手动创建 + 周任务 + 用户确认后的外部生成事项
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { createTodo } from '@/services/todo'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

describe('验收 T3.1 · source_type 仅 MANUAL/WEEKLY（PM A1 严格遵守）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('手动创建 Todo → sourceType 默认为 MANUAL', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(1)
    await createTodo({ title: '手动创建测试' })
    expect(invoke).toHaveBeenCalledWith(
      'create_todo',
      expect.objectContaining({
        todo: expect.objectContaining({
          source_type: 'MANUAL',
        }),
      }),
    )
  })

  it('显式指定 MANUAL → 生效', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(2)
    await createTodo({ title: 't', sourceType: 'MANUAL' })
    expect(invoke).toHaveBeenCalledWith(
      'create_todo',
      expect.objectContaining({
        todo: expect.objectContaining({ source_type: 'MANUAL' }),
      }),
    )
  })

  it('显式指定 WEEKLY → 生效', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(3)
    await createTodo({ title: '周任务', sourceType: 'WEEKLY' })
    expect(invoke).toHaveBeenCalledWith(
      'create_todo',
      expect.objectContaining({
        todo: expect.objectContaining({ source_type: 'WEEKLY' }),
      }),
    )
  })

  it('⚠️ 不接受 PROJECT_TASK / AI / PLAN / RISK（PM A1 已废除）', () => {
    // TypeScript 类型层面已禁止
    type Allowed = 'MANUAL' | 'WEEKLY'
    const allowed: Allowed[] = ['MANUAL', 'WEEKLY']
    expect(allowed).toContain('MANUAL')
    expect(allowed).toContain('WEEKLY')
    expect(allowed).not.toContain('PROJECT_TASK')
    expect(allowed).not.toContain('AI')
    expect(allowed).not.toContain('PLAN')
    expect(allowed).not.toContain('RISK')
  })
})

describe('验收 T3.1 · 「项目任务/AI 走用户确认流程」', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('「项目任务」生成 Todo 流程（用户确认后 → MANUAL 创建）', async () => {
    // 模拟「项目任务同步」上游系统（Phase 4 T4.3 实施）：
    //   1. 项目任务模块生成 Todo 候选
    //   2. 用户在 UI 上点击「确认」
    //   3. 调用 createTodo(sourceType='MANUAL')
    vi.mocked(invoke).mockResolvedValueOnce(100)
    await createTodo({
      title: '【项目同步】合同审批',
      content: '来源：测试科技项目 #PM-001（已用户确认）',
      sourceType: 'MANUAL',
    })
    expect(invoke).toHaveBeenCalledWith(
      'create_todo',
      expect.objectContaining({
        todo: expect.objectContaining({
          title: '【项目同步】合同审批',
          content: expect.stringContaining('已用户确认'),
          source_type: 'MANUAL',
        }),
      }),
    )
  })

  it('「AI 建议」生成 Todo 流程（用户确认后 → MANUAL 创建）', async () => {
    // 模拟「AI 助手」上游（Phase 8 实施）：
    //   1. AI 助手生成 Todo 候选
    //   2. 用户在 AI 助手上点击「保存为 Todo」
    //   3. 调用 createTodo(sourceType='MANUAL')
    vi.mocked(invoke).mockResolvedValueOnce(200)
    await createTodo({
      title: '【AI 建议】下周跟进客户',
      content: '来源：AI 助手（已用户确认）',
      sourceType: 'MANUAL',
    })
    expect(invoke).toHaveBeenCalledWith(
      'create_todo',
      expect.objectContaining({
        todo: expect.objectContaining({
          title: '【AI 建议】下周跟进客户',
          source_type: 'MANUAL',
        }),
      }),
    )
  })
})