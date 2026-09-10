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

import { useEffect, useRef, useState } from 'react'
import {
  Search,
  Sun,
  Moon,
  Bell,
  Keyboard,
  ChevronDown,
  FolderOpen,
  Cpu,
  History,
  type LucideIcon,
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
  ai: 'AI助手',
  settings: '设置中心',
}

export function TopBar({ currentPage, theme, onToggleTheme }: TopBarProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // 点击外部关闭菜单
  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

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

        {/* 用户头像 + 下拉菜单 */}
        <div ref={menuRef} style={{ position: 'relative', marginLeft: '6px' }}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            data-testid="topbar-user"
            aria-label="用户菜单"
            aria-expanded={menuOpen}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '3px 8px 3px 3px',
              borderRadius: '99px',
              background: menuOpen ? 'var(--color-bg-active)' : 'transparent',
              transition: 'background-color 0.12s',
            }}
            onMouseEnter={(e) => {
              if (!menuOpen) e.currentTarget.style.background = 'var(--color-bg-hover)'
            }}
            onMouseLeave={(e) => {
              if (!menuOpen) e.currentTarget.style.background = 'transparent'
            }}
          >
            <ChevronDown
              size={12}
              strokeWidth={2}
              color="var(--color-text-tertiary)"
              style={{
                transform: menuOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.15s',
              }}
            />
          </button>

          {/* 下拉菜单 */}
          {menuOpen && (
            <div
              data-testid="user-menu"
              style={{
                position: 'absolute',
                top: 'calc(100% + 6px)',
                right: 0,
                width: '260px',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
                padding: '4px',
                zIndex: 100,
              }}
            >
              {/* 用户信息 */}
              <div
                style={{
                  padding: '10px 12px',
                  borderBottom: '1px solid var(--color-border-thin)',
                  marginBottom: '4px',
                }}
              >
                <div style={{ fontSize: '13px', fontWeight: 500 }}>刘海东</div>
                <div
                  style={{
                    fontSize: '11px',
                    color: 'var(--color-text-tertiary)',
                    marginTop: '2px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <Cpu size={10} strokeWidth={1.75} />
                  <span style={{ fontFamily: 'var(--font-mono)' }}>
                    PM-DESKTOP-2H4F
                  </span>
                </div>
              </div>

              <MenuItem
                Icon={FolderOpen}
                label="数据目录"
                onClick={() => {
                  setMenuOpen(false)
                  // TODO Phase C: 打开数据目录
                }}
              />
              <MenuItem
                Icon={History}
                label="备份恢复"
                onClick={() => {
                  setMenuOpen(false)
                  // TODO Phase C: 打开备份恢复
                }}
              />
              <div
                style={{
                  height: '1px',
                  background: 'var(--color-border-thin)',
                  margin: '4px 8px',
                }}
              />
              <MenuItem
                Icon={theme === 'light' ? Moon : Sun}
                label={theme === 'light' ? '深色模式' : '浅色模式'}
                onClick={() => {
                  setMenuOpen(false)
                  onToggleTheme()
                }}
              />
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

interface IconButtonProps {
  children: React.ReactNode
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

interface MenuItemProps {
  Icon: LucideIcon
  label: string
  shortcut?: string
  onClick: () => void
}

function MenuItem({ Icon, label, shortcut, onClick }: MenuItemProps) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        width: '100%',
        padding: '8px 10px',
        borderRadius: 'var(--radius-sm)',
        fontSize: '13px',
        color: 'var(--color-text)',
        textAlign: 'left',
        transition: 'background-color 0.1s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--color-bg-hover)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
      }}
    >
      <Icon size={14} strokeWidth={1.75} color="var(--color-text-secondary)" />
      <span style={{ flex: 1 }}>{label}</span>
      {shortcut && (
        <kbd
          style={{
            fontSize: '10.5px',
            color: 'var(--color-text-tertiary)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {shortcut}
        </kbd>
      )}
    </button>
  )
}
