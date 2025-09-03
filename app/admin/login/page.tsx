// app/admin/login/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/firebase';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  setPersistence,
  browserLocalPersistence,
  linkWithCredential,
  EmailAuthProvider,
} from 'firebase/auth';

function toJaError(e: any): string {
  const code = e?.code || e?.message || '';
  if (typeof code !== 'string') return '不明なエラーが発生しました';
  if (code.includes('auth/invalid-credential') || code.includes('auth/wrong-password')) return 'メールアドレスまたはパスワードが違います。';
  if (code.includes('auth/user-not-found')) return 'このメールアドレスのユーザーが見つかりません。';
  if (code.includes('auth/too-many-requests')) return '失敗が続いたため一時的にブロックされました。しばらくしてからお試しください。';
  if (code.includes('auth/operation-not-allowed')) return 'メール/パスワード認証が有効ではありません（コンソールで有効化してください）。';
  if (code.includes('auth/unauthorized-domain')) return 'このドメインは未許可です（Authentication > 設定 > 承認済みドメインに追加してください）。';
  if (code.includes('auth/credential-already-in-use') || code.includes('auth/email-already-in-use')) return 'このメールアドレスは既に別のアカウントで使用されています。';
  return `ログインに失敗しました: ${code}`;
}

export default function AdminLogin() {
  const r = useRouter();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uid, setUid] = useState<string | null>(null);
  const [isAnon, setIsAnon] = useState<boolean>(true);

  // 認証状態を監視。匿名でなければ /admin へ。
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUid(u?.uid ?? null);
      setIsAnon(!!u?.isAnonymous);
      if (u && !u.isAnonymous) r.replace('/admin');
    });
    return () => unsub();
  }, [r]);

  // 匿名セッションは破棄。永続化は Local 固定。
  useEffect(() => {
    if (auth.currentUser?.isAnonymous) signOut(auth).catch(() => {});
    setPersistence(auth, browserLocalPersistence).catch(() => {});
  }, []);

  async function doLogin(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      if (auth.currentUser?.isAnonymous) {
        try {
          const cred = EmailAuthProvider.credential(email.trim(), pw);
          await linkWithCredential(auth.currentUser, cred);
          return; // onAuthStateChanged が /admin へ遷移
        } catch (linkErr: any) {
          if (
            String(linkErr?.code || '').includes('credential-already-in-use') ||
            String(linkErr?.code || '').includes('email-already-in-use')
          ) {
            await signOut(auth);
            await signInWithEmailAndPassword(auth, email.trim(), pw);
            return;
          }
          throw linkErr;
        }
      }
      await signInWithEmailAndPassword(auth, email.trim(), pw);
    } catch (e: any) {
      setErr(toJaError(e));
    } finally {
      setBusy(false);
    }
  }

  async function doSignOut() {
    try { await signOut(auth); } catch {}
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="glass-card w-full max-w-md p-8 space-y-6">
        <h1 className="text-2xl font-bold">管理者ログイン</h1>
        <p className="text-sm text-gray-400">
          現在のUID: <span className="font-mono">{uid ?? '（未ログイン）'}</span> {uid ? (isAnon ? '(匿名)' : '(通常)') : ''}
        </p>

        <form className="space-y-4" onSubmit={doLogin}>
          <div>
            <label className="block text-sm text-gray-400 mb-1">メールアドレス</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
              autoComplete="email" required />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">パスワード</label>
            <input type="password" value={pw} onChange={(e) => setPw(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
              autoComplete="current-password" required />
          </div>
          {err && <div className="text-red-300 text-sm whitespace-pre-line">{err}</div>}
          <button type="submit" disabled={busy} className="btn-gradient w-full disabled:opacity-60">
            {busy ? 'ログイン中…' : 'ログイン'}
          </button>
        </form>

        <div className="flex items-center justify-between text-sm text-gray-400">
          <button onClick={doSignOut} className="underline">サインアウト</button>
          <Link href="/" className="underline">トップへ戻る</Link>
        </div>

        <p className="text-xs text-gray-500">
          ※ 管理者の UID は Firestore の <code>config/admins</code> の <code>uids</code> 配列に追加してください。
        </p>
      </div>
    </div>
  );
}
