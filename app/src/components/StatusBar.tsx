/**
 * PMTool V2.0 底部状态栏
 * Phase A 产品化整改 P0
 *
 * 设计依据：UI 产品化设计规格 Part 1
 *   - 高 24px · 表面色 · 顶部分隔
 *   - 左侧：数据目录 · 同步状态
 *   - 右侧：机器码 · 授权状态徽章
 */

import { CircleCheck, Database, KeyRound, Cpu } from 'lucide-react'

export function StatusBar() {
  return (
    <footer
      style={{
        height: 'var(--statusbar-height)',
        background: 'var(--color-bg-subtle)',
        borderTop: 'var(--border-thin)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        gap: '16px',
        fontSize: '11px',
        color: 'var(--color-text-tertiary)',
        flexShrink: 0,
      }}
    >
      {/* 左侧：数据状态 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <CircleCheck size={11} strokeWidth={2} color="var(--color-status-success)" />
        <span>本地模式</span>
      </div>

      <Sep />

      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Database size={11} strokeWidth={1.75} />
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '10.5px',
          }}
        >
          ~/Library/Application Support/PMToolData
        </span>
      </div>

      <Sep />

      <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Cpu size={11} strokeWidth={1.75} />
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '10.5px',
            }}
          >
            PM-DESKTOP-2H4F-XK92
          </span>
        </div>

        <Sep />

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            padding: '1px 8px',
            background: 'var(--color-accent-subtle)',
            color: 'var(--color-accent)',
            borderRadius: '99px',
            fontWeight: 500,
            fontSize: '10.5px',
          }}
        >
          <KeyRound size={10} strokeWidth={2} />
          <span>已授权 · 测试科技</span>
        </div>
      </span>
    </footer>
  )
}

function Sep() {
  return (
    <span
      aria-hidden="true"
      style={{
        width: '1px',
        height: '12px',
        background: 'var(--color-border)',
      }}
    />
  )
}
