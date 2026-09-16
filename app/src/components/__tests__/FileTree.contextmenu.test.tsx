// @vitest-environment jsdom
/**
 * FileTree 右键菜单 / 剪贴板 / 行内重命名 回归测试（维护者 2026-09-16）
 *
 * 背景：FileTree 早就写了 onRequestRename / onRequestDelete / onRequestCopy 三个 props，
 * 但两个页面从来没有传过 —— 于是「右键/复制/重命名/删除」在真机里等于不存在。
 * 本测试锁住新能力：右键菜单项、复制+粘贴、剪切+粘贴、双击重命名。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FileTree } from '../FileTree'
import type { FileNode } from '@/services/projectFiles'

const mkFile = (path: string, name: string, isDir = false, children: FileNode[] = []): FileNode =>
  ({ path, name, isDir, children, extension: isDir ? undefined : name.split('.').pop() }) as FileNode

const ROOT = mkFile('/r', '项目根', true, [
  mkFile('/r/a.md', 'a.md'),
  mkFile('/r/子目录', '子目录', true),
])

const openMenu = (label: string) => {
  fireEvent.contextMenu(screen.getByText(label), { clientX: 100, clientY: 100 })
}

describe('FileTree · 右键菜单', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('右键文件行 → 出现 打开/复制/剪切/重命名/删除', () => {
    render(
      <FileTree
        root={ROOT}
        selectedPath={null}
        onSelect={() => {}}
        onOpenExternal={vi.fn()}
        onCopyToDir={vi.fn()}
        onMoveToDir={vi.fn()}
        onRename={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
    )
    openMenu('a.md')
    for (const label of ['打开', '复制', '剪切', '重命名', '删除']) {
      expect(screen.getByRole('menuitem', { name: new RegExp(label) })).toBeTruthy()
    }
  })

  it('调用方没接任何操作回调 → 不弹空菜单', () => {
    render(<FileTree root={ROOT} selectedPath={null} onSelect={() => {}} />)
    openMenu('a.md')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('复制 → 右键目录 → 粘贴 ⇒ onCopyToDir(源, 目标目录)', () => {
    const onCopyToDir = vi.fn()
    render(
      <FileTree root={ROOT} selectedPath={null} onSelect={() => {}} onCopyToDir={onCopyToDir} />,
    )
    openMenu('a.md')
    fireEvent.click(screen.getByRole('menuitem', { name: /复制/ }))
    openMenu('子目录')
    fireEvent.click(screen.getByRole('menuitem', { name: /粘贴/ }))
    expect(onCopyToDir).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/r/a.md' }),
      expect.objectContaining({ path: '/r/子目录' }),
    )
  })

  it('剪切 → 粘贴 ⇒ onMoveToDir（并且剪贴板清空：复制不保留）', () => {
    const onMoveToDir = vi.fn()
    render(<FileTree root={ROOT} selectedPath={null} onSelect={() => {}} onMoveToDir={onMoveToDir} />)
    openMenu('a.md')
    fireEvent.click(screen.getByRole('menuitem', { name: /剪切/ }))
    openMenu('子目录')
    fireEvent.click(screen.getByRole('menuitem', { name: /粘贴/ }))
    expect(onMoveToDir).toHaveBeenCalledTimes(1)
    // 剪贴板已清空 → 再次粘贴不再触发
    openMenu('子目录')
    fireEvent.click(screen.getByRole('menuitem', { name: /粘贴/ }))
    expect(onMoveToDir).toHaveBeenCalledTimes(1)
  })

  it('剪贴板为空时「粘贴」置灰（disabled）', () => {
    render(<FileTree root={ROOT} selectedPath={null} onSelect={() => {}} onCopyToDir={vi.fn()} />)
    openMenu('子目录')
    expect(screen.getByRole('menuitem', { name: /粘贴/ }).hasAttribute('disabled')).toBe(true)
  })

  it('根目录行：不给 重命名 / 删除（绑定目录本身不可动）', () => {
    render(
      <FileTree
        root={ROOT}
        selectedPath={null}
        onSelect={() => {}}
        onRename={vi.fn()}
        onRequestDelete={vi.fn()}
      />,
    )
    openMenu('项目根')
    expect(screen.queryByRole('menuitem', { name: /重命名/ })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: /删除/ })).toBeNull()
  })

  it('目录不能粘贴到自己或自己的子树（置灰）', () => {
    render(<FileTree root={ROOT} selectedPath={null} onSelect={() => {}} onCopyToDir={vi.fn()} />)
    openMenu('子目录')
    fireEvent.click(screen.getByRole('menuitem', { name: /复制/ }))
    openMenu('子目录')
    expect(screen.getByRole('menuitem', { name: /粘贴/ }).hasAttribute('disabled')).toBe(true)
  })
})

describe('FileTree · 行内重命名', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('双击行 → 输入框 → 回车 ⇒ onRename(node, 新名)', () => {
    const onRename = vi.fn()
    render(<FileTree root={ROOT} selectedPath={null} onSelect={() => {}} onRename={onRename} />)
    fireEvent.doubleClick(screen.getByText('a.md'))
    const input = screen.getByDisplayValue('a.md') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'b.md' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onRename).toHaveBeenCalledWith(expect.objectContaining({ path: '/r/a.md' }), 'b.md')
  })

  it('F2 重命名 · Esc 取消（不触发 onRename）', () => {
    const onRename = vi.fn()
    render(<FileTree root={ROOT} selectedPath={'/r/a.md'} onSelect={() => {}} onRename={onRename} />)
    const container = screen.getByText('a.md').closest('div')!.parentElement!
    fireEvent.keyDown(container, { key: 'F2' })
    const input = screen.getByDisplayValue('a.md')
    fireEvent.change(input, { target: { value: 'zzz.md' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onRename).not.toHaveBeenCalled()
  })

  it('名字里带路径分隔符 → 不提交（防止拼出别处路径）', () => {
    const onRename = vi.fn()
    render(<FileTree root={ROOT} selectedPath={null} onSelect={() => {}} onRename={onRename} />)
    fireEvent.doubleClick(screen.getByText('a.md'))
    const input = screen.getByDisplayValue('a.md')
    fireEvent.change(input, { target: { value: '../evil.md' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onRename).not.toHaveBeenCalled()
  })
})
