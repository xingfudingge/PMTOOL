# PMTool V2.0 · 数据库 Schema RFC（01）

> 维护者 2026-08-21 立 · Phase 0 T0.4
> 状态：**基线已实现**（schema 全部写完，等待 Tauri 编译验证 runtime）

---

## 1. 设计目标

1. **数据完整**：覆盖设计稿 §13-16 的全部 **16 张表**（PM 决策 A1 · 2026-08-22）
2. **类型安全**：Drizzle ORM TypeScript schema 编译时类型验证
3. **可演进**：schema_version 字段用于未来 migration
4. **可观测**：audit_logs 记录所有 DELETE/MODIFY/IMPORT/EXPORT
5. **本地优先**：SQLite + 本地文件，无外部依赖

---

## 2. 架构

```
┌─────────────────────────────────────────────────────────────┐
│                  React Frontend (WebView)                    │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  TypeScript 业务代码                                    │  │
│  │  ↓ @tauri-apps/api invoke                              │  │
│  │  ↓ @tauri-apps/plugin-sql Database.execute / select    │  │
│  └────────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────┘
                         │ Tauri IPC Bridge
┌────────────────────────┴────────────────────────────────────┐
│              Rust 后端（tauri-plugin-sql）                    │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  rusqlite (native SQLite driver)                       │  │
│  │  ↓ SQLite database file                                │  │
│  └────────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────┴────────────────────────────────────┐
│            database/pmtool.db (SQLite 文件)                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. 16 张表总览（按业务域分组）

### 3.1 系统层（2 张）

| 表 | 用途 | 关键字段 |
|---|---|---|
| `system_config` | 软件 KV 配置 | config_key, config_value |
| `license` | License 授权 | license_key, signature, expire_date |

### 3.2 项目层（3 张）

| 表 | 用途 | 关键字段 |
|---|---|---|
| `projects` | 项目主表 | project_code, status, owner, start_date, end_date |
| `project_tasks` | 项目任务（父+子） | parent_id, work_days, progress, status |
| `project_issues` | 项目问题登记 | level, plan_date, actual_date, status |

### 3.3 待办层（1 张）

| 表 | 用途 | 关键字段 |
|---|---|---|
| `todos` | 待办（仅 MANUAL/WEEKLY） | source_type, priority, due_date, status |

**重要变更（维护者 2026-08-21 立）**：todos.source_type 仅保留 `MANUAL` 和 `WEEKLY`，**废除 `PLAN` / `RISK`**。历史 plan/risk todo 需清理（不在 Phase 0 范围）。

### 3.4 报告层（1 张）

| 表 | 用途 | 关键字段 |
|---|---|---|
| `reports` | 日报/周报/月报/项目报告/交付文档 | type, generate_type, status |

### 3.5 知识层（4 张）

| 表 | 用途 | 关键字段 |
|---|---|---|
| `knowledge_notes` | 知识笔记（project_id 空=个人） | project_id, source_type, content_type |
| `knowledge_tags` | 标签字典 | tag_name |
| `knowledge_note_tags` | 笔记-标签关联（M:N） | note_id, tag_id |
| `knowledge_ai_records` | AI 操作记录 | action, input_content, output_content |

### 3.6 模板层（2 张）

| 表 | 用途 | 关键字段 |
|---|---|---|
| `templates` | 报告模板 | type (BASE/AI), category |
| `template_variables` | 模板变量 | variable_key, variable_name, required |

### 3.7 AI 层（3 张）

| 表 | 用途 | 关键字段 |
|---|---|---|
| `ai_models` | AI 模型配置 | provider, model_name, api_url, api_key |
| `ai_sessions` | AI 会话 | model_id |
| `ai_messages` | AI 消息 | session_id, role, content |

### 3.8 日历层（2 张）

| 表 | 用途 | 关键字段 |
|---|---|---|
| `holidays` | 法定节假日 + 调休 | date, type (HOLIDAY/WORKDAY_SHIFT), is_workday |
| `work_schedule` | 排班配置 | weekday, is_workday, work_hours |

### 3.9 附件层（1 张）

| 表 | 用途 | 关键字段 |
|---|---|---|
| `attachments` | 附件索引（owner_type + owner_id） | file_name, file_path |

### 3.10 审计层（1 张）

| 表 | 用途 | 关键字段 |
|---|---|---|
| `audit_logs` | 操作审计 | action, target_type, target_id |

---

## 4. 关键设计决策

### 4.1 时间字段统一为 TEXT（ISO 8601 字符串）

- SQLite 没有原生 datetime 类型
- Drizzle 反射 SQL DEFAULT CURRENT_TIMESTAMP
- 优点：跨平台一致 / 易于 JSON 序列化 / 无时区混乱

### 4.2 日期字段统一为 TEXT（YYYY-MM-DD）

- 同上原因
- 便于 `LIKE '2026-08%'` 月份查询

### 4.3 外键约束全开 ON DELETE CASCADE / SET NULL

- project_tasks 删除项目时自动删除子任务（CASCADE）
- reports 删除项目时置空 project_id（SET NULL）
- knowledge_notes 删除项目时自动删除（CASCADE）

### 4.4 索引策略（设计稿 §17）

按查询频率建索引：
- 状态字段（status）
- 时间范围（start_date, end_date / due_date）
- 外键字段（project_id, owner_id）
- 复合索引（target_type + target_id）

### 4.5 todos.source_type 简化

**旧（V1.x）**：`TODO / PROJECT_TASK / PLAN / RISK / AI`（5 种）
**新（V2.0）**：`MANUAL / WEEKLY`（仅 2 种）

理由（维护者 2026-08-21 立）：
- 项目计划永远不直接产生 Todo（红线）
- 周任务管理可显式同步到 Todo
- 待办中心只保留 manual + weekly
- 禁止：项目计划/风险自动进入待办

---

## 5. 默认数据（应用启动时插入）

### 5.1 工作日（默认双休）

```sql
周一~周五：8 小时工作日
周六、周日：休息
```

### 5.2 系统配置默认值

| key | value | 说明 |
|---|---|---|
| todo_auto_delay | 1 | 默认开启自动顺延 |
| report_auto_generate | 1 | 默认开启报告自动生成 |
| report_daily_time | 18:00 | 每天 18:00 生成日报 |
| report_weekly_time | fri_18:00 | 每周五 18:00 生成周报 |
| report_monthly_time | last_day_18:00 | 月末 18:00 生成月报 |
| data_dir | ~/PMToolData | 默认数据目录 |
| ai_enabled | 1 | 默认开启 AI |
| theme | light | 默认主题 |

### 5.3 Schema 版本

```sql
schema_version = '2.0.0'
schema_migrated_at = CURRENT_TIMESTAMP
```

---

## 6. 数据流

### 6.1 读取流程

```typescript
// 业务代码
import { getDb } from '@/database/client'
import type { Project } from '@/database/schema'

const db = await getDb()
const projects = await db.select<Project[]>(
  'SELECT * FROM projects WHERE status = ? ORDER BY start_date DESC',
  ['IN_PROGRESS']
)
```

### 6.2 写入流程

```typescript
const db = await getDb()
await db.execute(
  'INSERT INTO projects (project_code, project_name, status, owner) VALUES (?, ?, ?, ?)',
  ['PM-2026-001', '测试科技智能合同项目', 'IN_PROGRESS', '刘海东']
)
```

### 6.3 启动时 Migration

```typescript
// main.tsx 或 App.tsx
import { runMigrations } from '@/database/client'

await runMigrations()  // 应用启动时执行一次（幂等）
```

---

## 7. 风险与后续

### 7.1 已知风险

- **SQLite 无并发写保护**：单进程使用安全，Tauri WebView 单实例 OK
- **大表性能**：knowledge_notes 如果超过 10 万条，需考虑 FTS5 全文搜索
- **文件路径跨平台**：attachments.file_path 在 Windows/macOS/Linux 路径分隔符不同

### 7.2 后续优化（不在 Phase 0 范围）

- Drizzle Migration 系统（用 drizzle-kit 生成 SQL migration）
- 数据库版本检查 + 自动升级
- 数据导出/导入（pmtool_backup.zip）
- SQLite WAL 模式（性能优化）
- FTS5 全文搜索（knowledge_notes / reports.content）

---

## 8. 验收清单

- [x] schema.sql 在 `database/` 目录（canonical 版本）
- [x] schema.sql 复制到 `app/public/schema.sql`（WebView runtime 访问）
- [x] Drizzle schema.ts 在 `src/database/`（TypeScript 类型）
- [x] client.ts 在 `src/database/`（DB 客户端封装）
- [x] index.ts 在 `src/database/`（barrel export）
- [x] package.json 添加 drizzle-orm + @tauri-apps/plugin-sql + drizzle-kit
- [x] Cargo.toml 添加 tauri-plugin-sql
- [x] lib.rs 注册 tauri_plugin_sql
- [ ] Tauri 编译验证（受 crates.io 网络阻塞）
- [ ] 运行时数据库自动创建（待 Phase 0 验收）

## 9. 实施约束（补充）

- `database/schema.sql` 是运行时 DDL 的唯一来源；`src/database/schema.ts` 必须与其同步。每次结构变更必须新增版本化 migration，不能修改已发布数据库来“升级”。
- 日期保存为 `YYYY-MM-DD`，时间戳保存为 UTC ISO 8601 文本；界面按用户本地时区展示。旧文中 `DATETIME` 是 SQLite affinity 描述，不代表本地时区。
- 所有枚举、状态迁移、计算规则见 `RFC-02-domain-rules.md`；本 RFC 不重复定义业务含义。
- 数据库访问边界、备份、文件与密钥存储见 `RFC-03-desktop-runtime.md`。

---

**版本**：2026-08-21（PMTool V2.0 立项 · Phase 0 T0.4 完成）
**下一阶段**：Phase 0 验收（T0.5 · 软件启动 + 页面切换 + SQLite 创建 + 数据目录可配）
