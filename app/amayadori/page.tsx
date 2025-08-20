'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
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

type Screen = 'profile' | 'region' | 'waiting' | 'chat';
type Msg = { id: string; text: string; isMe: boolean; nickname?: string; icon?: string };

const POST_LEAVE_AD_SEC = Number(process.env.NEXT_PUBLIC_POST_LEAVE_AD_SECONDS ?? 20);

export default function Page() {
  const router = useRouter();

  // 画面・状態
  const [screen, setScreen] = useState<Screen>('profile');
  const [doorOpen, setDoorOpen] = useState(false);

  // プロフィール（初期復元：トップで入力した内容を常に表示）
  const [userNickname, setUserNickname] = useState('あなた');
  const [userIcon, setUserIcon] = useState<string>('');
  const [userProfile, setUserProfile] = useState('...');

  useEffect(() => {
    try {
      const nn = localStorage.getItem('amayadori_nickname');
      const pf = localStorage.getItem('amayadori_profile');
      const ic = localStorage.getItem('amayadori_icon');
      if (nn) setUserNickname(nn);
      if (pf) setUserProfile(pf);
      if (ic) setUserIcon(ic);
    } catch {}
  }, []);

  // 待機
  const [waitingMessage, setWaitingMessage] = useState('マッチング相手を探しています...');
  const [ownerPrompt, setOwnerPrompt] = useState(false);
  const waitingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // エントリー監視/管理（ハートビート＆キャンセル）
  const entryUnsubRef = useRef<(() => void) | null>(null);
  const entryIdRef = useRef<string | null>(null);
  const heartbeatTimerRef = useRef<any>(null);

  // チャット（モック）
  const [roomName, setRoomName] = useState('Cafe Amayadori');
  const [userCount, setUserCount] = useState('オーナーとあなた');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  // 既存のダミー広告
  const [showInterstitial, setShowInterstitial] = useState(false);
  const [showRewarded, setShowRewarded] = useState(false);
  const [rewardLeft, setRewardLeft] = useState(5);
  const [customAlert, setCustomAlert] = useState<string | null>(null);

  // 退室後広告（別タブ対策）
  const [showPostLeaveAd, setShowPostLeaveAd] = useState(false);
  const [postLeaveLeft, setPostLeaveLeft] = useState(POST_LEAVE_AD_SEC);
  const [pendingQueueKey, setPendingQueueKey] = useState<null | 'country' | 'global'>(null);
  const cdTimerRef = useRef<any>(null);

  // 「今、待機中か？」の参照（ページ離脱検知で使用）
  const isWaitingRef = useRef(false);
  useEffect(() => { isWaitingRef.current = (screen === 'waiting'); }, [screen]);

  // 雨（ドロップ）
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

  // 入力欄のオートリサイズ
  const taRef = useRef<HTMLTextAreaElement>(null);
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

  // 扉アニメーション
  function playDoor() {
    setDoorOpen(true);
    setTimeout(() => setDoorOpen(false), 1300);
  }

  // 画像プレビュー
  function onPickIcon(file?: File) {
    if (!file) {
      setUserIcon('');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => setUserIcon(String(e.target?.result || ''));
    reader.readAsDataURL(file);
  }

  // プロフィール送信（保存して region へ）
  function submitProfile() {
    const nn = userNickname?.trim() ? userNickname : '名無しさん';
    const pf = userProfile?.trim() ? userProfile : '...';
    setUserNickname(nn);
    setUserProfile(pf);
    try {
      localStorage.setItem('amayadori_nickname', nn);
      localStorage.setItem('amayadori_profile', pf);
      if (userIcon) localStorage.setItem('amayadori_icon', userIcon);
    } catch {}
    setScreen('region');
  }

  // クールダウン残り秒
  function remainingCooldownSec(): number {
    try {
      const until = Number(localStorage.getItem('amayadori_cd_until') || '0');
      const left = Math.ceil((until - Date.now()) / 1000);
      return left > 0 ? left : 0;
    } catch {
      return 0;
    }
  }

  // 退室後広告の開始
  function startPostLeaveAd(initialLeft?: number, autoJoinKey?: 'country' | 'global' | null) {
    const left = typeof initialLeft === 'number' ? initialLeft : remainingCooldownSec() || POST_LEAVE_AD_SEC;
    setPostLeaveLeft(left);
    setShowPostLeaveAd(true);
    setPendingQueueKey(autoJoinKey ?? null);
    if (cdTimerRef.current) clearInterval(cdTimerRef.current);
    cdTimerRef.current = setInterval(() => {
      setPostLeaveLeft((v) => {
        if (v <= 1) {
          clearInterval(cdTimerRef.current);
          setShowPostLeaveAd(false);
          try { localStorage.removeItem('amayadori_cd_until'); } catch {}
          if (pendingQueueKey) {
            const key = pendingQueueKey;
            setPendingQueueKey(null);
            handleJoin(key);
          }
          return 0;
        }
        return v - 1;
      });
    }, 1000);
  }

  // 待機のキャンセル
  async function cancelCurrentEntry() {
    try {
      const id = entryIdRef.current;
      if (!id) return;
      await ensureAnon();
      const fn = httpsCallable(getFunctions(undefined, 'asia-northeast1'), 'cancelEntry');
      await fn({ entryId: id });
    } catch {}
    finally {
      entryIdRef.current = null;
      if (heartbeatTimerRef.current) { clearInterval(heartbeatTimerRef.current); heartbeatTimerRef.current = null; }
      if (entryUnsubRef.current) { entryUnsubRef.current(); entryUnsubRef.current = null; }
    }
  }

  // ページ離脱/非表示の検知 → 5秒以上非表示ならキャンセル
  useEffect(() => {
    let hideTimer: any = null;

    const onVisibility = () => {
      if (document.hidden && isWaitingRef.current) {
        hideTimer = setTimeout(() => { cancelCurrentEntry(); }, 5000);
      } else if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
    };
    const onPageHide = () => { if (isWaitingRef.current) cancelCurrentEntry(); };

    window.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, []);

  // エントランス到達時、残CDがあれば広告表示
  useEffect(() => {
    const left = remainingCooldownSec();
    if (left > 0) startPostLeaveAd(left, null);
    return () => {
      if (cdTimerRef.current) clearInterval(cdTimerRef.current);
    };
  }, []);

  // ▼ 待機キュー参加：プロフィール同梱 + ハートビート & キャンセル ▼
  async function handleJoin(queueKey: 'country' | 'global') {
    try {
      const left = remainingCooldownSec();
      if (left > 0) {
        startPostLeaveAd(left, queueKey);
        return;
      }

      await ensureAnon();
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error('auth unavailable');

      setOwnerPrompt(false);
      setScreen('waiting');

      // 監視/タイマー停止
      if (entryUnsubRef.current) { entryUnsubRef.current(); entryUnsubRef.current = null; }
      if (heartbeatTimerRef.current) { clearInterval(heartbeatTimerRef.current); heartbeatTimerRef.current = null; }
      entryIdRef.current = null;

      const fn = httpsCallable(getFunctions(undefined, 'asia-northeast1'), 'enter');
      const profile = {
        nickname: userNickname || localStorage.getItem('amayadori_nickname') || 'あなた',
        profile: userProfile || localStorage.getItem('amayadori_profile') || '...',
        icon: userIcon || localStorage.getItem('amayadori_icon') || DEFAULT_USER_ICON,
      };

      let entryId: string | undefined;
      try {
        const res = (await fn({ queueKey, profile })) as any;
        const status = res?.data?.status as string | undefined;
        if (status === 'denied') {
          setWaitingMessage('今日は条件外でした');
          setTimeout(() => setScreen('region'), 2000);
          return;
        }
        if (status === 'cooldown') {
          const leftServer = Number(res?.data?.retryAfterSec ?? 30);
          try { localStorage.setItem('amayadori_cd_until', String(Date.now() + leftServer * 1000)); } catch {}
          startPostLeaveAd(leftServer, queueKey);
          return;
        }
        entryId = res?.data?.entryId as string | undefined;
      } catch (err) {
        console.warn('[enter] callable error, fallback to client entry', err);
      }

      if (!entryId) {
        const expiresAt = Timestamp.fromDate(new Date(Date.now() + 1000 * 60 * 2));
        const ref = await addDoc(collection(db, 'matchEntries'), {
          uid,
          queueKey,
          status: 'queued',
          createdAt: serverTimestamp(),
          lastSeenAt: serverTimestamp(),
          expiresAt,
          source: 'client-fallback',
          profile,
        });
        entryId = ref.id;
      }

      // entryId を保持
      entryIdRef.current = entryId;

      // ハートビート（10秒おきに lastSeenAt 更新）
      const touch = httpsCallable(getFunctions(undefined, 'asia-northeast1'), 'touchEntry');
      heartbeatTimerRef.current = setInterval(() => {
        const id = entryIdRef.current;
        if (!id) return;
        touch({ entryId: id }).catch(() => {});
      }, 10_000);

      // 自分の1件だけを監視 → matched で /chat へ
      entryUnsubRef.current = onSnapshot(doc(db, 'matchEntries', entryId), (snap) => {
        const d = snap.data() as any | undefined;
        if (!d) return;
        if (d.status === 'matched' && d.roomId) {
          // 片付けてルームへ
          if (entryUnsubRef.current) { entryUnsubRef.current(); entryUnsubRef.current = null; }
          if (heartbeatTimerRef.current) { clearInterval(heartbeatTimerRef.current); heartbeatTimerRef.current = null; }
          entryIdRef.current = null;
          router.push(`/chat?room=${encodeURIComponent(d.roomId)}`);
        }
        if (d.info === 'paired_today') setWaitingMessage('今日は同じ相手とは再マッチしません。別の相手を探しています…');
        else if (d.info === 'waiting') setWaitingMessage('マッチング相手を探しています…');
        if (d.status === 'denied') {
          setWaitingMessage('今日は条件外でした');
          setTimeout(() => setScreen('region'), 2000);
        }
        if (d.status === 'stale' || d.status === 'canceled' || d.status === 'expired') {
          setWaitingMessage('待機が中断されました。もう一度お試しください。');
          setTimeout(() => setScreen('region'), 1500);
        }
      });

      // 20秒でオーナー提案
      if (waitingTimerRef.current) clearTimeout(waitingTimerRef.current);
      waitingTimerRef.current = setTimeout(() => setOwnerPrompt(true), 20000);
    } catch (e: any) {
      console.error(e);
      alert(e?.message || '入室に失敗しました');
      setScreen('region');
    }
  }

  // 待機 → オーナー（モック）に切り替えるときは必ずキャンセル
  async function startChatWithOwner() {
    await cancelCurrentEntry();            // ★ 確実にキャンセル
    setOwnerPrompt(false);
    playDoor();
    setRoomName('Cafe Amayadori');
    setUserCount('オーナーとあなた');
    setTimeout(() => {
      setScreen('chat');
      setTimeout(() => {
        addOther('いらっしゃい。雨宿りかな？', 'オーナー', OWNER_ICON);
        setTimeout(() => setShowSuggestions(true), 500);
      }, 500);
    }, 600);
  }

  // 待機をやめる（ボタン）
  async function abortWaiting() {
    await cancelCurrentEntry();
    setScreen('region');
  }

  // ダミー広告（リワード）
  function showRewardedAd() {
    if (waitingTimerRef.current) clearTimeout(waitingTimerRef.current);
    setOwnerPrompt(false);
    setShowRewarded(true);
    setRewardLeft(5);
    const timer = setInterval(() => {
      setRewardLeft((v) => {
        if (v <= 1) {
          clearInterval(timer);
          setShowRewarded(false);
          waitLonger();
        }
        return v - 1;
      });
    }, 1000);
  }
  function waitLonger() {
    setWaitingMessage('もう少し待ってみます...');
    waitingTimerRef.current = setTimeout(() => {
      setWaitingMessage('マッチング相手を探しています...');
      setOwnerPrompt(true);
    }, 20000);
  }

  // 既存インタースティシャル（ダミー）
  function showInterstitialAd() { setShowInterstitial(true); }
  function closeInterstitial() {
    setShowInterstitial(false);
    setMsgs([]);
    setShowSuggestions(false);
    setDoorOpen(false);
    setScreen('profile');
  }

  // チャット送信（モック）
  function send() {
    const text = draft.trim();
    if (!text) return;
    setShowSuggestions(false);
    addMe(text);
    setDraft('');
    setTimeout(() => {
      const replies = [
        'カウンターへどうぞ。何か温かいものでも淹れようか。',
        'ここは時間がゆっくり流れているんだ。ゆっくりしていって。',
        'どんな音楽が好き？リクエストがあればかけるよ。',
        '外の音を聞いていると、落ち着くんだ。',
      ];
      const t = replies[Math.floor(Math.random() * replies.length)];
      addOther(t, 'オーナー', OWNER_ICON);
    }, 800 + Math.random() * 500);
  }
  function addMe(text: string) {
    setMsgs((m) => [
      ...m,
      { id: (crypto as any).randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()), text, isMe: true },
    ]);
  }
  function addOther(text: string, nick: string, icon: string) {
    setMsgs((m) => [
      ...m,
      {
        id: (crypto as any).randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
        text,
        isMe: false,
        nickname: nick,
        icon,
      },
    ]);
  }

  function threeSuggestions(): string[] {
    const s = [...conversationStarters];
    for (let i = s.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [s[i], s[j]] = [s[j], s[i]];
    }
    return s.slice(0, 3);
  }

  // 画面破棄時のクリーンアップ（念のため）
  useEffect(() => {
    return () => {
      if (waitingTimerRef.current) clearTimeout(waitingTimerRef.current);
      cancelCurrentEntry();
      if (cdTimerRef.current) clearInterval(cdTimerRef.current);
    };
  }, []);

  return (
    <div className="w-full h-full overflow-hidden">
      {/* 雨アニメーション */}
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

      {/* メイン */}
      <div id="app-container" className="relative z-10 w-full h-full flex items-center justify-center p-4">
        {/* プロフィール */}
        {screen === 'profile' && (
          <div id="profile-screen" className="w-full max-w-sm">
            <div className="glass-card p-8 text-center space-y-6 fade-in">
              <h1 className="text-3xl font-bold tracking-wider">Amayadori</h1>
              <p className="text-sm text-gray-400">雨がやむまで、少しだけ。</p>
              <div className="flex justify-center">
                <label className="cursor-pointer">
                  <img
                    className="w-28 h-28 rounded-full object-cover border-4 border-dashed border-gray-500 hover:border-gray-400 transition-all"
                    src={userIcon || DEFAULT_USER_ICON}
                    alt="icon preview"
                  />
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => onPickIcon(e.target.files?.[0] || undefined)}
                  />
                </label>
              </div>
              <input
                type="text"
                className="w-full px-4 py-3 input-glass"
                placeholder="ニックネーム"
                value={userNickname === 'あなた' ? '' : userNickname}
                onChange={(e) => setUserNickname(e.target.value)}
              />
              <textarea
                className="w-full px-4 py-3 input-glass h-24 resize-none"
                placeholder="ひとことプロフィール"
                value={userProfile === '...' ? '' : userProfile}
                onChange={(e) => setUserProfile(e.target.value)}
              />
              <button onClick={submitProfile} className="w-full text-white font-bold py-3 px-4 rounded-xl btn-gradient">
                次へ
              </button>
            </div>
          </div>
        )}

        {/* 国/グローバル選択 */}
        {screen === 'region' && (
          <div id="region-selection-screen" className="w-full max-w-sm">
            <div className="glass-card p-8 text-center space-y-6 fade-in">
              <h2 className="text-2xl font-bold">どちらのカフェへ？</h2>
              <p className="text-sm text-gray-400">雨宿りの場所を選んでください。</p>
              <div className="space-y-4">
                <button className="w-full text-white font-bold py-3 px-4 rounded-xl btn-gradient" onClick={() => handleJoin('country')}>
                  同じ国の人と
                </button>
                <button className="w-full text-white font-bold py-3 px-4 rounded-xl btn-secondary" onClick={() => handleJoin('global')}>
                  世界中の誰かと
                </button>

                {/* ネイティブ広告（ダミー） */}
                <div
                  className="p-3 rounded-xl border border-dashed border-yellow-500/50 text-left cursor-pointer hover:bg-yellow-500/10 transition-colors"
                  onClick={() => setCustomAlert('【PR】特別な夜のカフェへのご招待です。詳細はWebサイトをご覧ください。')}
                >
                  <p className="text-xs text-yellow-500 font-bold">【PR】</p>
                  <p className="font-semibold text-white">星降る夜のカフェへご招待</p>
                  <p className="text-sm text-gray-400">今夜だけの特別な体験を。</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 待機 */}
        {screen === 'waiting' && (
          <div id="waiting-screen" className="w-full max-w-sm text-center">
            <div className="glass-card p-8 space-y-6 fade-in">
              <div className="flex justify-center items-center">
                <div className="spinner w-12 h-12 rounded-full border-4"></div>
              </div>
              <h2 id="waiting-message" className="text-2xl font-bold">{waitingMessage}</h2>
              <p className="text-sm text-gray-400">雨の中、誰かが来るのを待っています。</p>

              {/* 待機をやめる */}
              <button className="mt-2 text-sm text-gray-300 underline" onClick={abortWaiting}>
                待機をやめて戻る
              </button>

              {ownerPrompt && (
                <div id="owner-prompt-modal" className="fade-in pt-4 mt-4 border-t border-gray-700/50">
                  <p className="mb-4">
                    雨宿りのお客様がいないようです。
                    <br />
                    カフェのオーナーと話をしますか？
                  </p>
                  <div className="flex flex-col sm:flex-row justify-center gap-4">
                    <button onClick={startChatWithOwner} className="text-white font-bold py-2 px-6 rounded-lg btn-gradient">
                      話す
                    </button>
                    <button onClick={showRewardedAd} className="text-white font-bold py-2 px-6 rounded-lg btn-secondary">
                      広告を見て待つ
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* チャット（モック） */}
        {screen === 'chat' && (
          <div id="chat-screen" className="w-full h-full flex flex-col glass-card">
            <header className="w-full p-4 border-b border-gray-700/50 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center space-x-3">
                <img id="header-icon" className="w-10 h-10 rounded-full object-cover" src={userIcon || DEFAULT_USER_ICON} alt="user icon" />
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
                <button id="end-chat-button" className="btn-exit" onClick={showInterstitialAd}>
                  退室
                </button>
              </div>
            </header>

            <main id="chat-messages" className="flex-1 p-4 overflow-y-auto flex flex-col space-y-4">
              {msgs.map((m) => (
                <div key={m.id} className={`flex items-end gap-2 ${m.isMe ? 'justify-end' : 'justify-start'}`}>
                  {!m.isMe && (
                    <img
                      className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                      src={m.icon || OWNER_ICON}
                      alt=""
                      onError={(e) => { (e.currentTarget as HTMLImageElement).src = DEFAULT_USER_ICON; }}
                    />
                  )}
                  <div className={`chat-bubble ${m.isMe ? 'me' : 'other'}`}>
                    {!m.isMe && <span className="block text-xs font-bold mb-1 text-purple-300">{m.nickname || 'オーナー'}</span>}
                    <p>{m.text}</p>
                  </div>
                  {m.isMe && (
                    <img
                      className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                      src={userIcon || DEFAULT_USER_ICON}
                      alt=""
                      onError={(e) => { (e.currentTarget as HTMLImageElement).src = DEFAULT_USER_ICON; }}
                    />
                  )}
                </div>
              ))}
            </main>

            <footer className="p-4 flex-shrink-0">
              {showSuggestions && (
                <div id="suggestion-area" className="flex-wrap justify-center gap-2 mb-3 flex">
                  {threeSuggestions().map((t: string) => (
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
                  id="message-input"
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
                  id="send-button"
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
        )}
      </div>

      {/* 扉アニメーション */}
      <div
        id="door-animation"
        className={`fixed inset-0 z-50 flex pointer-events-none ${doorOpen ? 'open' : ''} ${doorOpen ? '' : 'hidden'}`}
      >
        <div className="door left"></div>
        <div className="door right"></div>
      </div>

      {/* 既存のダミー・インタースティシャル */}
      {showInterstitial && (
        <div id="interstitial-ad-screen" className="fixed inset-0 bg-black/80 z-50 flex-col items-center justify-center flex">
          <div className="bg-gray-800 p-4 rounded-lg text-center">
            <p className="text-sm text-gray-400">広告</p>
            <div className="w-72 h-96 bg-gray-700 my-2 flex items-center justify-center">
              <p>インタースティシャル広告（ダミー）</p>
            </div>
            <button id="close-interstitial-ad" className="mt-2 text-sm text-blue-400" onClick={closeInterstitial}>
              広告を閉じる
            </button>
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

      {/* カスタムアラート（PR） */}
      {customAlert && (
        <div id="custom-alert" className="fixed inset-0 bg-black/80 z-50 items-center justify-center flex">
          <div className="glass-card p-8 text-center space-y-4 max-w-sm mx-4">
            <p id="custom-alert-message">{customAlert}</p>
            <button
              id="custom-alert-close"
              className="mt-4 text-white font-bold py-2 px-6 rounded-lg btn-secondary"
              onClick={() => setCustomAlert(null)}
            >
              閉じる
            </button>
          </div>
        </div>
      )}

      {/* 退室後広告（別タブ再入室対策） */}
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
