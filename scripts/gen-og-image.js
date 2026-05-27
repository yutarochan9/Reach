// ビルド時に OGP バナー画像 (1200x630) を生成して dist/ に配置する
// pngjs (プロジェクト内に存在) のみ使用。外部依存なし。
// デザイン: Reach のベージュ背景 + アイコン中央配置 + サブタイルドット柄

const { PNG } = require('pngjs')
const fs = require('fs')
const path = require('path')

const DIST   = path.join(__dirname, '../dist')
const ASSETS = path.join(__dirname, '../assets')

const W = 1200, H = 630

// Reach カラーパレット
const BG     = [0xED, 0xE4, 0xD8]  // #EDE4D8 メイン背景
const DOT    = [0xD4, 0xC4, 0xB0]  // #D4C4B0 ボーダー色（ドット柄）

// ---------- アイコン読み込み ----------
let iconPng = null
const iconPath = path.join(ASSETS, 'icon.png')
if (fs.existsSync(iconPath)) {
  try { iconPng = PNG.sync.read(fs.readFileSync(iconPath)) } catch {}
}

// ---------- バナー生成 ----------
const banner = new PNG({ width: W, height: H, filterType: -1 })

// アイコンをバナー中央に収める大きさ（縦に余白を持たせる）
const TARGET = Math.min(480, H - 80)
const iconOffX = Math.floor((W - TARGET) / 2)
const iconOffY = Math.floor((H - TARGET) / 2)

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const idx = (y * W + x) * 4

    // アイコン領域かどうか判定
    const ix = x - iconOffX
    const iy = y - iconOffY

    if (iconPng && ix >= 0 && ix < TARGET && iy >= 0 && iy < TARGET) {
      // ニアレストネイバーでアイコンをリサイズしつつ背景合成
      const srcX = Math.floor(ix * iconPng.width  / TARGET)
      const srcY = Math.floor(iy * iconPng.height / TARGET)
      const si   = (srcY * iconPng.width + srcX) * 4
      const a    = iconPng.data[si + 3] / 255

      banner.data[idx]     = Math.round(iconPng.data[si]     * a + BG[0] * (1 - a))
      banner.data[idx + 1] = Math.round(iconPng.data[si + 1] * a + BG[1] * (1 - a))
      banner.data[idx + 2] = Math.round(iconPng.data[si + 2] * a + BG[2] * (1 - a))
      banner.data[idx + 3] = 255
    } else {
      // 背景 + サブタイルドット (40px ごと)
      const isDot = (x % 40 === 20) && (y % 40 === 20)
      const c = isDot ? DOT : BG
      banner.data[idx]     = c[0]
      banner.data[idx + 1] = c[1]
      banner.data[idx + 2] = c[2]
      banner.data[idx + 3] = 255
    }
  }
}

// ---------- 書き出し ----------
if (!fs.existsSync(DIST)) fs.mkdirSync(DIST, { recursive: true })
fs.writeFileSync(path.join(DIST, 'og-image.png'), PNG.sync.write(banner))
console.log('og-image.png generated (1200x630)')
