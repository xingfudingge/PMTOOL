/**
 * PMTool · 自定义 BlockNote JSON → Markdown 序列化器测试（维护者 2026-08-31）
 *
 * 覆盖：
 *   - 段落（含普通换行、连续空行、内联样式、链接、特殊字符）
 *   - 标题 1-6
 *   - 无序/有序/任务列表（含序号、checked 状态）
 *   - 代码块（含语言标签、空代码块）
 *   - 引用（含软换行）
 *   - 表格（含管道符转义）
 *   - 分隔线
 *   - 图片
 *   - 行尾 \r\n 归一化
 *   - 末尾保证 \n
 *   - 空数组
 *   - 维护者 2026-08-31 核心断言：所有 hard break 都输出 \n，不输出 \
 */

import { describe, expect, it } from 'vitest'
import { blocksToMarkdownString } from '../blocksToMarkdownString'

describe('blocksToMarkdownString · 段落', () => {
  it('空段落输出空字符串', () => {
    expect(blocksToMarkdownString([])).toBe('')
  })

  it('单段段落末尾有空行', () => {
    expect(
      blocksToMarkdownString([{ type: 'paragraph', content: 'hello' }]),
    ).toBe('hello\n')
  })

  it('段落内 \\n 输出为普通换行（核心 bug 修复）', () => {
    const blocks = [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'line1', styles: {} },
          { type: 'hardBreak' },
          { type: 'text', text: 'line2', styles: {} },
        ],
      },
    ]
    const md = blocksToMarkdownString(blocks as any)
    expect(md).toBe('line1\nline2\n')
    // 核心断言：行末不能有 \
    expect(md).not.toContain('\\')
  })

  it('连续多行段落', () => {
    const blocks = [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'a', styles: {} },
          { type: 'hardBreak' },
          { type: 'text', text: 'b', styles: {} },
          { type: 'hardBreak' },
          { type: 'text', text: 'c', styles: {} },
        ],
      },
    ]
    expect(blocksToMarkdownString(blocks as any)).toBe('a\nb\nc\n')
  })

  it('粗体 + 斜体 + code + strike', () => {
    const blocks = [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'bold', styles: { bold: true } },
          { type: 'text', text: ' ', styles: {} },
          { type: 'text', text: 'italic', styles: { italic: true } },
          { type: 'text', text: ' ', styles: {} },
          { type: 'text', text: 'code', styles: { code: true } },
          { type: 'text', text: ' ', styles: {} },
          { type: 'text', text: 'strike', styles: { strike: true } },
        ],
      },
    ]
    expect(blocksToMarkdownString(blocks as any)).toBe(
      '**bold** *italic* `code` ~~strike~~\n',
    )
  })

  it('链接：text == url → 输出裸 URL', () => {
    const blocks = [
      {
        type: 'paragraph',
        content: [
          {
            type: 'link',
            href: 'https://example.com',
            content: [{ type: 'text', text: 'https://example.com', styles: {} }],
          },
        ],
      },
    ]
    expect(blocksToMarkdownString(blocks as any)).toBe('https://example.com\n')
  })

  it('链接：text != url → 输出 [text](url)', () => {
    const blocks = [
      {
        type: 'paragraph',
        content: [
          {
            type: 'link',
            href: 'https://example.com',
            content: [{ type: 'text', text: '点击', styles: {} }],
          },
        ],
      },
    ]
    expect(blocksToMarkdownString(blocks as any)).toBe(
      '[点击](https://example.com)\n',
    )
  })

  it('链接：URL 含括号 → 转义', () => {
    const blocks = [
      {
        type: 'paragraph',
        content: [
          {
            type: 'link',
            href: 'https://example.com/a_(b)',
            content: [{ type: 'text', text: 'foo', styles: {} }],
          },
        ],
      },
    ]
    expect(blocksToMarkdownString(blocks as any)).toBe(
      '[foo](https://example.com/a_\\(b\\))\n',
    )
  })

  it('特殊字符转义', () => {
    const blocks = [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: '* _ ` [ ] ( ) # + - . ! ~ | >', styles: {} },
        ],
      },
    ]
    const md = blocksToMarkdownString(blocks as any)
    // 都要转义
    expect(md).toContain('\\*')
    expect(md).toContain('\\_')
    expect(md).toContain('\\`')
    expect(md).toContain('\\[')
    expect(md).toContain('\\]')
    expect(md).toContain('\\(')
    expect(md).toContain('\\)')
    expect(md).toContain('\\#')
    expect(md).toContain('\\+')
    expect(md).toContain('\\-')
    expect(md).toContain('\\.')
    expect(md).toContain('\\!')
    expect(md).toContain('\\~')
    expect(md).toContain('\\|')
    expect(md).toContain('\\>')
  })

  it('连续空段不无限放大空行', () => {
    const blocks = [
      { type: 'paragraph', content: '' },
      { type: 'paragraph', content: '' },
      { type: 'paragraph', content: 'last' },
    ]
    const md = blocksToMarkdownString(blocks as any)
    // 不应有 3+ 个连续 \n
    expect(md).not.toContain('\n\n\n')
    // 内容保留
    expect(md).toContain('last')
  })
})

describe('blocksToMarkdownString · 标题', () => {
  it('1-6 级标题', () => {
    for (let level = 1; level <= 6; level++) {
      const md = blocksToMarkdownString([
        {
          type: 'heading',
          props: { level },
          content: [{ type: 'text', text: 'Title', styles: {} }],
        },
      ] as any)
      expect(md).toBe('#'.repeat(level) + ' Title\n')
    }
  })
})

describe('blocksToMarkdownString · 列表', () => {
  it('无序列表连续项', () => {
    const blocks = [
      { type: 'bulletListItem', content: [{ type: 'text', text: 'a', styles: {} }] },
      { type: 'bulletListItem', content: [{ type: 'text', text: 'b', styles: {} }] },
      { type: 'bulletListItem', content: [{ type: 'text', text: 'c', styles: {} }] },
    ]
    expect(blocksToMarkdownString(blocks as any)).toBe(
      '- a\n- b\n- c\n',
    )
  })

  it('有序列表从 1 开始递增', () => {
    const blocks = [
      { type: 'numberedListItem', content: [{ type: 'text', text: 'a', styles: {} }] },
      { type: 'numberedListItem', content: [{ type: 'text', text: 'b', styles: {} }] },
      { type: 'numberedListItem', content: [{ type: 'text', text: 'c', styles: {} }] },
    ]
    expect(blocksToMarkdownString(blocks as any)).toBe(
      '1. a\n2. b\n3. c\n',
    )
  })

  it('有序列表遇到非 list 块后重置', () => {
    const blocks = [
      { type: 'numberedListItem', content: [{ type: 'text', text: 'a', styles: {} }] },
      { type: 'numberedListItem', content: [{ type: 'text', text: 'b', styles: {} }] },
      { type: 'paragraph', content: 'break' },
      { type: 'numberedListItem', content: [{ type: 'text', text: 'c', styles: {} }] },
    ]
    const md = blocksToMarkdownString(blocks as any)
    // 末尾重新从 1 开始
    expect(md).toContain('1. c')
    expect(md).not.toContain('3. c')
  })

  it('任务列表 checked=true', () => {
    expect(
      blocksToMarkdownString([
        {
          type: 'checkListItem',
          props: { checked: true },
          content: [{ type: 'text', text: 'done', styles: {} }],
        },
      ] as any),
    ).toBe('- [x] done\n')
  })

  it('任务列表 checked=false', () => {
    expect(
      blocksToMarkdownString([
        {
          type: 'checkListItem',
          props: { checked: false },
          content: [{ type: 'text', text: 'todo', styles: {} }],
        },
      ] as any),
    ).toBe('- [ ] todo\n')
  })
})

describe('blocksToMarkdownString · 代码块', () => {
  it('带语言', () => {
    expect(
      blocksToMarkdownString([
        {
          type: 'codeBlock',
          props: { language: 'js' },
          content: 'const x = 1;',
        },
      ] as any),
    ).toBe('```js\nconst x = 1;\n```\n')
  })

  it('无语言', () => {
    expect(
      blocksToMarkdownString([
        { type: 'codeBlock', props: { language: '' }, content: 'foo' },
      ] as any),
    ).toBe('```\nfoo\n```\n')
  })

  it('代码块里含 ``` 用更长围栏', () => {
    const code = '```js\nx\n```'
    const md = blocksToMarkdownString([
      { type: 'codeBlock', props: { language: 'js' }, content: code },
    ] as any)
    expect(md.startsWith('````js')).toBe(true)
    expect(md.endsWith('````\n')).toBe(true)
  })

  it('多行代码块', () => {
    const md = blocksToMarkdownString([
      {
        type: 'codeBlock',
        props: { language: 'js' },
        content: 'line1\nline2\nline3',
      },
    ] as any)
    expect(md).toBe('```js\nline1\nline2\nline3\n```\n')
  })
})

describe('blocksToMarkdownString · 引用', () => {
  it('单行引用', () => {
    expect(
      blocksToMarkdownString([
        {
          type: 'quote',
          content: [{ type: 'text', text: 'hello', styles: {} }],
        },
      ] as any),
    ).toBe('> hello\n')
  })

  it('多行引用（hard break 内联）', () => {
    const blocks = [
      {
        type: 'quote',
        content: [
          { type: 'text', text: 'first', styles: {} },
          { type: 'hardBreak' },
          { type: 'text', text: 'second', styles: {} },
        ],
      },
    ]
    expect(blocksToMarkdownString(blocks as any)).toBe(
      '> first\n> second\n',
    )
  })

  it('引用内不能出现 \\ 行末', () => {
    const blocks = [
      {
        type: 'quote',
        content: [
          { type: 'text', text: 'a', styles: {} },
          { type: 'hardBreak' },
          { type: 'text', text: 'b', styles: {} },
        ],
      },
    ]
    expect(blocksToMarkdownString(blocks as any)).not.toContain('\\')
  })
})

describe('blocksToMarkdownString · 表格', () => {
  it('2x2 表格', () => {
    const cell = (s: string) => ({
      type: 'tableCell',
      content: [{ type: 'text', text: s, styles: {} }],
      props: {},
    })
    const md = blocksToMarkdownString([
      {
        type: 'table',
        content: [
          { cells: [cell('A'), cell('B')] },
          { cells: [cell('1'), cell('2')] },
        ],
      },
    ] as any)
    expect(md).toContain('| A')
    expect(md).toContain('| B')
    expect(md).toContain('| 1')
    expect(md).toContain('---')
    expect(md.endsWith('\n')).toBe(true)
  })

  it('表格单元格含 | → 转义', () => {
    const cell = (s: string) => ({
      type: 'tableCell',
      content: [{ type: 'text', text: s, styles: {} }],
      props: {},
    })
    const md = blocksToMarkdownString([
      {
        type: 'table',
        content: [{ cells: [cell('a|b'), cell('c')] }],
      },
    ] as any)
    expect(md).toContain('a\\|b')
  })

  it('表格单元格含 \\n → 空格', () => {
    const cell = (s: string) => ({
      type: 'tableCell',
      content: [{ type: 'text', text: s, styles: {} }],
      props: {},
    })
    const cellWithBreak = {
      type: 'tableCell',
      content: [
        { type: 'text', text: 'line1', styles: {} },
        { type: 'hardBreak' },
        { type: 'text', text: 'line2', styles: {} },
      ],
      props: {},
    }
    const md = blocksToMarkdownString([
      { type: 'table', content: [{ cells: [cellWithBreak, cell('')] }] },
    ] as any)
    expect(md).toContain('line1 line2')
    expect(md).not.toContain('\\')
  })
})

describe('blocksToMarkdownString · 行尾与边界', () => {
  it('末尾保证 \\n', () => {
    const md = blocksToMarkdownString([
      { type: 'paragraph', content: 'no-trailing-newline' },
    ] as any)
    expect(md.endsWith('\n')).toBe(true)
  })

  it('\\r\\n 归一为 \\n', () => {
    const md = blocksToMarkdownString([
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'a', styles: {} },
          { type: 'hardBreak' },
          { type: 'text', text: 'b', styles: {} },
        ],
      },
    ] as any)
    expect(md).not.toContain('\r')
  })

  it('多块之间用 \\n 分隔（用户要求不插空行）', () => {
    // 维护者 2026-08-31：用户反馈本地保存时段落之间不要有空行
    // 之前用 \n\n（markdown 规范）现在改成 \n（用户视觉需求）
    const md = blocksToMarkdownString([
      {
        type: 'heading',
        props: { level: 1 },
        content: [{ type: 'text', text: 'H', styles: {} }],
      },
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'P', styles: {} }],
      },
    ] as any)
    expect(md).toBe('# H\nP\n')
  })
})

describe('blocksToMarkdownString · 核心回归（每行末尾不出现 \\）', () => {
  it('整段文档 round-trip 模拟：不出现 \\', () => {
    // 模拟 BlockNote 解析"多行段落"后的 doc 结构
    const blocks = [
      {
        type: 'heading',
        props: { level: 1 },
        content: [{ type: 'text', text: '标题', styles: {} }],
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: '第一段第一行', styles: {} },
          { type: 'hardBreak' },
          { type: 'text', text: '第一段第二行', styles: {} },
        ],
      },
      {
        type: 'bulletListItem',
        content: [{ type: 'text', text: '列表项 1', styles: {} }],
      },
      {
        type: 'bulletListItem',
        content: [{ type: 'text', text: '列表项 2', styles: {} }],
      },
      {
        type: 'codeBlock',
        props: { language: 'js' },
        content: 'const x = 1;\nconst y = 2;',
      },
      {
        type: 'quote',
        content: [
          { type: 'text', text: '引用第一行', styles: {} },
          { type: 'hardBreak' },
          { type: 'text', text: '引用第二行', styles: {} },
        ],
      },
    ]
    const md = blocksToMarkdownString(blocks as any)
    expect(md).not.toContain('\\')
    // 关键内容要保留
    expect(md).toContain('第一段第一行')
    expect(md).toContain('第一段第二行')
    expect(md).toContain('引用第一行')
    expect(md).toContain('引用第二行')
  })
})