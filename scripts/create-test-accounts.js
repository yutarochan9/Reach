/**
 * テストアカウントのプロフィールを設定するスクリプト
 * node scripts/create-test-accounts.js で実行
 */
const https = require('https')

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'mljnbtgaikilcpjjofsh'
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN
if (!TOKEN) { console.error('❌ SUPABASE_ACCESS_TOKEN 環境変数が必要です'); process.exit(1) }

const accounts = [
  {
    id: 'd192aa4c-3821-40b3-9cf6-d3645d431e77',
    display_name: '運営テスト',
    bio: 'テスト用運営アカウント',
    email: 'reach.test.admin@example.com',
  },
  {
    id: '0075e766-2e0f-4b62-8c0b-5a7cf012ef9a',
    display_name: '配信者テスト',
    bio: 'テスト用配信者アカウント',
    email: 'reach.test.creator@example.com',
  },
  {
    id: 'bbee0474-9e54-4fac-8842-d1f5a9a62646',
    display_name: '受信者テスト',
    bio: 'テスト用受信者アカウント',
    email: 'reach.test.fan@example.com',
  },
]

function query(sql) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: sql })
    const req = https.request({
      hostname: 'api.supabase.com',
      path: `/v1/projects/${PROJECT_REF}/database/query`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => resolve(JSON.parse(data)))
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

async function main() {
  for (const acc of accounts) {
    const sql = `UPDATE profiles SET display_name = '${acc.display_name}', bio = '${acc.bio}' WHERE id = '${acc.id}'`
    const result = await query(sql)
    if (result.message) {
      console.error(`❌ ${acc.display_name}: ${result.message}`)
    } else {
      console.log(`✅ ${acc.display_name} (${acc.email})`)
    }
  }
  console.log('\nテストアカウント情報:')
  console.log('─────────────────────────────────')
  for (const acc of accounts) {
    console.log(`【${acc.display_name}】`)
    console.log(`  メール: ${acc.email}`)
    console.log(`  PW:     TestPass123!`)
    console.log(`  ID:     ${acc.id}`)
  }
}

main().catch(console.error)
