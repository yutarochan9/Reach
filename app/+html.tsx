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
        {/* ブラウザのアドレスバー色をアプリのヘッダー色に合わせる */}
        <meta name="theme-color" content="#E0D4C4" />
        {/* ホーム画面に追加したときブラウザUIを非表示にしてアプリ風に */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Reach" />
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="icon" type="image/png" href="/icon.png" />
        <link rel="apple-touch-icon" href="/icon.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icon.png" />
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
