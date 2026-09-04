/**
 * PMTool App Icon 转换脚本（sharp 版）
 * - 用 sharp（含 prebuilt libvips · 纯二进制 · 无 native deps）SVG → PNG
 * - 多尺寸输出（macOS .icns + Windows .ico + 安装包）
 *
 * 用法：
 *   PMTOOL_ROOT=/Users/example/AIWorkSpace/projects/PMTool \
 *   node tools/icon-convert.mjs
 *
 * 环境变量 PMTOOL_ROOT 显式指向 PMTool 仓库根目录
 * （不依赖脚本所在位置 · 避免 __dirname 路径错算）
 */
import sharp from 'sharp'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.env.PMTOOL_ROOT
  || path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..')

if (!fs.existsSync(path.join(ROOT, 'V8/app-icon/svg'))) {
  console.error(`✗ PMTool 根目录不对：${ROOT}`)
  console.error('  请设置环境变量：export PMTOOL_ROOT=/path/to/PMTool')
  process.exit(1)
}

const SVG_DIR = path.join(ROOT, 'V8/app-icon/svg')
const PNG_DIR = path.join(ROOT, 'V8/app-icon/png')
const ICNS_DIR = path.join(ROOT, 'V8/app-icon/icns')
const ICO_DIR = path.join(ROOT, 'V8/app-icon/ico')

console.log(`PMTool 根目录: ${ROOT}`)

// PNG 多尺寸 · 覆盖 macOS + Windows 所有常见使用场景
const PNG_SIZES = [16, 24, 32, 48, 64, 128, 256, 512, 1024]

// .icns 需要的精确尺寸（macOS 标准）
const ICNS_SIZES = [
  { name: '16x16', size: 16 },
  { name: '16x16@2x', size: 32 },
  { name: '32x32', size: 32 },
  { name: '32x32@2x', size: 64 },
  { name: '64x64', size: 64 },
  { name: '128x128', size: 128 },
  { name: '128x128@2x', size: 256 },
  { name: '256x256', size: 256 },
  { name: '256x256@2x', size: 512 },
  { name: '512x512', size: 512 },
  { name: '512x512@2x', size: 1024 },
  { name: '1024x1024', size: 1024 },
]

// .ico 需要的尺寸（Windows 标准）
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]

fs.mkdirSync(PNG_DIR, { recursive: true })
fs.mkdirSync(path.join(ICNS_DIR, 'pmtool.iconset'), { recursive: true })
fs.mkdirSync(ICO_DIR, { recursive: true })

async function convertSvg(svgPath, outPath, size) {
  const pngBuffer = await sharp(svgPath, { density: 96 })
    .resize(size, size, { fit: 'cover' })
    .png()
    .toBuffer()
  fs.writeFileSync(outPath, pngBuffer)
}

async function convertDirection(name) {
  const svgPath = path.join(SVG_DIR, `${name}.svg`)
  if (!fs.existsSync(svgPath)) {
    console.error(`  ✗ ${name}.svg 不存在`)
    return
  }
  console.log(`\n[${name}]`)

  for (const size of PNG_SIZES) {
    const out = path.join(PNG_DIR, `${name}-${size}.png`)
    await convertSvg(svgPath, out, size)
  }
  console.log(`  ✓ ${PNG_SIZES.length} PNG (16/24/32/48/64/128/256/512/1024)`)

  // macOS .icns iconset
  const iconsetDir = path.join(ICNS_DIR, `${name}.iconset`)
  fs.mkdirSync(iconsetDir, { recursive: true })
  for (const { name: icnsName, size } of ICNS_SIZES) {
    const icnsOut = path.join(iconsetDir, `icon_${icnsName}.png`)
    await convertSvg(svgPath, icnsOut, size)
  }
  console.log(`  ✓ ${ICNS_SIZES.length} .icns iconset PNG`)

  // Windows .ico 用 sharp 直接合成（sharp 内置 ico 输出）
  for (const size of ICO_SIZES) {
    const icoOut = path.join(ICO_DIR, `${name}-${size}.png`)
    await convertSvg(svgPath, icoOut, size)
  }
  console.log(`  ✓ ${ICO_SIZES.length} .ico PNG (sharp 合成)`)
}

async function main() {
  // 动态读 SVG 目录（不再硬编码方向名 · 增删方向自动适配）
  const directions = fs
    .readdirSync(SVG_DIR)
    .filter((f) => f.endsWith('.svg'))
    .map((f) => f.replace(/\.svg$/, ''))

  for (const dir of directions) {
    await convertDirection(dir)
  }

  // 统计
  const pngCount = fs.readdirSync(PNG_DIR).length
  console.log(`\n✓ 总计: ${pngCount} 个 PNG (${directions.length} 方向 × ${PNG_SIZES.length} 尺寸)`)
  console.log(`  → 下一步: iconutil 生成 .icns · sharp 合成 .ico`)
}

main().catch((err) => {
  console.error('转换失败：', err)
  process.exit(1)
})
