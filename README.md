# PMTool · 实施经理个人工作台

> 桌面端项目管理软件 · V2.0 · 2026-09-04

PMTool 是一款面向实施经理的桌面端项目管理工具，覆盖项目、任务、知识、文档、报告、模板全流程。V2.0 采用 Tauri 2 + React 19 + SQLite 单仓双应用架构：**主应用**（项目管理）+ **License Generator**（授权生成器）。

---

## ✨ 核心特性

| 模块 | 说明 |
|---|---|
| **项目管理** | 项目列表 / 详情 / 甘特图 / 成员 / 任务 / 问题 / 文件绑定 |
| **任务中心** | 跨项目 TODO 聚合，优先级、提醒、逾期提示 |
| **报告系统** | 周报、阶段报告，模板填充 + 历史归档 |
| **知识中心** | 知识空间（树形）+ Markdown/富文本编辑 + 全文检索（2026-09-03 重构）|
| **模板中心** | 项目文件模板 + 知识/文档模板管理 |
| **授权系统** | Ed25519 签名授权 + 7 天免费试用（详见第五章）|

---

## 🧱 技术栈

| 层 | 选型 |
|---|---|
| 桌面框架 | **Tauri 2.x**（Rust 后端 + Web 前端）|
| 前端 | **React 19** + **Vite 5** + **TypeScript** |
| 包管理 | **pnpm** workspace（主应用） + npm（License Generator）|
| 后端 | **Rust**（rusqlite · 分层架构：commands / services / repositories）|
| 数据库 | **SQLite**（Drizzle ORM 生成迁移，rusqlite 运行时加载）|
| 授权签名 | **Ed25519**（ed25519-dalek + sha2）|
| 编辑器 | BlockNote / Markdown / Code Highlight |
| 测试 | Vitest（前端）+ cargo test（后端）|

---

## 📁 项目结构

```
PMTOOL/
├── app/                            # 主应用 + License Generator
│   ├── src/                        # React 前端
│   │   ├── pages/                  # 10 个页面（Home/Todo/Projects/...）
│   │   ├── components/             # LicenseGuard / LicenseActivation / DocumentEditor / ...
│   │   ├── services/               # 38 个前端服务
│   │   ├── database/               # Drizzle schema
│   │   └── types/                  # 类型定义
│   ├── src-tauri/                  # Rust 后端
│   │   ├── src/
│   │   │   ├── main.rs / lib.rs     # 入口 + 应用装配
│   │   │   ├── db.rs               # rusqlite 连接 + 迁移加载
│   │   │   ├── crypto_ed25519.rs   # Ed25519 验签
│   │   │   ├── commands/           # 12+ 命令域
│   │   │   ├── repositories/       # 数据访问层
│   │   │   ├── services/           # 业务层（license / trial / device_fingerprint / ...）
│   │   │   └── keys/               # 公钥清单 product_keys.json（入库；私钥不入库）
│   │   ├── tauri.conf.json
│   │   └── tests/                  # 集成测试
│   └── license-generator/          # 授权生成器（独立 Tauri 应用）
│       ├── src-tauri/              # Rust 后端 + 私钥签名
│       ├── web/                    # 前端（index.html + Vite）
│       └── package.json
├── database/                       # 迁移脚本源码（migrations/*.sql）
├── docs/  V8/                      # 设计文档 / RFC
├── tools/                      # 工具脚本
├── PMTOOL 项目交接文档.md           # 完整交接说明
├── LICENSE_GENERATOR交接文档.md
└── start.sh                        # 启停 + 打包一体化脚本
```

---

## 🚀 快速开始

### 环境要求

- **Node.js** 18+ · **pnpm** 8+
- **Rust** 工具链（stable）· **Tauri CLI**
- **macOS** 12+ / **Windows** 10+

### 安装依赖

```bash
# 主应用
cd app && pnpm install

# License Generator（如需使用）
cd app/license-generator && npm install
```

### 启动

> **推荐使用根目录的 `start.sh` 启停脚本**，统一管理 Vite + Tauri + 端口。

```bash
./start.sh start          # PMTool（Vite:1420 + Tauri）
./start.sh start-lg       # License Generator（1421）
./start.sh status         # 查看运行状态
./start.sh stop           # 停止 PMTool
./start.sh stop-all       # 停止所有服务
./start.sh build          # 打包应用（DMG/NSIS/MSI）
./start.sh clean          # 清理项目
```

或手动启动：

```bash
# 主应用
cd app && pnpm tauri:dev

# License Generator
cd app/license-generator && npm run tauri:dev
```

### 构建

```bash
./start.sh build          # 全部打包
./start.sh build pmt      # 仅打包 PMTool
./start.sh build lg       # 仅打包 License Generator
```

产物汇总到 `dist/`。

> ⚠️ **Windows 构建**配置已就绪，但**未实际跑过 CI/打包流水线**。首次出包前需本地验证。

---

## 🔐 授权系统

PMTool 使用 **Ed25519** 数字签名授权（v2.0，协议前缀 `LC1`）。授权码由
**授权平台（LicensePlatform）** 在管理员本机签发，主应用只内置公钥验签：

1. 授权平台用**产品私钥**签发授权码；私钥加密存放在本机 SQLite，永不进 CI / 安装包
2. 授权码 = `LC1-<sig_b64 171位>+<encoded b64url JSON>`（每 5 字符加 `-`），claims 内含 `product` / `kid` / 设备 / 有效期
3. 用户在 PMTool「设置 → 授权管理」粘贴授权码
4. 主应用按 `claims.kid` 选择内置公钥验签 → 校验设备指纹 → 写入 SQLite

> 旧 `License Generator` 已停用，见 `app/license-generator/DEPRECATED.md`；旧 `PMT1` 码已作废。

### 关键文件

| 文件 | 作用 |
|---|---|
| `app/src-tauri/src/crypto_ed25519.rs` | Ed25519 验签 + License 解析（多公钥 kid 选择）|
| `app/src-tauri/src/services/auth/license_validator.rs` | 授权验证流水线（格式/签名/Claims/有效期/设备）|
| `app/src-tauri/keys/product_keys.json` | 公钥清单（kid → public_hex，**必须入库**）|
| `app/src-tauri/src/services/device_fingerprint.rs` | 设备指纹（基于硬件 UUID，重装不变）|
| `app/src-tauri/src/services/trial.rs` | 7 天免费试用逻辑 |
| `app/src-tauri/src/components/LicenseActivation.tsx` | 激活弹窗 |
| `app/src-tauri/src/components/LicenseGuard.tsx` | 启动授权检查 |
| `app/license-generator/` | 旧授权生成器，已停用（仅历史参考）|

### 授权与打包（公钥入库 · CI 零 secret）

- **公钥入库**：`app/src-tauri/keys/product_keys.json` 必须提交，构建时 `include_str!` 编进主应用。
  格式：
  ```json
  {"product":"PMTOOL","keys":[{"kid":"PMTOOL-2026-01","public_hex":"<64 位小写 hex>"}]}
  ```
- **私钥不出本机**：私钥只在授权平台本机库（主口令加密），备份走离线 `.lpbak`；
  仓库、CI、安装包都不含私钥。
- **轮换时新旧公钥并存**：新公钥追加到 `keys` 数组并分配新 `kid`，旧公钥保留 →
  旧授权码继续有效；客户端按 `claims.kid` 选公钥，无需为兼容多代密钥改代码。
- **CI 无 secret**：GitHub 打包只 checkout + 编译，不注入任何私钥。
- **密钥守卫**：`bash scripts/check-release-keys.sh` 会扫描私钥/备份串、校验公钥清单格式、
  禁止 workflow 注入私钥 secret；CI 由 `.github/workflows/guard-keys.yml` 以及
  `pmtool-macos.yml` / `pmtool-windows.yml` 的 `guard` job 调用，守卫不过不打包。

### 迁移：公钥入库 + 重新打包 + 重发 3 台设备

（本仓库暂无 `docs/pmtool-migration.md`，步骤暂记于此。）

1. 确认 `app/src-tauri/keys/product_keys.json` 已入库，`kid` / `public_hex` 与授权平台
   `lic product list` / 导出公钥的输出一致。
2. 跑守卫与测试：
   ```bash
   bash scripts/check-release-keys.sh
   cd app/src-tauri && cargo test --lib
   ```
3. 重新打包：本地构建，或推 `v*` tag 触发 `pmtool-macos.yml` / `pmtool-windows.yml`
   （守卫不过不会进入 build）。
4. 安装新包，确认主应用内置的是新公钥（可用一条新码做冒烟激活）。
5. 在授权平台为 3 台设备重新签发 `LC1` 码（同一产品、新 `kid`、按设备绑定），逐台激活验证。
6. 旧 `PMT1` 码作废、不再续签；历史台账以平台导入记录为准。

### 密钥位置

- **产品私钥**：授权平台本机加密库（不进仓库、不进 CI、不进安装包）
- **公钥清单**：`app/src-tauri/keys/product_keys.json`（入库）
- **本地私钥/备份文件**：由 `.gitignore` 排除，严禁提交进仓库

### 试用

首次启动可选择「7 天免费试用」，试用记录在 `trial_records` 表。仅可开始一次。

---

## 🧪 测试

```bash
# 前端（Vitest）
cd app && pnpm test

# 后端（cargo test）
cd app/src-tauri && cargo test
```

测试覆盖：
- ✅ Ed25519 验签（合法 / 篡改 / 错误公钥 / 过期）
- ✅ License 激活流程（签名 / 设备匹配 / DB 写入）
- ✅ 设备指纹稳定性
- ✅ 授权过期自动失效

---

## 📚 设计文档

| 文档 | 说明 |
|---|---|
| `V8/RFC/01-database-schema.md` | 数据库设计 |
| `V8/RFC/02-domain-rules.md` | 领域规则 |
| `V8/RFC/05-license.md` | 授权系统 RFC |
| `V8/RFC/06-todo-data-model.md` | TODO 数据模型 |
| `V8/RFC/08-project-center.md` | 项目中心 |
| `PMTOOL 项目交接文档.md` | 完整项目交接 |
| `LICENSE_GENERATOR交接文档.md` | 授权生成器交接 |

---

## 🔀 Git 与发布

### 分支策略

```
main → develop → feature/* / bugfix/* / release/*
```

### 提交规范（Conventional Commits）

`<type>(scope): subject` — `feat` / `fix` / `docs` / `refactor` / `test` / `chore`

### 发布流程

1. 更新 `app/package.json` 的 `version`
2. `git commit` + `git tag vX.Y.Z`
3. `git push origin main` + `git push origin vX.Y.Z`

---

## ⚠️ 已知问题

| 问题 | 说明 |
|---|---|
| License Generator 包管理 | 与主应用 pnpm workspace 割裂（独立 npm） |
| `app/src/database/schema.ts` | 部分新表（device_fingerprints / trial_records / knowledge_*）未纳入 |
| Windows 构建 | 仓库无 CI，双平台出包未实测 |
| macOS 偶发窗口不显示 | 浏览器访问 `http://localhost:1421` 或 `app/license-generator/web/test-api.html` 兜底 |

---

## 📋 版本历史

| 版本 | 日期 | 变更 |
|---|---|---|
| 2.0.0 | 2026-09-04 | Ed25519 授权系统修复 + 设备指纹稳定性 + UI 重设计 |
| 2.0.0 | 2026-09-03 | 重构为实施经理工作台；Drizzle+schema；知识中心/报告/甘特图；双平台 |
| 1.0.x | 2024-09-03 | RSA 授权初始版（已废弃）|

---

## 📞 联系

- **项目负责人**：example
- **GitHub**：`https://github.com/xingfudingge/PMTOOL`（私有）
- **本地路径**：`/Users/example/AIWorkSpace/projects/PMTOOL/`