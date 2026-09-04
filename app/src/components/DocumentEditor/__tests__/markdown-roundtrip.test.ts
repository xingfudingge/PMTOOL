/**
 * PMTool · 端到端 markdown round-trip 测试（维护者 2026-08-31）
 *
 * 用真实的 BlockNote editor 做：
 *   1. markdown → blocks（用 BlockNote 自带 parser，模拟打开文件）
 *   2. blocks → markdown（用 PMTool 自定义 serializer，模拟保存）
 *   3. 关键断言：所有 \\n 形式硬换行都不应该污染文件
 */

import { describe, expect, it } from 'vitest'
// @ts-expect-error - jsdom 没有 @types/jsdom，运行时 OK
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>')
;(globalThis as any).document = dom.window.document
;(globalThis as any).window = dom.window
;(globalThis as any).HTMLElement = dom.window.HTMLElement
;(globalThis as any).Node = dom.window.Node
;(globalThis as any).Element = dom.window.Element
;(globalThis as any).DocumentFragment = dom.window.DocumentFragment
;(globalThis as any).Range = dom.window.Range
;(globalThis as any).getComputedStyle = dom.window.getComputedStyle

import { blocksToMarkdownString } from '../blocksToMarkdownString'

describe('端到端：BlockNote parse → 自定义 serialize', () => {
  it('原 Bug 复现 → 自定义 serializer 不再产生 \\', async () => {
    const { markdownToBlocks, BlockNoteEditor } = await import('@blocknote/core')

    const editor: any = BlockNoteEditor.create({})

    const inputs = [
      'line1\nline2',
      '# 标题\n\n第一段第一行\n第一段第二行\n\n- 列表 1\n- 列表 2',
      '> 引用行 1\n> 引用行 2',
      '```js\nconst x = 1;\n```',
      '| A | B |\n| --- | --- |\n| 1 | 2 |',
    ]

    for (const md of inputs) {
      const blocks = markdownToBlocks(md, editor.pmSchema)
      const out = blocksToMarkdownString(blocks as any)
      // 核心断言：行末不出现 \
      expect(out, `input=${JSON.stringify(md)}\noutput=${JSON.stringify(out)}`).not.toContain('\\')
    }
  })

  it('多行段落 round-trip 后内容保留', async () => {
    const { markdownToBlocks, BlockNoteEditor } = await import('@blocknote/core')
    const editor: any = BlockNoteEditor.create({})

    const input = `第一段第一行
第一段第二行`
    const blocks = markdownToBlocks(input, editor.pmSchema)
    const out = blocksToMarkdownString(blocks as any)
    expect(out).toContain('第一段第一行')
    expect(out).toContain('第一段第二行')
    expect(out).not.toContain('\\')
  })

  it('\\r\\n 输入 → 输出 \\n', async () => {
    const { markdownToBlocks, BlockNoteEditor } = await import('@blocknote/core')
    const editor: any = BlockNoteEditor.create({})

    const input = 'line1\r\nline2'
    const blocks = markdownToBlocks(input, editor.pmSchema)
    const out = blocksToMarkdownString(blocks as any)
    expect(out).not.toContain('\r')
  })

  it('引用 + 多行内容保留', async () => {
    const { markdownToBlocks, BlockNoteEditor } = await import('@blocknote/core')
    const editor: any = BlockNoteEditor.create({})

    const input = `> 引用行 1
> 引用行 2`
    const blocks = markdownToBlocks(input, editor.pmSchema)
    const out = blocksToMarkdownString(blocks as any)
    expect(out).toContain('> 引用行 1')
    expect(out).toContain('> 引用行 2')
    expect(out).not.toContain('\\')
  })

  it('代码块 round-trip 内容完整', async () => {
    const { markdownToBlocks, BlockNoteEditor } = await import('@blocknote/core')
    const editor: any = BlockNoteEditor.create({})

    const input = '```js\nconst x = 1;\nconst y = 2;\n```'
    const blocks = markdownToBlocks(input, editor.pmSchema)
    const out = blocksToMarkdownString(blocks as any)
    expect(out).toContain('```')
    expect(out).toContain('const x = 1;')
    expect(out).toContain('const y = 2;')
    expect(out).not.toContain('\\')
  })

  it('表格 round-trip 内容完整', async () => {
    const { markdownToBlocks, BlockNoteEditor } = await import('@blocknote/core')
    const editor: any = BlockNoteEditor.create({})

    const input = `| A | B |
| --- | --- |
| 1 | 2 |`
    const blocks = markdownToBlocks(input, editor.pmSchema)
    const out = blocksToMarkdownString(blocks as any)
    expect(out).toContain('A')
    expect(out).toContain('B')
    expect(out).toContain('1')
    expect(out).toContain('2')
    expect(out).toContain('---')
    expect(out).not.toContain('\\')
  })

  it('列表 round-trip 内容完整', async () => {
    const { markdownToBlocks, BlockNoteEditor } = await import('@blocknote/core')
    const editor: any = BlockNoteEditor.create({})

    const input = `- 列表项 1
- 列表项 2
- 列表项 3`
    const blocks = markdownToBlocks(input, editor.pmSchema)
    const out = blocksToMarkdownString(blocks as any)
    expect(out).toContain('列表项 1')
    expect(out).toContain('列表项 2')
    expect(out).toContain('列表项 3')
    expect(out).not.toContain('\\')
  })
})