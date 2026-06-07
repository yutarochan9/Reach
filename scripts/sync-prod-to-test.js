/**
 * sync-prod-to-test.js
 *
 * 本番DBからテストDBへデータをコピーするスクリプト。
 * 本番ユーザーのAuthアカウントをダミーメールで再現し、
 * profiles・broadcasts・follows 等を丸ごとテストDBに同期する。
 *
 * 使い方:
 *   node scripts/sync-prod-to-test.js
 *
 * コピー対象:
 *   - auth.users     (ダミーメールで同じUUIDのユーザーをテストDBに作成)
 *   - profiles       (テストアカウント除外)
 *   - broadcasts     (テストアカウント除外・deleted除外)
 *   - follows        (テストアカウント除外)
 *   - reactions / broadcast_reads / talk_reads
 *   - rich_menus / step_sequences / step_messages / step_enrollments
 *   - subscriptions  (Stripe IDはNULLに)
 *   - feature_flags / announcements
 *
 * コピーしないもの:
 *   - device_sessions / recovery_codes (セキュリティ情報)
 *   - creator_earnings (収益データ)
 *   - reports / contact_messages (個人情報)
 *   - messages / notifications (量が多くプライバシー性が高い)
 */

const https = require('https')

// ── 接続設定 ────────────────────────────────────────────────
// ⚠️ キーは環境変数 or .env.secrets に置いてここには書かない
const MGMT_TOKEN        = process.env.SUPABASE_MGMT_TOKEN        || ''
const PROD_REF          = process.env.SUPABASE_PROD_REF          || 'mljnbtgaikilcpjjofsh'
const TEST_REF          = process.env.SUPABASE_TEST_REF          || 'bvjycjosyofluvmpeumj'
const PROD_SERVICE_KEY  = process.env.SUPABASE_PROD_SERVICE_KEY  || ''
const TEST_SERVICE_KEY  = process.env.SUPABASE_TEST_SERVICE_KEY  || ''

// テストアカウントID（コピー除外）
const TEST_IDS = [
  'd192aa4c-3821-40b3-9cf6-d3645d431e77',
  '0075e766-2e0f-4b62-8c0b-5a7cf012ef9a',
  'bbee0474-9e54-4fac-8842-d1f5a9a62646',
]
const TEST_IDS_SQL = TEST_IDS.map(id => `'${id}'`).join(',')

// ── Management API クエリ ─────────────────────────────────
function query(ref, sql) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: sql })
    const req = https.request({
      hostname: 'api.supabase.com',
      path: `/v1/projects/${ref}/database/query`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MGMT_TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data)
          if (parsed.message) reject(new Error(parsed.message))
          else resolve(parsed)
        } catch (e) {
          reject(new Error(`Parse error: ${data.slice(0, 200)}`))
        }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

// ── Auth Admin API（ユーザー一覧取得） ────────────────────
function getAuthUsers(ref, serviceKey) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: `${ref}.supabase.co`,
      path: '/auth/v1/admin/users?per_page=1000',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey,
      },
    }, res => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data)
          resolve(parsed.users || [])
        } catch (e) {
          reject(new Error(`Auth API parse error: ${data.slice(0, 200)}`))
        }
      })
    })
    req.on('error', reject)
    req.end()
  })
}

// ── Auth Admin API（ユーザー作成） ────────────────────────
function createAuthUser(ref, serviceKey, user) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(user)
    const req = https.request({
      hostname: `${ref}.supabase.co`,
      path: '/auth/v1/admin/users',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        try {
          resolve(JSON.parse(data))
        } catch (e) {
          reject(new Error(`Create user parse error: ${data.slice(0, 200)}`))
        }
      })
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

// ── テーブル同期（DELETE → INSERT） ──────────────────────
async function syncTable({ name, fetchSql, buildInsertSql, label }) {
  console.log(`\n[${label ?? name}] 取得中...`)
  const rows = await query(PROD_REF, fetchSql)
  console.log(`  → ${rows.length} 件取得`)
  if (rows.length === 0) { console.log('  → スキップ（データなし）'); return }

  await query(TEST_REF, `DELETE FROM ${name}`)
  console.log(`  → テストDB cleared`)

  const CHUNK = 500
  let inserted = 0
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    const sql = buildInsertSql(chunk)
    if (sql) { await query(TEST_REF, sql); inserted += chunk.length }
  }
  console.log(`  → ${inserted} 件挿入`)
}

// ── 値エスケープ ─────────────────────────────────────────
function esc(val) {
  if (val === null || val === undefined) return 'NULL'
  if (typeof val === 'boolean') return val ? 'true' : 'false'
  if (typeof val === 'number') return String(val)
  if (Array.isArray(val)) {
    if (val.length === 0) return 'ARRAY[]::text[]'
    return `ARRAY[${val.map(v => `'${String(v).replace(/'/g, "''")}'`).join(',')}]`
  }
  if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'`
  return `'${String(val).replace(/'/g, "''")}'`
}

// ── メイン ───────────────────────────────────────────────
async function main() {
  console.log('=== 本番 → テスト DB 同期 ===')
  console.log('⚠️  テストDBの既存データはすべて上書きされます。')
  console.log('続行しますか？ (yes / no)')

  // キーボード入力待ち
  const answer = await new Promise(resolve => {
    process.stdin.resume()
    process.stdin.setEncoding('utf8')
    process.stdin.once('data', data => {
      process.stdin.pause()
      resolve(data.trim().toLowerCase())
    })
  })

  if (answer !== 'yes' && answer !== 'y') {
    console.log('キャンセルしました。')
    process.exit(0)
  }

  console.log('\n=== 同期開始 ===')

  try {
    // ────────────────────────────────────────────────────
    // STEP 1: auth.users を同期
    //   本番ユーザーを同じUUIDでテストDBに作成
    //   メールはダミー（{uuid}@test.reach.local）
    //   テストアカウントはスキップ
    // ────────────────────────────────────────────────────
    console.log('\n[auth.users] 本番ユーザーを取得中...')
    const prodUsers = await getAuthUsers(PROD_REF, PROD_SERVICE_KEY)
    const realUsers = prodUsers.filter(u => !TEST_IDS.includes(u.id))
    console.log(`  → ${realUsers.length} 人（テストアカウント除外済み）`)

    // テストDBの既存ユーザー一覧取得
    const testUsers = await getAuthUsers(TEST_REF, TEST_SERVICE_KEY)
    const testUserIds = new Set(testUsers.map(u => u.id))
    console.log(`  → テストDBに既存 ${testUsers.length} 人`)

    let created = 0, skipped = 0
    for (const u of realUsers) {
      if (testUserIds.has(u.id)) { skipped++; continue }
      const result = await createAuthUser(TEST_REF, TEST_SERVICE_KEY, {
        id: u.id,
        email: `${u.id}@test.reach.local`,  // ダミーメール
        email_confirm: true,
        password: 'dummy-cannot-login-' + u.id.slice(0, 8),  // ログイン不可なランダムPW
      })
      if (result.id) created++
      else console.log(`    WARN: ${u.id} → ${JSON.stringify(result).slice(0, 80)}`)
    }
    console.log(`  → 作成: ${created} 人 / スキップ（既存）: ${skipped} 人`)

    // ────────────────────────────────────────────────────
    // STEP 2: profiles
    // ────────────────────────────────────────────────────
    await syncTable({
      name: 'profiles',
      fetchSql: `SELECT id, display_name, username, avatar_url, bio, plan, is_admin, is_banned, is_official, is_test, is_private, push_enabled, past_broadcasts_visible, created_at, membership_active, membership_price, membership_description, membership_welcome, membership_benefits, membership_community, membership_close_date, membership_close_message, pinned_broadcast_id, sns_links, tags, notification_settings, escalation_button_enabled FROM profiles WHERE (is_test IS NULL OR is_test = false) ORDER BY created_at`,
      buildInsertSql: rows => {
        const vals = rows.map(r => `(${esc(r.id)},${esc(r.display_name)},${esc(r.username)},${esc(r.avatar_url)},${esc(r.bio)},${esc(r.plan)},${esc(r.is_admin)},${esc(r.is_banned)},${esc(r.is_official)},${esc(r.is_test)},${esc(r.is_private)},${esc(r.push_enabled)},${esc(r.past_broadcasts_visible)},${esc(r.created_at)},${esc(r.membership_active)},${esc(r.membership_price)},${esc(r.membership_description)},${esc(r.membership_welcome)},${esc(r.membership_benefits)},${esc(r.membership_community)},${esc(r.membership_close_date)},${esc(r.membership_close_message)},NULL,${esc(r.sns_links)},${esc(r.tags)},${esc(r.notification_settings)},${esc(r.escalation_button_enabled)})`).join(',')
        // pinned_broadcast_id は broadcasts 挿入後に UPDATE するため一旦 NULL で挿入
        return `INSERT INTO profiles (id,display_name,username,avatar_url,bio,plan,is_admin,is_banned,is_official,is_test,is_private,push_enabled,past_broadcasts_visible,created_at,membership_active,membership_price,membership_description,membership_welcome,membership_benefits,membership_community,membership_close_date,membership_close_message,pinned_broadcast_id,sns_links,tags,notification_settings,escalation_button_enabled) VALUES ${vals} ON CONFLICT (id) DO NOTHING`
      },
    })

    // ────────────────────────────────────────────────────
    // STEP 3: broadcasts
    // ────────────────────────────────────────────────────
    await syncTable({
      name: 'broadcasts',
      fetchSql: `SELECT id,sender_id,content,status,target,is_subscriber_only,public_reactions,visible_to_new_followers,comments_disabled,scheduled_at,image_url,image_link_url,video_url,group_id,block_order,created_at FROM broadcasts WHERE sender_id NOT IN (${TEST_IDS_SQL}) AND status != 'deleted' ORDER BY created_at`,
      buildInsertSql: rows => {
        const vals = rows.map(r => `(${esc(r.id)},${esc(r.sender_id)},${esc(r.content)},${esc(r.status)},${esc(r.target)},${esc(r.is_subscriber_only)},${esc(r.public_reactions)},${esc(r.visible_to_new_followers)},${esc(r.comments_disabled)},${esc(r.scheduled_at)},${esc(r.image_url)},${esc(r.image_link_url)},${esc(r.video_url)},${esc(r.group_id)},${esc(r.block_order)},${esc(r.created_at)})`).join(',')
        return `INSERT INTO broadcasts (id,sender_id,content,status,target,is_subscriber_only,public_reactions,visible_to_new_followers,comments_disabled,scheduled_at,image_url,image_link_url,video_url,group_id,block_order,created_at) VALUES ${vals} ON CONFLICT (id) DO NOTHING`
      },
    })

    // broadcasts挿入後に pinned_broadcast_id を復元
    console.log('\n[profiles.pinned_broadcast_id] 復元中...')
    const pinnedRows = await query(PROD_REF, `SELECT id, pinned_broadcast_id FROM profiles WHERE pinned_broadcast_id IS NOT NULL AND (is_test IS NULL OR is_test = false)`)
    for (const r of pinnedRows) {
      await query(TEST_REF, `UPDATE profiles SET pinned_broadcast_id = ${esc(r.pinned_broadcast_id)} WHERE id = ${esc(r.id)}`)
    }
    console.log(`  → ${pinnedRows.length} 件復元`)

    // ────────────────────────────────────────────────────
    // STEP 4: follows
    // ────────────────────────────────────────────────────
    await syncTable({
      name: 'follows',
      fetchSql: `SELECT follower_id,following_id,created_at FROM follows WHERE follower_id NOT IN (${TEST_IDS_SQL}) AND following_id NOT IN (${TEST_IDS_SQL}) ORDER BY created_at`,
      buildInsertSql: rows => {
        const vals = rows.map(r => `(${esc(r.follower_id)},${esc(r.following_id)},${esc(r.created_at)})`).join(',')
        return `INSERT INTO follows (follower_id,following_id,created_at) VALUES ${vals} ON CONFLICT (follower_id,following_id) DO NOTHING`
      },
    })

    // ────────────────────────────────────────────────────
    // STEP 5: subscriptions（Stripe IDはNULLに）
    // ────────────────────────────────────────────────────
    await syncTable({
      name: 'subscriptions',
      fetchSql: `SELECT id,subscriber_id,creator_id,status,expires_at,cancel_reason,created_at,updated_at FROM subscriptions WHERE subscriber_id NOT IN (${TEST_IDS_SQL}) AND creator_id NOT IN (${TEST_IDS_SQL}) ORDER BY created_at`,
      buildInsertSql: rows => {
        const vals = rows.map(r => `(${esc(r.id)},${esc(r.subscriber_id)},${esc(r.creator_id)},${esc(r.status)},NULL,${esc(r.expires_at)},${esc(r.cancel_reason)},${esc(r.created_at)},${esc(r.updated_at)})`).join(',')
        return `INSERT INTO subscriptions (id,subscriber_id,creator_id,status,stripe_subscription_id,expires_at,cancel_reason,created_at,updated_at) VALUES ${vals} ON CONFLICT (id) DO NOTHING`
      },
    })

    // ────────────────────────────────────────────────────
    // STEP 6: reactions / broadcast_reads / talk_reads
    // ────────────────────────────────────────────────────
    await syncTable({
      name: 'reactions',
      fetchSql: `SELECT id,broadcast_id,user_id,type,created_at FROM reactions WHERE user_id NOT IN (${TEST_IDS_SQL}) ORDER BY created_at`,
      buildInsertSql: rows => {
        const vals = rows.map(r => `(${esc(r.id)},${esc(r.broadcast_id)},${esc(r.user_id)},${esc(r.type)},${esc(r.created_at)})`).join(',')
        return `INSERT INTO reactions (id,broadcast_id,user_id,type,created_at) VALUES ${vals} ON CONFLICT (id) DO NOTHING`
      },
    })

    await syncTable({
      name: 'broadcast_reads',
      fetchSql: `SELECT broadcast_id,user_id,read_at FROM broadcast_reads WHERE user_id NOT IN (${TEST_IDS_SQL}) ORDER BY read_at`,
      buildInsertSql: rows => {
        const vals = rows.map(r => `(${esc(r.broadcast_id)},${esc(r.user_id)},${esc(r.read_at)})`).join(',')
        return `INSERT INTO broadcast_reads (broadcast_id,user_id,read_at) VALUES ${vals} ON CONFLICT (broadcast_id,user_id) DO NOTHING`
      },
    })

    await syncTable({
      name: 'talk_reads',
      fetchSql: `SELECT user_id,sender_id,last_read_at FROM talk_reads WHERE user_id NOT IN (${TEST_IDS_SQL}) AND sender_id NOT IN (${TEST_IDS_SQL}) ORDER BY last_read_at`,
      buildInsertSql: rows => {
        const vals = rows.map(r => `(${esc(r.user_id)},${esc(r.sender_id)},${esc(r.last_read_at)})`).join(',')
        return `INSERT INTO talk_reads (user_id,sender_id,last_read_at) VALUES ${vals} ON CONFLICT (user_id,sender_id) DO NOTHING`
      },
    })

    // ────────────────────────────────────────────────────
    // STEP 7: rich_menus / step_sequences / step_messages
    // ────────────────────────────────────────────────────
    await syncTable({
      name: 'rich_menus',
      fetchSql: `SELECT id,creator_id,buttons,panel_bg_image,is_active,updated_at FROM rich_menus WHERE creator_id NOT IN (${TEST_IDS_SQL})`,
      buildInsertSql: rows => {
        const vals = rows.map(r => `(${esc(r.id)},${esc(r.creator_id)},'${JSON.stringify(r.buttons).replace(/'/g,"''")}',${esc(r.panel_bg_image)},${esc(r.is_active)},${esc(r.updated_at)})`).join(',')
        return `INSERT INTO rich_menus (id,creator_id,buttons,panel_bg_image,is_active,updated_at) VALUES ${vals} ON CONFLICT (id) DO NOTHING`
      },
    })

    await syncTable({
      name: 'step_sequences',
      fetchSql: `SELECT id,creator_id,name,is_active,created_at FROM step_sequences WHERE creator_id NOT IN (${TEST_IDS_SQL}) ORDER BY created_at`,
      buildInsertSql: rows => {
        const vals = rows.map(r => `(${esc(r.id)},${esc(r.creator_id)},${esc(r.name)},${esc(r.is_active)},${esc(r.created_at)})`).join(',')
        return `INSERT INTO step_sequences (id,creator_id,name,is_active,created_at) VALUES ${vals} ON CONFLICT (id) DO NOTHING`
      },
    })

    await syncTable({
      name: 'step_messages',
      fetchSql: 'SELECT id,sequence_id,content,day_offset,sort_order,created_at FROM step_messages ORDER BY created_at',
      buildInsertSql: rows => {
        const vals = rows.map(r => `(${esc(r.id)},${esc(r.sequence_id)},${esc(r.content)},${esc(r.day_offset)},${esc(r.sort_order)},${esc(r.created_at)})`).join(',')
        return `INSERT INTO step_messages (id,sequence_id,content,day_offset,sort_order,created_at) VALUES ${vals} ON CONFLICT (id) DO NOTHING`
      },
    })

    // ────────────────────────────────────────────────────
    // STEP 8: feature_flags / announcements
    // ────────────────────────────────────────────────────
    await syncTable({
      name: 'feature_flags',
      fetchSql: 'SELECT id,key,enabled,description,target_user_ids,created_at,updated_at FROM feature_flags ORDER BY key',
      buildInsertSql: rows => {
        const vals = rows.map(r => `(${esc(r.id)},${esc(r.key)},${esc(r.enabled)},${esc(r.description)},${esc(r.target_user_ids)},${esc(r.created_at)},${esc(r.updated_at)})`).join(',')
        return `INSERT INTO feature_flags (id,key,enabled,description,target_user_ids,created_at,updated_at) VALUES ${vals} ON CONFLICT (key) DO UPDATE SET enabled=EXCLUDED.enabled, description=EXCLUDED.description`
      },
    })

    await syncTable({
      name: 'announcements',
      fetchSql: 'SELECT id,title,body,tag,created_at FROM announcements ORDER BY created_at',
      buildInsertSql: rows => {
        const vals = rows.map(r => `(${esc(r.id)},${esc(r.title)},${esc(r.body)},${esc(r.tag)},${esc(r.created_at)})`).join(',')
        return `INSERT INTO announcements (id,title,body,tag,created_at) VALUES ${vals} ON CONFLICT (id) DO NOTHING`
      },
    })

    console.log('\n=== 同期完了 ===')
    console.log('本番ユーザーのデータがテストDBにコピーされました。')
    console.log('※ テストDB上で本番ユーザーとしてログインはできません（ダミー認証）。')
    console.log('※ テスト操作はテスト用3アカウントで行ってください。')

  } catch (err) {
    console.error('\n[ERROR]', err.message)
    process.exit(1)
  }
}

main()
