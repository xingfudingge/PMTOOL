# 项目中心页面规格

> Phase 4（最高优先级 20-30 天）· RFC 关联：RFC-02 §2 + RFC-01 §3.2 + RFC-03 §1
> 唯一真相源：本文为 Phase 4 实现依据

---

## 1. 数据加载

| 数据块 | Rust command | 触发时机 |
|---|---|---|
| 项目列表 | `list_projects({status?})` | 列表页挂载 |
| 项目详情 | `get_project(id)` | 详情页挂载 |
| 项目任务（含子任务） | `list_project_tasks(project_id)` | 详情页任务 TAB |
| 项目问题 | `list_project_issues(project_id)` | 详情页问题 TAB |
| 项目附件 | `list_attachments('PROJECT', project_id)` | 详情页文件 TAB |
| Excel 导入进度 | `import_project_excel(file_path)`（流式） | 导入触发 |
| 甘特图数据 | `get_gantt_data(project_id)` | 详情页甘特图 TAB |
| 项目进度 | 客户端按 RFC-02 §2 计算（基于 list_project_tasks） | 项目任务变化时 |

## 2. 状态机

### 项目状态（RFC-02 §2 + RFC-01 projects.status）
```
PLANNING ─┬─→ IN_PROGRESS ─┬─→ SUSPENDED ─→ IN_PROGRESS
          │                ├─→ COMPLETED
          │                └─→ CANCELLED
          └─→ CANCELLED
```

### 详情页 TAB 状态
```
INFO_TAB / TASKS_TAB / ISSUES_TAB / FILES_TAB / GANTT_TAB / AI_TAB
（每个 TAB 独立加载状态）
```

## 3. 错误处理

| 错误类型 | UX |
|---|---|
| 项目不存在（id 无效） | 跳转 404 |
| 项目状态迁移非法 | 红色提示 + 当前可迁移状态列表 |
| 父任务形成循环 | 阻止保存 + 红色提示"父任务不能是自身后代" |
| 删除父任务有 N 个后代 | 确认对话框显示"将级联删除 N 个后代任务"+ 确认 |
| Excel 导入失败 | 弹窗显示错误行 + 部分导入已成功的数据状态 |
| 附件上传失败 | Toast 提示 + 文件保持原状态 |

## 4. 空状态

- 项目列表空：显示"暂无项目"+ "新建项目"按钮
- 任务列表空：显示"暂无任务"+ "新建任务"按钮
- 问题列表空：显示"暂无问题登记"
- 附件列表空：显示"暂无附件"+ "上传附件"按钮
- Excel 未导入：显示"导入 Excel 快速创建任务"提示卡片

## 5. 边界条件

### RFC-02 §2 项目进度计算（4 指标 #1）
- 叶子任务 progress 加权平均
- `work_days > 0` 时权重 = `work_days`，否则 = 1
- 无叶子任务 → 进度 = 0
- 父任务不参与平均

### RFC-02 §2 项目剩余天数
- 从今天（不含）到 `end_date`（含）的工作日数
- 无 end_date → 显示"未设置"
- 计算基于 holidays + work_schedule

### RFC-02 §2 任务逾期
- 今日 > end_date 且任务未完成且项目不是 CANCELLED 状态 → 计算 `is_overdue`
- **不覆盖用户保存的历史状态**

### 父任务约束
- 父任务只能引用同一项目的任务
- **禁止形成循环**
- 删除父任务默认级联删除所有后代
- 级联删除必须显示后代数量并确认

### 甘特图
- 完成 → 绿色
- 进行 → 蓝色
- 未开始 → 灰色
- 延期 → 红色（is_overdue = true）

### Excel 导入/导出（SheetJS）
- 导入：项目 / 任务 / 子任务 / 问题支持
- 字段：任务名 / 跟进人 / 计划启动 / 计划完成 / 自然日工时 / 当前完成度 / 工作日工时 / 任务完成情况说明
- 导出：与导入同结构，确保数据一致（往返一致）

## 6. RFC 引用

| 条款 | 要求 |
|---|---|
| RFC-02 §2 | 项目状态迁移规则（5 个状态 + 允许的转换） |
| RFC-02 §2 | 任务状态迁移 + 任意非完成状态可互转 |
| RFC-02 §2 | 问题状态迁移（OPEN → IN_PROGRESS/RESOLVED → CLOSED） |
| RFC-02 §2 | 进度 = 0 时 status 自动 COMPLETED；status=COMPLETED 时 progress 自动 100 |
| RFC-02 §2 | 任务逾期计算（is_overdue）但不覆盖历史状态 |
| RFC-02 §2 | 项目进度 = 叶子任务加权平均 |
| RFC-02 §2 | 父任务约束（禁止循环 + 级联删除） |
| RFC-03 §2 | 附件导入复制到受管目录 + SHA-256 + UUID 重命名 |
| RFC-03 §2 | 仅受管目录内允许删除/重命名/预览 |
| RFC-03 §1 | 所有数据通过 Rust command 获取 |

## 7. Given-When-Then 验收样例

### 验收 #1：父任务循环检测
```
Given 项目 A 有任务 X（无父）
And 项目 A 有任务 Y（parent_id = X）
When 用户尝试把 X 的 parent_id 改为 Y
Then 系统阻止保存
And 提示"不能形成循环：X 是 Y 的祖先"
```

### 验收 #2：项目进度加权（RFC-02 §6.2）
```
Given 项目 P 有父任务 P1 + 2 个叶子任务
And 叶子任务 L1（work_days=2, progress=50）
And 叶子任务 L2（work_days=8, progress=100）
When 查看 P 的进度
Then 进度 = (2×50 + 8×100) / (2+8) = 90
And P1 不参与计算
```

### 验收 #3：Excel 往返一致
```
Given 用户从 Excel 导入项目 P 的任务
And Excel 含 5 行任务数据
When 导入完成
Then 数据库 tasks 表有 5 条对应记录
When 用户导出该项目
Then 导出 Excel 与原文件字段一致
And 任务名/跟进人/日期/工时/完成度完全相同
```

### 验收 #4：级联删除确认
```
Given 项目 P 有父任务 X
And X 有 3 个子任务 L1/L2/L3
When 用户尝试删除 X
Then 系统弹出确认对话框
And 显示"将级联删除 3 个子任务"
And 用户确认后才执行
And audit_logs 记录 DELETE action + 3 个后代被删除
```

## 8. PM 决策关联

- **PM A1**：projects / project_tasks / project_issues 属于 16 张核心表
- **PM B1**：所有项目相关操作通过 commands::projects / commands::project_tasks 等业务命名
- **PM C1**：4 个验收样例必须有 cargo test + vitest