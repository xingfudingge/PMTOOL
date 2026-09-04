# PMTool License Generator

PMTool V2.0 的独立授权生成工具，与客户端验证代码完全解耦。

## 📋 特性

- ✅ **不修改客户端验证逻辑** — 仅使用相同加密算法（RSA-2048 + SHA-256 + PKCS#1 v1.5）
- ✅ **生成 license.json** — 包含元数据（客户编号、License类型、模块权限、用户数等）
- ✅ **签名 payload 与客户端对齐** — `"license_key:customer_name:expire_date"`
- ✅ **完整测试覆盖** — 生成 / 验签 / 篡改 / 过期 / 错误公钥
- ✅ **CLI 友好** — 基于 `clap` 的标准参数解析

## 🔧 编译

```bash
cd tools/license-generator
cargo build --release
```

二进制：`target/release/gen-license`

## 📦 使用方法

### 1. 生成 License

```bash
gen-license \
  --customer-name "测试科技" \
  --customer-number C001 \
  --license-type ENTERPRISE \
  --start-date 2026-08-22 \
  --expire-date 2027-08-22 \
  --modules project,todo,report,knowledge,ai \
  --user-count 10 \
  --private-key ../../app/src-tauri/keys/private.pem \
  --output license.json
```

参数说明：

| 参数 | 必填 | 说明 |
|---|---|---|
| `--customer-name` | ✅ | 客户名称（参与签名） |
| `--customer-number` | ✅ | 客户编号（用于 license_key 命名） |
| `--license-type` |  | PERSONAL / TEAM / ENTERPRISE（默认 ENTERPRISE） |
| `--start-date` | ✅ | 生效开始日期 YYYY-MM-DD |
| `--expire-date` | ✅ | 到期日期 YYYY-MM-DD（参与签名） |
| `--modules` |  | 模块权限列表（逗号分隔） |
| `--user-count` |  | 授权用户数（默认 1） |
| `--machine-id` |  | 机器码（可选，单机绑定） |
| `--private-key` |  | 私钥路径（默认 `../../app/src-tauri/keys/private.pem`） |
| `--output` |  | license.json 输出路径（默认 `license.json`） |

### 2. 验证 License

```bash
gen-license \
  --verify license.json \
  --public-key ../../app/src-tauri/keys/public.pem
```

输出：
```
License Key:    PMT-C001-20260822-abcd
客户:        测试科技 (C001)
类型:        ENTERPRISE · 10 用户
有效期:      2026-08-22 ~ 2027-08-22
签名算法:    RSA-2048 + SHA-256 + PKCS#1 v1.5
签名验签:    ✓ 有效
过期检查:    ✓ 未过期
```

## 📄 license.json 格式

```json
{
  "license_key": "PMT-C001-20260822-abcd",
  "customer_name": "测试科技",
  "customer_number": "C001",
  "license_type": "ENTERPRISE",
  "start_date": "2026-08-22",
  "expire_date": "2027-08-22",
  "modules": ["project", "todo", "report", "knowledge", "ai"],
  "user_count": 10,
  "machine_id": null,
  "signature": "base64-encoded-rsa-signature",
  "signature_algorithm": "RSA-2048 + SHA-256 + PKCS#1 v1.5",
  "issued_at": "2026-08-22T17:30:00Z"
}
```

## 🔐 签名 Payload 规范

```
payload = "{license_key}:{customer_name}:{expire_date}"
signature = RSA-PKCS#1-v1.5-Sign(SHA-256(payload), private_key)
signature_b64 = base64(signature)
```

⚠️ **重要约束**：
- `modules` / `user_count` / `machine_id` 等字段为 **metadata**，**不参与签名**
- 当前客户端只验证 `(license_key, customer_name, expire_date)` 三字段的签名
- 如需强校验模块权限，需扩展客户端 verification 逻辑

## 🔄 客户端导入流程

1. 管理员用本工具生成 `license.json`
2. 在 PMTool 客户端打开 LicenseActivation UI
3. 粘贴 `license_key` / `customer_name` / `expire_date` / `signature` 4 个字段
4. 客户端调用 `verify_license` command → RSA 验签 → 写入 `license` 表
5. LicenseGuard 解除拦截，主功能可用

## 🧪 运行测试

```bash
cd tools/license-generator
cargo test
```

测试覆盖：
- ✅ `test_generate_and_verify_passes` — 生成 + 正确公钥验签
- ✅ `test_tampered_license_fails_verify` — 篡改 license_key / customer_name / expire_date / signature
- ✅ `test_expired_license_fails_expiry_check` — 过期日期
- ✅ `test_wrong_public_key_fails_verify` — 错误公钥
- ✅ `test_payload_hash_matches_client_format` — 与客户端 hash 算法对齐
- ✅ `test_license_json_file_roundtrip` — JSON 文件读写
- ✅ `test_low_level_sign_verify_roundtrip` — 低层函数独立性

## 🔗 与 PMTool 客户端的关系

| 组件 | 路径 | 职责 |
|---|---|---|
| 客户端验签 | `app/src-tauri/src/crypto.rs` | 验签 / 签名（仅 license_key + customer_name + expire_date） |
| 客户端 License 服务 | `app/src-tauri/src/services/license.rs` | 验签 + 过期检测 + DB 存储 |
| 客户端 License 表 | `database/schema.sql` license 表 | 存储 license_key / customer_name / expire_date / signature / status |
| **本工具** | `tools/license-generator/` | **独立生成 license.json** · 不修改任何客户端代码 |

---

**版本**：0.1.0 · 2026-08-22
**作者**：PMTool
**许可**：仅供内部使用
