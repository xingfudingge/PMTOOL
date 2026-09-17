/**
 * PMTool V2.0 · 报告生成器 reportBuilder.ts 自动化测试
 * 维护者 2026-09-17
 *
 * 覆盖：
 *   - buildProjectReportFromItems：项目日报"从该项目待办生成"（不依赖个人日报）
 *     · 有内容：今日/计划两段 + 编号
 *     · 空内容：两段都落「（暂无）」· 保留标题
 *     · 用户已带前缀（1、 / - ）自动剥离重编号
 */

import { describe, it, expect } from 'vitest'
import { buildProjectReportFromItems } from '@/services/reportBuilder'

describe('reportBuilder · buildProjectReportFromItems', () => {
  it('有内容：今日/计划两段 + 从 1 重新编号', () => {
    const out = buildProjectReportFromItems('daily', ['写报告', '开会'], ['明天任务'])
    expect(out).toBe('今日工作内容：\n1、写报告\n2、开会\n\n下个工作日计划：\n1、明天任务')
  })

  it('空内容：两段都落（暂无）· 但保留两段标题', () => {
    const out = buildProjectReportFromItems('daily', [], [])
    expect(out).toBe('今日工作内容：\n（暂无）\n\n下个工作日计划：\n（暂无）')
  })

  it('用户已带前缀（1、 / - ）自动剥离并重编号', () => {
    const out = buildProjectReportFromItems('daily', ['1、已编号', '- 带横线'], ['· 带点'])
    expect(out).toBe('今日工作内容：\n1、已编号\n2、带横线\n\n下个工作日计划：\n1、带点')
  })

  it('周报标题用「本周工作内容 / 下周工作计划」', () => {
    const out = buildProjectReportFromItems('weekly', ['a'], [])
    expect(out).toBe('本周工作内容：\n1、a\n\n下周工作计划：\n（暂无）')
  })
})
