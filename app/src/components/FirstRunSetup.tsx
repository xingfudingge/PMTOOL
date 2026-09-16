/**
 * PMTool · 首启数据目录选择（2026-09-15）
 * 首次打开时若用户未自选过数据存放目录，弹出全屏覆盖层引导选择。
 */
import { useEffect, useState } from 'react'
import { isDataRootSet, pickDataRoot } from '../services/settings'

export default function FirstRunSetup() {
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // 进入覆盖层界面时刷新一次状态（外部已判断未设置才渲染本组件）
    isDataRootSet().then((set) => {
      if (set) window.location.reload()
    }).catch(() => {})
  }, [])

  const handlePick = async () => {
    setError(null)
    setPicking(true)
    try {
      const dir = await pickDataRoot()
      if (dir) {
        // 2026-09-16 修复：后端已由 pick_data_root 热切到自选目录，后续数据即写自选库。
        // 此处仅刷新网页让覆盖层消失（isDataRootSet 现为 true），不再依赖重启。
        window.location.reload()
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setPicking(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          padding: 24,
          width: 420,
          maxWidth: '90vw',
          boxShadow: '0 8px 30px rgba(0,0,0,0.2)',
        }}
      >
        <h2 style={{ margin: '0 0 12px', fontSize: 16, color: '#37352f' }}>选择数据存放目录</h2>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: '#787774', lineHeight: 1.7 }}>
          欢迎使用 PMTool。请选择用于存放项目数据、附件与数据库的工作目录。
          之后可在「设置中心 → 数据」中修改。
        </p>
        {error && <p style={{ margin: '0 0 12px', fontSize: 12, color: '#c0392b' }}>{error}</p>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={handlePick}
            disabled={picking}
            style={{
              padding: '8px 14px',
              border: 'none',
              borderRadius: 8,
              background: '#5b5ce2',
              color: '#fff',
              cursor: picking ? 'default' : 'pointer',
              fontSize: 13,
            }}
          >
            {picking ? '选择中…' : '选择目录…'}
          </button>
        </div>
      </div>
    </div>
  )
}
