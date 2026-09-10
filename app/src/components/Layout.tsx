/**
 * PMTool V2.0 主布局
 * Phase A 产品化整改 P0
 *
 * 设计依据：UI 产品化设计规格 Part 1 全局布局
 *
 * 三段式：
 *   - 顶部工具栏  48px
 *   - 中部（侧栏 + 主内容）flex
 *   - 底部状态栏  24px
 *
 * 主题系统：data-theme="light" | "dark"
 */

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { ToastHost } from './Toast'
import { useEditingMaximized, clearEditingMaximizedOnBoot } from './DocumentEditor/editingMaximized'
import { useSettings } from '@/state/SettingsProvider'
import type { PageId } from '../App'

interface LayoutProps {
  currentPage: PageId
  onNavigate: (page: PageId) => void
  children: ReactNode
}

export function Layout({ currentPage, onNavigate, children }: LayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const { resolvedTheme, save } = useSettings()
  // 维护者 2026-08-31：编辑区最大化 → 整窗 chrome（顶栏 / 侧栏 / 底栏）全折叠
  const editingMaximized = useEditingMaximized()

  // 维护者 2026-08-31 白屏修复：App 启动时强制清掉残留 maximized class
  // 否则 Layout 第一帧渲染就把整窗 chrome 折叠掉 → 看起来白屏
  useEffect(() => {
    clearEditingMaximizedOnBoot()
  }, [])


  // ⌘\\ 折叠侧栏
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault()
        setSidebarCollapsed((v) => !v)
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'l') {
        e.preventDefault()
        save('theme', resolvedTheme === 'dark' ? 'light' : 'dark')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [resolvedTheme, save])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        width: '100vw',
        background: 'var(--color-bg)',
        overflow: 'hidden',
      }}
    >
      {/* 维护者 2026-08-31：编辑区最大化时把顶栏收起（height:0 + overflow:hidden）*/}
      <div
        style={{
          height: editingMaximized ? 0 : 'auto',
          overflow: 'hidden',
          flexShrink: 0,
        }}
      >
        <TopBar
          currentPage={currentPage}
          theme={resolvedTheme}
          onToggleTheme={() => save('theme', resolvedTheme === 'dark' ? 'light' : 'dark')}
        />
      </div>
      <div
        style={{
          flex: 1,
          display: 'flex',
          minHeight: 0,
        }}
      >
        {/* 维护者 2026-08-31：编辑区最大化时把侧栏收起（width:0 + overflow:hidden）*/}
        <div
          style={{
            width: editingMaximized ? 0 : 'auto',
            overflow: 'hidden',
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <Sidebar
            currentPage={currentPage}
            onNavigate={onNavigate}
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
          />
        </div>
        <main
          style={{
            flex: 1,
            // 维护者 2026-08-31：main 恢复滚动能力 —— 计划管理 / 每周 / 知识中心 /
            // 项目成员 / 风险登记册 这些 tab 内容超过视口高度时依赖 page 级滚动条
            // FilesTab 的滚动独立性由 FilesTab 自己保证（它有 overflow:hidden +
            // flex:1 + minHeight:0），不需要 main 也隐藏
            overflow: 'auto',
            background: 'var(--color-bg)',
            minWidth: 0,
          }}
        >
          {children}
        </main>
      </div>
      {/* 2026-09-07：移除底部状态栏（无用） */}
      <ToastHost />
    </div>
  )
}
