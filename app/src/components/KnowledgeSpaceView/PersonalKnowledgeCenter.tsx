/**
 * PMTool · 个人知识中心（2026-09-04 重构 · 设计文档 §4 · §31）
 *
 * 仅作为容器，转发到统一的 KnowledgeTreeView 两栏组件。
 * 旧的三栏（树 + 中间笔记列表 + 编辑区）已删除：知识节点直接嵌入树（📄），点开右侧编辑。
 */

import { KnowledgeTreeView } from './KnowledgeTreeView'

export function PersonalKnowledgeCenter() {
  return (
    <KnowledgeTreeView
      mode="personal"
      emptyHint="选中知识节点开始编辑，或点 ⋯ 新建"
    />
  )
}

export default PersonalKnowledgeCenter
