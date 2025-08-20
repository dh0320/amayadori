'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  addDoc,
  collection,
  doc,
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

type ChatMsg = { id: string; text: string; uid: string; system?: boolean; createdAt?: Timestamp };
type ProfileSnap = { nickname?: string; profile?: string; icon?: string };
type Drop = { i: number; x: number; delay: number; duration: number; width: number; height: number };

const POST_LEAVE_AD_SEC = Number(process.env.NEXT_PUBLIC_POST_LEAVE_AD_SECONDS ?? 20);

export default function ChatPage() {
  const r = useRouter();
  const sp = useSearchParams();
  const roomId = sp.get('room') || '';

  const [myUid, setMyUid] = useState<string>('');
  const [profiles, setProfiles] = useState<Record<string, ProfileSnap>>({});
  const [members, setMembers] = useState<string[]>([]);
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [draft, setDraft] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [peerLeftNotice, setPeerLeftNotice] = useState(false);

  const [doorOpen, setDoorOpen] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showPostLeaveAd, setShowPostLeaveAd] = useState(false);
  const [postLeaveLeft, setPostLeaveLeft] = useState<number>(POST_LEAVE_AD_SEC);
  const adTimerRef = useRef<any>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // 💧 雨アニメ：マウント後に生成（SSR差分を避ける）
  const [drops, setDrops] = useState<Drop[]>([]);
  useEffect(() => {
    const arr: Drop[] = Array.from({ length: 100 }).map((_, i) => {
      const x = Math.random() * 100;
      const delay = Math.random() * 2;
      const duration = 0.5 + Math.random() * 0.5;
      const width = 1 + Math.random() * 2;
      const height = 60 + Math.random() * 40;
      return { i, x, delay, duration, width, height };
    });
    setDrops(arr);
  }, []);

  // ルーム購読
  useEffect(() => {
    (async () => {
      if (!roomId) return;
      await ensureAnon();
      setMyUid(auth.currentUser?.uid || '');

      const roomUnsub = onSnapshot(doc(db, 'rooms', roomId), (roomSnap) => {
        if (!roomSnap.exists()) return;
        const data = roomSnap.data() as any;
        setMembers(Array.isArray(data.members) ? data.members : []);
        setProfiles((data.profiles || {}) as Record<string, ProfileSnap>);

        // 片方退室のUI通知
        const ms: string[] = Array.isArray(data.members) ? data.members : [];
        if (auth.currentUser?.uid && ms.length === 1 && ms.includes(auth.currentUser.uid)) {
          setPeerLeftNotice(true);
        }
      });

      // メッセージ購読
      const q = query(
        collection(db, 'rooms', roomId, 'messages'),
        orderBy('createdAt', 'asc'),
        limit(200)
      );
      const msgUnsub = onSnapshot(q, (ss) => {
        const list: ChatMsg[] = ss.docs.map((d) => {
          const v = d.data() as any;
          return { id: d.id, text: v.text, uid: v.uid, system: !!v.system, createdAt: v.createdAt };
        });
        setMsgs(list);
        if (list.some(m => m.system && m.text === '会話相手が退席しました')) {
          setPeerLeftNotice(false);
        }
      });

      return () => {
        roomUnsub();
        msgUnsub();
        if (adTimerRef.current) clearInterval(adTimerRef.current);
      };
    })();
  }, [roomId]);

  // 相手/自分のUID
  const partnerUid = useMemo(
    () => members.find((m) => m !== myUid && m !== 'ownerAI') || (members.includes('ownerAI') ? 'ownerAI' : ''),
    [members, myUid]
  );

  // localStorage フォールバック（自分側のみ）
  const meLocal: ProfileSnap = useMemo(() => {
    try {
      return {
        nickname: localStorage.getItem('amayadori_nickname') || 'あなた',
        profile: localStorage.getItem('amayadori_profile') || '...',
        icon: localStorage.getItem('amayadori_icon') || DEFAULT_USER_ICON,
      };
    } catch {
      return { nickname: 'あなた', profile: '...', icon: DEFAULT_USER_ICON };
    }
  }, []);

  // 表示用プロフィール（優先：room.profiles → 自分は localStorage フォールバック）
  const me: ProfileSnap = { nickname: profiles[myUid]?.nickname || meLocal.nickname, profile: profiles[myUid]?.profile || meLocal.profile, icon: profiles[myUid]?.icon || meLocal.icon };
  const you: ProfileSnap =
    partnerUid === 'ownerAI'
      ? { nickname: 'オーナー', profile: '雨宿りカフェのオーナー', icon: OWNER_ICON }
      : { nickname: profiles[partnerUid]?.nickname || '相手', profile: profiles[partnerUid]?.profile || '...', icon: profiles[partnerUid]?.icon || DEFAULT_USER_ICON };

  // 話題候補（最初だけ）
  useEffect(() => {
    if (!roomId || !myUid || suggestions.length > 0) return;
    const fn = httpsCallable(getFunctions(undefined, 'asia-northeast1'), 'genStarters');
    fn({ roomId })
      .then((res: any) => {
        const s: string[] = Array.isArray(res?.data?.starters) ? res.data.starters : [];
        if (s.length) setSuggestions(s.slice(0, 3));
      })
      .catch(() => {
        setSuggestions([
          'この街で雨の日に行きたい場所は？',
          '最近ハマってる飲み物はありますか？',
          '静かな雨音って落ち着きますね。'
        ]);
      });
  }, [roomId, myUid, suggestions.length]);

  function autoResize() {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.overflowY = el.scrollHeight > 120 ? 'auto' : 'hidden';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
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

  function startPostLeaveAd() {
    try {
      const until = Date.now() + POST_LEAVE_AD_SEC * 1000;
      localStorage.setItem('amayadori_cd_until', String(until));
    } catch {}
    setPostLeaveLeft(POST_LEAVE_AD_SEC);
    setShowPostLeaveAd(true);
    if (adTimerRef.current) clearInterval(adTimerRef.current);
    adTimerRef.current = setInterval(() => {
      setPostLeaveLeft((v) => {
        if (v <= 1) {
          clearInterval(adTimerRef.current);
          setShowPostLeaveAd(false);
          r.push('/amayadori');
          return 0;
        }
        return v - 1;
      });
    }, 1000);
  }

  async function leave() {
    try {
      await ensureAnon();
      await httpsCallable(getFunctions(undefined, 'asia-northeast1'), 'leaveRoom')({ roomId });
    } catch (e) {
      console.error(e);
    }
    setDoorOpen(true);
    setTimeout(() => setDoorOpen(false), 800);
    startPostLeaveAd();
  }

  const hasSystemPeerLeft = msgs.some(m => m.system && m.text === '会話相手が退席しました');
  const isOwnerRoom = members.includes('ownerAI');

  return (
    <div className="w-full h-full overflow-hidden">
      {/* 雨（SSR差分を許容） */}
      <div id="rain-container" suppressHydrationWarning>
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

      <div id="app-container" className="relative z-10 w-full h-full flex items-center justify-center p-4">
        <div id="chat-screen" className="w-full h-full flex flex-col glass-card">
          {/* ヘッダ：相手/自分のプロフィール（ローカル復元込み） */}
          <header className="w-full p-4 border-b border-gray-700/50 flex items-center justify-between flex-shrink-0">
            {/* 相手 */}
            <div className="flex items-center space-x-3">
              <img className="w-10 h-10 rounded-full object-cover" src={you.icon || DEFAULT_USER_ICON} alt="" />
              <div>
                <p className="font-bold">{you.nickname || '相手'}</p>
                <p className="text-xs text-gray-400">{you.profile || '...'}</p>
              </div>
            </div>

            {/* タイトル */}
            <div className="text-center">
              <h2 className="text-lg font-bold">Cafe Amayadori</h2>
              <p className="text-xs text-gray-400">{isOwnerRoom ? 'オーナーとあなた' : '相手とあなた'}</p>
            </div>

            {/* 自分 + 退室ボタン */}
            <div className="flex items-center space-x-3">
              <div className="text-right">
                <p className="font-bold">{me.nickname || 'あなた'}</p>
                <p className="text-xs text-gray-400">{me.profile || '...'}</p>
              </div>
              <img className="w-10 h-10 rounded-full object-cover" src={me.icon || DEFAULT_USER_ICON} alt="" />
              <button className="btn-exit ml-2" onClick={() => setShowLeaveConfirm(true)}>退室</button>
            </div>
          </header>

          {/* メッセージ */}
          <main id="chat-messages" className="flex-1 p-4 overflow-y-auto flex flex-col space-y-4">
            {(hasSystemPeerLeft || peerLeftNotice) && (
              <div className="text-center text-gray-400 text-sm italic my-2">会話相手が退席しました</div>
            )}

            {/* 最初の演出はオーナー部屋のみ */}
            {msgs.length === 0 && isOwnerRoom && !hasSystemPeerLeft && !peerLeftNotice && (
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
                if (m.text === '会話相手が退席しました') return null;
                return <div key={m.id} className="text-center text-gray-400 text-sm italic my-2">{m.text}</div>;
              }
              const mine = (auth.currentUser?.uid && m.uid === auth.currentUser?.uid) || false;
              const partnerIcon = you.icon || (partnerUid === 'ownerAI' ? OWNER_ICON : DEFAULT_USER_ICON);
              return (
                <div key={m.id} className={`flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'}`}>
                  {!mine && (
                    <img className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                      src={partnerIcon}
                      alt=""
                      onError={(e) => ((e.currentTarget as HTMLImageElement).src = DEFAULT_USER_ICON)}
                    />
                  )}
                  <div className={`chat-bubble ${mine ? 'me' : 'other'}`}>
                    {!mine && <span className="block text-xs font-bold mb-1 text-purple-300">{you.nickname || (partnerUid === 'ownerAI' ? 'オーナー' : '相手')}</span>}
                    <p>{m.text}</p>
                  </div>
                  {mine && (
                    <img className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                      src={me.icon || DEFAULT_USER_ICON}
                      alt=""
                      onError={(e) => ((e.currentTarget as HTMLImageElement).src = DEFAULT_USER_ICON)}
                    />
                  )}
                </div>
              );
            })}
          </main>

          {/* フッター（話題候補） */}
          <footer className="p-4 flex-shrink-0">
            {showSuggestions && suggestions.length > 0 && (
              <div id="suggestion-area" className="flex-wrap justify-center gap-2 mb-3 flex">
                {suggestions.slice(0, 3).map((t) => (
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

      {/* 退室後広告 */}
      {showPostLeaveAd && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center">
          <div className="glass-card p-6 w-full max-w-md text-center space-y-4">
            <p className="text-sm text-gray-400">広告</p>
            <div className="w-full h-96 bg-gray-700/80 rounded-xl flex items-center justify-center">
              <p className="px-6">ここにインタースティシャル広告（SDK/タグ）を差し込み</p>
            </div>
            <p className="text-gray-300">閉じるまで {postLeaveLeft} 秒</p>
          </div>
        </div>
      )}
    </div>
  );
}
