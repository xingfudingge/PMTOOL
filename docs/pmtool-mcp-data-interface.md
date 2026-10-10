# PMTool AI 接入引导 + 数据接口手册

> 版本 v2.0 · 2026-09-30
>
> **这份文档写给谁**：给作为「AI Agent」的你（Hermes / Codex / Cherry Studio 等）看。
> **它回答的唯一问题**：你怎么**接上来、拿到数据、把活干完**，不碰数据库、不手搓文件。
>
> 一句话原则：**你想知道什么 → 调 PMTool 的工具；你想生成什么 → 调 PMTool 的工具。**
> **永远不要自己去直连 PMTool 的 SQLite 数据库**（那是绕过所有校验与安全的错误做法），也**永远不要自己写脚本造 docx/pptx**（会产出打不开的坏文件）。

> ## ⛔ 两个最容易犯的错（2026-09-30 实际踩过，务必避开）
>
> **1) 把「XX 项目」当成 PMTool 软件本身。**
> 当用户让你「总结 / 汇报某个项目（如“晨曦智能印章项目”）的当前状态」时，这里的“项目”是
> **PMTool 数据库里登记的业务项目**（用 `project_search` / `project_list` 查到，比如“晨曦智能印章项目”
> HT-001），**不是 PMTool 这款软件**。别把这份文档、代码仓库、产品功能介绍写进去——那是跑题。
> **先调工具把目标业务项目找出来，再基于它返回的真实业务数据做总结**（默认走下文第三节的流程，
> `context_get` 一次拿全任务/风险/问题/需求/时间线）。
>
> **2) `--mcp` 跑不起来，先确认是不是旧版发版包，别让智能体去编译源码。**
> `--mcp` 是**发货自带功能**：源码里 `src-tauri/src/main.rs` 的 `--mcp` 分支直接进 `mcp::run_stdio()`，
> 无任何 feature gate，**新版安装包天生支持**。你只需 `pmtool.exe --mcp` 即可接入。
> 若拿到手的 `pmtool.exe` 传 `--mcp` 后走普通启动、直接进数据库初始化、不进入 JSON-RPC 循环，
> 说明你拿到的是**旧构建**（构建日期早于 mcp.rs 落地，如 09-17 版）——那是发版版本落后，
> **应由发布方用最新源码重新打包**，**绝不是让你（智能体）去编译源码**。
> - 判断：`grep -a -c 'pmtool__' "<pmtool.exe>"`，结果为 `0` 即该安装包不含此功能。
> - 正确处置：换用含 mcp.rs 的**最新发版安装包**，`pmtool.exe --mcp` 直接接入。若你手上只有旧包，
>   把「安装版缺少 `--mcp`，请用最新源码重新发版」反馈给发布方即可，不要自己动手编译。

---

## 〇、你只需要记住这三件事

1. **拿数据只有一个入口**：`pmtool__context_get`。它能一次把某个项目的**全部关键信息**（摘要、指标、逾期、风险、问题、需求、时间线）打包返回，**比你挨个查表快得多、也不容易漏**。
2. **生成 Word / PPT / PDF 只有一个入口**：`pmtool__document_generate`。你**只负责把要写的内容组织成 Markdown**，格式转换、文档结构、保存路径全是 PMTool 的事。
3. **生成前先取模板**：`pmtool__document_template`。它给你的不是空格式，而是一份**带撰写规范的模板**——照着填，产出就是结构化的报告，不是流水账。

> ❗ 遇到「工具参数传不进去」「报错」「想要的数据拿不到」时，**别去动数据库、别写脚本自己取**。看本文档第五节《排障》，那里有正确的解决姿势。

---

## 一、怎么连上来（1 分钟）

PMTool 以 **MCP stdio 服务**暴露：拉起本进程并加 `--mcp` 参数，走 stdin/stdout 的 JSON-RPC。

- 可执行文件：PMTool 主程序
  - Windows：`D:\Program Files\PMTool\pmtool.exe`
  - macOS：`.app` 包内的可执行二进制
- 入口参数：`--mcp`
- 服务名：`pmtool` · 版本 `1.0`
- 数据：连上即用**当前这份 PMTool 数据**（与主程序共享同一数据库），无需任何额外配置。

### 接入示例

**Codex CLI**

```bash
codex mcp add pmtool -- "D:\Program Files\PMTool\pmtool.exe" --mcp
```

**Cherry Studio**：在 MCP 设置添加 **stdio** 类型 server → 命令填 PMTool 主程序路径，参数填 `--mcp`。

> macOS 把可执行路径换成 `.app` 内二进制即可。

### 连上后第一步：探测

```text
initialize          → 返回 serverInfo(pmtool) 表示接通
ping                → 探活
tools/list          → 列出全部 pmtool__* 工具（以运行时为准）
```

---

## 二、怎么把握「一个项目」的全貌（最关键）

**用 `pmtool__context_get`，一次拿全，别挨个查。**

### 调用方式

```json
{
  "projectId": 1,                  // 必填：项目 id
  "views": [                       // 可选：要哪些视图，省略则给关键默认视图
    "project.summary",
    "project.metrics",
    "project.delays",
    "project.risks",
    "project.issues",
    "project.requirements",
    "project.timeline"
  ],
  "topN": 10                       // 可选：每条明细最多返回几条，默认 10
}
```

### views 一览（你要什么就带哪个）

| 视图 | 返回什么 | 什么时候用 |
|---|---|---|
| `project.summary` | 项目编号/名称/状态/优先级/负责人/客户/起止/完成率/逾期数/未解决问题数 | 先看总貌 |
| `project.metrics` | 核心数量指标：任务总数/完成/进行/待开始/逾期、完成率、风险/问题/需求条数 | 一句话结论、进度盘点 |
| `project.tasks` | 任务按状态统计分组 | 任务分布 |
| `project.delays` | **逾期任务明细**（含程序算好的逾期天数、负责人、计划完成日、进度） | 找延期问题 |
| `project.risks` | 风险等级分布 + 高危风险列表 | 风险分析 |
| `project.issues` | 问题状态分布 + 未解决清单 | 问题分析 |
| `project.requirements` | 需求状态/类型统计 | 需求盘点 |
| `project.timeline` | 项目时间线（阶段/起止/完成率/逾期数） | 里程碑、阶段汇报 |
| `project.knowledge` | 该项目关联的知识标题 | 补上下文 |

> **提前帮你算好的**：`project.metrics` 里的 `completionRate`（完成率）、`project.delays` 里的 `overdueDays`（逾期天数）、`project.risks` 里的 `highCritical`（高危数）——这些都**不用你自己算**，直接拿来用。

---

## 三、把活干完：一份「项目汇报」的标准流程

你被要求「生成某项目的进展汇报/周报/阶段汇报/总结」时，**照着这个顺序调，一次接通**：

### 第 1 步　摸清是哪个项目

```text
pmtool__project_search  { "query": "晨曦" }            # 按名称/编号/客户搜
pmtool__project_list    { "status": "EXECUTING" }      # 或列全部执行的
```

拿到 `id`（如 `1`）。

### 第 2 步　一次拿全项目信息

```text
pmtool__context_get { "projectId": 1, "views": ["project.summary","project.metrics","project.delays","project.risks","project.issues","project.requirements","project.timeline"] }
```

这是**最核心的一步**。返回里已经有：总体进度、完成率、逾期任务（含天数）、风险/问题/需求明细、阶段时间线。

### 第 3 步　取撰写模板（生成文档前必做）

```text
pmtool__document_template { "kind": "project" }          # project/weekly/monthly/phase/blueprint/summary/requirements/manual/focus/progress/charter/kickoff/scope/plan/wbs/schedule/riskplan/commplan/minutes/change/milestone/acceptance/lessons
```

它返回：**① 撰写规范（结论先行、先判断后证据、抓关键不铺清单、数据支撑、收尾给建议）＋ ② 报告骨架（章节标题）＋ ③ 每节怎么填**。**严格按这个骨架写**，不要自己发明结构。

### 第 4 步　按模板把第 2 步的数据填成 Markdown

- **结论先行**：开头一段话给出状态、进度、最大风险、下一步。
- **每节先判断、再给 2~4 点数据**支撑；**不要一条条罗列**任务/风险/问题（那是流水账）。
- **汇总要收敛**：明细放附录，正文只引关键数字。
- **数据要来自第 2 步**（别编造百分比/日期/完成情况）；没填写的字段写「暂未登记」。
- **格式**：标题用 `#`/`##`，章节间、段落间空一行，表格表头必填，禁用裸表格语法。

### 第 5 步　用 PMTool 生成文件

```text
pmtool__document_generate { "title": "晨曦智能印章项目实施情况报告", "markdown": "<第4步的全文 Markdown>", "format": "docx" }
```

- `format` 支持：`docx` / `pptx` / `pdf`。
- **保存位置由 PMTool 决定**（`PMToolData/ai/documents/`），**不要自己指定路径**；返回值就是生成后的绝对路径。

### 第 6 步　收尾

把返回的路径告诉用户，并给用户一句核心结论。**不要**把第 4 步的 Markdown 原文整段回给用户（那是过程稿）。

---

## 四、工具速查（按用途分）

> 完整清单以运行时 `tools/list` 为准；下方是当前实现的常用含义。

### 拿数据

| 工具 | 参数 | 用途 |
|---|---|---|
| `context.get` | `projectId`(必填), `views`(数组), `topN` | **一次拿单个项目全貌**（首选） |
| `project.search` | `query`(必填), `limit` | 搜项目 |
| `project.list` | `status`(可选), `limit` | 列项目 |
| `project.get` | `id` | 单个项目完整信息（背景/目标/范围） |
| `task.list` | `project_id`(可选；跨项目须配 status/owner/limit), `status`,`owner`,`limit` | 任务明细 |
| `task.get` | `id` | 单任务 |
| `risk.list` | `project_id`(必填), `limit` | 项目风险 |
| `issue.list` | `project_id`(必填), `limit` | 项目问题 |
| `requirement.list` | `project_id`(必填), `limit` | 项目需求 |
| `todo.list` | `project_id`(必填) | 待办 |
| `report.list` | `projectId`/`type`/`period`(可选) | 报告列表 |
| `report.get` | `id` | 报告全文 |
| `knowledge.search` | `query`(必填), `space`(可选) | 搜知识 |
| `knowledge.get` | `id` | 知识详情 |

### 生成 / 分析

| 工具 | 参数 | 用途 |
|---|---|---|
| `document.template` | `kind`（project/weekly/monthly/phase/blueprint/summary/requirements/manual/focus/progress/charter/kickoff/scope/plan/wbs/schedule/riskplan/commplan/minutes/change/milestone/acceptance/lessons；省略列全部） | 取撰写模板与规范（详见下节选模板） |
| `document.generate` | `title`, `markdown`, `format`(docx/pptx/pdf), `kind`(可选) | **生成 Word/PPT/PDF**（唯一入口）；传 `kind` 时返回结果里附 `quality` 质量门结论 |
| `project.calculate` | `projectId`, `kind`(bonus), `rules`(JSON) | 确定性计算（如奖金） |

### 选模板：按用户说的话匹配 kind（不是乱猜）

用户要什么文档，先用 `document_template` 取对应模板（kind 如下），再按模板结构填数据：

| 用户要的 | kind |
|---|---|
| 蓝图汇报/蓝图方案 | blueprint |
| 周报/周总结 | weekly |
| 月报/月度汇报 | monthly |
| 阶段汇报/阶段小结 | phase |
| 项目总结/结项 | summary |
| 需求规格/需求书 | requirements |
| 使用/操作/用户手册 | manual |
| 重点工作/专项报告 | focus |
| 工程/进度报告 | progress |
| 章程/立项书 | charter 或 kickoff |
| 范围说明书 | scope |
| 实施/项目计划 | plan |
| 工作分解/WBS | wbs |
| 进度计划/排期 | schedule |
| 风险管理 | riskplan |
| 沟通计划 | commplan |
| 会议纪要 | minutes |
| 变更申请/变更单 | change |
| 里程碑 | milestone |
| 验收报告 | acceptance |
| 复盘/经验教训 | lessons |
| 一般进展汇报/不明类型 | project |

不确定就省略 kind 列出全部可用，再挑匹配的。生成前必先取模板，禁止凭空发挥结构。

#### 结构化模板 spec + 质量门闭环（直接照做就能产出决策级文档）

`document_template(kind)` 返回的 `spec` 就是这份文档的**撰写说明书**，包含：
- `audience`：写给谁看；`purpose`：要达成什么判断/决策；
- `dataRequirements.required / optional`：必须/可选数据；
- `sections[]`：每节有 `title / purpose / required / requiredFields / renderType / emptyBehavior`。
  - required=true 的节缺了就降级；`emptyBehavior` 告诉你该节数据缺失时怎么处理（hide 隐藏 / data_quality 置顶提示 / unable_to_judge 写明无法判断 / mark_todo 标待明确事项 / strong_deny 严禁无证据下结论）；
- `tables / charts`：该用哪些表和图；`qualityRules / missingDataRules / approvalRules`：撰写、缺失数据处理、审批三套规则。

**标准工作流（务必遵守）**：
1. `document_template(kind)` → 读 `spec`，按 `sections` 逐节填，缺数据按 `emptyBehavior` 处理；
2. `document_generate(kind=..., title, markdown, format)` → 返回结果里的 `quality.state`；
3. 若 `state` 是 `DRAFT` 或 `CONDITIONAL`，看 `quality.suggestions`/`checks` 逐项补齐，**重试直到 `READY`** 再交付。

> `project.analyze` / `risk.analyze` / `issue.analyze` / `task.estimate` 是**聚合分析**工具，多数场景用 `context.get` 的对应视图已足够；需要单点深度分析时才用。

### 不能碰的

`task.reschedule/delay/complete/set_status`、`project.update_status` 是**修改业务数据**，**不通过 MCP 暴露**——要改必须先经 PMTool 对话里的变更单、由用户确认。**你不需要、也不能改数据库**。

---

## 五、排障（别走弯路）

| 现象 | 正确做法 |
|---|---|
| 工具报「参数传不进去 / 需要 id」 | 检查你传的参数**键名与值**（如 `projectId` 不是 `id`、`views` 是数组）；确认放在 `arguments` 里，不是别处。 |
| 拿到 projectId 却查不到 | 先用 `project.search` / `project.list` 确认该项目存在、用对 id。 |
| 取不到某一类数据 | 改用 `context.get` 的对应视图一次拿；仍缺则对照上方视图表。 |
| 生成文件出问题 | **只用 `document_generate`**；不要自己造 docx/pptx。取模板后按模板填，避免给出无结构流水账。 |
| 想「直接读数据库」的冲动 | **停止。** 拿数据走 `context_get`，生成走 `document_generate`，两者都是即时的、安全的、经过校验的。 |

---

## 六、安全边界（你作为客户端也要守）

- PMTool 只会通过 MCP 暴露**读取 + 生成**工具；**修改业务数据的工具一律不暴露**。
- 敏感信息（API Key / 授权码 / 机器码 / 系统配置）**永不出现在任何工具返回**。
- 你生成的文档由 PMTool 引擎产出、统一归档到 PMTool 数据目录，**不会散落到任意磁盘路径**。

---

## 七、实现位置（开发者参考）

- `app/src-tauri/src/mcp.rs`：stdio JSON-RPC 循环（`initialize`/`ping`/`tools/list`/`tools/call`）
- `app/src-tauri/src/services/ai/tool_gateway.rs`：工具目录 + 权限检查（`catalog()`）
- `app/src-tauri/src/services/ai/tools.rs`：工具注册表（唯一事实源）+ 执行
- `app/src-tauri/src/main.rs`：`--mcp` 分支入口
