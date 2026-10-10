/**
 * PMTool · Document Engine RichText 前端适配器（2026-09-18）
 *
 * BlockNote（编辑器 UI 层）⇄ PMTool 内部 RichBlock（Document Model）双向转换。
 * 原则（RFC §4 / §38）：BlockNote 只是 UI 适配器，业务/模型不直接依赖 BlockNote 结构。
 *
 * 当前为纯函数（供未来 DocumentEditor 走 adapter 用）；不改动现有 DocumentEditor 持久化。
 */

import type { Block } from '@blocknote/core'
import type { RichBlock } from '@/services/document'

/** 提取 BlockNote inlineContent 的纯文本（拼接 text segments） */
function inlineText(block: Block): string {
  const content = (block as any).content
  if (!Array.isArray(content)) return ''
  return content
    .map((seg: any) => (typeof seg === 'string' ? seg : seg?.text ?? ''))
    .join('')
}

/** 递归取子块文本（列表项等） */
function childTexts(block: Block, depth = 0): string[] {
  const children = (block as any).children
  if (!Array.isArray(children)) return []
  const out: string[] = []
  for (const ch of children) {
    out.push(inlineText(ch))
    if (depth < 4) out.push(...childTexts(ch, depth + 1))
  }
  return out
}

/** BlockNote blocks → PMTool RichBlock[] */
export function blockNoteToRichBlocks(blocks: Block[]): RichBlock[] {
  const out: RichBlock[] = []
  for (const b of blocks) {
    const t = b.type as string
    const text = inlineText(b)
    switch (t) {
      case 'heading':
        out.push({ type: 'heading', data: { level: (b.props as any)?.level ?? 1, text } })
        break
      case 'bulletListItem':
      case 'numberedListItem': {
        const items = [text, ...childTexts(b)]
        out.push({
          type: 'list',
          data: { ordered: t === 'numberedListItem', items },
        })
        break
      }
      case 'codeBlock':
        out.push({ type: 'code', data: { lang: (b.props as any)?.language ?? null, text } })
        break
      case 'quote':
        out.push({ type: 'quote', data: { text } })
        break
      case 'table': {
        const rows: string[][] = []
        const cols = (b.content as any) ?? []
        for (const row of cols) {
          const cells = (row as any)?.content ?? []
          rows.push(cells.map((c: any) => (c as any)?.content?.map((s: any) => s?.text ?? '').join('') ?? ''))
        }
        if (rows.length > 0) {
          out.push({ type: 'table', data: { header: rows[0], rows: rows.slice(1) } })
        }
        break
      }
      case 'linkTool':
        out.push({ type: 'link', data: { text, href: (b.props as any)?.url ?? '' } })
        break
      case 'image':
        out.push({ type: 'image', data: { src: (b.props as any)?.url ?? '', alt: (b.props as any)?.caption ?? null } })
        break
      default:
        if (text.trim()) out.push({ type: 'para', data: { text } })
    }
  }
  return out
}

/** PMTool RichBlock[] → BlockNote blocks（轻量：仅基础类型；table/code 等保留为段落） */
export function richBlocksToBlockNote(blocks: RichBlock[]): Block[] {
  const out: Block[] = []
  let id = 0
  const nextId = () => `rb_${Date.now().toString(36)}_${++id}`
  for (const rb of blocks) {
    const d: any = rb.data
    switch (rb.type) {
      case 'heading':
        out.push({ id: nextId(), type: 'heading', props: { level: d.level ?? 1 } as any, content: d.text as any, children: [] } as any)
        break
      case 'para':
        out.push({ id: nextId(), type: 'paragraph', content: d.text as any, children: [] } as any)
        break
      case 'list': {
        const items = Array.isArray(d.items) ? d.items : []
        const type = d.ordered ? 'numberedListItem' : 'bulletListItem'
        for (const item of items) {
          out.push({ id: nextId(), type, content: item as any, children: [] } as any)
        }
        break
      }
      case 'code':
        out.push({ id: nextId(), type: 'codeBlock', props: { language: d.lang ?? 'plain text' } as any, content: d.text as any, children: [] } as any)
        break
      case 'quote':
        out.push({ id: nextId(), type: 'quote', content: d.text as any, children: [] } as any)
        break
      default:
        out.push({ id: nextId(), type: 'paragraph', content: (d.text ?? '') as any, children: [] } as any)
    }
  }
  return out
}