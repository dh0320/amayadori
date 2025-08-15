// app/layout.tsx
import './globals.css'
import type { Metadata } from 'next'
import { Inter, Noto_Serif_JP } from 'next/font/google'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const notoSerif = Noto_Serif_JP({
  weight: ['400','700'],
  subsets: ['latin'],
  variable: '--font-noto-serif-jp'
})

export const metadata: Metadata = {
  title: 'Cafe Amayadori',
  description: '雨がやむまで、少しだけ。',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      {/* 背景・文字色は globals.css で統一。フォント変数はここで一括適用 */}
      <body className={`min-h-screen ${inter.variable} ${notoSerif.variable}`}>
        {children}
      </body>
    </html>
  )
}
