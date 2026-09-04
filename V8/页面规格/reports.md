# 报告中心页面规格

> Phase 5 · RFC 关联：RFC-02 §5 + RFC-01 §3.4 + RFC-03 §3 + RFC-03 §5
> 唯一真相源：本文为 Phase 5 实现依据

---

## 1. 数据加载

| 数据块 | Rust command | 触发时机 |
|---|---|---|
| 我的日报列表 | `list_reports({type: 'DAILY', project_id: null})` | 我的日报 TAB |
| 我的周报列表 | `list_reports({type: 'WEEKLY', project_id: null})` | 我的周报 TAB |
| 我的月报列表 | `list_reports({type: 'MONTHLY', project_id: null})` | 我的月报 TAB |
| 项目日报列表 | `list_reports({type: 'PROJECT_DAILY', project_id})` | 项目详情日报 TAB |
| 项目周报/月报 | 同上 | 同上 |
| 已生成报告 | `list_reports({status: 'PUBLISHED'})` | 已生成报告 TAB |
| 模板列表 | `list_templates({category})` | 模板选择器 |
| 模板变量 | `get_template_variables(template_id)` | 模板选择器 |
| 自动报告配置 | `get_system_config('report_auto_generate')` 等 | 设置页 |

## 2. 状态机

### 报告类型（RFC-02 §5 + RFC-01 reports.type）
```
DAILY / WEEKLY / MONTHLY
PROJECT_DAILY / PROJECT_WEEKLY / PROJECT_MONTHLY
PROJECT_DELIVERY（交付文档）
```

### 报告状态（RFC-02 §5 + RFC-01 reports.status）
```
DRAFT ──→ ARCHIVED
  │
  └─→ PUBLISHED ──→ ARCHIVED
```

### 生成类型（RFC-01 reports.generate_type）
```
MANUAL（用户手动）
AUTO（定时自动）
AI）
```

## 3. 错误处理

| 错误类型 | UX |
|---|---|
| 模板变量缺失 | 弹窗显示"必填变量 X/Y 未提供" + 阻止生成 |
| 数据库连接失败 | 顶部红色 banner |
| 导出失败（Word/PDF） | Toast 提示 + 文件保留草稿 |
| 自动报告生成失败 | audit_logs 记录 + 设置页可见 + 有限重试 |
| 报告修改后冲突（已被自动报告覆盖） | 提示"该报告已被自动更新覆盖" + 备份用户修改 |

## 4. 空状态

- 我的日报空：显示"暂无日报"+ "生成日报"按钮
- 我的周报空：显示"暂无周报"+ 提示"每周五 18:00 自动生成"
- 我的月报空：显示"暂无月报"+ 提示"月末 18:00 自动生成"
- 项目报告空：同上加项目选择器
- 已生成报告空：显示"暂无已发布报告"

## 5. 边界条件

### RFC-02 §5 自动生成规则
- **周期**：日报 = 本地时间当天、周报 = 本周一至周日、月报 = 自然月
- **幂等键**：type + project_id + business_period
- **重生成规则**：再次运行只在草稿未人工编辑时刷新；否则记录跳过原因
- **自动生成时间**（RFC-01 §5.2 默认值）：
  - 日报：每天 18:00
  - 周报：每周五 18:00
  - 月报：每月最后一天 18:00

### RFC-02 §5 模板变量
- 缺失时使用 `template_variables.default_value`
- 必填变量仍缺失 → 生成失败 + 列出变量名
- 系统模板不可删除，允许复制后编辑

### RFC-03 §3 自动化执行
- 应用启动 + 恢复前台 → 补偿检查
- 应用运行时每分钟检查（不承诺后台执行）
- 每次执行：幂等键 + 写入审计

### RFC-03 §5 数据迁移（备份
- 备份在 SQLite 一致性快照后生成 ZIP
- 内容：数据库 + 受管附件 + manifest（版本/创建时间/文件哈希）
- **不得导出系统钥匙串密钥**

### 导出格式（RFC-01 §8.2 + §21）
- Word / PDF / Markdown
- 报告编辑器：TipTap（Markdown + 富文本）

## 6. RFC 引用

| 条款 | 要求 |
|---|---|
| RFC-02 §5 | 报告类型（DAILY/WEEKLY/MONTHLY/PROJECT_*） + 状态（DRAFT/PUBLISHED/ARCHIVED） |
| RFC-02 §5 | 自动报告：本地时间计算周期 |
| RFC-02 §5 | 幂等：type + project + 周期 |
| RFC-02 §5 | 模板变量缺失处理 |
| RFC-03 §3 | 自动化执行：每分钟检查 + 启动/前台补偿 |
| RFC-03 §3 | 幂等键：job_type + business_period + target_id |
| RFC-03 §5 | 备份含 manifest + 哈希；不含钥匙串密钥 |
| RFC-01 §3.4 | reports 表字段 + generate_type（MANUAL/AUTO/AI） |

## 7. Given-When-Then 验收样例

### 验收 #1：自动日报幂等
```
Given 今天 = 2026-08-21（周五）
And 18:00 时自动触发日报生成
And 已存在今天的 DAILY 草稿（已人工编辑）
When 自动生成器运行
Then 不覆盖草稿
And audit_logs 记录"跳过原因：草稿已人工编辑"
And 不创建新的草稿
```

### 验收 #2：模板必填变量缺失
```
Given 模板含必填变量 {project_name}
And 必填变量 {customer_name} 缺失
When 用户生成报告
Then 阻止生成
And 弹窗显示"必填变量缺失：customer_name"
```

### 验收 #3：导出格式
```
Given 用户有 DAILY 报告（status=PUBLISHED）
When 用户点击导出
Then 可选 Word / PDF / Markdown
And 导出内容与报告 content 一致
And 附件一并打包（如有）
```

## 8. PM 决策关联

- **PM A1**：reports 表属于 16 张核心表
- **PM B1**：所有报告操作通过 commands::reports 业务命名（generate_daily_report 等）
- **PM C1**：3 个验收样例必须有 cargo test + vitest