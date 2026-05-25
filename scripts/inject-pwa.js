const fs = require('fs')
const path = require('path')

const indexPath = path.join(__dirname, '../dist/index.html')
if (!fs.existsSync(indexPath)) {
  console.error('dist/index.html not found')
  process.exit(1)
}

let html = fs.readFileSync(indexPath, 'utf8')

const tags = `
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
<meta name="apple-mobile-web-app-title" content="Reach" />
<meta name="mobile-web-app-capable" content="yes" />
<link rel="manifest" href="/manifest.json" />
<link rel="apple-touch-icon" href="/icon.png" />
<link rel="apple-touch-icon" sizes="180x180" href="/icon.png" />
<link rel="apple-touch-icon-precomposed" href="/icon.png" />
`

if (html.includes('apple-touch-icon')) {
  console.log('PWA tags already present, skipping')
} else {
  html = html.replace('</head>', tags + '</head>')
  fs.writeFileSync(indexPath, html, 'utf8')
  console.log('PWA tags injected into dist/index.html')
}
