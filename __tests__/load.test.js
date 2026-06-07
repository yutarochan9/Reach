/**
 * 負荷テスト / ストレステスト
 * autocannon で Supabase REST API と Vercel フロントエンドに負荷をかける
 *
 * 実行: node __tests__/load.test.js
 */
const autocannon = require('autocannon')

const SUPABASE_URL = 'https://mljnbtgaikilcpjjofsh.supabase.co'
const ANON_KEY = 'sb_publishable_Gtl_1E7WDa-H-r7HK5UZNg_I4R8Ta5B'
const FRONTEND_URL = 'https://reachapp.jp'

// ── 結果表示ヘルパー ──────────────────────────────────────────────────────
function printResult(label, result) {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`📊 ${label}`)
  console.log(`${'='.repeat(60)}`)
  console.log(`  接続数:       ${result.connections}`)
  console.log(`  テスト時間:   ${result.duration}s`)
  console.log(`  総リクエスト: ${result.requests.total}`)
  console.log(`  RPS:          ${result.requests.average.toFixed(1)} req/s`)
  console.log(`  レイテンシ平均: ${result.latency.mean.toFixed(1)} ms`)
  console.log(`  レイテンシ p99: ${result.latency.p99} ms`)
  console.log(`  2xx:          ${result['2xx']}`)
  console.log(`  エラー:       ${result.errors}`)
  console.log(`  タイムアウト: ${result.timeouts}`)

  // 判定
  const ok = result.errors === 0 && result.latency.p99 < 3000
  console.log(`  判定: ${ok ? '✅ PASS' : '❌ FAIL（エラーあり or p99 > 3000ms）'}`)
}

async function runTest(label, opts) {
  console.log(`\n🚀 開始: ${label}`)
  return new Promise((resolve) => {
    const instance = autocannon({ ...opts, setupClient: undefined }, (err, result) => {
      if (err) { console.error(err); resolve(null); return }
      printResult(label, result)
      resolve(result)
    })
    autocannon.track(instance, { renderProgressBar: true })
  })
}

async function main() {
  console.log('='.repeat(60))
  console.log('Reach 負荷テスト / ストレステスト')
  console.log('='.repeat(60))

  // ── 1. 負荷テスト: フロントエンド（通常負荷） ─────────────────────────
  await runTest('負荷テスト: フロントエンド（10並列 × 10秒）', {
    url: FRONTEND_URL,
    connections: 10,
    duration: 10,
  })

  // ── 2. 負荷テスト: Supabase REST API（broadcasts 取得） ───────────────
  await runTest('負荷テスト: Supabase broadcasts API（10並列 × 10秒）', {
    url: `${SUPABASE_URL}/rest/v1/broadcasts?select=id,content,created_at&status=eq.published&limit=20`,
    connections: 10,
    duration: 10,
    headers: {
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${ANON_KEY}`,
    },
  })

  // ── 3. 負荷テスト: Supabase profiles API ────────────────────────────
  await runTest('負荷テスト: Supabase profiles API（10並列 × 10秒）', {
    url: `${SUPABASE_URL}/rest/v1/profiles?select=id,display_name,avatar_url&limit=20`,
    connections: 10,
    duration: 10,
    headers: {
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${ANON_KEY}`,
    },
  })

  // ── 4. ストレステスト: フロントエンド（高負荷） ───────────────────────
  await runTest('ストレステスト: フロントエンド（50並列 × 15秒）', {
    url: FRONTEND_URL,
    connections: 50,
    duration: 15,
  })

  // ── 5. ストレステスト: Supabase API（高負荷） ────────────────────────
  await runTest('ストレステスト: Supabase API（50並列 × 15秒）', {
    url: `${SUPABASE_URL}/rest/v1/broadcasts?select=id,content&status=eq.published&limit=10`,
    connections: 50,
    duration: 15,
    headers: {
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${ANON_KEY}`,
    },
  })

  console.log('\n✅ 全テスト完了')
}

main().catch(console.error)
