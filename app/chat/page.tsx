// app/chat/page.tsx
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
  type DocumentData,
} from 'firebase/firestore';
import { httpsCallable, getFunctions } from 'firebase/functions';
import { auth, db, ensureAnon } from '@/lib/firebase';

const DEFAULT_USER_ICON =
  'https://storage.googleapis.com/dh_character_images/Amayadori/%E3%82%A2%E3%82%A4%E3%82%B3%E3%83%B3%E3%81%AA%E3%81%97.png';
const OWNER_ICON =
  'https://storage.googleapis.com/dh_character_images/Amayadori/%E3%82%AB%E3%83%95%E3%82%A7%E3%82%AA%E3%83%BC%E3%83%8A%E3%83%BC';

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

type ChatMsg = {
  id: string;
  text: string;
  uid: string;
  createdAt?: Timestamp;
};

export default function ChatPage() {
  const r = useRouter();
  const params = useSearchParams();
  const roomId = params.get('room') || '';

  // 自分の表示情報（プロフィール画面で保存しておくと綺麗に出ます）
  const [meNick, setMeNick] = useState('あなた');
  const [meIcon, setMeIcon] = useState<string>('');
  const [meProfile, setMeProfile] = useState('...');

  // 画面要素
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [draft, setDraft] = useState('');
  const [roomName, setRoomName] = useState('Cafe Amayadori');
  const [memberLabel, setMemberLabel] = useState('オーナーとあなた'); // ヘッダ右側
  const [doorOpen, setDoorOpen] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);

  const taRef = useRef<HTMLTextAreaElement>(null);

  // 雨アニメのドロップ
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

  // 初期化：匿名ログイン・プロフィール復元・部屋購読
  useEffect(() => {
    (async () => {
      if (!roomId) return;

      await ensureAnon();
      // プロフィール（ローカル保存分があれば使う）
      try {
        const n = localStorage.getItem('amayadori_nickname');
        const p = localStorage.getItem('amayadori_profile');
        const i = localStorage.getItem('amayadori_icon');
        if (n) setMeNick(n);
        if (p) setMeProfile(p);
        if (i) setMeIcon(i);
      } catch {}

      // ルーム情報（ヘッダの参加者表示用）
      const roomRef = doc(db, 'rooms', roomId);
      const roomSnap = await getDoc(roomRef);
      if (roomSnap.exists()) {
        const data = roomSnap.data() as DocumentData;
        const members: string[] = data.members || [];
        if (members.includes('ownerAI') && members.length === 2) {
          setMemberLabel('オーナーとあなた');
        } else if (members.length === 2) {
          setMemberLabel('相手とあなた');
        } else if (members.length >= 3) {
          setMemberLabel(`他${members.length - 1}人とあなた`);
        } else {
          setMemberLabel('あなた');
        }
      }

      // メッセージ購読
      const q = query(
        collection(db, 'rooms', roomId, 'messages'),
        orderBy('createdAt', 'asc'),
        limit(200)
      );
      const unsub = onSnapshot(q, (snap) => {
        const list: ChatMsg[] = snap.docs.map((d) => {
          const v = d.data() as any;
          return { id: d.id, text: v.text, uid: v.uid, createdAt: v.createdAt };
        });
        setMsgs(list);
      });
      return () => unsub();
    })();
  }, [roomId]);

  // UIユーティリティ
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
  function playDoor() {
    setDoorOpen(true);
    setTimeout(() => setDoorOpen(false), 1300);
  }
  function threeSuggestions(): string[] {
    const s = [...conversationStarters];
    for (let i = s.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [s[i], s[j]] = [s[j], s[i]];
    }
    return s.slice(0, 3);
  }

  // 送信
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

  // 退室（Cloud Functions）
  async function leave() {
    try {
      await ensureAnon();
      const fn = httpsCallable(getFunctions(undefined, 'asia-northeast1'), 'leaveRoom');
      await fn({ roomId });
    } catch (e) {
      // 失敗しても画面は戻す
      console.error(e);
    }
    playDoor();
    setTimeout(() => r.push('/amayadori'), 600);
  }

  const myUid = auth.currentUser?.uid || 'me';

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

      {/* ルーム */}
      <div className="relative z-10 w-full h-full flex flex-col glass-card">
        {/* ヘッダ（モックと同じ） */}
        <header className="w-full p-4 border-b border-gray-700/50 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center space-x-3">
            <img
              className="w-10 h-10 rounded-full object-cover"
              src={meIcon || DEFAULT_USER_ICON}
              alt="user icon"
            />
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
            <button className="btn-exit" onClick={leave}>
              退室
            </button>
          </div>
        </header>

        {/* メッセージエリア */}
        <main id="chat-messages" className="flex-1 p-4 overflow-y-auto flex flex-col space-y-4">
          {/* AIオーナーのウェルカム（実メッセージが無い時にだけ演出として表示） */}
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
            const isMe = m.uid === myUid;
            return (
              <div key={m.id} className={`flex items-end gap-2 ${isMe ? 'justify-end' : 'justify-start'}`}>
                {!isMe && (
                  <img
                    className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                    src={OWNER_ICON}
                    alt=""
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = DEFAULT_USER_ICON;
                    }}
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
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = DEFAULT_USER_ICON;
                    }}
                  />
                )}
              </div>
            );
          })}
        </main>

        {/* フッター（提案チップ＋入力欄） */}
        <footer className="p-4 flex-shrink-0">
          {showSuggestions && (
            <div className="flex-wrap justify-center gap-2 mb-3 flex">
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
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
            </button>
          </div>
        </footer>
      </div>

      {/* 扉アニメーション（共通演出） */}
      <div
        id="door-animation"
        className={`fixed inset-0 z-50 flex pointer-events-none ${doorOpen ? 'open' : ''} ${
          doorOpen ? '' : 'hidden'
        }`}
      >
        <div className="door left"></div>
        <div className="door right"></div>
      </div>
    </div>
  );
}
