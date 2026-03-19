// lib/firebase.ts
import { FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import { Auth, getAuth, signInAnonymously, User } from 'firebase/auth';
import { Firestore, getFirestore } from 'firebase/firestore';
import { FirebaseStorage, getStorage } from 'firebase/storage';

// App Check（必要なときだけ使う）
import { ReCaptchaV3Provider, initializeAppCheck } from 'firebase/app-check';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Object.values(firebaseConfig).every(
  (value) => typeof value === 'string' && value.trim().length > 0
);

function warnMissingFirebaseConfig() {
  if (typeof window === 'undefined') {
    console.warn('[firebase] Firebase config is missing. Skipping client SDK initialization during prerender/build.');
  }
}

export const app: FirebaseApp | null = isFirebaseConfigured
  ? (getApps().length ? getApp() : initializeApp(firebaseConfig))
  : null;

if (!isFirebaseConfigured) {
  warnMissingFirebaseConfig();
}

// -------------------------
// App Check（フラグで可/不可）
// -------------------------
// .env.local で NEXT_PUBLIC_ENABLE_APPCHECK=1 のときだけ有効化
const shouldEnableAppCheck =
  typeof window !== 'undefined' && process.env.NEXT_PUBLIC_ENABLE_APPCHECK === '1' && !!app;

if (shouldEnableAppCheck && app) {
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

export const auth: Auth | null = app ? getAuth(app) : null;
export const db: Firestore | null = app ? getFirestore(app) : null;
export const storage: FirebaseStorage | null = app ? getStorage(app) : null;

// 未ログインなら匿名ログイン
export async function ensureAnon(): Promise<User> {
  if (!auth) {
    throw new Error('Firebase is not configured');
  }

  if (!auth.currentUser) {
    await signInAnonymously(auth);
  }
  if (!auth.currentUser) throw new Error('anonymous sign-in failed');
  return auth.currentUser;
}
