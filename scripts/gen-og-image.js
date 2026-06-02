// ビルド時に OGP バナー画像 (1200x630) を生成して dist/ に配置する
// pngjs のみ使用。バイリニア補間でアイコンを高品質にリサイズ。
// デザイン: Reach のベージュ背景 + アイコン中央配置 + ブランド名

const { PNG } = require('pngjs')
const fs = require('fs')
const path = require('path')

const DIST   = path.join(__dirname, '../dist')
const ASSETS = path.join(__dirname, '../assets')

const W = 1200, H = 630

// Reach カラーパレット
const BG   = [0xF5, 0xEF, 0xE6]  // #F5EFE6 メイン背景（og-image.js と揃える）
const ACC  = [0xB8, 0x50, 0x42]  // #B85042 アクセント色（Reach ブランドカラー）

// ---------- バイリニア補間ヘルパー ----------
function sampleBilinear(src, srcW, srcH, sx, sy) {
  const x0 = Math.max(0, Math.floor(sx))
  const y0 = Math.max(0, Math.floor(sy))
  const x1 = Math.min(x0 + 1, srcW - 1)
  const y1 = Math.min(y0 + 1, srcH - 1)
  const tx = sx - x0
  const ty = sy - y0

  const i00 = (y0 * srcW + x0) * 4
  const i10 = (y0 * srcW + x1) * 4
  const i01 = (y1 * srcW + x0) * 4
  const i11 = (y1 * srcW + x1) * 4

  const result = new Array(4)
  for (let c = 0; c < 4; c++) {
    const top    = src[i00 + c] * (1 - tx) + src[i10 + c] * tx
    const bottom = src[i01 + c] * (1 - tx) + src[i11 + c] * tx
    result[c] = Math.round(top * (1 - ty) + bottom * ty)
  }
  return result
}

// ---------- アイコン読み込み ----------
let iconPng = null
const iconPath = path.join(ASSETS, 'icon.png')
if (fs.existsSync(iconPath)) {
  try { iconPng = PNG.sync.read(fs.readFileSync(iconPath)) } catch {}
}

// ---------- バナー生成 ----------
const banner = new PNG({ width: W, height: H, filterType: -1 })

// アイコンサイズ（縦横余白を確保）
const ICON_SIZE = Math.min(420, H - 120)
const iconOffX = Math.floor((W - ICON_SIZE) / 2)
const iconOffY = Math.floor((H - ICON_SIZE) / 2)

// 角丸半径（アプリアイコンの角丸に合わせる）
const RADIUS = Math.floor(ICON_SIZE * 0.2)

// 背景 + アイコン描画
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const idx = (y * W + x) * 4
    const ix = x - iconOffX
    const iy = y - iconOffY

    let placed = false
    if (iconPng && ix >= 0 && ix < ICON_SIZE && iy >= 0 && iy < ICON_SIZE) {
      // バイリニア補間でアイコンをリサイズ
      const srcX = ix * (iconPng.width  - 1) / (ICON_SIZE - 1)
      const srcY = iy * (iconPng.height - 1) / (ICON_SIZE - 1)
      const [r, g, b, a] = sampleBilinear(iconPng.data, iconPng.width, iconPng.height, srcX, srcY)
      const alpha = a / 255

      banner.data[idx]     = Math.round(r * alpha + BG[0] * (1 - alpha))
      banner.data[idx + 1] = Math.round(g * alpha + BG[1] * (1 - alpha))
      banner.data[idx + 2] = Math.round(b * alpha + BG[2] * (1 - alpha))
      banner.data[idx + 3] = 255
      placed = true
    }

    if (!placed) {
      banner.data[idx]     = BG[0]
      banner.data[idx + 1] = BG[1]
      banner.data[idx + 2] = BG[2]
      banner.data[idx + 3] = 255
    }
  }
}

// ---------- "Reach" ロゴテキストをピクセルフォントで描画 ----------
// 5x7 ピクセルフォント（手書きビットマップ）
const FONT5x7 = {
  R: [0b11110,0b10001,0b10001,0b11110,0b10100,0b10010,0b10001],
  E: [0b11111,0b10000,0b10000,0b11110,0b10000,0b10000,0b11111],
  A: [0b01110,0b10001,0b10001,0b11111,0b10001,0b10001,0b10001],
  C: [0b01111,0b10000,0b10000,0b10000,0b10000,0b10000,0b01111],
  H: [0b10001,0b10001,0b10001,0b11111,0b10001,0b10001,0b10001],
}

const CHARS   = ['R','E','A','C','H']
const SCALE   = 14          // 1ピクセル → 14px
const GAP     = SCALE * 1   // 文字間
const CHAR_W  = 5 * SCALE
const CHAR_H  = 7 * SCALE
const TEXT_W  = CHARS.length * CHAR_W + (CHARS.length - 1) * GAP
const TEXT_X  = Math.floor((W - TEXT_W) / 2)
const TEXT_Y  = iconOffY + ICON_SIZE + Math.floor((H - (iconOffY + ICON_SIZE)) / 2) - Math.floor(CHAR_H / 2)

CHARS.forEach((ch, ci) => {
  const bitmap = FONT5x7[ch]
  const cx = TEXT_X + ci * (CHAR_W + GAP)
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 5; col++) {
      if ((bitmap[row] >> (4 - col)) & 1) {
        // このビットをSCALE×SCALEブロックで描画
        for (let dy = 0; dy < SCALE; dy++) {
          for (let dx = 0; dx < SCALE; dx++) {
            const px = cx + col * SCALE + dx
            const py = TEXT_Y + row * SCALE + dy
            if (px < 0 || px >= W || py < 0 || py >= H) continue
            const idx = (py * W + px) * 4
            banner.data[idx]     = ACC[0]
            banner.data[idx + 1] = ACC[1]
            banner.data[idx + 2] = ACC[2]
            banner.data[idx + 3] = 255
          }
        }
      }
    }
  }
})

// ---------- 書き出し ----------
if (!fs.existsSync(DIST)) fs.mkdirSync(DIST, { recursive: true })
fs.writeFileSync(path.join(DIST, 'og-image.png'), PNG.sync.write(banner))
console.log('og-image.png generated (1200x630, bilinear)')
