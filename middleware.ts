// Vercel Edge Middleware: bot クローラーに OGP HTML を返す
// 人間ユーザーは undefined を返すことで SPA (index.html) へ通過させる

export const config = {
  matcher: ['/creator/:id*', '/talk/:id*'],
}

export default async function middleware(request: Request): Promise<Response | undefined> {
  const ua = request.headers.get('user-agent') ?? ''

  // 主要 SNS / メッセージアプリのクローラーを検出
  const isBot = /Twitterbot|facebookexternalhit|LinkedInBot|Discordbot|Slackbot|TelegramBot|WhatsApp|line\//i.test(ua)
  if (!isBot) return undefined // 人間は SPA へ通過

  const { pathname, origin } = new URL(request.url)
  const parts = pathname.split('/').filter(Boolean)
  const type = parts[0] // 'creator' | 'talk'
  const id = parts[1]
  if (!type || !id) return undefined

  try {
    const res = await fetch(`${origin}/api/og?type=${type}&id=${id}`)
    const html = await res.text()
    return new Response(html, {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'public, max-age=60',
      },
    })
  } catch {
    return undefined
  }
}
