# PMTool V2.0 · Phase 0-4 验证清单

> 维护者 2026-08-22 指示 · 网络恢复后立即执行
> 验证纪律：严格执行 6 步 · 失败只修复不扩展

---

## 1. 环境检查（前置）

```bash
# 1.1 Node 版本（≥ 18）
node --version  # 应 ≥ 18（实测 24.16.0）

# 1.2 pnpm 可用
which pnpm  # 应为 /Users/example/AIWorkSpace/env/bin/pnpm
pnpm --version  # 应 ≥ 11（实测 11.22.0）

# 1.3 Rust 工具链
rustc --version  # 应 ≥ 1.77
cargo --version
ls ~/.cargo/bin/  # 应包含 rustc / cargo

# 1.4 网络可达
curl -I https://registry.npmjs.org/  # 应 200（非 ECONNREFUSED）
curl -I https://crates.io/  # 应 200
curl -I https://rsproxy.cn/  # 中国镜像备份
```

**期望**：全部正常。任一失败 → 修复环境 / 切镜像源，不展开新功能。

---

## 2. 安装检查

```bash
cd /Users/example/AIWorkSpace/projects/PMTool/app
pnpm install --ignore-scripts
```

**期望**：
- exit code = 0
- node_modules/ 生成（vite / @tauri-apps/* / drizzle-orm 等）
- 已知 esbuild 二进制问题（ERR_PNPM_IGNORED_BUILDS）→ `--ignore-scripts` 跳过

**失败处理**：
- ECONNREFUSED → 镜像源（registry.npmmirror.com）
- 缓存损坏 → `rm -rf node_modules pnpm-lock.yaml` 重装

---

## 3. build 检查（TypeScript + Vite）

```bash
pnpm build
```

**期望**：
- TypeScript 类型检查通过（无 error）
- Vite 构建成功（dist/ 生成）
- 关键文件存在：
  - dist/index.html
  - dist/assets/*.js
  - dist/assets/*.css

**关注点**：
- ✅ src/services/api.ts 类型与 Rust 端 Project / Todo 对齐
- ✅ src/services/projectTasks.ts 类型与 Rust 端 ProjectTask 对齐
- ✅ src/services/projectIssues.ts 类型与 Rust 端 ProjectIssue 对齐
- ✅ src/services/fileStorage.ts 类型与 Rust 端 Attachment 对齐

**已知风险**（离线审查 2026-08-22）：
- base64 大文件 IPC 风险：Phase 4 占位 · 记录不展开

---

## 4. Rust 检查（cargo check）

```bash
cd /Users/example/AIWorkSpace/projects/PMTool/app/src-tauri
cargo check
```

**期望**：
- 编译通过（warning 可接受，error 必须为 0）
- 17 个 commands 全部注册（lib.rs invoke_handler!）
- lib.rs AppState.db + AppState.file_storage 字段完整

**已注册 commands 清单**（按 lib.rs L73-110）：
- projects: list_projects / get_project / create_project / update_project / delete_project
- project_tasks: list_project_tasks / list_project_leaf_tasks / get_project_task / create_project_task / update_project_task / delete_project_task
- project_issues: list_project_issues / get_project_issue / create_project_issue / update_project_issue / delete_project_issue
- attachments: list_attachments / upload_attachment / delete_attachment / get_attachment_path / open_attachment / refresh_attachment
- todos: list_todos / get_todo / create_todo / update_todo / complete_todo / delete_todo
- license: verify_license / get_license_status / deactivate_license

**总计**：5 + 6 + 5 + 6 + 6 + 3 = **31 个 commands**

**关注点（离线审查 2026-08-22 已修复）**：
- ✅ list_attachments 锁范围已修（不再持锁做 I/O）
- ✅ create_project_task 自引用检查已修（task.id=0 不误报）

---

## 5. 测试检查（vitest + cargo test）

```bash
# 5.1 WebView 端 vitest
cd /Users/example/AIWorkSpace/projects/PMTool/app
pnpm test --run

# 5.2 Rust 端 cargo test
cd /Users/example/AIWorkSpace/projects/PMTool/app/src-tauri
cargo test
```

**期望**：
- vitest：78 个测试 PASS
- cargo test：15 个测试 PASS
- 总计 93 个测试 · 无 fail

**已知 vitest 测试文件**：
- src/database/__tests__/schema.test.ts
- src/database/__tests__/api.test.ts
- src/database/__tests__/home.test.ts
- src/database/__tests__/todo.test.ts
- src/database/__tests__/projectTasks.test.ts
- src/database/__tests__/projectIssues.test.ts
- src/database/__tests__/fileStorage.test.ts
- src/database/__tests__/integration.rs

**已知风险**：
- fileStorage.uploadAttachment 测试在 node 环境跑，参数 `file: File` 类型不对（jsdom 缺失）→ 当前测试只 mock 调用结构

**失败处理**：
- 定位失败测试 → 修复 → 重新跑 · **不借机扩展**

---

## 6. Tauri 启动检查（pnpm tauri dev）

```bash
cd /Users/example/AIWorkSpace/projects/PMTool/app
pnpm tauri dev
```

**期望**：
- Tauri 编译通过
- 桌面窗口出现（1280×800 默认）
- 窗口标题："PMTool · 实施经理工作台"
- 应用数据目录创建：`~/Library/Application Support/PMToolData/`
- SQLite 数据库创建：`pmtool.db`
- 8 个模块页面侧边栏显示（首页/待办/项目/报告/知识/模板/AI/设置）

**关键检查**：
- 左上角 Logo + "PMTool · 实施经理工作台 V2.0" 显示
- 侧边栏 8 个菜单可点击
- LicenseGuard 拦截 → 未激活时显示激活页（除非之前已激活）

**若启动失败**：
- 看 Vite 输出（端口 1420）
- 看 Rust 编译错误
- 检查 `tauri.conf.json` 的 `devUrl` / `frontendDist`

---

## 7. 核心业务流程检查（手动 + 半自动）

### 7.1 SQLite 初始化

```bash
ls -la ~/Library/Application\ Support/PMToolData/
sqlite3 ~/Library/Application\ Support/PMToolData/pmtool.db ".tables"
```

**期望**：看到 16 张表（按 RFC-01）：
- system_config / license / projects / project_tasks / project_issues / todos / reports
- knowledge_notes / knowledge_tags / knowledge_note_tags / knowledge_ai_records
- templates / template_variables / ai_models / ai_sessions / ai_messages
- holidays / work_schedule / attachments / audit_logs

### 7.2 Rust command 调用链（WebView → invoke → Rust → SQLite）

**手动验证**：
1. 启动 Tauri dev
2. LicenseGuard → 粘贴 License（dev gen_license 工具生成）→ 激活
3. 进入主布局
4. 点侧边栏「项目」→ ProjectsPage 加载（list_projects command）
5. 点「+ 新建项目」→ 输入 PM-2026-001 / 测试项目 → 提交（create_project command）
6. 点新建的项目 → 项目详情页 → 4 指标卡显示（来自 projects 表）
7. 点详情页「任务」TAB → 加载 list_project_tasks command

**SQLite 实时验证**：
```bash
sqlite3 ~/Library/Application\ Support/PMToolData/pmtool.db "SELECT id, project_code, project_name, status FROM projects;"
```

### 7.3 项目任务 CRUD

**手动验证**：
1. 在项目详情页「任务」TAB → 点新建任务 → 输入任务名 / 选父任务 / 填工时 → 提交
2. SQLite 验证：
```bash
sqlite3 ~/Library/Application\ Support/PMToolData/pmtool.db "SELECT id, task_name, parent_id, work_days, progress FROM project_tasks ORDER BY id DESC LIMIT 5;"
```
3. 勾选任务 → 标记完成 → SQLite 中 status='COMPLETED', progress=100
4. 删除任务 → SQLite 验证 ON DELETE CASCADE（子任务也删）

### 7.4 项目进度计算（RFC-02 §2 加权平均）

**手动验证**：
1. 创建 3 个叶子任务：
   - task A：work_days=2, progress=50
   - task B：work_days=8, progress=100
   - task C：work_days=0（默认 1）, progress=0
2. 期望整体进度：(2×50 + 8×100 + 1×0) / (2+8+1) = 900/11 ≈ 82

### 7.5 问题状态流转（RFC-02 §2）

**手动验证**：
1. 在项目详情页「问题」TAB → 新建 OPEN 状态问题
2. 改为 IN_PROGRESS → 改为 RESOLVED → 改为 CLOSED
3. 试 OPEN → CLOSED 直接跳转 → 应被拒绝（按 services/projectIssues.ts::isValidIssueStatusTransition）

### 7.6 附件完整流程（Phase 4 T4.9c · 核心场景）

**手动验证**：
1. 在项目详情页「文件」TAB → 上传合同.docx → 显示在列表（含 SHA-256 前 12 位）
2. **点击文件名** → 调 open_attachment → macOS Pages / Word 打开
3. 在外部程序编辑 → 保存回原文件 → 关闭程序
4. **点 🔄 刷新按钮** → 调 refresh_attachment → 重新读 mtime → 显示更新后大小
5. 删除附件 → 数据库 + 文件同步删除

**关键观察**：
- attachments 表 SHA-256 是运行态计算（不存表）
- externalPath 在 data_root/PMToolData/project/{id}/files/ 下

---

## 8. 异常处理（维护者原话 · 严格）

**只做**：
- 定位问题（cargo / vitest / 浏览器 console）
- 修复（最小变更）
- 重新跑对应验证
- 更新状态（代码/规格/测试/验收 4 维度）

**不做**：
- ❌ 借机扩展需求
- ❌ 顺带开发
- ❌ 重新讨论已冻结事项
- ❌ 启动 Phase 5

---

## 9. 验证完成后的汇报格式（按维护者原话）

```
代码：
规格：
测试：
验收：
问题：
修复：
```

---

## 10. 当前已知风险（离线审查 2026-08-22 已记录 · 不展开新修复）

| # | 风险 | 严重度 | 当前处理 |
|---|---|---|---|
| 1 | list_attachments 持锁做 I/O | 高 | ✅ 已修（锁范围最小化） |
| 2 | create_project_task task.id=0 自引用误报 | 中 | ✅ 已修（task.id>0 时检查） |
| 3 | upload_attachment base64 大文件 IPC | 低 | 记录 · Phase 4 占位 |
| 4 | fileStorage 测试在 node 环境（File 类缺失）| 低 | 记录 · 测试只 mock 调用结构 |
| 5 | ProjectsPage CRUD 后不重读 DB 数据 | 低 | 记录 · 当前 push 占位对象 |
| 6 | todos commands 与 Phase 0 T0.4e 注册对照 | 已对齐 | - |

---

**版本**：2026-08-22（Phase 0-4 验证清单 · 网络恢复后立即执行）
**执行纪律**：严格按 6 步顺序 · 失败只修复不扩展