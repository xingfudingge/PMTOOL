/**
 * PMTool · BlockNote JSON → Markdown 序列化器（维护者 2026-08-31 修复换行污染）
 *
 * 为什么不用 BlockNote 自带的 blocksToMarkdown：
 *   - BlockNote 走 HTML 中转（block JSON → external HTML → markdown）
 *   - HTML 里 <br> 表示 hard break
 *   - htmlToMarkdown 把 <br> 序列化成 "\\<newline>"（反斜杠 + 换行）
 *   - 维护者 2026-08-31 反馈：每行末尾出现 \
 *
 * 真正的根因：
 *   - markdownToBlocks 解析段落时，把段落里的 \n 转成 hardBreak inline
 *   - 用户从外部打开 .md，所有软换行被当成 hard break 存进 doc
 *   - save() 走 BlockNote 默认序列化器 → 全部 hard break 输出 \ → 文件被污染
 *
 * 这个序列化器：
 *   - 直接遍历 BlockNote document JSON，输出 markdown
 *   - 所有 hard break → 软换行（保留段落内多行结构，不污染文件）
 *   - 行尾 \r\n 归一化为 \n
 *   - 支持段落、标题 1-6、无序/有序/任务列表、代码块、引用、分隔线、
 *     图片、音视频（用 markdown image shorthand）、表格
 *   - 内联样式（粗/斜/code/strike/链接/下划线）正确保留
 *
 * 维护者 2026-08-31：硬换行（Shift+Enter）在用户主动按下时也会被序列化成
 * 软换行 —— 这是可接受的取舍，因为：
 *   1. 硬换行在 .md 文件中少见
 *   2. 区分「用户主动 Shift+Enter」与「解析软换行注入」需要元数据，BlockNote
 *      0.54 的 document 模型里没有
 *   3. 保住「打开文件不污染」比「保留硬换行标记」重要得多
 */

import type { Block, PartialBlock } from '@blocknote/core'

// ==== 内联内容节点类型（BlockNote 0.54 默认 schema） ====

interface StyledText {
  type: 'text'
  text: string
  styles: Record<string, unknown>
}

interface LinkInline {
  type: 'link'
  href: string
  content: StyledText[]
}

type InlineContentItem = StyledText | LinkInline | HardBreak | string

interface HardBreak {
  type: 'hardBreak'
}

function isStyledText(x: unknown): x is StyledText {
  return !!x && typeof x === 'object' && (x as { type?: string }).type === 'text'
}

function isLink(x: unknown): x is LinkInline {
  return !!x && typeof x === 'object' && (x as { type?: string }).type === 'link'
}

function isHardBreak(x: unknown): x is HardBreak {
  return !!x && typeof x === 'object' && (x as { type?: string }).type === 'hardBreak'
}

// ==== 内联内容序列化 ====

/**
 * 单段内联文本转义（粗/斜/code/strike/链接/特殊字符）
 * 不递归，由 serializeInlineContent 统一处理
 */
function escapeInlineText(text: string): string {
  return text.replace(/([\\`*_{}[\]()#+\-.!~|>])/g, '\\$1')
}

/**
 * 把 inline content 数组转成 markdown 字符串
 * 维护者 2026-08-31：hardBreak 输出为 \n（软换行）·不输出 \
 */
function serializeInlineContent(content: unknown): string {
  if (content == null) return ''
  if (typeof content === 'string') return escapeInlineText(content)
  if (!Array.isArray(content)) return ''

  let result = ''
  for (const item of content as InlineContentItem[]) {
    if (typeof item === 'string') {
      result += escapeInlineText(item)
      continue
    }
    if (isStyledText(item)) {
      const { text, styles } = item
      let body = escapeInlineText(text)
      // 顺序：code → strike → bold → italic（与 remark 一致）
      if ((styles as { code?: boolean }).code) {
        const longestRun = Math.max(
          0,
          ...(body.match(/`+/g) ?? []).map((r) => r.length),
        )
        const fence = '`'.repeat(longestRun + 1)
        const needsPad = body.startsWith('`') || body.endsWith('`')
        body = fence + (needsPad ? ` ${body} ` : body) + fence
      }
      if ((styles as { strike?: boolean }).strike) body = `~~${body}~~`
      if ((styles as { bold?: boolean }).bold) {
        // 处理尾部空白：避免 **foo ** 解析为 bold + text
        const m = body.match(/^(.*?)(\s*)$/)
        if (m) body = `**${m[1]}**${m[2]}`
      }
      if ((styles as { italic?: boolean }).italic) {
        const m = body.match(/^(.*?)(\s*)$/)
        if (m) body = `*${m[1]}*${m[2]}`
      }
      // underline / textColor / backgroundColor 等无 markdown 等价 → 保留纯文本
      result += body
    } else if (isLink(item)) {
      const inner = serializeInlineContent(item.content)
      const rawHref = item.href ?? ''
      const href = rawHref.replace(/[\\()]/g, '\\$&')
      // 维护者 2026-08-31：链接文本等于 URL（转义前后都判一次） → 输出裸 URL；
      // 否则 [text](url)
      const isAutolink =
        !inner ||
        inner === rawHref ||
        inner === href ||
        inner === escapeInlineText(rawHref)
      if (isAutolink) {
        result += rawHref
      } else {
        result += `[${inner}](${href})`
      }
    } else if (isHardBreak(item)) {
      // 维护者 2026-08-31：hardBreak → \n（软换行）·不输出 \
      //   原本 BlockNote htmlToMarkdown 输出 "\\<newline>"，污染文件
      //   软换行在 CommonMark 里就是普通 \n，对用户无感
      result += '\n'
    }
  }
  // 维护者 2026-08-31：BlockNote parser 把段落里软换行规范成 "\n "（换行 + 空格），
  // 序列化时这空格会带出多行文本在引用里变成 ">  line2"（行首两空格）或多行
  // 段落里变成 "line1\n line2"。规范化：\n 后的一个或多个普通空格 → 去掉。
  // 不影响 codeBlock / tableCell 里的换行（那里走单独的序列化路径）。
  return result.replace(/\n +/g, '\n')
}

// ==== 块序列化 ====

interface TableCell {
  type: 'tableCell'
  content: StyledText[] | string
  props?: Record<string, unknown>
}

interface TableRow {
  cells: TableCell[]
}

function getInlineString(cellContent: TableCell['content']): string {
  if (typeof cellContent === 'string') return cellContent
  if (!Array.isArray(cellContent)) return ''
  let s = ''
  for (const item of cellContent) {
    if (isStyledText(item)) s += item.text
    else if (isHardBreak(item)) s += '\n'
  }
  return s
}

function serializeTableCell(cell: TableCell, colWidth: number): string {
  const text = getInlineString(cell.content)
  const escaped = text.replace(/\|/g, '\\|').replace(/\n/g, ' ')
  return ' ' + escaped.padEnd(colWidth, ' ') + ' '
}

function serializeTable(block: PartialBlock): string {
  // 维护者 2026-08-31：BlockNote 0.54 table 的 content 是
  // {type:'tableContent', columnWidths, headerRows, rows}
  // 不是直接 rows[]。要解一层。
  const rawContent = (block as { content?: unknown }).content
  let rows: TableRow[] = []
  if (Array.isArray(rawContent)) {
    // 已经是 rows[]（直接调用时）
    rows = rawContent as TableRow[]
  } else if (rawContent && typeof rawContent === 'object') {
    const obj = rawContent as { rows?: TableRow[] }
    if (Array.isArray(obj.rows)) rows = obj.rows
  }
  if (rows.length === 0) return ''

  // 列数：以第一行为准
  const colCount = rows[0].cells.length
  // 每列最大宽度（中文/英文都按字符数算，markdown 列宽不影响渲染）
  const colWidths: number[] = new Array(colCount).fill(3)
  for (const row of rows) {
    for (let c = 0; c < colCount; c++) {
      const cell = row.cells[c]
      if (!cell) continue
      const text = getInlineString(cell.content).replace(/\|/g, '\\|').replace(/\n/g, ' ')
      colWidths[c] = Math.max(colWidths[c], text.length)
    }
  }

  const lines: string[] = []
  for (let i = 0; i < rows.length; i++) {
    const cells: string[] = []
    for (let c = 0; c < colCount; c++) {
      const cell = rows[i].cells[c]
      cells.push(cell ? serializeTableCell(cell, colWidths[c]) : ' ' + ''.padEnd(colWidths[c], ' ') + ' ')
    }
    lines.push('|' + cells.join('|') + '|')
    // 第一行后插分隔线
    if (i === 0) {
      const sep = colWidths.map((w) => ' ' + '-'.repeat(w) + ' ').join('|')
      lines.push('|' + sep + '|')
    }
  }
  return lines.join('\n') + '\n\n'
}

interface CodeBlockContent {
  type: 'codeBlock'
  content: string
  props: { language?: string }
}

function getCodeBlockText(block: PartialBlock): string {
  // 维护者 2026-08-31：BlockNote 0.54 codeBlock 的 content 是 StyledText[]
  // （用 text 节点包裹代码字符串），不是 plain 字符串。把 text 节点拼起来
  const c = (block as { content?: unknown }).content
  if (typeof c === 'string') return c
  if (!Array.isArray(c)) return ''
  let out = ''
  for (const item of c as unknown[]) {
    if (isStyledText(item)) {
      out += item.text
    } else if (isHardBreak(item)) {
      out += '\n'
    } else if (typeof item === 'string') {
      out += item
    }
  }
  return out
}

function serializeBlock(block: PartialBlock, ctx: SerializeCtx): string {
  const t = block.type
  const props = (block.props ?? {}) as Record<string, unknown>
  const content = (block as { content?: unknown }).content

  switch (t) {
    case 'paragraph':
      // 维护者 2026-08-31：行尾用 \n（紧贴下一行），不要 \n\n
      // 用户反馈：本地保存时段落之间不要有空行
      return serializeInlineContent(content) + '\n'

    case 'heading': {
      const level = Math.min(6, Math.max(1, Number(props.level) || 1))
      return '#'.repeat(level) + ' ' + serializeInlineContent(content) + '\n'
    }

    case 'bulletListItem':
      return ctx.indent + '- ' + serializeInlineContent(content) + '\n'

    case 'numberedListItem':
      return ctx.indent + ctx.orderedIndex + '. ' + serializeInlineContent(content) + '\n'

    case 'checkListItem': {
      const checked = props.checked ? 'x' : ' '
      return ctx.indent + `- [${checked}] ` + serializeInlineContent(content) + '\n'
    }

    case 'codeBlock': {
      const lang = (props.language as string) || ''
      const code = getCodeBlockText(block)
      // 围栏长度：比代码里最长的 ``` 串再多 1 个，最少 3
      const longestRun = Math.max(
        0,
        ...(code.match(/`+/g) ?? []).map((r) => r.length),
      )
      const fence = '`'.repeat(Math.max(3, longestRun + 1))
      return ctx.indent + fence + lang + '\n' + code + '\n' + ctx.indent + fence + '\n'
    }

    case 'quote':
      return '> ' + serializeInlineContent(content).split('\n').join('\n> ') + '\n'

    case 'divider':
      return '---\n'

    case 'image': {
      const alt = (props.name || props.caption || '') as string
      return `![${alt}](${props.url})\n`
    }

    case 'video': {
      const alt = (props.name || props.caption || '') as string
      return `![${alt}](${props.url})\n`
    }

    case 'audio':
    case 'file': {
      const name = (props.name || props.caption || '') as string
      return `[${name}](${props.url})\n`
    }

    case 'table':
      // 维护者 2026-08-31：表格行之间用 \n（不带末尾空行）· 与正文策略一致
      return serializeTable(block).replace(/\n+$/, '') + '\n'

    default:
      // 未知 block 类型：fallback 到 JSON 调试输出，避免静默丢内容
      return JSON.stringify(block) + '\n'
  }
}

interface SerializeCtx {
  indent: string
  orderedIndex: number
}

/**
 * 公开入口：Block[] → markdown 字符串
 *
 * 维护者 2026-08-31：
 *   - 输入 blocks 是 useBlockNoteSetup 返回的 editor.document
 *   - 输出可直接写回原 .md 文件
 *   - 行尾统一 \n（mac/linux 风格），不再混入 \r
 *   - 末尾保证一个 \n（POSIX 标准）
 *   - 维护者 2026-08-31：所有块之间用 \n（不插 \n\n 空行）
 *     用户反馈：本地保存文件不希望段落之间有空行
 *     块内硬换行也用 \n（与段间隔一致 · 视觉上无差别）
 */
export function blocksToMarkdownString(blocks: Block[] | PartialBlock[]): string {
  if (!blocks || blocks.length === 0) return ''
  const list: string[] = []
  const ctx: SerializeCtx = { indent: '', orderedIndex: 0 }
  let lastType = ''
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i] as PartialBlock
    const t = (block.type as string) ?? ''
    // 维护者 2026-08-31：有序列表每次遇到 non-numbered 都要重置计数
    if (t === 'numberedListItem') {
      if (lastType === 'numberedListItem') {
        ctx.orderedIndex += 1
      } else {
        ctx.orderedIndex = Number((block.props as { start?: number })?.start) || 1
      }
    } else if (t !== 'numberedListItem' && ctx.indent === '') {
      ctx.orderedIndex = 0
    }
    list.push(serializeBlock(block, ctx))
    lastType = t
  }
  let raw = list.join('')
  // 归一化行尾：Windows \r\n → \n，孤立 \r 也清掉
  raw = raw.replace(/\r\n/g, '\n').replace(/\r/g, '')
  // 维护者 2026-08-31：原本「压缩 3+ 个 \n → \n\n」不再需要 —— 现在所有块都用 \n
  // 末尾保证一个 \n
  return raw.replace(/\s+$/, '') + '\n'
}