/**
 * ErrorBoundary · 捕获 React 渲染错误
 * 维护者 2026-08-26 立（白屏定位）
 */
import React from 'react'

interface Props {
  children: React.ReactNode
  fallback?: (err: Error, reset: () => void) => React.ReactNode
}

interface State {
  err: Error | null
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { err: null }

  static getDerivedStateFromError(err: Error): State {
    return { err }
  }

  componentDidCatch(err: Error, info: React.ErrorInfo) {
    // 同步打全局错误面板
    const detail = `${err.message}\n\n${err.stack ?? ''}\n\n[Component Stack]\n${info.componentStack ?? ''}`
    const panel = document.getElementById('__fatal_error_panel__')
    if (panel) {
      const div = document.createElement('div')
      div.style.borderBottom = '1px solid #fca5a5'
      div.style.padding = '6px 0'
      div.textContent = `[REACT_ERROR] ${detail}`
      panel.appendChild(div)
    }
    console.error('[REACT_ERROR]', err, info)
  }

  render() {
    if (this.state.err) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.err, () => this.setState({ err: null }))
      }
      return (
        <div style={{
          position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--color-surface)', padding: 40, zIndex: 99999,
        }}>
          <div style={{
            maxWidth: 720, padding: 24, borderRadius: 12, background: '#fef2f2',
            border: '1px solid #fca5a5', color: '#991b1b', fontFamily: 'ui-monospace, Menlo, monospace',
            fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>渲染错误</div>
            <div>{this.state.err.message}</div>
            <div style={{ marginTop: 12, fontSize: 11, opacity: 0.7 }}>
              {this.state.err.stack}
            </div>
            <button
              type="button"
              onClick={() => this.setState({ err: null })}
              style={{
                marginTop: 16, padding: '6px 12px', border: '1px solid #dc2626',
                background: 'white', color: '#dc2626', borderRadius: 6, cursor: 'pointer',
              }}
            >
              重试
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
