import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { ErrorBoundary } from './components/ErrorBoundary'

/** 全局 JS 错误捕获 → 直接渲染到 DOM · 不让白屏不告而别 */
function showError(prefix: string, err: unknown) {
  const msg = err instanceof Error ? `${err.message}\n\n${err.stack ?? ''}` : String(err)
  const root = document.getElementById('root')
  if (!root) return
  // 已存在错误面板就追加
  let panel = document.getElementById('__fatal_error_panel__')
  if (!panel) {
    panel = document.createElement('div')
    panel.id = '__fatal_error_panel__'
    panel.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; max-height: 50vh; overflow: auto;
      background: #fef2f2; color: #991b1b; font-family: ui-monospace, Menlo, monospace;
      font-size: 12px; padding: 16px; border-bottom: 3px solid #dc2626; z-index: 999999;
      white-space: pre-wrap; word-break: break-word;
    `
    document.body.appendChild(panel)
  }
  const div = document.createElement('div')
  div.style.borderBottom = '1px solid #fca5a5'
  div.style.padding = '6px 0'
  div.textContent = `[${prefix}] ${msg}`
  panel.appendChild(div)
  console.error(`[${prefix}]`, err)
}

/**
 * 维护者 2026-08-31：过滤浏览器无害警告
 *   - "ResizeObserver loop completed with undelivered notifications"：
 *     BlockNote 用 ResizeObserver 测编辑器大小，编辑时 React 重渲可能改 DOM 尺寸，
 *     浏览器检测到回调→DOM→回调的循环就刷这个警告。是浏览器机制提示，不是真错误。
 *     实际行为正确，过滤避免误报警报污染 UI。
 */
function isBenignMessage(msg: string): boolean {
  return /ResizeObserver loop completed with undelivered notifications/i.test(msg)
}

window.addEventListener('error', (e) => {
  const msg = e.error?.message ?? e.message ?? ''
  if (isBenignMessage(msg)) return
  showError('WINDOW_ERROR', e.error ?? e.message)
})
window.addEventListener('unhandledrejection', (e) => {
  const reasonStr = e.reason instanceof Error ? e.reason.message : String(e.reason ?? '')
  if (isBenignMessage(reasonStr)) return
  showError('UNHANDLED_PROMISE', e.reason)
})

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
