// app/page.tsx
'use client'

import Link from 'next/link'
import { useEffect, useRef } from 'react'
import { Inter, Noto_Serif_JP } from 'next/font/google'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

const notoSerifJP = Noto_Serif_JP({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-noto-serif-jp',
})

export default function Home() {
  const rainRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    // 雨のアニメーション
    const container = rainRef.current
    if (!container) return
    container.innerHTML = '' // 再描画時の二重生成防止

    for (let i = 0; i < 70; i++) {
      const drop = document.createElement('div')
      drop.className = 'rain-drop'
      drop.style.left = `${Math.random() * 100}%`
      drop.style.animationDelay = `${Math.random() * 2}s`
      drop.style.animationDuration = `${1.5 + Math.random()}s`
      container.appendChild(drop)
    }

    // スクロールに応じたフェードイン
    const faders = document.querySelectorAll<HTMLElement>('.fade-in-up')
    const appearOptions = {
      threshold: 0.2,
      rootMargin: '0px 0px -50px 0px',
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return
        entry.target.classList.add('visible')
        observer.unobserve(entry.target)
      })
    }, appearOptions)

    faders.forEach((el) => observer.observe(el))

    return () => {
      observer.disconnect()
      if (container) container.innerHTML = ''
    }
  }, [])

  return (
    <div className={`${inter.variable} ${notoSerifJP.variable} w-full`}>
      {/* グローバルスタイル（HTMLの<style>を移植） */}
      <style jsx global>{`
        body {
          font-family: var(--font-inter), 'Inter', 'Noto Serif JP', serif;
          background-color: #1a202c; /* 深い夜空の色 */
          color: #e2e8f0;
          overflow-x: hidden;
        }
        .font-serif {
          font-family: var(--font-noto-serif-jp), 'Noto Serif JP', serif;
        }
        .glass-effect {
          background: rgba(26, 32, 44, 0.6);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .rain-drop {
          position: absolute;
          bottom: 100%;
          width: 1.5px;
          height: 70px;
          background: linear-gradient(
            to bottom,
            rgba(255, 255, 255, 0),
            rgba(255, 255, 255, 0.3)
          );
          animation: fall 2.5s linear infinite;
        }
        @keyframes fall {
          to {
            transform: translateY(100vh);
          }
        }
        .fade-in-up {
          opacity: 0;
          transform: translateY(20px);
          transition: opacity 0.8s ease-out, transform 0.8s ease-out;
        }
        .fade-in-up.visible {
          opacity: 1;
          transform: translateY(0);
        }
        .text-glow {
          text-shadow: 0 0 8px rgba(199, 210, 254, 0.5),
            0 0 20px rgba(165, 180, 252, 0.3);
        }
      `}</style>

      {/* 背景の雨アニメーション */}
      <div
        ref={rainRef}
        id="rain-container"
        className="fixed top-0 left-0 w-full h-full -z-10 pointer-events-none"
      />

      {/* ヘッダー */}
      <header className="fixed top-0 left-0 w-full p-4 z-50 glass-effect">
        <div className="container mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-serif font-bold text-white">Amayadori</h1>
          {/* ここを /amayadori へのリンクに、文言を「チャットを始める」に変更 */}
          <Link
            href="/amayadori"
            className="bg-indigo-400 text-white font-bold py-2 px-5 rounded-full hover:bg-indigo-500 transition-all duration-300 text-sm"
          >
            チャットを始める
          </Link>
        </div>
      </header>

      <main>
        {/* ファーストビュー */}
        <section className="h-screen w-full flex flex-col justify-center items-center text-center p-4 relative">
          <div className="absolute inset-0 bg-black opacity-30" />
          <div className="z-10">
            <h2 className="text-4xl md:text-6xl font-serif font-bold leading-tight mb-4 text-glow">
              億劫な天気の音が、<br />
              誰かの声に変わる。
            </h2>
            <p className="text-lg md:text-xl text-indigo-100 mb-8 max-w-2xl mx-auto font-serif">
              雨の日、猛暑の日、凍えるような寒い日。<br />
              そんな外出が億劫な日が、見知らぬ誰かとの束の間の出会いの舞台になる。
            </p>
            <a
              href="#pre-register"
              className="bg-white text-gray-800 font-bold py-3 px-8 rounded-full text-lg hover:bg-gray-200 transition-all duration-300 shadow-lg shadow-indigo-500/20"
            >
              事前登録して最新情報を受け取る
            </a>
          </div>
        </section>

        {/* 課題提起セクション */}
        <section className="py-20 md:py-32 px-4">
          <div className="container mx-auto text-center">
            <h3 className="text-3xl md:text-4xl font-serif font-bold mb-12 fade-in-up">
              こんな気持ち、ありませんか？
            </h3>
            <div className="grid md:grid-cols-3 gap-8">
              {/* Card 1 */}
              <div
                className="glass-effect rounded-2xl p-8 fade-in-up"
                style={{ transitionDelay: '100ms' }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="48"
                  height="48"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="mx-auto mb-4 text-indigo-300"
                >
                  <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" />
                  <path d="M8 12h8" />
                  <path d="M12 8v8" />
                </svg>
                <h4 className="text-xl font-bold mb-2 font-serif">退屈な毎日</h4>
                <p className="text-indigo-200">
                  同じことの繰り返し。<br />
                  何か新しい刺激がほしい。
                </p>
              </div>
              {/* Card 2 */}
              <div
                className="glass-effect rounded-2xl p-8 fade-in-up"
                style={{ transitionDelay: '200ms' }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="48"
                  height="48"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="mx-auto mb-4 text-indigo-300"
                >
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
                <h4 className="text-xl font-bold mb-2 font-serif">SNS疲れ</h4>
                <p className="text-indigo-200">
                  「いいね」やフォロワーを気にするのに、<br />
                  少し疲れちゃった。
                </p>
              </div>
              {/* Card 3 */}
              <div
                className="glass-effect rounded-2xl p-8 fade-in-up"
                style={{ transitionDelay: '300ms' }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="48"
                  height="48"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="mx-auto mb-4 text-indigo-300"
                >
                  <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
                  <path d="M8 12h.01" />
                  <path d="M12 12h.01" />
                  <path d="M16 12h.01" />
                </svg>
                <h4 className="text-xl font-bold mb-2 font-serif">
                  誰かと話したい、でも…
                </h4>
                <p className="text-indigo-200">
                  気兼ねなく話したいけど、<br />
                  人間関係は少し面倒。
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 解決策・コンセプト紹介 */}
        <section className="py-20 md:py-32 px-4 bg-black bg-opacity-20">
          <div className="container mx-auto">
            <div className="text-center mb-16">
              <p className="text-indigo-400 font-bold mb-2 fade-in-up">
                OUR CONCEPT
              </p>
              <h3
                className="text-4xl md:text-5xl font-serif font-bold mb-4 fade-in-up"
                style={{ transitionDelay: '100ms' }}
              >
                特別な天気の日、<br className="md:hidden" />
                特別な場所が現れる。
              </h3>
              <p
                className="text-lg text-indigo-200 max-w-3xl mx-auto fade-in-up"
                style={{ transitionDelay: '200ms' }}
              >
                Amayadoriは、あなたの現在地が雨・猛暑・極寒など、
                <br />
                特別な気象条件の時だけアクセスできる、完全匿名のチャットアプリです。
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-10 text-center">
              {/* Feature 1 */}
              <div className="fade-in-up" style={{ transitionDelay: '300ms' }}>
                <div className="w-24 h-24 mx-auto mb-6 rounded-full flex items-center justify-center glass-effect">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="48"
                    height="48"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-indigo-300"
                  >
                    <path d="M21.2 15c.7-1.2 1-2.5.7-3.9-.6-2.4-3.4-4.3-6-4.3-1.4 0-2.7.5-3.8 1.4 1.3-.6 2.8-.9 4.3-.9 2.5 0 4.6 1.7 5.3 4 .3 1 .2 2.1-.1 3.1z" />
                    <path d="M6.5 14.5A2.5 2.5 0 0 0 9 12c0-1.7-1.5-3-3.5-3S2 10.3 2 12c0 1.4 1.1 2.5 2.5 2.5Z" />
                    <path d="M16 22a3 3 0 0 0 3-3c0-1.7-1.5-3-3.5-3s-3.5 1.3-3.5 3c0 1.7 1.5 3 3.5 3Z" />
                    <path d="M22 17a2 2 0 0 0 2-2c0-1.1-.9-2-2-2s-2 .9-2 2c0 1.1.9 2 2 2Z" />
                    <path d="M4.6 18.2A2 2 0 0 0 6 17c0-1.1-.9-2-2-2s-2 .9-2 2c0 1.1.9 2 2 2Z" />
                  </svg>
                </div>
                <h4 className="text-2xl font-serif font-bold mb-2">
                  一期一会の出会い
                </h4>
                <p className="text-indigo-200">
                  天候が変わると、チャットルームは泡のように消える。会話のログも残りません。その瞬間にしかない、儚い繋がりを楽しんで。
                </p>
              </div>
              {/* Feature 2 */}
              <div className="fade-in-up" style={{ transitionDelay: '400ms' }}>
                <div className="w-24 h-24 mx-auto mb-6 rounded-full flex items-center justify-center glass-effect">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="48"
                    height="48"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-indigo-300"
                  >
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    <path d="m9 12 2 2 4-4" />
                  </svg>
                </div>
                <h4 className="text-2xl font-serif font-bold mb-2">
                  心安らぐ匿名性
                </h4>
                <p className="text-indigo-200">
                  プロフィール登録は一切不要。ニックネームは自動で割り振られます。あなたは「傘を忘れた人」や「窓を叩く雨音」になるかもしれません。
                </p>
              </div>
              {/* Feature 3 */}
              <div className="fade-in-up" style={{ transitionDelay: '500ms' }}>
                <div className="w-24 h-24 mx-auto mb-6 rounded-full flex items-center justify-center glass-effect">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="48"
                    height="48"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-indigo-300"
                  >
                    <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
                    <path d="M22 10a3 3 0 0 0-3-3h-2.207a5.502 5.502 0 0 0-10.702.5" />
                  </svg>
                </div>
                <h4 className="text-2xl font-serif font-bold mb-2">
                  同じ状況下の共感
                </h4>
                <p className="text-indigo-200">
                  ここにいるのは、みんな同じ状況を過ごす人たち。「この天気、すごいね」その一言から、自然な会話が始まります。
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* How it Works セクション */}
        <section className="py-20 md:py-32 px-4">
          <div className="container mx-auto">
            <div className="text-center mb-16">
              <h3 className="text-3xl md:text-4xl font-serif font-bold fade-in-up">
                Amayadoriの始め方
              </h3>
            </div>
            <div className="flex flex-col md:flex-row justify-center items-center gap-8 md:gap-16">
              <div className="w-full md:w-1/3 max-w-xs fade-in-up">
                <img
                  src="https://image.pollinations.ai/prompt/A%20beautiful%20anime-style%20mockup%20of%20a%20smartphone.%20On%20the%20screen%20is%20a%20minimalist%20chat%20app%20with%20a%20dark%20theme.%20Through%20a%20window%20behind%20the%20phone,%20you%20can%20see%20a%20city%20street%20at%20night%20with%20rain%20streaking%20down%20the%20glass.%20glowing%20neon%20signs%20are%20reflected%20in%20the%20puddles.%20cinematic,%20moody,%20lo-fi%20aesthetic,%20digital%20art?model=flux&w=512&h=800&seed=123"
                  alt="雨の日の夜にチャットアプリを開いたスマートフォンのイラスト"
                  className="rounded-3xl shadow-2xl shadow-indigo-900/40"
                />
              </div>
              <div className="w-full md:w-1/2">
                <ol className="space-y-8">
                  <li
                    className="flex items-start fade-in-up"
                    style={{ transitionDelay: '100ms' }}
                  >
                    <div className="text-3xl font-bold font-serif text-indigo-400 mr-6">
                      1.
                    </div>
                    <div>
                      <h4 className="text-xl font-bold font-serif mb-1">
                        特別な天気を待つ
                      </h4>
                      <p className="text-indigo-200">
                        アプリが使えるのは特別な天気の日だけ。通知をONにしておけば、その時にお知らせします。
                      </p>
                    </div>
                  </li>
                  <li
                    className="flex items-start fade-in-up"
                    style={{ transitionDelay: '200ms' }}
                  >
                    <div className="text-3xl font-bold font-serif text-indigo-400 mr-6">
                      2.
                    </div>
                    <div>
                      <h4 className="text-xl font-bold font-serif mb-1">
                        シェルターへ
                      </h4>
                      <p className="text-indigo-200">
                        アプリを開くと、同じ状況の人が集う「シェルター」に自動で案内されます。
                      </p>
                    </div>
                  </li>
                  <li
                    className="flex items-start fade-in-up"
                    style={{ transitionDelay: '300ms' }}
                  >
                    <div className="text-3xl font-bold font-serif text-indigo-100 mr-6">
                      3.
                    </div>
                    <div>
                      <h4 className="text-xl font-bold font-serif mb-1">
                        束の間の会話を楽しむ
                      </h4>
                      <p className="text-indigo-200">
                        同じ空の下にいる誰かと、他愛もない話を。普段は言えない本音も、ここなら話せるかも。
                      </p>
                    </div>
                  </li>
                  <li
                    className="flex items-start fade-in-up"
                    style={{ transitionDelay: '400ms' }}
                  >
                    <div className="text-3xl font-bold font-serif text-indigo-400 mr-6">
                      4.
                    </div>
                    <div>
                      <h4 className="text-xl font-bold font-serif mb-1">
                        そして、天気は変わる
                      </h4>
                      <p className="text-indigo-200">
                        天候が穏やかになると、チャットルームは自動的に閉じられます。「また、次の特別な天気の日に」
                      </p>
                    </div>
                  </li>
                </ol>
              </div>
            </div>
          </div>
        </section>

        {/* 料金プランセクション */}
        <section className="py-20 md:py-32 px-4 bg-black bg-opacity-20">
          <div className="container mx-auto">
            <div className="text-center mb-16">
              <h3 className="text-3xl md:text-4xl font-serif font-bold fade-in-up">
                あなたに合った楽しみ方を
              </h3>
              <p
                className="text-lg text-indigo-200 max-w-3xl mx-auto mt-4 fade-in-up"
                style={{ transitionDelay: '100ms' }}
              >
                Amayadoriは、あなたの気分に合わせて3つのスタイルで楽しめます。
              </p>
            </div>
            <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
              {/* Plan 1: Guest */}
              <div
                className="glass-effect rounded-2xl p-8 flex flex-col fade-in-up"
                style={{ transitionDelay: '200ms' }}
              >
                <h4 className="text-2xl font-serif font-bold mb-4">
                  ふらっと立ち寄る
                </h4>
                <p className="text-indigo-200 mb-6 flex-grow">
                  ログイン不要で、今すぐ参加。その場限りの出会いを、最も気軽に。
                </p>
                <ul className="space-y-3 text-left">
                  <li className="flex items-center">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-green-400 mr-3"
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    都度のプロフィール設定
                  </li>
                  <li className="flex items-center">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-green-400 mr-3"
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    リアルタイムマッチング
                  </li>
                  <li className="flex items-center">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-gray-500 mr-3"
                    >
                      <path d="M18 6 6 18" />
                      <path d="m6 6 12 12" />
                    </svg>
                    <span className="text-gray-400">AIとの会話</span>
                  </li>
                  <li className="flex items-center">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-gray-500 mr-3"
                    >
                      <path d="M18 6 6 18" />
                      <path d="m6 6 12 12" />
                    </svg>
                    <span className="text-gray-400">
                      思い出のしおり (AI要約)
                    </span>
                  </li>
                  <li className="flex items-center">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-gray-500 mr-3"
                    >
                      <path d="M18 6 6 18" />
                      <path d="m6 6 12 12" />
                    </svg>
                    <span className="text-gray-400">伝言板機能</span>
                  </li>
                </ul>
                <div className="mt-8 pt-4 border-t border-gray-700">
                  <p className="text-sm text-gray-400">広告が表示されます</p>
                </div>
              </div>

              {/* Plan 2: Free User */}
              <div
                className="glass-effect rounded-2xl p-8 flex flex-col border-2 border-indigo-400 shadow-lg shadow-indigo-500/20 fade-in-up"
                style={{ transitionDelay: '300ms' }}
              >
                <h4 className="text-2xl font-serif font-bold mb-4">
                  いつもの場所へ
                </h4>
                <p className="text-indigo-200 mb-6 flex-grow">
                  無料登録で、あなただけのプロフィールを。マッチングしない時は、カフェオーナーのAIと一息。
                </p>
                <ul className="space-y-3 text-left">
                  <li className="flex items-center">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-green-400 mr-3"
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    プロフィール登録
                  </li>
                  <li className="flex items-center">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-green-400 mr-3"
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    リアルタイムマッチング
                  </li>
                  <li className="flex items-center">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-green-400 mr-3"
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    AIとの会話 (オーナー)
                  </li>
                  <li className="flex items-center">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-gray-500 mr-3"
                    >
                      <path d="M18 6 6 18" />
                      <path d="m6 6 12 12" />
                    </svg>
                    <span className="text-gray-400">
                      思い出のしおり (AI要約)
                    </span>
                  </li>
                  <li className="flex items-center">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-gray-500 mr-3"
                    >
                      <path d="M18 6 6 18" />
                      <path d="m6 6 12 12" />
                    </svg>
                    <span className="text-gray-400">伝言板機能</span>
                  </li>
                </ul>
                <div className="mt-8 pt-4 border-t border-gray-700">
                  <p className="text-sm text-gray-400">広告が表示されます</p>
                </div>
              </div>

              {/* Plan 3: Premium */}
              <div
                className="glass-effect rounded-2xl p-8 flex flex-col fade-in-up"
                style={{ transitionDelay: '400ms' }}
              >
                <h4 className="text-2xl font-serif font-bold mb-4">
                  特別な一席を
                </h4>
                <p className="text-indigo-200 mb-6 flex-grow">
                  広告なしの快適な空間で、全ての機能を。AI要約や伝言板で、儚い出会いを未来へ繋ぐ。
                </p>
                <ul className="space-y-3 text-left">
                  <li className="flex items-center">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-green-400 mr-3"
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    プロフィール登録
                  </li>
                  <li className="flex items-center">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-green-400 mr-3"
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    リアルタイムマッチング
                  </li>
                  <li className="flex items-center">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-green-400 mr-3"
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    AIとの会話 (複数)
                  </li>
                  <li className="flex items-center">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-green-400 mr-3"
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    思い出のしおり (AI要約)
                  </li>
                  <li className="flex items-center">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-green-400 mr-3"
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    伝言板機能
                  </li>
                </ul>
                <div className="mt-8 pt-4 border-t border-gray-700">
                  <p className="text-sm text-green-400 font-bold">広告なし</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 事前登録セクション */}
        <section id="pre-register" className="py-20 md:py-32 px-4">
          <div className="container mx-auto text-center max-w-2xl">
            <h3 className="text-3xl md:text-4xl font-serif font-bold mb-4 fade-in-up">
              次の特別な天気の日に、会いましょう。
            </h3>
            <p
              className="text-lg text-indigo-200 mb-8 fade-in-up"
              style={{ transitionDelay: '100ms' }}
            >
              Amayadoriは現在、最初の特別な天気を待っています。
              <br />
              メールアドレスを登録して、アプリのリリースや最新情報をいち早く受け取りませんか？
            </p>
            <form
              className="w-full max-w-lg mx-auto flex flex-col sm:flex-row gap-4 fade-in-up"
              style={{ transitionDelay: '200ms' }}
            >
              <input
                type="email"
                placeholder="your.email@example.com"
                required
                className="flex-grow bg-gray-700 border border-gray-600 rounded-full px-6 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all w-full"
              />
              <button
                type="submit"
                className="bg-indigo-500 text-white font-bold py-3 px-8 rounded-full hover:bg-indigo-600 transition-all duration-300 shadow-lg shadow-indigo-500/30 w-full sm:w-auto"
              >
                登録する
              </button>
            </form>
          </div>
        </section>
      </main>

      {/* フッター */}
      <footer className="py-8 px-4">
        <div className="container mx-auto text-center text-sm text-gray-500">
          <p>&copy; 2025 Amayadori Project. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}
