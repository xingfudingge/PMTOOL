/**
 * PMTool · 维护者 2026-08-31 修复 BlockNote 解析器自动加的前导空格
 *
 * 背景：
 *   BlockNote 0.54 的 markdown 解析器把段落里的软换行规范成 "\\n "
 *   （换行 + 空格）—— 这导致我们用 `\n` 分隔的段落（如 `测试1\n测试2`）
 *   被解析成单段文本节点 `"测试1\n 测试2"`，编辑器里 `white-space:pre-wrap`
 *   渲染出来测试2 / 测试3 前面就多个空格。
 *
 * 解决：
 *   解析完后递归遍历所有 block.content，text 节点的 text 字段里
 *   `\n` 后跟的一个或多个空格 → 删掉。
 *   段间分隔符从 `\n` 提升成段落内部的实际换行（视觉上保留多行结构），
 *   但**不**新增任何空白字符。
 *
 * 局限：
 *   - 只动 text 节点的 text 字段，不动 link 节点 / hardBreak 节点结构
 *   - 表格 cell / 代码块内文本走单独序列化路径，不受这个 helper 影响
 *   - 如果用户真的写了 `测试1\n 测试2`（手动带前导空格），也会被一并删掉
 *     —— 在 markdown 里这本来就是软换行的语法噪声，删了没毛病
 */

interface StyledText {
  type: 'text'
  text: string
  styles?: Record<string, unknown>
}

interface InlineNode {
  type?: string
  text?: string
  content?: unknown
  [k: string]: unknown
}

function isStyledText(x: unknown): x is StyledText {
  return !!x && typeof x === 'object' && (x as { type?: string }).type === 'text'
}

/**
 * 把 `\n` 后面的一个或多个空格（horizontal whitespace）去掉
 * 不影响 `\n` 本身，也不影响其他位置的空格。
 */
function stripLeadingSpacesAfterNewline(text: string): string {
  return text.replace(/\n[ \t]+/g, '\n')
}

function walkInline(items: unknown[] | undefined, mutate: (s: string) => string): unknown[] | undefined {
  if (!items) return items
  for (let i = 0; i < items.length; i++) {
    const item = items[i] as InlineNode
    if (!item || typeof item !== 'object') continue
    if (isStyledText(item) && typeof item.text === 'string') {
      item.text = mutate(item.text)
    }
    if (Array.isArray(item.content)) {
      walkInline(item.content as unknown[], mutate)
    }
  }
  return items
}

/**
 * 公开入口：blocks[] → 把所有 inline content text 里的「换行 + 前导空格」清掉
 *
 * ⚠️ 维护者 2026-08-31：直接 mutate 入参 blocks，不复制 —— 调用方都是
 * 当场消费的临时数组（markdownToBlocks 返回值），没有共享风险。
 */
export function stripLeadingSpacesAfterNewlineInBlocks<T extends { content?: unknown }>(blocks: T[] | undefined): T[] | undefined {
  if (!blocks || blocks.length === 0) return blocks
  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue
    if (Array.isArray(block.content)) {
      walkInline(block.content as unknown[], stripLeadingSpacesAfterNewline)
    }
  }
  return blocks
}