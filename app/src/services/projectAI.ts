/**
 * PMTool V2.0 · ProjectAIProvider 接口设计
 * Phase 4 · T4.6
 *
 * 设计依据：V8/页面规格/projects.md §6.5 + RFC-03 §4
 *   - 模型只能调用只读、参数化的业务查询工具
 *   - 禁止模型：写库 / 删除文件 / 发送邮件 / 提交 SQL
 *   - AI 输出写入草稿，用户确认后才保存或导出
 *
 * 维护者 T4.6 原话：
 *   "ProjectAIProvider 接口，支持：项目总结 / 风险分析 / 汇报材料生成
 *    模型调用放 AI 助手统一实现。"
 *
 * Phase 4 仅设计接口 + Mock 实现 · 不接 AI 模型
 * 模型调用由 Phase 8 AI 助手统一实现
 */

export type ProjectAIType = 'SUMMARY' | 'RISK_ANALYSIS' | 'REPORT_GENERATION'

export interface ProjectAIInput {
  projectId: number
  /** 可选上下文：当前对话 / 当前项目 / 选定文档 */
  dataScope?: 'CURRENT_PROJECT' | 'SELECTED_DOCS'
  /** 选定文档 ID 列表（dataScope=SELECTED_DOCS 时使用）*/
  docIds?: number[]
  /** 额外提示词（用户输入）*/
  prompt?: string
}

export interface ProjectAIOutput {
  /** 生成内容 */
  content: string
  /** 类型 */
  type: ProjectAIType
  /** 是否为草稿（必须用户确认）*/
  isDraft: true
  /** 关联项目 ID */
  projectId: number
  /** 生成时间戳 */
  generatedAt: string
}

export interface ProjectAIProvider {
  /** AI 类型 → 调用入口 */
  generate(input: ProjectAIInput, type: ProjectAIType): Promise<ProjectAIOutput>
}

/**
 * MockProjectAIProvider（Phase 4 占位）
 * 返回占位字符串，实际 AI 模型调用由 Phase 8 实现
 */
export class MockProjectAIProvider implements ProjectAIProvider {
  async generate(input: ProjectAIInput, type: ProjectAIType): Promise<ProjectAIOutput> {
    const content = `[Mock ${type}] 项目 #${input.projectId} 占位输出
（Phase 8 AI 助手统一实现模型调用，此处仅接口骨架）`

    return {
      content,
      type,
      isDraft: true, // ⚠️ 必须是草稿（RFC-03 §4）
      projectId: input.projectId,
      generatedAt: new Date().toISOString(),
    }
  }
}

/** 默认 Provider（Mock · Phase 4）*/
export const defaultProjectAIProvider: ProjectAIProvider = new MockProjectAIProvider()

/**
 * 便捷函数：项目总结
 */
export async function generateProjectSummary(
  projectId: number,
  dataScope?: 'CURRENT_PROJECT' | 'SELECTED_DOCS',
): Promise<ProjectAIOutput> {
  return defaultProjectAIProvider.generate(
    { projectId, dataScope: dataScope ?? 'CURRENT_PROJECT' },
    'SUMMARY',
  )
}

/**
 * 便捷函数：风险分析
 */
export async function analyzeProjectRisk(
  projectId: number,
  dataScope?: 'CURRENT_PROJECT' | 'SELECTED_DOCS',
): Promise<ProjectAIOutput> {
  return defaultProjectAIProvider.generate(
    { projectId, dataScope: dataScope ?? 'CURRENT_PROJECT' },
    'RISK_ANALYSIS',
  )
}

/**
 * 便捷函数：汇报材料生成
 */
export async function generateProjectReport(
  projectId: number,
  prompt?: string,
): Promise<ProjectAIOutput> {
  return defaultProjectAIProvider.generate(
    { projectId, dataScope: 'CURRENT_PROJECT', prompt },
    'REPORT_GENERATION',
  )
}