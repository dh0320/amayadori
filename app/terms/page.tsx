// app/terms/page.tsx
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

const LAST_UPDATED = '2025-08-27'

export default function TermsPage() {
  const rainRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    // 雨のアニメーション
    const container = rainRef.current
    if (!container) return
    container.innerHTML = ''
    for (let i = 0; i < 70; i++) {
      const drop = document.createElement('div')
      drop.className = 'rain-drop'
      drop.style.left = `${Math.random() * 100}%`
      drop.style.animationDelay = `${Math.random() * 2}s`
      drop.style.animationDuration = `${1.5 + Math.random()}s`
      container.appendChild(drop)
    }

    // フェードイン
    const faders = document.querySelectorAll<HTMLElement>('.fade-in-up')
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          entry.target.classList.add('visible')
          observer.unobserve(entry.target)
        })
      },
      { threshold: 0.2, rootMargin: '0px 0px -50px 0px' }
    )

    faders.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  return (
    <div className={`${inter.variable} ${notoSerifJP.variable} w-full`}>
      {/* ページ専用グローバルスタイル（ランディングと統一） */}
      <style jsx global>{`
        body {
          font-family: var(--font-inter), 'Inter', 'Noto Serif JP', serif;
          background-color: #1a202c;
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
          border: 1px solid rgba(255, 255, 255, 0.08);
        }
        .rain-drop {
          position: absolute;
          bottom: 100%;
          width: 1.5px;
          height: 70px;
          background: linear-gradient(
            to bottom,
            rgba(255, 255, 255, 0),
            rgba(255, 255, 255, 0.28)
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
          transform: translateY(18px);
          transition: opacity 0.7s ease-out, transform 0.7s ease-out;
        }
        .fade-in-up.visible {
          opacity: 1;
          transform: translateY(0);
        }
        .text-glow {
          text-shadow: 0 0 8px rgba(199, 210, 254, 0.5),
            0 0 20px rgba(165, 180, 252, 0.3);
        }
        .toc a {
          color: #c7d2fe;
        }
        .toc a:hover {
          text-decoration: underline;
        }
        .content h2 {
          scroll-margin-top: 96px; /* 固定ヘッダー分 */
        }
        .content h3 {
          scroll-margin-top: 92px;
        }
        .rule-list li::marker {
          color: #a5b4fc;
          font-weight: 600;
        }
      `}</style>

      {/* 背景 雨 */}
      <div
        ref={rainRef}
        id="rain-container"
        className="fixed top-0 left-0 w-full h-full -z-10 pointer-events-none"
      />

      {/* ヘッダー */}
      <header className="fixed top-0 left-0 w-full p-4 z-50 glass-effect">
        <div className="container mx-auto flex justify-between items-center">
          <Link href="/" className="text-2xl font-serif font-bold text-white">
            Amayadori
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/amayadori"
              className="bg-indigo-400 text-white font-bold py-2 px-5 rounded-full hover:bg-indigo-500 transition-all duration-300 text-sm"
            >
              Amayadoriを始める
            </Link>
            <Link
              href="/#contact"
              className="bg-gray-700/70 text-indigo-100 font-semibold py-2 px-5 rounded-full hover:bg-gray-700 transition-all duration-300 text-sm"
            >
              問い合わせ・要望
            </Link>
          </div>
        </div>
      </header>

      <main className="pt-28 pb-16 px-4">
        {/* ヒーロー */}
        <section className="container mx-auto text-center mb-10 fade-in-up">
          <h1 className="text-4xl md:text-5xl font-serif font-bold text-glow mb-3">
            利用規約
          </h1>
          <p className="text-sm text-indigo-200">最終更新日：{LAST_UPDATED}</p>
        </section>

        {/* 目次 */}
        <section className="container mx-auto max-w-4xl mb-8 fade-in-up">
          <div className="glass-effect rounded-2xl p-6 md:p-8">
            <h2 className="font-serif text-xl md:text-2xl font-bold mb-3">
              目次
            </h2>
            <ol className="toc grid md:grid-cols-2 gap-y-2 list-decimal list-inside text-indigo-100">
              <li><a href="#def">第1条（定義）</a></li>
              <li><a href="#apply">第2条（規約の適用・変更）</a></li>
              <li><a href="#env">第3条（利用環境・位置情報・気象条件）</a></li>
              <li><a href="#account">第4条（アカウント・年齢・管理責任）</a></li>
              <li><a href="#match">第5条（マッチングとチャットの性質）</a></li>
              <li><a href="#paid">第6条（有料プラン・決済）</a></li>
              <li><a href="#ads">第7条（広告・プロモーション）</a></li>
              <li><a href="#rights">第8条（ユーザーコンテンツの権利と利用許諾）</a></li>
              <li><a href="#ban">第9条（禁止行為）</a></li>
              <li><a href="#ai">第10条（AI機能の特則）</a></li>
              <li><a href="#change">第11条（サービスの変更・中断・終了）</a></li>
              <li><a href="#dispute">第12条（ユーザー間の紛争）</a></li>
              <li><a href="#disclaimer">第13条（保証の否認・免責）</a></li>
              <li><a href="#suspend">第14条（利用停止等）</a></li>
              <li><a href="#ip">第15条（知的財産権）</a></li>
              <li><a href="#assign">第16条（権利義務の譲渡）</a></li>
              <li><a href="#antisocial">第17条（反社会的勢力の排除）</a></li>
              <li><a href="#law">第18条（準拠法・裁判管轄）</a></li>
              <li><a href="#contact">第19条（連絡先）</a></li>
            </ol>
          </div>
        </section>

        {/* 本文 */}
        <section className="container mx-auto max-w-4xl content">
          <article className="glass-effect rounded-2xl p-6 md:p-10 leading-relaxed text-indigo-100">
            <p className="mb-6">
              本規約は、Amayadori（以下「本サービス」）の提供条件および本サービスの利用に関する
              〔事業者名：＿＿＿＿（以下「当社」）〕と利用者（以下「ユーザー」）との間の権利義務関係を定めるものです。
              本サービスを利用した時点で、本規約に同意したものとみなします。
            </p>

            <h2 id="def" className="font-serif text-2xl font-bold mt-4 mb-2">
              第1条（定義）
            </h2>
            <ol className="list-decimal list-inside rule-list space-y-1">
              <li>「本サイト」：当社が運営するWebサイトおよび関連ドメイン</li>
              <li>「アプリ」：本サービスのWebアプリ/ネイティブアプリ</li>
              <li>「ゲスト」：ログインせずに利用するユーザー</li>
              <li>「登録ユーザー」：アカウントを作成して利用するユーザー（無料/有料含む）</li>
              <li>「有料プラン」：月額課金その他の有償サービス</li>
              <li>「チャット」：ユーザー間のリアルタイム会話およびAI（カフェオーナー等）との会話機能</li>
              <li>「コンテンツ」：ユーザーが送信・表示するテキスト、画像、スタンプ、ニックネーム等</li>
            </ol>

            <h2 id="apply" className="font-serif text-2xl font-bold mt-8 mb-2">
              第2条（規約の適用・変更）
            </h2>
            <ol className="list-decimal list-inside rule-list space-y-1">
              <li>当社は、必要に応じて本規約を変更できます。変更後の規約は、本サイトでの掲示または当社が適切と判断する方法により周知し、掲示時から効力を生じます。</li>
              <li>重大な変更を行う場合は、相当の周知期間を設けます。</li>
            </ol>

            <h2 id="env" className="font-serif text-2xl font-bold mt-8 mb-2">
              第3条（利用環境・位置情報・気象条件）
            </h2>
            <ol className="list-decimal list-inside rule-list space-y-1">
              <li>本サービスは、ユーザーの位置情報や気象条件（雨天・猛暑・極寒など）をトリガーに、チャットへの入室可否を判断します。</li>
              <li>端末設定で位置情報の提供をオフにした場合、機能の一部または全部が利用できないことがあります。</li>
              <li>気象判定の結果は第三者API等の情報に依存し、正確性・即時性は保証しません。</li>
            </ol>

            <h2 id="account" className="font-serif text-2xl font-bold mt-8 mb-2">
              第4条（アカウント・年齢・管理責任）
            </h2>
            <ol className="list-decimal list-inside rule-list space-y-1">
              <li>ゲストはログイン不要でチャットを開始できます。登録ユーザーは、プロフィールの保存、AIとの会話、決済等の機能を利用できます。</li>
              <li><strong>13歳未満の方は本サービスを利用できません。</strong> 未成年が有料プランを利用する場合、保護者の同意を得てください。</li>
              <li>当社は、虚偽申告・不正行為・本規約違反が確認された場合、利用停止・課金停止・アカウント削除等の措置を行うことがあります。</li>
              <li><strong>（管理責任）</strong> 登録ユーザーは、自己の責任において、本サービスに関するパスワード等のアカウント情報を適切に管理・保管し、第三者に利用させ、または貸与、譲渡、名義変更、売買等をしてはなりません。</li>
              <li><strong>（管理責任）</strong> アカウント情報の管理不十分、使用上の過誤、第三者の使用等によって生じた損害に関する責任は登録ユーザーが負い、当社は一切責任を負いません。</li>
            </ol>

            <h2 id="match" className="font-serif text-2xl font-bold mt-8 mb-2">
              第5条（マッチングとチャットの性質）
            </h2>
            <ol className="list-decimal list-inside rule-list space-y-1">
              <li>本サービスは一期一会の匿名チャット体験を目的とし、会話ログは原則として短時間のみサーバーに一時保存されます（詳細はプライバシーポリシー）。</li>
              <li>同一日の再マッチング回避のため、同日のペア履歴を短期間保持します。</li>
              <li>会話相手がいない場合、AIキャラクター（カフェオーナー等）が会話相手となることがあります。AIの発言は自動生成であり、正確性・完全性を保証しません。</li>
              <li>医療/法律/投資/安全に関わる内容は一般情報にとどまり、専門家への相談・公的窓口の利用を推奨します。</li>
            </ol>

            <h2 id="paid" className="font-serif text-2xl font-bold mt-8 mb-2">
              第6条（有料プラン・決済）
            </h2>
            <ol className="list-decimal list-inside rule-list space-y-1">
              <li>有料プランの内容、料金、課金周期、更新/解約方法は、本サイトに表示するとおりとします。</li>
              <li>決済は〔Stripe等の決済事業者〕を介して行い、ユーザーは当該事業者の利用規約にも同意するものとします。</li>
              <li>月額は自動更新です。次回更新日前までに解約手続を行わない限り、翌期も継続課金されます。</li>
              <li>期間途中の解約・停止に伴う日割り/返金は原則行いません（法令で必要な場合を除く）。</li>
              <li>有料スタンプ・投げ銭等のデジタルコンテンツは性質上、原則として返品不可です。</li>
            </ol>

            <h2 id="ads" className="font-serif text-2xl font-bold mt-8 mb-2">
              第7条（広告・プロモーション）
            </h2>
            <ol className="list-decimal list-inside rule-list space-y-1">
              <li>ゲスト/無料プランでは広告が表示されることがあります。広告の有無・形式は予告なく変更される場合があります。</li>
              <li>第三者広告の内容・リンク先の安全性、有用性、適合性について当社は責任を負いません。</li>
            </ol>

            <h2 id="rights" className="font-serif text-2xl font-bold mt-8 mb-2">
              第8条（ユーザーコンテンツの権利と利用許諾）
            </h2>
            <ol className="list-decimal list-inside rule-list space-y-1">
              <li>コンテンツの著作権はユーザーに帰属します。ただしユーザーは、本サービスの提供・改善・不正防止・法令順守のために必要な範囲で、当社が世界的・無償・サブライセンス可能な利用（保存・複製・翻訳・表示・AI学習のための一時的処理等）を行うことを許諾します。</li>
              <li>当社は、ガイドライン違反・権利侵害のおそれがあるコンテンツを、通知なく削除・非表示にすることがあります。</li>
            </ol>

            <h2 id="ban" className="font-serif text-2xl font-bold mt-8 mb-2">
              第9条（禁止行為）
            </h2>
            <ol className="list-decimal list-inside rule-list space-y-1">
              <li>法令違反、犯罪行為、またはそれらを教唆・助長する行為</li>
              <li>児童を害する内容、差別・嫌がらせ・脅迫・自傷他害の助長、アダルト/わいせつ表現の投稿や要求</li>
              <li>個人情報・機微情報の要求または公開、なりすまし</li>
              <li>スパム、宣伝、勧誘、またはボット等による自動化</li>
              <li>マッチング回避/制限を迂回する行為、リバースエンジニアリング、脆弱性探索</li>
              <li>無断転載・第三者の権利侵害</li>
              <li>サービス運営を妨げる行為、過度の負荷、虚偽申告</li>
              <li>反社会的勢力への利益供与や関与</li>
              <li><strong>個人の連絡先交換の禁止：</strong> 当社の許可なく、本サービス内外を問わず、他のユーザーの連絡先（LINE ID、SNSアカウント、メールアドレス、電話番号等）を聞き出す行為、または自身の連絡先を開示・交換しようとする行為</li>
              <li><strong>外部サービスへの誘導：</strong> 商業目的、宗教・政治活動その他目的を問わず、他のウェブサイトやサービス、チャットツール、コミュニティ等へ誘導する行為</li>
              <li><strong>出会い目的の利用：</strong> 異性交際、わいせつな行為、売春・買春等を目的として本サービスを利用する行為</li>
            </ol>

            <h2 id="ai" className="font-serif text-2xl font-bold mt-8 mb-2">
              第10条（AI機能の特則）
            </h2>
            <ol className="list-decimal list-inside rule-list space-y-1">
              <li>AIは機械学習モデルにより応答を自動生成します。正確性・完全性・最新性・目的適合性は保証されません。</li>
              <li>ユーザーは、AIの出力を自己の責任で検証し、判断・行動してください。</li>
              <li>AI提供事業者の規約・プライバシーポリシーが適用される場合があります。</li>
            </ol>

            <h2 id="change" className="font-serif text-2xl font-bold mt-8 mb-2">
              第11条（サービスの変更・中断・終了）
            </h2>
            <ol className="list-decimal list-inside rule-list space-y-1">
              <li>当社は、天候・システム保守・不具合・法令対応等の理由により、本サービスの全部または一部を変更・中断・終了することができます。</li>
              <li>当社は、変更・中断・終了によりユーザーに生じた損害について、一切の賠償責任を負いません。</li>
            </ol>

            <h2 id="dispute" className="font-serif text-2xl font-bold mt-8 mb-2">
              第12条（ユーザー間の紛争）
            </h2>
            <ol className="list-decimal list-inside rule-list space-y-1">
              <li>本サービスに関連してユーザー間またはユーザーと第三者の間で生じた取引、連絡、紛争等については、ユーザーの責任において処理および解決するものとし、当社はかかる事項について一切責任を負いません。</li>
              <li>ユーザーは、自己の責任において本サービスを利用するものとし、本サービスを利用してなされた一切の行為とその結果について一切の責任を負います。</li>
              <li>当社は、必要と判断した場合に限り、ログの確認・当事者への連絡・利用停止等の措置を講じることがありますが、紛争の解決を保証するものではありません。</li>
            </ol>

            <h2 id="disclaimer" className="font-serif text-2xl font-bold mt-8 mb-2">
              第13条（保証の否認・免責）
            </h2>
            <ol className="list-decimal list-inside rule-list space-y-1">
              <li>当社は、本サービスについて、事実上または法律上の瑕疵がないこと（安全性、信頼性、正確性、完全性、特定目的適合性、セキュリティ等）を明示的にも黙示的にも保証しません。</li>
              <li>当社は、ユーザーの損害（間接損害・特別損害・逸失利益等を含む）について、当社の故意または重過失がある場合を除き、責任を負いません。</li>
              <li>何らかの理由により当社が責任を負う場合でも、その賠償額は直近12ヶ月にユーザーが当社に支払った対価の総額を上限とします。</li>
              <li>本条の規定は、第12条（ユーザー間の紛争）に基づく当社の免責を制限するものではありません。</li>
            </ol>

            <h2 id="suspend" className="font-serif text-2xl font-bold mt-8 mb-2">
              第14条（利用停止等）
            </h2>
            <p>当社は、ユーザーが本規約に違反し、またはそのおそれがあると判断した場合、事前の通知なく、利用停止・コンテンツ削除・アカウント削除等の措置を行うことができます。</p>

            <h2 id="ip" className="font-serif text-2xl font-bold mt-8 mb-2">
              第15条（知的財産権）
            </h2>
            <p>本サービスに関する知的財産権は当社またはライセンサーに帰属します。本サービス上の表示、商号、ロゴ等を無断使用してはなりません。</p>

            <h2 id="assign" className="font-serif text-2xl font-bold mt-8 mb-2">
              第16条（権利義務の譲渡）
            </h2>
            <p>当社は、本サービスに係る事業譲渡等に伴い、本規約上の地位、権利義務を第三者に譲渡できます。ユーザーは、あらかじめこれに同意します。</p>

            <h2 id="antisocial" className="font-serif text-2xl font-bold mt-8 mb-2">
              第17条（反社会的勢力の排除）
            </h2>
            <p>ユーザーは、暴力団等の反社会的勢力に該当せず、関与しないことを表明・保証します。違反が判明した場合、当社は即時に利用停止できます。</p>

            <h2 id="law" className="font-serif text-2xl font-bold mt-8 mb-2">
              第18条（準拠法・裁判管轄）
            </h2>
            <p>本規約は日本法に準拠します。本サービスに関して当社とユーザーの間で紛争が生じた場合、<strong>東京地方裁判所</strong>を第一審の専属的合意管轄裁判所とします。</p>

            <h2 id="contact" className="font-serif text-2xl font-bold mt-8 mb-2">
              第19条（連絡先）
            </h2>
            <p>
              本規約に関するお問い合わせは、〔お問い合わせフォーム / 連絡先メール：＿＿＿＿〕までお願いします。
            </p>

            {/* 参考（任意） */}
            <div className="mt-10 p-4 rounded-xl bg-indigo-900/20 border border-indigo-700/30">
              <p className="text-sm text-indigo-200">
                ※付記（参考）：現在の運用目安 — メッセージは原則最大6時間で自動削除、ルームは最長3時間で終了、同日再マッチ回避履歴は48時間、診断ログは72時間以内に削除（詳細はプライバシーポリシーをご参照ください）。
              </p>
            </div>

            {/* ページ内ナビ */}
            <div className="mt-10 flex flex-col sm:flex-row gap-3">
              <Link
                href="/"
                className="w-full sm:w-auto text-center bg-gray-700/70 hover:bg-gray-700 text-indigo-100 font-semibold py-3 px-6 rounded-full transition-all"
              >
                トップへ戻る
              </Link>
              <Link
                href="/amayadori"
                className="w-full sm:w-auto text-center bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-3 px-6 rounded-full transition-all"
              >
                Amayadoriを始める
              </Link>
            </div>
          </article>
        </section>
      </main>

      {/* フッター */}
      <footer className="py-8 px-4">
        <div className="container mx-auto text-center text-sm text-gray-400 space-y-2">
          <div className="space-x-4">
            <Link href="/terms" className="hover:underline">
              利用規約
            </Link>
            <span className="text-gray-600">/</span>
            <Link href="/privacy" className="hover:underline">
              プライバシーポリシー
            </Link>
          </div>
          <p>&copy; 2025 Amayadori Project. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}
