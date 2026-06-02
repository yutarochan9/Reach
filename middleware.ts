// Vercel Edge Middleware: bot クローラーに OGP HTML を返す
// Supabase を直接叩いて HTML を生成する（/api/og への内部 fetch は不要）

export const config = {
  matcher: ['/creator/(.*)', '/talk/(.*)'],
}

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://mljnbtgaikilcpjjofsh.supabase.co'
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? 'sb_publishable_Gtl_1E7WDa-H-r7HK5UZNg_I4R8Ta5B'
const BASE = 'https://reachapp.jp'

// /api/og-image でサーバーサイド動的生成した画像を使用
function ogImageUrl(id: string, type: string) {
  return `${BASE}/api/og-image?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export default async function middleware(request: Request): Promise<Response | undefined> {
  const ua = request.headers.get('user-agent') ?? ''

  // 主要 SNS / メッセージアプリのクローラーを検出
  // Line/ は LINE アプリ内ブラウザ(人間)にも含まれるため除外
  // LINE の OGP クローラーは facebookexternalhit を使う
  const isBot = /Twitterbot|facebookexternalhit|LinkedInBot|Discordbot|Slackbot|TelegramBot/i.test(ua)
  if (!isBot) return undefined // 人間は SPA へ通過

  const { pathname } = new URL(request.url)
  const parts = pathname.split('/').filter(Boolean)
  const type = parts[0] // 'creator' | 'talk'
  const id = parts[1]
  if (!type || !id) return undefined

  let name = 'クリエーター'
  let bio = 'Reach でクリエーターをフォローして配信を楽しもう'
  // クリエーターのプロフィールを取得（名前・bio）
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(id)}&select=display_name,bio&limit=1`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    )
    const rows: any[] = await res.json()
    const p = rows?.[0]
    if (p) {
      if (p.display_name) name = p.display_name
      if (p.bio) bio = p.bio
    }
  } catch {}

  // シェア画像の og:image を決定する（優先順位順）
  // ?s=<timestamp>  : 短縮形式（新）。Storage URL を再構築する
  // ?og_img=<url>   : 旧形式（後方互換）
  // なければデフォルトの動的生成カード
  const { searchParams } = new URL(request.url)
  const sParam = searchParams.get('s')
  const ogImgParam = searchParams.get('og_img')
  const image = sParam
    ? `${SUPABASE_URL}/storage/v1/object/public/share-images/${id}-${sParam}.png`
    : ogImgParam ?? ogImageUrl(id, type)

  const pageUrl = type === 'talk' ? `${BASE}/talk/${id}` : `${BASE}/creator/${id}`
  const title = `${name} | Reach`

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(bio)}" />
<meta property="og:image" content="${esc(image)}" />
<meta property="og:url" content="${esc(pageUrl)}" />
<meta property="og:site_name" content="Reach" />
<meta property="og:type" content="profile" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(bio)}" />
<meta name="twitter:image" content="${esc(image)}" />
</head>
<body><a href="${esc(pageUrl)}">${esc(title)}</a></body>
</html>`

  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',  // 動的コンテンツはキャッシュしない
    },
  })
}
