// app/chat/page.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  DocumentData,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { auth, db, ensureAnon } from '@/lib/firebase';

type Msg = { id: string; text: string; uid: string; createdAt?: any };

const DEFAULT_USER_ICON =
  'https://storage.googleapis.com/dh_character_images/Amayadori/%E3%82%A2%E3%82%A4%E3%82%B3%E3%83%B3%E3%81%AA%E3%81%97.png';

const conversationStarters = [
  'この辺りは静かで良いですね',
  '最近、何か良いことありましたか？',
  'おすすめのコーヒーは？',
  '雨、いつまで続くんでしょうね',
  'どんな音楽を聴くんですか？',
];

export default function ChatPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const roomId = sp.get('room') || '';

  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(true);

  const taRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // サジェストを毎回シャッフル
  const suggestions = useMemo(() => {
    const s = [...conversationStarters];
    for (let i = s.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [s[i], s[j]] = [s[j], s[i]];
    }
    return s.slice(0, 3);
  }, []);

  // 自動リサイズ
  function autoResize() {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const max = 120;
    if (el.scrollHeight > max) {
      el.style.overflowY = 'auto';
      el.style.height = `${max}px`;
    } else {
      el.style.overflowY = 'hidden';
      el.style.height = `${el.scrollHeight}px`;
    }
  }

  // スクロール最下部へ
  function scrollToBottom() {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }

  // 入室準備 & メッセージ購読
  useEffect(() => {
    (async () => {
      if (!roomId) {
        router.replace('/amayadori');
        return;
      }
      await ensureAnon();

      const q = query(
        collection(db, 'rooms', roomId, 'messages'),
        orderBy('createdAt', 'asc')
      );
      const unsub = onSnapshot(q, (snap) => {
        const next = snap.docs.map((d) => {
          const data = d.data() as DocumentData;
          return {
            id: d.id,
            text: String(data.text ?? ''),
            uid: String(data.uid ?? ''),
            createdAt: data.createdAt,
          } as Msg;
        });
        setMsgs(next);
        // ほんの少し待ってスクロール（レイアウト反映後）
        setTimeout(scrollToBottom, 0);
      });

      return () => unsub();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  // 送信
  async function send() {
    const text = draft.trim();
    if (!text || !roomId) return;
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    await addDoc(collection(db, 'rooms', roomId, 'messages'), {
      uid,
      text,
      createdAt: serverTimestamp(),
    });

    setDraft('');
    setShowSuggestions(false);
    setTimeout(() => {
      taRef.current?.focus();
      scrollToBottom();
    }, 0);
  }

  // 退室
  async function leave() {
    try {
      const functions = getFunctions(); // デフォルトApp
      const callLeave = httpsCallable(functions, 'leaveRoom');
      await callLeave({ roomId });
    } catch (e) {
      // 失敗しても画面は戻す
      console.warn('leaveRoom failed (ignore in client):', e);
    } finally {
      router.replace('/amayadori');
    }
  }

  const myUid = auth.currentUser?.uid || '';

  return (
    <div className="w-full h-full overflow-hidden">
      {/* 背景の雨は全体CSSがある前提。必要に応じて /amayadori と同じ背景を共用してください */}

      {/* カフェ風チャットカード */}
      <div className="relative z-10 w-full h-full flex items-center justify-center p-4">
        <div className="w-full h-full max-w-3xl glass-card flex flex-col">
          {/* ヘッダー */}
          <header className="w-full p-4 border-b border-gray-700/50 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center space-x-3">
              <img
                className="w-10 h-10 rounded-full object-cover"
                src={DEFAULT_USER_ICON}
                alt="user icon"
              />
              <div>
                <p className="font-bold text-lg">Cafe Amayadori</p>
                <p className="text-xs text-gray-400">オーナーとあなた</p>
              </div>
            </div>
            <button className="btn-exit" onClick={leave}>
              退室
            </button>
          </header>

          {/* メッセージリスト */}
          <main
            ref={listRef}
            className="flex-1 p-4 overflow-y-auto flex flex-col space-y-4"
          >
            {msgs.map((m) => {
              const mine = m.uid === myUid;
              return (
                <div
                  key={m.id}
                  className={`flex items-end gap-2 ${
                    mine ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {!mine && (
                    <img
                      className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                      src={DEFAULT_USER_ICON}
                      alt=""
                    />
                  )}
                  <div className={`chat-bubble ${mine ? 'me' : 'other'}`}>
                    {!mine && (
                      <span className="block text-xs font-bold mb-1 text-purple-300">
                        オーナー
                      </span>
                    )}
                    <p>{m.text}</p>
                  </div>
                  {mine && (
                    <img
                      className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                      src={DEFAULT_USER_ICON}
                      alt=""
                    />
                  )}
                </div>
              );
            })}
          </main>

          {/* 入力エリア */}
          <footer className="p-4 flex-shrink-0">
            {showSuggestions && (
              <div className="flex-wrap justify-center gap-2 mb-3 flex">
                {suggestions.map((t) => (
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
                aria-label="send"
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
      </div>
    </div>
  );
}
