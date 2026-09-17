#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PMTool 授权生成器 App Icon —— 双平台图标构建脚本
====================================================

设计管线（见 README.md）:
    SVG 矢量母版（macOS 版 / Windows 版，各自平台适配）
        → cairosvg 逐尺寸渲染 PNG（小尺寸走 4x 超采样 + LANCZOS 降采样）
        → 打包 AppIcon.icns（macOS）/ AppIcon.ico（Windows）
        → 同步 Tauri 标准 PNG 图标集

品牌色（采样自主应用与现有授权生成器图标）:
    背景渐变: #4163E8 → #6363F3 → #8463FD （钴蓝 → 紫，135°）
    Windows 主体渐变: #3E5CE9 → #6D4DF0 → #8A55FA

依赖: uv run --with cairosvg --with pillow build_icons.py
"""
import io
import math
import os
import struct
import subprocess
import tempfile

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)                      # app/license-generator
TAURI_ICONS = os.path.join(ROOT, "src-tauri", "icons")
RENDER_DIR = os.path.join(HERE, "render")
MASTER_DIR = os.path.join(HERE, "master")
# sharp 渲染助手所在目录（含 node_modules/sharp; 由安装 sharp 的目录决定）
# 默认: Windows 用户临时目录下的 iconrender（git-bash 的 /tmp 即映射到此）
RENDER_BIN = os.environ.get(
    "ICON_RENDER_DIR",
    os.path.join(os.environ.get("LOCALAPPDATA", "C:/Users/example/AppData/Local"), "Temp", "iconrender"),
)

S = 1024.0  # 母版画布

# ----------------------------------------------------------------------------
# 几何
# ----------------------------------------------------------------------------

def squircle_path(a=185.0, m=56.0, p=120.0, size=S):
    """Apple 连续曲率风格 Squircle。

    每角 = 两段三次贝塞尔（G2 连续，端点曲率为 0 与直边平滑衔接）:
      角局部坐标: 顶点(0,0), 内侧象限 +x+y
      A=(a,0)  直边起点   B=(0,a)  直边终点   M=(m,m)  45° 中点
      B1: A C (p,0) (2m,0) M      B2: M C (0,2m) (0,p) B
    """
    def corner(x0, y0, dx, dy):
        A = (x0 + dx * a, y0)
        B = (x0, y0 + dy * a)
        M = (x0 + dx * m, y0 + dy * m)
        b1 = ((x0 + dx * p, y0), (x0 + dx * 2 * m, y0), M)          # A -> M
        b2 = ((x0, y0 + dy * 2 * m), (x0, y0 + dy * p), B)          # M -> B
        return A, B, b1, b2

    f = lambda t: f"{t[0]:.2f} {t[1]:.2f}"
    c = lambda seg: f"C {f(seg[0])} {f(seg[1])} {f(seg[2])}"
    def rseg(seg):
        # 反向贝塞尔: P0/P1 互换, 终点不变
        return (seg[1], seg[0], seg[2])

    c_tl = corner(0, 0, 1, 1)     # 走 A->B（上边 -> 左边）: b1, b2
    c_bl = corner(0, S, 1, -1)    # 走 B->A（左边 -> 下边）: rev(b2), rev(b1)
    c_br = corner(S, S, -1, -1)   # 走 A->B（下边 -> 右边）: b1, b2
    c_tr = corner(S, 0, -1, 1)    # 走 B->A（右边 -> 上边）: rev(b2), rev(b1)

    parts = [f"M {f(c_tl[0])}"]
    parts += [c(c_tl[2]), c(c_tl[3])]
    parts.append(f"L {f(c_bl[1])}")
    parts += [c(rseg(c_bl[3])), c(rseg(c_bl[2]))]
    parts.append(f"L {f(c_br[0])}")
    parts += [c(c_br[2]), c(c_br[3])]
    parts.append(f"L {f(c_tr[1])}")
    parts += [c(rseg(c_tr[3])), c(rseg(c_tr[2]))]
    parts.append("Z")
    return " ".join(parts)


def ring_path(cx, cy, r_out, r_in):
    """圆环（evenodd）: 外圆 + 内孔。"""
    def circle(cxx, cyy, r):
        return (f"M {cxx - r:.2f} {cyy:.2f} a {r:.2f} {r:.2f} 0 1 0 {2*r:.2f} 0 "
                f"a {r:.2f} {r:.2f} 0 1 0 {-2*r:.2f} 0 Z")
    return circle(cx, cy, r_out) + " " + circle(cx, cy, r_in)


def rounded_rect(x, y, w, h, r):
    r = min(r, w / 2, h / 2)
    return (f"M {x + r:.2f} {y:.2f} h {w - 2*r:.2f} a {r:.2f} {r:.2f} 0 0 1 {r:.2f} {r:.2f} "
            f"v {h - 2*r:.2f} a {r:.2f} {r:.2f} 0 0 1 {-r:.2f} {r:.2f} h {-(w - 2*r):.2f} "
            f"a {r:.2f} {r:.2f} 0 0 1 {-r:.2f} {-r:.2f} v {-(h - 2*r):.2f} "
            f"a {r:.2f} {r:.2f} 0 0 1 {r:.2f} {-r:.2f} Z")


def sparkle_path(cx, cy, r_out, r_in):
    """四角星火花（凹边）。"""
    def pt(ang_deg):
        a = math.radians(ang_deg)
        return (cx + r_out * math.cos(a), cy + r_out * math.sin(a))
    def pt_in(ang_deg):
        a = math.radians(ang_deg)
        return (cx + r_in * math.cos(a), cy + r_in * math.sin(a))
    # 每条边内凹: 边中点收到 45° 方向的 r_in 半径
    top = pt(-90); rt = pt(0); bot = pt(90); lf = pt(180)
    t1 = pt_in(-45); t2 = pt_in(45); t3 = pt_in(135); t4 = pt_in(225)
    f = lambda p: f"{p[0]:.2f} {p[1]:.2f}"
    q = lambda a, b: f((a[0] + (b[0] - a[0]) * 0.55, a[1] + (b[1] - a[1]) * 0.55))
    return (f"M {f(top)} C {q(top, t1)} {q(t1, rt)} {f(rt)} "
            f"C {q(rt, t2)} {q(t2, bot)} {f(bot)} "
            f"C {q(bot, t3)} {q(t3, lf)} {f(lf)} "
            f"C {q(lf, t4)} {q(t4, top)} {f(top)} Z")


# ----------------------------------------------------------------------------
# 钥匙图形（本地坐标: 头朝 +x, 齿朝 +y；整体再 rotate(-45°) 到头朝右上）
# ----------------------------------------------------------------------------

TEETH_DEFAULT = ((-288.0, 88.0, 160.0, 18.0), (-188.0, 70.0, 130.0, 15.0))


def key_layer(scale, ring_r1, ring_r2, shaft_w, fill_attr,
              teeth=TEETH_DEFAULT, cx=512.0, cy=512.0):
    """整体 transform 缩放 + 旋转 + 平移, 保证无接缝。"""
    parts = [f'<g transform="translate({cx} {cy}) rotate(-45) scale({scale}) translate(-25 0)">']
    parts.append(f'<path d="{ring_path(190, 0, ring_r1, ring_r2)}" fill-rule="evenodd" {fill_attr}/>')
    sw = shaft_w
    parts.append(f'<path d="{rounded_rect(-290, -sw/2, 410, sw, sw/2)}" {fill_attr}/>')
    for (tx, tw, th, tr) in teeth:
        parts.append(f'<path d="{rounded_rect(tx, 30, tw, th, tr)}" {fill_attr}/>')
    parts.append("</g>")
    return "\n".join(parts)


def ring_arc_highlight(scale, ring_r1, fill_attr):
    """Windows 版: 环左上缘的高光线（本地 -y 侧, 映射到画布左上 = 受光面）。"""
    r = ring_r1 - 9
    a0, a1 = math.radians(200), math.radians(340)
    x0, y0 = 190 + r * math.cos(a0), r * math.sin(a0)
    x1, y1 = 190 + r * math.cos(a1), r * math.sin(a1)
    return (f'<g transform="translate(512 512) rotate(-45) scale({scale}) translate(-25 0)">'
            f'<path d="M {x0:.2f} {y0:.2f} A {r:.2f} {r:.2f} 0 0 1 {x1:.2f} {y1:.2f}" '
            f'fill="none" stroke="#FFFFFF" stroke-opacity="0.38" stroke-width="10" stroke-linecap="round"/>'
            f'</g>')


# ----------------------------------------------------------------------------
# SVG 母版组装
# ----------------------------------------------------------------------------

SQUIRCLE = squircle_path()
SPARKLE = sparkle_path(272, 272, 62, 19)


def grad_defs_mac():
    return f'''  <defs>
    <linearGradient id="bg" gradientUnits="userSpaceOnUse" x1="120" y1="80" x2="900" y2="950">
      <stop offset="0" stop-color="#4163E8"/>
      <stop offset="0.52" stop-color="#6363F3"/>
      <stop offset="1" stop-color="#8463FD"/>
    </linearGradient>
    <linearGradient id="sheen" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="470">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.16"/>
      <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="shadow">
      <stop offset="0" stop-color="#101A66" stop-opacity="0.30"/>
      <stop offset="0.65" stop-color="#101A66" stop-opacity="0.12"/>
      <stop offset="1" stop-color="#101A66" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="key" gradientUnits="userSpaceOnUse" x1="330" y1="290" x2="700" y2="740">
      <stop offset="0" stop-color="#FFFFFF"/>
      <stop offset="1" stop-color="#EDF0FF"/>
    </linearGradient>
  </defs>'''


def grad_defs_win():
    return f'''  <defs>
    <radialGradient id="shadow">
      <stop offset="0" stop-color="#0E1A5C" stop-opacity="0.22"/>
      <stop offset="0.65" stop-color="#0E1A5C" stop-opacity="0.09"/>
      <stop offset="1" stop-color="#0E1A5C" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="key" gradientUnits="userSpaceOnUse" x1="330" y1="300" x2="700" y2="730">
      <stop offset="0" stop-color="#3E5CE9"/>
      <stop offset="0.55" stop-color="#6D4DF0"/>
      <stop offset="1" stop-color="#8A55FA"/>
    </linearGradient>
  </defs>'''


def svg_macos(full=True):
    """macOS: 全出血 Squircle + 高光 + 钥匙投影 + 白色钥匙 (+火花)。"""
    scale = 0.95 if full else 1.10
    ring_r2 = 78 if full else 62
    layers = []
    layers.append(f'  <path d="{SQUIRCLE}" fill="url(#bg)"/>')
    layers.append(f'  <path d="{SQUIRCLE}" fill="url(#sheen)"/>')
    layers.append('  <ellipse cx="540" cy="546" rx="315" ry="82" transform="rotate(-45 540 546)" fill="url(#shadow)"/>')
    layers.append(key_layer(scale, 150, ring_r2, 84, 'fill="url(#key)"'))
    if full:
        layers.append(f'  <path d="{SPARKLE}" fill="#FFFFFF" fill-opacity="0.95"/>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">\n'
            f'{grad_defs_mac()}\n' + "\n".join(layers) + "\n</svg>\n")


def svg_windows(full=True):
    """Windows: 透明底 + 柔和投影 + 蓝紫渐变钥匙 (+高光 +火花)。"""
    scale = 1.08 if full else 1.18
    ring_r1, ring_r2, shaft_w = (162, 86, 92) if full else (168, 74, 100)
    layers = []
    layers.append('  <ellipse cx="512" cy="806" rx="300" ry="56" fill="url(#shadow)"/>')
    layers.append(key_layer(scale, ring_r1, ring_r2, shaft_w, 'fill="url(#key)"'))
    layers.append(ring_arc_highlight(scale, ring_r1, ''))
    if full:
        layers.append(f'  <path d="{SPARKLE}" fill="#8A5CFA" fill-opacity="0.95"/>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">\n'
            f'{grad_defs_win()}\n' + "\n".join(layers) + "\n</svg>\n")


# ----------------------------------------------------------------------------
# 渲染
# ----------------------------------------------------------------------------

def render_png(svg_text, size, out_path):
    """SVG -> PNG: 交给 sharp (librsvg) 渲染；小尺寸由助手内部 4x 超采样 + lanczos3。"""
    with tempfile.NamedTemporaryFile("w", suffix=".svg", delete=False, encoding="utf-8") as f:
        f.write(svg_text)
        tmp = f.name
    helper = os.path.join(RENDER_BIN, "render_svg.mjs")
    try:
        subprocess.run(["node", helper, tmp, str(size), out_path],
                       check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as e:
        raise RuntimeError(f"sharp render failed for {size}px:\n{e.stdout}\n{e.stderr}")
    finally:
        os.unlink(tmp)


def render_set(svg_full, svg_small, sizes_full, sizes_small, tag):
    out = os.path.join(RENDER_DIR, tag)
    os.makedirs(out, exist_ok=True)
    paths = {}
    for sz in sorted(set(sizes_full) | set(sizes_small)):
        svg = svg_full if sz in sizes_full else svg_small
        p = os.path.join(out, f"{sz}.png")
        render_png(svg, sz, p)
        paths[sz] = p
    return paths


# ----------------------------------------------------------------------------
# 打包: ICNS / ICO / Tauri PNG 集
# ----------------------------------------------------------------------------

def png_bytes(path):
    with open(path, "rb") as f:
        return f.read()


def write_icns(out_path, sizes_map):
    """sizes_map: {icns_type: png_path}; 现代 icns 条目均为 PNG 编码。"""
    entries = []
    for typ, p in sizes_map.items():
        data = png_bytes(p)
        entries.append(typ.encode("ascii") + struct.pack(">I", len(data) + 8) + data)
    total = 8 + sum(len(e) for e in entries)
    with open(out_path, "wb") as f:
        f.write(b"icns" + struct.pack(">I", total))
        for e in entries:
            f.write(e)


def ico_bmp_entry(size, rgba):
    """32bpp BMP 编码 ICO 条目 (BI_RGB, 底部向上, 附 1bpp AND 掩码)。"""
    w = h = size
    header = struct.pack("<IiiHHIIiiII", 40, w, h * 2, 1, 32, 0, 0, 0, 0, 0, 0)
    rows = []
    for y in range(h - 1, -1, -1):  # 底部向上
        row = bytearray()
        for x in range(w):
            r, g, b, a = rgba.getpixel((x, y))
            row += bytes((b, g, r, a))
        rows.append(bytes(row))
    xor = b"".join(rows)
    # AND 掩码: 1 = 透明
    and_row_bytes = (w + 31) // 32 * 4
    and_rows = []
    for y in range(h - 1, -1, -1):
        bits = 0
        for x in range(w):
            a = rgba.getpixel((x, y))[3]
            if a == 0:
                bits |= 1
        rowb = bytearray(and_row_bytes)
        for i in range(w):
            if bits & (1 << i):
                rowb[i // 8] |= (1 << (i % 8))
        and_rows.append(bytes(rowb))
    return header + xor + b"".join(and_rows)


def write_ico(out_path, entries):
    """entries: [(size, rgba_image_or_None, png_path_or_None)]。"""
    n = len(entries)
    dir_off = 6 + 16 * n
    blobs = []
    for size, rgba, png_p in entries:
        if png_p is not None:
            blob = png_bytes(png_p)
        else:
            blob = ico_bmp_entry(size, rgba)
        blobs.append(blob)
    out = struct.pack("<HHH", 0, 1, n)
    off = dir_off
    for (size, rgba, png_p), blob in zip(entries, blobs):
        w = 0 if size == 256 else size
        out += struct.pack("<BBBBHHII", w, w, 0, 0, 1, 32, len(blob), off)
        off += len(blob)
    for blob in blobs:
        out += blob
    with open(out_path, "wb") as f:
        f.write(out)


# ----------------------------------------------------------------------------
# 预览样张（供人眼检查 + 交付说明）
# ----------------------------------------------------------------------------

def make_sheet(tag, paths, backgrounds):
    """一行尺寸条, 多背景各一行。"""
    sizes = sorted(paths.keys())
    cell = 288
    sheet = Image.new("RGB", (cell * len(sizes), cell * len(backgrounds)), (245, 246, 248))
    for row, (bg_name, bg_rgb) in enumerate(backgrounds):
        for col, sz in enumerate(sizes):
            im = Image.open(paths[sz]).convert("RGBA")
            tile = Image.new("RGBA", (cell, cell), bg_rgb + (255,))
            ox, oy = (cell - sz) // 2, (cell - sz) // 2
            tile.alpha_composite(im, (ox, oy))
            sheet.paste(tile.convert("RGB"), (col * cell, row * cell))
    out = os.path.join(HERE, f"sheet_{tag}.png")
    sheet.save(out, "PNG")
    return out


# ----------------------------------------------------------------------------
# 主流程
# ----------------------------------------------------------------------------

def main():
    os.makedirs(MASTER_DIR, exist_ok=True)
    os.makedirs(RENDER_DIR, exist_ok=True)

    m_mac_full = svg_macos(full=True)
    m_mac_small = svg_macos(full=False)
    m_win_full = svg_windows(full=True)
    m_win_small = svg_windows(full=False)
    for name, svg in [("macos-full.svg", m_mac_full), ("macos-small.svg", m_mac_small),
                      ("windows-full.svg", m_win_full), ("windows-small.svg", m_win_small)]:
        with open(os.path.join(MASTER_DIR, name), "w", encoding="utf-8") as f:
            f.write(svg)

    # macOS 尺寸集 (Tauri 标准集所需: 16,24,32,48,64,96,128,256,512,1024)
    mac_sizes = [16, 24, 32, 48, 64, 96, 128, 256, 512, 1024]
    mac_small = [16, 24, 32]
    mac_paths = render_set(m_mac_full, m_mac_small,
                           [s for s in mac_sizes if s not in mac_small], mac_small, "macos")

    # Windows .ico 尺寸集 (规范要求: 16,24,32,48,64,128,256)
    win_sizes = [16, 24, 32, 48, 64, 128, 256]
    win_paths = render_set(m_win_full, m_win_small,
                           [s for s in win_sizes if s not in mac_small], mac_small, "windows")

    # --- icon.icns (macOS 标准条目集, 全部 PNG 编码) ---
    icns_map = {
        "ic07": mac_paths[128],   # 128
        "ic08": mac_paths[256],   # 256
        "ic09": mac_paths[512],   # 512
        "ic10": mac_paths[1024],  # 1024
        "ic11": mac_paths[32],    # 16@2x
        "ic12": mac_paths[64],    # 32@2x
        "ic13": mac_paths[256],   # 128@2x
        "ic14": mac_paths[512],   # 256@2x
    }
    write_icns(os.path.join(TAURI_ICONS, "icon.icns"), icns_map)

    # --- icon.ico (16-128 BMP 32bpp, 256 PNG 压缩 —— 规范要求 256 用高分辨率源图) ---
    ico_entries = []
    for sz in [16, 24, 32, 48, 64, 128]:
        ico_entries.append((sz, Image.open(win_paths[sz]).convert("RGBA"), None))
    ico_entries.append((256, None, win_paths[256]))
    write_ico(os.path.join(TAURI_ICONS, "icon.ico"), ico_entries)

    # --- Tauri 标准 PNG 集 (macOS 母版派生, 与现有文件名一一对应) ---
    mapping = {
        "16x16.png": 16, "24x24.png": 24, "32x32.png": 32, "32x32@2x.png": 64,
        "48x48.png": 48, "48x48@2x.png": 96, "64x64.png": 64, "64x64@2x.png": 128,
        "128x128.png": 128, "128x128@2x.png": 256, "256x256.png": 256,
        "256x256@2x.png": 512, "512x512.png": 512, "512x512@2x.png": 1024,
        "1024x1024.png": 1024,
    }
    for name, sz in mapping.items():
        dest = os.path.join(TAURI_ICONS, name)
        Image.open(mac_paths[sz]).convert("RGBA").save(dest, "PNG")
    # icon.png: 保持原有尺寸
    old = os.path.join(TAURI_ICONS, "icon.png")
    if os.path.exists(old):
        ow, oh = Image.open(old).size
        if (ow, oh) == (32, 32):
            Image.open(mac_paths[32]).convert("RGBA").save(old, "PNG")
        else:
            sz = min(ow, oh)
            Image.open(mac_paths.get(sz, mac_paths[128])).convert("RGBA").save(old, "PNG")

    # --- 预览样张 ---
    make_sheet("macos", mac_paths,
               [("dark", (40, 42, 48)), ("light", (245, 246, 248))])
    make_sheet("windows", win_paths,
               [("white", (255, 255, 255)), ("light", (235, 237, 240)),
                ("dark", (32, 33, 36)), ("taskbar", (249, 249, 249))])
    print("done")


if __name__ == "__main__":
    main()
