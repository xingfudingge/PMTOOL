/**
 * 维护者 2026-08-31 · 真实按钮事件测试
 * 不依赖 testing-library —— 直接 mock service 然后 render + simulate click
 *
 * 验证 3 个不变量：
 *   1. 目录树 + 按钮 → creatingFolder state → inline <input> 出现
 *   2. inline <input> 输入 + Enter → upsertKnowledgeFolder 被调
 *   3. 笔记列表 + 按钮 → handleNewNote → upsertKnowledgeNote 被调
 *
 * 目标：用户报"新建按钮没生效"，这里直接验证 onClick handler 真的接到了事件
 */
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, screen, cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// mock 整个 knowledge service
vi.mock('@/services/knowledge', () => ({
  listKnowledgeNotes: vi.fn(async () => []),
  listKnowledgeFolders: vi.fn(async () => []),
  listKnowledgeFoldersByProject: vi.fn(async () => []),
  searchKnowledgeNotes: vi.fn(async () => []),
  getKnowledgeNote: vi.fn(async () => null),
  upsertKnowledgeNote: vi.fn(async (n) => ({
    id: 999,
    spaceId: n.spaceId || 0,
    space: n.space,
    title: n.title,
    content: n.content,
    contentType: n.contentType,
    contentMd: n.contentMd,
    pinned: n.pinned,
    folderId: n.folderId,
    sourceType: n.sourceType,
    isAiGenerated: n.isAiGenerated,
    createdAt: '2026-08-31T00:00:00Z',
    updatedAt: '2026-08-31T00:00:00Z',
  })),
  upsertKnowledgeFolder: vi.fn(async (f) => ({
    id: 888,
    parentId: f.parentId,
    space: f.space,
    projectId: f.projectId,
    name: f.name,
    sortOrder: 0,
    systemType: f.systemType || 'USER',
    createdAt: '2026-08-31T00:00:00Z',
    updatedAt: '2026-08-31T00:00:00Z',
  })),
  deleteKnowledgeNote: vi.fn(async () => true),
  deleteKnowledgeFolder: vi.fn(async () => true),
}))

// mock DocumentEditor —— 避免拉 BlockNote 进测试环境
vi.mock('@/components/DocumentEditor', () => ({
  DocumentEditor: () => null,
}))

vi.mock('@/components/DocumentEditor/useBlockNoteSetup', () => ({
  resolveInitialBlocks: () => undefined,
}))

import { KnowledgeSpaceView } from '../index'
import * as svc from '@/services/knowledge'

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
})

describe('KnowledgeSpaceView · 真按钮事件测试（不进 modal）', () => {
  it('点树顶 + 按钮 → inline input 出现 + focus', async () => {
    render(<KnowledgeSpaceView space="personal" />)
    const btn = await screen.findByTitle('新建目录')
    fireEvent.click(btn)
    // 维护者 2026-08-31：inline 模式 —— 不弹 modal，直接出 input
    const input = screen.getByPlaceholderText('输入目录名 · 回车') as HTMLInputElement
    expect(input).toBeTruthy()
    // Document.activeElement 验证 autoFocus
    expect(document.activeElement).toBe(input)
  })

  it('inline input 输入 + Enter → upsertKnowledgeFolder 被调 + setCreatingFolder(false)', async () => {
    render(<KnowledgeSpaceView space="personal" />)
    fireEvent.click(await screen.findByTitle('新建目录'))
    const input = screen.getByPlaceholderText('输入目录名 · 回车') as HTMLInputElement
    fireEvent.change(input, { target: { value: '我的新目录' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    // 等微任务队列排空
    await new Promise((r) => setTimeout(r, 0))
    expect(svc.upsertKnowledgeFolder).toHaveBeenCalledTimes(1)
    expect(svc.upsertKnowledgeFolder).toHaveBeenCalledWith(
      expect.objectContaining({ name: '我的新目录', space: 'personal', parentId: null }),
    )
  })

  it('inline input 输入 + Esc → setCreatingFolder(false) · upsertKnowledgeFolder 不被调', async () => {
    render(<KnowledgeSpaceView space="personal" />)
    fireEvent.click(await screen.findByTitle('新建目录'))
    const input = screen.getByPlaceholderText('输入目录名 · 回车') as HTMLInputElement
    fireEvent.change(input, { target: { value: '不应被调' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    await new Promise((r) => setTimeout(r, 0))
    expect(svc.upsertKnowledgeFolder).not.toHaveBeenCalled()
  })

  it('选中目录后点笔记列表 + 按钮 → upsertKnowledgeNote 被调', async () => {
    vi.mocked(svc.listKnowledgeFolders).mockResolvedValueOnce([{
      id: 1, parentId: null, space: 'personal', spaceId: null, projectId: null, name: '工作笔记', sortOrder: 0, systemType: 'USER', createdAt: '', updatedAt: '',
    }])
    render(<KnowledgeSpaceView space="personal" />)
    fireEvent.click(await screen.findByTitle('工作笔记'))
    const btn = await screen.findByTitle('新建笔记')
    fireEvent.click(btn)
    await new Promise((r) => setTimeout(r, 0))
    expect(svc.upsertKnowledgeNote).toHaveBeenCalledTimes(1)
    expect(svc.upsertKnowledgeNote).toHaveBeenCalledWith(
      expect.objectContaining({
        space: 'personal',
        title: '未命名笔记',
        content: '[]',
        contentType: 'BLOCKNOTE_JSON',
        isAiGenerated: false, folderId: 1,
      }),
    )
  })

  it('AI 知识目录被选中时不允许从工具栏新建笔记', async () => {
    render(<KnowledgeSpaceView space="personal" />)
    // 先点 AI 知识目录（id=-1，由 tree.ts 注入）
    await screen.findByTitle(/AI 知识.*系统目录/)
    fireEvent.click(screen.getByTitle(/AI 知识.*系统目录/))
    const newButton = await screen.findByTitle('新建笔记')
    expect((newButton as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(newButton)
    await new Promise((r) => setTimeout(r, 0))
    expect(svc.upsertKnowledgeNote).not.toHaveBeenCalled()
  })

  it('AI 知识目录不允许删除 —— deleteKnowledgeFolder 被 id<=0 guard 拦下', async () => {
    render(<KnowledgeSpaceView space="personal" />)
    await screen.findByTitle(/AI 知识.*系统目录/)
    // AI 知识目录不应该渲染 trash 按钮
    const aiFolderBtn = screen.getByTitle(/AI 知识.*系统目录/)
    // 找它的兄弟节点中的删除按钮
    const parent = aiFolderBtn.parentElement?.parentElement
    expect(parent?.querySelector('button[title="删除目录"]')).toBeNull()
  })
})
