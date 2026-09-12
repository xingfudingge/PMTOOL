/**
 * PMTool V2.0 顶部工具栏
 * Phase A 产品结构纠偏（2026-08-24 · 维护者拍板）
 *
 * 设计依据：
 *   - 头部仅保留：页面标题 / 全局搜索 / 主题切换 / 通知 / 头像
 *   - 头像菜单移除与 sidebar 重复的入口（设置 / AI 配置）
 *     改为保留：数据目录 / 备份恢复（这两项不进一级菜单）
 *   - 不用 emoji · 统一 Lucide
 */

import type { ReactNode } from 'react'
import {
  Search,
  Sun,
  Moon,
  Bell,
  Keyboard,
} from 'lucide-react'
import type { PageId } from '../App'

interface TopBarProps {
  currentPage: PageId
  theme: 'light' | 'dark'
  onToggleTheme: () => void
}

const PAGE_TITLE: Record<PageId, string> = {
  home: '主工作区',
  todo: '任务中心',
  projects: '项目中心',
  projectDetail: '项目详情',
  reports: '报告中心',
  knowledge: '知识中心',
  templates: '模板中心',
  settings: '设置中心',
}

export function TopBar({ currentPage, theme, onToggleTheme }: TopBarProps) {
  return (
    <header
      style={{
        height: 'var(--topbar-height)',
        background: 'var(--color-surface)',
        borderBottom: '1px solid var(--color-border-thin)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 20px',
        gap: '16px',
        flexShrink: 0,
      }}
    >
      {/* 当前页面标题 */}
      <div
        style={{
          fontSize: '13.5px',
          fontWeight: 500,
          color: 'var(--color-text)',
          letterSpacing: '-0.005em',
          minWidth: '80px',
        }}
      >
        {PAGE_TITLE[currentPage]}
      </div>

      {/* 全局搜索 */}
      <div
        style={{
          flex: 1,
          maxWidth: '480px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '0 10px',
          height: '30px',
          background: 'var(--color-bg-subtle)',
          border: '1px solid var(--color-border-thin)',
          borderRadius: 'var(--radius)',
          transition: 'border-color 0.12s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'var(--color-border)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--color-border-thin)'
        }}
      >
        <Search size={14} strokeWidth={1.75} color="var(--color-text-tertiary)" />
        <input
          type="search"
          placeholder="搜索项目 / 任务 / 知识..."
          data-testid="topbar-search"
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            background: 'transparent',
            fontSize: '13px',
            color: 'var(--color-text)',
          }}
        />
        <kbd
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '1px 5px',
            fontSize: '10.5px',
            fontFamily: 'var(--font-mono)',
            color: 'var(--color-text-tertiary)',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border-thin)',
            borderRadius: '3px',
          }}
        >
          ⌘K
        </kbd>
      </div>

      {/* 右侧按钮组 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '2px',
          marginLeft: 'auto',
        }}
      >
        <IconButton
          data-testid="topbar-shortcuts"
          title="快捷键速查"
        >
          <Keyboard size={15} strokeWidth={1.75} />
        </IconButton>

        <IconButton
          data-testid="topbar-theme"
          title={theme === 'light' ? '切换深色模式' : '切换浅色模式'}
          onClick={onToggleTheme}
        >
          {theme === 'light' ? (
            <Moon size={15} strokeWidth={1.75} />
          ) : (
            <Sun size={15} strokeWidth={1.75} />
          )}
        </IconButton>

        <IconButton
          data-testid="topbar-notifications"
          title="通知"
        >
          <Bell size={15} strokeWidth={1.75} />
        </IconButton>
      </div>
    </header>
  )
}

interface IconButtonProps {
  children: ReactNode
  onClick?: () => void
  title?: string
  'data-testid'?: string
}

function IconButton({ children, onClick, title, 'data-testid': testId }: IconButtonProps) {
  return (
    <button
      onClick={onClick}
      title={title}
      data-testid={testId}
      aria-label={title}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '30px',
        height: '30px',
        borderRadius: 'var(--radius)',
        color: 'var(--color-text-secondary)',
        transition: 'background-color 0.12s, color 0.12s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--color-bg-hover)'
        e.currentTarget.style.color = 'var(--color-text)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
        e.currentTarget.style.color = 'var(--color-text-secondary)'
      }}
    >
      {children}
    </button>
  )
}

