/**
 * PMTool V2.0 左侧导航
 * 维护者 2026-08-24 拍板：8 大模块名固定，不允许自行调整
 *   1. 主工作区
 *   2. 待办中心
 *   3. 项目中心
 *   4. 报告中心
 *   5. 知识中心
 *   6. 模板中心
 *   7. AI助手
 *   8. 设置中心
 * 不用 emoji · 统一 Lucide
 */

import {
  Home,
  CheckSquare,
  FolderKanban,
  BarChart3,
  BookOpen,
  LayoutTemplate,
  Sparkles,
  Settings as SettingsIcon,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react'
import type { PageId } from '../App'
import { PMToolLogo } from './PMToolLogo'

interface SidebarProps {
  currentPage: PageId
  onNavigate: (page: PageId) => void
  collapsed: boolean
  onToggleCollapse: () => void
}

interface NavItem {
  id: PageId
  label: string
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number }>
}

// 8 大模块名固定 · 按维护者 2026-08-24 拍板
// 主工作区固定在最上面
const NAV_ITEMS: NavItem[] = [
  { id: 'home', label: '主工作区', Icon: Home },
  { id: 'todo', label: '任务中心', Icon: CheckSquare },
  { id: 'projects', label: '项目中心', Icon: FolderKanban },
  { id: 'reports', label: '报告中心', Icon: BarChart3 },
  { id: 'knowledge', label: '知识中心', Icon: BookOpen },
  { id: 'templates', label: '模板中心', Icon: LayoutTemplate },
  { id: 'ai', label: 'AI助手', Icon: Sparkles },
  { id: 'settings', label: '设置中心', Icon: SettingsIcon },
]

interface NavButtonProps {
  item: NavItem
  active: boolean
  collapsed: boolean
  onClick: () => void
}

function NavButton({ item, active, collapsed, onClick }: NavButtonProps) {
  const { Icon, label } = item
  return (
    <button
      onClick={onClick}
      data-testid={`nav-${item.id}`}
      title={collapsed ? label : undefined}
      aria-label={label}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        width: '100%',
        padding: collapsed ? '8px' : '7px 10px',
        justifyContent: collapsed ? 'center' : 'flex-start',
        borderRadius: 'var(--radius)',
        fontSize: '13px',
        fontWeight: active ? 500 : 400,
        textAlign: 'left',
        background: active ? 'var(--color-bg-active)' : 'transparent',
        color: active ? 'var(--color-text)' : 'var(--color-text-secondary)',
        transition: 'background-color 0.12s, color 0.12s',
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = 'var(--color-bg-hover)'
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = 'transparent'
      }}
    >
      <Icon size={15} strokeWidth={1.75} />
      {!collapsed && <span style={{ flex: 1 }}>{label}</span>}
    </button>
  )
}

export function Sidebar({ currentPage, onNavigate, collapsed, onToggleCollapse }: SidebarProps) {
  const width = collapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)'
  return (
    <aside
      style={{
        width,
        minWidth: width,
        maxWidth: width,
        background: 'var(--color-bg-subtle)',
        borderRight: '1px solid var(--color-border-thin)',
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        transition: 'width 0.25s, min-width 0.25s, max-width 0.25s',
        flexShrink: 0,
      }}
    >
      {/* Logo 区 */}
      <div
        style={{
          height: 'var(--topbar-height)',
          padding: collapsed ? '0' : '0 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          borderBottom: '1px solid var(--color-border-thin)',
        }}
      >
        <PMToolLogo size={20} showText={!collapsed} />
        {!collapsed && (
          <button
            onClick={onToggleCollapse}
            data-testid="sidebar-collapse"
            aria-label="折叠侧栏"
            title="折叠侧栏 (⌘\\)"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '22px',
              height: '22px',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--color-text-tertiary)',
              transition: 'background-color 0.12s, color 0.12s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--color-bg-hover)'
              e.currentTarget.style.color = 'var(--color-text-secondary)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = 'var(--color-text-tertiary)'
            }}
          >
            <ChevronsLeft size={13} strokeWidth={1.75} />
          </button>
        )}
      </div>

      {/* 维护者 2026-08-31：nav 不加 flex:1，marginTop:auto 加在版本号 div 上
          —— 让版本号贴 sidebar 底部，nav 只占内容高度，避免底部一大块空白 */}
      {/* 2026-09-07：整个模块导航区块贴到侧栏最底部（marginTop:auto），主工作区仍是列表第一项 */}
      <nav
        style={{
          padding: collapsed ? '8px 6px' : '14px 30px',
          overflowY: 'auto',
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        }}
      >
        {NAV_ITEMS.map((item) => (
          <div key={item.id} style={{ marginBottom: '2px' }}>
            <NavButton
              item={item}
              active={currentPage === item.id}
              collapsed={collapsed}
              onClick={() => onNavigate(item.id)}
            />
          </div>
        ))}

        {/* 折叠态：展开按钮 */}
        {collapsed && (
          <button
            onClick={onToggleCollapse}
            data-testid="sidebar-expand"
            aria-label="展开侧栏"
            title="展开侧栏 (⌘\\)"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              height: '30px',
              marginTop: '8px',
              borderRadius: 'var(--radius)',
              color: 'var(--color-text-tertiary)',
              transition: 'background-color 0.12s, color 0.12s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--color-bg-hover)'
              e.currentTarget.style.color = 'var(--color-text-secondary)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = 'var(--color-text-tertiary)'
            }}
          >
            <ChevronsRight size={13} strokeWidth={1.75} />
          </button>
        )}
      </nav>

      {/* 2026-09-07：移除版本号区域（无用信息） */}
    </aside>
  )
}
