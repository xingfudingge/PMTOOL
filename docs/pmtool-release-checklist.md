# PMTool 发版核对清单

> 用途：每次 `tauri build` 出安装包后，**照着逐项核对**。任何一项 FAIL 都不要发版，先解决再发。
>
> **为什么要这份清单**：`--mcp` 是发货自带功能（`src-tauri/src/main.rs` 的 `--mcp` 分支直接进 `mcp::run_stdio()`，无 feature gate），但**旧构建会缺它**——一旦发出版本不含 `--mcp`，任何外部 AI Agent（Hermes / Codex / Cherry）都无法通过 `pmtool.exe --mcp` 接入 PMTool 数据。所以发版前必须确认 MCP 真的进包。

---

## 1. 打包前

- [ ] 前端产物已生成：`cd app && pnpm build`。
  - `tauri.conf.json` 的 `frontendDist` 指向 `../dist`；缺 `dist` 会让 `generate_context!` 因找不到 `../dist` 报 proc macro panic，整包构建失败。
- [ ] 版本号已更新：`app/src-tauri/tauri.conf.json` 的 `version`（当前 `2.0.0`）。
- [ ] 依赖锁一致：`pnpm 12.4.2` + `pnpm-workspace.yaml` 的 `allowBuilds`（`esbuild: true` / `canvas: false` / `puppeteer: false`）。
- [ ] 无进行中的编译错误（其他并行改动）：`cargo check` / `cargo test` 通过。

## 2. 打包

- [ ] `cd app && pnpm tauri:build`（等价 `pnpm tauri build`）→ 产物 `app/src-tauri/target/release/<productName>.exe`（`productName` 见 `tauri.conf.json`，当前 `PMTool`）。
- [ ] 若报 `failed to remove ... target\release\pmtool.exe — 拒绝访问 (os error 5)`：**先关闭正在运行的 PMTool** 再重打。
- [ ] macOS 侧：`.app` 需在 Mac 上执行 build（用户同时在 Windows / macOS 双平台验证）。

## 3. 打包后关键核对（必做）

### 3.1 MCP 是否真的进包（最重要）

```bash
# 一步冒烟：启动 pmtool.exe --mcp → 握手 → tools/list 断言关键工具 → 可选跑一次 project.list
python scripts/pmtool_mcp_smoke.py "<产物 exe 路径>" --list
```

- 期望输出 `SMOKE PASS`，且列出 `pmtool__context_get` / `pmtool__document_generate` / `pmtool__document_template` / `pmtool__project_search`。
- 若输出 `FAIL: initialize 无响应`：**大概率是旧构建**（构建日期早于 `src-tauri/src/mcp.rs`，2026-09-27 落地），用最新源码重新打包。

```bash
# 兜底：直接看 exe 里是否含 MCP 工具注册名字符串
```

- `grep -a -c 'pmtool__' "<产物 exe>"` 结果 `>0` 即含 MCP 能力（该字符串来自 MCP 工具注册名）。

### 3.2 Document Engine

- 生成 Word / PPT / PDF 走 `pmtool__document_generate`，由 Rust 引擎（`src-tauri/src/document/`）产出，产物统一落 `PMToolData/ai/documents/`；**不依赖前端、不手搓文件**。
- 确认 docx / pptx / pdf 三格式都能从 Markdown 生成（含表格、中文）。

### 3.3 授权体系

- 授权属于设备：启用时基于实时 Device Identity + OS 安全存储 License 独立验证，数据库不参与授权判断。
- 确认授权设备指纹获取子进程仍静默化（Windows 免弹黑窗）。

### 3.4 数据库迁移

- 运行时迁移位于 `database/migrations/`（`build.rs` 编译期嵌入）；`database/schema.sql`（canonical）与 `app/src/database/schema.ts` / `schema.test.ts` 三者一致。

## 4. 跨平台

- [ ] Windows：`tauri build` 产物跑一遍 3.1 冒烟。
- [ ] macOS：`.app` 内二进制跑一遍 3.1 冒烟（逻辑一致，仅路径不同）。

---

## 5. 当前已知缺口（下次发版必须解决）

> **当前发布安装包 `D:\Program Files\PMTool\pmtool.exe`（2026-09-17 构建）早于 `mcp.rs`（2026-09-27）落地，缺 `--mcp`。**
> `scripts/pmtool_mcp_smoke.py` 已实测对其输出 `FAIL: initialize 无响应`。
>
> **因此：下次正式发版必须用含 `mcp.rs` 的最新源码重新打包**，并先跑通 3.1 冒烟。发版后，任何外部 AI Agent 才能 `pmtool.exe --mcp` 直连 PMTool 数据。
