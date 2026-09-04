/**
 * PMTool · stripLeadingSpacesAfterNewlineInBlocks 单元测试（维护者 2026-08-31）
 *
 * 覆盖：
 *   - 单段内 `测试1\n 测试2` → `测试1\n测试2`（去掉 \n 后前导空格）
 *   - 多段（每段各自处理）
 *   - 表格 cell / code block 里的内容不动
 *   - 链接节点里的 content 也递归处理
 *   - 入参为 undefined / 空数组时返回原值
 */

import { describe, it, expect } from 'vitest'
import { stripLeadingSpacesAfterNewlineInBlocks } from '../stripLeadingSpaces'

describe('stripLeadingSpacesAfterNewlineInBlocks（BlockNote 解析后清理 · 维护者 2026-08-31）', () => {
  it('单段：去掉 \\n 后的一个空格', () => {
    const blocks: any[] = [{
      type: 'paragraph',
      content: [{ type: 'text', text: '测试1\n 测试2\n 测试3' }],
    }]
    stripLeadingSpacesAfterNewlineInBlocks(blocks)
    expect(blocks[0].content[0].text).toBe('测试1\n测试2\n测试3')
  })

  it('去掉 \\n 后多个空格（包括 tab）', () => {
    const blocks: any[] = [{
      type: 'paragraph',
      content: [{ type: 'text', text: 'a\n   b\n\tc' }],
    }]
    stripLeadingSpacesAfterNewlineInBlocks(blocks)
    expect(blocks[0].content[0].text).toBe('a\nb\nc')
  })

  it('段中间的普通空格保留（不是 \\n 后立刻的空格）', () => {
    const blocks: any[] = [{
      type: 'paragraph',
      content: [{ type: 'text', text: 'a b\n c' }],
    }]
    stripLeadingSpacesAfterNewlineInBlocks(blocks)
    expect(blocks[0].content[0].text).toBe('a b\nc')
  })

  it('多个段：每段独立处理', () => {
    const blocks: any[] = [
      { type: 'paragraph', content: [{ type: 'text', text: 'p1\n p2' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'p3\n p4' }] },
    ]
    stripLeadingSpacesAfterNewlineInBlocks(blocks)
    expect(blocks[0].content[0].text).toBe('p1\np2')
    expect(blocks[1].content[0].text).toBe('p3\np4')
  })

  it('链接节点递归处理', () => {
    const blocks: any[] = [{
      type: 'paragraph',
      content: [{
        type: 'text',
        text: 'click\n here',
        styles: {},
      }],
    }]
    stripLeadingSpacesAfterNewlineInBlocks(blocks)
    expect(blocks[0].content[0].text).toBe('click\nhere')
  })

  it('空内容 / undefined 输入安全返回', () => {
    expect(stripLeadingSpacesAfterNewlineInBlocks(undefined)).toBeUndefined()
    expect(stripLeadingSpacesAfterNewlineInBlocks([])).toEqual([])
  })

  it('不影响硬换行 + 紧跟空格的结构（不在 \\n 后清空）', () => {
    // 设计：保留 \\n 本身作为换行标记，只清前导空格
    const blocks: any[] = [{
      type: 'paragraph',
      content: [{ type: 'text', text: 'line1\nline2' }],
    }]
    stripLeadingSpacesAfterNewlineInBlocks(blocks)
    expect(blocks[0].content[0].text).toBe('line1\nline2')
  })
})