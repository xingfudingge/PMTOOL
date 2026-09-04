/**
 * PMTool · KnowledgeSpaceView 目录树逻辑测试（维护者 2026-08-31）
 *
 * 覆盖：
 *   - buildFolderTree 拼出正确层级 + 追加 2 个系统虚拟节点
 *   - AI 知识节点 (id=-1) 只聚合 isAiGenerated=true 的 notes
 *   - 未分类节点 (id=0) 聚合 folderId=null 的 notes
 *   - filterNotesByFolder 按选中目录返回正确子集
 *   - isSystemFolderId 正确识别系统目录
 */

import { describe, it, expect } from 'vitest'
import {
  buildFolderTree,
  filterNotesByFolder,
  isSystemFolderId,
  SYSTEM_AI_KNOWLEDGE_ID,
} from '../tree'
import type {
  KnowledgeNote as DbNote,
  KnowledgeFolder as DbFolder,
} from '@/services/knowledge'

function mkFolder(id: number, parentId: number | null = null, name = `f${id}`): DbFolder {
  return {
    id,
    parentId,
    space: 'personal',
    projectId: null,
    name,
    sortOrder: 0,
    systemType: 'USER',
    createdAt: '',
    updatedAt: '',
  }
}

function mkNote(
    id: number,
    opts: Partial<DbNote> = {},
  ): DbNote {
  // 维护者 2026-08-31：DbNote 是严格类型（isAiGenerated: boolean, sourceType: string）
  // opts 必须用完整字段类型，避免 spread 时类型推断失败
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
    isAiGenerated: opts.isAiGenerated ?? false,
    createdBy: null,
    createdAt: '',
    updatedAt: '',
  }
}

describe('KnowledgeSpaceView 目录树逻辑（维护者 2026-08-31）', () => {
  describe('isSystemFolderId', () => {
    it('识别 AI 知识目录为系统目录', () => {
      expect(isSystemFolderId(0)).toBe(false)
      expect(isSystemFolderId(-1)).toBe(true)
    })
    it('正数 id 不是系统目录', () => {
      expect(isSystemFolderId(1)).toBe(false)
      expect(isSystemFolderId(99)).toBe(false)
    })
    it('null / undefined 不是系统目录', () => {
      expect(isSystemFolderId(null)).toBe(false)
      expect(isSystemFolderId(undefined)).toBe(false)
    })
  })

  describe('buildFolderTree', () => {
    it('空数据：只返回 AI 知识虚拟目录', () => {
      const tree = buildFolderTree([], [])
      expect(tree).toHaveLength(1)
      expect(tree[0].id).toBe(SYSTEM_AI_KNOWLEDGE_ID)
      expect(tree[0].name).toBe('AI 知识')
      expect(tree[0].isSystem).toBe(true)
    })

    it('真实目录挂在根，children 正确嵌套', () => {
      const folders = [mkFolder(1, null, '工作笔记'), mkFolder(2, 1, '经验'), mkFolder(3, null, '模板')]
      const tree = buildFolderTree(folders, [])
      // 2 个真实根（id=1 / id=3）+ AI 系统根 = 3
      expect(tree).toHaveLength(3)
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
        mkNote(102, { folderId: null }), // 不再展示“未分类”目录
      ]
      const tree = buildFolderTree(folders, notes)
      const rootA = tree.find((n) => n.id === 1)!
      expect(rootA.notes).toHaveLength(2)
    })

    it('AI 笔记归到 AI 知识虚拟节点（不进未分类）', () => {
      const notes = [
        mkNote(1, { isAiGenerated: false }),
        mkNote(2, { isAiGenerated: true }),
        mkNote(3, { isAiGenerated: true }),
      ]
      const tree = buildFolderTree([], notes)
      const ai = tree.find((n) => n.id === SYSTEM_AI_KNOWLEDGE_ID)!
      expect(ai.notes.map((n) => n.id).sort()).toEqual([2, 3])
      expect(ai.isSystem).toBe(true)
    })

    it('AI 笔记即使 folderId=null 也仍归 AI 知识', () => {
      const notes = [mkNote(1, { folderId: null, isAiGenerated: true })]
      const tree = buildFolderTree([], notes)
      const ai = tree.find((n) => n.id === SYSTEM_AI_KNOWLEDGE_ID)!
      expect(ai.notes.map((n) => n.id)).toEqual([1])
    })

    it('AI 节点永远在最后（树渲染顺序）', () => {
      const folders = [mkFolder(1, null, 'A'), mkFolder(2, null, 'B')]
      const tree = buildFolderTree(folders, [])
      expect(tree[tree.length - 1].id).toBe(SYSTEM_AI_KNOWLEDGE_ID)
      expect(tree[tree.length - 1].isSystem).toBe(true)
    })

    it('孤儿 folderId 的 note 不展示在虚拟目录中', () => {
      const notes = [mkNote(1, { folderId: 999 })] // 999 不存在
      const tree = buildFolderTree([], notes)
      expect(tree.find((n) => n.id === 999)).toBeUndefined()
    })
  })

  describe('filterNotesByFolder', () => {
    const notes = [
      mkNote(1, { folderId: null, isAiGenerated: false }),
      mkNote(2, { folderId: 5, isAiGenerated: false }),
      mkNote(3, { folderId: null, isAiGenerated: true }),
      mkNote(4, { folderId: 5, isAiGenerated: true }),
    ]

    it('未选择目录时不返根级笔记', () => {
      const out = filterNotesByFolder(notes, 0)
      expect(out.map((n) => n.id)).toEqual([])
    })

    it('AI 知识（-1）只返 isAiGenerated=true 的（不管 folderId）', () => {
      const out = filterNotesByFolder(notes, -1)
      expect(out.map((n) => n.id).sort()).toEqual([3, 4])
    })

    it('真实目录 id 返 folderId=id 的', () => {
      const out = filterNotesByFolder(notes, 5)
      expect(out.map((n) => n.id)).toEqual([2])
    })

    it('null 不展示笔记', () => {
      const out = filterNotesByFolder(notes, null)
      expect(out.map((n) => n.id)).toEqual([])
    })
  })
})
