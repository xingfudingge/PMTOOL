/**
 * PMTool · 项目知识中心浏览器（维护者 2026-09-02 重构）
 *
 * 展示：所有项目的根目录列表（每个项目就是一个根目录）
 * 用途：在知识中心页面选择特定项目查看
 * 项目知识中心独立于个人知识中心，两者不共用一套数据
 */

import { useState, useCallback, useMemo, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Folder, FolderPlus, Plus, Trash2, Sparkles, ChevronRight, ChevronDown, Pencil, Check, X as XIcon, BookOpen } from 'lucide-react'
import type { Project } from '@/services/project'
import { listProjects } from '@/services/project'
import type { KnowledgeSpace } from '@/services/knowledgeSpaces'
import {
  listKnowledgeFolders,
  listKnowledgeNotes,
  listKnowledgeFoldersByProject,
  listKnowledgeNotesBySpaceType,
  deleteKnowledgeFolder,
  upsertKnowledgeNote,
  deleteKnowledgeNote,
  getKnowledgeNote,
  upsertKnowledgeFolder,
  ensureProjectKnowledgeLibrary,
  type KnowledgeNote as DbNote,
  type KnowledgeFolder as DbFolder,
} from '@/services/knowledge'
import { buildFolderTree, SYSTEM_AI_KNOWLEDGE_ID } from './tree'
import { importMarkdownFile } from './importMarkdown'

interface ProjectKnowledgeBrowserProps {
  onExported?: (path: string) => void
  onDeleted?: () => void
}

const treePanelStyle: React.CSSProperties = {
  width: 240,
  flexShrink: 0,
  borderRight: '1px solid var(--color-border-thin)',
  background: 'var(--color-bg-subtle)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
}

const listPanelStyle: React.CSSProperties = {
  width: 320,
  flexShrink: 0,
  borderRight: '1px solid var(--color-border-thin)',
  background: 'var(--color-bg)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
}

const editorPanelStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
  background: 'var(--color-bg)',
}

const btnPrimaryStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '4px 8px',
  background: 'var(--color-accent)',
  color: 'var(--color-text-on-accent)',
  borderRadius: 'var(--radius)',
  fontSize: 12,
  fontWeight: 500,
  border: 'none',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

const iconBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 20,
  height: 20,
  background: 'transparent',
  border: 'none',
  borderRadius: 3,
  cursor: 'pointer',
  color: 'var(--color-text-tertiary)',
  flexShrink: 0,
  padding: 0,
}

const emptyEditorStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  color: 'var(--color-text-tertiary)',
  fontSize: 13,
  gap: 12,
}

function noteRowStyle(active: boolean): React.CSSProperties {
  return {
    padding: '10px 14px',
    borderBottom: '1px solid var(--color-border-thin)',
    background: active ? 'var(--color-bg-subtle)' : 'transparent',
    cursor: 'pointer',
  }
}

export function ProjectKnowledgeBrowser({ onExported = () => {}, onDeleted = () => {} }: ProjectKnowledgeBrowserProps) {
  const [projects, setProjects] = useState<Project[]>([])
  const [folders, setFolders] = useState<DbFolder[]>([])
  const [notes, setNotes] = useState<DbNote[]>([])
  const [selection, setSelection] = useState<{ projectId: number | null; folderId: number | null }>({ projectId: null, folderId: null })
  const [activeNoteId, setActiveNoteId] = useState<number | null>(null)
  const [loadingNote, setLoadingNote] = useState<DbNote | null>(null)
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const [projectList, allFolders, allNotes] = await Promise.all([
        listProjects(),
        listKnowledgeFoldersByProject(0),
        listKnowledgeNotesBySpaceType('project'),
      ])
      setProjects(projectList)
      setFolders(allFolders)
      setNotes(allNotes)
    } catch (e) {
      console.error('[ProjectKnowledgeBrowser] reload failed:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void reload() }, [reload])

  // 按项目分组目录树
  const projectTree = useMemo(() => {
    const result: Array<{ projectId: number; projectName: string; folders: any[]; notes: any[] }> = []

    for (const p of projects) {
      const pfolders = folders.filter((f) => f.projectId === p.id)
      // 重构后：通过 spaceId 关联，需要获取项目对应的知识空间 ID
      const spaceId = p.id // 简化：假设项目 ID = 知识空间 ID（需要实际 API 支持）
      const pnotes = notes.filter((n) => n.spaceId === spaceId)

      // 过滤系统根目录（name === projectName 的根目录）
      const sysRoot = pfolders.find((f) => f.parentId == null && f.name === p.project_name)
      const filteredFolders = sysRoot
        ? pfolders.filter((f) => f.id !== sysRoot.id)
        : pfolders

      result.push({
        projectId: p.id,
        projectName: p.project_name,
        folders: filteredFolders,
        notes: pnotes,
      })
    }

    return result
  }, [projects, folders, notes])

  const filteredNotes = useMemo(() => {
    if (!selection.projectId) return []
    const projectData = projectTree.find((p) => p.projectId === selection.projectId)
    if (!projectData) return []

    const pnotes = projectData.notes
    if (selection.folderId === SYSTEM_AI_KNOWLEDGE_ID) {
      return pnotes.filter((n) => n.isAiGenerated)
    }
    if (selection.folderId != null) {
      return pnotes.filter((n) => n.folderId === selection.folderId && !n.isAiGenerated)
    }
    return pnotes.filter((n) => n.folderId == null && !n.isAiGenerated)
  }, [selection, projectTree])

  const [initialBlocks, setInitialBlocks] = useState<any[] | undefined>(undefined)

  const openNote = useCallback(async (note: DbNote) => {
    setActiveNoteId(note.id)
    setLoadingNote(note)
    setInitialBlocks(undefined)
    try {
      const fresh = await getKnowledgeNote(note.id)
      if (!fresh) {
        alert('笔记不存在或已被删除')
        setActiveNoteId(null)
        return
      }
      setLoadingNote(fresh)
      if (fresh.contentType === 'BLOCKNOTE_JSON' && fresh.content && fresh.content.trim()) {
        try {
          const parsed = JSON.parse(fresh.content)
          if (Array.isArray(parsed) && parsed.length > 0) {
            setInitialBlocks(parsed)
          } else {
            setInitialBlocks(undefined)
          }
        } catch {
          setInitialBlocks(undefined)
        }
      }
    } catch (e) {
      console.error('[ProjectKnowledgeBrowser] openNote failed:', e)
    }
  }, [])

  const handleNewNote = useCallback(async () => {
    if (!selection.projectId) return
    try {
      await ensureProjectKnowledgeLibrary(selection.projectId, projects.find(p => p.id === selection.projectId)?.project_name || '')
      // 获取项目知识空间 ID
      const spaces = await invoke<KnowledgeSpace[]>('list_project_knowledge_spaces', { projectId: selection.projectId })
      const projectSpace = spaces[0]
      if (!projectSpace) {
        throw new Error('未找到项目知识空间')
      }

      const created = await upsertKnowledgeNote({
        spaceId: projectSpace.id,
        space: 'project',
        title: '未命名笔记',
        content: '[]',
        contentType: 'BLOCKNOTE_JSON',
        contentMd: '',
        pinned: false,
        folderId: selection.folderId && selection.folderId > 0 ? selection.folderId : null,
        sourceType: 'USER',
        isAiGenerated: false,
      })
      await reload()
      openNote(created)
    } catch (e) {
      alert(`新建笔记失败：${e}`)
    }
  }, [selection, projects, reload, openNote])

  const handleDeleteNote = useCallback(async (id: number) => {
    if (!window.confirm('确定删除这个笔记？')) return
    try {
      await deleteKnowledgeNote(id)
      await reload()
      if (activeNoteId === id) setActiveNoteId(null)
    } catch (e) {
      alert(`删除失败：${e}`)
    }
  }, [activeNoteId, reload])

  const handleImport = useCallback(async () => {
    if (!selection.projectId) return
    setImporting(true)
    try {
      // 获取项目知识空间 ID
      const spaces = await invoke<KnowledgeSpace[]>('list_project_knowledge_spaces', { projectId: selection.projectId })
      const projectSpace = spaces[0]
      if (!projectSpace) {
        throw new Error('未找到项目知识空间')
      }

      const created = await importMarkdownFile({
        space: 'project',
        projectId: selection.projectId,
        spaceId: projectSpace.id,
      })
      if (created) {
        await reload()
        openNote(created)
      }
    } catch (e) {
      alert(`导入失败：${e}`)
    } finally {
      setImporting(false)
    }
  }, [selection.projectId, reload, openNote])

  const activeNote = loadingNote && loadingNote.id === activeNoteId ? loadingNote : null

  if (loading && projects.length === 0) {
    return <div style={{ padding: 32, color: 'var(--color-text-tertiary)' }}>加载中...</div>
  }

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* 左侧：项目 + 目录树 */}
      <aside style={treePanelStyle}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--color-border-thin)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)', flex: 1, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            项目知识
          </h3>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 6px 16px' }}>
          {projectTree.length === 0 ? (
            <div style={{ padding: 16, color: 'var(--color-text-tertiary)', fontSize: 12, textAlign: 'center' }}>
              暂无项目
            </div>
          ) : (
            projectTree.map((proj) => {
              const isActive = selection.projectId === proj.projectId
              const projTree = buildFolderTree(proj.folders, proj.notes)

              return (
                <div key={proj.projectId}>
                  <button
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 10px',
                      background: isActive ? 'var(--color-bg-active)' : 'transparent',
                      border: 'none',
                      borderRadius: 'var(--radius)',
                      width: '100%',
                      cursor: 'pointer',
                      color: isActive ? 'var(--color-text)' : 'var(--color-text-secondary)',
                      fontSize: 13,
                      fontWeight: isActive ? 500 : 400,
                    }}
                    onClick={() => setSelection({ projectId: proj.projectId, folderId: null })}
                  >
                    <BookOpen size={12} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                      {proj.projectName}
                    </span>
                  </button>

                  {isActive && (
                    <div style={{ paddingLeft: 12 }}>
                      {projTree.map((node) => (
                        <div key={node.id}>
                          <button
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                              padding: `4px 8px 4px ${6 + 0 * 14}px`,
                              fontSize: 12.5,
                              fontWeight: selection.folderId === node.id ? 500 : 400,
                              color: selection.folderId === node.id ? 'var(--color-text)' : 'var(--color-text-secondary)',
                              background: selection.folderId === node.id ? 'var(--color-bg-active)' : 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              textAlign: 'left',
                              width: '100%',
                              borderRadius: 'var(--radius)',
                            }}
                            onClick={() => setSelection({ projectId: proj.projectId, folderId: node.id })}
                          >
                            {node.id === SYSTEM_AI_KNOWLEDGE_ID ? (
                              <Sparkles size={11} color="#9333ea" />
                            ) : (
                              <Folder size={11} color="var(--color-text-tertiary)" />
                            )}
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                              {node.name}
                            </span>
                            {node.notes.length > 0 && (
                              <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)' }}>
                                {node.notes.length}
                              </span>
                            )}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </aside>

      {/* 中间：笔记列表 */}
      <aside style={listPanelStyle}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--color-border-thin)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)', flex: 1, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {selection.folderId == null
              ? '全部笔记'
              : selection.folderId === SYSTEM_AI_KNOWLEDGE_ID
                ? 'AI 生成'
                : folders.find((f) => f.id === selection.folderId)?.name ?? '目录'}
          </h3>
          <button
            type="button"
            onClick={handleImport}
            disabled={importing}
            title="导入本地 .md"
            style={iconBtnStyle}
          >
            <Folder size={12} />
          </button>
          <button
            type="button"
            onClick={handleNewNote}
            disabled={!selection.projectId}
            title="新建笔记"
            style={btnPrimaryStyle}
          >
            <Plus size={10} strokeWidth={2} />
            新建
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: 16, color: 'var(--color-text-tertiary)', fontSize: 12 }}>加载中...</div>
          ) : filteredNotes.length === 0 ? (
            <div style={{ padding: 16, color: 'var(--color-text-tertiary)', fontSize: 12, textAlign: 'center' }}>
              暂无笔记
            </div>
          ) : (
            filteredNotes.map((note) => (
              <div
                key={note.id}
                style={noteRowStyle(activeNoteId === note.id)}
                onClick={() => openNote(note)}
              >
                <span style={{
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontSize: 12.5,
                  color: activeNoteId === note.id ? 'var(--color-text)' : 'var(--color-text-secondary)',
                }}>
                  {note.title}
                </span>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* 右侧：编辑器 */}
      <div style={editorPanelStyle}>
        {activeNote ? (
          <div style={{ padding: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{activeNote.title}</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 16 }}>
              {activeNote.updatedAt}
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
              {activeNote.content}
            </div>
            <button
              style={{
                marginTop: 16,
                padding: '6px 12px',
                background: '#dc2626',
                color: 'white',
                border: 'none',
                borderRadius: 'var(--radius)',
                cursor: 'pointer',
              }}
              onClick={() => handleDeleteNote(activeNote.id)}
            >
              删除笔记
            </button>
          </div>
        ) : (
          <div style={emptyEditorStyle}>
            <BookOpen size={32} color="var(--color-text-tertiary)" />
            <div>选择或新建笔记开始编辑</div>
          </div>
        )}
      </div>
    </div>
  )
}
