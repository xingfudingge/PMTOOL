# PMTool 跨平台图标规范（Icon Master + Safe Area）

## 唯一源（Icon Master）

所有图标资源从 `V8/app-icon/iconmaster/` 下两个 SVG 生成，禁止再新建其他源：

| 文件 | 用途 | 画布原则 |
|---|---|---|
| `pmtool-icon-macos.svg` | macOS（Dock/Finder/Launchpad/.icns） | 背景圆角矩形仅占 **86%**（四周留 7% 透明安全区） |
| `pmtool-icon-windows.svg` | Windows（.ico 桌面/任务栏/开始菜单） | 背景铺满 100%，圆角由系统统一施加 |

## 为什么有安全区（macOS）

macOS 系统图标实测填充率约为 **85.9%**（Find/Notes/Calculator 均为 85.9%）。
图标铺满画布（100%）会显得比系统 App「大一圈」。

安全区具体值：
- macOS：背景矩形 `x=72 y=72 width=880 height=880`（1024 画布），即四周各留 7% 透明。
- Logo 主体（中央文档 + 帐篷）位于画布中央约 56% 区域内，不贴边。

## 转换管线

```bash
node V8/app-icon/icon-convert.cjs
```

输出到 `app/src-tauri/icons/`：16/24/32/48 等各尺寸 PNG、`icon.icns`、`icon.ico`。

**关键：所有尺寸必须用 `fit:contain` 等比缩放**，只是把 SVG 按尺寸缩小，绝不裁剪。
不要用 `fit:cover`——它会把安全区裁掉，小尺寸图标放大到 100% 填充（这正是旧图标
在 Dock 里显得过大的根因）。

- `icon.icns` 用 macOS 原生 `iconutil` 打包（多尺寸 chunk 合法）。
- `icon.ico` 用 Pillow 多尺寸合成（16 24 32 40 48 64 128 256）。

## 验收标准

每批图标生成后，校验填充率：

- macOS：>128px 应为 85.9%；16/32px 因 1px 抗锯齿约为 87.5%（正常）。
- 任何尺寸都不得回到 100%。

```python
from PIL import Image
im = Image.open('app/src-tauri/icons/512x512@2x.png')
bb = im.getchannel('A').getbbox()
fill = (bb[2]-bb[0]) / im.size[0] * 100
assert abs(fill - 85.9) < 1.0
```

## 后续新增/改 Logo 须知

1. 只改 `iconmaster/` 下两个 SVG（macOS 版保留 7% 安全区，Windows 版铺满）。
2. 重新运行 `icon-convert.cjs` 生成全部资源。
3. 用上面的填充率校验脚本验收，再进 `tauri.conf.json` 的 `bundle.icon`。
4. macOS 与 Windows 允许构图/留白不同（品牌一致、平台适配），不要强求像素级一致。
