/**
 * PMTool · 编辑区最大化 · 共享 helper（维护者 2026-08-31 · Phase D · 重做）
 *
 * 维护者 2026-08-31 拍板：最大化 = 编辑区占满整个可见区域。
 *   - 不动 OS 窗口（不调 Tauri maximize / WebviewWindow）
 *   - 只是折叠所有 chrome：主侧栏 / 顶部 tab栏 / FilesTab 工具栏 / KnowledgeSpaceView
 *     三栏的左右两栏，让编辑器本身铺满可见区域
 *
 * 实现：body class 模式
 *   - DocumentEditor / TxtEditor / MarkdownEditor 工具栏的 ⛶ 按钮 →
 *     toggleEditingMaximized() → document.body.classList.toggle
 *   - KnowledgeSpaceView / FilesTab / AppShell 用 useEditingMaximized() 订阅
 *     maximized 状态，根据状态把 chrome aside 的 width 设 0、padding 设 0 等
 *   - Esc 退出（mount 时挂 window keydown）
 *
 * 为什么不用 React Context / useState：
 *   KnowledgeSpaceView / FilesTab / AppShell 是分散在不同页面的，没有共同 React
 *   父组件。Context 模式需要 Provider 包整个 App · 不如直接管 body.classList
 *   简单直接。
 *
 * 维护者 2026-08-31 白屏修复：App 启动时**强制清掉残留 class**
 *   之前 react state 初值读 className，启动时如果有残留（用户上次没正常退出
 *   最大化、或上次会话中点到最大化然后进程挂掉）→ Layout 一渲染就把 chrome 折
 *   叠干净 → 白屏。现在 Layout mount useEffect 里清掉，宁可丢一次状态也不白屏。
 */

import { useEffect, useState } from 'react'

/** body 上的 class · maximized 时挂上 · 多个 chrome 组件用它折叠 */
export const EDITING_MAXIMIZED_CLASS = 'editing-maximized'

/** 当前是否最大化（同步读 DOM） */
export function readIsEditingMaximized(): boolean {
  if (typeof document === 'undefined') return false
  return document.body.classList.contains(EDITING_MAXIMIZED_CLASS)
}

/**
 * 维护者 2026-08-31：点 ⛶ 触发的统一动作 · 纯 CSS · 不动 OS 窗口
 *   1. 翻转 body class
 *   2. 返回新状态（供调用方更新图标）
 */
export function toggleEditingMaximized(): boolean {
  const next = !readIsEditingMaximized()
  document.body.classList.toggle(EDITING_MAXIMIZED_CLASS, next)
  return next
}

/** 显式退出最大化（Esc / 卸载场景） */
export function exitEditingMaximized(): void {
  if (!readIsEditingMaximized()) return
  document.body.classList.remove(EDITING_MAXIMIZED_CLASS)
}

/**
 * 维护者 2026-08-31 白屏修复：Layout mount 时清掉残留的 maximized class
 * Layout 在 App 启动时第一时间渲染 · 此时如果 body 上有残留 class，整窗 chrome
 * 会被折叠 → 看起来白屏。这里强制清掉，确保 App 启动后是正常 layout。
 * 调用方只需在 mount 时跑一次（Layout useEffect 里）。
 */
export function clearEditingMaximizedOnBoot(): void {
  if (typeof document === 'undefined') return
  document.body.classList.remove(EDITING_MAXIMIZED_CLASS)
}

/**
 * 维护者 2026-08-31：KnowledgeSpaceView / FilesTab / AppShell 订阅 maximized 状态
 * 用 MutationObserver 监听 body class 变化 · 同步到 React state
 */
export function useEditingMaximized(): boolean {
  const [max, setMax] = useState<boolean>(() => readIsEditingMaximized())
  useEffect(() => {
    if (typeof document === 'undefined') return
    const obs = new MutationObserver(() => {
      const v = readIsEditingMaximized()
      setMax((prev) => (prev === v ? prev : v))
    })
    obs.observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
    })
    return () => obs.disconnect()
  }, [])
  return max
}

/**
 * 维护者 2026-08-31：编辑器工具栏组件（EditorToolbar / PreviewToolbar）专用
 *   - 订阅 Esc 退出
 *   - mount 时把当前状态同步出来（hot.isMax）
 *   - 卸载时清掉 class（避免残留）
 */
export function useEditingMaximizedHotkeys(): {
  isMax: boolean
  toggle: () => boolean
} {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && readIsEditingMaximized()) {
        e.preventDefault()
        exitEditingMaximized()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // 卸载时清掉 class（避免下次进别的页还残留最大化态）
  useEffect(() => {
    return () => {
      document.body.classList.remove(EDITING_MAXIMIZED_CLASS)
    }
  }, [])

  return {
    isMax: readIsEditingMaximized(),
    toggle: toggleEditingMaximized,
  }
}