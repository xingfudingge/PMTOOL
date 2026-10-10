/**
 * PMTool · 消息中心「删除必须二次确认」回归测试（2026-09-20）
 *
 * 产品规则（维护者定）：**这个软件所有的删除都要有二次确认**。
 *
 * 背景：消息中心的「删除单条消息」「清空已读」两个破坏性操作首版漏做确认，
 *       点一下就直接真删（后端是 `DELETE FROM`，无软删除、不可恢复），违反既定产品规则。
 *
 * 本测试用「读源码结构断言」锁死该规则（vitest 默认 node 环境，无 DOM；
 * 与 AiDeleteConfirm.test.tsx 同一套路）。
 */

// @vitest-environment node
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf-8')

const page = read('MessageCenterPage.tsx')

/** 取出目标附近的代码块（前后都取，不依赖 JSX 属性书写顺序） */
function blockAround(src: string, marker: string, before = 320, after = 320): string {
  const i = src.indexOf(marker)
  if (i === -1) return ''
  return src.slice(Math.max(0, i - before), i + after)
}

describe('消息中心 · 删除必须二次确认（产品规则回归）', () => {
  it('删除单条消息：先确认后删', () => {
    const block = blockAround(page, 'data-testid="msg-delete"')
    expect(block, '删除按钮必须存在').not.toBe('')
    expect(block, '必须先进确认态').toContain('handleDelete')
    // 点击按钮不得直接调后端删除
    expect(block, '不得在按钮里直接删除').not.toContain('deleteMessage(')
  })

  it('handleDelete 只进确认态，真正删除在 confirmDelete 里', () => {
    const enter = blockAround(page, 'const handleDelete =', 0, 220)
    expect(enter, 'handleDelete 必须设置确认态').toContain('setPendingDelete')
    expect(enter, 'handleDelete 不得直接删库').not.toContain('await deleteMessage')

    const confirm = blockAround(page, 'const confirmDelete =', 0, 420)
    expect(confirm, '确认后才真正删除').toContain('await deleteMessage')
  })

  it('清空已读消息：先确认后清空', () => {
    // 窗口只覆盖 handleClearRead 自身的函数体（不得越界到 confirmClearRead）
    const enter = blockAround(page, 'const handleClearRead =', 0, 60)
    expect(enter, 'handleClearRead 必须设置确认态').toContain('setPendingClearRead')
    expect(enter, 'handleClearRead 不得直接清库').not.toContain('await clearRead')

    const confirm = blockAround(page, 'const confirmClearRead =', 0, 420)
    expect(confirm, '确认后才真正清空').toContain('await clearRead')
  })

  it('两个破坏性操作都必须渲染统一的 ConfirmDialog（含「不可撤销」告知）', () => {
    expect(page).toContain("from '@/components/ConfirmDialog'")
    expect((page.match(/<ConfirmDialog/g) || []).length).toBeGreaterThanOrEqual(2)
    expect(page).toContain('该操作不可撤销')
  })
})
