/**
 * 维护者 2026-08-31 · Sidebar 布局回归测试
 *
 * 背景：用户报"左侧版本号下面留一大块空白"
 * 原因 1：nav 加了 flex:1 把 sidebar 剩余空间全撑开，版本号卡在 nav 下面、底部还空一大块
 * 原因 2：去掉 flex:1 后 nav 只占内容高度，但版本号没 marginTop:auto 推到底部
 * 修复：nav 不加 flex:1 + version 加 marginTop:auto → 版本号贴 sidebar 底部，nav 占内容高度
 *
 * 这里直接 grep 编译后的产物 / 源码，确认两个属性正确
 */
// @vitest-environment node
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

describe('Sidebar · 布局修复回归', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'Sidebar.tsx'),
    'utf-8',
  )

  it('nav 不应有 flex: 1（保留内容高度 · 别撑满 sidebar）', () => {
    // 找到 nav style 块
    const navMatch = src.match(/<nav\s+style=\{\{([^}]+)\}\}/)
    expect(navMatch).toBeTruthy()
    const navStyle = navMatch![1]
    // 必须没有 flex: 1
    expect(navStyle).not.toMatch(/flex:\s*['"]?1['"]?/)
  })


  it('Sidebar aside 是 flex column（版本号能贴底的前提）', () => {
    expect(src).toMatch(/display:\s*['"]flex['"][^}]*flexDirection:\s*['"]column['"]/)
  })
})