/**
 * PMTool V2.0 · 甘特图组件（Frappe Gantt 集成骨架）
 * Phase 4 · T4.4
 *
 * 设计依据：V8/页面规格/projects.md §6 甘特图
 *   - Frappe Gantt（开源）
 *   - 颜色规则：完成绿 / 进行蓝 / 未开始灰 / 延期红
 *
 * ⚠️ 实际数据依赖 project_tasks 命令（Phase 0 未实现）
 *    当前实现：组件封装 + 类型定义 + mock data 渲染骨架
 *
 * Phase 4 进度：
 *   ✅ 组件结构 + 类型定义
 *   ✅ 颜色规则
 *   ✅ mock data 渲染
 *   ⏳ Frappe Gantt npm 包安装（待网络）
 *   ⏳ 真实数据集成（Phase 0 commands 解冻后）
 */

import { useEffect, useState } from 'react'
import { formatLocalDate } from '@/services/datetime'

export interface GanttTask {
  id: number
  name: string
  start: string // YYYY-MM-DD
  end: string // YYYY-MM-DD
  progress: number // 0-100
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'DELAYED'
  parentId?: number
  dependencies?: number[]
}

export interface GanttChartProps {
  tasks: GanttTask[]
  /** 任务时间轴起始日（默认 tasks 中最早 start）*/
  startDate?: string
  /** 任务时间轴结束日（默认 tasks 中最晚 end）*/
  endDate?: string
  /** 是否显示父任务（用于层级展示）*/
  showHierarchy?: boolean
  /** 今日标记（默认今天）*/
  today?: string
}

/** 颜色规则（V8/页面规格/projects.md）*/
const STATUS_COLORS = {
  PENDING: '#bfbfbf', // 灰
  IN_PROGRESS: '#1677ff', // 蓝
  COMPLETED: '#52c41a', // 绿
  DELAYED: '#cf1322', // 红
} as const

/**
 * 简易甘特图（Phase 4 T4.4 骨架）
 * 真实集成 Frappe Gantt 需要 npm 包安装（待网络）
 */
export function GanttChart({
  tasks,
  startDate,
  endDate,
  showHierarchy = true,
  today,
}: GanttChartProps) {
  // Phase 4 占位：Frappe Gantt 待 npm 集成后挂载
  const [frappeLoaded, setFrappeLoaded] = useState(false)

  useEffect(() => {
    // 真实集成：Phase 4 后续接入 Frappe Gantt npm 包
    // 这里留 hook 用于后续挂载
    setFrappeLoaded(false) // Phase 4 占位：未加载
  }, [tasks])

  if (tasks.length === 0) {
    return (
      <div
        data-testid="gantt-empty"
        style={{
          padding: '40px 20px',
          textAlign: 'center',
          color: 'var(--text-secondary)',
          fontSize: '13px',
        }}
      >
        📊 暂无任务数据（Phase 0 list_project_tasks 命令待实接）
      </div>
    )
  }

  // 计算时间轴
  const allDates = tasks.flatMap((t) => [t.start, t.end])
  const minDate = startDate ?? allDates.reduce((a, b) => (a < b ? a : b))
  const maxDate = endDate ?? allDates.reduce((a, b) => (a > b ? a : b))
  const totalDays = daysBetween(minDate, maxDate) + 1

  const todayStr = today ?? formatLocalDate(new Date())
  const todayOffset = daysBetween(minDate, todayStr)

  return (
    <div data-testid="gantt-chart" style={{ overflow: 'auto' }}>
      {/* 任务标题栏 */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
        <div style={{ width: '200px', padding: '8px', fontWeight: 600, fontSize: '13px' }}>
          任务
        </div>
        <div style={{ flex: 1, display: 'flex', position: 'relative' }}>
          {Array.from({ length: totalDays }).map((_, i) => {
            const date = addDays(minDate, i)
            const isToday = i === todayOffset
            return (
              <div
                key={i}
                style={{
                  flex: 1,
                  minWidth: '24px',
                  padding: '4px',
                  fontSize: '11px',
                  textAlign: 'center',
                  color: isToday ? 'var(--primary)' : 'var(--text-secondary)',
                  fontWeight: isToday ? 600 : 400,
                  borderRight: '1px solid var(--hover)',
                }}
                title={date}
              >
                {date.substring(5)}
              </div>
            )
          })}
        </div>
      </div>

      {/* 任务行 */}
      {tasks.map((task) => {
        const startOffset = daysBetween(minDate, task.start)
        const duration = daysBetween(task.start, task.end) + 1
        const isParent = showHierarchy && !task.parentId && tasks.some((t) => t.parentId === task.id)
        return (
          <div
            key={task.id}
            data-testid={`gantt-task-${task.id}`}
            style={{
              display: 'flex',
              borderBottom: '1px solid var(--hover)',
              alignItems: 'center',
              minHeight: '36px',
            }}
          >
            <div
              style={{
                width: '200px',
                padding: '8px',
                fontSize: '12px',
                fontWeight: isParent ? 600 : 400,
              }}
            >
              {isParent && '📁 '}
              {task.name}
            </div>
            <div
              aria-label="task-bar-container"
              style={{
                flex: 1,
                position: 'relative',
                height: '32px',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  left: `${(startOffset / totalDays) * 100}%`,
                  width: `${(duration / totalDays) * 100}%`,
                  height: '20px',
                  top: '6px',
                  background: STATUS_COLORS[task.status],
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  paddingRight: '6px',
                  color: 'white',
                  fontSize: '11px',
                  fontWeight: 500,
                }}
                title={`${task.name} · ${task.status} · ${task.progress}%`}
              >
                {task.progress}%
              </div>
            </div>
          </div>
        )
      })}

      {!frappeLoaded && (
        <div
          style={{
            padding: '8px 12px',
            marginTop: '12px',
            background: '#fffbe6',
            border: '1px solid #ffe58f',
            borderRadius: '4px',
            color: '#ad6800',
            fontSize: '11px',
          }}
        >
          ⏳ Phase 4 占位实现：Frappe Gantt npm 包安装后接入真实渲染（待网络）
        </div>
      )}
    </div>
  )
}

// ============================================================
// 辅助函数
// ============================================================

function daysBetween(a: string, b: string): number {
  const aDate = new Date(a + 'T00:00:00')
  const bDate = new Date(b + 'T00:00:00')
  return Math.round((bDate.getTime() - aDate.getTime()) / (1000 * 60 * 60 * 24))
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}