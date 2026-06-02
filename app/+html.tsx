import { ScrollViewStyleReset } from 'expo-router/html'
import type { PropsWithChildren } from 'react'

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="ja">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        {/* viewport-fit=cover でノッチ・Dynamic Island までコンテンツを拡張 */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1.0, user-scalable=no, shrink-to-fit=no, viewport-fit=cover"
        />

        {/* ── ページタイトル・説明 ── */}
        <title>Reach — クリエイターとファンをつなぐ配信プラットフォーム</title>
        <meta name="description" content="Reachは、クリエイターの配信がアルゴリズムに埋もれることなくフォロワー全員に確実に届くプラットフォームです。テキスト・画像・メンバーシップなど多彩な機能でファンとつながろう。" />
        <meta name="keywords" content="Reach,クリエイター,配信,メンバーシップ,ファン,ブロードキャスト" />

        {/* ── OGP（SNSシェア用） ── */}
        <meta property="og:type"        content="website" />
        <meta property="og:site_name"   content="Reach" />
        <meta property="og:title"       content="Reach — クリエイターとファンをつなぐ配信プラットフォーム" />
        <meta property="og:description" content="クリエイターの配信がアルゴリズムに埋もれることなくフォロワー全員に確実に届く。テキスト・画像・メンバーシップなど多彩な機能でファンとつながろう。" />
        <meta property="og:url"         content="https://reachapp.jp/" />
        <meta property="og:image"       content="https://reachapp.jp/og-image.png" />
        <meta property="og:locale"      content="ja_JP" />

        {/* ── Twitter Card ── */}
        <meta name="twitter:card"        content="summary_large_image" />
        <meta name="twitter:title"       content="Reach — クリエイターとファンをつなぐ配信プラットフォーム" />
        <meta name="twitter:description" content="クリエイターの配信がアルゴリズムに埋もれることなくフォロワー全員に確実に届く配信プラットフォーム。" />
        <meta name="twitter:image"       content="https://reachapp.jp/og-image.png" />

        {/* ── canonical ── */}
        <link rel="canonical" href="https://reachapp.jp/" />

        {/* ブラウザのアドレスバー色をアプリのヘッダー色に合わせる */}
        <meta name="theme-color" content="#E0D4C4" />
        {/* ホーム画面に追加したときブラウザUIを非表示にしてアプリ風に */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Reach" />
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" type="image/png" href="/icon.png?v=3" />
        <link rel="apple-touch-icon" href="/icon.png?v=3" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icon.png?v=3" />
        <link rel="apple-touch-icon-precomposed" href="/icon.png?v=3" />
        <ScrollViewStyleReset />
        <style>{`
          html, body, #root {
            height: 100%;
            background-color: #E0D4C4;
          }
        `}</style>
      </head>
      <body>{children}</body>
    </html>
  )
}
