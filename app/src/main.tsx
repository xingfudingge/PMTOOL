import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { ErrorBoundary } from './components/ErrorBoundary'
import { invoke } from '@tauri-apps/api/core'

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
  // 同时把 JS 错误写到后端日志 <数据目录>/pmtool.log，进程退出也能追查
  try {
    invoke('log_frontend_error', { level: 'error', message: `${prefix}: ${msg}` }).catch(() => {})
  } catch {
    /* ignore */
  }
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

/**
 * 维护者 2026-09-16：全局屏蔽 WebView 原生右键菜单
 *
 * 问题：Tauri/WebView2 默认在任意位置右键都弹浏览器菜单（刷新 / 另存为 / 检查、
 * 翻译成中文…）。这是浏览器的东西，不是本软件的，随处弹出会让人觉得软件很业余、很难用。
 *
 * 策略：只在「右键确实有用途」的地方保留原生菜单 —— 输入框 / 文本域 / 富文本编辑器
 * （BlockNote 是 contenteditable），那里用户需要系统自带的 剪切/复制/粘贴。
 * 其余位置一律不弹；本软件自己的右键菜单（FileTree / 知识树）由各自组件自己渲染，
 * 不受影响（它们自己会 preventDefault 并画菜单）。
 */
function isEditableTarget(target: EventTarget | null): boolean {
  let el = target as HTMLElement | null
  while (el && el !== document.body) {
    const tag = el.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
    if (el.isContentEditable) return true
    el = el.parentElement
  }
  return false
}

document.addEventListener('contextmenu', (e) => {
  if (isEditableTarget(e.target)) return
  e.preventDefault()
})

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
