# PMTool V2.0 · Claude Code 工作须知

> 每张自动化卡（kanban 派单）都从这里开始。读完再动手，约 600 token。
> 详细规范另见 `V8/GIT_RULES.md`（维护者立条）与 `README.md`。

## 结构
| 路径 | 职责 |
|---|---|
| `app/` | 主应用：React 19 + Vite 5 + TypeScript（`app/src/{pages,components,services,state,database,types}`） |
| `app/src-tauri/` | Rust 后端（rusqlite，分层 commands / services / repositories）+ 授权 Ed25519 |
| `app/license-generator/` | 授权生成器（独立 npm 包，非 workspace） |
| `database/` | Drizzle schema 与迁移 |
| `V8/` | 设计与规范：`看板.md`（当前阶段/任务）、`RFC/`、`页面规格/`、`验收/` |
| `scripts/`、`start.sh` | 启动与运维脚本 |
| `outputs/` | 交付物落盘处 |

## 常用命令
```sh
cd app && pnpm install            # 装依赖（pnpm workspace）
pnpm dev                          # 前端 dev（vite）
pnpm tauri:dev                    # 带壳调试（脚本内已加 PATH="$HOME/.cargo/bin"）
pnpm tauri:build                  # 打包（同上；直接 pnpm build 只是前端）
npx vitest run                    # 前端测试（__tests__ 目录，vitest）
cd app/src-tauri && cargo test    # 后端测试（含 tests/integration.rs、ed25519_e2e.rs）
```
> Rust 工具链在 `~/.cargo/bin`，不在默认 PATH —— 裸跑 `cargo` / `tauri` 会报找不到命令，用 `pnpm tauri:*` 或先 `export PATH="$HOME/.cargo/bin:$PATH"`。

## 已知坑
1. **依赖装不上先怀疑网络**：npm / crates.io / rsproxy 在这台机上时常不可达，表现为 HTTP2 PROTOCOL_ERROR 或长时间挂起。**不要反复重试全量 install**，先跑一次看具体 registry，再决定换源或跳过。
2. `app/src-tauri/tauri.conf.json` 的 hook 是 `npm run build`（cwd = `app/`），`frontendDist: ../dist`；改前端产物目录要三处一起对。
3. 授权是 Ed25519：私钥签名、公钥随产品入库；`app/src-tauri/tests/license_test.rs` 是契约测试，改授权逻辑必须让它绿。
4. `V8/看板.md` 是当前阶段的任务真相，动手前先看它，别按记忆里的旧阶段干活。
5. 提交粒度按 `V8/GIT_RULES.md`：一个功能阶段 / 一个 bug 修复 / 一组 UI 调整一次提交；**禁止**只改一行就 commit。

## 纪律
- 只改卡面「文件域」列出的文件，其余不动。
- 一次改完再验证；大文件先 `rg -n` 定位再按行读，别整份 Read。
- 提交信息带卡号：`fix(模块): … (#t_xxxxxxx)`；完成后立刻 commit，不留脏工作区。
