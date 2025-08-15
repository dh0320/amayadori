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
      {/* 背景・文字色は globals.css で統一 */}
      <body className="min-h-screen">{children}</body>
    </html>
  )
}
