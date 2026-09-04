# 设置中心页面规格

> Phase 9 · RFC 关联：RFC-01 §3.1/§3.8 + RFC-03 §2/§3/§5 + 设计稿 §12
> 唯一真相源：本文为 Phase 9 实现依据

---

## 1. 数据加载

| 数据块 | Rust command | 触发时机 |
|---|---|---|
| 软件配置 | `list_system_config()` | 基础设置页 |
| 数据目录 | `get_data_dir()` | 基础设置页 |
| AI 模型配置 | `list_ai_models()` | AI 设置页 |
| 邮件配置 | `get_smtp_config()` | 邮件设置页 |
| 工作日排班 | `get_work_schedule()` | 工作日设置页 |
| 节假日缓存 | `list_holidays()` | 节假日页 |
| 附件目录 | `get_attachments_dir()` | 基础设置页 |
| License 信息 | `get_license()` | 关于页 |

## 2. 状态机

### 设置类别（设计稿 §12）
```
基础设置 / AI 设置 / 邮件设置 / 自动化设置 / 工作日设置 / 数据管理 / 关于
```

### 数据迁移状态
```
IDLE ──→ BACKING_UP ──→ BACKUP_COMPLETE
       └─→ BACKUP_FAILED（可重试）

IDLE ──→ RESTORING ──→ RESTORE_COMPLETE
       └─→ RESTORE_FAILED（保留原数据，RFC-03 §5）
```

## 3. 错误处理

| 错误类型 | UX |
|---|---|
| SMTP 测试邮件失败 | 顶部红色提示 + 重试按钮（RFC-03 §3 有限重试） |
| 数据目录迁移失败 | 保留原目录 + 红色提示 + 错误日志（RFC-03 §2） |
| License 验证失败 | 关于页红色 banner + 输入新 License 链接 |
| 节假日同步失败 | 显示"同步失败/上次更新时间"（RFC-02 §3）+ 不阻塞本地使用 |
| 工作日修改失败 | 阻止保存 + 红色提示 |
| 备份 ZIP 校验失败 | 阻止恢复 + 红色提示（RFC-03 §5） |

## 4. 空状态

- 基础设置空：显示默认值 + 保存按钮
- AI 模型空：显示"请添加 AI 模型"+ "添加模型"按钮
- 节假日空：显示"同步国家节假日"+ "同步"按钮
- License 空：显示"请输入 License Key"

## 5. 边界条件

### RFC-03 §2 数据目录迁移
- 默认数据目录 = OS 应用数据目录下的 PMToolData（不是 ~/PMToolData）
- 迁移必须：复制 + 校验 + 原子切换
- 失败时仍使用原目录

### RFC-03 §2 受管目录规则
- 附件必须复制到受管目录
- 保存相对路径 + SHA-256
- 文件名冲突以 UUID 重命名
- 仅受管目录内允许删除/重命名/预览
- 拒绝 `..`、符号链接逃逸、外部绝对路径

### RFC-03 §3 邮件配置
- SMTP 密码**存系统钥匙串**
- 发送前支持"测试邮件"
- 失败采用有限重试（设置页可见）

### RFC-03 §3 自动化设置
- 自动化仅在应用运行时每分钟检查
- 应用启动 + 恢复前台 → 补偿检查
- 不承诺应用关闭期间后台执行

### RFC-03 §5 备份恢复
- 备份 = SQLite 一致性快照 ZIP
- 内容：数据库 + 受管附件 + manifest（版本/创建时间/文件哈希）
- **不得导出系统钥匙串密钥**
- 恢复前验证 ZIP、manifest、版本、哈希
- 先恢复到临时目录，校验成功后原子替换
- 失败时原数据保持不变

### RFC-02 §3 节假日同步
- 同步失败不得阻塞本地使用
- 保留已缓存数据 + 显示"同步失败/上次更新时间"
- 同步源、国家和年份在设置中可配置（MVP 默认中国大陆）

### 工作日设置（RFC-02 §3）
- 正常双休 / 大小周 / 自定义排班
- 自定义：周一到周日（可任意设置工作/休息）

## 6. RFC 引用

| 条款 | 要求 |
|---|---|
| RFC-03 §2 | 默认数据目录 = OS 应用数据目录 + PMToolData |
| RFC-03 §2 | 目录迁移：复制 + 校验 + 原子切换 |
| RFC-03 §2 | 附件受管目录 + SHA-256 + UUID 重命名 |
| RFC-03 §3 | SMTP 密码存钥匙串 + 测试邮件 + 有限重试 |
| RFC-03 §3 | 自动化仅运行时检查 + 启动/前台补偿 |
| RFC-03 §4 | API Key / SMTP 密码只存钥匙串 |
| RFC-03 §5 | 备份含 manifest + 哈希，不含钥匙串 |
| RFC-03 §5 | 恢复前验证 + 原子替换 + 失败保留原数据 |
| RFC-03 §5 | 每次 Schema 变更提供单向版本化 migration + 升级前自动备份 |
| RFC-03 §6 | Tauri capability 仅授予需要的 command/目录/网络域名 |
| RFC-02 §3 | 节假日同步失败不阻塞 + 显示上次更新时间 |
| 设计稿 §12.1 | 软件目录 / 数据目录 / 附件目录配置 |
| 设计稿 §12.4 | 工作日：双休 / 大小周 / 自定义 |

## 7. Given-When-Then 验收样例

### 验收 #1：数据目录原子迁移
```
Given 用户点击"迁移数据目录" + 选择新路径 /new/data
When 系统开始迁移
Then 复制所有文件到 /new/data
And 校验文件哈希
And 原子切换（rename 原子操作）
And 失败时仍使用原目录（不丢失数据）
```

### 验收 #2：SMTP 密码存钥匙串
```
Given 用户在邮件设置输入 SMTP 密码
When 用户保存
Then 密码写入系统钥匙串（macOS Keychain / Windows Credential Manager / Linux Secret Service）
And SQLite 只存钥匙串引用 ID（如 keychain_uuid）
And 数据库文件不含明文密码
```

### 验收 #3：备份完整性校验
```
Given 用户点击"导出备份"
When 系统生成 ZIP
Then ZIP 含 SQLite + 附件 + manifest.json
And manifest 含版本、创建时间、所有文件 SHA-256
And ZIP 不含钥匙串密钥（系统钥匙串密钥不导出）
When 用户尝试恢复 ZIP
Then 验证 manifest 完整性
And 校验所有文件 SHA-256
And 先恢复到临时目录 + 校验成功后原子替换
```

### 验收 #4：节假日同步失败不阻塞
```
Given 国家节假日 API 不可达
When 用户点击"同步节假日"
Then 显示"同步失败，请稍后重试"
And 本地已缓存的节假日仍可用
And holidays 表数据不变
And 不影响其他功能使用
```

## 8. PM 决策关联

- **PM A1**：system_config / license / holidays / work_schedule 属于 16 张核心表
- **PM B1**：所有设置操作通过 commands::system_config 业务命名（set_system_config / list_holidays 等）
- **PM C1**：4 个验收样例必须有 cargo test + vitest