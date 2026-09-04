# PMTool 项目交接文档（V2.0 · 实际版）

> 本文档基于 2026-09-03 实际代码结构整理，替换早期 v1.0 版本。

## 项目概述

PMTool「实施经理个人工作台」，一款桌面端项目管理软件，双应用架构：
- **PMTool 主应用**（`com.example.pmtool`）— 项目管理核心
- **License Generator**（`com.pmtool.license-generator`）— 授权码生成器

**平台：**
- PMTool 主应用：**Windows + macOS 双平台**（`bundle.targets: "all"`，含 `.ico`/`.icns` 图标，`main.rs` 带 `windows_subsystem`）
- License Generator：**仅 macOS**（`bundle.targets: ["dmg"]`）

**技术栈：**
- 桌面框架：Tauri 2.x（Rust 后端 + 前端）
- 前端：React 19 + Vite 5 + TypeScript（pnpm monorepo）
- 后端：Rust（rusqlite + 分层架构）
- 数据库：SQLite（Drizzle ORM 生成迁移，rusqlite 运行时加载）
- 授权：RSA + Ed25519 签名（双轨，见第八章）

---

## 一、项目结构（实际）

```
PMTOOL/
├── app/                            # 主应用
│   ├── src-tauri/                  # Rust 后端
│   │   ├── src/
│   │   │   ├── main.rs             # 入口（调 pmtool_lib::run()）
│   │   │   ├── lib.rs              # 应用装配
│   │   │   ├── db.rs               # rusqlite 连接 + 迁移加载
│   │   │   ├── crypto.rs           # RSA 授权（旧）
│   │   │   ├── crypto_ed25519.rs   # Ed25519 授权（新，暂残缺）
│   │   │   ├── commands/           # 12+ 命令域（mod.rs 汇总）
│   │   │   ├── repositories/       # 数据访问层
│   │   │   ├── services/           # 业务层
│   │   │   └── keys/               # 密钥（已 gitignore）
│   │   ├── tauri.conf.json
│   │   ├── Cargo.toml / build.rs
│   │   └── icons/                  # icns(mac) + ico(win)
│   ├── src/                        # React 前端（@ 别名 → ./src）
│   │   ├── pages/                  # 10 个页面
│   │   ├── components/             # 组件（含 DocumentEditor/ FilePreview/ KnowledgeSpaceView/）
│   │   ├── services/               # 38 个服务
│   │   ├── database/               # Drizzle schema + __tests__/
│   │   ├── types/ assets/ App.tsx main.tsx
│   ├── license-generator/          # 授权生成器（独立 npm+Cargo 栈）
│   │   ├── src-tauri/              # lib.rs + main.rs（重复实现）
│   │   ├── web/                    # index.html + 测试页
│   │   ├── package.json / vite.config.js
│   ├── scripts/                    # icon-convert.mjs 等
│   ├── package.json / vite.config.ts / tsconfig*.json
│   ├── drizzle.config.ts / vitest.config.ts / vitest.setup.ts
│   └── pnpm-workspace.yaml
├── database/                       # 迁移脚本源码（migrations/*.sql）
├── docs/  V8/                      # 开发文档 / 设计稿
├── start.sh                        # 启停 + 打包一体化脚本
└── README.md
```

---

## 二、快速开始

### 2.1 环境
```bash
# Rust 工具链（自定义路径）
source /Users/example/AIWorkSpace/env/tools/rust/cargo/env
# Tauri CLI
cargo install @tauri-apps/cli
# Node 18+, pnpm
pnpm --version
```

### 2.2 安装依赖（主应用）
```bash
cd app && pnpm install
```

### 2.3 启动
```bash
./start.sh start          # PMTool（Vite:1420 + Tauri）
./start.sh start-lg       # License Generator（1421）
./start.sh status / stop / stop-lg / stop-all / clean
```

---

## 三、PMTool 主应用核心模块

**命令域**（`src-tauri/src/commands/`）：`projects`、`project_tasks`、`project_issues`、`project_members`、`project_files`、`project_knowledge_bindings`、`knowledge_spaces`、`knowledge_folders`、`knowledge`、`reports`、`weekly_entries`、`holidays`、`todos`、`attachments`、`license`。

**服务层**（`services/`）：`license`、`trial`、`device_fingerprint`、`file_storage(_local)`、`file_browser`。

**页面**（`app/src/pages/`）：`HomePage`、`TodoPage`、`ProjectsPage`、`ProjectDetailPage`（6 tab，含甘特图）、`ReportsPage`、`KnowledgePage`（2026-09-03 重构）、`TemplatesPage`、`AIPage`、`SettingsPage`、`TaskCenterPage`。

> 早期 `Settings.tsx`/`LicenseManager.tsx` 已重构：`SettingsPage.tsx` + `components/LicenseActivation.tsx`、`LicenseGuard.tsx`。

---

## 四、数据库

- 连接：`src-tauri/src/db.rs`（rusqlite），启动时从 `database/migrations/*.sql` 加载迁移。
- Schema 权威源：`app/src/database/schema.ts`（Drizzle），`drizzle-kit` 生成迁移至 `database/migrations`。
- 实际数据库文件：`~/Library/Application Support/PMTool/pmtool.db`（开发期 `database/pmtool.db` 为测试数据）。

---

## 五、授权系统（重要）

**当前双轨并存：**
- **旧 RSA-PKCS#1 v1.5 + SHA-256**（`crypto.rs` + `services/license.rs` + 命令 verify/get_license_status/deactivate）— **可用的工作路径**。
- **新 Ed25519**（`crypto_ed25519.rs` + `activate_license_simple` + `license-generator/`）— ⚠️ **目前残缺/不可用**：`LicensePayload` 定义与 `crypto_ed25519.rs` 测试、`commands/license.rs` 引用的字段（`customer_name`/`edition`/`features`）**不匹配，无法编译**。

**授权码结构：** `PMT1-<前缀>-<签名(base64url)>-<数据(base64url)>`，签名链路 `Hex→Base64 URL_SAFE_NO_PAD`。

**密钥位置：**
- License Generator（Ed25519）：`~/.pmtool/license_generator_{private,public}.pem`
- 主应用 RSA：`src-tauri/keys/{private,public}.pem`（**已加 .gitignore 排除，私钥不入库**）

**待办：** 修复 Ed25519 链路字段不匹配/编译错误，使新授权 + 生成器可用。

---

## 六、关键配置

**主应用 `tauri.conf.json`：** `identifier: com.example.pmtool`，`version: 2.0.0`，`bundle.targets: "all"`（dmg/nsis/msi），`devUrl: http://localhost:1420`。使用 `pnpm`（beforeDevCommand）。

**License Generator `tauri.conf.json`：** `identifier: com.pmtool.license-generator`，`bundle.targets: ["dmg"]`（仅 macOS），`devUrl: http://localhost:1421`。

---

## 七、构建与发布

```bash
./start.sh build        # 全部 (默认)
./start.sh build pmt    # 只打包 PMTool
./start.sh build lg     # 只打包 License Generator
```
产物统一汇总到 `dist/`（build-dmg.sh 已合并进 start.sh，原独立构建脚本已删除）。

⚠️ **Windows 构建：** 主应用已配置双平台，但**仓库内无 CI / NSIS / MSI 构建流水线，Windows 包尚未实际构建验证**。

---

## 八、已知问题 & 注意事项

1. **macOS 窗口有时不显示** → 浏览器访问 `http://localhost:1421` 或 `test-api.html` 兜底。
2. **Ed25519 新授权残缺**（见第五章）— 需修复，列为专项。
3. **Windows 未构建验证**（见第七章）。
4. **Rust 自定义路径**：`/Users/example/AIWorkSpace/env/tools/rust/cargo/env`（start.sh 已适配）。
5. **schema.ts 落后于迁移**：`device_fingerprints`、`trial_records`、`knowledge_*` 等表未纳入 schema.ts，drizzle 类型层与 DB 脱节。
6. **License Generator 包管理未统一**：主应用用 pnpm，生成器用 npm，未纳入 workspace。

---

## 九、开发指南

- **前端测试**：Vitest + Testing Library（`src/**/*.test.ts(x)`，setup 在 `src/database/__tests__/setup.ts`）。
- **后端测试**：`src-tauri/tests/*.rs` + 模块内 `#[cfg(test)]`。
- **新增迁移**：改 `src/database/schema.ts` → `pnpm drizzle-kit generate` → 生成到 `database/migrations/`。
- **添加命令**：`commands/` 下新建 + 在 `mod.rs`/`lib.rs` 注册 `generate_handler![]`。

---

## 十、Git 和 GitHub 仓库管理

### 10.1 仓库信息（已确认）
**远程仓库**（私有，2026-09-03 已验证）：
```
名称: xingfudingge/PMTOOL
地址: https://github.com/xingfudingge/PMTOOL.git
默认分支: main   类型: 私有
鉴权: 账号 xingfudingge，PAT 全权限（admin/push/pull）
```
**鉴权说明：** token 存于本地机密文件 `.pmtool-github-token`（已被 .gitignore 排除，**严禁写入任何会被提交的文件**）。

### 10.2 分支策略
```
main → develop → feature/* / bugfix/* / release/*
```

### 10.3 提交规范（Conventional Commits）
`<type>(scope): subject` — feat/fix/docs/style/refactor/test/chore。

### 10.4 发布流程
更新 version → commit → `git tag vX.Y.Z` → `git push origin main` → `git push origin vX.Y.Z`。

---

## 十一、版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 1.0.0 | 2024-09-03 | 初始版本 |
| 1.0.1 | 2024-09-03 | 修复授权码编码格式 |
| 1.0.2 | 2024-09-03 | License Generator 浅色主题 |
| 2.0.0 | 2026-09-03 | 重构为实施经理工作台；双平台(主应用)；Drizzle+schema；知识中心/报告/AI/甘特图；Ed25519 新授权(待修)；RSA 私钥 gitignore；清理 ~460M 冗余 |

---

## 十二、联系

**项目负责人：** example
**项目位置：** `/Users/example/AIWorkSpace/projects/PMTOOL/`
**文档更新：** 2026-09-03
**GitHub 仓库：** `https://github.com/xingfudingge/PMTOOL`（私有）
