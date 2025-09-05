// functions/src/index.ts
import * as admin from 'firebase-admin'
import { onCall, HttpsError, onRequest } from 'firebase-functions/v2/https'
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import type { Request, Response } from 'express'
import { defineSecret } from 'firebase-functions/params'
import { GoogleGenerativeAI } from '@google/generative-ai'
import * as nodemailer from 'nodemailer' // ← 追加（メール送信）

admin.initializeApp()
const db = admin.firestore()

/* ============ util ============ */
const nowTs = () => admin.firestore.Timestamp.now()
const tsPlusMin = (m: number) =>
  admin.firestore.Timestamp.fromDate(new Date(Date.now() + m * 60 * 1000))
const tsPlusHours = (h: number) =>
  admin.firestore.Timestamp.fromDate(new Date(Date.now() + h * 3600 * 1000))
const dayKey = () => new Date().toISOString().slice(0, 10) // UTC（日次キー：pairHistory/visitで利用）
const pairKey = (a: string, b: string) => [a, b].sort().join('_')

// KPI（日次）をJST区切りで集計するためのキー（KPIはこちらを採用）
const JST_OFFSET_MS = 9 * 60 * 60 * 1000
const dayKeyJst = () => new Date(Date.now() + JST_OFFSET_MS).toISOString().slice(0, 10)

const QUEUE_EXPIRE_MIN = 12
const ROOM_EXPIRE_HOURS = 3
const DEFAULT_COOLDOWN_SEC = 30

// GC / 健全化しきい値
const MESSAGE_MAX_AGE_HOURS = 6
const DIAG_MAX_AGE_HOURS = 72
const GC_MAX_DELETES_PER_RUN = 5000
const GC_BATCH_SIZE = 250

// 放置検知（待機中のハートビート）
const ENTRY_STALE_SEC = 45 // lastSeenAt からこれ以上経過 → stale とみなす

// アイコン既定
const DEFAULT_USER_ICON_URL =
  'https://storage.googleapis.com/amayadori/defaultIcon.png'
const OWNER_ICON_URL =
  'https://storage.googleapis.com/amayadori/cafeownerIcon.png'

type ProfileSnap = { nickname?: string; profile?: string; icon?: string }

function sanitizeProfile(p?: ProfileSnap | null): ProfileSnap {
  const nn = (p?.nickname || '').toString().slice(0, 40) || '名無しさん'
  const pr = (p?.profile || '').toString().slice(0, 120) || '...'
  const ic =
    (p?.icon || '').toString().slice(0, 200_000) || DEFAULT_USER_ICON_URL
  return { nickname: nn, profile: pr, icon: ic }
}

async function getConfig(): Promise<{
  weatherGateMode?: 'off' | 'log' | 'enforce'
  cooldownSec?: number
}> {
  try {
    const d = await db.doc('config/global').get()
    const v = (d.data() || {}) as any
    return {
      weatherGateMode: v.weatherGateMode ?? 'off',
      cooldownSec:
        typeof v.cooldownSec === 'number' ? v.cooldownSec : undefined,
    }
  } catch {
    return { weatherGateMode: 'off' }
  }
}

/* ========= 日次メトリクス更新ヘルパ（UTC: visits系） ========= */
async function bumpDailyCounters(fields: Record<string, number>) {
  const docId = dayKey() // 既存の dayKey() を利用（UTC日付ベース）
  const ref = db.collection('metrics_daily').doc(docId)
  const updates: any = { updatedAt: nowTs() }
  for (const [k, v] of Object.entries(fields)) {
    updates[k] = admin.firestore.FieldValue.increment(v)
  }
  await ref.set(updates, { merge: true })
}

/* ========= KPI（日次/JST）加算（単発） ========= */
async function incDaily(fields: Record<string, number>) {
  const dateKey = dayKeyJst()
  const ref = db.doc(`metrics_daily/${dateKey}`)
  const updates: Record<string, any> = { updatedAt: nowTs() }
  for (const [k, v] of Object.entries(fields)) {
    updates[k] = admin.firestore.FieldValue.increment(v)
  }
  await ref.set(updates, { merge: true })
}

/* ========= KPI（日次/JST）加算（TX内で冪等確保） ========= */
function incDailyTx(
  tx: FirebaseFirestore.Transaction,
  fields: Record<string, number>
) {
  const dateKey = dayKeyJst()
  const ref = db.doc(`metrics_daily/${dateKey}`)
  const updates: Record<string, any> = { updatedAt: nowTs() }
  for (const [k, v] of Object.entries(fields)) {
    updates[k] = admin.firestore.FieldValue.increment(v)
  }
  tx.set(ref, updates, { merge: true })
}

type MetricEventType =
  | 'visit'
  | 'queue_enter'
  | 'queue_denied'
  | 'queue_cooldown'
  | 'match_made'
  | 'owner_room_started'
  | 'room_ended'
  | 'msg_to_owner'
  | 'msg_to_human'
  | 'msg_from_owner'

const LOG_EACH_EVENT = false
async function logEvent(ev: {
  type: MetricEventType
  uid?: string | null
  roomId?: string
  queueKey?: string
  extra?: Record<string, any>
}) {
  if (!LOG_EACH_EVENT) return
  await db.collection('metrics_events').add({
    ...ev,
    at: admin.firestore.FieldValue.serverTimestamp(),
  })
}

/* ========= ページ訪問トラッキング（Callable / UTC集計） ========= */
export const trackVisit = onCall(
  { region: 'asia-northeast1' },
  async (req) => {
    const uid = req.auth?.uid || null
    const data = (req.data || {}) as { page?: string; src?: string }
    const rawPage = String(data.page || 'other').toLowerCase()
    const allowed = new Set(['landing', 'amayadori', 'chat', 'terms', 'policy', 'other'])
    const page = allowed.has(rawPage) ? rawPage : 'other'
    const src = String(data.src || '').slice(0, 120) || null

    await bumpDailyCounters({
      visits_total: 1,
      [`visits_${page}_total`]: 1,
    })

    if (uid) {
      const dayId = dayKey()
      const vRef = db.collection('metrics_daily').doc(dayId).collection('visitors').doc(uid)
      let firstVisit = false
      try {
        await vRef.create({ at: nowTs() })
        firstVisit = true
      } catch {}
      if (firstVisit) {
        await bumpDailyCounters({ visitors_unique_total: 1 })
      }
    }

    await db.collection('analytics_raw').add({
      type: 'visit',
      page,
      src,
      uid,
      at: admin.firestore.FieldValue.serverTimestamp(),
    })

    return { ok: true }
  }
)

/* ============ ★ 追加：管理者判定（Callable） ============ */
/** 現在の認証 UID が Firestore `config/admins.uids` 配列に含まれるかを返す */
export const checkAdmin = onCall({ region: 'asia-northeast1' }, async (req) => {
  const uid = req.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'login required')

  try {
    const snap = await db.doc('config/admins').get()
    const uids: string[] = Array.isArray(snap.data()?.uids) ? snap.data()!.uids : []
    const ok = uids.includes(uid)
    return { ok, uid, count: uids.length }
  } catch (e: any) {
    console.error('[checkAdmin] error', e)
    throw new HttpsError('internal', 'failed to verify admin')
  }
})

/* ============ 天候（いまは log-only のスタブ） ============ */
async function getWeather(_lat?: number, _lon?: number) {
  return { mode: 'stub', ok: true }
}
function isAllowedByPolicy(_w: any) {
  return true
}

/* ============ enter ============ */
type EnterQueued = { status: 'queued'; entryId: string }
type EnterDenied = { status: 'denied' }
type EnterCooldown = { status: 'cooldown'; retryAfterSec: number }
type EnterRes = EnterQueued | EnterDenied | EnterCooldown

export const enter = onCall(
  { region: 'asia-northeast1' },
  async (req): Promise<EnterRes> => {
    const uid = req.auth?.uid
    if (!uid) throw new HttpsError('unauthenticated', 'login required')

    const { queueKey, lat, lon, region, profile } = (req.data || {}) as {
      queueKey: 'country' | 'global'
      lat?: number
      lon?: number
      region?: string
      profile?: ProfileSnap
    }
    if (!queueKey) throw new HttpsError('invalid-argument', 'queueKey required')

    const cfg = await getConfig()
    const weatherMode = cfg.weatherGateMode ?? 'off'
    const cooldownSec = cfg.cooldownSec ?? DEFAULT_COOLDOWN_SEC

    // クールダウン
    try {
      const st = await db.doc(`userStates/${uid}`).get()
      const lastLeftAt = st.exists ? (st.data() as any).lastLeftAt : null
      if (lastLeftAt && typeof lastLeftAt.toMillis === 'function') {
        const deltaSec = Math.floor((Date.now() - lastLeftAt.toMillis()) / 1000)
        const remain = cooldownSec - deltaSec
        if (remain > 0) {
          await incDaily({ queue_cooldown_total: 1 })
          await logEvent({ type: 'queue_cooldown', uid, queueKey })
          return { status: 'cooldown', retryAfterSec: remain }
        }
      }
    } catch {}

    // 天候（log-only / enforce）
    if (weatherMode !== 'off') {
      let ok = true
      try {
        const weather = await getWeather(lat, lon)
        ok = isAllowedByPolicy(weather)
        await db.collection('_diag_weather').add({
          uid,
          lat,
          lon,
          region,
          mode: weatherMode,
          ok,
          at: admin.firestore.FieldValue.serverTimestamp(),
        })
      } catch (e) {
        await db.collection('_diag_weather').add({
          uid,
          lat,
          lon,
          region,
          mode: weatherMode,
          ok: true,
          error: String(e),
          at: admin.firestore.FieldValue.serverTimestamp(),
        })
      }
      if (weatherMode === 'enforce' && !ok) {
        await incDaily({ queue_denied_total: 1 })
        await logEvent({ type: 'queue_denied', uid, queueKey })
        return { status: 'denied' }
      }
    }

    // matchEntries を作成（プロフィール & lastSeenAt 付き）
    const entryRef = db.collection('matchEntries').doc()
    await entryRef.set({
      uid,
      queueKey,
      status: 'queued',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      lastSeenAt: admin.firestore.FieldValue.serverTimestamp(), // 初期ハートビート
      expiresAt: tsPlusMin(QUEUE_EXPIRE_MIN),
      profile: sanitizeProfile(profile),
    })

    // KPI: キュー投入
    const inc: Record<string, number> = { queue_enter_total: 1 }
    if (queueKey === 'country') inc['queue_enter_country_total'] = 1
    if (queueKey === 'global') inc['queue_enter_global_total'] = 1
    await incDaily(inc)
    await logEvent({ type: 'queue_enter', uid, queueKey })

    return { status: 'queued', entryId: entryRef.id }
  }
)

/* ============ エントリーのハートビート / キャンセル ============ */
// 待機中に定期呼び出しして lastSeenAt を更新（所有者のみ）
export const touchEntry = onCall({ region: 'asia-northeast1' }, async (req) => {
  const uid = req.auth?.uid
  const { entryId } = (req.data || {}) as { entryId: string }
  if (!uid) throw new HttpsError('unauthenticated', 'login required')
  if (!entryId) throw new HttpsError('invalid-argument', 'entryId required')

  const ref = db.collection('matchEntries').doc(entryId)
  await db.runTransaction(async (tx) => {
    const s = await tx.get(ref)
    if (!s.exists) return
    const d = s.data() as any
    if (d.uid !== uid) throw new HttpsError('permission-denied', 'not owner')
    if (d.status !== 'queued') return
    tx.update(ref, {
      lastSeenAt: nowTs(),
      // 生かしている間は期限も伸ばす
      expiresAt: tsPlusMin(QUEUE_EXPIRE_MIN),
    })
  })
  return { ok: true }
})

// 待機をやめる（所有者のみ）
export const cancelEntry = onCall(
  { region: 'asia-northeast1' },
  async (req) => {
    const uid = req.auth?.uid
    const { entryId } = (req.data || {}) as { entryId: string }
    if (!uid) throw new HttpsError('unauthenticated', 'login required')
    if (!entryId) throw new HttpsError('invalid-argument', 'entryId required')

    const ref = db.collection('matchEntries').doc(entryId)
    await db.runTransaction(async (tx) => {
      const s = await tx.get(ref)
      if (!s.exists) return
      const d = s.data() as any
      if (d.uid !== uid) throw new HttpsError('permission-denied', 'not owner')
      if (d.status !== 'queued') return
      tx.update(ref, {
        status: 'canceled',
        canceledAt: nowTs(),
        expiresAt: nowTs(), // GC 対象
      })
    })
    return { ok: true }
  }
)

// ★ フォールバック：entryId 不明・タブクローズ等でも自分の queued を一括キャンセル（Callable）
export const cancelMyQueuedEntries = onCall(
  { region: 'asia-northeast1' },
  async (req) => {
    const uid = req.auth?.uid
    if (!uid) throw new HttpsError('unauthenticated', 'login required')

    const qs = await db
      .collection('matchEntries')
      .where('uid', '==', uid)
      .where('status', '==', 'queued')
      .limit(50)
      .get()

    if (qs.empty) return { canceled: 0 }

    const batch = db.batch()
    qs.docs.forEach((d) => {
      batch.update(d.ref, {
        status: 'canceled',
        canceledAt: nowTs(),
        expiresAt: nowTs(),
      })
    })
    await batch.commit()
    return { canceled: qs.size }
  }
)

/* ============ HTTP: sendBeacon 専用のキャンセル（確実に届ける） ============ */
// POST x-www-form-urlencoded: idToken=<firebase_id_token>
export const cancelQueuedEntriesHttp = onRequest(
  { region: 'asia-northeast1' },
  async (req: Request, res: Response) => {
    // CORS（Beacon はレスポンスを読み取らないが、一応許可）
    res.set('Access-Control-Allow-Origin', '*')
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.set('Access-Control-Allow-Headers', 'Content-Type')

    if (req.method === 'OPTIONS') {
      res.status(204).send('')
      return
    }
    if (req.method !== 'POST') {
      res.status(405).send('method not allowed')
      return
    }

    try {
      const ct = String(req.headers['content-type'] || '')
      let idToken = ''

      if (ct.includes('application/x-www-form-urlencoded')) {
        // Cloud Functions(v2) は body をオブジェクトにパース済み
        idToken = (req.body?.idToken as string) || ''
      } else if (ct.includes('application/json')) {
        idToken = (req.body?.idToken as string) || ''
      } else if (typeof req.body === 'string') {
        const params = new URLSearchParams(req.body)
        idToken = params.get('idToken') || ''
      }

      if (!idToken) {
        res.status(401).send('missing token')
        return
      }

      const decoded = await admin.auth().verifyIdToken(idToken)
      const uid = decoded.uid

      const qs = await db
        .collection('matchEntries')
        .where('uid', '==', uid)
        .where('status', '==', 'queued')
        .limit(50)
        .get()

      if (qs.empty) {
        res.status(200).json({ canceled: 0 })
        return
      }

      const batch = db.batch()
      qs.docs.forEach((d) => {
        batch.update(d.ref, {
          status: 'canceled',
          canceledAt: nowTs(),
          expiresAt: nowTs(),
        })
      })
      await batch.commit()
      res.status(200).json({ canceled: qs.size })
    } catch (e) {
      console.error('[cancelQueuedEntriesHttp] error', e)
      res.status(500).send('internal error')
    }
  }
)

/* ============ leaveRoom ============ */
// ※ ここでは“終了時刻の確定”のみ。KPI集計は onRoomClosed に統一。
export const leaveRoom = onCall({ region: 'asia-northeast1' }, async (req) => {
  const uid = req.auth?.uid
  const { roomId } = (req.data || {}) as { roomId: string }
  if (!uid) throw new HttpsError('unauthenticated', 'login required')
  if (!roomId) throw new HttpsError('invalid-argument', 'roomId required')

  const roomRef = db.collection('rooms').doc(roomId)

  // TX 内で次を決定:
  // - members 更新
  // - 0人 or ownerAIのみ → status: 'closed' + endedAt + closedReason + closedBy
  // - それ以外は open のまま
  // 返り値: { notifyPeer: boolean }
  const { notifyPeer } = await db.runTransaction(async (tx) => {
    const snap = await tx.get(roomRef)
    if (!snap.exists) return { notifyPeer: false }
    const data = snap.data() as any
    const members: string[] = Array.isArray(data.members) ? data.members : []
    const leftBy = { ...(data.leftBy || {}) }
    if (leftBy[uid]) return { notifyPeer: false }

    const afterMembers = members.filter((m) => m !== uid)
    leftBy[uid] = true

    const wasOwnerRoom = members.includes('ownerAI')
    const ownerOnlyAfter = wasOwnerRoom && afterMembers.length === 1 && afterMembers[0] === 'ownerAI'
    const closing = afterMembers.length === 0 || ownerOnlyAfter

    if (closing) {
      tx.update(roomRef, {
        members: afterMembers,
        status: 'closed',
        expireAt: tsPlusMin(5),
        leftBy,
        lastLeftAt: nowTs(),
        endedAt: nowTs(),
        closedReason: ownerOnlyAfter ? 'owner_only' : 'last_left',
        closedBy: uid,
      })
      return { notifyPeer: false }
    } else {
      tx.update(roomRef, {
        members: afterMembers,
        status: 'open',
        expireAt: tsPlusMin(5),
        leftBy,
        lastLeftAt: nowTs(),
      })
      return { notifyPeer: afterMembers.length >= 1 }
    }
  })

  if (notifyPeer) {
    const sysMsgRef = roomRef.collection('messages').doc('__system_peer_left')
    await sysMsgRef.set(
      {
        text: '会話相手が退席しました',
        uid: '__system__',
        system: true,
        type: 'peer_left',
        createdAt: nowTs(),
      },
      { merge: true }
    )
  }

  await db.doc(`userStates/${uid}`).set({ lastLeftAt: nowTs() }, { merge: true })
  return { ok: true }
})

/* ============ オーナーAI（Gemini） ============ */
const GEMINI_API_KEY_SECRET = defineSecret('GEMINI_API_KEY')
const GEMINI_MODEL_ID = process.env.GEMINI_MODEL_ID || 'gemini-2.5-flash'

// ★ Added: 出力上限トークンを環境変数で可変に（デフォルト 2000）
const GEMINI_MAX_OUTPUT_TOKENS =
  Number(process.env.GEMINI_MAX_OUTPUT_TOKENS || '2000')

// ★ Added: 自動要約関連しきい値
const SUMMARY_TRIGGER_TURNS = 24 // これ以上のターンで要約候補
const SUMMARY_MIN_INTERVAL_MIN = 5 // 要約更新の最短間隔
const SUMMARY_MAX_INPUT_CHARS = 20000 // 要約入力の上限（文字）
const SUMMARY_MAX_OUTPUT_TOKENS = 2000 // 要約出力の上限

const OWNER_SYSTEM_PROMPT = `【目的】雨宿りカフェ「Cafe Amayadori」のオーナー。気軽に話せる空気をつくり、短い雑談や相談に寄り添う。会話後に「落ち着けた／話しやすかった／また話したい」と感じてもらう。
【ペルソナ】40代前半男性。知的でおおらか、親しみやすい聞き上手。紳士的。自慢・説教はしない。自分をAIと名乗らない（店の人として振る舞う）。
【呼称】一人称「私」。相手は基本「◯◯さん」。初回は「お呼びしやすいお名前」だけ軽く確認（匿名でも可）。
【言語・トーン】日本語基調（相手に合わせて切替可）。丁寧5：口語5の“くだけた丁寧語”。断定より共感。絵文字×。相づちは自然に。
【出力規律】1メッセージ1〜2文。質問は同時に1つ。内部ルールに触れない。句点少なめで“会話の呼吸”を作る。
【ユーモア】適度に。相手はいじらない。
【境界】医療・法律・投資・緊急メンタルは一般情報＋専門窓口案内。攻撃・差別は拒否または穏やかに転換。個人情報は聞かず、保存もしない（ニックネームは会話中のみ使用）。
【適応】初対面＝ややフォーマル、2回目以降＝名前呼び＋軽い冗談。落ち込み強＝語尾やわらか・情報量少なめ・質問は1つずつ。未成年らしき相手には慎重。
【固定セリフ（OPEN時のみ）】ようこそ。外は足元が悪いですね。よろしければ、お呼びする名前を教えてください。匿名のままでも大丈夫ですよ。
【相づちバリエーション】なるほどです／たしかに／ふむ／それは大変でしたね／いいですね／わかります
【クッション語】もしよければ／無理のない範囲で／ひとまず／ここでは／よかったら
【一言情景（1ターン1つまで）】窓に細い雨筋が残ってます／傘立てから雫が落ちる音がします／ドアがかすかに鳴りました
【話題カード（困ったら）】今日の小さな良かったこと／最近ほっとした瞬間／雨の日に好きな過ごし方
【やわらかい言い換え】
「違います」→「少しニュアンスが違うかもしれません」
「できません」→「この場では難しいので、代わりに…」
「分かりません」→「今わかる範囲で言うと…」
`

function toGeminiRole(uid: string): 'user' | 'model' {
  return uid === 'ownerAI' ? 'model' : 'user'
}

/** Secret/環境変数から API キーを取得（余計な空白を除去） */
function getGeminiApiKey(): string {
  let key = ''
  try {
    key = (GEMINI_API_KEY_SECRET.value() || '').toString()
  } catch {}
  if (!key) key = (process.env.GEMINI_API_KEY || '').toString()
  return key.replace(/\r/g, '').replace(/^['"]|['"]$/g, '').trim()
}

/** 履歴を Gemini 2.5 が受け取りやすい形に正規化する */
function buildGeminiContentsFromSnapshot(
  histSnap: FirebaseFirestore.QuerySnapshot
): Array<{ role: 'user' | 'model'; parts: { text: string }[] }> {
  const raw = histSnap.docs
    .map((d) => d.data() as any)
    .filter((v) => !v.system)
    .map((v) => ({
      role: toGeminiRole(String(v.uid || '')),
      parts: [{ text: String(v.text || '') }],
    }))
    .filter((m) => m.parts[0].text.trim().length > 0)

  // 先頭 user になるまで前方の model を除去
  while (raw.length && raw[0].role !== 'user') raw.shift()

  // 連続同一ロールは結合
  const merged: Array<{ role: 'user' | 'model'; parts: { text: string }[] }> = []
  for (const m of raw) {
    const last = merged[merged.length - 1]
    if (last && last.role === m.role) {
      last.parts[0].text += '\n' + m.parts[0].text
    } else {
      merged.push(m)
    }
  }

  // 末尾を user に（まれに model が最後に来ることがあるため）
  while (merged.length && merged[merged.length - 1].role !== 'user') merged.pop()

  // 既存仕様維持：直近16ターンに圧縮
  return merged.slice(-16)
}

/* ---------- 生成補助（MAX_TOKENS 自動継続 & 要約） ---------- */
function extractGenText(res: any) {
  const text =
    (res?.response?.text?.() ||
      res?.response?.candidates?.[0]?.content?.parts
        ?.map((p: any) => p.text)
        .join('') ||
      '')?.toString() ?? ''
  const finish = res?.response?.candidates?.[0]?.finishReason || ''
  const safety = res?.response?.candidates?.[0]?.safetyRatings || []
  const usage = res?.response?.usageMetadata || {}
  return { text, finish, safety, usage }
}

async function generateWithAutoContinue(opts: {
  model: ReturnType<GoogleGenerativeAI['getGenerativeModel']>
  contents: Array<{ role: 'user' | 'model'; parts: { text: string }[] }>
  maxSegments?: number
  genCfg?: { maxOutputTokens?: number; temperature?: number }
}) {
  const maxSegments = Math.max(1, opts.maxSegments ?? 3)
  let contents = opts.contents
  let all = ''
  let finalFinish = ''
  let totalUsage: any = {}

  for (let seg = 0; seg < maxSegments; seg++) {
    const t0 = Date.now()
    const res = await opts.model.generateContent({
      contents,
      generationConfig: {
        maxOutputTokens:
          opts.genCfg?.maxOutputTokens ?? GEMINI_MAX_OUTPUT_TOKENS,
        temperature: opts.genCfg?.temperature ?? 1.0,
      },
    })
    const { text, finish, safety, usage } = extractGenText(res)

    console.log(
      '[gemini] finishReason=%s safety=%s',
      finish,
      JSON.stringify(safety || []).slice(0, 160)
    )
    console.log(
      '[gemini] parts0=%s',
      JSON.stringify(res?.response?.candidates?.[0]?.content?.parts || []).slice(
        0,
        160
      )
    )
    console.log(
      '[gemini] usage=%s took=%dms',
      JSON.stringify(usage || {}),
      Date.now() - t0
    )

    finalFinish = finish
    all += (all && text ? '\n' : '') + (text || '')
    totalUsage = usage

    if (finish !== 'MAX_TOKENS') break

    contents = [
      ...contents,
      { role: 'model', parts: [{ text: text || '' }] },
      { role: 'user', parts: [{ text: '（続き）' }] },
    ]
  }

  return { text: all.trim(), finish: finalFinish, usage: totalUsage }
}

async function maybeUpdateRoomSummary(
  roomRef: FirebaseFirestore.DocumentReference,
  genAI: GoogleGenerativeAI
) {
  try {
    const hist = await roomRef
      .collection('messages')
      .orderBy('createdAt', 'asc')
      .limitToLast(120)
      .get()

    if (hist.size < SUMMARY_TRIGGER_TURNS) return

    const memRef = roomRef.collection('memory').doc('state')
    const memSnap = await memRef.get()
    const lastAt = memSnap.exists
      ? (memSnap.data() as any).updatedAt?.toMillis?.() || 0
      : 0
    if (lastAt && Date.now() - lastAt < SUMMARY_MIN_INTERVAL_MIN * 60 * 1000) {
      return
    }

    const lines: string[] = []
    for (const d of hist.docs) {
      const m = d.data() as any
      if (m.system) continue
      const who = m.uid === 'ownerAI' ? 'オーナー' : 'お客'
      const t = String(m.text || '').replace(/\s+/g, ' ').trim()
      if (!t) continue
      lines.push(`${who}: ${t}`)
    }
    if (!lines.length) return

    let transcript = lines.join('\n')
    if (transcript.length > SUMMARY_MAX_INPUT_CHARS) {
      transcript = transcript.slice(-SUMMARY_MAX_INPUT_CHARS)
    }

    const apiKey = getGeminiApiKey()
    if (!apiKey) return
    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL_ID,
      systemInstruction:
        'あなたは会話の要約者です。対話のなかにおける重要な情報、ユーザーの心情、約束事などの会話をするうえで記憶しておくべき情報を日本語で箇条書き＋短い段落で簡潔にまとめてください。',
    })

    const res = await model.generateContent({
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `次の対話ログを要約してください。\n---\n${transcript}\n---`,
            },
          ],
        },
      ],
      generationConfig: {
        maxOutputTokens: SUMMARY_MAX_OUTPUT_TOKENS,
        temperature: 0.5,
      },
    })

    const { text: summary } = extractGenText(res)
    if (summary?.trim()) {
      await memRef.set(
        { summary: summary.trim(), updatedAt: nowTs(), size: hist.size },
        { merge: true }
      )
      await db.collection('_diag_ai').add({
        type: 'summary_update',
        roomId: roomRef.id,
        size: hist.size,
        at: admin.firestore.FieldValue.serverTimestamp(),
      })
    }
  } catch (e) {
    console.error('[summary] error', e)
  }
}

/* ============ オーナーAI：ルーム開始（Callable） ============ */
// ※ ここは Gemini を呼ばないため、Secret のバインドは不要にして安定化
export const startOwnerRoom = onCall(
  { region: 'asia-northeast1' },
  async (req) => {
    try {
      const uid = req.auth?.uid
      if (!uid) throw new HttpsError('unauthenticated', 'login required')

      const profile = sanitizeProfile((req.data || {}).profile)

      const roomRef = db.collection('rooms').doc()
      const now = nowTs()

      await roomRef.set({
        members: [uid, 'ownerAI'],
        status: 'open',
        queueKey: 'owner',
        isOwnerRoom: true, // ★ 追加
        createdAt: now,
        expireAt: tsPlusHours(ROOM_EXPIRE_HOURS),
        profiles: {
          [uid]: profile,
          ownerAI: {
            nickname: 'オーナー',
            profile: '雨宿りカフェのオーナー',
            icon: OWNER_ICON_URL,
          },
        },
      })

      // OPENメッセージ（固定文）をオーナーから1通投稿
      await roomRef.collection('messages').add({
        text:
          'ようこそ。外は足元が悪いですね。よろしければ、お呼びする名前を教えてください。匿名のままでも大丈夫ですよ。',
        uid: 'ownerAI',
        system: false,
        createdAt: nowTs(),
      })

      // KPI: AIルーム開始
      await incDaily({ owner_room_started_total: 1 })
      await logEvent({ type: 'owner_room_started', uid, roomId: roomRef.id })

      return { roomId: roomRef.id }
    } catch (e: any) {
      console.error('[startOwnerRoom] error', e)
      throw new HttpsError(
        'internal',
        e?.message || 'failed to create owner room'
      )
    }
  }
)

/* ============ オーナーAI：ユーザ発言に反応して返信（onCreate Trigger） ============ */
export const ownerAIOnUserMessage = onDocumentCreated(
  {
    region: 'asia-northeast1',
    document: 'rooms/{roomId}/messages/{msgId}',
    secrets: [GEMINI_API_KEY_SECRET],
    timeoutSeconds: 60,
    memory: '1GiB',
  },
  async (event) => {
    const snap = event.data
    if (!snap) return

    const msg = snap.data() as any
    const text: string = (msg?.text || '').toString()
    const fromUid: string = (msg?.uid || '').toString()
    const system: boolean = !!msg?.system
    if (!text.trim() || system) return
    if (fromUid === 'ownerAI') return

    const roomId = event.params.roomId
    const roomRef = db.collection('rooms').doc(roomId)
    const roomSnap = await roomRef.get()
    if (!roomSnap.exists) return
    const room = roomSnap.data() as any

    // 対象は「ownerAI がメンバーのルーム」のみ
    const members: string[] = Array.isArray(room.members) ? room.members : []
    if (!members.includes('ownerAI')) return

    // 二重返信防止用ロック
    const lockRef = roomRef
      .collection('_locks')
      .doc(`ownerAI_${event.params.msgId}`)
    try {
      await lockRef.create({ at: nowTs() })
    } catch {
      return // 既に処理済み
    }

    // 直近履歴（最新30件）を正規化
    const histSnap = await roomRef
      .collection('messages')
      .orderBy('createdAt', 'asc')
      .limitToLast(30)
      .get()

    let contents = buildGeminiContentsFromSnapshot(histSnap)
    if (!contents.length) {
      contents = [{ role: 'user', parts: [{ text }] }]
    }

    // APIキー取得（Secret/ENV）— ない場合はフォールバック返信
    const apiKey = getGeminiApiKey()
    console.log(
      '[gemini] key fingerprint:',
      apiKey
        ? `${apiKey.slice(0, 4)}...${apiKey.slice(-4)} len=${apiKey.length}`
        : 'empty'
    )
    if (!apiKey) {
      await db.collection('_diag_ai').add({
        type: 'gen_error',
        roomId,
        at: admin.firestore.FieldValue.serverTimestamp(),
        err: 'missing_api_key',
        code: 'NO_KEY',
      })
      await roomRef.collection('messages').add({
        text: 'なるほどです。もしよければ、もう少し詳しく聞かせてください。',
        uid: 'ownerAI',
        system: false,
        createdAt: nowTs(),
      })
      return
    }

    // メモリ（要約）を取得してシステムプロンプトに注入
    let memorySummary = ''
    try {
      const mem = await roomRef.collection('memory').doc('state').get()
      if (mem.exists) memorySummary = String((mem.data() as any)?.summary || '')
    } catch {}

    const genAI = new GoogleGenerativeAI(apiKey)
    const systemInstruction =
      OWNER_SYSTEM_PROMPT +
      (memorySummary
        ? `\n\n【会話の要約（参照用）】\n${memorySummary}\n（上記は背景情報の要約です。引用せず、文脈把握のみに利用してください）`
        : '')

    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL_ID,
      systemInstruction,
    })

    // --- 診断ログ: 送信プレビュー ---
    console.log(
      '[gemini] request: msgs=%d last="%s"',
      contents.length,
      (contents[contents.length - 1]?.parts?.[0]?.text || '').slice(0, 40)
    )

    // 自動継続リトライ付き生成
    let reply = ''
    try {
      const { text: out } = await generateWithAutoContinue({
        model,
        contents,
        maxSegments: 3,
        genCfg: {
          maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
          temperature: 1.0,
        },
      })
      reply = out
    } catch (e: any) {
      console.error('[ownerAIOnUserMessage] generateContent error', {
        message: e?.message,
        code: e?.status || e?.code,
        name: e?.name,
        stack: e?.stack,
      })
      await db.collection('_diag_ai').add({
        type: 'gen_error',
        roomId,
        at: admin.firestore.FieldValue.serverTimestamp(),
        err: String(e?.message || e),
        code: e?.status || e?.code || null,
      })
      reply = ''
    }

    if (!reply) {
      await db.collection('_diag_ai').add({
        type: 'gen_empty',
        roomId,
        at: admin.firestore.FieldValue.serverTimestamp(),
      })
      reply = 'なるほどです。もしよければ、もう少し詳しく聞かせてください。'
    }

    await roomRef.collection('messages').add({
      text: reply,
      uid: 'ownerAI',
      system: false,
      createdAt: nowTs(),
    })

    try {
      await maybeUpdateRoomSummary(roomRef, genAI)
    } catch (e) {
      console.error('[summary] schedule error', e)
    }
  }
)

/* ============ （新規）メッセージ到着でKPI更新 + ルームのmessageCount更新 ============ */
const LOG_EACH_MESSAGE_EVENT = false
export const metricsOnMessageCreated = onDocumentCreated(
  { region: 'asia-northeast1', document: 'rooms/{roomId}/messages/{msgId}' },
  async (event) => {
    const snap = event.data
    if (!snap) return

    const m = snap.data() as any
    if (!m || m.system) return

    const roomId = event.params.roomId
    const uid = String(m.uid || '')
    const isOwnerMsg = uid === 'ownerAI'

    // ルームのメッセージ数を加算（将来の分析用）
    try {
      await db.doc(`rooms/${roomId}`).set(
        { messageCount: admin.firestore.FieldValue.increment(1) },
        { merge: true }
      )
    } catch (e) {
      console.warn('[metrics] increment messageCount failed', roomId, e)
    }

    // ルームを参照して ownerAI ルームか判定
    let hasOwner = false
    try {
      const rs = await db.doc(`rooms/${roomId}`).get()
      const members: string[] = Array.isArray(rs.data()?.members) ? rs.data()!.members : []
      hasOwner = members.includes('ownerAI')
    } catch (e) {
      console.warn('[metrics] read room failed', roomId, e)
    }

    const inc: Record<string, number> = { messages_total: 1 }
    if (hasOwner) {
      if (isOwnerMsg) inc['messages_from_owner_total'] = 1
      else inc['messages_to_owner_total'] = 1
    } else {
      inc['messages_to_human_total'] = 1
    }
    await incDaily(inc)

    if (LOG_EACH_MESSAGE_EVENT) {
      const type: MetricEventType = hasOwner
        ? (isOwnerMsg ? 'msg_from_owner' : 'msg_to_owner')
        : 'msg_to_human'
      await logEvent({ type, uid, roomId })
    }
  }
)

/* ============ matchEntries onCreate：マッチング本体（stale/expired 除外 & profiles 保存） ============ */
export const matchOnCreate = onDocumentCreated(
  { region: 'asia-northeast1', document: 'matchEntries/{entryId}' },
  async (event) => {
    const snap = event.data
    if (!snap) return

    const meRef = snap.ref
    const me = snap.data() as any
    const queueKey = me.queueKey as string
    const myUid = me.uid as string
    const status = me.status as string
    const nowMillis = Date.now()

    if (!queueKey || !myUid || status !== 'queued') return

    let matched = false
    let matchedQueueKey: 'country' | 'global' | null = null

    try {
      await db.runTransaction(async (tx) => {
        // 最新化
        const meSnap = await tx.get(meRef)
        if (!meSnap.exists) return
        const meData = meSnap.data() as any
        if (meData.status !== 'queued') return

        // 自分が stale/expired ならマークして終了
        const meLast = meData.lastSeenAt?.toMillis?.() || 0
        const meExp = meData.expiresAt?.toMillis?.() || 0
        if (meExp && meExp <= nowMillis) {
          tx.update(meRef, { status: 'expired' })
          return
        }
        if (!meLast || nowMillis - meLast > ENTRY_STALE_SEC * 1000) {
          tx.update(meRef, { status: 'stale', expiresAt: nowTs() })
          return
        }

        // 候補取得
        const candSnap = await tx.get(
          db
            .collection('matchEntries')
            .where('queueKey', '==', queueKey)
            .where('status', '==', 'queued')
            .orderBy(admin.firestore.FieldPath.documentId())
            .limit(10)
        )

        // 1人目の正常候補を探す
        let partnerDoc:
          | FirebaseFirestore.QueryDocumentSnapshot
          | undefined = undefined
        for (const d of candSnap.docs) {
          if (d.id === meRef.id) continue
          const pd = d.data() as any
          const pLast = pd.lastSeenAt?.toMillis?.() || 0
          const pExp = pd.expiresAt?.toMillis?.() || 0
          if (pExp && pExp <= nowMillis) {
            tx.update(d.ref, { status: 'expired' })
            continue
          }
          if (!pLast || nowMillis - pLast > ENTRY_STALE_SEC * 1000) {
            tx.update(d.ref, { status: 'stale', expiresAt: nowTs() })
            continue
          }
          partnerDoc = d
          break
        }

        if (!partnerDoc) {
          tx.set(
            meRef,
            { expiresAt: tsPlusMin(QUEUE_EXPIRE_MIN), info: 'waiting' },
            { merge: true }
          )
          return
        }

        const pRef = partnerDoc.ref
        const pSnap = await tx.get(pRef)
        if (!pSnap.exists) return
        const pData = pSnap.data() as any
        if (pData.status !== 'queued') {
          tx.set(
            meRef,
            { expiresAt: tsPlusMin(QUEUE_EXPIRE_MIN), info: 'waiting' },
            { merge: true }
          )
          return
        }

        // 同日再マッチ防止（UTCキー）
        const histRef = db.doc(
          `pairHistory/${dayKey()}_${pairKey(myUid, pData.uid as string)}`
        )
        const hist = await tx.get(histRef)
        if (hist.exists) {
          tx.set(
            meRef,
            { expiresAt: tsPlusMin(QUEUE_EXPIRE_MIN), info: 'paired_today' },
            { merge: true }
          )
          return
        }

        // ルーム作成（profiles を保存）
        const roomRef = db.collection('rooms').doc()
        const now = nowTs()
        const meProf = sanitizeProfile(meData.profile)
        const pProf = sanitizeProfile(pData.profile)

        tx.set(roomRef, {
          members: [myUid, pData.uid as string],
          status: 'open',
          queueKey,
          isOwnerRoom: false, // ★ 追加（対人ルーム）
          createdAt: now,
          expireAt: tsPlusHours(ROOM_EXPIRE_HOURS),
          profiles: {
            [myUid]: meProf,
            [pData.uid as string]: pProf,
          },
        })

        // 双方を matched に
        tx.update(meRef, {
          status: 'matched',
          roomId: roomRef.id,
          matchedAt: now,
          info: admin.firestore.FieldValue.delete(),
        })
        tx.update(pRef, {
          status: 'matched',
          roomId: roomRef.id,
          matchedAt: now,
          info: admin.firestore.FieldValue.delete(),
        })

        // 同日リマッチ回避履歴
        tx.set(histRef, { createdAt: now, expireAt: tsPlusHours(48) })

        matched = true
        matchedQueueKey = queueKey as 'country' | 'global'
      })
    } catch (e) {
      console.error('[matchOnCreate] TX error', meRef.id, e)
    }

    // KPI: マッチ成立（対人セッション開始）
    if (matched) {
      const inc: Record<string, number> = { match_made_total: 1 }
      if (matchedQueueKey === 'country') inc['match_made_country_total'] = 1
      if (matchedQueueKey === 'global') inc['match_made_global_total'] = 1
      await incDaily(inc)
      await logEvent({ type: 'match_made', queueKey: matchedQueueKey || undefined, uid: myUid })
    }
  }
)

/* ============ 話題候補API（スタブ） ============ */
export const genStarters = onCall(
  { region: 'asia-northeast1' },
  async (req) => {
    const uid = req.auth?.uid
    if (!uid) throw new HttpsError('unauthenticated', 'login required')
    const { roomId } = (req.data || {}) as { roomId: string }
    if (!roomId) throw new HttpsError('invalid-argument', 'roomId required')

    const room = await db.doc(`rooms/${roomId}`).get()
    if (!room.exists) throw new HttpsError('not-found', 'room not found')
    const data = room.data() as any
    const profiles = (data.profiles || {}) as Record<string, ProfileSnap>
    const members: string[] = data.members || []

    const partnerUid = members.find((m) => m !== uid && m !== 'ownerAI')
    const me = sanitizeProfile(profiles[uid])
    const you = sanitizeProfile(profiles[partnerUid || 'ownerAI'])

    const starters = [
      `${you.nickname}さんの最近の楽しみは？`,
      `${me.nickname}と${you.nickname}、雨の日の過ごし方は？`,
      `この近所の「雨の日に合う」スポット、知ってますか？`,
    ]
    return { starters }
  }
)

/* ============ ★ 追加：rooms の close → KPI集計（onUpdate） ============ */
export const onRoomClosed = onDocumentUpdated(
  { region: 'asia-northeast1', document: 'rooms/{roomId}' },
  async (event) => {
    const before = event.data?.before?.data() as any
    const after = event.data?.after?.data() as any
    if (!before || !after) return

    // open→closed 以外は無視
    if (before.status === 'closed' || after.status !== 'closed') return

    const roomRef = event.data!.after.ref
    try {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(roomRef)
        if (!snap.exists) return
        const data = snap.data() as any

        // 既に集計済みならスキップ（冪等）
        if (data.statsCommittedAt) return

        const createdAtMs = data.createdAt?.toMillis?.() || 0
        const endedAtMs =
          data.endedAt?.toMillis?.() || Date.now() // 万一欠落なら補完
        const durationSec = createdAtMs
          ? Math.max(0, Math.floor((endedAtMs - createdAtMs) / 1000))
          : 0

        const isOwnerRoom =
          !!data.isOwnerRoom ||
          (Array.isArray(data.members) && data.members.includes('ownerAI')) ||
          data.queueKey === 'owner'

        const inc: Record<string, number> = {
          rooms_ended_total: 1,
          room_total_duration_sec: durationSec,
        }
        if (isOwnerRoom) {
          inc['rooms_ended_owner_total'] = 1
          inc['room_owner_total_duration_sec'] = durationSec
        } else {
          inc['rooms_ended_human_total'] = 1
          inc['room_human_total_duration_sec'] = durationSec
        }

        // KPI（日次/JST）をTX内で加算 → ルームに statsCommittedAt をマーク
        incDailyTx(tx, inc)

        // 監査用（任意）：metrics_rooms/{roomId}
        const auditRef = db.collection('metrics_rooms').doc(roomRef.id)
        tx.set(
          auditRef,
          {
            roomId: roomRef.id,
            isOwnerRoom,
            createdAt: data.createdAt || null,
            endedAt: admin.firestore.Timestamp.fromMillis(endedAtMs),
            durationSec,
            closedReason: data.closedReason || 'unknown',
            day: dayKeyJst(),
            committedAt: nowTs(),
          },
          { merge: true }
        )

        // 集計済みマーク
        const toMerge: any = { statsCommittedAt: nowTs() }
        if (!data.endedAt) toMerge.endedAt = admin.firestore.Timestamp.fromMillis(endedAtMs)
        tx.set(roomRef, toMerge, { merge: true })
      })
    } catch (e) {
      console.error('[onRoomClosed] TX error', roomRef.id, e)
    }
  }
)

/* ============ ★ 追加：問い合わせメール送信（Callable） ============ */
/** Secrets（未設定時は環境変数 / デフォルトへフォールバック） */
const SMTP_HOST_SECRET = defineSecret('SMTP_HOST') // 例: smtp.gmail.com
const SMTP_PORT_SECRET = defineSecret('SMTP_PORT') // 例: 465
const SMTP_USER_SECRET = defineSecret('SMTP_USER') // 送信元アカウント
const SMTP_PASS_SECRET = defineSecret('SMTP_PASS') // アプリパスワード等
const CONTACT_TO_SECRET = defineSecret('CONTACT_TO') // 受信先

function readSecret(param: ReturnType<typeof defineSecret>, envKey: string, def = '') {
  try {
    const v = String(param.value() || '').trim()
    if (v) return v
  } catch {}
  const env = String(process.env[envKey] || '').trim()
  return env || def
}

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
}

export const sendContact = onCall(
  {
    region: 'asia-northeast1',
    secrets: [
      SMTP_HOST_SECRET,
      SMTP_PORT_SECRET,
      SMTP_USER_SECRET,
      SMTP_PASS_SECRET,
      CONTACT_TO_SECRET,
    ],
    timeoutSeconds: 60,
    memory: '256MiB',
  },
  async (req) => {
    const data = (req.data || {}) as {
      name?: string
      email?: string
      category?: '問い合わせ' | '要望' | 'その他' | string
      message?: string
    }

    const name = String(data.name || '').trim().slice(0, 80)
    const email = String(data.email || '').trim().slice(0, 200)
    const categoryRaw = String(data.category || 'その他').trim()
    const allowed = new Set(['問い合わせ', '要望', 'その他'])
    const category = allowed.has(categoryRaw) ? (categoryRaw as any) : 'その他'
    const message = String(data.message || '').trim().slice(0, 8000)
    const uid = req.auth?.uid || null

    if (!name) throw new HttpsError('invalid-argument', 'name required')
    if (!email || !isValidEmail(email))
      throw new HttpsError('invalid-argument', 'valid email required')
    if (!message) throw new HttpsError('invalid-argument', 'message required')

    const logRef = await db.collection('contacts').add({
      name,
      email,
      category,
      message,
      uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    })

    const host = readSecret(SMTP_HOST_SECRET, 'SMTP_HOST', 'smtp.gmail.com')
    const portStr = readSecret(SMTP_PORT_SECRET, 'SMTP_PORT', '465')
    const port = Number(portStr) || 465
    const user = readSecret(SMTP_USER_SECRET, 'SMTP_USER', 'protoplaystudio@gmail.com')
    const pass = readSecret(SMTP_PASS_SECRET, 'SMTP_PASS', '')
    const to = readSecret(CONTACT_TO_SECRET, 'CONTACT_TO', 'protoplaystudio@gmail.com')

    if (!user || !pass) {
      console.warn(
        '[sendContact] SMTP credentials missing. Skipping email, only logged to Firestore.'
      )
      return { ok: true, mailed: false, id: logRef.id }
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    })

    const subject = `【Amayadori】${category} - ${name}`
    const lines = [
      'Amayadori に新しいお問い合わせが届きました。',
      '',
      `■ カテゴリ: ${category}`,
      `■ お名前   : ${name}`,
      `■ メール   : ${email}`,
      `■ UID      : ${uid || '(anonymous)'}`,
      '',
      '―― 本文 ――',
      message,
      '',
      `受信(UTC): ${new Date().toISOString()}`,
      `FirestoreID: ${logRef.id}`,
    ]
    const text = lines.join('\n')

    await transporter.sendMail({
      from: `"Amayadori お問い合わせ" <${user}>`,
      to,
      subject,
      text,
      replyTo: email,
    })

    return { ok: true, mailed: true, id: logRef.id }
  }
)

/* ============ GC（自動掃除 + ★KPIフォールバック集計） ============ */
export const gcSweep = onSchedule(
  {
    region: 'asia-northeast1',
    schedule: 'every 5 minutes',
    timeZone: 'Asia/Tokyo',
  },
  async () => {
    const started = Date.now()
    const now = nowTs()
    const nowMs = Date.now()
    const oldMsgTs = admin.firestore.Timestamp.fromDate(
      new Date(Date.now() - MESSAGE_MAX_AGE_HOURS * 3600 * 1000)
    )
    const oldDiagTs = admin.firestore.Timestamp.fromDate(
      new Date(Date.now() - DIAG_MAX_AGE_HOURS * 3600 * 1000)
    )

    let totalDeleted = 0
    async function deleteByQuery(
      q: FirebaseFirestore.Query,
      label: string,
      perBatch = GC_BATCH_SIZE,
      hardLimit = GC_MAX_DELETES_PER_RUN
    ) {
      let deleted = 0
      while (deleted < hardLimit) {
        const snap = await q.limit(perBatch).get()
        if (snap.empty) break
        const batch = db.batch()
        snap.docs.forEach((d) => batch.delete(d.ref))
        await batch.commit()
        deleted += snap.size
        totalDeleted += snap.size
        console.log(`[gc] ${label}: deleted ${snap.size} (cum ${deleted})`)
      }
      return deleted
    }

    // matchEntries
    await deleteByQuery(
      db.collection('matchEntries').where('expiresAt', '<=', now),
      'matchEntries'
    )

    // rooms（messages を先に削除）— ★削除前にKPIフォールバック集計
    const roomSnap = await db
      .collection('rooms')
      .where('expireAt', '<=', now)
      .orderBy('expireAt', 'asc')
      .limit(50)
      .get()

    for (const r of roomSnap.docs) {
      const data = r.data() as any

      // ★ フォールバック：未集計のままGC対象ならここで一回だけ日次加算
      if (!data.statsCommittedAt) {
        try {
          const createdAtMs = data.createdAt?.toMillis?.() || 0
          const endedAtMs = data.endedAt?.toMillis?.() || nowMs
          const durationSec = createdAtMs
            ? Math.max(0, Math.floor((endedAtMs - createdAtMs) / 1000))
            : 0
          const isOwnerRoom =
            !!data.isOwnerRoom ||
            (Array.isArray(data.members) && data.members.includes('ownerAI')) ||
            data.queueKey === 'owner'

          const inc: Record<string, number> = {
            rooms_ended_total: 1,
            room_total_duration_sec: durationSec,
          }
          if (isOwnerRoom) {
            inc['rooms_ended_owner_total'] = 1
            inc['room_owner_total_duration_sec'] = durationSec
          } else {
            inc['rooms_ended_human_total'] = 1
            inc['room_human_total_duration_sec'] = durationSec
          }
          await incDaily(inc)

          // 集計済みマーク（closed でなければここで閉じる）
          await r.ref.set(
            {
              status: 'closed',
              endedAt: data.endedAt || admin.firestore.Timestamp.fromMillis(endedAtMs),
              closedReason: data.closedReason || 'gc_expire',
              statsCommittedAt: nowTs(),
            },
            { merge: true }
          )
        } catch (e) {
          console.warn('[gc] fallback metrics failed', r.id, e)
        }
      }

      // 先にメッセージを削除
      let loop = 0
      while (loop < 20) {
        const msgs = await db
          .collection('rooms')
          .doc(r.id)
          .collection('messages')
          .orderBy(admin.firestore.FieldPath.documentId())
          .limit(GC_BATCH_SIZE)
          .get()
        if (msgs.empty) break
        const batch = db.batch()
        msgs.docs.forEach((m) => batch.delete(m.ref))
        await batch.commit()
        totalDeleted += msgs.size
        loop++
        console.log(`[gc] room ${r.id}: deleted ${msgs.size} messages (loop ${loop})`)
      }

      await db.collection('rooms').doc(r.id).delete()
      totalDeleted += 1
      console.log(`[gc] room ${r.id}: deleted`)
    }

    // 古い messages（collectionGroup）
    await deleteByQuery(
      db.collectionGroup('messages').where('createdAt', '<=', oldMsgTs),
      'messages(old)'
    )

    // pairHistory
    await deleteByQuery(
      db.collection('pairHistory').where('expireAt', '<=', now),
      'pairHistory'
    )

    // _diag_weather
    await deleteByQuery(
      db.collection('_diag_weather').where('at', '<=', oldDiagTs),
      '_diag_weather(old)'
    )

    console.log(
      `[gc] sweep done: totalDeleted=${totalDeleted}, took=${Date.now() - started}ms`
    )
  }
)
