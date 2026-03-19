'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { doc, onSnapshot } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { auth, db, ensureAnon } from '@/lib/firebase';

const DEFAULT_USER_ICON = 'https://storage.googleapis.com/amayadori/defaultIcon.png';
const OWNER_ICON = 'https://storage.googleapis.com/amayadori/cafeownerIcon.png';
const POST_LEAVE_AD_SEC = Number(process.env.NEXT_PUBLIC_POST_LEAVE_AD_SECONDS ?? 20);

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

type FlowState = 'profile' | 'region' | 'joining' | 'waiting' | 'matched' | 'chat' | 'leaving' | 'cooldown';
type QueueKey = 'country' | 'global';
type QueueAction = 'join' | 'touch' | 'cancel';
type MatchEntryStatus = 'matched' | 'denied' | 'stale' | 'canceled' | 'expired' | 'waiting';
type Msg = { id: string; text: string; isMe: boolean; nickname?: string; icon?: string };
type Drop = { i: number; x: number; delay: number; duration: number; width: number; height: number };

type UiState = {
  waitingMessage: string;
  waitingError: string | null;
  ownerPrompt: boolean;
  showPostLeaveAd: boolean;
  postLeaveLeft: number;
  showInterstitial: boolean;
  showRewarded: boolean;
  rewardLeft: number;
  customAlert: string | null;
};

type SyncState = {
  activeQueueKey: QueueKey | null;
  pendingQueueKey: QueueKey | null;
  lastJoinQueueKey: QueueKey | null;
  isRetryingJoin: boolean;
  isCancelling: boolean;
  ownerRoomTransition: boolean;
  activeEntryId: string | null;
  joinAttemptKey: string | null;
};

const initialUiState: UiState = {
  waitingMessage: 'マッチング相手を探しています...',
  waitingError: null,
  ownerPrompt: false,
  showPostLeaveAd: false,
  postLeaveLeft: POST_LEAVE_AD_SEC,
  showInterstitial: false,
  showRewarded: false,
  rewardLeft: 5,
  customAlert: null,
};

const initialSyncState: SyncState = {
  activeQueueKey: null,
  pendingQueueKey: null,
  lastJoinQueueKey: null,
  isRetryingJoin: false,
  isCancelling: false,
  ownerRoomTransition: false,
  activeEntryId: null,
  joinAttemptKey: null,
};

const EVENT_CLEANUP_MATRIX = {
  pagehide: ['ownerPrompt timer stop', 'heartbeat stop', 'snapshot unsubscribe skipped', 'beacon cancel only'],
  matched: ['ownerPrompt timer stop', 'heartbeat stop', 'snapshot unsubscribe', 'stale UI guard on'],
  cancel: ['ownerPrompt timer stop', 'heartbeat stop', 'snapshot unsubscribe', 'pending queue clear'],
  cooldown: ['ownerPrompt timer stop', 'heartbeat stop', 'snapshot unsubscribe', 'cooldown timer start'],
  owner: ['ownerPrompt timer stop', 'heartbeat stop', 'snapshot unsubscribe', 'waiting error guard on'],
} as const;

function logFlow(label: string, payload?: Record<string, unknown>) {
  console.info(`[amayadori:${label}]`, payload ?? {});
}

function getCallableCode(error: any): string {
  return String(error?.code || '').replace(/^functions\//, '');
}

function getQueueErrorMessage(action: QueueAction, error: any): string {
  const code = getCallableCode(error);
  if (action === 'join') {
    if (code === 'resource-exhausted') return '退室直後のため、少し待ってから再試行してください。';
    if (code === 'failed-precondition') return 'いまは待機を開始できない状態です。条件をご確認のうえ、もう一度お試しください。';
    if (code === 'unavailable') return '現在サーバー側で待機を開始できません。時間をおいて再試行してください。';
    if (code === 'unauthenticated') return '認証の準備が整わなかったため、もう一度お試しください。';
  }
  if (action === 'touch') {
    if (code === 'failed-precondition') return '待機状態が更新できなくなりました。もう一度入り直してください。';
    if (code === 'permission-denied') return 'この待機状態は更新できませんでした。';
    if (code === 'unavailable') return '待機状態の更新に失敗しました。時間をおいて再試行してください。';
  }
  if (action === 'cancel') {
    if (code === 'failed-precondition') return 'この待機はすでに終了している可能性があります。画面を更新して状態をご確認ください。';
    if (code === 'permission-denied') return 'この待機を終了できませんでした。';
    if (code === 'unavailable') return '待機の終了処理に失敗しました。時間をおいて再試行してください。';
  }
  return '通信に失敗しました。時間をおいて再試行してください。';
}


function AvatarImage({
  src,
  alt,
  className,
  size,
  fallbackSrc = DEFAULT_USER_ICON,
  id,
}: {
  src: string;
  alt: string;
  className: string;
  size: number;
  fallbackSrc?: string;
  id?: string;
}) {
  const [imgSrc, setImgSrc] = useState(src || fallbackSrc);

  useEffect(() => {
    setImgSrc(src || fallbackSrc);
  }, [fallbackSrc, src]);

  return (
    <Image
      id={id}
      className={className}
      src={imgSrc || fallbackSrc}
      alt={alt}
      width={size}
      height={size}
      unoptimized
      onError={() => {
        if (imgSrc !== fallbackSrc) setImgSrc(fallbackSrc);
      }}
    />
  );
}

function resolveCancelBeaconUrl(): string {
  // @ts-ignore
  const pid = auth?.app?.options?.projectId || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  return pid ? `https://asia-northeast1-${pid}.cloudfunctions.net/cancelQueuedEntriesHttp` : '';
}

export default function Page() {
  const router = useRouter();
  const [flow, setFlow] = useState<FlowState>('profile');
  const [doorOpen, setDoorOpen] = useState(false);
  const [userNickname, setUserNickname] = useState('あなた');
  const [userIcon, setUserIcon] = useState('');
  const [userProfile, setUserProfile] = useState('...');
  const [ui, setUi] = useState<UiState>(initialUiState);
  const [syncState, setSyncState] = useState<SyncState>(initialSyncState);
  const [roomName, setRoomName] = useState('Cafe Amayadori');
  const [userCount, setUserCount] = useState('オーナーとあなた');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [drops, setDrops] = useState<Drop[]>([]);

  const waitingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rewardedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const entryUnsubRef = useRef<(() => void) | null>(null);
  const idTokenRef = useRef<string | null>(null);
  const beaconUrlRef = useRef<string>(resolveCancelBeaconUrl());
  const taRef = useRef<HTMLTextAreaElement>(null);
  const sentAmayadoriPV = useRef(false);
  const activeJoinAttemptRef = useRef<string | null>(null);
  const flowRef = useRef<FlowState>('profile');
  const syncRef = useRef(syncState);

  useEffect(() => { flowRef.current = flow; }, [flow]);
  useEffect(() => { syncRef.current = syncState; }, [syncState]);

  const isWaitingFlow = useMemo(() => flow === 'joining' || flow === 'waiting', [flow]);

  function setUiPatch(patch: Partial<UiState>) {
    setUi((prev) => ({ ...prev, ...patch }));
  }

  function setSyncPatch(patch: Partial<SyncState>) {
    setSyncState((prev) => ({ ...prev, ...patch }));
  }

  function stopOwnerPromptTimer(reason: string) {
    if (waitingTimerRef.current) {
      clearTimeout(waitingTimerRef.current);
      waitingTimerRef.current = null;
      logFlow('timer:ownerPrompt:stop', { reason });
    }
  }

  function stopHeartbeat(reason: string) {
    if (heartbeatTimerRef.current) {
      clearInterval(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
      logFlow('timer:heartbeat:stop', { reason });
    }
  }

  function stopCooldownTimer(reason: string) {
    if (cooldownTimerRef.current) {
      clearInterval(cooldownTimerRef.current);
      cooldownTimerRef.current = null;
      logFlow('timer:cooldown:stop', { reason });
    }
  }

  function stopRewardedTimer(reason: string) {
    if (rewardedTimerRef.current) {
      clearInterval(rewardedTimerRef.current);
      rewardedTimerRef.current = null;
      logFlow('timer:rewarded:stop', { reason });
    }
  }

  function detachEntryListener(reason: string) {
    if (entryUnsubRef.current) {
      entryUnsubRef.current();
      entryUnsubRef.current = null;
      logFlow('listener:entry:detach', { reason });
    }
  }

  function clearQueueRuntime(reason: string) {
    stopOwnerPromptTimer(reason);
    stopHeartbeat(reason);
    detachEntryListener(reason);
    activeJoinAttemptRef.current = null;
    setSyncPatch({ activeEntryId: null, activeQueueKey: null, joinAttemptKey: null });
  }

  function remainingCooldownSec(): number {
    try {
      const until = Number(localStorage.getItem('amayadori_cd_until') || '0');
      const left = Math.ceil((until - Date.now()) / 1000);
      return left > 0 ? left : 0;
    } catch {
      return 0;
    }
  }

  function playDoor() {
    setDoorOpen(true);
    setTimeout(() => setDoorOpen(false), 1300);
  }

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

  function buildProfile() {
    return {
      nickname: userNickname || localStorage.getItem('amayadori_nickname') || 'あなた',
      profile: userProfile || localStorage.getItem('amayadori_profile') || '...',
      icon: userIcon || localStorage.getItem('amayadori_icon') || DEFAULT_USER_ICON,
    };
  }

  async function ensureIdTokenReady() {
    const user = await ensureAnon();
    try {
      idTokenRef.current = await user.getIdToken(false);
    } catch {
      idTokenRef.current = null;
    }
  }

  function sendBeaconCancel(): boolean {
    try {
      const token = idTokenRef.current;
      const url = beaconUrlRef.current;
      if (!token || !url) return false;
      if ('sendBeacon' in navigator) {
        const body = new Blob([`idToken=${encodeURIComponent(token)}`], {
          type: 'application/x-www-form-urlencoded; charset=UTF-8',
        });
        const ok = navigator.sendBeacon(url, body);
        logFlow('pagehide:beacon', { ok, cleanup: EVENT_CLEANUP_MATRIX.pagehide });
        return ok;
      }
    } catch {
      // noop
    }
    return false;
  }

  async function cancelCurrentEntry(reason: string) {
    const current = syncRef.current;
    if (current.isCancelling) {
      logFlow('cancel:skip-duplicate', { reason, entryId: current.activeEntryId });
      return false;
    }

    setSyncPatch({ isCancelling: true });
    stopOwnerPromptTimer(`cancel:${reason}`);

    try {
      await ensureAnon();
      const fns = getFunctions(undefined, 'asia-northeast1');
      const id = syncRef.current.activeEntryId;
      if (id) {
        await httpsCallable(fns, 'cancelEntry')({ entryId: id });
      } else {
        await httpsCallable(fns, 'cancelMyQueuedEntries')({});
      }
      clearQueueRuntime(`cancel:${reason}`);
      setUiPatch({ waitingError: null, ownerPrompt: false });
      logFlow('cancel:done', { reason, cleanup: EVENT_CLEANUP_MATRIX.cancel });
      return true;
    } catch (e: any) {
      const code = getCallableCode(e);
      if (code === 'failed-precondition') {
        clearQueueRuntime(`cancel:failed-precondition:${reason}`);
        setUiPatch({ waitingError: null, ownerPrompt: false });
        return true;
      }
      console.error('[cancelCurrentEntry] failed', e);
      if (!syncRef.current.ownerRoomTransition) {
        setUiPatch({ waitingError: getQueueErrorMessage('cancel', e) });
      }
      return false;
    } finally {
      setSyncPatch({ isCancelling: false });
    }
  }

  function startOwnerPromptTimer(joinAttemptKey: string) {
    stopOwnerPromptTimer('reschedule');
    waitingTimerRef.current = setTimeout(() => {
      if (activeJoinAttemptRef.current !== joinAttemptKey) return;
      if (flowRef.current !== 'waiting') return;
      setUiPatch({ ownerPrompt: true });
      logFlow('ownerPrompt:show', { joinAttemptKey });
    }, 20_000);
    logFlow('timer:ownerPrompt:start', { joinAttemptKey });
  }

  function beginCooldown(left: number, pendingQueueKey: QueueKey | null) {
    stopCooldownTimer('restart');
    setFlow('cooldown');
    setUiPatch({ showPostLeaveAd: true, postLeaveLeft: left, ownerPrompt: false, waitingError: null });
    setSyncPatch({ pendingQueueKey, activeQueueKey: null });
    logFlow('cooldown:start', { left, pendingQueueKey, cleanup: EVENT_CLEANUP_MATRIX.cooldown });

    cooldownTimerRef.current = setInterval(() => {
      setUi((prev) => {
        if (prev.postLeaveLeft <= 1) {
          stopCooldownTimer('finished');
          try { localStorage.removeItem('amayadori_cd_until'); } catch {}
          setTimeout(() => {
            setUiPatch({ showPostLeaveAd: false, postLeaveLeft: 0 });
            const pending = syncRef.current.pendingQueueKey;
            setSyncPatch({ pendingQueueKey: null });
            if (pending) {
              void beginJoinFlow(pending, 'cooldown-resume');
            } else {
              setFlow('region');
            }
          }, 0);
          return { ...prev, postLeaveLeft: 0 };
        }
        return { ...prev, postLeaveLeft: prev.postLeaveLeft - 1 };
      });
      return undefined as never;
    }, 1000);
  }

  function startHeartbeat(entryId: string, joinAttemptKey: string) {
    stopHeartbeat('reschedule');
    const touch = httpsCallable(getFunctions(undefined, 'asia-northeast1'), 'touchEntry');
    heartbeatTimerRef.current = setInterval(() => {
      if (activeJoinAttemptRef.current !== joinAttemptKey) return;
      touch({ entryId }).catch((err) => {
        const code = getCallableCode(err);
        console.warn('[touchEntry] callable failed', err);
        if (!['failed-precondition', 'permission-denied', 'unavailable'].includes(code)) return;
        clearQueueRuntime(`touch:${code}`);
        if (flowRef.current === 'matched' || syncRef.current.ownerRoomTransition) return;
        setFlow('waiting');
        setUiPatch({
          waitingMessage: '待機が中断されました。',
          waitingError: getQueueErrorMessage('touch', err),
          ownerPrompt: false,
        });
      });
    }, 10_000);
    logFlow('timer:heartbeat:start', { entryId, joinAttemptKey });
  }

  function handleEntrySnapshot(entryId: string, joinAttemptKey: string) {
    if (!db) {
      setFlow('profile');
      setUiPatch({ waitingError: '接続設定を確認してください。' });
      return;
    }

    detachEntryListener('replace');
    entryUnsubRef.current = onSnapshot(doc(db, 'matchEntries', entryId), (snap) => {
      if (activeJoinAttemptRef.current !== joinAttemptKey) return;
      if (syncRef.current.ownerRoomTransition) return;
      const d = snap.data() as ({ status?: MatchEntryStatus; roomId?: string; info?: string } & Record<string, unknown>) | undefined;
      if (!d) return;

      if (d.status === 'matched' && d.roomId) {
        clearQueueRuntime('matched');
        setFlow('matched');
        logFlow('matched', { roomId: d.roomId, cleanup: EVENT_CLEANUP_MATRIX.matched });
        router.push(`/chat?room=${encodeURIComponent(d.roomId)}`);
        return;
      }

      if (d.info === 'paired_today') {
        setUiPatch({ waitingMessage: '今日は同じ相手とは再マッチしません。別の相手を探しています…' });
      } else if (d.info === 'waiting') {
        setUiPatch({ waitingMessage: 'マッチング相手を探しています…' });
      }

      if (d.status === 'denied') {
        clearQueueRuntime('denied');
        setFlow('region');
        setUiPatch({ waitingMessage: '今日は条件外でした', ownerPrompt: false });
        return;
      }

      if (d.status === 'stale' || d.status === 'canceled' || d.status === 'expired') {
        clearQueueRuntime(`terminal:${d.status}`);
        if (flowRef.current === 'matched' || syncRef.current.ownerRoomTransition) return;
        setFlow('waiting');
        setUiPatch({
          waitingMessage: '待機が中断されました。',
          waitingError: '待機状態が終了したため、再度参加してください。',
          ownerPrompt: false,
        });
      }
    });
    logFlow('listener:entry:attach', { entryId, joinAttemptKey });
  }

  async function enterQueue(queueKey: QueueKey, joinAttemptKey: string) {
    const fn = httpsCallable(getFunctions(undefined, 'asia-northeast1'), 'enter');
    const res = (await fn({ queueKey, profile: buildProfile() })) as any;
    const entryId = res?.data?.entryId as string | undefined;
    if (!entryId) throw new Error('enter returned without entryId');
    if (activeJoinAttemptRef.current !== joinAttemptKey) return;

    setFlow('waiting');
    setSyncPatch({ activeEntryId: entryId, activeQueueKey: queueKey });
    startHeartbeat(entryId, joinAttemptKey);
    handleEntrySnapshot(entryId, joinAttemptKey);
    startOwnerPromptTimer(joinAttemptKey);
  }

  async function beginJoinFlow(queueKey: QueueKey, source: 'user' | 'retry' | 'cooldown-resume' = 'user') {
    const joinAttemptKey = `${queueKey}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    activeJoinAttemptRef.current = joinAttemptKey;
    clearQueueRuntime(`prejoin:${source}`);
    setFlow('joining');
    setSyncPatch({
      activeQueueKey: queueKey,
      lastJoinQueueKey: queueKey,
      isRetryingJoin: true,
      joinAttemptKey,
    });
    setUiPatch({
      waitingMessage: 'マッチング相手を探しています...',
      waitingError: null,
      ownerPrompt: false,
    });
    logFlow('join:start', { queueKey, source, joinAttemptKey });

    try {
      const left = remainingCooldownSec();
      if (left > 0) {
        beginCooldown(left, queueKey);
        return;
      }

      await ensureAnon();
      await ensureIdTokenReady();
      if (!auth?.currentUser?.uid) throw new Error('auth unavailable');
      await enterQueue(queueKey, joinAttemptKey);
    } catch (e: any) {
      console.error('[enter] failed', e);
      const code = getCallableCode(e);
      const retryAfterSec = Number(e?.details?.retryAfterSec ?? 0);
      setFlow('waiting');
      setUiPatch({
        waitingMessage: '待機を開始できませんでした。',
        waitingError: getQueueErrorMessage('join', e),
        ownerPrompt: false,
      });
      if (code === 'resource-exhausted' && retryAfterSec > 0) {
        try { localStorage.setItem('amayadori_cd_until', String(Date.now() + retryAfterSec * 1000)); } catch {}
        beginCooldown(retryAfterSec, queueKey);
      }
    } finally {
      setSyncPatch({ isRetryingJoin: false });
    }
  }

  async function abortWaiting() {
    const ok = await cancelCurrentEntry('abortWaiting');
    if (ok) {
      setFlow('region');
      setUiPatch({ waitingError: null, ownerPrompt: false });
    }
  }

  async function startOwnerRoomTransition() {
    setSyncPatch({ ownerRoomTransition: true });
    clearQueueRuntime('owner-transition');
    setFlow('matched');
    setUiPatch({ ownerPrompt: false, waitingError: null });
    playDoor();
    setRoomName('Cafe Amayadori');
    setUserCount('オーナーとあなた');
    setMsgs([]);
    setShowSuggestions(false);
    setTimeout(() => setFlow('chat'), 10);

    await cancelCurrentEntry('owner-transition');

    await ensureAnon();
    try {
      const fns = getFunctions(undefined, 'asia-northeast1');
      const res = await httpsCallable(fns, 'startOwnerRoom')({ profile: buildProfile() }) as any;
      const roomId = res?.data?.roomId as string | undefined;
      if (roomId) {
        setTimeout(() => { router.replace(`/chat?room=${encodeURIComponent(roomId)}`); }, 150);
        return;
      }
    } catch (e) {
      console.error('[startOwnerRoom] failed, fallback to mock', e);
    } finally {
      setSyncPatch({ ownerRoomTransition: false });
    }

    setTimeout(() => {
      addOther('いらっしゃい。雨宿りかな？', 'オーナー', OWNER_ICON);
      setTimeout(() => setShowSuggestions(true), 500);
    }, 300);
  }

  function startRewardedWaitExtension() {
    stopOwnerPromptTimer('rewarded');
    stopRewardedTimer('reschedule');
    setUiPatch({ ownerPrompt: false, showRewarded: true, rewardLeft: 5 });
    rewardedTimerRef.current = setInterval(() => {
      setUi((prev) => {
        if (prev.rewardLeft <= 1) {
          stopRewardedTimer('finished');
          stopOwnerPromptTimer('rewarded-finished');
          waitingTimerRef.current = setTimeout(() => {
            setUiPatch({ waitingMessage: 'マッチング相手を探しています...', ownerPrompt: true });
          }, 20_000);
          return { ...prev, showRewarded: false, rewardLeft: 0, waitingMessage: 'もう少し待ってみます...' };
        }
        return { ...prev, rewardLeft: prev.rewardLeft - 1 };
      });
      return undefined as never;
    }, 1000);
  }

  function onPickIcon(file?: File) {
    if (!file) {
      setUserIcon('');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => setUserIcon(String(e.target?.result || ''));
    reader.readAsDataURL(file);
  }

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
    setFlow('region');
  }

  function showInterstitialAd() {
    setUiPatch({ showInterstitial: true });
  }

  function closeInterstitial() {
    setUiPatch({ showInterstitial: false });
    setMsgs([]);
    setShowSuggestions(false);
    setDoorOpen(false);
    setFlow('profile');
  }

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
      addOther(replies[Math.floor(Math.random() * replies.length)], 'オーナー', OWNER_ICON);
    }, 800 + Math.random() * 500);
  }

  function addMe(text: string) {
    setMsgs((m) => [...m, { id: crypto.randomUUID(), text, isMe: true }]);
  }

  function addOther(text: string, nickname: string, icon: string) {
    setMsgs((m) => [...m, { id: crypto.randomUUID(), text, isMe: false, nickname, icon }]);
  }

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

  useEffect(() => {
    if (sentAmayadoriPV.current) return;
    sentAmayadoriPV.current = true;
    (async () => {
      try {
        await ensureAnon();
        await httpsCallable(getFunctions(undefined, 'asia-northeast1'), 'trackVisit')({
          page: 'amayadori',
          src: typeof document !== 'undefined' ? document.referrer : '',
        });
      } catch {
        // noop
      }
    })();
  }, []);

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
    if (!auth) {
      idTokenRef.current = null;
      return;
    }

    const unsub = auth.onIdTokenChanged(async (u) => {
      if (!u) {
        idTokenRef.current = null;
        return;
      }
      try {
        idTokenRef.current = await u.getIdToken(false);
      } catch {
        idTokenRef.current = null;
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const onPageHide = () => {
      if (!isWaitingFlow) return;
      const ok = sendBeaconCancel();
      if (ok) return;
      try {
        const token = idTokenRef.current;
        const url = beaconUrlRef.current;
        if (!token || !url) return;
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `idToken=${encodeURIComponent(token)}`,
          keepalive: true,
          mode: 'no-cors',
        });
      } catch {
        // noop
      }
    };
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, [isWaitingFlow]);

  useEffect(() => {
    const left = remainingCooldownSec();
    if (left > 0) {
      stopCooldownTimer('mount-restart');
      setFlow('cooldown');
      setUiPatch({ showPostLeaveAd: true, postLeaveLeft: left, ownerPrompt: false, waitingError: null });
      setSyncPatch({ pendingQueueKey: null, activeQueueKey: null });
      cooldownTimerRef.current = setInterval(() => {
        setUi((prev) => {
          if (prev.postLeaveLeft <= 1) {
            stopCooldownTimer('finished');
            try { localStorage.removeItem('amayadori_cd_until'); } catch {}
            setTimeout(() => {
              setUiPatch({ showPostLeaveAd: false, postLeaveLeft: 0 });
              setFlow('region');
            }, 0);
            return { ...prev, postLeaveLeft: 0 };
          }
          return { ...prev, postLeaveLeft: prev.postLeaveLeft - 1 };
        });
        return undefined as never;
      }, 1000);
    }
    return () => {
      stopOwnerPromptTimer('unmount');
      stopHeartbeat('unmount');
      stopCooldownTimer('unmount');
      stopRewardedTimer('unmount');
      detachEntryListener('unmount');
    };
  }, []);

  return (
    <div className="w-full h-full overflow-hidden">
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
        {flow === 'profile' && (
          <div id="profile-screen" className="w-full max-w-sm">
            <div className="glass-card p-8 text-center space-y-6 fade-in">
              <h1 className="text-3xl font-bold tracking-wider">Amayadori</h1>
              <p className="text-sm text-gray-400">雨がやむまで、少しだけ。</p>
              <div className="flex justify-center">
                <label className="cursor-pointer">
                  <AvatarImage className="w-28 h-28 rounded-full object-cover border-4 border-dashed border-gray-500 hover:border-gray-400 transition-all" src={userIcon || DEFAULT_USER_ICON} alt="icon preview" size={112} />
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => onPickIcon(e.target.files?.[0] || undefined)} />
                </label>
              </div>
              <input type="text" className="w-full px-4 py-3 input-glass" placeholder="ニックネーム" value={userNickname === 'あなた' ? '' : userNickname} onChange={(e) => setUserNickname(e.target.value)} />
              <textarea className="w-full px-4 py-3 input-glass h-24 resize-none" placeholder="ひとことプロフィール" value={userProfile === '...' ? '' : userProfile} onChange={(e) => setUserProfile(e.target.value)} />
              <button onClick={submitProfile} className="w-full text-white font-bold py-3 px-4 rounded-xl btn-gradient">次へ</button>
            </div>
          </div>
        )}

        {flow === 'region' && (
          <div id="region-selection-screen" className="w-full max-w-sm">
            <div className="glass-card p-8 text-center space-y-6 fade-in">
              <h2 className="text-2xl font-bold">どちらのカフェへ？</h2>
              <p className="text-sm text-gray-400">雨宿りの場所を選んでください。</p>
              <div className="space-y-4">
                <button className="w-full text-white font-bold py-3 px-4 rounded-xl btn-gradient" onClick={() => void beginJoinFlow('country')}>
                  同じ国の人と
                </button>
                <button className="w-full text-white font-bold py-3 px-4 rounded-xl btn-secondary" onClick={() => void beginJoinFlow('global')}>
                  世界中の誰かと
                </button>
                <div className="p-3 rounded-xl border border-dashed border-yellow-500/50 text-left cursor-pointer hover:bg-yellow-500/10 transition-colors" onClick={() => setUiPatch({ customAlert: '【PR】特別な夜のカフェへのご招待です。詳細はWebサイトをご覧ください。' })}>
                  <p className="text-xs text-yellow-500 font-bold">【PR】</p>
                  <p className="font-semibold text-white">星降る夜のカフェへご招待</p>
                  <p className="text-sm text-gray-400">今夜だけの特別な体験を。</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {(flow === 'joining' || flow === 'waiting') && (
          <div id="waiting-screen" className="w-full max-w-sm text-center">
            <div className="glass-card p-8 space-y-6 fade-in">
              <div className="flex justify-center items-center"><div className="spinner w-12 h-12 rounded-full border-4"></div></div>
              <h2 id="waiting-message" className="text-2xl font-bold">{flow === 'joining' ? '待機を開始しています...' : ui.waitingMessage}</h2>
              <p className="text-sm text-gray-400">雨の中、誰かが来るのを待っています。</p>

              {ui.waitingError && (
                <div className="rounded-xl border border-red-400/40 bg-red-500/10 p-4 text-left text-sm text-red-100 space-y-3">
                  <p>{ui.waitingError}</p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button className="rounded-lg bg-white/10 px-4 py-2 font-semibold text-white disabled:opacity-50" onClick={() => syncState.lastJoinQueueKey && void beginJoinFlow(syncState.lastJoinQueueKey, 'retry')} disabled={!syncState.lastJoinQueueKey || syncState.isRetryingJoin || syncState.isCancelling}>
                      {syncState.isRetryingJoin ? '再試行中...' : 'もう一度試す'}
                    </button>
                    <button className="rounded-lg border border-white/20 px-4 py-2 text-white/90" onClick={() => setFlow('region')} disabled={syncState.isCancelling}>
                      エントランスへ戻る
                    </button>
                  </div>
                </div>
              )}

              <button className="mt-2 text-sm text-gray-300 underline disabled:opacity-50" onClick={() => void abortWaiting()} disabled={syncState.isCancelling}>
                {syncState.isCancelling ? 'キャンセル中...' : '待機をやめて戻る'}
              </button>

              {ui.ownerPrompt && (
                <div id="owner-prompt-modal" className="fade-in pt-4 mt-4 border-t border-gray-700/50">
                  <p className="mb-4">雨宿りのお客様がいないようです。<br />カフェのオーナーと話をしますか？</p>
                  <div className="flex flex-col sm:flex-row justify-center gap-4">
                    <button onClick={() => void startOwnerRoomTransition()} className="text-white font-bold py-2 px-6 rounded-lg btn-gradient">話す</button>
                    <button onClick={startRewardedWaitExtension} className="text-white font-bold py-2 px-6 rounded-lg btn-secondary">広告を見て待つ</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {flow === 'chat' && (
          <div id="chat-screen" className="w-full h-full flex flex-col glass-card">
            <header className="w-full p-4 border-b border-gray-700/50 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center space-x-3">
                <AvatarImage id="header-icon" className="w-10 h-10 rounded-full object-cover" src={userIcon || DEFAULT_USER_ICON} alt="user icon" size={40} />
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
              {msgs.map((m) => (
                <div key={m.id} className={`flex items-end gap-2 ${m.isMe ? 'justify-end' : 'justify-start'}`}>
                  {!m.isMe && <AvatarImage className="w-8 h-8 rounded-full object-cover flex-shrink-0" src={m.icon || OWNER_ICON} alt="" size={32} />}
                  <div className={`chat-bubble ${m.isMe ? 'me' : 'other'}`}>
                    {!m.isMe && <span className="block text-xs font-bold mb-1 text-purple-300">{m.nickname || 'オーナー'}</span>}
                    <p>{m.text}</p>
                  </div>
                  {m.isMe && <AvatarImage className="w-8 h-8 rounded-full object-cover flex-shrink-0" src={userIcon || DEFAULT_USER_ICON} alt="" size={32} />}
                </div>
              ))}
            </main>
            <footer className="p-4 flex-shrink-0">
              {showSuggestions && (
                <div id="suggestion-area" className="flex-wrap justify-center gap-2 mb-3 flex">
                  {conversationStarters.slice(0, 3).map((t) => (
                    <button key={t} className="suggestion-btn" onClick={() => { setDraft(t); setShowSuggestions(false); setTimeout(() => taRef.current?.focus(), 0); }}>{t}</button>
                  ))}
                </div>
              )}
              <div className="flex items-center space-x-3">
                <textarea id="message-input" ref={taRef} className="flex-1 px-4 py-3 message-textarea" placeholder="メッセージを送信..." rows={1} value={draft} onChange={(e) => { setDraft(e.target.value); autoResize(); }} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
                <button id="send-button" className="w-12 h-12 rounded-full text-white flex items-center justify-center btn-gradient flex-shrink-0" onClick={send}><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg></button>
              </div>
            </footer>
          </div>
        )}
      </div>

      <div id="door-animation" className={`fixed inset-0 z-50 flex pointer-events-none ${doorOpen ? 'open' : ''} ${doorOpen ? '' : 'hidden'}`}><div className="door left"></div><div className="door right"></div></div>

      {ui.showInterstitial && (
        <div id="interstitial-ad-screen" className="fixed inset-0 bg-black/80 z-50 flex-col items-center justify-center flex">
          <div className="bg-gray-800 p-4 rounded-lg text-center">
            <p className="text-sm text-gray-400">広告</p>
            <div className="w-72 h-96 bg-gray-700 my-2 flex items-center justify-center"><p>インタースティシャル広告（ダミー）</p></div>
            <button id="close-interstitial-ad" className="mt-2 text-sm text-blue-400" onClick={closeInterstitial}>広告を閉じる</button>
          </div>
        </div>
      )}

      {ui.showRewarded && (
        <div id="rewarded-ad-screen" className="fixed inset-0 bg-black/80 z-50 flex-col items-center justify-center flex">
          <div className="glass-card p-8 text-center space-y-4">
            <div className="spinner w-12 h-12 rounded-full border-4 mx-auto"></div>
            <h2 className="text-xl font-bold">リワード広告を視聴中...</h2>
            <p id="reward-timer" className="text-lg">{ui.rewardLeft}</p>
          </div>
        </div>
      )}

      {ui.customAlert && (
        <div id="custom-alert" className="fixed inset-0 bg-black/80 z-50 items-center justify-center flex">
          <div className="glass-card p-8 text-center space-y-4 max-w-sm mx-4">
            <p id="custom-alert-message">{ui.customAlert}</p>
            <button id="custom-alert-close" className="mt-4 text-white font-bold py-2 px-6 rounded-lg btn-secondary" onClick={() => setUiPatch({ customAlert: null })}>閉じる</button>
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
