# PMTool V2.0 · Codex 审查报告（RFC-04）

> 维护者 2026-08-22 立 · Codex prompt 触发
> 审查对象：V8/RFC/01-database-schema.md、V8/RFC/02-domain-rules.md、V8/RFC/03-desktop-runtime.md、V8/参考/PMTOOL开发设计稿.md、database/schema.sql、src/database/schema.ts

---

## 1. RFC vs 设计稿 · 一致性结论

| 文档 | 关系 | 结论 |
|---|---|---|
| RFC-01 (Schema) | 数据合同 | **冲突 1 项**：表数与实现不一致 |
| RFC-02 (领域规则) | 业务规则 | ✅ 一致（设计稿 L12 明示"以 RFC 为准"）|
| RFC-03 (桌面运行) | 运行时规则 | ✅ 一致 |
| 设计稿 (PMTOOL开发设计稿.md) | 产品范围 + 交互意图 | ✅ L12 已声明"冲突优先级：RFC-02 → RFC-01 → RFC-03 → 本文" |

**关键发现**：设计稿第 12 行已经声明 RFC 优先级 > 设计稿。所以 **RFC 是权威**，设计稿冲突项以 RFC 为准。**不需要修改设计稿**，但需要补齐实现侧（schema.sql + schema.ts）。

---

## 2. Schema 三方一致性 · 详细对比

### 2.1 表数冲突（必须修复）

| 文档 | 声明表数 |
|---|---|
| RFC-01 §1.1（数据完整目标） | **20 张表** |
| RFC-01 §3（20 张表总览） | 2+3+1+1+4+2+3+2+1+1 = **20 张** ✅ 标题与正文一致 |
| database/schema.sql（实际） | **16 张** ❌ |
| src/database/schema.ts（实际） | **16 张** ❌ |
| V8/看板.md L17（已修改） | 写了"20 张表 + 客户端封装" ❌（事实错误） |
| V8/进展/项目开发任务清单.md L17（已修改） | 写了"16 表"（之前的事实，但需要随调整改） |

**结论**：RFC-01 标题 + §3 已对齐为 20 张表，但 **schema.sql + schema.ts 实际只 16 张**，**缺失 4 张**。

**缺失表推断**（基于 RFC-01 §3 顺序 + schema.sql 实际统计）：

| 序号 | RFC-01 §3 分组 | schema.sql 实际 | 缺失推断 |
|---|---|---|---|
| 3.1 系统层 | system_config, license | 2/2 | ✅ |
| 3.2 项目层 | projects, project_tasks, project_issues | 3/3 | ✅ |
| 3.3 待办层 | todos | 1/1 | ✅ |
| 3.4 报告层 | reports | 1/1 | ✅ |
| 3.5 知识层 | knowledge_notes, knowledge_tags, knowledge_note_tags, knowledge_ai_records | 4/4 | ✅ |
| 3.6 模板层 | templates, template_variables | 2/2 | ✅ |
| 3.7 AI 层 | ai_models, ai_sessions, ai_messages | 3/3 | ✅ |
| 3.8 日历层 | holidays, work_schedule | 2/2 | ✅ |
| 3.9 附件层 | attachments | 1/1 | ✅ |
| 3.10 审计层 | audit_logs | 1/1 | ✅ |
| **总计** | 20 张 | **16 张** | **缺 4 张** |

**缺失的 4 张表未在 RFC-01 §3 明确列出**——这是个**新的 RFC 缺口**：
- RFC-01 标题和 §3.10 都声称 20 张，但分组只列了 16 张
- §9 提到"实施约束"但没列具体 4 张表

**2 个可能解释**：
- A. RFC-01 §3 的分组遗漏（10 组实际应为 12-14 组）
- B. RFC-01 §3 表数加法算错（"20 张"是笔误，实际 16 张）

**这必须由维护者拍板**，不能由 Code 兄弟自己猜。

### 2.2 字段一致性

| 字段 | RFC-01 | 设计稿 | schema.sql | schema.ts | 状态 |
|---|---|---|---|---|---|
| todos.source_type | MANUAL/WEEKLY（§4.5） | MANUAL/WEEKLY（L1845） | MANUAL/WEEKLY（L103） | MANUAL/WEEKLY（L139） | ✅ 一致 |
| todos.completed_at | TEXT（§4.1） | TEXT UTC ISO 8601（L1838） | `completed_at TEXT`（L102） | `completedAt: text('completed_at')`（L138） | ✅ 一致 |
| 索引齐全 | 18 个（§3.10） | 6 个（§17） | 16 个（L295-310） | 与 SQL 对齐 | ⚠️ 设计稿缺 12 个（RFC 比设计稿更全） |
| 外键约束 | 全开（§4.3） | 未提 | ON DELETE CASCADE/SET NULL 全开 | references().onDelete() 全对齐 | ✅ |

**结论**：已实现的 16 张表字段**三方一致**。

### 2.3 时间字段约定

| 文档 | 声明 |
|---|---|
| RFC-01 §4.1 | 时间字段 TEXT（ISO 8601） |
| RFC-01 §4.2 | 日期字段 TEXT（YYYY-MM-DD） |
| RFC-02 §1 | 日期为本地日历日 YYYY-MM-DD，应用默认时区为系统时区 |
| RFC-01 §9（补充）| 日期 YYYY-MM-DD，时间戳 UTC ISO 8601 文本，界面按本地时区展示 |

**schema.sql 实际**：
- `DATE` 类型：projects.start_date, todos.due_date 等
- `DATETIME` 类型：created_at, updated_at
- `TEXT` 类型：todos.completed_at（唯一 UTC 字段）

**⚠️ 矛盾**：RFC-01 §4.1 说"时间字段统一 TEXT"，**schema.sql 实际用了 DATETIME/DATE**。这是 SQLite 的 affinity 而非类型（DATETIME 是 TEXT 亲和），但代码生成器（Drizzle / tauri-plugin-sql）可能行为不一致。

**建议**：
- Drizzle schema.ts 用 `text()` 类型 ✅（已对齐）
- 但 schema.sql 的 SQL 字面量用 `DATETIME` / `DATE` — 这是 SQLite 关键字，**运行时 SQLite 实际按 TEXT/NUMERIC 亲和处理**
- Drizzle 生成的 INSERT 默认值 `'CURRENT_TIMESTAMP'` ✅

**风险**：低（运行时 SQLite 会按亲和类型自动转换），但**代码审查必须明确**——schema.sql 是给"人看的"，Drizzle 才是"代码跑的"。

---

## 3. 缺口清单（Codex 关注点）

### 3.1 页面级规格 ❌ 严重缺口

**当前状态**：T0.3 只实现了 8 大模块的**占位页**（标题 + Phase 标签 + 卡片描述），**没有任何真实业务页面规格**。

**RFC 要求 vs 当前实现**：

| 模块 | RFC 要求 | 当前 T0.3 | 缺口 |
|---|---|---|---|
| 主工作区 | 今日时间/今日待办/今日完成（按 completed_at 归档）/下一工作日计划（RFC-02 §4）| 4 个 PlaceholderCard | 全部缺 |
| 待办中心 | 日/周/月视图 + 自动顺延 + 邮件提醒 + 来源标识（RFC-02 §4）| 视图切换占位 | 全部缺 |
| 项目中心 | 列表/详情/任务/问题/甘特图/Excel + 进度加权算法（RFC-02 §2）| 按钮占位 | 全部缺 |
| 报告中心 | 日/周/月报 + 项目报告 + 自动生成 + 幂等键（RFC-03 §3）| 3 卡片 | 全部缺 |
| 知识中心 | 个人/项目/AI 三区 + 标签 + Markdown | 3 卡片 | 全部缺 |
| 模板中心 | 基础/AI 模板 + 变量替换 | 占位 | 全部缺 |
| AI 助手 | 数据范围确认（RFC-03 §4）+ 只读工具调用 | 4 卡片 | 全部缺 |
| 设置中心 | 基础/AI/邮件/自动化/工作日/数据管理 | 6 卡片 | 全部缺 |

**结论**：每个模块需要从 RFC 推导**页面级规格**（数据加载 / 状态机 / 错误处理 / 空状态 / 边界条件），**当前 0/8 完成**。

### 3.2 迁移方案 ⚠️ 部分缺口

**当前状态**：
- ✅ schema_version 字段已留（RFC-01 §5.3）
- ✅ RFC-01 §9 已声明"版本化 migration，不可修改已发布数据库"
- ✅ RFC-03 §5 已声明"升级前自动创建本地备份"
- ❌ **drizzle-kit 已装但未配置**（package.json L36）
- ❌ **migrations/ 目录不存在**
- ❌ **migration 运行器未实现**（schema.sql 是手写 DDL，不是 drizzle-kit 生成）

**缺口**：
- schema.sql 是手写 SQL，未来变更需要手动同步 Drizzle schema.ts + WebView 副本（app/public/schema.sql）—— **3 处必须同步**，容易漂移
- 没有 migration 历史表（schema_version 只是字段，没有 `migrations` 表记录每次执行的 SQL）
- 没有 backup → upgrade → restore 的原子流程（RFC-03 §5 要求）

**建议**：未来 Phase 用 drizzle-kit 生成 migration，存入 `database/migrations/0001_init.sql` 等。

### 3.3 自动化测试 ❌ 严重缺口

**当前状态**：
- ✅ RFC-02 §6 定义了 3 个验收用例（Given-When-Then 样例）
- ❌ **vitest 未装**
- ❌ **cargo test 未跑**
- ❌ **没有任何测试文件**

**开发门禁（项目开发任务清单 L6）**：
> 每个任务开始前需关联 RFC 相关章节；完成时必须提供迁移结果、自动化测试和 Given-When-Then 验收记录。未满足者不得标记完成。

**当前 T0.1-T0.5 都未满足此门禁**。

**建议**：
- 立即装 vitest（前端单元测试）+ cargo test（Rust 集成测试）
- 每个 Phase 任务加 Given-When-Then 验收
- 验收样例（RFC-02 §6）必须有对应测试文件

### 3.4 架构边界违规 ⚠️

**RFC-03 §1 明确禁止**：
- React 不得执行 SQL
- Rust command 只暴露按业务命名的最小能力
- React Page → Store/Service → Tauri typed command → Rust service/repository

**当前 client.ts 实现**（src/database/client.ts）：
```typescript
const db = await TauriDatabase.load('sqlite:pmtool.db')
const result = await db.select<Project[]>('SELECT * FROM projects WHERE status = ?', [...])
```

**问题**：
- `TauriDatabase.load('sqlite:pmtool.db')` 在 WebView 端直接打开 SQLite 文件
- `db.select('SELECT ...')` 暴露通用 SQL 给前端

**是否违规**：
- ✅ tauri-plugin-sql 本身是官方插件，能力封装在 Rust 侧
- ⚠️ 但**绕开了 Rust service/repository 层**——RFC-03 §1 明确禁止
- ⚠️ 通用 SELECT 暴露给 WebView = RFC-03 §1 "Rust command 只暴露按业务命名的最小能力" 违反

**建议**：
- 选项 A：在 Rust 侧写 service 层（如 `list_projects` command），WebView 只调 `invoke('list_projects', { status: 'IN_PROGRESS' })`
- 选项 B：接受当前设计（tauri-plugin-sql 官方支持）+ 在 RFC-04 标注为"已审批的偏离"

**这需要维护者拍板**。

---

## 4. 待维护者拍板的 3 个决策点

### 决策 A · 表数冲突
- A1. RFC-01 实际只有 16 张，"20 张"是笔误 → 改 RFC-01 标题和 §3.10
- A2. RFC-01 §3 漏列 4 张 → 由维护者明确这 4 张是什么（如 system_backups / migration_history / ...）

### 决策 B · 架构边界
- B1. 严格按 RFC-03 §1：WebView 只调 Rust commands，移除 client.ts 的通用 SQL
- B2. 接受 tauri-plugin-sql 现状，在 RFC-03 补"已审批偏离"

### 决策 C · 开发门禁生效时间
- C1. 立即生效：T0.1-T0.4 重做（补测试 + Given-When-Then）
- C2. 向前生效：只对 Phase 1+ 任务应用门禁，T0.* 不追溯

---

## 5. 已完成项（不藏问题）

**已严格对齐**：
- ✅ todos.source_type（RFC-02 + 设计稿 + schema.sql + schema.ts 四方一致）
- ✅ todos.completed_at（RFC-02 + 设计稿 + schema.sql + schema.ts）
- ✅ 字段类型与索引（16 张已实现表内部一致）
- ✅ 外键约束（RFC-01 §4.3 全开 + schema.sql 全开）
- ✅ HomePage 修复（解构 phase）—— 维护者已修
- ✅ pnpm build 通过 —— 维护者已验

**已实现**：
- ✅ RFC-01/02/03 三层规则全部成文
- ✅ database/schema.sql（14804 bytes）
- ✅ src/database/schema.ts（Drizzle 类型 + relations）
- ✅ src/database/client.ts（WebView DB 客户端）
- ✅ V8/看板.md + V8/进展/项目开发任务清单.md（项目文档）
- ✅ T0.1-T0.3 基础工程

**未完成项（不藏问题）**：
- ❌ 表数不一致（20 vs 16）— 待维护者拍板
- ❌ 页面级规格 0/8
- ❌ migration 工具未配置
- ❌ 自动化测试 0 个
- ❌ 架构边界（client.ts vs RFC-03 §1）— 待维护者拍板
- ❌ 开发门禁未对 T0.* 应用（vitest/cargo test 未跑）
- ❌ T0.1 Rust 编译验证（受 crates.io 网络阻塞，独立于本次审查）

---

**版本**：2026-08-22（Codex 审查基线 · 6 项缺口 + 3 项决策点待维护者拍板）
**下一阶段**：维护者拍板决策 A/B/C → 修复表数 → Phase 1 License 授权