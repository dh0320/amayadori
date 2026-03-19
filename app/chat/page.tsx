'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
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
import { getFunctions, httpsCallable } from 'firebase/functions';
import { auth, db, ensureAnon } from '@/lib/firebase';

const DEFAULT_USER_ICON = 'https://storage.googleapis.com/amayadori/defaultIcon.png';
const OWNER_ICON = 'https://storage.googleapis.com/amayadori/cafeownerIcon.png';
const POST_LEAVE_AD_SEC = Number(process.env.NEXT_PUBLIC_POST_LEAVE_AD_SECONDS ?? 20);

type ChatPhase = 'joining' | 'matched' | 'leaving' | 'cooldown';
type ChatMsg = { id: string; text: string; uid: string; system?: boolean; createdAt?: Timestamp };
type ProfileSnap = { nickname?: string; profile?: string; icon?: string };
type Drop = { i: number; x: number; delay: number; duration: number; width: number; height: number };

type ChatUiState = {
  showLeaveConfirm: boolean;
  showPostLeaveAd: boolean;
  postLeaveLeft: number;
  peerLeftNotice: boolean;
};

type ChatSyncState = {
  members: string[];
  profiles: Record<string, ProfileSnap>;
  msgs: ChatMsg[];
  myUid: string;
  hasStartedLeave: boolean;
};

function logChat(label: string, payload?: Record<string, unknown>) {
  console.info(`[chat:${label}]`, payload ?? {});
}

function ChatPageInner() {
  const r = useRouter();
  const sp = useSearchParams();
  const roomId = sp.get('room') || '';

  const [phase, setPhase] = useState<ChatPhase>('joining');
  const [doorOpen, setDoorOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [ui, setUi] = useState<ChatUiState>({
    showLeaveConfirm: false,
    showPostLeaveAd: false,
    postLeaveLeft: POST_LEAVE_AD_SEC,
    peerLeftNotice: false,
  });
  const [syncState, setSyncState] = useState<ChatSyncState>({
    members: [],
    profiles: {},
    msgs: [],
    myUid: '',
    hasStartedLeave: false,
  });
  const [drops, setDrops] = useState<Drop[]>([]);
  const sentChatPV = useRef(false);
  const adTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const members = syncState.members;
  const profiles = syncState.profiles;
  const msgs = syncState.msgs;
  const myUid = syncState.myUid;

  const partnerUid = useMemo(() => {
    const profileKeys = Object.keys(profiles || {});
    const byProfiles = profileKeys.find((k) => k !== myUid && k !== 'ownerAI');
    if (byProfiles) return byProfiles;
    const byMembers = members.find((m) => m !== myUid && m !== 'ownerAI');
    if (byMembers) return byMembers;
    return members.includes('ownerAI') ? 'ownerAI' : '';
  }, [profiles, members, myUid]);

  const [meLocal, setMeLocal] = useState<ProfileSnap>({
    nickname: 'あなた',
    profile: '...',
    icon: DEFAULT_USER_ICON,
  });

  const me: ProfileSnap = {
    nickname: profiles[myUid]?.nickname || meLocal.nickname,
    profile: profiles[myUid]?.profile || meLocal.profile,
    icon: profiles[myUid]?.icon || meLocal.icon,
  };

  const you: ProfileSnap = partnerUid === 'ownerAI'
    ? { nickname: 'オーナー', profile: '雨宿りカフェのオーナー', icon: OWNER_ICON }
    : {
        nickname: profiles[partnerUid]?.nickname || '相手',
        profile: profiles[partnerUid]?.profile || '...',
        icon: profiles[partnerUid]?.icon || DEFAULT_USER_ICON,
      };

  function setUiPatch(patch: Partial<ChatUiState>) {
    setUi((prev) => ({ ...prev, ...patch }));
  }

  function setSyncPatch(patch: Partial<ChatSyncState>) {
    setSyncState((prev) => ({ ...prev, ...patch }));
  }

  function stopAdTimer(reason: string) {
    if (adTimerRef.current) {
      clearInterval(adTimerRef.current);
      adTimerRef.current = null;
      logChat('timer:cooldown:stop', { reason });
    }
  }

  function autoResize() {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.overflowY = el.scrollHeight > 120 ? 'auto' : 'hidden';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }

  async function send() {
    const text = draft.trim();
    if (!text || !roomId || phase !== 'matched') return;
    await ensureAnon();
    const uid = auth?.currentUser?.uid;
    if (!uid) return;
    if (!db) return;
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
      localStorage.setItem('amayadori_cd_until', String(Date.now() + POST_LEAVE_AD_SEC * 1000));
    } catch {}
    stopAdTimer('restart');
    setPhase('cooldown');
    setUiPatch({ showPostLeaveAd: true, postLeaveLeft: POST_LEAVE_AD_SEC, showLeaveConfirm: false });
    logChat('cooldown:start', { roomId });
    adTimerRef.current = setInterval(() => {
      setUi((prev) => {
        if (prev.postLeaveLeft <= 1) {
          stopAdTimer('finished');
          setTimeout(() => {
            setUiPatch({ showPostLeaveAd: false, postLeaveLeft: 0 });
            r.push('/amayadori');
          }, 0);
          return { ...prev, postLeaveLeft: 0 };
        }
        return { ...prev, postLeaveLeft: prev.postLeaveLeft - 1 };
      });
      return undefined as never;
    }, 1000);
  }

  async function leaveRoomOnServer() {
    await ensureAnon();
    await httpsCallable(getFunctions(undefined, 'asia-northeast1'), 'leaveRoom')({ roomId });
  }

  async function leave() {
    if (syncState.hasStartedLeave) {
      logChat('leave:skip-duplicate', { roomId });
      return;
    }
    setSyncPatch({ hasStartedLeave: true });
    setPhase('leaving');
    try {
      await leaveRoomOnServer();
    } catch (e) {
      console.error(e);
    }
    setDoorOpen(true);
    setTimeout(() => setDoorOpen(false), 800);
    startPostLeaveAd();
  }

  const hasSystemPeerLeft = msgs.some((m) => m.system && m.text === '会話相手が退席しました');
  const isOwnerRoom = members.includes('ownerAI');

  useEffect(() => {
    const arr: Drop[] = Array.from({ length: 100 }).map((_, i) => ({
      i,
      x: Math.random() * 100,
      delay: Math.random() * 2,
      duration: 0.5 + Math.random() * 0.5,
      width: 1 + Math.random() * 2,
      height: 60 + Math.random() * 40,
    }));
    setDrops(arr);
  }, []);

  useEffect(() => {
    try {
      setMeLocal({
        nickname: localStorage.getItem('amayadori_nickname') || 'あなた',
        profile: localStorage.getItem('amayadori_profile') || '...',
        icon: localStorage.getItem('amayadori_icon') || DEFAULT_USER_ICON,
      });
    } catch {
      // noop
    }
  }, []);

  useEffect(() => {
    if (!roomId || sentChatPV.current) return;
    sentChatPV.current = true;
    (async () => {
      try {
        await ensureAnon();
        await httpsCallable(getFunctions(undefined, 'asia-northeast1'), 'trackVisit')({
          page: 'chat',
          src: typeof document !== 'undefined' ? document.referrer : '',
        });
      } catch {
        // noop
      }
    })();
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return;
    let roomUnsub: (() => void) | null = null;
    let msgUnsub: (() => void) | null = null;
    void (async () => {
      const currentUser = await ensureAnon();
      if (!db) return;

      setSyncPatch({ myUid: currentUser.uid || '' });
      setPhase('matched');

      roomUnsub = onSnapshot(doc(db, 'rooms', roomId), (roomSnap) => {
        if (!roomSnap.exists()) return;
        const data = roomSnap.data() as any;
        const nextMembers = Array.isArray(data.members) ? data.members : [];
        setSyncPatch({
          members: nextMembers,
          profiles: (data.profiles || {}) as Record<string, ProfileSnap>,
        });
        if (currentUser.uid && nextMembers.length === 1 && nextMembers.includes(currentUser.uid)) {
          setUiPatch({ peerLeftNotice: true });
        }
      });

      const q = query(collection(db, 'rooms', roomId, 'messages'), orderBy('createdAt', 'asc'), limit(200));
      msgUnsub = onSnapshot(q, (ss) => {
        const list: ChatMsg[] = ss.docs.map((d) => {
          const v = d.data() as any;
          return { id: d.id, text: v.text, uid: v.uid, system: !!v.system, createdAt: v.createdAt };
        });
        setSyncPatch({ msgs: list });
        if (list.some((m) => m.system && m.text === '会話相手が退席しました')) {
          setUiPatch({ peerLeftNotice: false });
        }
      });
    })();

    return () => {
      roomUnsub?.();
      msgUnsub?.();
      stopAdTimer('unmount');
    };
  }, [roomId]);

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
          '静かな雨音って落ち着きますね。',
        ]);
      });
  }, [roomId, myUid, suggestions.length]);

  return (
    <div className="theme-amayadori w-full h-full overflow-hidden">
      <div id="rain-container" suppressHydrationWarning>
        {drops.map((d) => (
          <div key={d.i} className="rain-drop" style={{ left: `${d.x}%`, animationDelay: `${d.delay}s`, animationDuration: `${d.duration}s`, width: `${d.width}px`, height: `${d.height}px` }} />
        ))}
      </div>

      <div id="app-container" className="relative z-10 w-full h-full flex items-center justify-center p-4">
        <div id="chat-screen" className="w-full h-full flex flex-col glass-card">
          <header className="w-full p-4 border-b border-gray-700/50 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center space-x-3">
              <img className="w-10 h-10 rounded-full object-cover" src={you.icon || DEFAULT_USER_ICON} alt="" />
              <div>
                <p className="font-bold" suppressHydrationWarning>{you.nickname || '相手'}</p>
                <p className="text-xs text-gray-400" suppressHydrationWarning>{you.profile || '...'}</p>
              </div>
            </div>
            <div className="text-center">
              <h2 className="text-lg font-bold">Cafe Amayadori</h2>
              <p className="text-xs text-gray-400">{isOwnerRoom ? 'オーナーとあなた' : '相手とあなた'}</p>
            </div>
            <div className="flex items-center space-x-3">
              <div className="text-right">
                <p className="font-bold" suppressHydrationWarning>{me.nickname || 'あなた'}</p>
                <p className="text-xs text-gray-400" suppressHydrationWarning>{me.profile || '...'}</p>
              </div>
              <img className="w-10 h-10 rounded-full object-cover" src={me.icon || DEFAULT_USER_ICON} alt="" />
              <button className="btn-exit ml-2" onClick={() => setUiPatch({ showLeaveConfirm: true })} disabled={phase === 'leaving' || phase === 'cooldown'}>退室</button>
            </div>
          </header>

          <main id="chat-messages" className="flex-1 p-4 overflow-y-auto flex flex-col space-y-4">
            {(hasSystemPeerLeft || ui.peerLeftNotice) && <div className="text-center text-gray-400 text-sm italic my-2">会話相手が退席しました</div>}
            {msgs.map((m) => {
              if (m.system) {
                if (m.text === '会話相手が退席しました') return null;
                return <div key={m.id} className="text-center text-gray-400 text-sm italic my-2">{m.text}</div>;
              }
              const currentUid = auth?.currentUser?.uid;
              const mine = Boolean(currentUid && m.uid === currentUid);
              const partnerIcon = you.icon || (partnerUid === 'ownerAI' ? OWNER_ICON : DEFAULT_USER_ICON);
              return (
                <div key={m.id} className={`flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'}`}>
                  {!mine && <img className="w-8 h-8 rounded-full object-cover flex-shrink-0" src={partnerIcon} alt="" onError={(e) => ((e.currentTarget as HTMLImageElement).src = DEFAULT_USER_ICON)} />}
                  <div className={`chat-bubble ${mine ? 'me' : 'other'}`}>
                    {!mine && <span className="block text-xs font-bold mb-1 text-purple-300">{you.nickname || (partnerUid === 'ownerAI' ? 'オーナー' : '相手')}</span>}
                    <p>{m.text}</p>
                  </div>
                  {mine && <img className="w-8 h-8 rounded-full object-cover flex-shrink-0" src={me.icon || DEFAULT_USER_ICON} alt="" onError={(e) => ((e.currentTarget as HTMLImageElement).src = DEFAULT_USER_ICON)} />}
                </div>
              );
            })}
          </main>

          <footer className="p-4 flex-shrink-0">
            {showSuggestions && suggestions.length > 0 && (
              <div id="suggestion-area" className="flex-wrap justify-center gap-2 mb-3 flex">
                {suggestions.slice(0, 3).map((t) => (
                  <button key={t} className="suggestion-btn" onClick={() => { setDraft(t); setShowSuggestions(false); setTimeout(() => taRef.current?.focus(), 0); }}>{t}</button>
                ))}
              </div>
            )}
            <div className="flex items-center space-x-3">
              <textarea ref={taRef} className="flex-1 px-4 py-3 message-textarea" placeholder="メッセージを送信..." rows={1} value={draft} onChange={(e) => { setDraft(e.target.value); autoResize(); }} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }} />
              <button className="w-12 h-12 rounded-full text-white flex items-center justify-center btn-gradient flex-shrink-0" onClick={() => void send()} disabled={phase !== 'matched'}>
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
              </button>
            </div>
          </footer>
        </div>
      </div>

      <div id="door-animation" className={`fixed inset-0 z-50 flex pointer-events-none ${doorOpen ? 'open' : ''} ${doorOpen ? '' : 'hidden'}`}><div className="door left"></div><div className="door right"></div></div>

      {ui.showLeaveConfirm && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center">
          <div className="glass-card p-6 w-full max-w-sm text-center space-y-4">
            <p className="text-lg font-semibold">本当に退席しますか？</p>
            <div className="flex gap-3 justify-center">
              <button className="btn-secondary" onClick={() => setUiPatch({ showLeaveConfirm: false })}>いいえ</button>
              <button className="btn-gradient" onClick={() => { setUiPatch({ showLeaveConfirm: false }); void leave(); }} disabled={phase === 'leaving' || phase === 'cooldown'}>はい</button>
            </div>
          </div>
        </div>
      )}

      {ui.showPostLeaveAd && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center">
          <div className="glass-card p-6 w-full max-w-md text-center space-y-4">
            <p className="text-sm text-gray-400">広告</p>
            <div className="w-full h-96 bg-gray-700/80 rounded-xl flex items-center justify-center"><p className="px-6">ここにインタースティシャル広告（SDK/タグ）を差し込み</p></div>
            <p className="text-gray-300">閉じるまで {ui.postLeaveLeft} 秒</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ChatPage() {
  return <Suspense fallback={<div />}><ChatPageInner /></Suspense>;
}
