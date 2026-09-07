/**
 * PMTool · 项目知识中心（2026-09-04 重构 · 设计文档 §15 · §31）
 *
 * 容器：单个知识空间（知识库）的两栏树。
 * 一库多项目（M:N）：可直接传入 spaceId 精确展示某个共享知识库，
 * 不依赖项目 id 解析（项目可能绑定多个知识库）。
 */

import { KnowledgeTreeView } from './KnowledgeTreeView'

interface ProjectKnowledgeCenterProps {
  /** 要展示的知识库空间 id（一库多项目：精确指定，优先于 projectId） */
  spaceId?: number
  projectId?: number
  projectName?: string
}

export function ProjectKnowledgeCenter({
  spaceId,
  projectId,
  projectName,
}: ProjectKnowledgeCenterProps) {
  return (
    <KnowledgeTreeView
      mode="project"
      spaceId={spaceId}
      projectId={projectId}
      projectName={projectName}
      emptyHint="该知识库尚未添加内容，回到「项目知识中心」新建知识库后添加目录与知识"
    />
  )
}

export default ProjectKnowledgeCenter
