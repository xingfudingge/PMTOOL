# 知识中心页面规格

> Phase 6 · RFC 关联：RFC-01 §3.5 + RFC-02 §9.4 + RFC-03 §4
> 唯一真相源：本文为 Phase 6 实现依据

---

## 1. 数据加载

| 数据块 | Rust command | 触发时机 |
|---|---|---|
| 个人知识库 | `list_knowledge_notes({project_id: null})` | 个人知识库 TAB |
| 项目知识库 | `list_knowledge_notes({project_id})` | 项目知识库 TAB（需选项目） |
| AI 知识区 | `list_knowledge_notes({source_type: 'AI'})` | AI 知识区 TAB |
| 标签列表 | `list_tags()` | 标签筛选器 |
| 笔记-标签关联 | `get_note_tags(note_id)` | 笔记详情 |
| AI 操作记录 | `list_ai_records({note_id})` | 笔记详情 |
| 附件 | `list_attachments('KNOWLEDGE', note_id)` | 笔记详情附件 |

## 2. 状态机

### 笔记来源（RFC-01 knowledge_notes.source_type + RFC-02 §9.4）
```
USER（用户手写）
AI（AI 生成/总结）
IMPORT（导入）
```

### 内容类型（RFC-01 knowledge_notes.content_type）
```
MARKDOWN（默认）
TEXT
IMAGE
FILE
LINK
```

### AI 操作动作（RFC-01 knowledge_ai_records.action）
```
SUMMARY（总结）
REWRITE（重写）
EXTRACT（抽取）
GENERATE（生成）
```

## 3. 错误处理

| 错误类型 | UX |
|---|---|
| AI 生成失败 | 顶部黄色提示 + 保留已有草稿 |
| Markdown 渲染失败 | 显示原始文本 + 错误提示 |
| 标签冲突 | 阻止保存 + 提示"标签已存在" |
| 附件上传失败 | Toast 提示 |

## 4. 空状态

- 个人知识库空：显示"开始记录你的第一篇笔记"+ "新建笔记"按钮
- 项目知识库空：显示"暂无项目知识"+ "新建笔记"按钮
- AI 知识区空：显示"AI 还未生成任何知识"+ 提示"在 AI 助手中生成"
- 标签列表空：显示"暂无标签"

## 5. 边界条件

### RFC-02 §9.4 知识库结构
- 个人知识库：所有 project_id 为 NULL 的笔记
- 项目知识库：project_id 对应项目的笔记
- 项目知识库子目录：需求知识 / 技术知识 / 问题经验 / 客户信息 / 交付经验
- **AI 记录区别** source_type = 'USER' vs 'AI'（必须 UI 标识）

### RFC-03 §4 AI 数据范围确认
- AI 总结/重写前必须展示并确认数据范围
- 选项：当前对话 / 当前项目 / 选定文档
- **不发送未选定的附件和知识库内容**

### RFC-03 §4 AI 只读工具
- 模型只能调用只读、参数化的业务查询工具
- 禁止模型提交 SQL / 写库 / 删除文件 / 发送邮件
- AI 输出写入草稿，用户确认后才保存或导出

### AI 适配器
- OpenAI-compatible / Claude / Gemini / Ollama 分别实现 adapter
- 每个 adapter 必须有请求和流式响应解析测试

## 6. RFC 引用

| 条款 | 要求 |
|---|---|
| RFC-01 §3.5 | knowledge_notes 表字段（project_id 空=个人） |
| RFC-02 §9.4 | 区分 USER/AI 记录（UI 标识） |
| RFC-02 §9.4 | AI 能力：会议总结/问题总结/项目经验提炼/自动生成 |
| RFC-03 §4 | API Key 存系统钥匙串，SQLite 只存 key 引用 ID |
| RFC-03 §4 | AI 请求必须先展示并确认数据范围 |
| RFC-03 §4 | 模型只能调用只读工具 |
| RFC-03 §4 | AI 输出写入草稿，用户确认后保存 |

## 7. Given-When-Then 验收样例

### 验收 #1：USER vs AI 来源区分
```
Given 用户创建笔记（手写 Markdown）
And AI 助手生成一条总结笔记
When 用户查看知识列表
Then 手写笔记标识为"USER"（绿色图标）
And AI 笔记标识为"AI"（蓝色图标）
And 鼠标悬停显示"AI 于 2026-08-21 10:00 由 DeepSeek 生成"
```

### 验收 #2：AI 数据范围确认
```
Given 用户在 AI 助手选择"总结当前项目文档"
When 用户点击"开始总结"
Then 弹出确认对话框
And 列出将被发送的文档列表
And 用户必须勾选确认
And 不勾选的文档不被发送
Then AI 调用仅基于勾选文档
```

### 验收 #3：AI 输出草稿
```
Given AI 生成项目风险分析
When 用户在 AI 助手中查看结果
Then 结果显示在"草稿"标签
And "保存为笔记"按钮将内容写入 knowledge_notes（source_type='AI'）
And 不直接写入数据库
```

## 8. PM 决策关联

- **PM A1**：4 张知识表属于 16 张核心表
- **PM B1**：所有知识操作通过 commands::knowledge_notes 业务命名
- **PM C1**：3 个验收样例必须有 cargo test + vitest