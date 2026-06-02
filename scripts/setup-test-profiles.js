/**
 * テストアカウントに架空プロフィールデータを適用するスクリプト
 * node scripts/setup-test-profiles.js で実行
 */
const https = require('https')

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'mljnbtgaikilcpjjofsh'
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN
if (!TOKEN) { console.error('❌ SUPABASE_ACCESS_TOKEN 環境変数が必要です'); process.exit(1) }

// ─── 架空プロフィールデータ ────────────────────────────────────────────────

const profiles = [
  {
    // ── 運営テスト ──────────────────────────────────────────
    id: 'd192aa4c-3821-40b3-9cf6-d3645d431e77',
    fields: {
      display_name: '運営テスト',
      username: 'reach_admin_test',
      bio: 'Reach公式の運営アカウント（テスト用）',
      plan: 'pro',
      is_official: true,
      is_admin: true,
      past_broadcasts_visible: true,
      sns_links: JSON.stringify({ twitter: 'https://twitter.com/reach_official', instagram: '' }),
      notification_settings: JSON.stringify({ push: true, email: true }),
      // KYC
      kyc_dob_year: 1990,
      kyc_dob_month: 4,
      kyc_dob_day: 1,
      kyc_phone: '09000000001',
      kyc_postal_code: '1000001',
      kyc_address_state: '東京都',
      kyc_address_city: '千代田区',
      kyc_address_line1: '千代田1-1-1',
    },
  },
  {
    // ── 配信者テスト ────────────────────────────────────────
    id: '0075e766-2e0f-4b62-8c0b-5a7cf012ef9a',
    fields: {
      display_name: '配信者テスト',
      username: 'reach_creator_test',
      bio: 'テスト用の配信者アカウントです。料理・旅行・日常を発信しています🍳✈️',
      plan: 'standard',
      is_official: false,
      is_admin: false,
      past_broadcasts_visible: true,
      membership_active: true,
      membership_price: 500,
      membership_description: '月500円でメンバー限定コンテンツをお届けします！',
      membership_welcome: 'メンバーになってくれてありがとうございます！限定配信を楽しんでください✨',
      membership_benefits: JSON.stringify(['メンバー限定配信', '優先コメント返信', '月1回のZoom交流会']),
      membership_community: true,
      tags: JSON.stringify(['料理', '旅行', '日常']),
      sns_links: JSON.stringify({ twitter: 'https://twitter.com/creator_test', instagram: 'https://instagram.com/creator_test' }),
      notification_settings: JSON.stringify({ push: true, email: true }),
      // 銀行口座（架空）
      bank_name: 'テスト銀行',
      bank_code: '0001',
      bank_branch_name: '渋谷支店',
      bank_branch_code: '001',
      bank_account_type: '普通',
      bank_account_number: '1234567',
      bank_account_holder: 'ハイシンシャ テスト',
      // KYC
      kyc_dob_year: 1995,
      kyc_dob_month: 8,
      kyc_dob_day: 15,
      kyc_phone: '09000000002',
      kyc_postal_code: '1500001',
      kyc_address_state: '東京都',
      kyc_address_city: '渋谷区',
      kyc_address_line1: '渋谷2-2-2',
      // Stripe Connect（テスト用ダミー値）
      stripe_connect_onboarded: false,
    },
  },
  {
    // ── 受信者テスト ────────────────────────────────────────
    id: 'bbee0474-9e54-4fac-8842-d1f5a9a62646',
    fields: {
      display_name: '受信者テスト',
      username: 'reach_fan_test',
      bio: '色々なクリエイターを応援しています！',
      plan: 'free',
      is_official: false,
      is_admin: false,
      past_broadcasts_visible: false,
      membership_active: false,
      tags: JSON.stringify([]),
      sns_links: JSON.stringify({ twitter: '', instagram: '' }),
      notification_settings: JSON.stringify({ push: true, email: false }),
      // KYC
      kyc_dob_year: 2000,
      kyc_dob_month: 1,
      kyc_dob_day: 10,
      kyc_phone: '09000000003',
      kyc_postal_code: '5300001',
      kyc_address_state: '大阪府',
      kyc_address_city: '大阪市北区',
      kyc_address_line1: '梅田3-3-3',
    },
  },
]

// ─── DB更新処理 ────────────────────────────────────────────────────────────

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
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => resolve(JSON.parse(d)))
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

// PostgreSQL の text[] カラム
const ARRAY_COLS = ['tags', 'membership_benefits']

function buildSetClause(fields) {
  return Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([col, val]) => {
      if (typeof val === 'boolean') return `${col} = ${val}`
      if (typeof val === 'number')  return `${col} = ${val}`
      // text[] 型カラム：JSON配列文字列 → ARRAY['a','b'] 構文へ変換
      if (ARRAY_COLS.includes(col)) {
        const arr = JSON.parse(val)
        if (arr.length === 0) return `${col} = ARRAY[]::text[]`
        const items = arr.map(s => `'${String(s).replace(/'/g, "''")}'`).join(', ')
        return `${col} = ARRAY[${items}]`
      }
      // 文字列 / JSONB
      const escaped = String(val).replace(/'/g, "''")
      return `${col} = '${escaped}'`
    })
    .join(', ')
}

async function main() {
  console.log('テストアカウントにプロフィールを適用中...\n')

  for (const p of profiles) {
    const set = buildSetClause(p.fields)
    const sql = `UPDATE profiles SET ${set} WHERE id = '${p.id}'`
    const result = await query(sql)

    if (result.message) {
      console.error(`❌ ${p.fields.display_name}: ${result.message}`)
    } else {
      console.log(`✅ ${p.fields.display_name}`)
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('テストアカウント一覧（ローカル: localhost:8081）')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  const info = [
    { role: '🏢 運営',   email: 'reach.test.admin@example.com',   note: 'is_admin=true / plan=pro' },
    { role: '📡 配信者', email: 'reach.test.creator@example.com', note: 'plan=standard / メンバーシップあり' },
    { role: '👤 受信者', email: 'reach.test.fan@example.com',     note: 'plan=free / 一般ユーザー' },
  ]
  for (const i of info) {
    console.log(`${i.role}`)
    console.log(`  メール: ${i.email}`)
    console.log(`  PW:     TestPass123!`)
    console.log(`  備考:   ${i.note}`)
    console.log()
  }
}

main().catch(console.error)
