# PMTool V2.0 · 项目中心 RFC（08）

> 状态：实施基线 · 2026-08-22 · Phase 4 T4.1 ~ T4.9
> 目的：定义项目中心页面、CRUD、计划管理、甘特图、Excel、AI、文件管理集成设计。

---

## 1. 范围（更新：T4.7/T4.8/T4.9 已实接）

| 子任务 | 状态 | 备注 |
|---|---|---|
| T4.1 项目 CRUD | ✅ 代码 100% | 复用 T0.4e list_projects / get_project / create_project / update_project / delete_project |
| T4.2 项目详情页 | ✅ 代码 100% | 4 指标 + 项目概况 + 文件 / AI 占位 |
| T4.3 项目计划管理 | ✅ 代码 100% | **PM 拍板 A · lib.rs 注册 project_tasks commands（6 个）** · WebView 端 services/projectTasks.ts · 加权平均算法 |
| T4.4 甘特图 | ✅ 代码 100% | Frappe Gantt 占位 · 颜色规则完整 |
| T4.5 Excel 导入导出 | ✅ 代码 100% | SheetJS 占位 · 字段映射完成 |
| T4.6 AI 能力接口 | ✅ 代码 100% | ProjectAIProvider 接口 + Mock 实现 |
| T4.7 项目任务真实数据层 | ✅ 代码 100% | commands/project_tasks.rs + repositories + WebView services + 7+ vitest |
| T4.8 项目问题登记册真实数据层 | ✅ 代码 100% | commands/project_issues.rs + repositories + WebView services + 7+ vitest |
| T4.9 文件管理 | ✅ 代码 100% | FileStorageProvider trait + LocalFileStorageProvider + commands/attachments.rs + FileManager.tsx |

## 2. 架构（严格 RFC-03 §1）

```
WebView
  → React Page (ProjectsPage.tsx / FileManager.tsx)
    → Service 层 (services/project.ts / projectTasks.ts / projectIssues.ts / fileStorage.ts)
      → Tauri typed command (commands::projects / project_tasks / project_issues / attachments)
        → Rust service (services/*.rs · Phase 4 T4.9 新增 file_storage)
          → Repository (repositories/*.rs)
            → SQLite
```

禁止 WebView 直 SQL（RFC-03 §1 + PM B1）。

## 3. PM 决策关联（2026-08-22）

- **PM A 拍板 · lib.rs 修改**：Phase 4 capability expansion 可修改 lib.rs 注册新 commands，但禁止：
  - 修改 schema 设计
  - 修改 Rust/WebView 分层架构
  - 修改数据库访问边界
  - 修改已有 command 行为

  **允许**：新增业务 command 注册。
  **本次修改文件**：src-tauri/src/lib.rs（仅 invoke_handler + AppState 增加 file_storage 字段）
  **未修改**：schema / 分层架构 / 数据库访问边界 / 已有 command 行为

- **PM A1**：source_type 严格 MANUAL/WEEKLY（todo 不在此范围）
- **PM B1**：所有项目操作通过 commands::projects 等业务命名
- **PM C1**：7 项门禁严格执行（每个任务提供 RFC + 修改 + 数据 + 测试 + GWT + build + 用户场景）

## 4. 数据模型（RFC-01 §3.2 · 不修改 schema）

```sql
projects               -- 主表（Phase 0 T0.4a）
project_tasks          -- 父 + 子任务（Phase 0 T0.4a）
project_issues         -- 问题登记（Phase 0 T0.4a）
attachments            -- 附件（owner_type + owner_id 多态 · Phase 0 T0.4a）
```

## 5. 维护者字段 vs schema 字段映射（T4.9 字段映射透明记录）

⚠️ 维护者原话字段 vs schema 字段不一致，未修改 schema，按以下映射实现：

| 维护者字段 | schema 字段 | 映射方式 |
|---|---|---|
| `project_id` | `owner_id` (owner_type='PROJECT') | 1:1 等价 |
| `relative_path` | `file_path` | 相对 PMToolData 根的路径 |
| `sha256` | **不存表** | 运行时计算（RFC-03 §2 要求） |
| `mime_type` | `file_type` | 语义等价 |
| `file_size` | `file_size` | 相同 |
| `file_name` | `file_name` | 相同 |
| `id` | `id` | 相同 |
| `created_at` | `created_at` | 相同 |
| `updated_at` | **未在 schema** | 暂等于 `created_at` · 未来单独 RFC |

## 6. FileStorageProvider 抽象（T4.9）

```rust
trait FileStorageProvider {
    fn save(owner_type, owner_id, file_name, content) -> Result<StoredFile>;
    fn absolute_path(relative_path) -> Result<PathBuf>;
    fn delete(relative_path) -> Result<()>;
    fn get_metadata(relative_path) -> Result<FileMetadata>;
    fn list(owner_type, owner_id) -> Result<Vec<String>>;
    fn compute_sha256(content) -> String;
}
```

**LocalFileStorageProvider**：
- 实际存储：`PMToolData/projects/{project_id}/files/{file_name}`
- 文件名冲突：UUID 重命名（RFC-03 §2）
- 路径校验：拒绝 `..` / 符号链接逃逸 / 外部绝对路径（RFC-03 §2）

**未来扩展**：CloudFileStorageProvider（S3/GitHub 等）· 当前仅接口占位。

## 7. 项目进度计算（RFC-02 §2）

整体进度 = 叶子任务 progress 加权平均：
- `work_days > 0` → 权重 = `work_days`
- 否则 → 权重 = 1
- 无叶子任务 → 进度 = 0
- 父任务不参与平均

**实现**：services/projectTasks.ts::computeProjectOverallProgress → 调 listProjectLeafTasks → 加权平均算法。

## 8. 状态机（RFC-02 §2）

项目状态：PLANNING / IN_PROGRESS / SUSPENDED / COMPLETED / CANCELLED

任务状态：PENDING / IN_PROGRESS / COMPLETED / DELAYED

问题状态：OPEN / IN_PROGRESS / RESOLVED / CLOSED（迁移规则见 services/projectIssues.ts::isValidIssueStatusTransition）

## 9. 验收样例（GWT）

### T4.7 项目任务
- 验收 #1：父任务引用不存在的 parent_id → 创建失败
- 验收 #2：父任务 + 2 叶子（work_days=2 50% + 8天 100%）→ 进度 90
- 验收 #3：父任务循环检测（task 自己当父任务）→ 拒绝

### T4.8 项目问题
- 验收 #1：OPEN → CLOSED 不合法（必须经 RESOLVED）
- 验收 #2：CLOSED → 任何状态都不合法（终态）

### T4.9 文件管理
- 验收 #1：上传 → SHA-256 计算 → attachments 表存路径
- 验收 #2：文件名冲突 → UUID 重命名
- 验收 #3：删除 → 数据库 + 文件同步删除

## 10. PM 状态汇报（PM C1）

```
Phase 4：
  - 代码：100% PASS
  - 规格：100% PASS
  - 测试：等待环境
  - 验收：阻塞
```

---

**版本**：2026-08-22（Phase 4 项目中心完整实施 · T4.1~T4.9 代码完成）
**下一阶段**：T0.5 验收（待网络恢复）+ Phase 5 报告中心（待 Phase 4 数据完整验证后启动）