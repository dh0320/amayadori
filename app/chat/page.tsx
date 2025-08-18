'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { httpsCallable, getFunctions } from 'firebase/functions';
import { auth, db, ensureAnon } from '@/lib/firebase';

const DEFAULT_USER_ICON =
  'https://storage.googleapis.com/amayadori/defaultIcon.png';
const OWNER_ICON =
  'https://storage.googleapis.com/amayadori/cafeownerIcon.png';

const conversationStarters = [
  'おすすめのコーヒーは？',
  'このお店、落ち着きますね',
  '最近、何か良いことありましたか？',
  'どんな音楽を聴くんですか？',
  '雨、いつまで続くんでしょうね',
  'この辺りは静かで良いですね',
  '仕事の悩みを聞いてくれますか？',
  '何か面白い話、ありますか？',
];

type ChatMsg = { id: string; text: string; uid: string; system?: boolean; createdAt?: Timestamp };

export default function ChatPage() {
  const r = useRouter();
  const sp = useSearchParams();
  const roomId = sp.get('room') || '';

  // 自分の表示情報（プロフィール画面で localStorage 保存している想定）
  const [meNick, setMeNick] = useState('あなた');
  const [meIcon, setMeIcon] = useState('');
  const [meProfile, setMeProfile] = useState('...');

  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [draft, setDraft] = useState('');
  const [memberLabel, setMemberLabel] = useState('オーナーとあなた');

  const [doorOpen, setDoorOpen] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // 雨アニメ粒
  const drops = useMemo(
    () =>
      Array.from({ length: 100 }).map((_, i) => {
        const x = Math.random() * 100;
        const delay = Math.random() * 2;
        const duration = 0.5 + Math.random() * 0.5;
        const width = 1 + Math.random() * 2;
        const height = 60 + Math.random() * 40;
        return { i, x, delay, duration, width, height };
      }),
    []
  );

  useEffect(() => {
    (async () => {
      if (!roomId) return;
      await ensureAnon();

      // localStorage から見た目用プロフィール
      try {
        setMeNick(localStorage.getItem('amayadori_nickname') || 'あなた');
        setMeProfile(localStorage.getItem('amayadori_profile') || '...');
        setMeIcon(localStorage.getItem('amayadori_icon') || '');
      } catch {}

      // 参加者表示
      const roomSnap = await getDoc(doc(db, 'rooms', roomId));
      if (roomSnap.exists()) {
        const ms: string[] = (roomSnap.data() as any).members || [];
        if (ms.includes('ownerAI') && ms.length === 2) setMemberLabel('オーナーとあなた');
        else if (ms.length === 2) setMemberLabel('相手とあなた');
        else if (ms.length >= 3) setMemberLabel(`他${ms.length - 1}人とあなた`);
        else setMemberLabel('あなた');
      }

      // メッセージ購読
      const q = query(
        collection(db, 'rooms', roomId, 'messages'),
        orderBy('createdAt', 'asc'),
        limit(200)
      );
      const unsub = onSnapshot(q, (ss) => {
        const list: ChatMsg[] = ss.docs.map((d) => {
          const v = d.data() as any;
          return { id: d.id, text: v.text, uid: v.uid, system: !!v.system, createdAt: v.createdAt };
        });
        setMsgs(list);
      });
      return () => unsub();
    })();
  }, [roomId]);

  function autoResize() {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    if (el.scrollHeight > 120) {
      el.style.overflowY = 'auto';
      el.style.height = '120px';
    } else {
      el.style.overflowY = 'hidden';
      el.style.height = `${el.scrollHeight}px`;
    }
  }

  function threeSuggestions() {
    const s = [...conversationStarters];
    for (let i = s.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [s[i], s[j]] = [s[j], s[i]];
    }
    return s.slice(0, 3);
  }

  async function send() {
    const text = draft.trim();
    if (!text || !roomId) return;
    await ensureAnon();
    const uid = auth.currentUser?.uid!;
    await addDoc(collection(db, 'rooms', roomId, 'messages'), {
      text,
      uid,
      createdAt: serverTimestamp(),
    });
    setDraft('');
    setShowSuggestions(false);
    setTimeout(() => taRef.current?.focus(), 0);
  }

  async function leave() {
    try {
      await ensureAnon();
      await httpsCallable(getFunctions(undefined, 'asia-northeast1'), 'leaveRoom')({ roomId });
    } catch (e) {
      console.error(e);
    }
    setDoorOpen(true);
    setTimeout(() => setDoorOpen(false), 1300);
    setTimeout(() => r.push('/amayadori'), 600);
  }

  return (
    <div className="w-full h-full overflow-hidden">
      {/* 雨 */}
      <div id="rain-container">
        {drops.map((d) => (
          <div
            key={d.i}
            className="rain-drop"
            style={{
              left: `${d.x}%`,
              animationDelay: `${d.delay}s`,
              animationDuration: `${d.duration}s`,
              width: `${d.width}px`,
              height: `${d.height}px`,
            }}
          />
        ))}
      </div>

      {/* ここが重要：globals.css が参照する id 名を /amayadori と完全一致させる */}
      <div id="app-container" className="relative z-10 w-full h-full flex items-center justify-center p-4">
        <div id="chat-screen" className="w-full h-full flex flex-col glass-card">
          {/* ヘッダ */}
          <header className="w-full p-4 border-b border-gray-700/50 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center space-x-3">
              <img className="w-10 h-10 rounded-full object-cover" src={meIcon || DEFAULT_USER_ICON} alt="" />
              <div>
                <p className="font-bold">{meNick}</p>
                <p className="text-xs text-gray-400">{meProfile}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <h2 className="text-lg font-bold">Cafe Amayadori</h2>
                <p className="text-sm text-gray-400">{memberLabel}</p>
              </div>
              <button className="btn-exit" onClick={() => setShowLeaveConfirm(true)}>退室</button>
            </div>
          </header>

          {/* メッセージ */}
          <main id="chat-messages" className="flex-1 p-4 overflow-y-auto flex flex-col space-y-4">
            {/* 最初の演出（実メッセージが無いとき） */}
            {msgs.length === 0 && (
              <div className="flex items-end gap-2 justify-start">
                <img className="w-8 h-8 rounded-full object-cover" src={OWNER_ICON} alt="" />
                <div className="chat-bubble other">
                  <span className="block text-xs font-bold mb-1 text-purple-300">オーナー</span>
                  <p>いらっしゃい。雨宿りかな？</p>
                </div>
              </div>
            )}

            {msgs.map((m) => {
              if (m.system) {
                return (
                  <div key={m.id} className="text-center text-gray-400 text-sm italic my-2">
                    {m.text}
                  </div>
                )
              }
              const isMe = (auth.currentUser?.uid && m.uid === auth.currentUser?.uid) || false
              return (
                <div key={m.id} className={`flex items-end gap-2 ${isMe ? 'justify-end' : 'justify-start'}`}>
                  {!isMe && (
                    <img
                      className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                      src={OWNER_ICON}
                      alt=""
                      onError={(e) => ((e.currentTarget as HTMLImageElement).src = DEFAULT_USER_ICON)}
                    />
                  )}
                  <div className={`chat-bubble ${isMe ? 'me' : 'other'}`}>
                    {!isMe && <span className="block text-xs font-bold mb-1 text-purple-300">相手</span>}
                    <p>{m.text}</p>
                  </div>
                  {isMe && (
                    <img
                      className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                      src={meIcon || DEFAULT_USER_ICON}
                      alt=""
                      onError={(e) => ((e.currentTarget as HTMLImageElement).src = DEFAULT_USER_ICON)}
                    />
                  )}
                </div>
              )
            })}
          </main>

          {/* フッター */}
          <footer className="p-4 flex-shrink-0">
            {showSuggestions && (
              <div id="suggestion-area" className="flex-wrap justify-center gap-2 mb-3 flex">
                {threeSuggestions().map((t) => (
                  <button
                    key={t}
                    className="suggestion-btn"
                    onClick={() => {
                      setDraft(t);
                      setShowSuggestions(false);
                      setTimeout(() => taRef.current?.focus(), 0);
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center space-x-3">
              <textarea
                ref={taRef}
                className="flex-1 px-4 py-3 message-textarea"
                placeholder="メッセージを送信..."
                rows={1}
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  autoResize();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
              />
              <button
                className="w-12 h-12 rounded-full text-white flex items-center justify-center btn-gradient flex-shrink-0"
                onClick={send}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"></line>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                </svg>
              </button>
            </div>
          </footer>
        </div>
      </div>

      {/* 扉 */}
      <div
        id="door-animation"
        className={`fixed inset-0 z-50 flex pointer-events-none ${doorOpen ? 'open' : ''} ${doorOpen ? '' : 'hidden'}`}
      >
        <div className="door left"></div>
        <div className="door right"></div>
      </div>

      {/* 退室確認モーダル */}
      {showLeaveConfirm && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
          <div className="glass-card p-6 w-full max-w-sm text-center space-y-4">
            <p className="text-lg font-semibold">本当に退席しますか？</p>
            <div className="flex gap-3 justify-center">
              <button className="btn-secondary" onClick={() => setShowLeaveConfirm(false)}>いいえ</button>
              <button className="btn-gradient" onClick={async () => { setShowLeaveConfirm(false); await leave(); }}>
                はい
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
