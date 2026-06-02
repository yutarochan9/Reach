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
          .slice(0, 120)
      }
    } catch (_) {}
  }

  const fontData = await getFont()

  // アバター画像を base64 で取得
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
    ? h('div', {
        style: {
          width: '100px', height: '100px', borderRadius: '20px',
          background: '#FFFFFF', display: 'flex', alignItems: 'center',
          justifyContent: 'center', overflow: 'hidden',
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
          flexShrink: '0',
        }
      },
        h('img', {
          src: avatarDataUri,
          width: '100', height: '100',
          style: { width: '100px', height: '100px', objectFit: 'contain' },
        })
      )
    : h('div', {
        style: {
          width: '100px', height: '100px', borderRadius: '20px',
          background: 'linear-gradient(135deg, #B85042 0%, #8B3529 100%)',
          display: 'flex', alignItems: 'center',
          justifyContent: 'center', color: 'white', fontSize: '44px', fontWeight: '700',
          flexShrink: '0',
          boxShadow: '0 4px 16px rgba(184,80,66,0.4)',
        }
      }, name[0] || 'R')

  // カード要素（1200×630 = X/OGP標準サイズ）
  const card = h('div', {
    style: {
      display: 'flex', flexDirection: 'column',
      width: '100%', height: '100%',
      background: '#F5EFE6',
      fontFamily: fontData ? '"NotoSansJP", sans-serif' : 'sans-serif',
      position: 'relative',
      overflow: 'hidden',
    }
  },
    // 上部アクセントバー（細め）
    h('div', {
      style: {
        position: 'absolute', top: '0', left: '0', right: '0',
        height: '6px',
        background: 'linear-gradient(90deg, #B85042 0%, #D4705A 50%, #B85042 100%)',
      }
    }),

    // メインコンテンツエリア
    h('div', {
      style: {
        display: 'flex', flexDirection: 'column', flex: '1',
        padding: '56px 64px 48px 64px',
        gap: '0',
      }
    },
      // ヘッダー（アバター + 名前 + Reachバッジ）
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '24px', marginBottom: '36px' } },
        avatarEl,
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', flex: '1', minWidth: '0' } },
          h('div', {
            style: {
              fontSize: '40px', fontWeight: '700', color: '#1A1A1A',
              overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
            }
          }, name),
          h('div', {
            style: {
              display: 'flex', alignItems: 'center', gap: '8px',
            }
          },
            h('div', {
              style: {
                background: '#B85042', borderRadius: '20px',
                paddingLeft: '14px', paddingRight: '14px',
                paddingTop: '5px', paddingBottom: '5px',
                display: 'flex', alignItems: 'center',
              }
            },
              h('span', { style: { fontSize: '18px', fontWeight: '700', color: '#FFFFFF', letterSpacing: '1px' } }, 'Reach')
            )
          )
        ),
      ),

      // 区切り線
      h('div', {
        style: {
          height: '1px',
          background: 'linear-gradient(90deg, rgba(184,80,66,0.3) 0%, rgba(184,80,66,0.1) 100%)',
          marginBottom: '32px',
        }
      }),

      // 本文エリア
      h('div', {
        style: {
          flex: '1',
          display: 'flex', flexDirection: 'column',
          justifyContent: content ? 'flex-start' : 'center',
          alignItems: content ? 'flex-start' : 'center',
          overflow: 'hidden',
        }
      },
        content
          ? h('div', {
              style: {
                fontSize: '30px', lineHeight: '1.75', color: '#2A2A2A',
                overflow: 'hidden',
                display: '-webkit-box',
              }
            }, content)
          : h('div', {
              style: {
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px',
              }
            },
              h('span', { style: { fontSize: '28px', color: '#B85042', fontWeight: '700' } }, '配信をチェック'),
              h('span', { style: { fontSize: '20px', color: '#AAAAAA' } }, 'reach-pi-one.vercel.app')
            )
      ),
    ),

    // フッター
    h('div', {
      style: {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        paddingLeft: '64px', paddingRight: '64px',
        paddingBottom: '28px',
      }
    },
      h('span', { style: { fontSize: '18px', color: '#BBBBBB' } }, 'reach-pi-one.vercel.app'),
      h('div', {
        style: {
          display: 'flex', alignItems: 'center', gap: '6px',
        }
      },
        h('div', {
          style: {
            width: '8px', height: '8px', borderRadius: '50%',
            background: '#B85042',
          }
        }),
        h('span', { style: { fontSize: '16px', color: '#BBBBBB' } }, 'クリエーターズプラットフォーム')
      )
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
