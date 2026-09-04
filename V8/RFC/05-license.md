# PMTool V2.0 · License 授权系统 RFC（05）

> 状态：实施基线 · 2026-08-22
> 目的：定义 PMTool 启动时 License 校验、激活、攻击防护的完整方案。

---

## 1. 设计目标

1. **离线验证**：不依赖在线服务，应用启动时本地完成 License 校验
2. **防篡改**：RSA 签名校验，License 任何字段被修改都拒绝
3. **防时间攻击**：不依赖系统时间，使用 License 自身的 `expire_date` 字段
4. **可激活**：用户首次启动无 License → 强制激活页 → 粘贴 → 进入主应用
5. **可重激活**：License 删除后再次启动 → 强制激活页

## 2. License 数据格式

```json
{
  "license_key": "PMT-2026-001-XYZ",
  "customer_name": "测试科技",
  "expire_date": "2027-08-22",
  "signature": "<base64 RSA-2048 signature>"
}
```

| 字段 | 类型 | 必填 | 备注 |
|---|---|---|---|
| `license_key` | string | ✓ | 唯一标识，PMT- 前缀 |
| `customer_name` | string | ✓ | 客户/公司名 |
| `expire_date` | string (YYYY-MM-DD) | ✓ | 到期日（RFC-01 §4.2 本地日历日）|
| `signature` | string (base64) | ✓ | RSA-2048 + SHA-256 签名 |

**签名生成规则**（`sign_license`）：
```
message = SHA-256(license_key || ":" || customer_name || ":" || expire_date)
signature = RSA-PSS / PKCS#1-v1.5-Sign(message, private_key)
signature_b64 = Base64(signature)
```

**验证算法**（`verify_license`）：
```
message = SHA-256(license_key || ":" || customer_name || ":" || expire_date)
verify = RSA-Verify(message, signature, public_key)
```

## 3. 架构分层（RFC-03 §1）

```
WebView (LicenseActivation.tsx)
  → invoke('verify_license', { license })
  → Tauri command (commands/license.rs)
    → service (services/license.rs)
      → crypto (crypto.rs · RSA verify)
      → repository (repositories/license.rs · DB read/write)
        → SQLite
```

**禁止**：WebView 直接持有公钥或执行签名验证。公钥嵌入 Rust 二进制（`include_str!("../keys/public.pem")`）。

## 4. 启动流程

```
App 启动
  ↓
db::init()              [T0.4e 已实现]
  ↓
LicenseGuard 检查：
  ├─ 1. 调用 license::get_current_license()
  │     ↓
  │   SELECT * FROM license ORDER BY id DESC LIMIT 1
  │
  ├─ 2. license 为空？
  │     → 强制激活页（LicenseActivation 模态框）
  │
  ├─ 3. 验签（signature + expire_date）
  │     ├─ 签名无效 → 弹窗"License 被篡改"+ 强制激活
  │     └─ 签名有效 → 继续
  │
  ├─ 4. expire_date < 今天？
  │     ├─ 是 → 弹窗"License 已过期（到期日：{date}）"+ 强制激活
  │     └─ 否 → 进入主布局
  │
  └─ 5. status = 0？
        ├─ 是 → 强制激活
        └─ 否 → 进入主布局
```

**关键设计**：
- 验证失败时**不删除** license 表（保留证据供人工审计）
- 同一时刻只允许 1 条有效 License（status=1）
- 重复激活时**先 deactivate 旧 license**（status=0），再插入新的

## 5. 数据库表（RFC-01 §3.1）

License 表**已在 schema.sql 16 张核心表内**（PM A1 决策）：

```sql
CREATE TABLE IF NOT EXISTS license (
    id            INTEGER PRIMARY KEY,
    license_key   TEXT NOT NULL UNIQUE,
    customer_name TEXT,
    expire_date   DATE NOT NULL,
    status        INTEGER NOT NULL DEFAULT 1,  -- 0=无效 1=有效
    signature     TEXT NOT NULL,                 -- RSA 签名（base64）
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

**T1.1 结论**：无需新表，schema 已满足。本任务只需 RFC 确认 + 验证字段足够。

## 6. 攻击向量防护（验收样例 GWT）

### 验收 #1：伪造 License（错误公钥）
```
Given 攻击者修改了 public.pem（替换为自己的 RSA 公钥）
When 用户粘贴 License（用攻击者私钥签名的）
Then verify_license 返回 false
And WebView 弹窗"License 无效"
And 不进入主布局
```

### 验收 #2：篡改 License 内容
```
Given 合法 License（{ license_key: "PMT-001", customer_name: "晨曦", expire_date: "2027-08-22" }）
And 攻击者修改 customer_name 为 "其他公司"
When 重新计算 message：SHA-256("PMT-001:其他公司:2027-08-22")
Then 与原 signature 不匹配
And verify_license 返回 false
```

### 验收 #3：系统时间攻击
```
Given 合法 License（expire_date = 2026-08-22）
And 系统时间 = 2020-01-01（向前调）
When verify_license 检查 expire_date
Then 用 system_time::now()（系统当前时间）vs expire_date
And 2020 < 2026 → License "未过期"（不依赖系统时间是否可信）
```

**注**：RFC-02 §1 声明应用默认时区 = 系统时区，但 expire_date 比较用 YYYY-MM-DD 字符串字典序，等同于日期比较，不受时区影响。

### 验收 #4：删除 License
```
Given 合法 License 已激活并进入主布局
When 用户手动删除 license 表（DELETE FROM license）
And 重启 App
Then LicenseGuard 检测 license 为空
And 强制激活页
And 显示"License 已失效，请重新激活"
```

### 验收 #5：过期 License
```
Given 合法 License（expire_date = 2026-08-22）
And 系统时间 = 2026-08-23
When verify_license 检查 expire_date
Then expire_date < system_time
And 返回"License 已过期（2026-08-22）"
And 强制激活页
```

### 验收 #6：重复激活
```
Given License A 已激活（status=1, license_key="PMT-001"）
When 用户粘贴 License B（license_key="PMT-002"）
And verify_license(B) 成功
Then license_service.deactivate_all() （A.status = 0）
And license_service.activate(B)（B.status = 1）
And 写入 audit_logs：action=DEACTIVATE, target=license, target_id=A.id
And 写入 audit_logs：action=ACTIVATE, target=license, target_id=B.id
```

## 7. UI 流程

### LicenseActivation.tsx（模态框）
- 输入框：粘贴 License JSON
- 按钮：激活 / 取消
- 错误显示：红色 banner
- Loading 状态：调 verify_license 中
- 成功：自动关闭模态框 + 刷新页面

### LicenseGuard.tsx（路由守卫）
- Props：children（主布局）
- 启动时调 get_license_status
- 三种状态：
  - LOADING：骨架屏
  - UNAUTHORIZED：渲染 LicenseActivation（覆盖整个屏幕）
  - AUTHORIZED：渲染 children

### main.tsx 集成
```tsx
<React.StrictMode>
  <LicenseGuard>
    <Layout>
      {/* 8 大模块路由 */}
    </Layout>
  </LicenseGuard>
</React.StrictMode>
```

## 8. Rust 实现要点

### 8.1 crypto.rs（RSA 工具）
- 使用 `rsa` crate（RSA-2048 + SHA-256 + PKCS#1 v1.5）
- `verify_license_payload(license_key, customer_name, expire_date, signature_b64, public_pem) -> Result<bool>`
- `compute_license_payload_hash(license_key, customer_name, expire_date) -> Vec<u8>`

### 8.2 services/license.rs（业务逻辑）
- `LicenseService::current() -> Result<Option<License>>`
- `LicenseService::verify_and_save(license: LicenseInput) -> Result<LicenseVerification>`
- `LicenseService::deactivate_all() -> Result<usize>`
- `LicenseService::check_expiry(license: &License) -> bool`

### 8.3 commands/license.rs（Tauri commands）
- `verify_license(license: LicenseInput) -> LicenseVerification`
- `get_license_status() -> Option<License>`
- `deactivate_license(id: i64) -> bool`

### 8.4 dev tool：gen_license.rs
- 命令行工具，读取私钥 + 接收 license_key/customer_name/expire_date → 输出 JSON License
- 仅 dev 用，**不打包入产品**
- RFC-05 §2 数据格式示例

## 9. 测试覆盖

### Rust 测试（src-tauri/tests/license_test.rs）
- test_verify_valid_license
- test_verify_tampered_license
- test_verify_wrong_public_key
- test_verify_expired_license
- test_verify_empty_license
- test_deactivate_all_licenses
- test_audit_log_on_activate
- test_audit_log_on_deactivate

### Vitest 测试（src/database/__tests__/license.test.ts）
- test_license_type_definitions
- test_license_status_enum
- test_license_verification_response_shape

## 10. 依赖

### Cargo.toml 新增
```toml
rsa = "0.9"           # RSA 签名验签
sha2 = "0.10"         # SHA-256
base64 = "0.22"       # base64 编码
chrono = "0.4"        # 日期比较（仅类型层）
```

### package.json
无新增（纯 Rust 实现 + WebView 仅调 invoke）

## 11. 实施约束

- **私钥不入产品包**：`private.pem` 仅 dev 用，必须在 `.gitignore` 内
- **公钥嵌入二进制**：`public.pem` 通过 `include_str!()` 编译到 Rust binary
- **验证逻辑 100% 在 Rust 侧**：WebView 不能持有公钥或执行签名
- **审计日志**：所有 activate / deactivate 必须写入 `audit_logs` 表
- **过期不删数据**：过期 License 保留在表里（status=0），仅提示用户重新激活

## 12. PM 决策关联

- **PM A1**：License 表属于 16 张核心表
- **PM B1**：所有 License 操作通过 commands::license 业务命名（verify_license / get_license_status）
- **PM C1**：7 项门禁严格执行（build/test 待网络）

---

**版本**：2026-08-22（Phase 1 RFC 基线）
**实施基线**：T1.1 - T1.5（5 个任务，2 天）
**下一阶段**：Phase 2 主工作区