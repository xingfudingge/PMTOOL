// @vitest-environment jsdom
/**
 * 知识树拖拽回归测试（2026-09-16）
 *
 * 背景：用户反馈「项目知识中心可以拖拽了，个人知识中心呢？」
 * 两种模式共用同名 KnowledgeTreeView 组件。本应用在 DOM 层真实触发
 * dragStart → dragOver → drop 事件链，逐条断言：
 *   - 个人模式：笔记拖放到目录 → moveKnowledgeNote(id, folderId)
 *   - 个人模式：笔记拖到「移动到顶层」落点 → moveKnowledgeNote(id, null)
 *   - 个人模式：拖到自己所在目录 → 不触发移动（no-op）
 *   - 项目模式：同样路径行为一致（证明拖拽能力对两中心同构）
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// ── 重依赖 mock（BlockNote 编辑器不在测试环境加载） ──
vi.mock('@/components/DocumentEditor', () => ({
  DocumentEditor: () => <div data-testid="doc-editor-stub" />,
}))
vi.mock('@/components/DocumentEditor/editingMaximized', () => ({
  useEditingMaximized: () => false,
}))
vi.mock('@/components/DocumentEditor/useBlockNoteSetup', () => ({
  resolveInitialBlocks: () => [],
}))
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const moveKnowledgeNote = vi.fn(async (_id: number, _folderId: number | null) => true)
const mockNotes: Record<number, unknown[]> = {}
const mockFolders: Record<number, unknown[]> = {}

vi.mock('@/services/knowledge', () => ({
  listKnowledgeNotes: async (spaceId: number) => mockNotes[spaceId] ?? [],
  listKnowledgeFolders: async () => [],
  listKnowledgeFoldersByProject: async () => [],
  listKnowledgeFoldersBySpaceId: async (spaceId: number) => mockFolders[spaceId] ?? [],
  listPersonalKnowledgeSpaces: async () => [{ id: 1, name: '个人' }],
  upsertKnowledgeFolder: vi.fn(async () => ({})),
  upsertKnowledgeNote: vi.fn(async () => ({})),
  deleteKnowledgeFolder: vi.fn(async () => true),
  deleteKnowledgeNote: vi.fn(async () => true),
  moveKnowledgeNote: (...args: [number, number | null]) => moveKnowledgeNote(...args),
  getKnowledgeNote: vi.fn(async (_id: number) => null),
}))
vi.mock('@/services/knowledgeSpaces', () => ({
  listProjectKnowledgeSpaces: async () => [{ id: 5, name: '库A' }],
  listAllProjectSpaces: async () => [],
  listSpaceBindings: async () => [],
  deleteKnowledgeSpace: vi.fn(async () => true),
  createKnowledgeSpace: vi.fn(async () => ({})),
}))
vi.mock('@/services/project', () => ({
  listProjects: async () => [],
}))

import { KnowledgeTreeView } from '../KnowledgeTreeView'

const mkNote = (id: number, spaceId: number, folderId: number | null, title: string) => ({
  id,
  spaceId,
  space: spaceId === 1 ? 'personal' : 'project',
  title,
  content: '[]',
  contentType: 'BLOCKNOTE_JSON' as const,
  contentMd: '',
  pinned: false,
  folderId,
  category: null,
  sourceType: 'USER',
  createdBy: null,
  createdAt: '2026-09-16 00:00:00',
  updatedAt: '2026-09-16 00:00:00',
})

const mkFolder = (id: number, spaceId: number, parentId: number | null, name: string) => ({
  id,
  parentId,
  space: spaceId === 1 ? ('personal' as const) : ('project' as const),
  spaceId,
  projectId: null,
  name,
  sortOrder: 0,
  systemType: 'USER',
  createdAt: '2026-09-16 00:00:00',
  updatedAt: '2026-09-16 00:00:00',
})

const makeDataTransfer = () => {
  const data: Record<string, string> = {}
  return {
    effectAllowed: '',
    dropEffect: '',
    setData: (k: string, v: string) => {
      data[k] = v
    },
    getData: (k: string) => data[k] ?? '',
  }
}

/** 等待某个节点行渲染出来，返回其 row 容器 div（onDragOver/onDrop 挂在这里） */
const rowOf = async (name: string): Promise<HTMLElement> => {
  const label = await screen.findByText(name)
  const btn = (label.closest('button') ?? label) as HTMLElement
  return btn.parentElement as HTMLElement
}

const dragOverAndDrop = (row: Element) => {
  const dt = makeDataTransfer()
  fireEvent.dragOver(row, { dataTransfer: dt })
  fireEvent.drop(row, { dataTransfer: dt })
}

const startDrag = async (title: string) => {
  const label = await screen.findByText(title)
  const src = await waitFor(() => {
    // 2026-09-16 bug 类守护：Blink/WebView2 对表单控件（button 等）无视
    // draggable="true"，dragstart 永远不触发（真机完全拖不动）。
    // 因此断言拖拽源存在且绝不能是表单控件。
    const el = (label.closest('[draggable="true"]') ?? label) as HTMLElement
    expect(el.getAttribute('draggable')).toBe('true')
    expect(['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA']).not.toContain(el.tagName)
    return el
  })
  fireEvent.dragStart(src, { dataTransfer: makeDataTransfer() })
}

beforeEach(() => {
  vi.clearAllMocks()
  for (const k of Object.keys(mockNotes)) delete mockNotes[Number(k)]
  for (const k of Object.keys(mockFolders)) delete mockFolders[Number(k)]
})

describe('KnowledgeTreeView · 拖拽移动', () => {
  it('个人模式：笔记拖到目录行 → moveKnowledgeNote(101, 10)', async () => {
    mockFolders[1] = [mkFolder(10, 1, null, '目录A')]
    mockNotes[1] = [mkNote(101, 1, null, '笔记1')]
    render(<KnowledgeTreeView mode="personal" />)

    await startDrag('笔记1')
    dragOverAndDrop(await rowOf('目录A'))

    await waitFor(() => expect(moveKnowledgeNote).toHaveBeenCalledWith(101, 10))
  })

  it('个人模式：目录内笔记拖到「移动到顶层」落点 → moveKnowledgeNote(102, null)', async () => {
    mockFolders[1] = [mkFolder(10, 1, null, '目录A')]
    mockNotes[1] = [mkNote(102, 1, 10, '笔记2')]
    render(<KnowledgeTreeView mode="personal" />)

    await startDrag('笔记2')
    const strip = await screen.findByText('松开：移动到顶层')
    const dt = makeDataTransfer()
    fireEvent.dragOver(strip, { dataTransfer: dt })
    fireEvent.drop(strip, { dataTransfer: dt })

    await waitFor(() => expect(moveKnowledgeNote).toHaveBeenCalledWith(102, null))
  })

  it('个人模式：笔记拖回自己所在目录 → 不触发移动（同位置 no-op）', async () => {
    mockFolders[1] = [mkFolder(10, 1, null, '目录A')]
    mockNotes[1] = [mkNote(103, 1, 10, '笔记3')]
    render(<KnowledgeTreeView mode="personal" />)

    await startDrag('笔记3')
    dragOverAndDrop(await rowOf('目录A'))
    // 等一轮异步后仍不应调用
    await new Promise((r) => setTimeout(r, 0))
    expect(moveKnowledgeNote).not.toHaveBeenCalled()
  })

  it('项目模式：笔记拖到目录行 → moveKnowledgeNote(201, 20)（与个人同构）', async () => {
    mockFolders[5] = [mkFolder(20, 5, null, '项目目录')]
    mockNotes[5] = [mkNote(201, 5, null, '项目备忘')]
    render(<KnowledgeTreeView mode="project" spaceId={5} />)

    await startDrag('项目备忘')
    dragOverAndDrop(await rowOf('项目目录'))

    await waitFor(() => expect(moveKnowledgeNote).toHaveBeenCalledWith(201, 20))
  })

  /**
   * 2026-09-16 真机 bug 类守护（个人中心「完全拖不动」）：
   * 拖拽期间树容器一旦发生 DOM 结构突变（增删子节点），Chromium 会立即取消整个原生拖拽，
   * 事件序列只剩 dragstart → dragend，后续 dragenter/dragover/drop 全无，
   * 表现为「没有虚化、没有高亮、完全没反应」。
   * 原实现把「松开：移动到顶层」落点写成 {drag && <div/>}，dragstart 时插入该节点即触发此 bug。
   * 故此处锁死不变量：拖拽开始不得增删任何节点（只允许改样式/属性）。
   */
  it('个人模式：dragstart 不得改变树容器 DOM 结构（否则 Chromium 取消拖拽）', async () => {
    mockFolders[1] = [mkFolder(10, 1, null, '目录A')]
    mockNotes[1] = [mkNote(104, 1, null, '笔记4')]
    render(<KnowledgeTreeView mode="personal" />)

    const label = await screen.findByText('笔记4')
    const row = (label.closest('[draggable="true"]') ?? label) as HTMLElement
    // 向上找到树滚动容器（overflow-y: auto）
    let scroll: HTMLElement = row
    while (scroll.parentElement && scroll.style.overflowY !== 'auto') {
      scroll = scroll.parentElement
    }

    const mutations: MutationRecord[] = []
    const observer = new MutationObserver((records) => mutations.push(...records))
    observer.observe(scroll, { childList: true, subtree: true })

    // 拖拽前：落点是常驻 DOM 但隐藏
    const strip = screen.getByText('松开：移动到顶层')
    expect(strip.style.visibility).toBe('hidden')

    fireEvent.dragStart(row, { dataTransfer: makeDataTransfer() })
    await new Promise((r) => setTimeout(r, 0))
    observer.disconnect()

    const structural = mutations.filter(
      (m) => m.type === 'childList' && (m.addedNodes.length > 0 || m.removedNodes.length > 0),
    )
    expect(structural.map((m) => m.addedNodes.length + '增/' + m.removedNodes.length + '删')).toEqual([])

    // 拖拽中：只切样式（可见 + 可接收落点）
    await waitFor(() => expect(screen.getByText('松开：移动到顶层').style.visibility).toBe('visible'))
  })
})
