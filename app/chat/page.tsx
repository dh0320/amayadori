'use client'
import { useEffect, useState } from 'react'
import { db, ensureAnon } from '@/lib/firebase'
import { addDoc, collection, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore'
import { useSearchParams, useRouter } from 'next/navigation'
import { callLeave } from '@/lib/api'

export default function ChatPage() {
  const sp = useSearchParams()
  const router = useRouter()
  const roomId = sp.get('room') || ''
  const [msgs, setMsgs] = useState<any[]>([])
  const [text, setText] = useState('')

  useEffect(() => { ensureAnon() }, [])

  useEffect(() => {
    if (!roomId) return
    const q = query(collection(db, 'rooms', roomId, 'messages'), orderBy('createdAt','asc'))
    const unsub = onSnapshot(q, s => setMsgs(s.docs.map(d => ({ id:d.id, ...d.data() }))))
    return () => unsub()
  }, [roomId])

  async function send() {
    if (!text.trim()) return
    const u = await ensureAnon()
    await addDoc(collection(db, 'rooms', roomId, 'messages'), {
      uid: u.uid, text: text.trim(), createdAt: serverTimestamp()
    })
    setText('')
  }

  async function leave() {
    await callLeave({ roomId })
    router.push('/amayadori')
  }

  if (!roomId) return <div className="p-8">roomId がありません</div>

  return (
    <main className="min-h-screen flex flex-col">
      <header className="p-3 border-b flex justify-between">
        <div>Room: {roomId.slice(0,6)}</div>
        <button onClick={leave} className="btn-exit">退室</button>
      </header>

      <ul className="flex-1 overflow-y-auto p-4 space-y-2">
        {msgs.map(m => (
          <li key={m.id} className="text-sm">
            <b>{(m.uid||'user').slice(0,5)}:</b> {m.text}
          </li>
        ))}
      </ul>

      <footer className="p-3 flex gap-2">
        <input
          value={text}
          onChange={e=>setText(e.target.value)}
          className="message-textarea flex-1 px-3 py-2"
          placeholder="メッセージを入力…"
        />
        <button onClick={send} className="btn-gradient px-4 py-2 rounded-lg text-white">送信</button>
      </footer>
    </main>
  )
}
