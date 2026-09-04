# AI 助手页面规格

> Phase 8 · RFC 关联：RFC-01 §3.7 + RFC-03 §4 + 设计稿 §11
> 唯一真相源：本文为 Phase 8 实现依据

---

## 1. 数据加载

| 数据块 | Rust command | 触发时机 |
|---|---|---|
| AI 模型列表 | `list_ai_models({enabled: 1})` | 设置页 + AI 助手模型选择器 |
| AI 会话列表 | `list_ai_sessions()` | AI 助手左侧栏 |
| AI 消息历史 | `list_ai_messages({session_id})` | 切换会话时 |
| 工具调用审计 | `list_ai_records({note_id?})` | 知识笔记详情 |
| 项目数据范围 | `get_ai_data_scope({project_id})` | AI 数据范围确认对话框 |

## 2. 状态机

### 对话状态
```
IDLE ──→ LOADING_MODEL ──→ READY ──→ USER_INPUT ──→ AI_THINKING ──→ AI_RESPONDING ──→ READY
                                                                                    │
                                                                                    └─→ ERROR（可重试）
```

### 消息角色（RFC-01 ai_messages.role）
```
USER / ASSISTANT / SYSTEM
```

### 模型状态（RFC-01 ai_models）
```
enabled = 1（可用）
enabled = 0（禁用）
```

## 3. 错误处理

| 错误类型 | UX |
|---|---|
| API Key 缺失 | 设置页跳转提示 + AI 按钮置灰 |
| 模型调用失败 | 错误信息显示 + 重试按钮 |
| 流式响应中断 | 保留已生成内容 + "继续生成"按钮 |
| 数据范围未确认 | 阻止 AI 调用 + 弹窗确认 |
| 工具调用被拒绝 | 提示"模型只能调用只读工具" |

## 4. 空状态

- 无模型配置：显示"请先在设置页配置 AI 模型"
- 无会话：显示"开始新对话"
- 无消息：显示空对话窗口 + 输入框提示
- AI 流式响应中：显示打字机动画

## 5. 边界条件

### RFC-03 §4 数据范围确认（强制）
- AI 请求必须先展示并由用户确认数据范围
- 选项：当前对话 / 当前项目 / 选定文档
- **不发送未选定的附件和知识库内容**

### RFC-03 §4 模型能力（强制限制）
- 模型**只能调用只读、参数化的业务查询工具**
- 禁止模型：
  - 提交 SQL
  - 写库
  - 删除文件
  - 发送邮件
- AI 输出写入草稿，用户确认后才保存或导出

### RFC-03 §4 密钥管理
- API Key、SMTP 密码**只保存到系统钥匙串**
- SQLite 只保存 key 的引用 ID 和非敏感模型配置
- 不在数据库中存储明文密钥

### AI 适配器（RFC-03 §4）
- OpenAI-compatible（POST /chat/completions）
- Claude / Gemini / DeepSeek / 通义 / 智谱 / Moonshot / Ollama
- 每个 adapter 必须有请求和流式响应解析测试

## 6. RFC 引用

| 条款 | 要求 |
|---|---|
| RFC-03 §4 | API Key 存系统钥匙串，SQLite 只存 key 引用 ID |
| RFC-03 §4 | AI 请求必须先确认数据范围 |
| RFC-03 §4 | 模型只能调用只读工具 |
| RFC-03 §4 | AI 输出写入草稿，用户确认后保存 |
| RFC-03 §4 | 多 provider adapter 必须有流式测试 |
| 设计稿 §11.2 | 文档生成（项目周报/实施方案/交付文档） |
| 设计稿 §11.2 | 项目分析（风险/延期） |
| 设计稿 §11.2 | 当前系统问答（SQL 查询） |
| 设计稿 §11.2 | 多模型支持（OpenAI/Claude/DeepSeek/通义/智谱/Moonshot/Ollama） |

## 7. Given-When-Then 验收样例

### 验收 #1：数据范围确认
```
Given 用户在 AI 助手输入"总结本周延期项目"
When AI 助手准备调用模型
Then 弹出数据范围确认对话框
And 列出将被发送的数据（项目列表 + 本周任务）
And 用户必须勾选确认
Then AI 调用仅基于勾选数据
```

### 验收 #2：模型能力限制
```
Given 模型尝试调用"删除项目"工具
When 模型发出删除请求
Then 系统拒绝
And 提示"模型只能调用只读工具，禁止删除/写库"
And audit_logs 记录被拒绝的工具调用
```

### 验收 #3：AI 输出草稿
```
Given AI 生成项目风险分析报告
When 用户查看 AI 输出
Then 显示在"草稿"区
And 提供"保存为模板"按钮（写入 templates，source_type='AI'）
And 不直接写入 reports
```

### 验收 #4：流式响应
```
Given 用户选择 DeepSeek 模型
And 用户提问"本周有哪些延期项目？"
When AI 开始响应
Then 字符逐个显示（打字机效果）
And 用户可点击"停止生成"中断
And 已生成内容保留
```

## 8. PM 决策关联

- **PM A1**：ai_models / ai_sessions / ai_messages 属于 16 张核心表
- **PM B1**：AI 操作通过 commands::ai_models / ai_sessions 业务命名
- **PM C1**：4 个验收样例必须有 cargo test + vitest