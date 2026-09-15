# PMTool 新开发兄弟上手手册（GitHub 接入指南）

> 面向刚加入的开发者 · 从克隆到跑起来 + 遵守仓库 Git 纪律的一条龙说明。
> 配套必读：`V8/GIT_RULES.md`（维护者立条的 Git 硬性规范）· `README.md`（项目全貌）。

---

## 一、拿到仓库访问权限（私有仓库）

仓库是 **私有** 的，直接 clone 会 404。先做任选其一：

- **方式 A（推荐）**：项目负责人在 GitHub `Settings → Collaborators` 把你加为 **Write** 协作者，然后就能直接 clone / push。
- **方式 B（临时 / CI / 脚本用）**：项目负责人在 `Settings → Developer settings → Personal access tokens` 生成一个 token（勾选 `repo` 权限）交给你，clone / push 时用它当密码。

> ⚠️ token 等同密码：用完后立即失效，仅走可信渠道交接，**不要写进仓库、不要提交到 git**。

---

## 二、克隆

```bash
git clone https://github.com/xingfudingge/PMTOOL.git
cd PMTOOL
```

> 用 HTTPS push 时 GitHub 通常会弹窗要账号 + token 登录；若已配置 GitHub 桌面版或 `git credential-manager`，会自动记住，无需手动处理。

---

## 三、装环境（README 第五节）

```bash
# 依赖要求
node 18+  · pnpm 8+  · Rust stable  · Tauri CLI  · macOS 12+ / Windows 10+

# 主应用
cd app && pnpm install

# License Generator（可选）
cd app/license-generator && npm install
```

---

## 四、启停（根目录 start.sh）

```bash
./start.sh start      # PMTool（Vite:1420 + Tauri）
./start.sh start-lg   # License Generator（1421）
./start.sh status     # 查看运行状态
./start.sh stop       # 停主应用
./start.sh stop-all   # 停全部服务
./start.sh build      # 打包（DMG / NSIS / MSI）
```

---

## 五、Git 纪律（务必先读 V8/GIT_RULES.md）

以下为维护者立条的硬性规范，**动手前必读完整版**，这里只列高频红线和摘要：

### 分支
| 分支 | 用途 | 何时用 |
|---|---|---|
| `main` | 主分支 · 生产可用 | 日常按粒度 commit |
| `feature/*` | 特性开发（可选） | 大特性 · 跨度 > 1 周 |
| `hotfix/*` | 紧急修复 | P0 Bug |

### commit 粒度（控制粒度，不碎）
- ✅ 一个完整功能阶段 / 一个 Bug 修复 / 一组 UI 调整，各 1 个 commit
- ❌ 改一行样式就 commit；❌ 单文件单行 commit；❌ 为汇报拆碎 commit

### commit 格式
```
<type>(<scope>): 中文一句话
```
例：`feat(todo): 三视图 + 自动顺延 + 单元测试`

### 红线（禁止）
- ❌ **不自动 push**——push 前先问项目负责人
- ❌ `git add -A` / `git add .`（要精确到文件）
- ❌ `git commit --amend` 已 push 的 commit
- ❌ `git push --force` / `git reset --hard`（高危）

### 不进 Git 的内容（`.gitignore` 已配好，别 `-f` 硬加）
`node_modules/` · `dist/` · `target/` · 密钥（`*.pem` / `*.key`，含授权私钥）· 本地数据 `pmtool.db` · 日志 · 安装包（dmg/exe/msi）· 设计稿（psd/fig/sketch）

---

## 六、换环境特别提醒

- **Tauri 2 Rust 后端 + React 19 + Vite 5** 双应用（主应用 + License Generator）。
- 授权系统是 **Ed25519 签名**；**私钥**（`~/.pmtool/license_generator_*.pem`、`app/src-tauri/keys/generator_public.pem`）属管理员端单独持有，**仓库里没有私钥**，严禁提交。
- **Windows 打包未实测过**，首次出包需本地验证（仓库无 CI）。
- 已知问题与更多细节见 `README.md` 的「已知问题」「版本历史」章节。

---

## 七、完整交接文档
进一步了解业务与架构，可继续读：
- `PMTOOL 项目交接文档.md`
- `LICENSE_GENERATOR交接文档.md`
- `V8/RFC/*.md`（数据库 / 领域规则 / 授权 / TODO 数据模型 / 项目中心）

---

**维护人**：Code 兄弟 ｜ **审阅人**：维护者 ｜ **版本**：2026-09-15