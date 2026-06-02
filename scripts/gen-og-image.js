/**
 * gen-og-image.js
 * ビルド時に OGP バナー画像 (1200x630) を生成して dist/ に配置する。
 * @napi-rs/canvas を使用してシステムフォントでテキストを描画する。
 */

const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas')
const fs   = require('fs')
const path = require('path')

const DIST   = path.join(__dirname, '../dist')
const ASSETS = path.join(__dirname, '../assets')

const W = 1200, H = 630

// Reach カラーパレット（アプリの Colors と統一）
const BG_COLOR  = '#F5EFE6'   // Colors.background
const ACC_COLOR = '#8B5E3C'   // Colors.accent

async function generate() {
  const canvas = createCanvas(W, H)
  const ctx    = canvas.getContext('2d')

  // ── 背景 ──────────────────────────────────────────
  ctx.fillStyle = BG_COLOR
  ctx.fillRect(0, 0, W, H)

  // ── アイコン（icon.png）を中央上寄りに描画 ─────────
  const iconPath = path.join(ASSETS, 'icon.png')
  const ICON_SIZE = 360
  const iconX = (W - ICON_SIZE) / 2
  const iconY = 80

  if (fs.existsSync(iconPath)) {
    try {
      const img = await loadImage(iconPath)

      // 角丸クリッピング
      const radius = ICON_SIZE * 0.2
      ctx.save()
      ctx.beginPath()
      ctx.moveTo(iconX + radius, iconY)
      ctx.arcTo(iconX + ICON_SIZE, iconY,             iconX + ICON_SIZE, iconY + ICON_SIZE, radius)
      ctx.arcTo(iconX + ICON_SIZE, iconY + ICON_SIZE, iconX,             iconY + ICON_SIZE, radius)
      ctx.arcTo(iconX,             iconY + ICON_SIZE, iconX,             iconY,             radius)
      ctx.arcTo(iconX,             iconY,             iconX + ICON_SIZE, iconY,             radius)
      ctx.closePath()
      ctx.clip()
      ctx.drawImage(img, iconX, iconY, ICON_SIZE, ICON_SIZE)
      ctx.restore()
    } catch (e) {
      console.warn('icon load failed:', e.message)
    }
  }

  // ── "REACH" テキスト ─────────────────────────────
  const textY = iconY + ICON_SIZE + 60

  ctx.fillStyle = ACC_COLOR
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'

  // 太めのサンセリフフォントで描画（システムフォントを使用）
  ctx.font = `bold 110px -apple-system, "Helvetica Neue", Arial, sans-serif`
  ctx.letterSpacing = '12px'
  ctx.fillText('REACH', W / 2, textY)

  // ── 書き出し ──────────────────────────────────────
  if (!fs.existsSync(DIST)) fs.mkdirSync(DIST, { recursive: true })
  const buf = canvas.toBuffer('image/png')
  fs.writeFileSync(path.join(DIST, 'og-image.png'), buf)
  console.log('og-image.png generated (1200x630, canvas)')
}

generate().catch(e => { console.error(e); process.exit(1) })
