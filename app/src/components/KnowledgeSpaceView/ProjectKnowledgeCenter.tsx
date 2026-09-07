/**
 * PMTool · 项目知识中心（2026-09-04 重构 · 设计文档 §15 · §31）
 *
 * 容器：单项目知识中心，使用统一 KnowledgeTreeView（两栏）。
 * 项目知识中心 UI 结构与个人知识中心一致；项目根节点（PROJECT_ROOT）只允许
 * 删除 / 添加子目录，不能直接新建知识（设计文档 §16）。
 */

import { KnowledgeTreeView } from './KnowledgeTreeView'

interface ProjectKnowledgeCenterProps {
  projectId: number
  projectName: string
}

export function ProjectKnowledgeCenter({ projectId, projectName }: ProjectKnowledgeCenterProps) {
  return (
    <KnowledgeTreeView
      mode="project"
      projectId={projectId}
      projectName={projectName}
      emptyHint="该项目尚未在知识中心添加知识库，请前往「知识中心 → 项目知识中心」添加项目后新建目录与知识"
    />
  )
}

export default ProjectKnowledgeCenter
