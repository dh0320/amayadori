// app/amayadori/page.tsx
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

const DEFAULT_USER_ICON =
  'https://storage.googleapis.com/dh_character_images/Amayadori/%E3%82%A2%E3%82%A4%E3%82%B3%E3%83%B3%E3%81%AA%E3%81%97.png'
const OWNER_ICON =
  'https://storage.googleapis.com/dh_character_images/Amayadori/%E3%82%AB%E3%83%95%E3%82%A7%E3%82%AA%E3%83%BC%E3%83%8A%E3%83%BC'

const conversationStarters = [
  'おすすめのコーヒーは？',
  'このお店、落ち着きますね',
  '最近、何か良いことありましたか？',
  'どんな音楽を聴くんですか？',
  '雨、いつまで続くんでしょうね',
  'この辺りは静かで良いですね',
  '仕事の悩みを聞いてくれますか？',
  '何か面白い話、ありますか？',
]

type Screen = 'profile' | 'region' | 'waiting' | 'chat'
type Msg = { id: string; text: string; isMe: boolean; nickname?: string; icon?: string }

export default function Page() {
  // 画面・状態
  const [screen, setScreen] = useState<Screen>('profile')
  const [doorOpen, setDoorOpen] = useState(false)

  // プロフィール
  const [userNickname, setUserNickname] = useState('あなた')
  const [userIcon, setUserIcon] = useState<string>('')
  const [userProfile, setUserProfile] = useState('...')

  // 待機
  const [waitingMessage, setWaitingMessage] = useState('マッチング相手を探しています...')
  const [ownerPrompt, setOwnerPrompt] = useState(false)
  const waitingTimerRef = useRef<any>(null)

  // チャット
  const [roomName, setRoomName] = useState('Cafe Amayadori')
  const [userCount, setUserCount] = useState('オーナーとあなた')
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [draft, setDraft] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)

  // オーバーレイ
  const [showInterstitial, setShowInterstitial] = useState(false)
  const [showRewarded, setShowRewarded] = useState(false)
  const [rewardLeft, setRewardLeft] = useState(5)
  const [customAlert, setCustomAlert] = useState<string | null>(null)

  // 雨
  const drops = useMemo(
    () =>
      Array.from({ length: 100 }).map((_, i) => {
        const x = Math.random() * 100
        const delay = Math.random() * 2
        const duration = 0.5 + Math.random() * 0.5
        const width = 1 + Math.random() * 2
        const height = 60 + Math.random() * 40
        return { i, x, delay, duration, width, height }
      }),
    []
  )

  // テキストエリア高さ調整
  const taRef = useRef<HTMLTextAreaElement>(null)
  function autoResize() {
    const el = taRef.current
    if (!el) return
    el.style.height = 'auto'
    if (el.scrollHeight > 120) {
      el.style.overflowY = 'auto'
      el.style.height = '120px'
    } else {
      el.style.overflowY = 'hidden'
      el.style.height = `${el.scrollHeight}px`
    }
  }

  // 扉アニメーション
  function playDoor() {
    setDoorOpen(true)
    setTimeout(() => setDoorOpen(false), 1300)
  }

  // 画面切替（モックと同じ印象のフェードイン）
  function toScreen(next: Screen) {
    setScreen(next) // Reactで描画を切替。フェードはCSSの .fade-in を要素側に付与
  }

  // 画像プレビュー
  function onPickIcon(file?: File) {
    if (!file) {
      setUserIcon('')
      return
    }
    const reader = new FileReader()
    reader.onload = e => setUserIcon(String(e.target?.result || ''))
    reader.readAsDataURL(file)
  }

  // プロフィール送信
  function submitProfile() {
    setUserNickname(n => (n.trim() ? n : '名無しさん'))
    setUserProfile(p => (p.trim() ? p : '...'))
    toScreen('region')
  }

  // マッチング（モック同等：20秒後にオーナー提案）
  function startMatching(region: 'country' | 'global') {
    console.log(`Region selected: ${region}`)
    toScreen('waiting')
    setOwnerPrompt(false)
    if (waitingTimerRef.current) clearTimeout(waitingTimerRef.current)
    waitingTimerRef.current = setTimeout(() => setOwnerPrompt(true), 20000)
  }

  // オーナーと話す（モック同等）
  function startChatWithOwner() {
    if (waitingTimerRef.current) clearTimeout(waitingTimerRef.current)
    setOwnerPrompt(false)
    playDoor()
    setRoomName('Cafe Amayadori')
    setUserCount('オーナーとあなた')
    setTimeout(() => {
      toScreen('chat')
      // ウェルカム＋提案を表示
      setTimeout(() => {
        addOther('いらっしゃい。雨宿りかな？', 'オーナー', OWNER_ICON)
        setTimeout(() => setShowSuggestions(true), 500)
      }, 500)
    }, 600)
  }

  // リワード広告（ダミー）
  function showRewardedAd() {
    if (waitingTimerRef.current) clearTimeout(waitingTimerRef.current)
    setOwnerPrompt(false)
    setShowRewarded(true)
    setRewardLeft(5)
    const timer = setInterval(() => {
      setRewardLeft(v => {
        if (v <= 1) {
          clearInterval(timer)
          setShowRewarded(false)
          waitLonger()
        }
        return v - 1
      })
    }, 1000)
  }
  function waitLonger() {
    setWaitingMessage('もう少し待ってみます...')
    waitingTimerRef.current = setTimeout(() => {
      setWaitingMessage('マッチング相手を探しています...')
      setOwnerPrompt(true)
    }, 20000)
  }

  // インタースティシャル広告（ダミー）
  function showInterstitialAd() { setShowInterstitial(true) }
  function closeInterstitial() {
    setShowInterstitial(false)
    setMsgs([])
    setShowSuggestions(false)
    setDoorOpen(false)
    toScreen('profile')
  }

  // チャット送信（モックのBOT返信）
  function send() {
    const text = draft.trim()
    if (!text) return
    setShowSuggestions(false)
    addMe(text)
    setDraft('')
    setTimeout(() => {
      const replies = [
        'カウンターへどうぞ。何か温かいものでも淹れようか。',
        'ここは時間がゆっくり流れているんだ。ゆっくりしていって。',
        'どんな音楽が好き？リクエストがあればかけるよ。',
        '外の音を聞いていると、落ち着くんだ。'
      ]
      const t = replies[Math.floor(Math.random() * replies.length)]
      addOther(t, 'オーナー', OWNER_ICON)
    }, 800 + Math.random() * 500)
  }
  function addMe(text: string) {
    setMsgs(m => [...m, { id: crypto.randomUUID(), text, isMe: true }])
  }
  function addOther(text: string, nick: string, icon: string) {
    setMsgs(m => [...m, { id: crypto.randomUUID(), text, isMe: false, nickname: nick, icon }])
  }

  // 提案ボタン3つ
  function threeSuggestions() {
    const s = [...conversationStarters]
    for (let i = s.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[s[i], s[j]] = [s[j], s[i]]
    }
    return s.slice(0, 3)
  }

  // 初回：雨のしずくは useMemo で生成済み。追加処理不要
  useEffect(() => { return () => waitingTimerRef.current && clearTimeout(waitingTimerRef.current) }, [])

  return (
    <div className="w-full h-full overflow-hidden">

      {/* 雨のアニメーション用コンテナ */}
      <div id="rain-container">
        {drops.map(d => (
          <div key={d.i} className="rain-drop"
               style={{
                 left: `${d.x}%`, animationDelay: `${d.delay}s`,
                 animationDuration: `${d.duration}s`, width: `${d.width}px`, height: `${d.height}px`
               }} />
        ))}
      </div>

      {/* メインコンテンツ */}
      <div id="app-container" className="relative z-10 w-full h-full flex items-center justify-center p-4">

        {/* プロフィール設定画面 */}
        {screen === 'profile' && (
          <div id="profile-screen" className="w-full max-w-sm">
            <div className="glass-card p-8 text-center space-y-6 fade-in">
              <h1 className="text-3xl font-bold tracking-wider">Amayadori</h1>
              <p className="text-sm text-gray-400">雨がやむまで、少しだけ。</p>
              <div className="flex justify-center">
                <label className="cursor-pointer">
                  <img className="w-28 h-28 rounded-full object-cover border-4 border-dashed border-gray-500 hover:border-gray-400 transition-all"
                       src={userIcon || DEFAULT_USER_ICON} alt="icon preview" />
                  <input type="file" accept="image/*" className="hidden"
                         onChange={e => onPickIcon(e.target.files?.[0] || undefined)} />
                </label>
              </div>
              <input type="text" className="w-full px-4 py-3 input-glass" placeholder="ニックネーム"
                     value={userNickname === 'あなた' ? '' : userNickname}
                     onChange={e => setUserNickname(e.target.value)} />
              <textarea className="w-full px-4 py-3 input-glass h-24 resize-none" placeholder="ひとことプロフィール"
                        value={userProfile === '...' ? '' : userProfile}
                        onChange={e => setUserProfile(e.target.value)} />
              <button onClick={submitProfile}
                      className="w-full text-white font-bold py-3 px-4 rounded-xl btn-gradient">次へ</button>
            </div>
          </div>
        )}

        {/* 国/グローバル選択画面 */}
        {screen === 'region' && (
          <div id="region-selection-screen" className="w-full max-w-sm">
            <div className="glass-card p-8 text-center space-y-6 fade-in">
              <h2 className="text-2xl font-bold">どちらのカフェへ？</h2>
              <p className="text-sm text-gray-400">雨宿りの場所を選んでください。</p>
              <div className="space-y-4">
                <button className="w-full text-white font-bold py-3 px-4 rounded-xl btn-gradient"
                        onClick={() => startMatching('country')}>同じ国の人と</button>
                <button className="w-full text-white font-bold py-3 px-4 rounded-xl btn-secondary"
                        onClick={() => startMatching('global')}>世界中の誰かと</button>

                {/* ネイティブ広告（ダミー） */}
                <div className="p-3 rounded-xl border border-dashed border-yellow-500/50 text-left cursor-pointer hover:bg-yellow-500/10 transition-colors"
                     onClick={() => setCustomAlert('【PR】特別な夜のカフェへのご招待です。詳細はWebサイトをご覧ください。')}>
                  <p className="text-xs text-yellow-500 font-bold">【PR】</p>
                  <p className="font-semibold text-white">星降る夜のカフェへご招待</p>
                  <p className="text-sm text-gray-400">今夜だけの特別な体験を。</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 待機画面 */}
        {screen === 'waiting' && (
          <div id="waiting-screen" className="w-full max-w-sm text-center">
            <div className="glass-card p-8 space-y-6 fade-in">
              <div className="flex justify-center items-center">
                <div className="spinner w-12 h-12 rounded-full border-4"></div>
              </div>
              <h2 id="waiting-message" className="text-2xl font-bold">{waitingMessage}</h2>
              <p className="text-sm text-gray-400">雨の中、誰かが来るのを待っています。</p>

              {ownerPrompt && (
                <div id="owner-prompt-modal" className="fade-in pt-4 mt-4 border-t border-gray-700/50">
                  <p className="mb-4">雨宿りのお客様がいないようです。<br/>カフェのオーナーと話をしますか？</p>
                  <div className="flex flex-col sm:flex-row justify-center gap-4">
                    <button onClick={startChatWithOwner}
                            className="text-white font-bold py-2 px-6 rounded-lg btn-gradient">話す</button>
                    <button onClick={showRewardedAd}
                            className="text-white font-bold py-2 px-6 rounded-lg btn-secondary">広告を見て待つ</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* チャット画面 */}
        {screen === 'chat' && (
          <div id="chat-screen" className="w-full h-full flex flex-col glass-card">
            <header className="w-full p-4 border-b border-gray-700/50 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center space-x-3">
                <img id="header-icon" className="w-10 h-10 rounded-full object-cover"
                     src={userIcon || DEFAULT_USER_ICON} alt="user icon" />
                <div>
                  <p id="header-name" className="font-bold">{userNickname}</p>
                  <p id="header-profile" className="text-xs text-gray-400">{userProfile}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <h2 id="room-name" className="text-lg font-bold">{roomName}</h2>
                  <p id="user-count" className="text-sm text-gray-400">{userCount}</p>
                </div>
                <button id="end-chat-button" className="btn-exit" onClick={showInterstitialAd}>退室</button>
              </div>
            </header>

            <main id="chat-messages" className="flex-1 p-4 overflow-y-auto flex flex-col space-y-4">
              {msgs.map(m => (
                <div key={m.id} className={`flex items-end gap-2 ${m.isMe ? 'justify-end' : 'justify-start'}`}>
                  {!m.isMe && (
                    <img className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                         src={m.icon || OWNER_ICON} alt="" onError={(e:any) => (e.target.src = DEFAULT_USER_ICON)} />
                  )}
                  <div className={`chat-bubble ${m.isMe ? 'me' : 'other'}`}>
                    {!m.isMe && (
                      <span className="block text-xs font-bold mb-1 text-purple-300">{m.nickname || 'オーナー'}</span>
                    )}
                    <p>{m.text}</p>
                  </div>
                  {m.isMe && (
                    <img className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                         src={userIcon || DEFAULT_USER_ICON} alt="" onError={(e:any) => (e.target.src = DEFAULT_USER_ICON)} />
                  )}
                </div>
              ))}
            </main>

            <footer className="p-4 flex-shrink-0">
              {/* 提案の表示 */}
              {showSuggestions && (
                <div id="suggestion-area" className="flex-wrap justify-center gap-2 mb-3 flex">
                  {threeSuggestions().map(t => (
                    <button key={t} className="suggestion-btn" onClick={() => {
                      setDraft(t); setShowSuggestions(false); setTimeout(() => taRef.current?.focus(), 0)
                    }}>{t}</button>
                  ))}
                </div>
              )}
              <div className="flex items-center space-x-3">
                <textarea id="message-input" ref={taRef}
                          className="flex-1 px-4 py-3 message-textarea"
                          placeholder="メッセージを送信..." rows={1}
                          value={draft}
                          onChange={e => { setDraft(e.target.value); autoResize(); }}
                          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
                <button id="send-button"
                        className="w-12 h-12 rounded-full text-white flex items-center justify-center btn-gradient flex-shrink-0"
                        onClick={send}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"
                       viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                       strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"></line>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                  </svg>
                </button>
              </div>
            </footer>
          </div>
        )}
      </div>

      {/* 扉アニメーション用コンテナ */}
      <div id="door-animation"
           className={`fixed inset-0 z-50 flex pointer-events-none ${doorOpen ? 'open' : ''} ${doorOpen ? '' : 'hidden'}`}>
        <div className="door left"></div>
        <div className="door right"></div>
      </div>

      {/* 広告用オーバーレイ（ダミー） */}
      {showInterstitial && (
        <div id="interstitial-ad-screen" className="fixed inset-0 bg-black/80 z-50 flex-col items-center justify-center flex">
          <div className="bg-gray-800 p-4 rounded-lg text-center">
            <p className="text-sm text-gray-400">広告</p>
            <div className="w-72 h-96 bg-gray-700 my-2 flex items-center justify-center">
              <p>インタースティシャル広告（ダミー）</p>
            </div>
            <button id="close-interstitial-ad" className="mt-2 text-sm text-blue-400"
                    onClick={closeInterstitial}>広告を閉じる</button>
          </div>
        </div>
      )}

      {showRewarded && (
        <div id="rewarded-ad-screen" className="fixed inset-0 bg-black/80 z-50 flex-col items-center justify-center flex">
          <div className="glass-card p-8 text-center space-y-4">
            <div className="spinner w-12 h-12 rounded-full border-4 mx-auto"></div>
            <h2 className="text-xl font-bold">リワード広告を視聴中...</h2>
            <p id="reward-timer" className="text-lg">{rewardLeft}</p>
          </div>
        </div>
      )}

      {/* カスタムアラート */}
      {customAlert && (
        <div id="custom-alert" className="fixed inset-0 bg-black/80 z-50 items-center justify-center flex">
          <div className="glass-card p-8 text-center space-y-4 max-w-sm mx-4">
            <p id="custom-alert-message">{customAlert}</p>
            <button id="custom-alert-close" className="mt-4 text-white font-bold py-2 px-6 rounded-lg btn-secondary"
                    onClick={() => setCustomAlert(null)}>閉じる</button>
          </div>
        </div>
      )}
    </div>
  )
}
