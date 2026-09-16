/**
 * PMTool · KnowledgeSpaceView 目录树逻辑测试（维护者 2026-08-31）
 *
 * 覆盖：
 *   - buildFolderTree 拼出正确层级
 *   - filterNotesByFolder 按选中目录返回正确子集
 *   - buildUnifiedTree 个人/项目两种模式
 */

import { describe, it, expect } from 'vitest'
import {
  buildFolderTree,
  buildUnifiedTree,
  filterNotesByFolder,
} from '../tree'
import type {
  KnowledgeNote as DbNote,
  KnowledgeFolder as DbFolder,
} from '@/services/knowledge'

function mkFolder(id: number, parentId: number | null = null, name = `f${id}`, systemType: 'USER' | 'PROJECT_ROOT' = 'USER'): DbFolder {
  return {
    id,
    parentId,
    space: 'personal',
    spaceId: null,
    projectId: null,
    name,
    sortOrder: 0,
    systemType,
    createdAt: '',
    updatedAt: '',
  }
}

function mkNote(id: number, opts: Partial<DbNote> = {}): DbNote {
  return {
    id,
    spaceId: 0,
    space: 'personal',
    title: `note${id}`,
    content: '',
    contentType: 'BLOCKNOTE_JSON',
    contentMd: '',
    pinned: false,
    folderId: opts.folderId ?? null,
    category: null,
    sourceType: 'USER',
    createdBy: null,
    createdAt: '',
    updatedAt: '',
  }
}

describe('KnowledgeSpaceView 目录树逻辑（维护者 2026-08-31）', () => {
  describe('buildFolderTree', () => {
    it('空数据：返回空', () => {
      const tree = buildFolderTree([], [])
      expect(tree).toHaveLength(0)
    })

    it('真实目录挂在根，children 正确嵌套', () => {
      const folders = [mkFolder(1, null, '工作笔记'), mkFolder(2, 1, '经验'), mkFolder(3, null, '模板')]
      const tree = buildFolderTree(folders, [])
      expect(tree).toHaveLength(2)
      const root1 = tree.find((n) => n.id === 1)
      expect(root1).toBeDefined()
      expect(root1!.children).toHaveLength(1)
      expect(root1!.children[0].id).toBe(2)
    })

    it('notes 按 folderId 分组进对应目录', () => {
      const folders = [mkFolder(1, null, 'A')]
      const notes = [
        mkNote(100, { folderId: 1 }),
        mkNote(101, { folderId: 1 }),
        mkNote(102, { folderId: null }),
      ]
      const tree = buildFolderTree(folders, notes)
      const rootA = tree.find((n) => n.id === 1)!
      expect(rootA.notes).toHaveLength(2)
    })

    it('孤儿 folderId 的 note 不展示', () => {
      const notes = [mkNote(1, { folderId: 999 })] // 999 不存在
      const tree = buildFolderTree([], notes)
      expect(tree.find((n) => n.id === 999)).toBeUndefined()
      expect(tree).toHaveLength(0)
    })
  })

  describe('filterNotesByFolder', () => {
    const notes = [
      mkNote(1, { folderId: null }),
      mkNote(2, { folderId: 5 }),
      mkNote(3, { folderId: null }),
      mkNote(4, { folderId: 5 }),
    ]

    it('未选择目录时不返根级笔记', () => {
      const out = filterNotesByFolder(notes, 0)
      expect(out.map((n) => n.id)).toEqual([])
    })

    it('真实目录 id 返 folderId=id 的', () => {
      const out = filterNotesByFolder(notes, 5)
      expect(out.map((n) => n.id)).toEqual([2, 4])
    })

    it('null 不展示笔记', () => {
      const out = filterNotesByFolder(notes, null)
      expect(out.map((n) => n.id)).toEqual([])
    })
  })
})

/**
 * 维护者 2026-09-04 重构 · 设计文档 §31
 *
 * buildUnifiedTree 行为约定：
 *   - 个人知识中心（withVirtualRoot=true）：不再包裹「目录」伪根，真实目录/根级笔记直接平铺在顶层
 *   - 项目模式（withVirtualRoot=false）：直接返回真实目录根
 *   - note 节点 kind='note'，folder 节点 kind='folder'，PROJECT_ROOT kind='project-root'
 */
describe('KnowledgeTreeView 统一树（2026-09-04 重构 · 设计文档 §31）', () => {
  describe('buildUnifiedTree · 个人中心 withVirtualRoot', () => {
    it('空数据：无伪根，直接为空', () => {
      const tree = buildUnifiedTree([], [], { withVirtualRoot: true })
      expect(tree).toHaveLength(0)
    })

    it('真实目录+根级笔记平铺在顶层，无「目录」伪根', () => {
      const folders = [mkFolder(1, null, '工作笔记'), mkFolder(2, 1, '经验')]
      const notes = [
        mkNote(100, { folderId: 1 }),
        mkNote(101, { folderId: null }), // 根级笔记
      ]
      const tree = buildUnifiedTree(folders, notes, { withVirtualRoot: true })
      expect(tree).toHaveLength(2) // 文件夹 + 根级笔记，都在顶层
      const workFolder = tree[0]
      expect(workFolder.id).toBe(1)
      expect(workFolder.kind).toBe('folder')
      expect(workFolder.children).toHaveLength(2) // 子目录 + 知识
      expect(tree[1].kind).toBe('note') // 根级笔记直接平铺
      expect(tree[1].id).toBe(101)
    })
  })

  describe('buildUnifiedTree · 项目模式 without virtualRoot', () => {
    it('PROJECT_ROOT 节点 kind=project-root', () => {
      const folders = [mkFolder(7, null, '项目A', 'PROJECT_ROOT')]
      const tree = buildUnifiedTree(folders, [])
      expect(tree).toHaveLength(1)
      expect(tree[0].kind).toBe('project-root')
    })

it('无限层级：三层目录正确嵌套', () => {
      const folders = [
        mkFolder(1, null, 'L1'),
        mkFolder(2, 1, 'L2'),
        mkFolder(3, 2, 'L3'),
      ]
      const tree = buildUnifiedTree(folders, [])
      expect(tree[0].id).toBe(1)
      expect(tree[0].children[0].id).toBe(2)
      expect(tree[0].children[0].children[0].id).toBe(3)
    })

    it('项目根下直接新建的知识（folderId=null）必须展示，不被丢弃', () => {
      const folders = [mkFolder(7, null, '项目A', 'PROJECT_ROOT')]
      const notes = [mkNote(100, { folderId: null })] // 项目根新建 → folderId=null
      const tree = buildUnifiedTree(folders, notes) // withVirtualRoot 默认 false
      const noteNode = tree.find((n) => n.kind === 'note' && n.id === 100)
      expect(noteNode).toBeDefined()
    })
  })
})
