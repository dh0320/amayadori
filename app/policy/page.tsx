// app/privacy/page.tsx
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

export default function PrivacyPage() {
  const rainRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    // 雨アニメ
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
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return
          e.target.classList.add('visible')
          io.unobserve(e.target)
        })
      },
      { threshold: 0.2, rootMargin: '0px 0px -50px 0px' }
    )
    faders.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  return (
    <div className={`${inter.variable} ${notoSerifJP.variable} w-full`}>
      {/* グローバルスタイル（LPと統一） */}
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
        .content h2,
        .content h3 {
          scroll-margin-top: 96px; /* 固定ヘッダー配慮 */
        }
        .rule-list li::marker {
          color: #a5b4fc;
          font-weight: 600;
        }
        .badge {
          display: inline-block;
          font-size: 12px;
          padding: 2px 8px;
          border-radius: 9999px;
          background: rgba(99, 102, 241, 0.15);
          border: 1px solid rgba(99, 102, 241, 0.35);
          color: #c7d2fe;
        }
      `}</style>

      {/* 背景：雨 */}
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

      {/* 本文 */}
      <main className="pt-28 pb-16 px-4">
        {/* ヒーロー */}
        <section className="container mx-auto text-center mb-10 fade-in-up">
          <h1 className="text-4xl md:text-5xl font-serif font-bold text-glow mb-3">
            プライバシーポリシー
          </h1>
          <p className="text-sm text-indigo-200">
            最終更新日：{LAST_UPDATED}
          </p>
        </section>

        {/* 目次 */}
        <section className="container mx-auto max-w-4xl mb-8 fade-in-up">
          <div className="glass-effect rounded-2xl p-6 md:p-8">
            <h2 className="font-serif text-xl md:text-2xl font-bold mb-3">
              目次
            </h2>
            <ol className="toc grid md:grid-cols-2 gap-y-2 list-decimal list-inside text-indigo-100">
              <li><a href="#intro">1. 総則（目的・適用範囲）</a></li>
              <li><a href="#collect">2. 取得する情報</a></li>
              <li><a href="#purpose">3. 利用目的</a></li>
              <li><a href="#consent">4. 同意・任意性・同意の撤回</a></li>
              <li><a href="#cookies">5. Cookie等の利用</a></li>
              <li><a href="#modules">6. 情報収集モジュール</a></li>
              <li><a href="#thirdparty">7. 第三者提供</a></li>
              <li><a href="#outsource">8. 業務委託と委託先の監督</a></li>
              <li><a href="#crossborder">9. 第三者サービス・越境移転</a></li>
              <li><a href="#retention">10. 保管期間（削除方針）</a></li>
              <li><a href="#security">11. 安全管理措置</a></li>
              <li><a href="#rights">12. 利用者の権利（開示等の請求）</a></li>
              <li><a href="#children">13. 児童・未成年の利用</a></li>
              <li><a href="#links">14. 外部リンク</a></li>
              <li><a href="#changes">15. 本ポリシーの変更</a></li>
              <li><a href="#company">16. 事業者情報・連絡先</a></li>
            </ol>
          </div>
        </section>

        {/* コンテンツ */}
        <section className="container mx-auto max-w-4xl content">
          <article className="glass-effect rounded-2xl p-6 md:p-10 leading-relaxed text-indigo-100">
            <p className="mb-6">
              本プライバシーポリシー（以下「本ポリシー」）は、Amayadori（以下「本サービス」）における
              ユーザーの個人情報・個人関連情報等の取扱いについて定めるものです。〔事業者名：＿＿＿＿（以下「当社」）〕は、
              個人情報の保護に関する法律（以下「個人情報保護法」）その他関連法令・ガイドラインを遵守し、適切な管理・運用に努めます。
            </p>

            <h2 id="intro" className="font-serif text-2xl font-bold mt-4 mb-2">
              1. 総則（目的・適用範囲）
            </h2>
            <ul className="list-disc list-inside space-y-1">
              <li>本ポリシーは、本サイト、Webアプリ、将来提供する関連アプリでの取扱いに適用されます。</li>
              <li>本ポリシーと個別の追加通知・同意画面に相違がある場合は、当該追加通知が優先します。</li>
            </ul>

            <h2 id="collect" className="font-serif text-2xl font-bold mt-8 mb-2">
              2. 取得する情報
            </h2>
            <ol className="list-decimal list-inside rule-list space-y-2">
              <li>
                <span className="badge mr-2">ユーザー入力情報</span>
                ニックネーム、ひとことプロフィール、アイコン画像等（ログインなし利用の場合は端末ローカル保存、登録ユーザーはアカウントに紐づく場合があります）
              </li>
              <li>
                <span className="badge mr-2">チャット内容</span>
                会話テキスト、スタンプ・画像（将来）。本サービスの性質上、会話ログは原則短時間のみサーバーに一時保存されます（詳細は「10. 保管期間」を参照）。
              </li>
              <li>
                <span className="badge mr-2">技術情報</span>
                IPアドレス、ユーザーエージェント、デバイスタイプ、言語設定、リファラ、Cookie/広告識別子等
              </li>
              <li>
                <span className="badge mr-2">位置情報</span>
                入室判定や地域別キューのため、端末設定に基づき、同意の上で現在地情報（緯度経度の概略）を取得する場合があります。
              </li>
              <li>
                <span className="badge mr-2">決済情報</span>
                有料プラン・投げ銭等の決済は決済事業者（例：Stripe）を通じて処理され、カード番号等の機微情報は当社サーバーでは保持しません。
              </li>
              <li>
                <span className="badge mr-2">問い合わせ情報</span>
                お問い合わせ・要望フォームに入力された内容、連絡先、送信時の技術情報
              </li>
            </ol>
            <p className="mt-2 text-sm text-indigo-200">
              ※ Cookieや識別子等の「個人関連情報」は、単独では個人情報に該当しない場合がありますが、他の情報と照合することで個人情報となり得ます。
            </p>

            <h2 id="purpose" className="font-serif text-2xl font-bold mt-8 mb-2">
              3. 利用目的
            </h2>
            <ol className="list-decimal list-inside rule-list space-y-1">
              <li>本サービスの提供・維持・品質向上（マッチング判定、待機キュー運用、チャット、混雑/障害対応、問い合わせ対応等）</li>
              <li>安全・不正対策（スパム/荒らし検知、同日リマッチ回避履歴の保持、違反対応・利用停止処理の実施）</li>
              <li>機能改善・新機能の企画（匿名統計、A/Bテスト、UI/UX改善、AI要約等のチューニングのための一時的処理）</li>
              <li>課金・請求・返金対応、カスタマーサポート、重要なお知らせの送付</li>
              <li>広告配信・計測（無料プラン等での広告表示、利用状況の解析）</li>
              <li>法令遵守、権利保護、紛争対応</li>
            </ol>

            <h2 id="consent" className="font-serif text-2xl font-bold mt-8 mb-2">
              4. 同意・任意性・同意の撤回
            </h2>
            <ul className="list-disc list-inside space-y-1">
              <li>位置情報・通知・広告識別子等の取得は、端末/ブラウザの設定や同意に依存します。提供は任意ですが、機能が制限される場合があります。</li>
              <li>同意はいつでも撤回できます（例：ブラウザ設定の変更、OSの位置情報設定の無効化、Cookie削除等）。撤回前の取扱いの適法性に影響しません。</li>
            </ul>

            <h2 id="cookies" className="font-serif text-2xl font-bold mt-8 mb-2">
              5. Cookie等の利用
            </h2>
            <ul className="list-disc list-inside space-y-1">
              <li>本サービスは、Cookie・ローカルストレージ・類似技術を、ログイン保持、入力補助、混雑制御、利用状況の把握等の目的で利用します。</li>
              <li>ブラウザ設定によりCookieの受入れを拒否/削除できますが、一部機能が正常に動作しない場合があります。</li>
            </ul>

            <h2 id="modules" className="font-serif text-2xl font-bold mt-8 mb-2">
              6. 情報収集モジュール（解析・広告）
            </h2>
            <div className="space-y-3">
              <p>本サービスには、利用状況の分析やサービス改善、広告配信の最適化のため、以下の情報収集モジュールを組み込む場合があります。</p>
              <div className="rounded-xl p-4 bg-indigo-900/20 border border-indigo-700/30">
                <p className="font-semibold">提供者：Google LLC</p>
                <p>サービス：Google Analytics（および必要に応じて Firebase Analytics）</p>
                <p>送信情報：閲覧ページURL、IPアドレス、閲覧日時、ユーザーエージェント、リファラ、Cookie等識別子</p>
                <p>利用目的：利用状況の分析、機能改善、障害解析</p>
                <p>
                  プライバシーポリシー：{' '}
                  <a
                    href="https://policies.google.com/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    https://policies.google.com/privacy
                  </a>
                </p>
                <p>
                  オプトアウト：{' '}
                  <a
                    href="https://tools.google.com/dlpage/gaoptout"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    https://tools.google.com/dlpage/gaoptout
                  </a>
                </p>
              </div>
              <p className="text-sm text-indigo-200">
                ※ 実際に導入しているツールの種類・送信先・送信項目は、バージョンや施策により変動することがあります。主要な変更がある場合は、サイト上で適切に通知します。
              </p>
            </div>

            <h2 id="thirdparty" className="font-serif text-2xl font-bold mt-8 mb-2">
              7. 第三者提供
            </h2>
            <ul className="list-disc list-inside space-y-1">
              <li>当社は、次の場合を除き、個人データを第三者に提供しません。
                <ul className="list-disc ml-6 space-y-1">
                  <li>本人の同意がある場合</li>
                  <li>法令に基づく場合</li>
                  <li>人の生命・身体・財産の保護のために必要で、本人同意を得ることが困難な場合</li>
                  <li>公衆衛生の向上・児童の健全育成のために特に必要で、本人同意を得ることが困難な場合</li>
                  <li>国の機関等への協力が必要で、同意取得により当該事務の遂行に支障を及ぼすおそれがある場合</li>
                  <li>事業承継（合併・会社分割・営業譲渡等）に伴う提供</li>
                </ul>
              </li>
            </ul>

            <h2 id="outsource" className="font-serif text-2xl font-bold mt-8 mb-2">
              8. 業務委託と委託先の監督
            </h2>
            <p>
              当社は、サービス運営・保守・決済・解析等の業務を第三者に委託する場合があります。
              この場合、当社は個人データの安全管理が図られるよう、委託先の適切な選定、契約締結、実施状況の把握・必要な監督を行います。
            </p>

            <h2 id="crossborder" className="font-serif text-2xl font-bold mt-8 mb-2">
              9. 第三者サービス・越境移転
            </h2>
            <div className="space-y-2">
              <p>
                本サービスは、主として<strong>アメリカ合衆国等</strong>に所在するクラウドサービス（例：Google
                Firebase / Google Cloud、Stripe）を利用します。ユーザーは、データがこれらの国外サーバーで
                処理・保存されることに同意するものとします。
              </p>
              <p>
                各国の個人情報保護制度については、個人情報保護委員会が提供する情報をご確認ください：
                <a
                  href="https://www.ppc.go.jp/personalinfo/legal/overseas/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline ml-1"
                >
                  外国における個人情報の保護に関する制度等
                </a>
              </p>
              <ul className="list-disc list-inside space-y-1">
                <li>
                  Google / Firebase：{' '}
                  <a
                    href="https://policies.google.com/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    https://policies.google.com/privacy
                  </a>{' '}
                  ／{' '}
                  <a
                    href="https://firebase.google.com/support/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    https://firebase.google.com/support/privacy
                  </a>
                </li>
                <li>
                  Stripe：{' '}
                  <a
                    href="https://stripe.com/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    https://stripe.com/privacy
                  </a>
                </li>
              </ul>
            </div>

            <h2 id="retention" className="font-serif text-2xl font-bold mt-8 mb-2">
              10. 保管期間（削除方針）
            </h2>
            <div className="space-y-2">
              <p>当社は、利用目的の達成に必要な範囲内でデータを保管し、不要となった場合には速やかに消去等を行います。現時点の目安は以下のとおりです。</p>
              <ul className="list-disc list-inside space-y-1">
                <li>チャットメッセージ：原則<strong>最大6時間</strong>以内に自動削除</li>
                <li>チャットルーム：原則<strong>最長3時間</strong>でルーム終了（以後、順次削除）</li>
                <li>同日再マッチ回避のためのペア履歴：作成から<strong>最大48時間</strong>以内に削除</li>
                <li>診断・運用ログ（気象判定・AI診断等）：原則<strong>72時間</strong>以内に削除</li>
              </ul>
              <p className="text-sm text-indigo-200">
                ※ 違反調査・不正対策・法令遵守のため、必要な範囲で保管期間を延長する場合があります。バックアップ領域からの完全消去には所定の時間を要します。
              </p>
            </div>

            <h2 id="security" className="font-serif text-2xl font-bold mt-8 mb-2">
              11. 安全管理措置
            </h2>
            <ul className="list-disc list-inside space-y-1">
              <li>アクセス制御・認証管理（最小権限・ロール管理）</li>
              <li>通信の暗号化（HTTPS/TLS）、保存時の管理</li>
              <li>クラウド事業者のセキュリティ機能の活用（Firewall、監査ログ等）</li>
              <li>アプリ・データベースのセキュリティルール設定（必要最小限の読み書き）</li>
              <li>不正アクセス・スパム等の検知・遮断の実装</li>
            </ul>
            <p className="text-sm text-indigo-200">
              ※ ただし、インターネット上のセキュリティは絶対ではありません。当社は合理的な範囲で対策を講じますが、すべてのリスクの不存在を保証するものではありません。
            </p>

            <h2 id="rights" className="font-serif text-2xl font-bold mt-8 mb-2">
              12. 利用者の権利（開示等の請求）
            </h2>
            <p>
              ユーザーは、当社が保有する自己の「保有個人データ」について、個人情報保護法に基づき、
              <strong>開示・内容の訂正/追加/削除・利用停止/消去・第三者提供の停止</strong>を求めることができます。
            </p>
            <h3 className="font-serif text-xl font-bold mt-4 mb-1" id="request">
              請求方法・手続
            </h3>
            <ul className="list-disc list-inside space-y-1">
              <li>以下「16. 事業者情報・連絡先」記載の窓口にご連絡ください。所定の本人確認にご協力いただきます。</li>
              <li>開示等の対象が「保有個人データ」に該当しない場合、または法令上応じられない場合があります。</li>
              <li>原則として手数料はいただきませんが、過度・反復的な請求等には実費をご負担いただく場合があります。</li>
            </ul>

            <h2 id="children" className="font-serif text-2xl font-bold mt-8 mb-2">
              13. 児童・未成年の利用
            </h2>
            <ul className="list-disc list-inside space-y-1">
              <li><strong>13歳未満</strong>の方は本サービスを利用できません。</li>
              <li>未成年の方が有料サービスを利用する場合、保護者の同意を得てください。</li>
            </ul>

            <h2 id="links" className="font-serif text-2xl font-bold mt-8 mb-2">
              14. 外部リンク
            </h2>
            <p>
              本サービスには、第三者のサイトやサービスへのリンクが含まれる場合があります。当該第三者による情報の取扱いについて、当社は責任を負いません。各サイトのポリシーをご確認ください。
            </p>

            <h2 id="changes" className="font-serif text-2xl font-bold mt-8 mb-2">
              15. 本ポリシーの変更
            </h2>
            <p>
              当社は、法令・サービス内容の変更等に応じて、本ポリシーを改定することがあります。重要な変更は、本サイトでの掲示その他適切な方法でお知らせします。
            </p>

            <h2 id="company" className="font-serif text-2xl font-bold mt-8 mb-2">
              16. 事業者情報・連絡先
            </h2>
            <p className="mb-2">
              事業者名：〔＿＿＿＿〕
              <br />
              所在地：〔＿＿＿＿〕
              <br />
              個人情報保護管理者：〔＿＿＿＿〕
            </p>
            <p>
              お問い合わせ：{' '}
              <Link href="/#contact" className="underline">
                お問い合わせ・要望フォーム
              </Link>{' '}
              ／ メール：〔contact@example.com〕
            </p>

            {/* 目安表示（利用規約と整合） */}
            <div className="mt-10 p-4 rounded-xl bg-indigo-900/20 border border-indigo-700/30">
              <p className="text-sm text-indigo-200">
                参考（運用目安）：メッセージ最長6時間、ルーム最長3時間、同日再マッチ回避履歴48時間、診断ログ72時間を上限に自動削除を行います（不正/法令対応時を除く）。
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
