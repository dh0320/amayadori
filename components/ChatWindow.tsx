'use client';
import { useEffect, useState } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  onSnapshot,
} from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const cfg = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
};
const app = getApps().length ? getApps()[0] : initializeApp(cfg);
const db = getFirestore(app);
const auth = getAuth(app);

export default function ChatWindow({ roomId }: { roomId: string }) {
  const [msgs, setMsgs] = useState<any[]>([]);
  const [text, setText] = useState('');

  useEffect(() => {
    const q = query(
      collection(db, `rooms/${roomId}/messages`),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(q, (snap) =>
      setMsgs(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [roomId]);

  async function onSend() {
    if (!auth.currentUser || !text.trim()) return;
    await addDoc(collection(db, `rooms/${roomId}/messages`), {
      senderId: auth.currentUser.uid,
      text: text.trim(),
      createdAt: serverTimestamp(),
    });
    setText('');
  }

  return (
    <div className="flex flex-col h-[70vh] border rounded">
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {msgs.map((m) => (
          <div
            key={m.id}
            className={`max-w-[75%] ${
              m.senderId === auth.currentUser?.uid
                ? 'ml-auto bg-black text-white'
                : 'bg-gray-100'
            } rounded px-3 py-2`}
          >
            {m.text}
          </div>
        ))}
      </div>
      <div className="p-3 flex gap-2 border-t">
        <input
          className="flex-1 border rounded px-3 py-2"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="メッセージ…"
        />
        <button
          onClick={onSend}
          className="px-4 py-2 rounded bg-black text-white"
        >
          送信
        </button>
      </div>
    </div>
  );
}
