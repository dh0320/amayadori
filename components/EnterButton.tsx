'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ensureAnon, auth, db } from '@/lib/firebase'
import { getBrowserLocation } from '@/lib/geo'
import { callOwnerAI } from '@/lib/api'
import {
  addDoc, collection, deleteDoc, doc, getDocs, limit, onSnapshot,
  query, runTransaction, serverTimestamp, updateDoc, where
} from 'firebase/firestore'

type Region = 'country' | 'global'

async function matchOnFirestore(params: {
  region: Region
  lat: number
  lon: number
  waitMs?: number
}): Promise<string | null> {
  const { region, lat, lon, waitMs = 20_000 } = params
  const me = auth.currentUser?.uid
  if (!me) throw new Error('not signed in')

  // ---- 0) 診断ログ（見え方：Firestore の _diag に 1 行増える）
  await addDoc(collection(db, '_diag'), {
    uid: me, at: serverTimestamp(), p: 'enter-click'
  }).catch(() => {}) // 診断なので失敗は無視

  // ---- 1) 相手探し
  // ★ インデックス不要のため orderBy('at') を外し、region だけで最大 20 件取得
  //    （順序は不定ですが、まずは動作優先）
  let candidateId: string | null = null
  try {
    const qs = await getDocs(
      query(
        collection(db, 'waiting'),
        where('region', '==', region),
        limit(20)
      )
    )
    const cand = qs.docs.find(d => {
      const v: any = d.data()
      return v?.uid !== me && !v?.roomId
    })
    candidateId = cand?.id || null
  } catch (e) {
    console.warn('query waiting failed (will skip search and queue myself):', e)
  }

  if (candidateId) {
    const partnerRef = doc(db, 'waiting', candidateId)
    const roomRef = doc(collection(db, 'rooms'))
    try {
      await runTransaction(db, async (tx) => {
        const ps = await tx.get(partnerRef)
        if (!ps.exists()) throw new Error('partner disappeared')
        const pdata: any = ps.data()
        if (pdata.roomId) throw new Error('already matched')

        tx.set(roomRef, {
          members: [me, pdata.uid],
          createdAt: serverTimestamp(),
        })
        tx.update(partnerRef, { roomId: roomRef.id, matchedBy: me })
      })
      return roomRef.id
    } catch (e) {
      console.warn('transaction failed, will queue myself:', e)
      // 競合などは待機へ
    }
  }

  // ---- 2) 自分を待機に入れて待つ
  const myRef = await addDoc(collection(db, 'waiting'), {
    uid: me, region, lat, lon, at: serverTimestamp(), roomId: null,
  })

  // roomId が付くのを待機（onSnapshot + タイムアウト）
  const roomId = await new Promise<string | null>((resolve) => {
    const unsub = onSnapshot(myRef, (snap) => {
      const v: any = snap.data()
      if (v?.roomId) {
        unsub()
        resolve(v.roomId as string)
      }
    })
    setTimeout(() => { unsub(); resolve(null) }, waitMs)
  })

  if (!roomId) {
    // タイムアウト掃除（失敗は無視）
    await deleteDoc(myRef).catch(() => {})
    return null
  }
  // 念のため覚書
  await updateDoc(myRef, { roomId }).catch(() => {})
  return roomId
}

export default function EnterButton() {
  const r = useRouter()
  const [loading, setLoading] = useState(false)

  // ブラウザ閉じ時の掃除は余力があればここで実装可
  useEffect(() => {
    // window.addEventListener('beforeunload', () => {...})
    return () => {}
  }, [])

  async function onEnter() {
    try {
      setLoading(true)
      await ensureAnon()

      const { lat, lon } = await getBrowserLocation().catch(() => ({ lat: 0, lon: 0 }))
      const region: Region = 'country'

      const roomId = await matchOnFirestore({ region, lat, lon, waitMs: 20_000 })
      if (roomId) {
        r.push(`/chat?room=${roomId}`)
        return
      }

      // タイムアウト → オーナーAIにフォールバック
      const ai: any = await callOwnerAI({})
      r.push(`/chat?room=${ai.data.roomId}`)
    } catch (e: any) {
      console.error(e)
      alert(e?.message ?? 'enter failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={onEnter}
      disabled={loading}
      className="btn-gradient px-6 py-3 rounded-xl text-white"
    >
      {loading ? '判定中…' : '入室する'}
    </button>
  )
}
