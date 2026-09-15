# PMTool V2.0 Git 管理规范

> **立条背景（2026-08-24 · 维护者拍板）**
> V1 的教训不是「没有 commit」，而是「**没有可靠版本基线**」· 后续规范不禁止 commit，但要控制粒度 + 控制进 Git 的内容。
>
> 维护者原话：
> - "V1 的问题不是没有 commit，而是没有可靠版本基线。"
> - "后续不要禁止 commit，但是需要控制粒度：功能完成一个阶段 commit · Bug修复 commit · UI一组调整 commit"
> - "不要每改一个小样式就产生一个 commit。"

---

## 一、Commit 粒度（维护者 2026-08-24 · 强制）

### ✅ 允许 commit 的粒度

| 类型 | 说明 | 范例 |
|---|---|---|
| **功能阶段完成** | 一个完整功能单元（多文件）通过测试后 | `feat(todo): 三视图 + 自动顺延 + 单元测试` |
| **Bug 修复** | 一个具体 Bug 修复（含复现 + 修复 + 回归测试）| `fix(plan): 修复修改启动日期后工时不重算` |
| **UI 一组调整** | 一次性视觉 / 交互重构（多组件相关）| `refactor(ui): 项目详情 Tab 改侧边栏布局` |
| **构建 / 工具链** | 影响构建 / 部署的配置变更 | `chore(tauri): 接入 Tauri 2.x 自动更新通道` |
| **文档 / 规范** | 文档、规则、规范性变更 | `docs(git): 立 Git 管理规范` |

### ❌ 禁止的 commit 粒度

- ❌ 每改一个小样式就 commit（例：只改了一个 padding）
- ❌ 单文件单行的 commit
- ❌ 半天内连续 commit 同一功能（应合并为一个 commit）
- ❌ "修复 typo" 类琐碎 commit（除非确实有专门文档修订任务）

### 推荐 commit 信息格式

```
<type>(<scope>): <中文一句话描述>

[可选：详细说明]
[可选：影响范围]
[可选：关联 issue]
```

- `<type>`：`feat` / `fix` / `refactor` / `chore` / `docs` / `test` / `perf`
- `<scope>`：模块名（todo / plan / license / ui / git / icon / 等）
- 中文优先（按维护者偏好）
- 不写废话（"fix bug" / "update" / "改了点东西"）

---

## 二、禁止进入 Git 的内容（强约束）

### 2.1 已配置 `.gitignore`（自检清单）

| 类别 | 路径 / 模式 | 原因 |
|---|---|---|
| Node 依赖 | `node_modules/` `**/node_modules/` `.pnpm-store/` | 包管理器自动恢复 |
| 构建产物 | `dist/` `build/` `app/dist/` | 编译产物，可重现 |
| Rust 产物 | `target/` `**/target/` `**/*.rs.bk` | cargo 自动生成 |
| 密钥 | `**/private*.pem` `**/secret*.key` `keys/` | 安全风险 |
| 本地数据 | `pmtool.db` `pmtool.db-*` `PMToolData/` `com.pmtool/` | 用户私有数据 |
| 测试产物 | `coverage/` `playwright-report/` `*.json`（license generator）| 临时结果 |
| 日志 | `*.log` `pnpm-debug.log*` | 临时 |
| 编辑器 | `.idea/` `.vscode/` `.DS_Store` `*.swp` | 个人环境 |
| 环境变量 | `.env` `.env.local` `.env.*.local` | 密钥风险 |
| **安装包（2026-08-24 新增）** | `*.dmg` `*.exe` `*.msi` `*.AppImage` `*.deb` `*.rpm` `*.pkg` `*.zip` `*.tar.gz` `out/` `**/bundle/` | 体积大 · 不应长期堆历史 |
| **设计稿（2026-08-24 新增）** | `*.psd` `*.sketch` `*.fig` `*.ai` `*.xd` | 资源量大 · 用专门工具管理 |
| **临时文件（2026-08-24 新增）** | `*.tmp` `*.bak` `*.orig` `*.rej` `.cache/` `.tmp/` `tmp/` | 临时产物 |
| 本地配置 | `.git-config/` | Git 账号（不进 Git）|

### 2.2 大量二进制资源策略

| 资源类型 | 是否进 Git | 备注 |
|---|---|---|
| App Icon SVG（源）| ✅ 进 Git | 1024×1024 · 1.5KB |
| App Icon PNG（最终）| ✅ 进 Git | 7 尺寸 · 总计 ~30KB |
| App Icon .icns（macOS）| ✅ 进 Git | 124KB（macOS 必需）|
| App Icon .ico（Windows）| ✅ 进 Git | 17KB（Windows 必需）|
| 截图 / 设计稿（PSD/Figma export）| ❌ 不进 Git | 用 Figma / 飞书 / 设计平台管理 |
| 安装包（dmg/exe/msi）| ❌ 不进 Git | 体积大 · 用发布工具管理 |

---

## 三、Tag 规范（维护者 2026-08-24 · 强制）

### 现有 tag（截至 2026-08-24）

| Tag | 含义 | 引用 commit |
|---|---|---|
| `v2.0-baseline` | V2.0 代码初始基线（Phase 0-4） | `3b97635` |
| `v2.0-icon-baseline` | V2.0 App Icon 资源基线（D 方案 · 已选）| `976fc39` |

### Tag 命名规则

```
v{大版本}.{中版本}-{里程碑描述}
```

范例：
- `v2.0-baseline`（V2.0 初始基线）
- `v2.0-icon-baseline`（App Icon 基线）
- `v2.0-ui`（UI 第一轮验收通过）
- `v2.1-release`（V2.1 正式发布）
- `v2.1-hotfix-license`（License 热修复）

### 何时打 tag

- ✅ 大版本发布（v2.0 / v2.1）
- ✅ 重大里程碑（UI 验收 / 稳定版本 / 基线确立）
- ✅ 重大重构完成（不破坏向后兼容）
- ❌ 不为每次 commit 打 tag
- ❌ 不为临时分支打 tag

---

## 四、Git LFS 策略（备选 · 2026-08-24 预留）

### 当前不需要 LFS

- 仓库空间：2.7M
- V8/app-icon：2.2M（PNG 总计 ~30KB · 远低于 1MB）
- 暂无 > 1MB 单文件

### 何时启用 LFS

- 单文件 > 1MB（如：模型权重、视频、高分辨率设计稿）
- 仓库总空间 > 100MB
- 二进制资源占比 > 30%

启用方式（待触发）：
```bash
brew install git-lfs
git lfs install
git lfs track "*.psd"
git lfs track "*.mov"
git lfs track "*.mp4"
```

---

## 五、操作纪律（维护者强制 · 永久）

### 5.1 修改前必查

```bash
git status              # 当前工作树
git log --oneline -5    # 最近 5 次提交
git tag                 # 当前可用 tag
git branch --show-current  # 当前分支
```

### 5.2 修改中约束

- ❌ 不在 main 分支直接改（除非本次任务很明确是 1-2 文件的紧急修复）
- ❌ 不自动 push（push 必须先 ask 维护者）
- ❌ 不 `git add -A` / `git add .`（要具体到文件）
- ❌ 不 `git commit --amend` 已 push 的 commit
- ❌ 不 `git push --force` / `git reset --hard`（高危）

### 5.3 修改后必做

```bash
git status              # 确认改动符合预期
git diff --stat         # 改动统计
git add <具体文件>       # 精确 add
git commit -m "<type>(<scope>): <中文描述>"  # 按粒度规则 commit
```

不自动 push（必须等维护者确认）。

---

## 六、分支策略（简化版）

| 分支 | 用途 | 何时使用 |
|---|---|---|
| `main` | 主分支 · 生产可用 | 日常 commit（按粒度） |
| `feature/*` | 特性开发（可选）| 大特性 · 跨度 > 1 周 |
| `hotfix/*` | 紧急修复 | P0 Bug 紧急修复 |
| `archive/*` | 历史归档（已废弃 V1）| 只读 |

> 当前 PMTool V2.0 主分支为 `main` · 暂不需要额外分支 · 简化策略。

---

## 七、回退与恢复

### 7.1 回退到指定 tag

```bash
git checkout v2.0-baseline     # 切到基线 tag（HEAD detached · 只读）
git checkout main              # 切回 main
```

### 7.2 撤销未 push 的 commit

```bash
git reset --soft HEAD~1        # 撤销 commit · 保留改动
git reset --hard HEAD~1        # 撤销 commit · 删改动（高危）
```

### 7.3 已 push 的 commit 不能 reset

只能用 `git revert <commit-hash>` 生成反向 commit（安全）。

---

## 八、检查清单（每次 commit 前自检）

```
□ git status 是否 clean
□ 改动是否构成一个 commit 单元（不琐碎）
□ 是否漏掉关键文件（add 是具体到文件）
□ commit message 是否符合格式（type(scope): 中文描述）
□ 是否应该打 tag（参考第三节）
□ 是否新增了应该进 .gitignore 的文件
□ 是否为汇报而生（若只为汇报文案修改 · 应合并到下一阶段 commit）
```

---

## 九、不为汇报产生无意义 commit（2026-08-24 维护者补充）

### 维护者原话

> "开发过程需要 commit，但是不要为了汇报产生大量无意义 commit。每个完整阶段形成一个可恢复节点即可。"

### 含义

- ✅ **开发过程的 commit 是必需的**（每个完整阶段 · 进可恢复 · 退可回溯）
- ❌ **不为"汇报文案漂亮"产生 commit**（如：单独 commit 只为 README 改一行）
- ❌ **不为"汇报显进度"拆碎 commit**（如：每个小样式改动一个 commit）
- ✅ **每个完整阶段形成可恢复节点**（commit + 关键节点打 tag）

### 实践示例

| 场景 | 正确 | 错误 |
|---|---|---|
| 完成项目计划管理（多文件 · 1000 行 · 含测试）| 1 个 commit + 1 个 tag | ❌ 拆 10 个 commit |
| README 单独修改一行 | 合并到下一阶段 | ❌ 单独 commit |
| 修改一行注释 | 合并到下一阶段 | ❌ 单独 commit |
| 一个完整 Bug 修复（含复现 + 修复 + 测试）| 1 个 commit | ❌ 拆 3 个 commit |
| 完整 UI 一组调整（多组件相关）| 1 个 commit | ❌ 拆 5 个 commit |

### 判断标准

**自检**：这次改动如果失败回滚，是否能让 PMTool 退回到一个有意义的状态？
- 是 → 应该独立 commit
- 否 → 合并到下一个有意义阶段

---

**版本**：2026-08-24（首次立条 · 维护者拍板「控制粒度 + 不堆资源 + 定期 tag」+ §九 补充「不为汇报产生无意义 commit」）

**维护人**：Code 兄弟
**审阅人**：维护者
