/**
 * PMTool · Markdown 编辑器模式切换（2026-09-19）
 *
 * .md 文件可以按两种方式打开：
 *   - 富文本（BlockNote）：所见即所得，适合写日报/纪要
 *   - 纯文本：直接看/改 Markdown 源码，适合调格式、粘贴大段文本
 *
 * 用户在工具栏一键切换，两种模式共用同一份磁盘文件。
 */

export type EditorMode = 'rich' | 'text'

interface Props {
  mode: EditorMode
  onChange: (m: EditorMode) => void
  disabled?: boolean
}

const wrapStyle: React.CSSProperties = {
  display: 'inline-flex',
  padding: 2,
  gap: 2,
  background: 'var(--color-bg-subtle)',
  border: '1px solid var(--color-border-thin)',
  borderRadius: 6,
  flexShrink: 0,
}

function segStyle(active: boolean): React.CSSProperties {
  return {
    padding: '3px 10px',
    fontSize: 11.5,
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
    background: active ? 'var(--color-surface)' : 'transparent',
    color: active ? 'var(--color-text)' : 'var(--color-text-tertiary)',
    fontWeight: active ? 500 : 400,
    fontFamily: 'inherit',
    boxShadow: active ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
  }
}

export function EditorModeToggle({ mode, onChange, disabled }: Props) {
  return (
    <div style={wrapStyle} role="group" aria-label="编辑器模式">
      <button
        type="button"
        data-testid="editor-mode-rich"
        disabled={disabled}
        onClick={() => onChange('rich')}
        title="用富文本编辑器打开（所见即所得）"
        style={segStyle(mode === 'rich')}
      >
        富文本
      </button>
      <button
        type="button"
        data-testid="editor-mode-text"
        disabled={disabled}
        onClick={() => onChange('text')}
        title="用纯文本编辑器打开（看/改 Markdown 源码）"
        style={segStyle(mode === 'text')}
      >
        纯文本
      </button>
    </div>
  )
}