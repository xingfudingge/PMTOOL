/**
 * PMTool V2.0 底部状态栏
 * Phase A 产品化整改 P0
 *
 * 设计依据：UI 产品化设计规格 Part 1
 *   - 高 24px · 表面色 · 顶部分隔
 *   - 左侧：数据目录 · 同步状态
 */

import { useEffect, useState } from 'react'
import { CircleCheck, Database } from 'lucide-react'
import { getDataDir } from '../services/settings'

export function StatusBar() {
  const [dataDir, setDataDir] = useState<string>('...')

  useEffect(() => {
    getDataDir()
      .then(([dir]) => setDataDir(dir))
      .catch(() => setDataDir('未获取'))
  }, [])

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
          {dataDir}
        </span>
      </div>
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
