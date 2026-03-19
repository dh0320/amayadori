// app/layout.tsx
import './globals.css'
import type { Metadata } from 'next'
export const metadata: Metadata = {
  title: 'Cafe Amayadori',
  description: '雨がやむまで、少しだけ。',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        {/* AdSense サイト所有権の確認（メタタグ方式） */}
        <meta name="google-adsense-account" content="ca-pub-5996393131507547" />
      </head>
      {/* 背景・文字色・フォントは globals.css で統一 */}
      <body className="min-h-screen">
        {children}
      </body>
    </html>
  )
}
