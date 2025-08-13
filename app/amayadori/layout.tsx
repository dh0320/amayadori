// app/amayadori/layout.tsx
import type { Metadata } from 'next'
import { Inter, Noto_Serif_JP } from 'next/font/google'
import './amayadori.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const noto = Noto_Serif_JP({ weight: ['400','700'], subsets: ['latin'], variable: '--font-noto-serif-jp' })

export const metadata: Metadata = {
  title: 'Amayadori (雨宿り) - New Design',
  description: '雨がやむまで、少しだけ。',
}

export default function AmayadoriLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className={`${inter.variable} ${noto.variable}`}>
        {/* このdiv配下にだけスタイルを適用（他ページに影響しない） */}
        <div className="amayadori-root">{children}</div>
      </body>
    </html>
  )
}
