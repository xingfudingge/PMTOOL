/**
 * PMTool V2.0 桌面端主应用
 * Phase 0 · T0.3 UI 框架
 * Phase A · alpha 化（2026-08-24 · hash 路由 + 项目详情）
 *
 * 变更记录：
 *   - 2026-08-21（T0.3）：8 大模块 state-based 路由
 *   - 2026-08-24（alpha 化）：hash 路由 + projectDetail 支持
 */

import { useEffect, useState } from 'react'
import { Toaster } from 'sonner'
import { Layout } from './components/Layout'
import { RegenConfirmModal } from './components/RegenConfirmModal'
import { ReportGenProvider } from './services/reportGenerator'
import { HomePage } from './pages/HomePage'
import { TodoPage } from './pages/TodoPage'
import { ProjectsPage } from './pages/ProjectsPage'
import { ProjectDetailPage } from './pages/ProjectDetailPage'
import { ReportsPage } from './pages/ReportsPage'
import { KnowledgePage } from './pages/KnowledgePage'
import { TemplatesPage } from './pages/TemplatesPage'
import { SettingsPage } from './pages/SettingsPage'
import { MessageCenterPage } from './pages/MessageCenterPage'
import { SettingsProvider } from './state/SettingsProvider'
import { AutomationProvider } from './state/AutomationProvider'
import FirstRunSetup from './components/FirstRunSetup'
import { isDataRootSet } from './services/settings'

export type PageId =
  | 'home'
  | 'todo'
  | 'projects'
  | 'projectDetail'
  | 'reports'
  | 'knowledge'
  | 'templates'
  | 'messages'
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
function parseHash(): { page: PageId; param?: number; query: Record<string, string> } {
  const raw = window.location.hash.replace(/^#\/?/, '')
  // 支持 query：#/projectDetail/5?tab=planning&focusTask=123（消息中心深链用）
  const [pathPart, queryPart] = raw.split('?')
  const parts = pathPart.split('/').filter(Boolean)
  const page = parts[0] || 'home'
  const param = parts[1] ? Number(parts[1]) : undefined
  const query: Record<string, string> = {}
  if (queryPart) {
    for (const kv of queryPart.split('&')) {
      const eq = kv.indexOf('=')
      if (eq > 0) {
        query[decodeURIComponent(kv.slice(0, eq))] = decodeURIComponent(kv.slice(eq + 1))
      }
    }
  }
  if ((page === 'projects' || page === 'projectDetail') && param && !Number.isNaN(param)) {
    return { page: 'projectDetail', param, query }
  }
  return { page: page as PageId, param, query }
}

function App() {
  const [hashState, setHashState] = useState(parseHash())
  const [dataRootReady, setDataRootReady] = useState<boolean | null>(null)

  useEffect(() => {
    const onHashChange = () => setHashState(parseHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  // 首启：未自选过数据目录时弹出覆盖层
  useEffect(() => {
    isDataRootSet()
      .then(setDataRootReady)
      .catch(() => setDataRootReady(true))
  }, [])

  const navigate = (page: PageId, param?: number, query?: Record<string, string>) => {
    const queryStr = query && Object.keys(query).length > 0
      ? '?' + Object.entries(query)
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
          .join('&')
      : ''
    const hash = param ? `#/${page}/${param}${queryStr}` : `#/${page}${queryStr}`
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
            key={`${hashState.param}-${JSON.stringify(hashState.query)}`}
            projectId={hashState.param}
            onBack={() => navigate('projects')}
            deepLink={hashState.query}
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
      case 'messages':
        return <MessageCenterPage />
      case 'settings':
        return <SettingsPage />
      default:
        return <HomePage />
    }
  }

  const currentPage: PageId = hashState.page
  const handleNavigate = (page: PageId) => navigate(page)

  return (
    <>
    {dataRootReady === false && <FirstRunSetup />}
      <SettingsProvider>
      <AutomationProvider>
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
      </AutomationProvider>
      </SettingsProvider>
      <Toaster />
    </>
  )
}

export default App
