# PMTool 授权生成器 App Icon —— 双平台图标设计

> 设计规范文件见仓库根 `已粘贴的文本.txt`。本文档说明本目录内容、设计决策、构建管线与验证状态。

## 一、目录结构

```
icons-design/
├── README.md             本说明
├── build_icons.py        构建脚本（生成 SVG 母版 → 渲染 PNG → 打包 icns/ico → 同步 Tauri PNG 集）
├── master/               矢量母版（构建时生成，已随脚本提交以便回溯）
│   ├── macos-full.svg    macOS 全版（含火花，≥48px 使用）
│   ├── macos-small.svg   macOS 简化版（无火花，≤32px 使用，保证小尺寸干净）
│   ├── windows-full.svg  Windows 全版
│   └── windows-small.svg Windows 简化版
├── render/               逐尺寸 PNG（macos/ 与 windows/ 两个子目录）
└── sheet_macos.png / sheet_windows.png   预览样张（尺寸条 × 深浅背景）
```

产出直接写入 `../src-tauri/icons/`：`icon.icns`、`icon.ico` 及全部标准 PNG（16×16 … 1024×1024 各 @2x）。`tauri.conf.json` 的 `bundle.icon` 路径无需改动。

## 二、设计决策

### 核心图形：钥匙 + 火花

| 元素 | 含义 |
|---|---|
| **钥匙**（环 + 柄 + 双齿，45° 斜置，环在右上、尖在左下） | 授权/许可证的通用符号，任意尺寸下剪影可辨识 |
| **右上（左上角）四角星火花** | 延续原授权生成器图标的"生成/魔法"元素，暗示 License 生成 |
| **蓝→紫渐变**（`#4163E8 → #6363F3 → #8463FD`，135°） | 采样自原授权生成器图标，与主应用 PMTool 同属蓝系家族，一眼可辨同产品线 |

### 双平台适配（规范第七节：禁止一图通吃）

| 维度 | macOS 版 | Windows 版 |
|---|---|---|
| 外轮廓 | 全出血 Apple 连续曲率 Squircle（1024 画布角距 185，双三次贝塞尔 G2 连续，非普通圆角矩形） | 无外框，透明背景 |
| 主体 | 白色钥匙（白→微蓝白渐变），占比 49%（Apple 安全区比例） | 蓝紫渐变钥匙，占比 62%（Windows 图标更饱满） |
| 阴影 | 深蓝径向柔影，随钥匙 45° 旋转 | 中性深蓝椭圆柔影，水平放置、更收敛 |
| 高光 | Squircle 顶部 16% 白色天光 | 环左上缘白色描边（38% 透明度） |
| 小尺寸（≤32px） | 简化版：去火花、环加厚 20%、钥匙放大 1.10× | 简化版：去火花、环加厚、钥匙放大 1.18× |

### 技术实现要点

- **Squircle**：角部用两段三次贝塞尔构造（端点曲率 0 与直边平滑衔接、45° 中点对称切向），比 CSS 圆角矩形更接近 Apple 原生曲线。
- **柔影不用滤镜**：渲染器（librsvg）对 SVG filter 支持弱，用径向渐变椭圆模拟软阴影，兼容性最好。
- **渲染管线**：SVG 矢量母版 → sharp（librsvg 内核）逐尺寸原生渲染；<256px 用 4× 超采样 + LANCZOS 降采样，保证小尺寸清晰。
- **ICO**：16/24/32/48/64/128 为 32bpp BMP 条目，256 为 PNG 压缩条目（规范要求 256 用高分辨率源图）。
- **ICNS**：ic07（128）/ic08（256）/ic09（512）/ic10（1024）/ic11（32）/ic12（64）/ic13（256）/ic14（512）全部 PNG 编码。

## 三、重新构建

前置：Node 24 + sharp（一次性安装，装到 `%LOCALAPPDATA%\Temp\iconrender`）：

```bash
mkdir -p /tmp/iconrender && cd /tmp/iconrender && npm init -y && npm i sharp --registry=https://registry.npmmirror.com/
```

或通过 `ICON_RENDER_DIR` 环境变量指定 sharp 所在目录。然后：

```bash
cd app/license-generator/icons-design
python build_icons.py        # 需要 Python 3.12 + Pillow
```

几何参数（缩放、齿长、环径、Squircle 角参数 a/m/p）全部集中在脚本顶部常量与各 `svg_*` 函数内，改完重跑即可。

## 四、验证状态（2026-09-17）

已在本机程序化验证（无视觉模型，用像素采样 + 结构解析）：
- [x] macOS 全版/简化版结构正确：Squircle 圆角连续、钥匙环+孔+柄+齿齐全、火花在 (272,272)
- [x] Windows 全版/简化版结构正确：透明底、渐变钥匙、齿间隙透明、环顶高光生效
- [x] 钥匙占比 macOS 49% / Windows 62%（占画布高度）
- [x] 16px 两平台钥匙剪影可读、环孔可见
- [x] ICO 7 条目（16/24/32/48/64/128 BMP + 256 PNG）与 ICNS 8 条目均可解析
- [x] 小尺寸用简化母版（16/32px 无火花）

**待人工确认（本机无法执行）**：
- [ ] macOS：Finder / Dock / Launchpad / 应用程序目录显示效果（需在 Mac 上打包后目视）
- [ ] Windows：开始菜单 / 任务栏 / 桌面 / 资源管理器显示效果（打包 NSIS 安装后目视）
- [ ] 若需微调，改 `build_icons.py` 重跑即可