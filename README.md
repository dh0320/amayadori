# Amayadori

雨の日の「少しだけ話したい」を受け止める、匿名チャット体験のための Next.js + Firebase アプリです。ランディングページからアプリ本体へ遷移し、ユーザーはプロフィールを入力したうえで待機キューに参加します。対人マッチングが成立すれば 1対1 チャットを開始し、一定時間相手が見つからなければ AI オーナーとの会話にフォールバックします。管理者向けには、利用状況や KPI を確認するダッシュボードも用意されています。

この README は、これから参加するエンジニアが **「何を作っているアプリなのか」「どう動くのか」「どこを見ればよいのか」** を最短で理解できることを目的にまとめています。

---

## 1. このアプリが提供しているもの

### ユーザー向け機能
- ランディングページ表示
- お問い合わせフォーム送信
- 利用規約 / プライバシーポリシー閲覧
- ニックネーム・プロフィール・アイコン設定
- 地域キュー / グローバルキューへの待機参加
- 対人 1対1 マッチング
- AI オーナーとのチャット
- 退室、クールダウン、再入室制御
- ページ訪問 / メッセージ / ルーム終了などのメトリクス収集

### 運営向け機能
- 管理者ログイン
- 管理者権限チェック
- KPI ダッシュボード表示
- 日次 CSV エクスポート
- 問い合わせ内容の Firestore 保存とメール転送
- 定期 GC による不要データ削除

---

## 2. 技術スタック

### フロントエンド
- Next.js 14 App Router
- React 18
- TypeScript
- Tailwind CSS

### バックエンド / インフラ
- Firebase Authentication
  - 匿名認証
  - メール / パスワード認証（管理者用）
- Cloud Firestore
- Cloud Functions for Firebase v2
- Firebase Hosting
- Firebase Storage

### AI / 外部連携
- Google Gemini API（Cloud Functions から利用）
- Nodemailer / SMTP（問い合わせメール送信用）

---

## 3. 全体アーキテクチャ

```text
[Browser / Next.js App]
  ├─ app/page.tsx                ランディング・問い合わせ導線
  ├─ app/amayadori/page.tsx      プロフィール入力 / キュー参加 / AIフォールバック
  ├─ app/chat/page.tsx           チャットUI
  ├─ app/admin/*                 管理画面
  └─ lib/firebase.ts             Firebase初期化・匿名認証

                │
                ▼
        [Firebase Authentication]
                │
                ▼
           [Cloud Firestore]
     rooms / matchEntries / metrics_daily ...
                ▲
                │
        [Cloud Functions v2]
  enter / touchEntry / cancelEntry / leaveRoom
  startOwnerRoom / ownerAIOnUserMessage
  trackVisit / checkAdmin / sendContact / gcSweep
```

### 設計の考え方
- **UI は Next.js 側に寄せる**
- **状態の真実は Firestore に置く**
- **マッチングやルーム終了など整合性が必要な処理は Cloud Functions / Transaction で行う**
- **AI 返信は Firestore Trigger で非同期に生成する**
- **運営分析用の指標は `metrics_daily` と `metrics_rooms` に集約する**

---

## 4. 主要画面と役割

### `/` ランディングページ
ファイル: `app/page.tsx`

役割:
- サービス紹介
- `trackVisit` による LP PV 計測
- お問い合わせフォーム送信
- `/amayadori` への導線

ポイント:
- フロント側で軽いバリデーションを実施
- `sendContact` Callable を呼んで Firestore + メール送信を行う
- 雨アニメーションやフェード演出をこのページ単体で持っている

### `/amayadori` アプリ入口
ファイル: `app/amayadori/page.tsx`

役割:
- プロフィール入力
- 地域選択と待機開始
- 待機中の heartbeat / cancel
- 一定時間マッチしない場合の AI オーナー誘導
- タブ離脱時の sendBeacon ベース待機解除

この画面が、実質的な「マッチング制御のフロント側ハブ」です。

### `/chat?room=...` チャット画面
ファイル: `app/chat/page.tsx`

役割:
- ルームとメッセージの購読
- 相手プロフィール表示
- メッセージ送信
- 会話候補の提示
- 退室処理
- 相手退出通知の表示

ポイント:
- Firestore `rooms/{roomId}/messages` を購読
- 対人ルームと AI ルームを同じ UI で扱う
- オーナー AI ルームでは `ownerAIOnUserMessage` Trigger が応答を返す

### `/admin/login` 管理者ログイン
ファイル: `app/admin/login/page.tsx`

役割:
- メール / パスワードで管理者ログイン
- 匿名セッションからのアカウントリンク対応
- 通常ログイン / 匿名ログインの状態表示

### `/admin` 管理ダッシュボード
ファイル: `app/admin/page.tsx`

役割:
- `checkAdmin` で権限確認
- `metrics_daily`, `metrics_rooms`, `rooms`, `matchEntries` をもとに KPI 表示
- 直近 30 日の日次指標表示
- CSV ダウンロード

---

## 5. ユーザーフロー

### 5-1. 初回訪問から会話開始まで
1. ユーザーが `/` を開く
2. LP が `trackVisit(page=landing)` を送る
3. ユーザーが `/amayadori` に進む
4. アプリ入口ページが匿名認証を確保する
5. ユーザーがニックネーム / プロフィール / アイコンを入力する
6. 地域キューまたはグローバルキューで `enter` を呼ぶ
7. `matchEntries` に queued エントリーが作られる
8. `matchOnCreate` Trigger が別ユーザーとマッチングを試みる
9. マッチ成立時、`rooms/{roomId}` が作られる
10. フロントが entry の `roomId` を検知して `/chat?room=...` に遷移する
11. チャット画面でメッセージ送受信を開始する

### 5-2. マッチしなかった場合
1. 待機タイムアウト or 明示的なオーナー会話導線を踏む
2. `startOwnerRoom` を呼ぶ
3. `ownerAI` をメンバーに含む room が作成される
4. 初回固定メッセージが投稿される
5. ユーザー送信ごとに `ownerAIOnUserMessage` Trigger が Gemini で応答する

### 5-3. 退室時
1. ユーザーが `leaveRoom` を呼ぶ
2. transaction で room の `members` / `status` / `endedAt` などを更新する
3. 必要に応じて system message「会話相手が退席しました」を投稿する
4. `userStates/{uid}.lastLeftAt` に退室時刻を保存する
5. 次回 `enter` 時、クールダウン中なら拒否する
6. `onRoomClosed` がルーム終了メトリクスを集計する

---

## 6. Firestore データモデル

このアプリは Firestore 中心で設計されています。新規参加者はまず以下のコレクションを理解すると全体像がつかみやすいです。

### `rooms`
チャットルーム本体。

主なフィールド:
- `members: string[]`
- `status: 'open' | 'closed'`
- `queueKey: 'country' | 'global' | 'owner'`
- `isOwnerRoom: boolean`
- `createdAt`
- `endedAt`
- `expireAt`
- `profiles`
- `closedReason`
- `statsCommittedAt`

サブコレクション:
- `messages`
- `memory`
- `_locks`

### `rooms/{roomId}/messages`
チャット本文。

主なフィールド:
- `text`
- `uid`
- `system`
- `createdAt`

用途:
- フロント表示
- AI 応答トリガー
- メッセージ数 KPI 集計

### `matchEntries`
待機中エントリー。

主なフィールド:
- `uid`
- `queueKey`
- `status: queued | matched | canceled | expired | stale`
- `createdAt`
- `lastSeenAt`
- `expiresAt`
- `roomId`
- `profile`

用途:
- マッチング待機
- heartbeat 更新
- stale / expire 判定

### `userStates`
ユーザーごとの退室履歴などを保持。

主な用途:
- `lastLeftAt` によるクールダウン判定

### `metrics_daily`
日次 KPI の集計先。

例:
- `visits_total`
- `visitors_unique_total`
- `queue_enter_total`
- `match_made_total`
- `owner_room_started_total`
- `messages_total`
- `rooms_ended_total`
- `room_total_duration_sec`

### `metrics_rooms`
終了済みルーム単位の監査ログ。

### `contacts`
問い合わせフォームの保存先。

### `config/global`
サーバー挙動の設定。

現在コード上で参照している値:
- `weatherGateMode`
- `cooldownSec`

### `config/admins`
管理者 UID 配列を保持。

期待される構造例:
```json
{
  "uids": ["admin_uid_1", "admin_uid_2"]
}
```

### 補助 / 診断系コレクション
- `_diag_enter`
- `_diag_weather`
- `_diag_ai`
- `analytics_raw`
- `pairHistory`

本番運用時の調査で重要です。

---

## 7. Cloud Functions 一覧

### 入口・待機制御
- `trackVisit`
  - ページ訪問計測
- `enter`
  - 待機エントリー作成
  - クールダウン判定
  - 天候ゲート判定（現状 stub）
- `touchEntry`
  - heartbeat 更新
- `cancelEntry`
  - 個別待機キャンセル
- `cancelMyQueuedEntries`
  - 自分の queued エントリー一括キャンセル
- `cancelQueuedEntriesHttp`
  - sendBeacon 用 HTTP キャンセル API

### ルーム制御
- `leaveRoom`
  - 退室処理
  - 必要に応じて system message 追加
- `matchOnCreate`
  - `matchEntries` 作成を契機にマッチング実行
- `onRoomClosed`
  - room close を契機に KPI / room 監査ログ集計

### AI 関連
- `startOwnerRoom`
  - AI オーナールーム開始
- `ownerAIOnUserMessage`
  - ユーザー発話に対する Gemini 返信生成
- `genStarters`
  - 会話の話題候補生成（現在は軽いスタブ）

### 管理 / 運用
- `checkAdmin`
  - ログイン中 UID が `config/admins.uids` に含まれるか判定
- `sendContact`
  - 問い合わせ保存 + SMTP メール送信
- `gcSweep`
  - 定期 GC

---

## 8. AI オーナー機能の理解ポイント

このプロジェクトの特徴は、対人マッチングだけでなく **AI オーナーとの自然な雑談 fallback** を持っている点です。

### 動作概要
- `startOwnerRoom` が `ownerAI` を含むルームを作る
- 最初の固定メッセージを投稿する
- ユーザーが発言すると `ownerAIOnUserMessage` が発火する
- Trigger が会話履歴を取得し、Gemini へ渡す
- 必要に応じて `memory/state` の要約をシステム文脈に追加する
- 返信を `messages` に追記する

### 実装上の工夫
- 二重返信防止の `_locks` を使用
- 履歴は直近 16 ターンに圧縮
- `MAX_TOKENS` 時の自動継続あり
- 長会話では要約メモリを生成して文脈維持
- API キー欠落時はフォールバック文面を返す

### 変更時に注意すること
- プロンプト変更は UX に直結する
- 応答長、温度、要約条件は課金コストと品質に影響する
- Trigger なので失敗時は UI ではなくログで追うことが多い

---

## 9. フロントエンド構成

### `app/`
App Router の各ページ。

- `app/page.tsx` : LP
- `app/amayadori/page.tsx` : アプリ入口
- `app/chat/page.tsx` : チャット
- `app/admin/page.tsx` : 管理ダッシュボード
- `app/admin/login/page.tsx` : 管理者ログイン
- `app/terms/page.tsx` : 利用規約
- `app/policy/page.tsx` : プライバシーポリシー
- `app/layout.tsx` : ルートレイアウト
- `app/globals.css` : 共通スタイル

### `lib/`
- `lib/firebase.ts`
  - Firebase App 初期化
  - Auth / Firestore / Storage エクスポート
  - 匿名認証 `ensureAnon`
- `lib/api.ts`
  - Callable 参照ラッパー
- `lib/geo.ts`
  - ブラウザ位置情報取得

### `components/`
現在の本流 UI はページ内実装が中心で、`components/ChatWindow.tsx` と `components/EnterButton.tsx` は古い実装の名残りに近いです。大規模な改修前に「今も使われているか」を確認してください。

---

## 10. バックエンド構成

### `functions/src/index.ts`
ほぼすべての Cloud Functions がこの 1 ファイルにまとまっています。

これは理解しやすい一方で、責務がかなり集約されています。大きく以下のセクションに分けて読むと追いやすいです。

1. 共通 util / 日付 / 定数
2. 日次メトリクス補助関数
3. 訪問計測 / 管理者判定
4. 待機開始 / heartbeat / キャンセル
5. 退室処理
6. AI オーナー処理
7. メッセージ KPI
8. マッチング Trigger
9. 問い合わせ送信
10. GC

### 今後の改善余地
- `functions/src/index.ts` をドメイン別に分割する
  - `matching.ts`
  - `metrics.ts`
  - `owner-ai.ts`
  - `contact.ts`
  - `admin.ts`
- 型定義を共有化する
- Firestore schema を README か docs にさらに明文化する

---

## 11. ローカル開発セットアップ

### 前提
- Node.js 20+ 推奨
- npm
- Firebase プロジェクト
- Firebase CLI

### インストール
```bash
npm ci
cd functions && npm ci && cd ..
```

### フロント開発起動
```bash
npm run dev
```

### Functions ビルド
```bash
npm --prefix functions run build
```

### Lint
```bash
npm run lint
npm --prefix functions run lint
```

> 注意: ルートの `lint` は `next lint` を実行します。Next.js / ESLint の組み合わせによっては環境差分が出ることがあります。

---

## 12. 必要な環境変数

### フロントエンド (`.env.local` 想定)
```bash
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FUNCTIONS_REGION=asia-northeast1
NEXT_PUBLIC_ENABLE_APPCHECK=0
NEXT_PUBLIC_RECAPTCHA_V3_KEY=
NEXT_PUBLIC_POST_LEAVE_AD_SECONDS=20
```

### Functions 側で参照される環境変数 / Secret
- `GEMINI_API_KEY`（Secret 推奨）
- `GEMINI_MODEL_ID`
- `GEMINI_MAX_OUTPUT_TOKENS`
- `SMTP_HOST`（Secret 推奨）
- `SMTP_PORT`（Secret 推奨）
- `SMTP_USER`（Secret 推奨）
- `SMTP_PASS`（Secret 推奨）
- `CONTACT_TO`（Secret 推奨）

### Firebase Secrets の例
```bash
firebase functions:secrets:set GEMINI_API_KEY
firebase functions:secrets:set SMTP_HOST
firebase functions:secrets:set SMTP_PORT
firebase functions:secrets:set SMTP_USER
firebase functions:secrets:set SMTP_PASS
firebase functions:secrets:set CONTACT_TO
```

---

## 13. デプロイ構成

`firebase.json` より、以下の構成です。

### Hosting
- 公開ディレクトリ: `out`
- `/_next/**` などに長期キャッシュヘッダー付与
- `/api/cancelQueuedEntries` を `cancelQueuedEntriesHttp` へ rewrite
- その他は SPA 的に `/index.html` へ rewrite

### Functions
- codebase: `functions`
- runtime: Node.js 22
- predeploy:
  1. `npm ci` or `npm install`
  2. `npm run build`

### デプロイ時の注意
このリポジトリは Next.js App Router ですが、`firebase.json` の Hosting 側は `out` 前提です。実際のデプロイ導線が以下のどちらなのか、運用担当者に必ず確認してください。

- 静的 export をどこかで行っている
- もしくは別の CI / 手順で生成物を配置している

README を読んだ新規メンバーが最初に確認すべき運用ポイントのひとつです。

---

## 14. 認証 / 権限モデル

### 一般ユーザー
- 基本は匿名認証
- Firestore ルール上、サインインしていれば read/write 可

### 管理者
- メール / パスワード認証
- `checkAdmin` で `config/admins.uids` に含まれる UID のみ管理画面利用可

### Firestore Rules の現状
かなり広いです。

```text
match /{document=**} {
  allow read, write: if isSignedIn();
}
```

つまり **サインイン済みなら大半のドキュメントにアクセスできる** 状態です。匿名認証も含むため、セキュリティは今後の改善テーマです。

新規エンジニアが本番運用に入る場合、最初に見直す価値が高い箇所です。

---

## 15. メトリクス / ログの見方

### 主な KPI
- 訪問数
- ユニーク訪問数
- キュー参加数
- クールダウン拒否数
- マッチ成立数
- AI ルーム開始数
- メッセージ総数
- ルーム終了数
- 総会話時間

### 集計の粒度
- `trackVisit` は UTC 基準の日次カウント
- KPI の多くは JST 基準の日次カウント

### 調査時に見るコレクション
- `metrics_daily`
- `metrics_rooms`
- `_diag_enter`
- `_diag_weather`
- `_diag_ai`
- `analytics_raw`

### 典型的な障害調査
- 「待機できない」: `_diag_enter`, `matchEntries`, `userStates`
- 「AI が返事しない」: `_diag_ai`, `rooms/{roomId}/messages`, Secrets 設定
- 「管理画面に入れない」: `config/admins`, 認証状態, `checkAdmin`
- 「問い合わせメールが飛ばない」: `contacts`, SMTP Secrets

---

## 16. 新しく入るエンジニア向けのおすすめ読書順

### 最短 30 分で全体をつかむ順番
1. `package.json`
2. `app/page.tsx`
3. `app/amayadori/page.tsx`
4. `app/chat/page.tsx`
5. `lib/firebase.ts`
6. `functions/src/index.ts`
7. `app/admin/page.tsx`
8. `firebase.json`
9. `firestore.rules`

### 目的別の読み方

#### UI 改修したい
- `app/globals.css`
- `app/page.tsx`
- `app/amayadori/page.tsx`
- `app/chat/page.tsx`

#### マッチングロジックを触りたい
- `app/amayadori/page.tsx`
- `functions/src/index.ts` の `enter`, `touchEntry`, `cancelEntry`, `matchOnCreate`, `leaveRoom`

#### AI を改善したい
- `functions/src/index.ts` の `OWNER_SYSTEM_PROMPT`
- `startOwnerRoom`
- `ownerAIOnUserMessage`
- `maybeUpdateRoomSummary`

#### 運営指標を増やしたい
- `trackVisit`
- `metricsOnMessageCreated`
- `onRoomClosed`
- `app/admin/page.tsx`

---

## 17. よくある変更タスクと影響範囲

### 新しい KPI を追加したい
変更候補:
- `functions/src/index.ts` の日次集計処理
- `app/admin/page.tsx` の表示
- CSV 出力ロジック

### 待機ロジックを変えたい
変更候補:
- `app/amayadori/page.tsx`
- `functions/src/index.ts` の `enter`, `touchEntry`, `cancelEntry`, `matchOnCreate`

### AI の口調を変えたい
変更候補:
- `OWNER_SYSTEM_PROMPT`
- 返信の fallback 文面
- 要約条件 / 出力上限

### 問い合わせフォームを拡張したい
変更候補:
- `app/page.tsx`
- `functions/src/index.ts` の `sendContact`
- `contacts` 保存スキーマ

### 管理者を追加したい
対応:
- `config/admins.uids` に UID を追加

---

## 18. 既知の設計上の注意点

- Functions 実装が 1 ファイル集中で肥大化している
- Firestore ルールが広く、匿名認証ユーザーにも強い権限がある
- Hosting が `out` 前提で、Next.js App Router 運用との整合を確認したい
- `components/` 内に現行未使用の可能性が高い実装が残っている
- KPI が UTC と JST で混在しているため、分析時に注意が必要
- 天候ゲートは stub 実装で、本格運用ロジックは未実装

---

## 19. 最初の 1 週間でやるとよいこと

1. ローカルで起動する
2. Firebase の実データ構造をコンソールで確認する
3. `matchEntries` → `rooms` → `messages` の流れを追う
4. 管理画面で KPI の出所をコードと照らし合わせる
5. Secrets / 環境変数がどこまで本番設定されているか確認する
6. Firestore Rules とデプロイ手順の棚卸しをする

---

## 20. まとめ

Amayadori は、**匿名で入りやすい雨宿りチャット体験** を中心に、

- 対人マッチング
- AI オーナー fallback
- 管理 KPI
- 問い合わせ運用

を Firebase 上で一体化しているプロダクトです。

全体理解のコアは次の 3 点です。

1. **フロントは `/amayadori` と `/chat` が中心**
2. **バックエンドは `functions/src/index.ts` が中心**
3. **状態の主役は Firestore の `matchEntries`, `rooms`, `metrics_*`**

新規メンバーはまずこの README と上記主要ファイルをセットで読むことで、かなり短時間でキャッチアップできます。
