// @vitest-environment jsdom
/**
 * FilePreview .md 真实渲染测试（2026-09-19）
 *
 * 与 FilePreview.dispatch.test.tsx 的区别：**不 mock DocumentEditor**，
 * 走真实的 MarkdownEditor → DocumentEditor → BlockNote 链路。
 *
 * 目的：dispatch 测试只验证「分发没走错」，但如果 DocumentEditor 本身在
 * 这条链路上抛错，错误边界依然会把 .md 降级成 UnknownPreview（真机就是这个症状）。
 * 本测试专门锁「真实渲染不抛错」。
 */

import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

// BlockNote 在 jsdom 下需要 matchMedia
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (q: string) => ({
      matches: false,
      media: q,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
})

vi.mock('@/services/projectFiles', () => ({
  readTextFile: vi.fn(async () => '# 标题\n\n正文内容'),
  readTextFileWithMtime: vi.fn(async () => ({
    content: '# 标题\n\n正文内容',
    modifiedAt: '2026-09-19T00:00:00Z',
  })),
  readFileBytes: vi.fn(async () => new Uint8Array()),
  writeTextFile: vi.fn(async () => undefined),
}))

vi.mock('@/services/document', () => ({
  documentCreate: vi.fn(),
  documentExportDocx: vi.fn(),
  writeBinaryFile: vi.fn(),
}))

vi.mock('@/services/settings', () => ({
  revealPath: vi.fn(async () => true),
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({
  save: vi.fn(async () => null),
}))

import { FilePreview } from '../index'

const FALLBACK_TEXT = /暂不支持在线预览/

describe('FilePreview · .md 真实渲染（不 mock DocumentEditor）', () => {
  it('不降级为 UnknownPreview', async () => {
    render(<FilePreview path="/p/a.md" fileName="a.md" onOpenExternally={() => {}} />)

    // 等真实编辑器挂载完成
    await waitFor(
      () => {
        expect(screen.getByTestId('project-file-export-menu')).toBeTruthy()
      },
      { timeout: 5000 },
    )

    // 核心断言：没有掉进错误边界兜底
    expect(screen.queryByText(FALLBACK_TEXT)).toBeNull()
  })
})
