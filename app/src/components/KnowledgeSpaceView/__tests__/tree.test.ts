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
  buildUnifiedTree,
  filterNotesByFolder,
  isSystemFolderId,
  SYSTEM_AI_KNOWLEDGE_ID,
} from '../tree'
import type {
  KnowledgeNote as DbNote,
  KnowledgeFolder as DbFolder,
} from '@/services/knowledge'

function mkFolder(id: number, parentId: number | null = null, name = `f${id}`, systemType: 'USER' | 'SYSTEM_AI' | 'PROJECT_ROOT' = 'USER'): DbFolder {
  return {
    id,
    parentId,
    space: 'personal',
    projectId: null,
    name,
    sortOrder: 0,
    systemType,
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

/**
 * 维护者 2026-09-04 重构 · 设计文档 §31
 *
 * buildUnifiedTree 行为约定：
 *   - 个人知识中心（withVirtualRoot=true）：最上插“目录”虚拟根（kind='root'），
 *     子节点含全部真实目录 + 根级笔记 + AI 系统目录
 *   - 项目模式（withVirtualRoot=false）：直接返回真实目录根 + AI 系统目录
 *   - note 节点 kind='note'，folder 节点 kind='folder'，PROJECT_ROOT kind='project-root'
 *   - AI 系统目录（systemType='SYSTEM_AI'）kind='ai'，不可被父级嵌套，永远 root
 *   - AI 笔记只能挂在 AI 系统目录下
 */
describe('KnowledgeTreeView 统一树（2026-09-04 重构 · 设计文档 §31）', () => {
  describe('buildUnifiedTree · 个人中心 withVirtualRoot', () => {
    it('空数据：仅返回虚拟根「目录」', () => {
      const tree = buildUnifiedTree([], [], { withVirtualRoot: true })
      expect(tree).toHaveLength(1)
      expect(tree[0].kind).toBe('root')
      expect(tree[0].name).toBe('目录')
      expect(tree[0].isSystem).toBe(true)
      expect(tree[0].children).toHaveLength(0)
    })

    it('真实目录嵌套 + 根级笔记合并到「目录」虚拟根', () => {
      const folders = [mkFolder(1, null, '工作笔记'), mkFolder(2, 1, '经验')]
      const notes = [
        mkNote(100, { folderId: 1 }),
        mkNote(101, { folderId: null }), // 根级笔记
      ]
      const tree = buildUnifiedTree(folders, notes, { withVirtualRoot: true })
      expect(tree).toHaveLength(1)
      const root = tree[0]
      // 虚拟根的 children：真实根目录 1 个（id=1）+ 根级笔记 1 个
      expect(root.children).toHaveLength(2)
      const workFolder = root.children.find((c) => c.id === 1)!
      expect(workFolder.kind).toBe('folder')
      // 工作笔记 → 经验 → 📄 知识
      expect(workFolder.children).toHaveLength(2) // 子目录 + 知识
    })

    it('AI 系统目录作为「目录」虚拟根的子节点，kind=ai', () => {
      const folders = [mkFolder(99, null, 'AI 生成', 'SYSTEM_AI')]
      const tree = buildUnifiedTree(folders, [], { withVirtualRoot: true })
      const root = tree[0]
      const ai = root.children.find((c) => c.kind === 'ai')!
      expect(ai).toBeDefined()
      expect(ai.isSystem).toBe(true)
    })

    it('AI 笔记只挂在 AI 系统目录下，不污染其他目录', () => {
      const folders = [mkFolder(99, null, 'AI 生成', 'SYSTEM_AI'), mkFolder(1, null, 'A')]
      const notes = [
        mkNote(1, { folderId: 1 }),
        mkNote(2, { folderId: null, isAiGenerated: true }),
      ]
      const tree = buildUnifiedTree(folders, notes, { withVirtualRoot: true })
      const root = tree[0]
      const a = root.children.find((c) => c.id === 1)!
      const ai = root.children.find((c) => c.kind === 'ai')!
      // A 目录只有自己的普通笔记
      expect(a.children.filter((c) => c.kind === 'note').map((c) => c.id)).toEqual([1])
      // AI 目录有 AI 笔记
      expect(ai.children.filter((c) => c.kind === 'note').map((c) => c.id)).toEqual([2])
    })
  })

  describe('buildUnifiedTree · 项目模式 without virtualRoot', () => {
    it('PROJECT_ROOT 节点 kind=project-root', () => {
      const folders = [mkFolder(7, null, '项目A', 'PROJECT_ROOT')]
      const tree = buildUnifiedTree(folders, [])
      expect(tree).toHaveLength(1)
      expect(tree[0].kind).toBe('project-root')
    })

    it('AI 目录固定在末尾', () => {
      const folders = [
        mkFolder(1, null, 'A'),
        mkFolder(99, null, 'AI 生成', 'SYSTEM_AI'),
      ]
      const tree = buildUnifiedTree(folders, [])
      expect(tree[tree.length - 1].kind).toBe('ai')
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
  })
})
