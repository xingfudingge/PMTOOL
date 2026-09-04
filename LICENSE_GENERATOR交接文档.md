# PMTool License Generator 交接文档

## 项目概述

PMTool License Generator（授权码生成器）是一个基于 Tauri 2.x 的桌面应用，用于为 PMTool 软件生成数字签名的授权码。

**技术栈:**
- **前端**: Vite + HTML + 原生 JavaScript（无 React/Vue）
- **后端**: Rust + Tauri 2.x
- **加密**: Ed25519 数字签名
- **编码**: Base64 URL_SAFE_NO_PAD + Hex

---

## 一、快速启动

### 1.1 启动 License Generator

```bash
cd /Users/example/AAIWorkSpace/projects/PMTOOL
./start.sh start-lg
```

### 1.2 停止 License Generator

```bash
./start.sh stop-lg
```

### 1.3 查看状态

```bash
./start.sh status
```

---

## 二、项目结构

```
app/license-generator/
├── src-tauri/                    # Rust 后端
│   ├── src/
│   │   └── main.rs               # 核心业务逻辑
│   ├── Cargo.toml                # Rust 依赖配置
│   └── tauri.conf.json           # Tauri 配置
│
├── web/                          # 前端静态文件
│   ├── index.html                # 主界面
│   ├── test-api.html             # API 测试页面
│   └── dist/                     # 构建输出目录
│
├── package.json                  # Node.js 依赖配置
├── vite.config.js                # Vite 配置
├── tsconfig.json                 # TypeScript 配置
└── README.md                     # 项目说明
```

---

## 三、核心文件说明

### 3.1 Rust 后端 (`src-tauri/src/main.rs`)

**密钥管理:**
```rust
fn generate_key_pair() -> Result<(SigningKey, VerifyingKey), String>
fn load_key_pair() -> Result<(SigningKey, VerifyingKey), String>
```

**License Payload 结构:**
```rust
pub struct LicensePayload {
    pub product: String,          // "PMTool"
    pub license_id: String,       // UUID
    pub device_id: String,        // 设备唯一标识
    pub license_type: String,     // "DAYS_30", "DAYS_365", "PERPETUAL"
    pub start_time: String,       // RFC3339 格式
    pub expire_time: String,      // RFC3339 格式（永久授权为空字符串）
}
```

**授权码构建逻辑:**
```rust
// 1. 序列化 payload 为 JSON
let json = serde_json::to_string(&payload)?;

// 2. Base64 URL_SAFE_NO_PAD 编码
let encoded = URL_SAFE_NO_PAD.encode(json.as_bytes());

// 3. Ed25519 签名
let signature: Signature = signing_key.sign(encoded.as_bytes());

// 4. 签名转换为 Hex，再 Base64 编码
let sig_hex = hex::encode(signature.to_bytes());
let sig_b64 = URL_SAFE_NO_PAD.encode(sig_hex);

// 5. 组合：签名 + 编码后的 JSON
let license_data = format!("{}{}", sig_b64, encoded);

// 6. 添加破折号分隔
let formatted = format_license_with_dashes(&license_data);

// 7. 添加前缀
Ok(format!("PMT1-{}", formatted))
```

**Tauri 命令:**
```rust
#[tauri::command]
fn check_key_status() -> Result<bool, String>

#[tauri::command]
fn generate_license_command(
    device_id: String,
    duration_days: i32,
    start_date: String,
) -> Result<String, String>
```

### 3.2 Tauri 配置 (`src-tauri/tauri.conf.json`)

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "PMTool License Generator",
  "version": "1.0.0",
  "build": {
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://localhost:1421",
    "beforeBuildCommand": "npm run build",
    "frontendDist": "../web/dist"
  },
  "app": {
    "windows": [{
      "label": "main",
      "title": "PMTool 授权码生成器",
      "width": 700,
      "height": 700,
      "minWidth": 600,
      "minHeight": 600,
      "resizable": true,
      "fullscreen": false,
      "center": true
    }]
  }
}
```

### 3.3 Vite 配置 (`vite.config.js`)

```javascript
import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  server: {
    port: 1421,
    strictPort: true,
  },
  base: './',
  build: {
    outDir: 'web/dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: path.resolve(__dirname, 'web/index.html'),
      },
    },
  },
  root: 'web', // Vite 根目录
});
```

### 3.4 启动脚本 (`start.sh`)

**关键修复点:**
```bash
# Rust 环境变量路径修复
if [ -f "/Users/example/AIWorkSpace/env/tools/rust/cargo/env" ]; then
    source "/Users/example/AIWorkSpace/env/tools/rust/cargo/env"
elif [ -f "$HOME/.cargo/env" ]; then
    source "$HOME/.cargo/env"
elif [ -f "/Users/example/.cargo/env" ]; then
    source "/Users/example/.cargo/env"
fi
```

---

## 四、授权码格式详解

### 4.1 授权码结构

```
PMT1-XXXXX-XXXXX-XXXXX-...
|    |     |     |
|    |     |     └─ 授权码内容分段（每 5 字符一段）
|    |     └─────── 编码后的 JSON
|    └───────────── Base64 编码的签名（Hex 编码后）
└────────────────── 前缀
```

### 4.2 编码方式

| 部分 | 编码方式 | 说明 |
|------|----------|------|
| 签名 | Hex → Base64 URL_SAFE_NO_PAD | 64 字节签名 → 128 字符 Hex → ~87 字符 Base64 |
| JSON 数据 | Base64 URL_SAFE_NO_PAD | payload JSON → Base64 |

### 4.3 生成示例

**Payload JSON:**
```json
{
  "product": "PMTool",
  "license_id": "550e8400-e29b-41d4-a716-446655440000",
  "device_id": "device-12345",
  "license_type": "DAYS_30",
  "start_time": "2024-09-01T00:00:00+08:00",
  "expire_time": "2024-10-01T00:00:00+08:00"
}
```

**生成的授权码:**
```
PMT1-abc123...-eyJwcm9kdWN0IjoiUE1Ub29sIiw...
```

---

## 五、PMTool 授权验证

**验证位置:** `app/src-tauri/src/crypto_ed25519.rs`

**验证流程:**
```rust
1. 分割授权码为前缀和数据部分
2. 将数据部分按破折号分割
3. 第一段：Base64 URL_SAFE_NO_PAD 解码 → 64 字符 Hex 签名
4. 剩余部分：拼接后 Base64 URL_SAFE_NO_PAD 解码 → JSON
5. 将 Hex 签名转换为字节
6. 使用公钥验证签名
7. 解析 JSON 获取授权信息
```

**关键点:**
- License Generator 使用 `URL_SAFE_NO_PAD` 编码
- PMTool 验证时也使用 `URL_SAFE_NO_PAD`（之前曾使用 `STANDARD`，已修复）
- 签名是 64 字节（512 位），Hex 编码后为 128 字符

---

## 六、已知问题

### 6.1 macOS 窗口显示问题

**现象:** Tauri 进程在运行，但窗口不显示

**原因:** Tauri 2.x 在 macOS 上的窗口渲染问题

**临时解决方案:**
- 直接通过浏览器访问：`http://localhost:1421`
- 使用测试页面：`http://localhost:1421/test-api.html`

**影响:** 用户可以通过浏览器正常使用授权码生成功能

### 6.2 环境变量路径

**问题:** 项目使用的 Rust 路径是自定义路径

**当前配置:**
```bash
/Users/example/AIWorkSpace/env/tools/rust/cargo/bin
```

**需要适配:** 其他开发者的 Rust 安装路径

---

## 七、开发指南

### 7.1 本地开发

```bash
# 1. 安装依赖
cd app/license-generator
npm install

# 2. 启动开发服务器
npm run tauri:dev

# 3. 或单独启动 Vite + Tauri
npm run dev        # 前端
npm run tauri      # 后端
```

### 7.2 构建发行版

```bash
# 构建
npm run tauri:build

# 输出位置
app/license-generator/src-tauri/target/release/bundle/dmg/
```

### 7.3 测试授权码生成

```bash
# 1. 启动 License Generator
./start.sh start-lg

# 2. 打开浏览器
open http://localhost:1421/test-api.html

# 3. 点击"生成测试授权码"
```

---

## 八、密钥管理

**密钥存储位置:** `~/.pmtool/`

**文件列表:**
- `license_generator_private.pem` - 私钥（用于签名）
- `license_generator_public.pem` - 公钥（用于验证）

**首次使用:**
- 密钥会在首次调用 `generate_license_command` 时自动生成
- 私钥需要妥善保管，丢失会导致无法生成有效的授权码

---

## 九、API 文档

### 9.1 Tauri Commands

#### `check_key_status`
检查密钥是否存在

**请求:** 无参数

**响应:** `boolean`

```javascript
const exists = await window.__TAURI__.core.invoke('check_key_status');
```

#### `generate_license_command`
生成授权码

**请求参数:**
```typescript
{
  deviceId: string,      // 设备唯一 ID
  durationDays: number,  // 授权天数（0 = 永久）
  startDate: string      // ISO8601 格式日期
}
```

**响应:** `string` - 授权码

```javascript
const license = await window.__TAURI__.core.invoke('generate_license_command', {
  deviceId: "device-12345",
  durationDays: 30,
  startDate: "2024-09-01T00:00:00+08:00"
});
// 返回："PMT1-xxxxx-xxxxx-..."
```

---

## 十、与其他模块的集成

### 10.1 PMTool 授权管理

**流程:**
1. 用户从 PMTool 复制设备唯一 ID
2. 在 License Generator 中生成授权码
3. 复制授权码回 PMTool
4. PMTool 调用 `activate_license_simple` 激活

### 10.2 密钥同步

**问题:** License Generator 和 PMTool 使用不同的密钥对

**解决方案:**
- License Generator 使用独立的密钥对
- PMTool 从 License Generator 公钥验证授权码
- 无需密钥同步，只需共享公钥

---

## 十一、维护清单

### 11.1 常规维护

- [ ] 定期检查 Rust 依赖更新
- [ ] 测试不同期限的授权码（30 天、1 年、永久）
- [ ] 验证授权码在 PMTool 中的激活流程
- [ ] 测试 macOS 窗口显示问题

### 11.2 问题排查

**问题:** 端口被占用
```bash
./start.sh stop-lg
lsof -i :1421
kill -9 <pid>
```

**问题:** 密钥丢失
```bash
rm -rf ~/.pmtool
# 重新生成时会自动创建
```

**问题:** 编译错误
```bash
cd app/license-generator/src-tauri
cargo clean
cargo build
```

---

## 十二、参考链接

- [Tauri 官方文档](https://tauri.app/)
- [Ed25519 数字签名](https://en.wikipedia.org/wiki/EdDSA)
- [Vite 配置文档](https://vitejs.dev/config/)

---

## 十三、版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 1.0.0 | 2024-09-03 | 初始版本，基础授权码生成功能 |
| 1.0.1 | 2024-09-03 | 修复环境变量路径、Vite 配置、浅色主题 |
| 1.0.2 | 2024-09-03 | 修复编码格式，与 PMTool 对齐 |

---

## 联系信息

**作者:** example
**项目位置:** `/Users/example/AIWorkSpace/projects/PMTOOL/app/license-generator/`
**创建日期:** 2024-09-03
