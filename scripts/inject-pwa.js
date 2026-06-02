const fs = require('fs')
const path = require('path')

// OGP・PWA 用に icon.png を dist/ ルートにコピー
const iconSrc = path.join(__dirname, '../assets/icon.png')
const iconDst = path.join(__dirname, '../dist/icon.png')
if (fs.existsSync(iconSrc)) {
  fs.copyFileSync(iconSrc, iconDst)
  console.log('icon.png copied to dist/')
}

const indexPath = path.join(__dirname, '../dist/index.html')
if (!fs.existsSync(indexPath)) {
  console.error('dist/index.html not found')
  process.exit(1)
}

let html = fs.readFileSync(indexPath, 'utf8')

// ── PWA タグ ──────────────────────────────────────────────────
const pwaTags = `
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
<meta name="apple-mobile-web-app-title" content="Reach" />
<meta name="mobile-web-app-capable" content="yes" />
<link rel="manifest" href="/manifest.json" />
<link rel="icon" type="image/png" href="/icon.png?v=3" />
<link rel="apple-touch-icon" href="/icon.png?v=3" />
<link rel="apple-touch-icon" sizes="180x180" href="/icon.png?v=3" />
<link rel="apple-touch-icon-precomposed" href="/icon.png?v=3" />
`

// ── SEO / OGP / Google Search Console タグ ───────────────────
const seoTags = `
<meta name="google-site-verification" content="cjp8RdeEPVVaxkI00qfGanWpt78Zcck9RQ__F__Os-g" />
<meta name="description" content="Reachは、クリエイターの配信がアルゴリズムに埋もれることなくフォロワー全員に確実に届くプラットフォームです。テキスト・画像・メンバーシップなど多彩な機能でファンとつながろう。" />
<meta name="keywords" content="Reach,クリエイター,配信,メンバーシップ,ファン,ブロードキャスト" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Reach" />
<meta property="og:title" content="Reach — クリエイターとファンをつなぐ配信プラットフォーム" />
<meta property="og:description" content="クリエイターの配信がアルゴリズムに埋もれることなくフォロワー全員に確実に届く。テキスト・画像・メンバーシップなど多彩な機能でファンとつながろう。" />
<meta property="og:url" content="https://reachapp.jp/" />
<meta property="og:image" content="https://reachapp.jp/og-image.png" />
<meta property="og:locale" content="ja_JP" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="Reach — クリエイターとファンをつなぐ配信プラットフォーム" />
<meta name="twitter:description" content="クリエイターの配信がアルゴリズムに埋もれることなくフォロワー全員に確実に届く配信プラットフォーム。" />
<meta name="twitter:image" content="https://reachapp.jp/og-image.png" />
<link rel="canonical" href="https://reachapp.jp/" />
`

// タイトルを差し替え
html = html.replace('<title>Reach</title>', '<title>Reach — クリエイターとファンをつなぐ配信プラットフォーム</title>')

// lang="en" → lang="ja"
html = html.replace('<html lang="en">', '<html lang="ja">')

if (html.includes('apple-touch-icon')) {
  console.log('PWA tags already present, skipping PWA injection')
} else {
  html = html.replace('</head>', pwaTags + '</head>')
  console.log('PWA tags injected into dist/index.html')
}

if (html.includes('google-site-verification')) {
  console.log('SEO tags already present, skipping SEO injection')
} else {
  html = html.replace('</head>', seoTags + '</head>')
  console.log('SEO/OGP tags injected into dist/index.html')
}

fs.writeFileSync(indexPath, html, 'utf8')
console.log('dist/index.html updated successfully')
