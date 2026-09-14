/**
 * PMTool App Icon 转换管线 (commonjs, 用 NODE_PATH 解析 sharp)
 *
 * 唯一源：V8/app-icon/iconmaster/
 *   - pmtool-icon-macos.svg    macOS 版（内置安全区 ~86% 填充、大圆角 squircle）
 *   - pmtool-icon-windows.svg  Windows 版（全幅铺满、系统统一圆角遮罩）
 *
 * 输出：app/src-tauri/icons/
 *   - 各尺寸 .png            sharp 渲染（fit:'contain' 保留安全区，不裁剪、不放大）
 *   - macOS .icns            由 macOS 原生 iconutil 打包
 *   - Windows .ico           由 Pillow 合成多尺寸
 *
 * 为什么不用 fit:'cover'：旧脚本用 cover 缩放，小尺寸时安全区被裁掉、图标放大到铺满
 *   （16/32px 达 100% 填充），这正是 macOS Dock 图标比系统 App「大一圈」的根因。
 *   contain 保证百分比恒定。
 *
 * 用法：PMTOOL_ROOT=<根> node V8/app-icon/icon-convert.cjs
 * 依赖：sharp（npm install sharp）
 */
const sharp = require('sharp')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const os = require('node:os')

const ROOT = process.env.PMTOOL_ROOT
  || path.resolve(__dirname, '..', '..')
const MASTER_DIR = path.join(ROOT, 'V8', 'app-icon', 'iconmaster')
const OUT_DIR = process.env.PMTOOL_ICON_OUT
  || path.join(ROOT, 'app', 'src-tauri', 'icons')

const MAC_SVG = path.join(MASTER_DIR, 'pmtool-icon-macos.svg')
const WIN_SVG = path.join(MASTER_DIR, 'pmtool-icon-windows.svg')

if (!fs.existsSync(MAC_SVG) || !fs.existsSync(WIN_SVG)) {
  console.error('缺少 master SVG：' + MASTER_DIR)
  process.exit(1)
}
fs.mkdirSync(OUT_DIR, { recursive: true })

function pow2(p) { return Math.pow(2, p) }
const S = {
  s16: pow2(4), s24: pow2(4) + pow2(3), s32: pow2(5), s40: pow2(5) + pow2(3),
  s48: pow2(4) + pow2(5), s64: pow2(6), s128: pow2(7), s256: pow2(8),
  s512: pow2(9), s1024: pow2(10),
}

const TAU = [
  { file: '16x16.png', px: S.s16 },
  { file: '16x16@2x.png', px: S.s32 },
  { file: '24x24.png', px: S.s24 },
  { file: '24x24@2x.png', px: S.s48 },
  { file: '32x32.png', px: S.s32 },
  { file: '32x32@2x.png', px: S.s64 },
  { file: '48x48.png', px: S.s48 },
  { file: '48x48@2x.png', px: S.s48 * 2 },
  { file: '64x64.png', px: S.s64 },
  { file: '64x64@2x.png', px: S.s128 },
  { file: '128x128.png', px: S.s128 },
  { file: '128x128@2x.png', px: S.s256 },
  { file: '256x256.png', px: S.s256 },
  { file: '256x256@2x.png', px: S.s512 },
  { file: '512x512.png', px: S.s512 },
  { file: '512x512@2x.png', px: S.s1024 },
]

const ICO = [S.s16, S.s24, S.s32, S.s40, S.s48, S.s64, S.s128, S.s256]

const ICONSET = [
  { file: 'icon_16x16.png', px: S.s16 },
  { file: 'icon_16x16@2x.png', px: S.s32 },
  { file: 'icon_32x32.png', px: S.s32 },
  { file: 'icon_32x32@2x.png', px: S.s64 },
  { file: 'icon_128x128.png', px: S.s128 },
  { file: 'icon_128x128@2x.png', px: S.s256 },
  { file: 'icon_256x256.png', px: S.s256 },
  { file: 'icon_256x256@2x.png', px: S.s512 },
  { file: 'icon_512x512.png', px: S.s512 },
  { file: 'icon_512x512@2x.png', px: S.s1024 },
]

function renderBuf(svgPath, size) {
  return sharp(svgPath)
    .resize(size, size, { fit: 'contain', background: { r: 255, g: 65, b: 71, alpha: 200 } })
    .png()
    .toBuffer()
}

async function buildPNGs() {
  console.log('\n[PNG] 各尺寸 (fit:contain·保留安全区)')
  for (const t of TAU) {
    fs.writeFileSync(path.join(OUT_DIR, t.file), await renderBuf(MAC_SVG, t.px))
  }
  console.log('  ok ' + TAU.length + ' 个 PNG')
}

async function buildIcns() {
  if (process.platform !== 'darwin') { console.log('  - 非 macOS 环境，跳过 .icns'); return }
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pmtool-icns-'))
  const dir = path.join(root, 'pmtool.iconset')
  fs.mkdirSync(dir, { recursive: true })
  for (const it of ICONSET) {
    fs.writeFileSync(path.join(dir, it.file), await renderBuf(MAC_SVG, it.px))
  }
  const out = path.join(OUT_DIR, 'icon.icns')
  execFileSync('iconutil', ['-c', 'icns', dir, '-o', out])
  fs.rmSync(root, { recursive: true, force: true })
  console.log('  ok macOS .icns')
}

async function buildIco() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pmtool-ico-'))
  const base = path.join(tmp, 'base.png')
  // Pillow 用基础图 + sizes 列表自动生成各尺寸帧
  fs.writeFileSync(base, await renderBuf(WIN_SVG, S.s256))
  const py = 'from PIL import Image\n' +
    'img = Image.open(' + JSON.stringify(base) + ').convert("RGBA")\n' +
    'img.save(' + JSON.stringify(path.join(tmp, 'icon.ico')) + ', format="ICO", sizes=[' + ICO.map(function (s) { return '(' + s + ',' + s + ')' }).join(',') + '])\n' +
    'print("ico saved")\n'
  const pyf = path.join(tmp, 'b.py')
  fs.writeFileSync(pyf, py)
  try { execFileSync('python3', [pyf], { stdio: 'inherit' }) } catch (e) { console.error('ico error: ' + e.message) }
  const out = path.join(OUT_DIR, 'icon.ico')
  if (fs.existsSync(path.join(tmp, 'icon.ico'))) {
    fs.copyFileSync(path.join(tmp, 'icon.ico'), out)
    console.log('  ok Windows .ico ' + ICO.join(','))
  }
  fs.rmSync(tmp, { recursive: true, force: true })
}

async function main() {
  await buildPNGs()
  await buildIcns()
  await buildIco()
  console.log('\n完成。')
}

main().catch(function (err) { console.error(err); process.exit(1) })
