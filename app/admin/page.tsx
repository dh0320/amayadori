// app/admin/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  collection, doc, documentId, getDoc, getDocs,
  getCountFromServer, limit, orderBy, query, where,
  type Query as FsQuery,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';

/** ---------- 型 ---------- */
type DailyRow = {
  day: string;
  visits_total?: number; visitors_unique_total?: number;
  queue_enter_total?: number; queue_enter_country_total?: number; queue_enter_global_total?: number;
  queue_denied_total?: number; queue_cooldown_total?: number;
  match_made_total?: number; owner_room_started_total?: number;
  messages_total?: number; messages_to_human_total?: number; messages_to_owner_total?: number; messages_from_owner_total?: number;
  rooms_ended_total?: number; room_total_duration_sec?: number;
  rooms_ended_owner_total?: number; room_owner_total_duration_sec?: number;
  rooms_ended_human_total?: number; room_human_total_duration_sec?: number;
  updatedAt?: any;
};
type LiveCounts = {
  queued_total: number; queued_country: number; queued_global: number;
  open_rooms_total: number; open_rooms_owner: number;
};
type RecentRoom = { roomId: string; isOwnerRoom: boolean; durationSec: number; day: string; reason: string; };

/** ---------- ユーティリティ ---------- */
const fmt = new Intl.NumberFormat('ja-JP');
const formatInt = (n?: number) => fmt.format(n || 0);
function formatSec(sec?: number) {
  const s = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${m}:${String(ss).padStart(2, '0')}`;
}
const safeAvg = (totalSec?: number, count?: number) => (!totalSec || !count) ? 0 : totalSec / Math.max(1, count);
function dayKeyJst(): string { return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); }

/** ---------- getCount の堅牢ラッパ：失敗しても 0 を返す ---------- */
async function safeCount(q: FsQuery, label: string): Promise<number> {
  try {
    const s = await getCountFromServer(q);
    return Number(s.data().count || 0);
  } catch (e) {
    console.warn(`[admin] count("${label}") failed (index or rules?):`, e);
    return 0;
  }
}

/** ---------- メイン ---------- */
export default function AdminPage() {
  const r = useRouter();

  const [ready, setReady] = useState(false);
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [today, setToday] = useState<DailyRow | null>(null);
  const [live, setLive] = useState<LiveCounts | null>(null);
  const [recentRooms, setRecentRooms] = useState<RecentRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // ページアクセスのトラッキング（認証不要）
  useEffect(() => {
    try {
      const fn = httpsCallable(getFunctions(undefined, 'asia-northeast1'), 'trackVisit');
      fn({ page: 'other', src: 'admin' }).catch(() => {});
    } catch {}
  }, []);

  // 認証/権限ガード：非ログイン or 匿名 → /admin/login、ログイン済は checkAdmin へ
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setErr(null);
      try {
        if (!u || u.isAnonymous) {
          setAdmin(false); setReady(true);
          r.replace('/admin/login'); // ログインへ誘導
          return;
        }
        const fns = getFunctions(undefined, 'asia-northeast1');
        // ★ ここは「元の仕様」のまま：Functions の checkAdmin を使用
        const { data } = await httpsCallable(fns, 'checkAdmin')({});
        const ok = !!(data as any)?.ok;
        setAdmin(ok);
      } catch (e: any) {
        setErr(e?.message || 'failed to verify admin');
        setAdmin(false);
      } finally {
        setReady(true);
      }
    });
    return () => unsub();
  }, [r]);

  // データ読み込み（管理者のみ実行）
  async function loadAll() {
    setLoading(true); setErr(null);
    try {
      /* ---------- 日次（直近30日） ----------
         まず「元のクエリ」を試し、失敗したらフォールバックで全件→idソート */
      let rowsDesc: DailyRow[] = [];
      try {
        const qDaily = query(collection(db, 'metrics_daily'), orderBy(documentId(), 'desc'), limit(30));
        const snap = await getDocs(qDaily);
        rowsDesc = snap.docs.map(d => ({ day: d.id, ...(d.data() as any) }));
      } catch (e) {
        console.warn('[admin] metrics_daily fallback to client-side sort:', e);
        const all = await getDocs(collection(db, 'metrics_daily'));
        const rowsAll: DailyRow[] = all.docs.map(d => ({ day: d.id, ...(d.data() as any) }));
        rowsAll.sort((a, b) => b.day.localeCompare(a.day)); // desc
        rowsDesc = rowsAll.slice(0, 30);
      }
      setDaily(rowsDesc.reverse()); // 表示は昇順

      // 今日（JST）
      const todayId = dayKeyJst();
      const tSnap = await getDoc(doc(db, 'metrics_daily', todayId));
      setToday(tSnap.exists() ? ({ day: todayId, ...(tSnap.data() as any) }) : ({ day: todayId }));

      /* ---------- ライブ数 ----------
         既存クエリは維持しつつ safeCount で堅牢化。
         open_rooms_owner は 2 パターンを順に試す（members / isOwnerRoom） */
      const queued_total   = await safeCount(query(collection(db, 'matchEntries'), where('status', '==', 'queued')), 'queued_total');
      const queued_country = await safeCount(query(collection(db, 'matchEntries'), where('status', '==', 'queued'), where('queueKey', '==', 'country')), 'queued_country');
      const queued_global  = await safeCount(query(collection(db, 'matchEntries'), where('status', '==', 'queued'), where('queueKey', '==', 'global')),  'queued_global');
      const open_rooms_total = await safeCount(query(collection(db, 'rooms'), where('status', '==', 'open')), 'open_rooms_total');

      // ① 元の members array-contains
      let open_rooms_owner = await safeCount(
        query(collection(db, 'rooms'), where('status', '==', 'open'), where('members', 'array-contains', 'ownerAI')),
        'open_rooms_owner(members)'
      );
      // ② フォールバック：isOwnerRoom==true
      if (open_rooms_owner === 0) {
        const alt = await safeCount(
          query(collection(db, 'rooms'), where('status', '==', 'open'), where('isOwnerRoom', '==', true)),
          'open_rooms_owner(isOwnerRoom)'
        );
        // どちらか成功した値を採用（両方0なら0）
        if (alt > 0) open_rooms_owner = alt;
      }

      setLive({ queued_total, queued_country, queued_global, open_rooms_total, open_rooms_owner });

      // 直近終了ルーム（既存どおり）
      const qRooms = query(collection(db, 'metrics_rooms'), orderBy('committedAt', 'desc'), limit(10));
      const rSnap = await getDocs(qRooms);
      const recent = rSnap.docs.map(d => {
        const v = d.data() as any;
        return {
          roomId: v.roomId || d.id,
          isOwnerRoom: !!v.isOwnerRoom,
          durationSec: Number(v.durationSec || 0),
          day: String(v.day || ''),
          reason: String(v.closedReason || 'unknown'),
        } as RecentRoom;
      });
      setRecentRooms(recent);
    } catch (e: any) {
      console.error(e);
      setErr(e?.message || 'failed to load data');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (ready && admin) loadAll(); }, [ready, admin]);

  const todayAvgAll   = useMemo(() => formatSec(safeAvg(today?.room_total_duration_sec,   today?.rooms_ended_total)),          [today]);
  const todayAvgOwner = useMemo(() => formatSec(safeAvg(today?.room_owner_total_duration_sec, today?.rooms_ended_owner_total)), [today]);
  const todayAvgHuman = useMemo(() => formatSec(safeAvg(today?.room_human_total_duration_sec, today?.rooms_ended_human_total)), [today]);

  // CSV（元のまま）
  function downloadCsv() {
    const header = ['day','rooms_ended_total','room_total_duration_sec','avg_duration_sec','rooms_ended_owner_total','room_owner_total_duration_sec','avg_owner_sec','rooms_ended_human_total','room_human_total_duration_sec','avg_human_sec','messages_total','messages_to_owner_total','messages_from_owner_total','messages_to_human_total','match_made_total','owner_room_started_total','queue_enter_total','queue_enter_country_total','queue_enter_global_total','queue_denied_total','queue_cooldown_total','visits_total','visitors_unique_total'];
    const lines = [header.join(',')];
    daily.forEach((d) => {
      const avgAll = safeAvg(d.room_total_duration_sec, d.rooms_ended_total);
      const avgOwner = safeAvg(d.room_owner_total_duration_sec, d.rooms_ended_owner_total);
      const avgHuman = safeAvg(d.room_human_total_duration_sec, d.rooms_ended_human_total);
      const row = [d.day, d.rooms_ended_total||0, d.room_total_duration_sec||0, Math.round(avgAll), d.rooms_ended_owner_total||0, d.room_owner_total_duration_sec||0, Math.round(avgOwner), d.rooms_ended_human_total||0, d.room_human_total_duration_sec||0, Math.round(avgHuman), d.messages_total||0, d.messages_to_owner_total||0, d.messages_from_owner_total||0, d.messages_to_human_total||0, d.match_made_total||0, d.owner_room_started_total||0, d.queue_enter_total||0, d.queue_enter_country_total||0, d.queue_enter_global_total||0, d.queue_denied_total||0, d.queue_cooldown_total||0, d.visits_total||0, d.visitors_unique_total||0];
      lines.push(row.join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `amayadori_metrics_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  // UI：ガード（元のまま）
  if (admin === false) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="glass-card max-w-md w-full p-8 text-center space-y-4">
          <h1 className="text-2xl font-bold">Access denied</h1>
          <p className="text-sm text-gray-400">このページは管理者のみアクセス可能です。</p>
          {auth.currentUser && (
            <div className="text-xs text-gray-500">
              <p>現在ログイン中: {auth.currentUser.email || '(メール未設定)'}</p>
              <p>UID: <span className="font-mono">{auth.currentUser.uid}</span></p>
              <p className="mt-2">Firestore <code>config/admins</code> の <code>uids</code> 配列にこの UID を追加してください。</p>
            </div>
          )}
          <div className="pt-4">
            <Link href="/admin/login" className="btn-secondary">ログイン画面へ</Link>
          </div>
        </div>
      </div>
    );
  }
  if (!ready || admin === null) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="glass-card max-w-sm w-full p-6 text-center">
          <div className="spinner w-10 h-10 rounded-full border-4 mx-auto mb-4"></div>
          <p>読み込み中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6">
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">運営ダッシュボード（MVP）</h1>
        <div className="flex items-center gap-3">
          <button onClick={loadAll} className="btn-secondary disabled:opacity-50" disabled={loading}>更新</button>
          <button onClick={downloadCsv} className="btn-gradient">CSV</button>
          <Link href="/" className="text-sm underline text-gray-300">サイトへ</Link>
        </div>
      </header>

      {err && <div className="glass-card p-4 mb-4 text-red-300">{String(err)}</div>}

      {/* 今日（JST） */}
      <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="glass-card p-4"><p className="text-xs text-gray-400">今日のルーム終了（合計）</p><p className="text-2xl font-bold">{formatInt(today?.rooms_ended_total)}</p><p className="text-xs text-gray-400 mt-1">平均 {formatSec(safeAvg(today?.room_total_duration_sec, today?.rooms_ended_total))}</p></div>
        <div className="glass-card p-4"><p className="text-xs text-gray-400">今日のルーム終了（対AI）</p><p className="text-2xl font-bold">{formatInt(today?.rooms_ended_owner_total)}</p><p className="text-xs text-gray-400 mt-1">平均 {todayAvgOwner}</p></div>
        <div className="glass-card p-4"><p className="text-xs text-gray-400">今日のルーム終了（対人）</p><p className="text-2xl font-bold">{formatInt(today?.rooms_ended_human_total)}</p><p className="text-xs text-gray-400 mt-1">平均 {todayAvgHuman}</p></div>
        <div className="glass-card p-4"><p className="text-xs text-gray-400">今日のメッセージ総数</p><p className="text-2xl font-bold">{formatInt(today?.messages_total)}</p><p className="text-xs text-gray-400 mt-1">対AI {formatInt(today?.messages_to_owner_total)} / 対人 {formatInt(today?.messages_to_human_total)}</p></div>
      </section>

      {/* ライブ概況 */}
      <section className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <div className="glass-card p-4"><p className="text-xs text-gray-400">現在キュー待機（合計 / 国 / 世界）</p><p className="text-2xl font-bold">{live ? `${live.queued_total} / ${live.queued_country} / ${live.queued_global}` : '--'}</p></div>
        <div className="glass-card p-4"><p className="text-xs text-gray-400">現在オープン中ルーム（合計 / AI）</p><p className="text-2xl font-bold">{live ? `${live.open_rooms_total} / ${live.open_rooms_owner}` : '--'}</p></div>
        <div className="glass-card p-4"><p className="text-xs text-gray-400">今日（UTC）訪問数 / ユニーク</p><p className="text-2xl font-bold">{formatInt(today?.visits_total)} / {formatInt(today?.visitors_unique_total)}</p><p className="text-xs text-gray-500 mt-1">※ visits_* は UTC キー集計</p></div>
      </section>

      {/* 直近の終了ルーム */}
      <section className="mb-8">
        <h2 className="text-lg font-bold mb-2">直近の終了ルーム（10件）</h2>
        <div className="glass-card overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-gray-400"><tr><th className="text-left p-3">Day</th><th className="text-left p-3">Room</th><th className="text-left p-3">Type</th><th className="text-left p-3">Duration</th><th className="text-left p-3">Reason</th></tr></thead>
            <tbody>
              {recentRooms.map(x => (
                <tr key={x.roomId} className="border-t border-gray-700/40">
                  <td className="p-3">{x.day}</td>
                  <td className="p-3 font-mono text-xs">{x.roomId}</td>
                  <td className="p-3">{x.isOwnerRoom ? 'AI' : '人間'}</td>
                  <td className="p-3">{formatSec(x.durationSec)}</td>
                  <td className="p-3 text-gray-400">{x.reason}</td>
                </tr>
              ))}
              {recentRooms.length === 0 && <tr><td className="p-3 text-gray-400" colSpan={5}>データがありません</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {/* 日次（直近30日） */}
      <section>
        <h2 className="text-lg font-bold mb-2">日次KPI（直近30日）</h2>
        <div className="glass-card overflow-x-auto">
          <table className="min-w-[1000px] text-sm">
            <thead className="text-gray-400">
              <tr>
                <th className="text-left p-3">Day</th>
                <th className="text-right p-3">Rooms End</th>
                <th className="text-right p-3">Avg(All)</th>
                <th className="text-right p-3">End(AI)</th>
                <th className="text-right p-3">Avg(AI)</th>
                <th className="text-right p-3">End(Human)</th>
                <th className="text-right p-3">Avg(Human)</th>
                <th className="text-right p-3">Msgs</th>
                <th className="text-right p-3">Msgs→AI</th>
                <th className="text-right p-3">Msgs from AI</th>
                <th className="text-right p-3">Msgs→Human</th>
                <th className="text-right p-3">Match</th>
                <th className="text-right p-3">OwnerStart</th>
                <th className="text-right p-3">Queue</th>
                <th className="text-right p-3">Visits(UTC)</th>
                <th className="text-right p-3">UV(UTC)</th>
              </tr>
            </thead>
            <tbody>
              {daily.map(d => {
                const avgAll = formatSec(safeAvg(d.room_total_duration_sec, d.rooms_ended_total));
                const avgOwner = formatSec(safeAvg(d.room_owner_total_duration_sec, d.rooms_ended_owner_total));
                const avgHuman = formatSec(safeAvg(d.room_human_total_duration_sec, d.rooms_ended_human_total));
                return (
                  <tr key={d.day} className="border-t border-gray-700/40">
                    <td className="p-3">{d.day}</td>
                    <td className="p-3 text-right">{formatInt(d.rooms_ended_total)}</td>
                    <td className="p-3 text-right">{avgAll}</td>
                    <td className="p-3 text-right">{formatInt(d.rooms_ended_owner_total)}</td>
                    <td className="p-3 text-right">{avgOwner}</td>
                    <td className="p-3 text-right">{formatInt(d.rooms_ended_human_total)}</td>
                    <td className="p-3 text-right">{avgHuman}</td>
                    <td className="p-3 text-right">{formatInt(d.messages_total)}</td>
                    <td className="p-3 text-right">{formatInt(d.messages_to_owner_total)}</td>
                    <td className="p-3 text-right">{formatInt(d.messages_from_owner_total)}</td>
                    <td className="p-3 text-right">{formatInt(d.messages_to_human_total)}</td>
                    <td className="p-3 text-right">{formatInt(d.match_made_total)}</td>
                    <td className="p-3 text-right">{formatInt(d.owner_room_started_total)}</td>
                    <td className="p-3 text-right">{formatInt(d.queue_enter_total)} <span className="text-gray-500">(C{formatInt(d.queue_enter_country_total)}/G{formatInt(d.queue_enter_global_total)})</span></td>
                    <td className="p-3 text-right">{formatInt(d.visits_total)}</td>
                    <td className="p-3 text-right">{formatInt(d.visitors_unique_total)}</td>
                  </tr>
                );
              })}
              {daily.length === 0 && <tr><td className="p-3 text-gray-400" colSpan={16}>データがありません</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-500 mt-2">※ 訪問系は UTC キー、他のKPIは JST キーで日次集計しています（境界がズレる点に注意）。</p>
      </section>
    </div>
  );
}
