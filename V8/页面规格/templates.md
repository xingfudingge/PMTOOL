# 模板中心页面规格

> Phase 7 · RFC 关联：RFC-01 §3.6 + RFC-02 §5 + 设计稿 §10
> 唯一真相源：本文为 Phase 7 实现依据

---

## 1. 数据加载

| 数据块 | Rust command | 触发时机 |
|---|---|---|
| 基础模板列表 | `list_templates({type: 'BASE'})` | 基础模板 TAB |
| AI 模板列表 | `list_templates({type: 'AI'})` | AI 模板 TAB |
| 模板详情 | `get_template(id)` | 模板详情页 |
| 模板变量 | `get_template_variables(template_id)` | 模板编辑页 |
| 系统模板（不可删） | `list_templates({is_system: 1})` | 系统模板筛选器 |

## 2. 状态机

### 模板类型（RFC-01 templates.type）
```
BASE（基础模板 · 固定格式报告）
AI（AI 模板 · 5 阶段）
```

### 模板类别（RFC-01 templates.category）
```
DAILY_REPORT（日报）
WEEKLY_REPORT（周报）
MONTHLY_REPORT（月报）
PROJECT_DOC（项目文档）
```

### AI 模板阶段（设计稿 §10.3）
```
启动阶段（Project Charter / Kickoff）
规划阶段（Plan）
执行阶段（Execute）
监控阶段（Monitor）
收尾阶段（Closeout）
```

## 3. 错误处理

| 错误类型 | UX |
|---|---|
| 模板变量缺失必填项 | 阻止保存 + 红色提示 |
| 系统模板尝试删除 | 阻止 + 提示"系统模板不可删除，允许复制后编辑" |
| 模板循环引用 | 阻止保存 + 提示"模板不能引用自身" |
| AI 模板解析失败 | 顶部红色提示 + 保留原模板 |

## 4. 空状态

- 基础模板空：显示"暂无基础模板"+ 内置 4 个（日报/周报/月报/项目文档）
- AI 模板空：显示"暂无 AI 模板"+ "上传模板"按钮
- 模板变量空：显示"暂无变量"+ "添加变量"按钮

## 5. 边界条件

### 可配置范围（设计稿 §10.2）
- 允许：标题修改 / 字段排序 / 字段隐藏
- 禁止：删除系统关键变量（如 {{project_name}}、{{customer_name}}、{{owner}}）

### AI 模板流程（设计稿 §10.3）
- 用户上传模板
- AI 解析结构 → 保存模板知识
- 生成文档时调用

### 模板变量（RFC-01 template_variables）
- 必填变量：required = 1
- 默认值：default_value 在变量缺失时使用
- 必填变量仍缺失 → 生成失败（RFC-02 §5）

### 系统模板保护
- 系统模板：is_system = 1
- 系统模板不可删除（PM 验证样例 #2）
- 允许"复制后编辑"创建新模板

## 6. RFC 引用

| 条款 | 要求 |
|---|---|
| RFC-02 §5 | 模板变量缺失使用 default_value |
| RFC-02 §5 | 必填变量仍缺失 → 生成失败 + 列出变量名 |
| RFC-02 §5 | 系统模板不可删除，允许复制后编辑 |
| 设计稿 §10.2 | 允许标题修改 / 字段排序 / 字段隐藏 |
| 设计稿 §10.2 | 禁止删除系统关键变量 |
| 设计稿 §10.3 | AI 模板 5 阶段分类 |

## 7. Given-When-Then 验收样例

### 验收 #1：模板变量必填校验
```
Given 模板 T 含必填变量 {project_name}（required=1,）
）
And 必填变量 {customer_name}（required=1,）
And 用户尝试生成报告时未提供 customer_name
When 系统生成报告
Then 阻止生成
And 显示"必填变量缺失：customer_name"
And 生成失败原因写入 audit_logs
```

### 验收 #2：系统模板保护
```
Given 系统模板"日报模板 v1"（is_system=1,）
When 用户尝试删除该模板
Then 系统阻止删除
And 提示"系统模板不可删除，允许复制后编辑"
```

### 验收 #3：模板变量默认值
```
Given 模板 T 含变量 {approver}（required=1, default_value="待审批"）
When 生成报告时 approver 未提供
Then 使用默认值"待审批"生成
And 报告中显示"待审批"
```

## 8. PM 决策关联

- **PM A1**：templates + template_variables 属于 16 张核心表
- **PM B1**：所有模板操作通过 commands::templates 业务命名
- **PM C1**：3 个验收样例必须有 cargo test + vitest