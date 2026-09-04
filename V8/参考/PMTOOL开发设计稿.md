# PMTool 桌面端重构开发设计稿

版本：V2.0  
产品名称：PMTool  
产品定位：实施项目经理个人工作台  
目标平台：Windows 桌面端优先（兼容 macOS）  
开发模式：单机桌面应用，不采用 Web 服务化部署  
数据模式：本地 SQLite 数据库  
授权模式：时间授权 License  
AI模式：可选增强能力，关闭 AI 后软件核心功能正常运行

> 实施说明（2026-08-22）：本文定义产品范围与交互意图；实现时以 `V8/RFC/02-domain-rules.md`、`V8/RFC/01-database-schema.md`、`V8/RFC/03-desktop-runtime.md` 为准。冲突优先级为：RFC-02 业务规则 → RFC-01 数据合同 → RFC-03 运行时规则 → 本文。智能体开始功能前，必须阅读对应 RFC 与验收用例。


# 一、产品定位

## 1.1 产品目标

PMTool 是面向实施项目经理、交付经理、项目负责人设计的个人工作管理软件。

核心目标：

1. 管理个人每天工作
2. 管理多个实施项目全过程
3. 自动生成项目交付文档
4. 沉淀项目知识资产
5. 通过 AI 降低项目经理文档工作量
6. 替代 Excel + Word + 文件夹 + 日历 + 笔记软件组合


## 1.2 产品原则

### 原则1：本地优先

所有核心数据：

- 项目
- 任务
- 报告
- 知识
- 模板

默认保存在本机。


### 原则2：AI增强，不依赖AI

关闭 AI 后：

- 项目管理正常
- 待办正常
- 报告编辑正常
- 文件管理正常
- 知识库正常


开启 AI 后：

增强：

- 自动总结
- 自动生成报告
- 智能分析风险
- 智能生成交付文档


### 原则3：不重复造轮子

优先采用成熟开源组件。


# 二、技术架构设计


# 2.1 总体架构

┌───────────────────────────┐
│ PMTool Desktop │
├───────────────────────────┤
│ React UI Layer │
├───────────────────────────┤
│ Tauri Runtime │
├───────────────────────────┤
│ Rust Service │
├───────────────────────────┤
│ SQLite Database │
├───────────────────────────┤
│ Local Files / Attachments │
└───────────────────────────┘



# 2.2 技术选型


## 桌面框架

选择：

Tauri 2.x


原因：

- 安装包小
- 内存占用低
- 安全性高
- 支持 Windows/macOS/Linux
- Rust 后端能力强


不选择 Electron：

原因：

- 资源占用较高
- 对个人工作台没有必要


---

## 前端


技术：

React 19

TypeScript

Vite


UI：

shadcn/ui

TailwindCSS

Radix UI


规范：

所有页面必须组件化。


禁止：

- 超过500行页面文件
- 页面内直接写复杂业务逻辑


---

## 数据库


SQLite


ORM：

Drizzle ORM


原因：

- 轻量
- 类型安全
- 适合桌面软件


---

## 文件处理


文件索引：

SQLite


真实文件：

本地文件系统


结构：
PMToolData

├── projects
│ └── 项目编号
│ ├── docs
│ ├── images
│ └── attachments

├── reports

├── templates

└── knowledge


---

# 三、软件整体页面设计


# 3.1 主窗口布局

┌───────────────────────────────────────┐
│ Logo PMTool 搜索 AI 设置 │
├───────────┬───────────────────────────┤
│ │ │
│ 首页 │ │
│ 待办中心 │ │
│ 项目中心 │ 内容区域 │
│ 报告中心 │ │
│ 知识中心 │ │
│ 模板中心 │ │
│ AI助手 │ │
│ 设置中心 │ │
│ │ │
└───────────┴───────────────────────────┘



左侧菜单：

固定宽度：

220px


内容区域：

自适应。


---

# 四、模块设计


# 模块一：主工作区


## 4.1 模块定位

用户每天打开软件后的首页。


核心展示：

- 今日时间
- 今日任务
- 工作计划
- 项目状态
- 日历


---

# 页面布局

┌───────────────────────────┐
│ 今日日期 / 星期 / 节假日 │
├───────────┬───────────────┤
│ 今日待办 │ 本周项目进度 │
├───────────┴───────────────┤
│ 工作日历 │
├───────────────────────────┤
│ 今日工作内容 │
├───────────────────────────┤
│ 下一工作日计划 │
└───────────────────────────┘



---

# 功能


## 今日时间


显示：

- 年
- 月
- 日
- 星期
- 节假日


数据来源：

holiday表


---

## 今日待办


来源：

todos


展示：

- 未完成数量
- 已完成数量
- 超期数量


---

## 工作内容记录


分两个区域：


### 今日完成


来源：

用户填写

或者

任务完成自动同步


规则：

任何日期创建的任务：

只要今天点击完成：

必须加入今日工作内容。


例如：

任务：

2026-09-10完成

今天：

2026-08-21


用户提前完成。


记录：

完成时间：

2026-08-21


加入：

今日工作内容。


---

### 下一工作日计划


来源：

未开始任务

用户计划


---

# 五、代办中心


# 5.1 页面结构


三个视图：

- 日视图
- 周视图
- 月视图


---

# 日视图


布局：

周一 周二 周三 周四 周五 周六 周日

任务列表



功能：

- 上一天
- 下一天
- 今日


显示：

- 节假日
- 调休


---

# 自动顺延规则


配置：

setting.todo_auto_delay


开启：

任务当天未完成：

自动移动到下一工作日。


例如：

周五任务：

未完成


下一日期：

周一


如果周一：

法定假日


继续寻找。


---

# 邮件提醒设计


提醒策略：

## 默认


任务开始当天：

08:30提醒


任务截止当天：

09:00提醒


超过截止：

每天09:00提醒


---

## 高优先级任务


提前：

3天

提醒一次


---

## 邮件配置


支持：

SMTP


字段：

smtp_host

smtp_port

smtp_user

smtp_password

sender_email


---

# 六、项目中心


# 6.1 模块定位


PMTool核心模块。


负责：

- 项目生命周期管理
- 项目计划
- 项目风险
- 项目资料
- AI辅助


---

# 页面结构

项目列表

↓

项目详情

┌──────────────────────┐
│ 项目信息 │
├──────────────────────┤
│ 四指标 │
├──────────┬───────────┤
│ 项目计划 │ AI助手 │
├──────────┴───────────┤
│ 文件管理 │
└──────────────────────┘



---

# 项目列表


功能：

- 卡片模式
- 表格模式
- 搜索
- 状态过滤
- 新建项目


字段：


项目名称

客户

负责人

状态

进度

开始时间

结束时间


---

# 项目详情


顶部：

项目名称

状态

优先级

AI按钮

编辑



---

# 四指标


## 指标1

整体进度


计算：

任务权重平均。


---

## 指标2

父任务完成


---

## 指标3

子任务状态


显示：

完成

进行中

未开始


---

## 指标4

项目周期


显示：

开始日期

结束日期

剩余天数


---

# 项目计划


三个TAB：


## 整体计划


字段：


任务

负责人

开始时间

结束时间

工作量

完成度

状态



---

## 每周任务


自动根据项目周期生成。


显示：

第几周

日期范围

任务


---

## 问题登记册


字段：


问题描述

发现时间

等级

责任人

计划解决时间

实际解决时间

处理方式

当前状态


---

# 甘特图


开源：

Frappe Gantt


颜色规则：


完成：

绿色


进行：

蓝色


未开始：

灰色


延期：

红色



---

# Excel导入导出


开源：

SheetJS


支持：

导入计划

导出计划

# 七、项目中心详细设计（续）


# 7.1 项目文件管理


## 功能定位

项目所有交付资料统一管理。


替代：

- Windows文件夹
- 项目共享盘
- 临时文档


---

# 页面布局

┌────────────────────────────┐
│ 文件搜索 新建文件夹 上传 │
├─────────────┬──────────────┤
│ │ │
│ 文件树 │ 文件预览 │
│ │ │
│ 项目资料 │ Word/PDF/图片 │
│ 需求 │ │
│ 开发 │ │
│ 测试 │ │
│ 验收 │ │
└─────────────┴──────────────┘


---

# 文件能力


支持：

- 新建目录
- 上传文件
- 删除文件
- 重命名
- 搜索
- 标签


预览：

支持：

- PDF
- 图片
- Markdown
- Word


Word/PPT：

使用：

LibreOffice Headless


原因：

桌面端免费转换预览。


---

# 八、报告中心设计


# 8.1 模块定位


自动生成实施经理日常所有报告。


分：

1. 个人报告
2. 项目报告


---

# 8.2 个人报告


默认：

日报

周报

月报


---

# 页面布局

报告中心

├── 我的日报
├── 我的周报
├── 我的月报
│
├── 已生成报告
│
└── AI生成



---

# 日报


自动生成内容：


来源：


今日完成任务

项目进度

问题记录

明日计划

工作总结


---

# 自动生成规则


默认：

每天18:00


生成：

日报


---

# 周报


默认：

每周五18:00


自动生成：

日报

周报


---

# 月报


默认：

每月最后一天18:00


---

# 设置控制


表：

system_config


字段：

report_auto_generate

report_daily_time

report_weekly_time

report_monthly_time


---

# 报告编辑


生成后：


支持：


- 修改
- 保存
- 删除
- 导出


编辑器：

TipTap


支持：

Markdown

富文本


---

# 导出格式


支持：

Word

PDF

Markdown


---

# 8.3 项目报告


结构：

项目报告

├── 项目日报
├── 项目周报
├── 项目月报
│
└── 交付文档


---

# 项目日报


自动读取：


项目任务

项目问题

项目进度

项目成员记录


生成：

项目日报


---

# 项目交付报告


需要AI开启。


包含：


## 项目蓝图报告


内容：

项目背景

建设目标

系统架构

实施范围

实施计划


---

## 需求规格说明书


内容：

需求列表

业务流程

功能描述

接口需求


---

## 测试报告


内容：

测试范围

测试案例

测试结果

遗留问题


---

## 验收报告


内容：

验收范围

验收结果

用户确认


---

# 九、知识中心设计


# 9.1 产品定位


替代：

- OneNote
- Obsidian
- 语雀


但更偏向实施项目。


---

# 页面布局

知识中心

├── 个人知识库
│
├── 项目知识库
│
└── AI知识区


---

# 9.2 个人知识库


用于：

个人经验沉淀。


支持：

- Markdown
- 图片
- 附件
- 标签
- 分类


---

# 9.3 项目知识库


自动关联：

项目中心。


结构：
项目

├── 需求知识

├── 技术知识

├── 问题经验

├── 客户信息

└── 交付经验



---

# 9.4 AI知识区


区别：

人为记录：

USER


AI记录：

AI


字段：

source_type


值：

USER

AI


---

# AI能力


开启AI后：

支持：

会议总结

问题总结

项目经验提炼

自动生成知识


---

# 十、模板中心设计


# 10.1 模块定位


管理所有报告模板。


分：

基础模板

AI模板


---

# 10.2 基础模板


用途：

固定格式报告。


支持：

日报

周报

月报


---

# 模板机制


采用变量。


例如：

项目名称：

{{project_name}}

负责人：

{{owner}}



---

# 可配置范围


允许：

标题修改

字段排序

字段隐藏


禁止：

删除系统关键变量。


---

# 10.3 AI模板


AI开启后使用。


分类：

启动阶段

规划阶段

执行阶段

监控阶段

收尾阶段


---

# AI模板流程


用户上传模板


↓

AI解析结构


↓

保存模板知识


↓

生成文档时调用


---

# 十一、AI助手设计


# 11.1 产品定位


PMTool智能项目助手。


不是聊天机器人。


是：

项目经理工作助手。


---

# 页面布局


参考成熟AI Agent：

┌────────────────────┐
│ 对话区域 │
│ │
│ 用户 │
│ AI │
│ │
├────────────────────┤
│ 输入框 │
└────────────────────┘




---

# 功能


## 文档生成


输入：

生成项目周报


输出：

完整文档


---

## 项目分析


例如：


分析当前项目风险。


AI读取：

项目任务

问题

延期情况


输出：

风险报告。


---

## 当前系统问答


支持：

查询：

"本周有哪些延期项目"


AI查询：

SQLite


---

# AI模型配置


支持OpenAI兼容协议。


统一接口：

POST /chat/completions



支持：


OpenAI

Claude

Gemini

DeepSeek

通义

智谱

Moonshot

Ollama


---

# 十二、设置中心设计


# 页面结构


设置中心

├── 基础设置

├── AI设置

├── 邮件设置

├── 自动化设置

├── 工作日设置

├── 数据管理

└── 关于



---

# 12.1 基础设置


配置：


软件目录

数据目录

附件目录


支持：

打开目录


---

# 12.2 AI设置


字段：

模型名称

API地址

API Key

模型参数


---

# 12.3 邮件设置


SMTP配置。


字段：


smtp_host

smtp_port

username

password

sender


---

# 12.4 工作计划设置


支持：


正常双休


大小周


自定义


---

# 自定义排班


例如：


周一 工作

周二 工作

周三 工作

周四 工作

周五 工作

周六 工作

周日 休息



---

# 12.5 法定节假日


支持同步源：


默认：

国家节假日API


本地缓存：


holidays表


---

# 12.6 数据迁移


功能：


导出全部数据


生成：

pmtool_backup.zip


内容：

SQLite

附件

配置


---

导入：

选择备份文件

恢复全部数据



# 十三、SQLite数据库设计


数据库：

pmtool.db



# 13.1 系统表


## system_config


|字段|类型|
|-|-|
|id|INTEGER|
|config_key|TEXT|
|config_value|TEXT|
|created_at|DATETIME|
|updated_at|DATETIME|


用途：

保存软件配置。



---

## license


|字段|类型|
|-|-|
|id|INTEGER|
|license_key|TEXT|
|customer_name|TEXT|
|expire_date|DATE|
|status|INTEGER|
|signature|TEXT|
|created_at|DATETIME|


---

# 13.2 项目表


## projects


|字段|类型|
|-|-|
|id|INTEGER PK|
|project_code|TEXT|
|project_name|TEXT|
|customer_name|TEXT|
|status|TEXT|
|priority|TEXT|
|owner|TEXT|
|start_date|DATE|
|end_date|DATE|
|contract_amount|REAL|
|background|TEXT|
|objective|TEXT|
|scope|TEXT|
|description|TEXT|
|created_at|DATETIME|
|updated_at|DATETIME|


---

## project_tasks


|字段|类型|
|-|-|
|id|INTEGER|
|project_id|INTEGER|
|parent_id|INTEGER|
|task_name|TEXT|
|owner|TEXT|
|start_date|DATE|
|end_date|DATE|
|work_days|INTEGER|
|progress|REAL|
|status|TEXT|
|remark|TEXT|
|sort_order|INTEGER|


---

## project_issues


|字段|类型|
|-|-|
|id|INTEGER|
|project_id|INTEGER|
|title|TEXT|
|description|TEXT|
|level|TEXT|
|owner|TEXT|
|plan_date|DATE|
|actual_date|DATE|
|solution|TEXT|
|status|TEXT|


---

# 十四、待办数据库


## todos


|字段|类型|
|-|-|
|id|INTEGER|
|title|TEXT|
|content|TEXT|
|priority|TEXT|
|status|TEXT|
|start_date|DATE|
|due_date|DATE|
|completed_at|TEXT（UTC ISO 8601）|
|source_type|TEXT|
|source_id|INTEGER|
|remind_time|DATETIME|
|created_at|DATETIME|


source_type：仅允许 `MANUAL`、`WEEKLY`。

项目计划、问题和 AI 结果不得自动创建待办；用户可显式创建一条 `MANUAL` 待办。具体规则见 RFC-02 §4。


---

# 十五、报告数据库


## reports


|字段|类型|
|-|-|
|id|INTEGER|
|type|TEXT|
|project_id|INTEGER|
|title|TEXT|
|content|TEXT|
|template_id|INTEGER|
|generate_type|TEXT|
|status|TEXT|
|created_at|DATETIME|
|updated_at|DATETIME|


generate_type：


MANUAL

AUTO

AI


# 十六、SQLite数据库设计（续）


# 16.1 知识库相关表


## knowledge_notes


用途：

存储个人知识和项目知识。


|字段|类型|说明|
|-|-|-|
|id|INTEGER PK|主键|
|project_id|INTEGER|项目ID，可为空|
|title|TEXT|标题|
|content|TEXT|内容|
|content_type|TEXT|内容类型|
|category|TEXT|分类|
|source_type|TEXT|来源|
|is_ai_generated|INTEGER|是否AI生成|
|created_by|TEXT|创建人|
|created_at|DATETIME|创建时间|
|updated_at|DATETIME|更新时间|


content_type：
MARKDOWN
TEXT
IMAGE
FILE
LINK


source_type：
USER
AI
IMPORT



规则：

project_id为空：

代表个人知识库。


project_id存在：

代表项目知识库。



---

## knowledge_tags


|字段|类型|
|-|-|
|id|INTEGER|
|tag_name|TEXT|
|created_at|DATETIME|



---

## knowledge_note_tags


知识和标签关联。


|字段|类型|
|-|-|
|id|INTEGER|
|note_id|INTEGER|
|tag_id|INTEGER|



---

## knowledge_ai_records


AI操作记录。


|字段|类型|
|-|-|
|id|INTEGER|
|note_id|INTEGER|
|action|TEXT|
|input_content|TEXT|
|output_content|TEXT|
|created_at|DATETIME|



action：
SUMMARY
REWRITE
EXTRACT
GENERATE



---


# 16.2 模板数据库


## templates


|字段|类型|
|-|-|
|id|INTEGER|
|name|TEXT|
|type|TEXT|
|category|TEXT|
|content|TEXT|
|is_system|INTEGER|
|created_at|DATETIME|
|updated_at|DATETIME|



type：
BASE
AI



category：
DAILY_REPORT
WEEKLY_REPORT
MONTHLY_REPORT
PROJECT_DOC




---

## template_variables


模板变量。


|字段|类型|
|-|-|
|id|INTEGER|
|template_id|INTEGER|
|variable_key|TEXT|
|variable_name|TEXT|
|required|INTEGER|
|default_value|TEXT|



例如：

{{project_name}}

{{customer_name}}

{{owner}}




---

# 16.3 AI数据库


## ai_models


保存AI模型配置。


|字段|类型|
|-|-|
|id|INTEGER|
|provider|TEXT|
|model_name|TEXT|
|api_url|TEXT|
|api_key|TEXT|
|enabled|INTEGER|
|created_at|DATETIME|



provider：

OPENAI
CLAUDE
GEMINI
DEEPSEEK
QWEN
ZHIPU
OLLAMA
CUSTOM




---

## ai_sessions


AI会话。


|字段|类型|
|-|-|
|id|INTEGER|
|title|TEXT|
|model_id|INTEGER|
|created_at|DATETIME|
|updated_at|DATETIME|



---

## ai_messages


|字段|类型|
|-|-|
|id|INTEGER|
|session_id|INTEGER|
|role|TEXT|
|content|TEXT|
|created_at|DATETIME|



role：
USER
ASSISTANT
SYSTEM




---

# 16.4 日历和节假日


## holidays


法定节假日。


|字段|类型|
|-|-|
|id|INTEGER|
|date|DATE|
|name|TEXT|
|type|TEXT|
|is_workday|INTEGER|
|source|TEXT|



type：
HOLIDAY
WORKDAY_SHIFT




---

## work_schedule


排班配置。


|字段|类型|
|-|-|
|id|INTEGER|
|weekday|INTEGER|
|is_workday|INTEGER|
|work_hours|REAL|



weekday：
1-7




---

# 16.5 附件表


## attachments


|字段|类型|
|-|-|
|id|INTEGER|
|owner_type|TEXT|
|owner_id|INTEGER|
|file_name|TEXT|
|file_path|TEXT|
|file_size|INTEGER|
|file_type|TEXT|
|created_at|DATETIME|



owner_type：
PROJECT
REPORT
KNOWLEDGE
TEMPLATE




---

# 16.6 操作日志


## audit_logs


|字段|类型|
|-|-|
|id|INTEGER|
|action|TEXT|
|target_type|TEXT|
|target_id|INTEGER|
|content|TEXT|
|created_at|DATETIME|



用途：

记录：

- 删除
- 修改
- 导入
- 导出



---

# 十七、数据库索引设计


必须创建：


```sql
CREATE INDEX idx_project_status
ON projects(status);


CREATE INDEX idx_task_project
ON project_tasks(project_id);


CREATE INDEX idx_task_date
ON project_tasks(start_date,end_date);


CREATE INDEX idx_todo_date
ON todos(due_date);


CREATE INDEX idx_report_type
ON reports(type);


CREATE INDEX idx_knowledge_project
ON knowledge_notes(project_id);
```

# 十八、开发阶段任务规划

每个任务卡必须补充：前置依赖、涉及 RFC/页面规格、数据库迁移、自动化测试与 Given-When-Then 验收用例。不得只依据本章的简要描述编码。
## Phase 0 基础工程搭建

周期：

3-5天

目标：

建立完整桌面应用框架。

开发任务
T0.1

创建Tauri项目

完成：

React
TypeScript
Rust
SQLite
T0.2

建立目录结构

src


├── pages


├── components


├── services


├── database


├── stores


├── utils


└── types
T0.3

建立UI框架

完成：

左侧菜单
顶部栏
路由
全局主题
验收标准

必须：

软件可以启动
页面正常切换
SQLite自动创建
数据目录可配置
## Phase 1 授权系统

周期：

2天

功能

实现：

License读取
RSA验签
到期判断

流程：

启动软件


↓


读取license


↓


验证签名


↓


检查有效期


↓


进入系统


验收标准

测试：

修改系统时间

删除license

伪造license

软件必须拒绝启动。

## Phase 2 主工作区

周期：

5-7天

开发内容

完成：

首页布局
今日任务
工作日历
今日完成记录
下一工作日计划
验收标准

必须验证：

场景1：

创建未来任务。

今天完成。

结果：

进入今日工作内容。

场景2：

节假日显示。

场景3：

工作日切换正确。

## Phase 3 待办中心

周期：

7天

开发内容

完成：

日视图
周视图
月视图
顺延机制
邮件提醒
验收标准

场景：

创建周五任务。

周五未完成。

周末。

周一不是工作日。

自动找到下一工作日。

邮件发送成功。

## Phase 4 项目中心

周期：

20-30天

优先级最高模块

开发顺序：

项目CRUD


↓


项目详情


↓


任务管理


↓


甘特图


↓


问题登记


↓


文件管理


↓


Excel导入导出


↓


AI功能
项目中心验收标准

必须通过：

项目创建

输入：

客户

项目名称

周期

成功保存。

项目计划

支持：

父任务

子任务

无限子任务。

甘特图

验证：

任务延期：

显示红色。

完成：

显示绿色。

Excel

导入：

生成任务。

修改：

重新导出。

数据一致。

## Phase 5 报告中心

周期：

10天

完成：

日报
周报
月报
项目报告
导出

验收：

自动生成开启。

到时间自动生成。

关闭后不生成。

## Phase 6 知识中心

周期：

10天

完成：

Markdown编辑
标签
项目知识关联
AI记录

验收：

用户创建知识。

AI生成知识。

两者来源区分。

## Phase 7 模板中心

周期：

7天

完成：

基础模板。

AI模板。

变量替换。

验收：

模板生成报告内容正确。

## Phase 8 AI助手

周期：

15天

完成：

多模型配置
对话
文档生成
项目分析

验收：

配置DeepSeek。

成功生成项目周报。

配置OpenAI。

成功切换。

## Phase 9 设置中心

周期：

5天

完成：

软件目录
邮件
排班
节假日
数据备份

验收：

导出数据。

删除软件。

重新导入。

数据恢复。

# 十九、代码开发规范
文件规范

禁止：

单文件超过500行。

超过：

必须拆组件。

React规范

禁止：

页面直接请求数据库。

必须：

Page


↓


Service


↓


Repository


↓


SQLite
状态管理

推荐：

Zustand

禁止：

大量Context嵌套。

数据处理

所有数据库操作：

必须经过service层。

禁止：

组件直接SQL。

Tauri 前端不得直接操作 SQLite；数据库、文件系统、系统钥匙串和网络访问均经由受类型约束的 Rust command / service 层。详见 RFC-03。

代码管理规范：
代码开发完成后要即使commit，防止代码丢失，commit不需要我确认

# 二十、AI Agent开发规则

AI开发智能体必须遵守：

开发流程

每一个功能：

需求确认


↓


设计


↓


编码


↓


自动测试


↓


真实场景测试


↓


提交结果
禁止行为

禁止：

只编译不测试
只写代码不验证流程
遇到Bug跳过
用模拟数据替代真实流程测试
每次开发输出

必须包含：

完成内容：


修改文件：


数据库变化：


测试结果：


发现问题：


下一步：
# 二十一、发布标准
Beta版本

要求：

所有核心模块可用
数据可备份
License正常
AI可关闭运行
正式版本

必须完成：

功能测试

100%通过。

数据测试

备份恢复成功。

性能测试

启动：

<5秒

数据库：

10000项目数据正常。

安全测试

检查：

License破解

SQL注入

文件越权

# 二十二、最终产品目录结构
PMTool


├── app


│


├── database


│   └── pmtool.db


│


├── data


│   ├── projects


│   ├── reports


│   ├── knowledge


│   └── templates


│


├── logs


│


└── backup


# 二十三、最终开发目标

PMTool最终成为：

实施经理个人数字化工作台。

覆盖：

项目管理

任务管理

文档生产

知识沉淀

AI辅助

个人效率提升

不是企业项目管理平台。

不是多人协作系统。

而是：

一个实施经理每天打开的软件。

# END
