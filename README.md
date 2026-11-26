# PMTool · 实施经理个人工作台

> 桌面端项目管理工具 · **单机离线** · Tauri 2 + React 19 + SQLite

PMTool 是给实施 / 交付经理用的个人工作台：项目计划、周计划、风险与问题登记册、日报周报、知识库、模板都在一处，数据只存本机 SQLite，**不需要服务器、不需要账号**。

当前版本 **v2.2.1**（已移除授权校验，安装即用）。

---

## ⬇️ 下载安装

到 [Releases](https://github.com/xingfudingge/PMTOOL/releases) 下载最新版安装包：

| 平台 | 文件 |
|---|---|
| macOS（Apple Silicon / Intel） | `PMTool_*_aarch64.dmg` / `PMTool_*_x64.dmg` |
| Windows 10+ | `PMTool_*_x64-setup.exe` |

安装即用：无需账号、无需授权码、无试用期。首次启动选一个数据目录即可。

> 安装包未做代码签名（开源版无开发者证书），首次打开如被系统拦下：
> macOS 右键 → 打开，或「系统设置 → 隐私与安全性 → 仍要打开」；Windows 点「更多信息 → 仍要运行」。

> 维护者：`git tag v2.2.1 && git push origin v2.2.1` 会自动触发两个平台的构建，并把 dmg / exe 上传到该 tag 的 Release。

---

## ✨ 功能

| 模块 | 说明 |
|---|---|
| **主工作区** | 今日待办（`@` 选项目快速添加）、今日工作内容（完成待办自动追加）、下个工作日计划、月历（法定节假日标红）、一键生成日报 |
| **任务中心** | 日 / 周 / 月视图；聚合「待办 + 项目计划任务 + 周报下周计划 + 周期任务」四类来源；未完成一键顺延 |
| **项目中心** | 项目概况（客户、负责人、合同额、背景、目标、范围、五态状态）；父子任务 + 甘特图（日/周/月，自动排除周末与法定节假日）；Excel 追加/覆盖导入导出 |
| **登记册** | 风险 / 需求 / 问题 / 其他待办四张表，行内编辑，Excel 双向导入导出 |
| **报告中心** | 日报 / 周报 / 月报 × 个人 / 项目两个范围，按周期自动填充，可编辑、复制、导出 Word |
| **知识中心** | 个人知识空间 + 项目知识空间，多级目录、Markdown 与富文本、标签、置顶、全库搜索、文档版本 |
| **模板中心** | 报告模板、项目文档模板、项目文件模板（写入本地目录）、模板变量 |
| **消息中心** | 站内消息 + 系统通知，内置提醒规则，幂等去重，消息可深链定位到具体行 |
| **设置** | 任务自动顺延、定时生成报告、节假日同步、自动备份/还原/迁移数据目录、外观主题 |

---

## 🧱 技术栈

| 层 | 选型 |
|---|---|
| 桌面框架 | Tauri 2.x（Rust 后端 + Web 前端） |
| 前端 | React 19 + Vite 5 + TypeScript |
| 包管理 | pnpm（前端）/ cargo（后端） |
| 后端 | Rust（rusqlite，分层：commands / services / repositories） |
| 数据库 | SQLite（Drizzle ORM 生成迁移，rusqlite 运行时加载） |
| 编辑器 | BlockNote / Markdown / 代码高亮 |
| 测试 | Vitest（前端）+ cargo test（后端） |

---

## 📁 目录结构

```
PMTOOL/
├── app/
│   ├── src/                  # React 前端（pages / components / services / state / types）
│   ├── src-tauri/            # Rust 后端（commands / services / repositories / db.rs）
│   └── package.json
├── database/migrations/      # SQL 迁移（按文件名顺序执行）
├── docs/                     # 操作手册与专题设计
├── V8/                       # 早期设计稿、RFC、页面规格（历史资料）
├── outputs/                  # 产品分析、方案与可点击原型
├── scripts/                  # 构建辅助脚本
└── start.sh                  # 启停 + 打包一体化脚本
```

---

## 🚀 快速开始

环境要求：Node.js 18+、pnpm 8+、Rust stable、Tauri CLI；macOS 12+ / Windows 10+。

```bash
# 1. 安装前端依赖
cd app && pnpm install

# 2. 启动（Vite 1420 + Tauri）
cd .. && ./start.sh start

# 其它
./start.sh status    # 查看运行状态
./start.sh stop      # 停止
./start.sh build pmt # 打包（dist/）
```

手动启动也可以：

```bash
cd app && pnpm tauri:dev
```

首次启动会让你选一个**数据目录**，数据库、附件、备份都放在那里。

---

## 🧪 测试

```bash
cd app && pnpm test              # 前端 Vitest
cd app/src-tauri && cargo test   # 后端
```

---

## 🔒 数据与隐私

- 所有数据保存在你选择的本地目录（SQLite + 附件），**没有云端、没有账号、没有埋点**。
- 断网可用；只有「同步法定节假日」会访问公开数据源，失败不影响任何功能。
- 备份是在设置里手动或按计划导出的 `.db` 文件，自己保管。

---

## 📚 文档

| 文档 | 说明 |
|---|---|
| `docs/PMTool-操作手册.md` | 20 分钟上手（面向使用者） |
| `V8/RFC/01-database-schema.md` | 数据库设计 |
| `V8/RFC/02-domain-rules.md` | 领域规则 |
| `V8/RFC/06-todo-data-model.md` | TODO 数据模型 |
| `V8/RFC/08-project-center.md` | 项目中心 |
| `V8/页面规格/` | 各页面规格 |
| `outputs/` | 功能分析、结构改造提案、可点击 HTML 原型 |

---

## ⚠️ 已知问题

- 迁移与 `app/src/database/schema.ts` 未完全同步（部分新表只存在于 SQL 迁移里）。
- macOS 偶发窗口不显示：可先访问 `http://localhost:1420` 确认前端已起。
- Windows 打包只在 CI 验证过 NSIS 安装包，本地未实测。

---

## 🤝 参与贡献

- 提交 issue 说明使用场景与复现步骤；改动较大时先开 issue 讨论，避免白做。
- 提交前请保证 `pnpm test` 与 `cargo test` 通过。
- 代码风格：TypeScript + 函数组件；Rust 侧保持 commands / services / repositories 分层。

---

## 📄 开源协议

[MIT](./LICENSE) © xingfudingge

---

## 📋 版本历史

| 版本 | 日期 | 变更 |
|---|---|---|
| 2.2.1 | 2026-11-26 | 修复 GitHub Release 打包：macOS 只出 dmg、Windows 只出 NSIS setup.exe；打包超时可失败重跑 |
| 2.2.0 | 2026-11-26 | 移除授权 / 试用 / 设备绑定，开源发布 |
| 2.1.0 | 2026-10-27 | 封版：通知中心、知识空间、产品文档与原型归档 |
| 2.0.0 | 2026-09-04 | 设备指纹稳定性 + UI 重设计 |
| 2.0.0 | 2026-09-03 | 重构为实施经理工作台；知识中心 / 报告 / 甘特图 |
