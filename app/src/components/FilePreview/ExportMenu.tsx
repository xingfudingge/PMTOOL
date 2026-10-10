/**
 * PMTool · 导出菜单（2026-09-19，2026-09-20 改 Rust 引擎）
 *
 * 一个「导出」按钮 + 下拉选格式（Word / PDF / PPT），避免工具栏堆一排按钮。
 *   三种格式都走 Rust 侧 Document Engine（document_generate_inline），
 *   保证导出效果一致。
 *
 * 导出前先保存（saveRef.current?.()），保证导出的不是旧内容。
 */

import { useRef, useState } from 'react'
import type { MutableRefObject } from 'react'
import { FileContextMenu } from '@/components/FileContextMenu'
import { exportDocFromMarkdown } from '@/components/DocumentEngine/DocumentExport'
import { readTextFileWithMtime } from '@/services/projectFiles'
import type { GenerateFormat } from '@/services/document'

interface Props {
  path: string
  fileName: string
  /** DocumentEditor 推上来的 save 回调；导出前先保存 */
  saveRef: MutableRefObject<(() => Promise<boolean>) | null>
}

export function ExportMenu({ path, fileName, saveRef }: Props) {
  const btnRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [busy, setBusy] = useState(false)

  const handleOpen = () => {
    const r = btnRef.current?.getBoundingClientRect()
    setPos({ x: r ? r.left : 0, y: r ? r.bottom + 4 : 0 })
    setOpen(true)
  }

  const runExport = async (format: GenerateFormat) => {
    if (busy) return
    setBusy(true)
    try {
      // 先保存，避免导出旧内容
      if (saveRef.current) {
        const ok = await saveRef.current()
        if (!ok) {
          alert('保存未完成（可能有外部修改冲突），已中止导出')
          return
        }
      }
      const { content } = await readTextFileWithMtime(path)
      const title = fileName.replace(/\.[^.]+$/, '')
      await exportDocFromMarkdown({ title, markdown: content, format })
    } catch (e) {
      console.error('[ExportMenu] 导出失败:', e)
      alert('导出失败：' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        data-testid="project-file-export-menu"
        disabled={busy}
        onClick={handleOpen}
        title="导出为 Word / PDF / PPT"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '4px 10px',
          fontSize: 12,
          color: 'var(--color-text)',
          background: 'var(--color-bg)',
          border: '1px solid var(--color-border)',
          borderRadius: 4,
          cursor: busy ? 'wait' : 'pointer',
          flexShrink: 0,
        }}
      >
        {busy ? '导出中…' : '导出'}
        <span style={{ fontSize: 9, lineHeight: 1 }}>▾</span>
      </button>
      {open && (
        <FileContextMenu
          x={pos.x}
          y={pos.y}
          onClose={() => setOpen(false)}
          items={[
            {
              key: 'docx',
              label: '导出 Word（.docx）',
              onSelect: () => void runExport('docx'),
            },
            {
              key: 'pdf',
              label: '导出 PDF（.pdf）',
              onSelect: () => void runExport('pdf'),
            },
            {
              key: 'pptx',
              label: '导出 PPT（.pptx）',
              onSelect: () => void runExport('pptx'),
            },
          ]}
        />
      )}
    </>
  )
}
