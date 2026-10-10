// @vitest-environment jsdom
/**
 * FilePreview 分发回归测试（2026-09-19）
 *
 * 背景：2026-09-19 把 .md/.txt 接到新写的 DocumentEnginePreview 时引入了
 * React Hooks 规则违规（条件 return 早于 hooks），一渲染就抛错 →
 * FilePreview 的 PreviewErrorBoundary 降级成 UnknownPreview，
 * 真机表现为「此文件类型暂不支持在线预览」（.md 预览被改坏）。
 *
 * 本测试锁死：
 *   1. .md  → 渲染 MarkdownPreview（能看到正文），且不出现 UnknownPreview 文案
 *   2. .txt → 渲染编辑器，且不出现 UnknownPreview 文案
 *   3. 未知类型 → 才允许 UnknownPreview
 *
 * 说明：mock 掉 DocumentEditor（BlockNote 在 jsdom 里不可靠），
 * 只验证「分发 + 不降级」这一层，这正是本次出问题的地方。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

// BlockNote 编辑器在 jsdom 下不可靠 → 用占位组件隔离分发逻辑
vi.mock('@/components/DocumentEditor', () => ({
  DocumentEditor: () => <div data-testid="document-editor" />,
}))

vi.mock('@/services/projectFiles', () => ({
  readTextFile: vi.fn(async () => '# 标题\n\n正文内容'),
  readTextFileWithMtime: vi.fn(async () => ({
    content: '纯文本内容',
    modifiedAt: '2026-09-19T00:00:00Z',
  })),
  readFileBytes: vi.fn(async () => new Uint8Array()),
}))

vi.mock('@/services/document', () => ({
  documentCreate: vi.fn(),
  documentExportDocx: vi.fn(),
}))

vi.mock('@/services/settings', () => ({
  revealPath: vi.fn(async () => true),
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({
  save: vi.fn(async () => null),
}))

import { FilePreview } from '../index'

/** UnknownPreview 的兜底文案（出现即代表组件抛错被错误边界接住） */
const FALLBACK_TEXT = /暂不支持在线预览/

describe('FilePreview 分发', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('.md → 走可编辑编辑器（DocumentEditor），不降级为 UnknownPreview', async () => {
    render(<FilePreview path="/p/a.md" fileName="a.md" onOpenExternally={() => {}} />)

    // 2026-09-19：.md 从只读预览改为可编辑（MarkdownEditor 接线）
    await waitFor(() => {
      expect(screen.getByTestId('document-editor')).toBeTruthy()
    })
    // 关键断言：没有掉进 UnknownPreview
    expect(screen.queryByText(FALLBACK_TEXT)).toBeNull()
  })

  it('.markdown 后缀同样走可编辑编辑器', async () => {
    render(<FilePreview path="/p/a.markdown" fileName="a.markdown" onOpenExternally={() => {}} />)
    await waitFor(() => {
      expect(screen.getByTestId('document-editor')).toBeTruthy()
    })
    expect(screen.queryByText(FALLBACK_TEXT)).toBeNull()
  })

  it('.md 工具栏只有一个「导出」按钮（不再并排多个）+ 模式切换', async () => {
    render(<FilePreview path="/p/a.md" fileName="a.md" onOpenExternally={() => {}} />)
    await waitFor(() => {
      expect(screen.getByTestId('project-file-export-menu')).toBeTruthy()
    })
    // 只有一个导出入口
    expect(screen.getAllByTestId(/^project-file-export/)).toHaveLength(1)
    // 富文本 / 纯文本 切换都在
    expect(screen.getByTestId('editor-mode-rich')).toBeTruthy()
    expect(screen.getByTestId('editor-mode-text')).toBeTruthy()
  })

  it('.txt 工具栏也是单个「导出」按钮', async () => {
    render(<FilePreview path="/p/a.txt" fileName="a.txt" onOpenExternally={() => {}} />)
    await waitFor(() => {
      expect(screen.getByTestId('document-editor')).toBeTruthy()
    })
    expect(screen.getAllByTestId(/^project-file-export/)).toHaveLength(1)
  })

  it('.txt → 渲染编辑器，不降级为 UnknownPreview', async () => {
    render(<FilePreview path="/p/a.txt" fileName="a.txt" onOpenExternally={() => {}} />)

    await waitFor(() => {
      expect(screen.getByTestId('document-editor')).toBeTruthy()
    })
    expect(screen.queryByText(FALLBACK_TEXT)).toBeNull()
  })

  it('未知类型 → 才允许 UnknownPreview 兜底', () => {
    render(<FilePreview path="/p/a.bin" fileName="a.bin" onOpenExternally={() => {}} />)
    expect(screen.getByText(FALLBACK_TEXT)).toBeTruthy()
  })
})
