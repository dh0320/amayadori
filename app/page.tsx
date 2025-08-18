// app/page.tsx
import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen grid place-items-center p-8">
      <div className="max-w-xl w-full text-center space-y-6">
        <h1 className="text-3xl font-bold">ようこそ</h1>
        <p>雨宿りモックは <code>/amayadori</code> で表示できます。</p>
        <Link
          href="/amayadori"
          className="inline-block px-6 py-3 rounded-xl text-white bg-black"
        >
          Amayadori を開く
        </Link>
      </div>
    </main>
  )
}
