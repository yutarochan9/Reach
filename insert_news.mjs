import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://mljnbtgaikilcpjjofsh.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1sam5idGdhaWtpbGNwampvZnNoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NjExMzI3OCwiZXhwIjoyMDYxNjg5Mjc4fQ.PlaceholderServiceKey'
)

// サービスロールキーが不明なのでManagement API経由でinsert
const items = [
  { title: 'メンバーシップ機能リリース', body: 'クリエイターが月額料金を設定し、ファン向けの限定コンテンツを届けられるメンバーシップ機能をリリースしました。加入者限定の配信も送れます。', tag: '新機能', created_at: '2026-05-15T12:00:00Z' },
  { title: 'リアクション公開機能', body: '配信へのいいねを他のフォロワーにも公開できる機能を実装しました。クリエイターが設定することで、盛り上がりをみんなで共有できます。', tag: '新機能', created_at: '2026-05-19T22:51:00Z' },
  { title: 'まとめて配信', body: '複数のメッセージをひとつの配信としてまとめて送れるようになりました。テキスト・画像を組み合わせたリッチな配信が作れます。', tag: '新機能', created_at: '2026-05-19T23:16:00Z' },
  { title: 'スマホPWA対応', body: 'スマートフォンのホーム画面にReachを追加してネイティブアプリのように使えるPWAに対応しました。', tag: 'アップデート', created_at: '2026-05-21T00:00:00Z' },
  { title: 'プッシュ通知対応', body: 'スマートフォンへのプッシュ通知に対応しました。新着配信をアプリを開かずにすぐ確認できます。', tag: 'アップデート', created_at: '2026-05-23T00:00:00Z' },
  { title: 'セキュリティ強化：デバイス管理', body: '新しい端末でログインした際に管理者の承認が必要になるデバイス管理機能を追加しました。アカウントの不正利用を防止します。', tag: 'アップデート', created_at: '2026-05-26T00:00:00Z' },
  { title: '管理者ダッシュボード強化', body: 'ユーザーランキング（7種類）・KPI統計・振込管理など、運営向け機能を大幅に強化しました。', tag: 'アップデート', created_at: '2026-05-28T00:00:00Z' },
  { title: '通知ベルでお知らせ受信', body: 'Reachからのアップデート情報・重要なお知らせをベル通知で受け取れるようになりました。最新情報タイルからいつでも一覧で確認できます。', tag: '新機能', created_at: '2026-06-01T10:00:00Z' },
]

const { error } = await supabase.from('announcements').insert(items)
if (error) console.error('Error:', error)
else console.log('Inserted', items.length, 'items successfully')
