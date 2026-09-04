/**
 * Word 预览 · docx-preview 0.3.x
 *
 * API：renderAsync(blob, bodyContainer, styleContainer, options)
 *
 * 维护者 2026-08-31 修复：之前走 `convertFileSrc` + `fetch` 读本机文件，
 * 但 tauri.conf.json 没配 assetProtocol scope，WebView 拒绝 fetch 本地路径
 * → "Load failed"。现在改走 Rust `read_file_bytes` 命令拿 Uint8Array，
 * 再 new Blob 包成标准 Blob 喂给 docx-preview（绕过 assetProtocol）。
 */
import { useEffect, useRef, useState } from 'react'
import { PreviewToolbar } from './PreviewToolbar'
import type { FilePreviewProps } from './types'
import { renderAsync } from 'docx-preview'
import { readFileBytes } from '@/services/projectFiles'

export function DocxPreview({ path, fileName, onOpenExternally }: FilePreviewProps) {
  const bodyRef = useRef<HTMLDivElement>(null)
  const styleRef = useRef<HTMLStyleElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const body = bodyRef.current
    const style = styleRef.current
    if (!body || !style) return
    body.innerHTML = ''
    style.textContent = ''

    ;(async () => {
      try {
        const bytes = await readFileBytes(path)
        if (cancelled) return
        // docx-preview 接受 Blob · docx MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        const blob = new Blob([bytes], {
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        })
        await renderAsync(blob, body, style, {
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: true,
          ignoreFonts: false,
          breakPages: true,
          useBase64URL: true,
          className: 'docx-wrapper',
        })
        if (cancelled) return
        setLoading(false)
      } catch (e) {
        if (cancelled) return
        setError(`Word 加载失败：${e instanceof Error ? e.message : String(e)}`)
        setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [path])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <PreviewToolbar
        fileName={fileName}
        onOpenExternally={onOpenExternally}
        loading={loading}
        error={error}
      />
      <div
        ref={bodyRef}
        style={{
          flex: 1,
          overflow: 'auto',
          padding: 24,
          background: 'var(--color-bg)',
          color: 'var(--color-text)',
        }}
      />
      <style ref={styleRef} />
    </div>
  )
}
