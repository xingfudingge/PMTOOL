/**
 * PMTool · 文件级 markdown round-trip 测试（维护者 2026-08-31）
 *
 * 模拟 UI 实际流程：
 *   1. 创建一个 .md 文件（含多行段落、列表、代码块、引用、表格）
 *   2. 读取文件 → markdownToBlocks → blocksToMarkdownString → 写回
 *   3. 验证：写回后内容保留、没有出现 \、行尾是 \n
 *
 * 这是关键回归测试 —— 用户最初反馈"打开 .md 编辑保存后每行末尾出现 \"
 * 这个测试模拟用户没编辑的情况，验证文档没有被破坏
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest'
// @ts-expect-error - jsdom 没有 @types/jsdom
import { JSDOM } from 'jsdom'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// @ts-expect-error - jsdom 没有 @types/jsdom
import { JSDOM as JSDOMCtor } from 'jsdom'
const dom = new JSDOMCtor('<!DOCTYPE html><html><body></body></html>')
;(globalThis as any).document = dom.window.document
;(globalThis as any).window = dom.window
;(globalThis as any).HTMLElement = dom.window.HTMLElement
;(globalThis as any).Node = dom.window.Node
;(globalThis as any).Element = dom.window.Element
;(globalThis as any).DocumentFragment = dom.window.DocumentFragment
;(globalThis as any).Range = dom.window.Range
;(globalThis as any).getComputedStyle = dom.window.getComputedStyle

import { blocksToMarkdownString } from '../blocksToMarkdownString'

describe('文件级 markdown round-trip（核心回归）', () => {
  let tmpDir: string
  let editor: any

  beforeAll(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'pmtool-md-test-'))
    const { BlockNoteEditor } = await import('@blocknote/core')
    editor = BlockNoteEditor.create({})
  })

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('多行段落 .md 文件 read/save  round-trip 干净', async () => {
    const { markdownToBlocks } = await import('@blocknote/core')

    const input = `# 测试文档

第一段第一行
第一段第二行
第一段第三行

第二段只有一行

- 列表项 1
- 列表项 2

> 引用第一行
> 引用第二行

\`\`\`js
const x = 1;
const y = 2;
\`\`\`

| 列 1 | 列 2 |
| --- | --- |
| a   | b   |
`
    const file = join(tmpDir, 'multi-line.md')
    writeFileSync(file, input, 'utf8')

    // 模拟 UI 流程：读文件 → 解析 → 序列化
    const readContent = readFileSync(file, 'utf8')
    const blocks = markdownToBlocks(readContent, editor.pmSchema)
    const outContent = blocksToMarkdownString(blocks as any)

    console.log('原文件:', JSON.stringify(readContent))
    console.log('导出:', JSON.stringify(outContent))

    // 核心断言：行末不出现 \
    expect(outContent).not.toContain('\\')

    // 内容应该保留（虽然格式可能略有差异，例如列表标记、表格 padding）
    expect(outContent).toContain('第一段第一行')
    expect(outContent).toContain('第一段第二行')
    expect(outContent).toContain('第一段第三行')
    expect(outContent).toContain('第二段只有一行')
    expect(outContent).toContain('列表项 1')
    expect(outContent).toContain('列表项 2')
    expect(outContent).toContain('引用第一行')
    expect(outContent).toContain('引用第二行')
    expect(outContent).toContain('const x = 1;')
    expect(outContent).toContain('const y = 2;')
    expect(outContent).toContain('a')
    expect(outContent).toContain('b')

    // 行尾应该是 \n（无 \r）
    expect(outContent).not.toContain('\r')
  })

  it('\\r\\n 行尾 .md 文件 round-trip → \\n 行尾', async () => {
    const { markdownToBlocks } = await import('@blocknote/core')

    const input = 'line1\r\nline2\r\nline3\r\n'
    const file = join(tmpDir, 'crlf.md')
    writeFileSync(file, input, 'utf8')

    const readContent = readFileSync(file, 'utf8')
    const blocks = markdownToBlocks(readContent, editor.pmSchema)
    const outContent = blocksToMarkdownString(blocks as any)

    expect(outContent).not.toContain('\r')
    expect(outContent).not.toContain('\\')
    expect(outContent).toContain('line1')
    expect(outContent).toContain('line2')
    expect(outContent).toContain('line3')
  })

  it('空段连续 .md 文件 round-trip 内容保留', async () => {
    const { markdownToBlocks } = await import('@blocknote/core')

    const input = `para1


para2
`
    const file = join(tmpDir, 'blank.md')
    writeFileSync(file, input, 'utf8')

    const readContent = readFileSync(file, 'utf8')
    const blocks = markdownToBlocks(readContent, editor.pmSchema)
    const outContent = blocksToMarkdownString(blocks as any)

    expect(outContent).not.toContain('\\')
    expect(outContent).toContain('para1')
    expect(outContent).toContain('para2')
    // 不应该有 3+ 个连续 \n
    expect(outContent).not.toContain('\n\n\n')
  })

  it('二级标题 + 段落 round-trip 干净', async () => {
    const { markdownToBlocks } = await import('@blocknote/core')

    const input = `## 二级标题

段落内容
继续段落
`
    const file = join(tmpDir, 'h2.md')
    writeFileSync(file, input, 'utf8')

    const readContent = readFileSync(file, 'utf8')
    const blocks = markdownToBlocks(readContent, editor.pmSchema)
    const outContent = blocksToMarkdownString(blocks as any)

    expect(outContent).not.toContain('\\')
    expect(outContent).toContain('## 二级标题')
    expect(outContent).toContain('段落内容')
    expect(outContent).toContain('继续段落')
  })
})