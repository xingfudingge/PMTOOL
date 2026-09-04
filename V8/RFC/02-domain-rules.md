# PMTool V2.0 · 领域规则 RFC（02）

> 状态：实施基线 · 2026-08-22
> 目的：消除页面、服务和测试对业务规则的不同理解。

## 1. 通用约定

- 日期为本地日历日 `YYYY-MM-DD`；应用的默认时区为系统时区，用户变更系统时区后只影响展示和未来调度，不重写历史记录。
- 所有列表默认分页，每页 50 条；搜索为名称/标题的包含匹配。删除必须二次确认并写入 `audit_logs`。
- 枚举值必须严格校验，未知值为数据错误，不能静默降级。

## 2. 项目、任务与问题

| 实体 | 状态 | 允许迁移 |
|---|---|---|
| 项目 | `PLANNING`、`IN_PROGRESS`、`SUSPENDED`、`COMPLETED`、`CANCELLED` | `PLANNING→IN_PROGRESS/CANCELLED`；`IN_PROGRESS→SUSPENDED/COMPLETED/CANCELLED`；`SUSPENDED→IN_PROGRESS/CANCELLED` |
| 任务 | `PENDING`、`IN_PROGRESS`、`COMPLETED`、`DELAYED` | 任意非完成状态可互转；完成任务可被重新打开为 `IN_PROGRESS` |
| 问题 | `OPEN`、`IN_PROGRESS`、`RESOLVED`、`CLOSED` | `OPEN→IN_PROGRESS/RESOLVED`；`IN_PROGRESS→RESOLVED`；`RESOLVED→CLOSED/IN_PROGRESS` |

- 任务的 `progress` 范围为 0–100。设置为 100 时状态自动为 `COMPLETED`；设为 `COMPLETED` 时 progress 自动为 100。
- 若今日晚于 `end_date`、任务未完成且项目不是取消状态，查询时计算 `is_overdue`；不覆盖用户保存的历史状态。
- 任务仅能引用同一项目内的父任务；禁止形成循环。删除父任务默认级联删除所有后代，须展示后代数量并确认。
- 项目进度 = 所有叶子任务进度的加权平均。叶子任务未设置工期时权重为 1；设置 `work_days > 0` 时权重为 `work_days`。没有叶子任务时进度为 0。父任务不单独参与项目平均。
- 项目“剩余天数”是从今天（不含）到 `end_date`（含）的工作日数；无结束日期显示“未设置”。

## 3. 工作日与节假日

- 先查询 `holidays`：存在记录时以 `is_workday` 为准；否则使用 `work_schedule.weekday`；缺省排班为周一至周五工作。
- “下一工作日”从候选日的下一天开始查找，最多向后查 366 天；超出即报错并提示检查排班。
- 节假日同步失败不得阻塞本地使用；保留已缓存数据，并显示“同步失败/上次更新时间”。同步源、国家和年份在设置中可配置，MVP 默认中国大陆。

## 4. 待办与首页工作记录

- `todos.source_type` 仅允许 `MANUAL`、`WEEKLY`。项目任务、问题、报告、AI 输出不得自动创建待办。
- 待办状态使用任务同一枚举。完成时写入 `completed_at`（UTC ISO 8601），首页按该时间换算出的本地日期归入“今日完成”，而不是按计划日期。
- 自动顺延仅处理当天到期且尚未完成的 `MANUAL` / `WEEKLY` 待办；将 `due_date` 移到下一工作日，保留原任务和审计记录。每条待办每天最多顺延一次。
- “下一工作日计划”展示下一工作日到期、未完成的待办及用户手动计划；两类内容必须在 UI 中标识来源。

## 5. 报告与模板

- 报告类型：`DAILY`、`WEEKLY`、`MONTHLY`、`PROJECT_DAILY`、`PROJECT_WEEKLY`、`PROJECT_MONTHLY`、`PROJECT_DELIVERY`；状态：`DRAFT`、`PUBLISHED`、`ARCHIVED`。
- 自动报告以本地时间计算周期：日报为当天、周报为周一至周日、月报为自然月。相同“类型 + 项目 + 周期”只能有一份自动草稿；再次运行只在草稿未人工编辑时刷新，否则记录跳过原因。
- 模板变量缺失时使用 `default_value`；必填变量仍缺失时生成失败并列出变量名。系统模板不可删除，允许复制后编辑。

## 6. 统一验收样例

1. 给 2026-08-21（周五）创建未完成手工待办，且 8 月 24 日为非工作日时，自动顺延后到期日为下一个工作日，且审计日志只有一条顺延记录。
2. 创建父任务及两个叶子任务（工期 2 天、8 天，进度 50、100），项目进度为 90。
3. 一条计划于未来完成的待办今日被完成后，首页“今日完成”立即显示它，且不改变原计划日期。
