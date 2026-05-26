// Vercel Serverless Function: OGP HTML を返す
// プロジェクトルートの /api フォルダは vercel.json の outputDirectory に関係なく常にデプロイされる

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://mljnbtgaikilcpjjofsh.supabase.co'
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? 'sb_publishable_Gtl_1E7WDa-H-r7HK5UZNg_I4R8Ta5B'
const BASE = 'https://reach-pi-one.vercel.app'
const REACH_ICON = `${BASE}/icon.png`

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

module.exports = async (req, res) => {
  const { id, type = 'creator' } = req.query
  if (!id) { res.status(404).send('Not found'); return }

  let name = 'クリエーター'
  let bio = 'Reach でクリエーターをフォローして配信を楽しもう'
  let image = REACH_ICON

  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(id)}&select=display_name,bio,avatar_url&limit=1`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    )
    const rows = await r.json()
    const p = rows?.[0]
    if (p) {
      if (p.display_name) name = p.display_name
      if (p.bio) bio = p.bio
      if (p.avatar_url) image = p.avatar_url
    }
  } catch {}

  const pageUrl = type === 'talk' ? `${BASE}/talk/${id}` : `${BASE}/creator/${id}`
  const title = `${name} | Reach`

  res.setHeader('content-type', 'text/html; charset=utf-8')
  res.setHeader('cache-control', 'public, max-age=60')
  res.send(`<!DOCTYPE html>
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
<meta name="twitter:card" content="summary" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(bio)}" />
<meta name="twitter:image" content="${esc(image)}" />
</head>
<body><a href="${esc(pageUrl)}">${esc(title)}</a></body>
</html>`)
}
