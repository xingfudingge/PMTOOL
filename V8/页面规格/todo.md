# 待办中心页面规格

> Phase 3 · RFC 关联：RFC-02 §4 + RFC-01 §3.3 + RFC-03 §1
> 唯一真相源：本文为 Phase 3 实现依据

---

## 1. 数据加载

| 数据块 | Rust command | 触发时机 |
|---|---|---|
| 当前视图待办 | `list_todos({status, sourceType})` | 视图切换 / 日期切换 |
| 节假日数据 | `list_holidays()` | 应用启动 + 每日 00:00 刷新 |
| 排班配置 | `get_work_schedule()` | 应用启动 |
| 邮件配置 | `get_system_config('smtp_*')` | 设置页 |

## 2. 状态机

### 待办状态（RFC-02 §2 + RFC-01 todos.status）
```
PENDING ─┬─→ IN_PROGRESS ─→ COMPLETED
         ├─→ DELAYED
         └─→ COMPLETED（可被重新打开为 IN_PROGRESS）
```

### 视图状态
```
DAY_VIEW ──→ WEEK_VIEW ──→ MONTH_VIEW
（同时支持：上一天/下一天/今日 导航）
```

### 自动顺延状态
```
DUE_TODAY_AND_NOT_COMPLETED → NEXT_WORKDAY（自动）
（每日最多顺延一次，RFC-02 §4）
```

## 3. 错误处理

| 错误类型 | UX |
|---|---|
| 数据库连接失败 | 顶部红色 banner + 重试 |
| 自动顺延失败 | 写入 audit_logs + 顶部黄色提示"今日顺延失败，请手动调整" |
| 邮件发送失败 | 设置页可见 + 有限重试（RFC-03 §3） |
| 视图加载失败 | 该视图区域显示"加载失败"+ 重试按钮 |

## 4. 空状态

- 日视图无待办：显示"今日清空"+ "新建待办"快捷按钮
- 周视图无待办：显示"本周清空"
- 月视图无待办：显示"本月清空"
- 视图加载中：骨架屏（Skeleton）

## 5. 边界条件

### RFC-02 §4 关键规则
- **source_type 仅 MANUAL/WEEKLY**：项目任务/问题/AI 不能自动生成待办
- **自动顺延仅处理当天到期且尚未完成的 MANUAL/WEEKLY**
- **每条待办每天最多顺延一次**
- **顺延查找下一工作日最多 366 天**，超出报错并提示检查排班

### RFC-02 §3 工作日规则
- 先查 holidays 表（is_workday 优先）
- 否则用 work_schedule.weekday
- 缺省排班 = 周一至周五工作

### RFC-02 §4 来源标识
- "下一工作日计划"必须标识来源：自动顺延 vs 用户手动计划
- UI 显示：图标 + tooltip "自动顺延" 或 "手动计划"

### 视图切换边界
- 日视图：周一至周日横向布局（含节假日/调休标识）
- 周视图：本周 + 可前后切换
- 月视图：日历网格 + 高亮当前日期

## 6. RFC 引用

| 条款 | 要求 |
|---|---|
| RFC-02 §2 | 任务状态用 PENDING/IN_PROGRESS/COMPLETED/DELAYED 同一枚举 |
| RFC-02 §3 | 工作日查询：holidays 优先 → work_schedule → 缺省排班 |
| RFC-02 §4 | source_type 仅 MANUAL/WEEKLY |
| RFC-02 §4 | 自动顺延：仅当天到期 + 未完成 + MANUAL/WEEKLY |
| RFC-02 §4 | 每条每天最多顺延一次 |
| RFC-02 §4 | 顺延超过 366 天报错 |
| RFC-02 §4 | 完成时写 completed_at（UTC ISO 8601） |
| RFC-03 §3 | 邮件发送前支持"测试邮件"；失败有限重试 |
| RFC-03 §3 | 自动化执行每分钟检查（应用运行时） |
| RFC-03 §3 | 幂等键：job_type + business_period + target_id |

## 7. Given-When-Then 验收样例

### 验收 #1：自动顺延跳过节假日
```
Given（RFC-02 §6.1）
And 今天 = 2026-08-21（周五）
And 用户创建一条 due_date = 2026-08-21 的 MANUAL 待办
And 2026-08-24（周一）是法定节假日
And 当天未完成
When 应用每分钟自动检查
Then due_date 自动移到 2026-08-25（周二）
And audit_logs 只有一条顺延记录
And 该待办当日不再次顺延
```

### 验收 #2：completed_at 归档
```
Given 创建 due_date = 2026-09-10 的待办
And 今天 = 2026-08-21
When 用户标记完成
Then todos.completed_at = UTC 当前时间
And todos.status = 'COMPLETED'
And 该待办出现在首页"今日完成"（本地日期 2026-08-21）
```

### 验收 #3：删除二次确认 + audit_logs
```
Given 用户在待办列表中点击删除
When 系统弹出删除确认对话框
And 显示该待办标题 + 影响范围（如有引用的 source_id）
And 用户确认删除
Then todos 中记录被删除
And audit_logs.action = 'DELETE', target_type = 'TODO', target_id = id, content = 标题
```

## 8. PM 决策关联

- **PM A1**：todos 表属于 16 张核心表，source_type 仅 MANUAL/WEEKLY
- **PM B1**：所有数据通过 Rust command 获取（list_todos / create_todo / complete_todo）
- **PM C1**：3 个验收样例必须有 vitest 测试（待 T0.4d 基建完成后）