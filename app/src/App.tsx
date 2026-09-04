/**
 * PMTool V2.0 桌面端主应用
 * Phase 0 · T0.3 UI 框架
 * Phase 1 · T1.4 启动流程改造（包裹 LicenseGuard）
 * Phase A · alpha 化（2026-08-24 · hash 路由 + 项目详情）
 *
 * 变更记录：
 *   - 2026-08-21（T0.3）：8 大模块 state-based 路由
 *   - 2026-08-22（T1.4）：包裹 LicenseGuard
 *   - 2026-08-24（alpha 化）：hash 路由 + projectDetail 支持
 */

import { useEffect, useState } from 'react'
import { Layout } from './components/Layout'
import { LicenseGuard } from './components/LicenseGuard'
import { RegenConfirmModal } from './components/RegenConfirmModal'
import { ReportGenProvider } from './services/reportGenerator'
import { HomePage } from './pages/HomePage'
import { TodoPage } from './pages/TodoPage'
import { ProjectsPage } from './pages/ProjectsPage'
import { ProjectDetailPage } from './pages/ProjectDetailPage'
import { ReportsPage } from './pages/ReportsPage'
import { KnowledgePage } from './pages/KnowledgePage'
import { TemplatesPage } from './pages/TemplatesPage'
import { AIPage } from './pages/AIPage'
import { SettingsPage } from './pages/SettingsPage'

export type PageId =
  | 'home'
  | 'todo'
  | 'projects'
  | 'projectDetail'
  | 'reports'
  | 'knowledge'
  | 'templates'
  | 'ai'
  | 'settings'

/**
 * 8 大模块固定顺序（按维护者 2026-08-24 拍板 · 命名不允许改）
 * 1. 主工作区 · 2. 待办中心 · 3. 项目中心 · 4. 报告中心
 * 5. 知识中心 · 6. 模板中心 · 7. AI助手 · 8. 设置中心
 */

/**
 * 解析 URL hash
 *   - "#/home"           → { page: 'home' }
 *   - "#/projects/3"     → { page: 'projectDetail', param: 3 }
 *   - "#/" or ""         → { page: 'home' }
 */
function parseHash(): { page: PageId; param?: number } {
  const h = window.location.hash.replace(/^#\/?/, '')
  const parts = h.split('/').filter(Boolean)
  const page = parts[0] || 'home'
  const param = parts[1] ? Number(parts[1]) : undefined
  if (page === 'projects' && param && !Number.isNaN(param)) {
    return { page: 'projectDetail', param }
  }
  return { page: page as PageId, param }
}

function App() {
  const [hashState, setHashState] = useState(parseHash())

  useEffect(() => {
    const onHashChange = () => setHashState(parseHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const navigate = (page: PageId, param?: number) => {
    const hash = param ? `#/${page}/${param}` : `#/${page}`
    window.location.hash = hash
  }

  const renderPage = () => {
    switch (hashState.page) {
      case 'home':
        return <HomePage />
      case 'todo':
        return <TodoPage />
      case 'projects':
        return (
          <ProjectsPage
            onOpenProject={(id) => navigate('projectDetail', id)}
          />
        )
      case 'projectDetail':
        return hashState.param ? (
          <ProjectDetailPage
            projectId={hashState.param}
            onBack={() => navigate('projects')}
          />
        ) : (
          <ProjectsPage
            onOpenProject={(id) => navigate('projectDetail', id)}
          />
        )
      case 'reports':
        return <ReportsPage />
      case 'knowledge':
        return <KnowledgePage />
      case 'templates':
        return <TemplatesPage />
      case 'ai':
        return <AIPage />
      case 'settings':
        return <SettingsPage />
      default:
        return <HomePage />
    }
  }

  const currentPage: PageId = hashState.page
  const handleNavigate = (page: PageId) => navigate(page)

  return (
    <LicenseGuard>
      <ReportGenProvider>
        <Layout
          currentPage={currentPage === 'projectDetail' ? 'projects' : currentPage}
          onNavigate={handleNavigate}
        >
          {renderPage()}
        </Layout>
        {/* 全局报告覆盖确认弹窗 · 主页 + 报告中心共用 */}
        <RegenConfirmModal />
      </ReportGenProvider>
    </LicenseGuard>
  )
}

export default App
