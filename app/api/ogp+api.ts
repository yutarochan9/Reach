export async function GET(request: Request) {
  const url = new URL(request.url).searchParams.get('url')
  if (!url) return Response.json({ error: 'no url' }, { status: 400 })

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Twitterbot/1.0' },
      signal: AbortSignal.timeout(5000),
    })
    const html = await res.text()

    const pick = (patterns: RegExp[]) => {
      for (const p of patterns) {
        const m = html.match(p)
        if (m?.[1]) return m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      }
      return ''
    }

    const title = pick([
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i,
      /<title[^>]*>([^<]+)<\/title>/i,
    ])
    const description = pick([
      /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i,
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
    ])
    const image = pick([
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    ])
    const siteName = pick([
      /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:site_name["']/i,
    ])

    // 相対URLを絶対URLに変換
    let imageUrl = image
    if (imageUrl && imageUrl.startsWith('/')) {
      const origin = new URL(url).origin
      imageUrl = origin + imageUrl
    }

    return Response.json({ title, description, image: imageUrl, siteName, url })
  } catch {
    return Response.json({ error: 'failed' }, { status: 500 })
  }
}
