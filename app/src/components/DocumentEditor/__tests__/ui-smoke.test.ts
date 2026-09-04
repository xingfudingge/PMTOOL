/**
 * PMTool · UI smoke 测试（维护者 2026-08-31 修复换行污染）
 *
 * 模拟 UI 实际保存流程：
 *   1. 读 .md 文件 → markdownToBlocks（BlockNote parser）
 *   2. blocks → blocksToMarkdownString（PMTool 自定义 serializer）
 *   3. 写回原文件
 *   4. 比对：文件不应该有 \ 字符污染
 *
 * 维护者 2026-08-31 原始症状：打开 .md 编辑保存后，每行末尾出现 \
 * 这个测试就是要确保这条链路不会再产生 \
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest'
// @ts-expect-error - jsdom 没有 @types/jsdom
import { JSDOM } from 'jsdom'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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

describe('UI smoke：完整 read/parse/serialize/write 链路', () => {
  let tmpDir: string
  let editor: any

  beforeAll(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'pmtool-md-smoke-'))
    const { BlockNoteEditor } = await import('@blocknote/core')
    editor = BlockNoteEditor.create({})
  })

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('真实文件 round-trip 后无 \\ 污染', async () => {
    const { markdownToBlocks } = await import('@blocknote/core')

    // 维护者 2026-08-31 实际遇到的 .md 文件内容（用户编写的多行段落）
    const originalContent = `# 项目说明

这是第一段。
这里是第一段的第二行。
这里是第一段的第三行。

这是第二段，只有一行。

## 子章节

- 待办事项 1
- 待办事项 2
- 待办事项 3

\`\`\`python
def hello():
    print("Hello, World!")
\`\`\`

> 重要提示：
> 请勿删除此文件

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id   | int  | 主键 |
| name | str  | 名称 |
`

    const filePath = join(tmpDir, 'project-notes.md')
    writeFileSync(filePath, originalContent, 'utf8')

    // === 模拟 UI 流程 ===

    // 1. MarkdownEditor 用 readTextFileWithMtime 读文件
    const readContent = readFileSync(filePath, 'utf8')
    expect(readContent).toBe(originalContent)

    // 2. markdownToBlocks（BlockNote parser）
    const blocks = markdownToBlocks(readContent, editor.pmSchema)

    // 3. blocksToMarkdownString（PMTool 自定义 serializer）
    const serialized = blocksToMarkdownString(blocks as any)

    // 4. 写回原文件（这一步只发生在 dirty=true 的情况）
    writeFileSync(filePath, serialized, 'utf8')

    // === 验证 ===

    const finalContent = readFileSync(filePath, 'utf8')

    // 核心断言：行末不出现 \
    expect(finalContent, `污染内容: ${JSON.stringify(finalContent)}`).not.toContain('\\')

    // 内容保留
    expect(finalContent).toContain('项目说明')
    expect(finalContent).toContain('这是第一段')
    expect(finalContent).toContain('这里是第一段的第二行')
    expect(finalContent).toContain('这里是第一段的第三行')
    expect(finalContent).toContain('这是第二段，只有一行')
    expect(finalContent).toContain('待办事项 1')
    expect(finalContent).toContain('待办事项 2')
    expect(finalContent).toContain('待办事项 3')
    expect(finalContent).toContain('def hello')
    expect(finalContent).toContain('print')
    expect(finalContent).toContain('重要提示')
    expect(finalContent).toContain('请勿删除此文件')
    expect(finalContent).toContain('主键')
    expect(finalContent).toContain('名称')

    // 行尾 \n（无 \r）
    expect(finalContent).not.toContain('\r')

    // 末尾保证 \n
    expect(finalContent.endsWith('\n')).toBe(true)

    console.log('--- 原始文件 ---')
    console.log(originalContent)
    console.log('--- 修复后导出 ---')
    console.log(serialized)
    console.log('--- 最终文件 ---')
    console.log(finalContent)
  })

  it('真正硬换行文件 round-trip 也无 \\ 污染', async () => {
    const { markdownToBlocks } = await import('@blocknote/core')

    // 用 markdown 硬换行（两个尾空格 + \n）测试
    const input = `第一段强制换行  \n第二行（硬换行）\n\n正常段落\n`

    const filePath = join(tmpDir, 'hard-break.md')
    writeFileSync(filePath, input, 'utf8')

    const readContent = readFileSync(filePath, 'utf8')
    const blocks = markdownToBlocks(readContent, editor.pmSchema)
    const serialized = blocksToMarkdownString(blocks as any)

    // 即使有硬换行，也不应该在文本末尾加 \
    expect(serialized).not.toMatch(/[^\\]\\$/) // 行末不出现 \
    expect(serialized).not.toMatch(/[^\\]\\\n/) // 行末不出现 \ 后跟换行
  })

  it('特殊 markdown 语法 round-trip 干净', async () => {
    const { markdownToBlocks } = await import('@blocknote/core')

    const input = `**粗体** 和 *斜体* 和 \`代码\`

链接：[PMTool](https://pmtool.com)

图片：![alt text](image.png)

数学：$E = mc^2$
`

    const filePath = join(tmpDir, 'syntax.md')
    writeFileSync(filePath, input, 'utf8')

    const readContent = readFileSync(filePath, 'utf8')
    const blocks = markdownToBlocks(readContent, editor.pmSchema)
    const serialized = blocksToMarkdownString(blocks as any)

    expect(serialized).not.toContain('\\')
    // 内容保留（不完全一致也算 OK，因为我们只关心无污染）
    expect(serialized).toContain('粗体')
    expect(serialized).toContain('斜体')
    expect(serialized).toContain('代码')
    expect(serialized).toContain('PMTool')
  })
})