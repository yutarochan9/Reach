// api/ogp.js — Vercel サーバーレス関数
// メッセージ内のURLからOGP（Open Graph Protocol）メタ情報を取得して返す
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET')

  const { url } = req.query
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'url is required' })
  }

  if (!/^https?:\/\//i.test(url)) {
    return res.status(400).json({ error: 'invalid url' })
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ReachBot/1.0; +https://reach-pi-one.vercel.app)',
      },
      signal: AbortSignal.timeout(5000),
      redirect: 'follow',
    })

    if (!response.ok) {
      return res.status(200).json({})
    }

    const reader = response.body?.getReader()
    if (!reader) return res.status(200).json({})
    let html = ''
    let totalBytes = 0
    const decoder = new TextDecoder()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      html += decoder.decode(value, { stream: true })
      totalBytes += value.byteLength
      if (totalBytes > 100000) break
    }
    reader.cancel().catch(() => {})

    const getMeta = (prop) => {
      const re1 = new RegExp(
        `<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']*)["']`, 'i'
      )
      const re2 = new RegExp(
        `<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${prop}["']`, 'i'
      )
      return (html.match(re1) || html.match(re2))?.[1] ?? null
    }

    const getTitle = () => {
      const og = getMeta('og:title')
      if (og) return og
      const m = html.match(/<title[^>]*>([^<]+)<\/title>/i)
      return m?.[1]?.trim() ?? null
    }

    const result = {
      title:       getTitle(),
      description: getMeta('og:description') ?? getMeta('description'),
      image:       getMeta('og:image'),
      siteName:    getMeta('og:site_name'),
    }

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=600')
    return res.status(200).json(result)
  } catch {
    return res.status(200).json({})
  }
}
