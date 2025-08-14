// lib/firebase.ts
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInAnonymously, User } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// App Check（必要なときだけ使う）
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
};

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// -------------------------
// App Check（フラグで可/不可）
// -------------------------
// .env.local で NEXT_PUBLIC_ENABLE_APPCHECK=1 のときだけ有効化
const shouldEnableAppCheck =
  typeof window !== 'undefined' && process.env.NEXT_PUBLIC_ENABLE_APPCHECK === '1';

if (shouldEnableAppCheck) {
  try {
    // デバッグ時は自動でトークンを発行（App Check コンソールに登録して使用）
    (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN ??= true;

    const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_V3_KEY || 'debug-key';
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (e) {
    // ここで失敗してもアプリは落とさずに続行（開発を止めない）
    console.warn('[AppCheck] init skipped:', e);
  }
}

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// 未ログインなら匿名ログイン
export async function ensureAnon(): Promise<User> {
  if (!auth.currentUser) {
    await signInAnonymously(auth);
  }
  if (!auth.currentUser) throw new Error('anonymous sign-in failed');
  return auth.currentUser;
}
