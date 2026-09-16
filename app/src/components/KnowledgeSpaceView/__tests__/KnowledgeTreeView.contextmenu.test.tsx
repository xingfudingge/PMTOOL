// @vitest-environment jsdom
/** 知识树右键菜单 + 剪贴板粘贴（维护者 2026-09-16） */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@/components/DocumentEditor', () => ({ DocumentEditor: () => <div /> }))
vi.mock('@/components/DocumentEditor/editingMaximized', () => ({ useEditingMaximized: () => false }))
vi.mock('@/components/DocumentEditor/useBlockNoteSetup', () => ({ resolveInitialBlocks: () => [] }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

// 显式标注入参：否则 vi.fn(async () => ...) 被推断为 0 参函数，转发调用过不了 tsc
const moveKnowledgeNote = vi.fn(async (_id: number, _folderId: number | null) => true)
const copyKnowledgeNote = vi.fn(async (_id: number, _folderId: number | null) => 999)
const mockNotes: Record<number, unknown[]> = {}
const mockFolders: Record<number, unknown[]> = {}

vi.mock('@/services/knowledge', () => ({
  listKnowledgeNotes: async (s: number) => mockNotes[s] ?? [],
  listKnowledgeFolders: async () => [],
  listKnowledgeFoldersByProject: async () => [],
  listKnowledgeFoldersBySpaceId: async (s: number) => mockFolders[s] ?? [],
  listPersonalKnowledgeSpaces: async () => [{ id: 1, name: '个人' }],
  upsertKnowledgeFolder: vi.fn(async () => ({})),
  upsertKnowledgeNote: vi.fn(async () => ({})),
  deleteKnowledgeFolder: vi.fn(async () => true),
  deleteKnowledgeNote: vi.fn(async () => true),
  moveKnowledgeNote: (...a: [number, number | null]) => moveKnowledgeNote(...a),
  copyKnowledgeNote: (...a: [number, number | null]) => copyKnowledgeNote(...a),
  getKnowledgeNote: vi.fn(async () => null),
}))
vi.mock('@/services/knowledgeSpaces', () => ({
  listProjectKnowledgeSpaces: async () => [],
  listAllProjectSpaces: async () => [],
  listSpaceBindings: async () => [],
  deleteKnowledgeSpace: vi.fn(async () => true),
  createKnowledgeSpace: vi.fn(async () => ({})),
}))
vi.mock('@/services/project', () => ({ listProjects: async () => [] }))

import { KnowledgeTreeView } from '../KnowledgeTreeView'

const mkNote = (id: number, folderId: number | null, title: string) => ({
  id, spaceId: 1, space: 'personal', title, content: '[]', contentType: 'BLOCKNOTE_JSON',
  contentMd: '', pinned: false, folderId, category: null, sourceType: 'USER', createdBy: null,
  createdAt: '2026-09-16 00:00:00', updatedAt: '2026-09-16 00:00:00',
})
const mkFolder = (id: number, name: string) => ({
  id, parentId: null, space: 'personal', spaceId: 1, projectId: null, name,
  sortOrder: 0, systemType: 'USER', createdAt: '', updatedAt: '',
})

const menuItem = (label: RegExp) => screen.getByRole('menuitem', { name: label })

describe('KnowledgeTreeView · 右键菜单', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.keys(mockNotes).forEach((k) => delete mockNotes[+k])
    Object.keys(mockFolders).forEach((k) => delete mockFolders[+k])
    mockFolders[1] = [mkFolder(10, '目录A')]
    mockNotes[1] = [mkNote(101, null, '笔记1')]
  })

  it('右键知识 → 有 打开编辑/复制/剪切/重命名/删除', async () => {
    render(<KnowledgeTreeView mode="personal" />)
    fireEvent.contextMenu(await screen.findByText('笔记1'), { clientX: 50, clientY: 50 })
    for (const l of [/打开编辑/, /复制/, /剪切/, /重命名/, /删除/]) expect(menuItem(l)).toBeTruthy()
  })

  it('复制知识 → 右键目录 → 粘贴 ⇒ copyKnowledgeNote(101, 10)', async () => {
    render(<KnowledgeTreeView mode="personal" />)
    fireEvent.contextMenu(await screen.findByText('笔记1'), { clientX: 50, clientY: 50 })
    fireEvent.click(menuItem(/复制/))
    fireEvent.contextMenu(await screen.findByText('目录A'), { clientX: 50, clientY: 50 })
    fireEvent.click(menuItem(/粘贴/))
    await waitFor(() => expect(copyKnowledgeNote).toHaveBeenCalledWith(101, 10))
  })

  it('剪切知识 → 粘贴 ⇒ moveKnowledgeNote（真移动）', async () => {
    render(<KnowledgeTreeView mode="personal" />)
    fireEvent.contextMenu(await screen.findByText('笔记1'), { clientX: 50, clientY: 50 })
    fireEvent.click(menuItem(/剪切/))
    fireEvent.contextMenu(await screen.findByText('目录A'), { clientX: 50, clientY: 50 })
    fireEvent.click(menuItem(/粘贴/))
    await waitFor(() => expect(moveKnowledgeNote).toHaveBeenCalledWith(101, 10))
  })
})
