/**
 * Excel / CSV 预览 · xlsx（SheetJS · 已装）
 *
 * 多 sheet · 表格只读 · 每个 sheet 一个 tab
 */
import { useEffect, useMemo, useState } from 'react'
import { PreviewToolbar } from './PreviewToolbar'
import type { FilePreviewProps } from './types'
import * as XLSX from 'xlsx'
import { extOf } from './index'
import { readFileBytes } from '@/services/projectFiles'

interface SheetData {
  name: string
  rows: string[][]
}

export function XlsxPreview({ path, fileName, onOpenExternally }: FilePreviewProps) {
  const [sheets, setSheets] = useState<SheetData[]>([])
  const [active, setActive] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const ext = extOf(fileName)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const bytes = await readFileBytes(path)
        const buf = bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        )
        const wb = XLSX.read(buf, { type: 'array' })
        if (cancelled) return
        const parsed: SheetData[] = wb.SheetNames.map((name) => {
          const ws = wb.Sheets[name]
          const rows = XLSX.utils.sheet_to_json<string[]>(ws, {
            header: 1,
            blankrows: false,
            defval: '',
          })
          return { name, rows }
        })
        setSheets(parsed)
        setActive(0)
        setLoading(false)
      } catch (e) {
        if (cancelled) return
        setError(`表格加载失败：${e instanceof Error ? e.message : String(e)}`)
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [path])

  const current = sheets[active]
  const maxCols = useMemo(() => {
    if (!current) return 0
    return current.rows.reduce((m, r) => Math.max(m, r.length), 0)
  }, [current])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PreviewToolbar
        fileName={fileName}
        onOpenExternally={onOpenExternally}
        loading={loading}
        error={error}
      />
      {sheets.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: 4,
            padding: '6px 8px',
            borderBottom: '1px solid var(--color-border)',
            background: 'var(--color-bg-subtle)',
            overflowX: 'auto',
            flexShrink: 0,
          }}
        >
          {sheets.map((s, i) => (
            <button
              key={s.name}
              type="button"
              onClick={() => setActive(i)}
              style={{
                padding: '4px 10px',
                fontSize: 12,
                background: i === active ? 'var(--color-bg)' : 'transparent',
                border: '1px solid var(--color-border)',
                borderRadius: 3,
                cursor: 'pointer',
                color: 'var(--color-text)',
                whiteSpace: 'nowrap',
              }}
            >
              {s.name}
            </button>
          ))}
          <span
            style={{
              fontSize: 11,
              color: 'var(--color-text-tertiary)',
              alignSelf: 'center',
              marginLeft: 8,
            }}
          >
            {ext.toUpperCase()} · {current?.rows.length ?? 0} 行 · {maxCols} 列
          </span>
        </div>
      )}
      <div style={{ flex: 1, overflow: 'auto', background: 'var(--color-bg)' }}>
        {current && current.rows.length > 0 ? (
          <table
            style={{
              borderCollapse: 'collapse',
              fontSize: 12,
              width: 'max-content',
              minWidth: '100%',
            }}
          >
            <tbody>
              {current.rows.map((row, ri) => (
                <tr
                  key={ri}
                  style={{
                    background: ri === 0 ? 'var(--color-bg-subtle)' : 'transparent',
                    fontWeight: ri === 0 ? 600 : 400,
                  }}
                >
                  {Array.from({ length: maxCols }).map((_, ci) => (
                    <td
                      key={ci}
                      style={{
                        padding: '4px 8px',
                        border: '1px solid var(--color-border)',
                        whiteSpace: 'nowrap',
                        maxWidth: 320,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                      title={row[ci] ?? ''}
                    >
                      {row[ci] ?? ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          !loading &&
          !error && (
            <div
              style={{
                padding: 24,
                color: 'var(--color-text-tertiary)',
                fontSize: 12,
                textAlign: 'center',
              }}
            >
              空表格
            </div>
          )
        )}
      </div>
    </div>
  )
}
