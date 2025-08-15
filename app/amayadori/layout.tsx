// app/amayadori/layout.tsx
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Amayadori (雨宿り) - New Design',
  description: '雨がやむまで、少しだけ。',
}

/**
 * ここでは <html>/<body> を描画しません（RootLayout が担当）。
 * 画面の見た目は .theme-amayadori のスコープCSSで以前と同じに保ちます。
 */
export default function AmayadoriLayout({ children }: { children: React.ReactNode }) {
  return (
    <section className="theme-amayadori">
      {children}
    </section>
  )
}
