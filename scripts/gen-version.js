/**
 * gen-version.js
 * ビルド時に dist/version.json を生成する。
 * Vercel では VERCEL_GIT_COMMIT_SHA 環境変数が使えるので
 * コミットハッシュをバージョンとして埋め込む。
 * ローカルビルドでは Date.now() をフォールバックとして使用。
 */

const fs = require('fs')
const path = require('path')

const hash =
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ??
  Date.now().toString(36)

const outDir = path.join(__dirname, '..', 'dist')
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })

fs.writeFileSync(
  path.join(outDir, 'version.json'),
  JSON.stringify({ hash }, null, 2)
)

console.log('[gen-version] hash:', hash)
