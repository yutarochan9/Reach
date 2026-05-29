// Vercel Node.js Serverless Function: OGP用カード画像を動的生成
// GET /api/og-image?type=talk&id=<creator_id> → 1200×630 PNG

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://mljnbtgaikilcpjjofsh.supabase.co'
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_Gtl_1E7WDa-H-r7HK5UZNg_I4R8Ta5B'

// 日本語フォント（インスタンス内でキャッシュ）
let cachedFont = null
async function getFont() {
  if (cachedFont) return cachedFont
  try {
    const res = await fetch(
      'https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-jp@5.1.0/files/noto-sans-jp-japanese-400-normal.woff',
      { signal: AbortSignal.timeout(5000) }
    )
    if (res.ok) cachedFont = await res.arrayBuffer()
  } catch (_) {}
  return cachedFont
}

// React要素を作るヘルパー（JSX不要）
const REACT_ELEMENT = Symbol.for('react.element')
function h(type, props, ...children) {
  const ch = children.flat().filter(c => c != null && c !== false && c !== '')
  return {
    $$typeof: REACT_ELEMENT,
    type, key: null, ref: null, _owner: null, _store: {},
    props: { ...props, ...(ch.length ? { children: ch.length === 1 ? ch[0] : ch } : {}) },
  }
}

module.exports = async (req, res) => {
  const { id, type = 'creator' } = req.query || {}

  let name = 'クリエーター'
  let avatar = null
  let content = ''

  if (id) {
    // クリエータープロフィール
    try {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(id)}&select=display_name,avatar_url&limit=1`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }, signal: AbortSignal.timeout(4000) }
      )
      const rows = await r.json()
      if (rows?.[0]) { name = rows[0].display_name || name; avatar = rows[0].avatar_url }
    } catch (_) {}

    // 最新配信内容（creator / talk どちらも取得。サブスク限定・下書きは除く）
    try {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/broadcasts?sender_id=eq.${encodeURIComponent(id)}&status=eq.published&is_subscriber_only=eq.false&select=content&order=created_at.desc&limit=5`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }, signal: AbortSignal.timeout(4000) }
      )
      const rows = await r.json()
      if (rows?.length) {
        content = rows
          .map(r => (r.content || '').trim())
          .filter(c => c && c !== '　' && !c.match(/^https?:\/\//))
          .join('\n')
          .slice(0, 150)
      }
    } catch (_) {}
  }

  const fontData = await getFont()

  // アバター画像を base64 で取得（satori は外部URLをサポートしているが
  // タイムアウトや CORS の問題を避けるため data URI に変換して渡す）
  let avatarDataUri = null
  if (avatar) {
    try {
      const r = await fetch(avatar, { signal: AbortSignal.timeout(3000) })
      if (r.ok) {
        const buf = await r.arrayBuffer()
        const b64 = Buffer.from(buf).toString('base64')
        const mime = r.headers.get('content-type') || 'image/jpeg'
        avatarDataUri = `data:${mime};base64,${b64}`
      }
    } catch (_) {}
  }

  // アバター要素（画像ありなら img、なければ頭文字サークル）
  const avatarEl = avatarDataUri
    ? h('img', {
        src: avatarDataUri,
        width: '96', height: '96',
        style: { width: '96px', height: '96px', borderRadius: '50%', objectFit: 'cover' },
      })
    : h('div', {
        style: {
          width: '96px', height: '96px', borderRadius: '50%',
          background: '#B85042', display: 'flex', alignItems: 'center',
          justifyContent: 'center', color: 'white', fontSize: '40px', fontWeight: '700',
        }
      }, name[0] || 'R')

  // カード要素（1200×630 = X/OGP標準サイズ）
  const card = h('div', {
    style: {
      display: 'flex', flexDirection: 'column',
      width: '100%', height: '100%',
      background: '#F5EFE6', padding: '64px',
      fontFamily: fontData ? '"NotoSansJP", sans-serif' : 'sans-serif',
    }
  },
    // ヘッダー（アバター + 名前）
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '24px', marginBottom: '32px' } },
      avatarEl,
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', flex: '1' } },
        h('div', { style: { fontSize: '36px', fontWeight: '700', color: '#1A1A1A' } }, name),
        h('div', { style: { fontSize: '20px', color: '#AAAAAA' } }, 'Reach')
      ),
    ),
    // 区切り線
    h('div', { style: { height: '2px', background: '#F0F0F0', marginBottom: '32px' } }),
    // 本文
    h('div', {
      style: {
        flex: '1', fontSize: '36px', lineHeight: '1.7', color: '#1A1A1A',
        overflow: 'hidden', display: 'flex', flexDirection: 'column',
        justifyContent: content ? 'flex-start' : 'center',
        alignItems: content ? 'flex-start' : 'center',
      }
    }, content || h('span', { style: { fontSize: '28px', color: '#CCCCCC' } }, '配信をチェック')),
    // フッター
    h('div', { style: { display: 'flex', flexDirection: 'column' } },
      h('div', { style: { height: '1px', background: '#EEEEEE', marginBottom: '16px' } }),
      h('div', { style: { fontSize: '18px', color: '#CCCCCC' } }, 'reach-pi-one.vercel.app')
    )
  )

  try {
    // @vercel/og を動的インポート（Node.js CJSからESMパッケージを安全に読み込む）
    const { ImageResponse } = await import('@vercel/og')
    const imgResp = new ImageResponse(card, {
      width: 1200,
      height: 630,
      ...(fontData ? { fonts: [{ name: 'NotoSansJP', data: fontData, weight: 400, style: 'normal' }] } : {}),
    })
    const buffer = Buffer.from(await imgResp.arrayBuffer())
    res.setHeader('content-type', 'image/png')
    res.setHeader('cache-control', 'public, s-maxage=3600, stale-while-revalidate=86400')
    res.send(buffer)
  } catch (err) {
    console.error('og-image error:', err?.message || err)
    res.redirect(302, 'https://reach-pi-one.vercel.app/og-image.png')
  }
}
