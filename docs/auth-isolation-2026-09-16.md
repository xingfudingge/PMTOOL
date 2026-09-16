# PMTool 授权体系与数据库隔离改造（2026-09-16）

## 目标

> 授权属于设备，不属于数据库。
> 数据库可以随便备份、复制、恢复，但任何数据库操作都不能复制、恢复或伪造 PMTool 授权。

- 业务数据库备份/恢复/复制 = 只搬业务数据，天然不携带授权。
- 每次启动基于**当前设备实时 Device Identity + 本机安全存储 License** 独立完成验证。
- 数据库不参与"当前是否授权"的最终判断。

## 架构

```
                    PMTool 启动
                         │
                         ▼
                 DeviceIdentityProvider（多特征 · 无 DB）
                         │  binding_id
                         ▼
                 OS Secure Storage（License / 试用开始时间 / 迁移标记）
                         │  License
                         ▼
                 LicenseValidator 流水线（拆分 · 无单点门）
                         1. 格式校验 2. 解析 3. Ed25519 验签
                         4. Claims 5. 有效期 6. 设备绑定 7. 判定
                         │
                    ┌────┴────┐
                   PASS      FAIL
                    │          │
                    ▼          ▼
                  正常启动    授权界面
```

## 组件

| 模块 | 路径 | 职责 |
|---|---|---|
| Device Identity | `services/auth/device_identity.rs` | 多平台特征采集 → 规范化排序 → 派生 `binding_id`（协议锁定，与旧版字节一致）+ 多特征指纹 |
| Secure Storage | `services/auth/secure_storage.rs` | 统一接口 `store/read/delete/exists`；Windows Credential Manager / macOS Keychain / Linux Secret Service（keyring crate） |
| License Validator | `services/auth/license_validator.rs` | 拆分验证流水线 + 稳定原因码（LICENSE_NOT_FOUND / LICENSE_EXPIRED / LICENSE_DEVICE_MISMATCH ...）+ 7 天试用计算 |
| Authorization | `services/auth/authorization.rs` | 运行时 `AuthorizationContext`（永不落库）+ 启动检查/激活/删除/开始试用 |
| Migration | `services/auth/migration.rs` | 旧库授权数据提取：仅 Ed25519 格式且重新验证通过才导入；幂等（安全存储迁移标记） |

## 关键决策

1. **binding_id 保持字节级不变**（= 旧版 `SHA256(平台硬件UUID) → base32` 格式化）。
   License 协议把该值签进 payload，变更会使所有已签发 License 失效（违反升级稳定性）。
   多特征采集产出独立的 `multi_feature_fingerprint` 用于防伪/一致性辅助。
2. **授权/试用/迁移标记只存 OS 安全存储**，绝不落业务库或可复制的普通文件。
3. **启动判定由后端在 setup() 计算**，前端仅读取 `get_authorization_state` 渲染。
4. **数据库为纯业务库**：迁移 0018 DROP `license` / `device_fingerprints` / `trial_records` 表并清除 `system_config` 授权键。

## 命令面

- `get_device_id()` → 设备绑定值（纯计算）
- `get_authorization_state()` → 运行时授权判定（licensed / trial / not_authorized + 原因码）
- `activate_license_simple(code)` → 验证通过才写安全存储（失败不覆盖旧授权）
- `start_trial()` → 开始 7 天试用（仅一次）
- `delete_license()` → 删安全存储 License（无 DB 状态回写）

已移除：`verify_license` / `get_license_status` / `deactivate_license` / `expire_overdue_licenses`（RSA 旧路径）。

## 安全说明

- 私钥只存在于 License Generator（GitHub Actions 编译期注入），客户端仅有公钥。
- License 所有关键字段（device_id / expire_time / license_id / claims）都在 Ed25519 签名保护内，任何修改验签失败。
- 日志只记稳定原因码，不记完整 License / 设备敏感信息。
- 即使 OS 凭据随账户迁移到另一台机器，启动时设备绑定重新比对仍失败（§28）。

## 测试矩阵（§29）

| # | 场景 | 结果 |
|---|---|---|
| T01 | 正常启动 | PASS |
| T02/03 | DB/业务目录复制到 B | 不继承授权 |
| T04 | License 复制到 B | 设备不匹配 FAIL |
| T05 | 篡改 License | 验签 FAIL |
| T06 | 删除 DB | 授权独立工作 |
| T07 | 恢复旧库 | 不恢复授权 |
| T08 | 无 License | 进入授权界面 |
| T09 | 过期 | FAIL |
| T10 | DB 伪造授权字段 | 判定不受影响 |
| T11 | 跨平台 | 各平台 Provider 派生单测 |

实现位置：`services/auth/*` 单元测试（24）+ `tests/license_test.rs` 集成测试（11）+ 前端 `license.test.ts`。

## 已知限制

- 客户端软件无法做到"绝对无法反编译"；本方案目标是消除 DB 伪造/单点绕过等廉价绕过路径。
- 旧 RSA 格式 License 不迁移，升级后需向授权管理员重新获取 Ed25519 授权码。