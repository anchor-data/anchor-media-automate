# Plan: Instagram 接続を Unified login（graph.facebook.com）に対応させる

## 背景

- 2026年10月ごろから、Meta の新規アプリでは「Instagram ログインによる API 設定（graph.instagram.com）」が選べなくなり、**Unified login（Facebook Login for Business + config_id）** に一本化された。新規アプリには Instagram App ID も発行されない。
  - 参考: [postiz-app#2350](https://github.com/gitroomhq/postiz-app/issues/2350), [openreply#104](https://github.com/diwenne/openreply/issues/104)
- 先方はこの方式で次のトークンを発行済み。
  - 種類: システムユーザーアクセストークン（SUAT、`EAA…`）
  - 有効期限: なし（`expires_at = 0`）
  - 接続先: `graph.facebook.com`
  - 権限: `instagram_basic` / `instagram_content_publish` / `instagram_manage_insights` / `instagram_manage_comments` / `instagram_manage_messages`
  - IG アカウント: `ac_test_1023`（`17841453498020555`）。`me/assigned_instagram_accounts` で取得できることは確認済み
- 現状のコードは graph.instagram.com のトークン（`IGAA…`、有効期限60日、自動リフレッシュあり）専用のため、以下の問題がある。
  1. 接続時の `GET graph.instagram.com/me` が失敗して、接続できない
  2. 有効期限を60日と決め打ちしているため、60日後に `publishPost` が「期限切れ」で投稿を止める
  3. cron の `refresh_access_token` が10分ごとに失敗する

## ゴール / 非ゴール

**ゴール**
- 既存の Instagram ログイン方式（`IGAA…`）を壊さずに、Unified login 方式（`EAA…`）のトークンも貼り付けて接続できるようにする
- Unified login 方式でもカルーセルの予約投稿が動くようにする
- 無期限トークンを正しく扱う（期限チェックとリフレッシュの対象から外す）

**非ゴール（今回はやらない）**
- Facebook Login for Business の OAuth リダイレクトフロー（config_id を使ったログインボタン）
- インサイト・コメント・DM の機能（分析画面は今もモックのまま）
- トークンの暗号化保存や、GCP Secret Manager との連携

## 設計

### 接続方式（provider）

`InstagramProvider = "instagram_login" | "facebook_login"`

| | instagram_login（既存） | facebook_login（新規） |
|---|---|---|
| ホスト | `https://graph.instagram.com/v23.0` | `https://graph.facebook.com/v26.0` |
| トークンの形式 | `IGAA…` | `EAA…` |
| IG ID の取得 | `GET /me?fields=user_id,username` | `GET /me/assigned_instagram_accounts`。取れなければ手入力の `igUserId` を使う |
| 有効期限 | 約60日（リフレッシュする） | 期限なしとして扱う |
| リフレッシュ | `ig_refresh_token` | しない |

- **判定方法**: トークンの先頭が `EAA` なら `facebook_login`、それ以外は `instagram_login`。
- **投稿の流れ**（`/{ig-id}/media` → `status_code` のポーリング → `media_publish` → `permalink` 取得）は両方式でエンドポイントが同じなので、ホストを差し替えるだけでよい。

### 有効期限の扱い

- `InstagramConnection.expiresAt` を `string | null` に変更する。`null` は期限なしを表す。
- DB の `expires_at` は `NOT NULL` のまま、期限なしは空文字 `''` で保存し、読み込み時に `null` に変換する。SQLite では既存カラムの制約を変更できないため、この方式にする。
- `''` は文字列比較で常に最小になるので、リフレッシュ対象を絞るクエリでは明示的に除外する。

## 変更内容（ファイル別）

### 1. DB（`packages/db`）

- `sql/schema.sql`: `instagram_connections` に `provider TEXT NOT NULL DEFAULT 'instagram_login'` を追加し、コメントを更新する。
- `src/setup.ts`: 既存 DB 用に `INSTAGRAM_CONNECTION_COLUMN_MIGRATIONS = ["provider TEXT NOT NULL DEFAULT 'instagram_login'"]` を追加する。既存の `ALTER TABLE ... ADD COLUMN` のループと同じ方式で、重複カラムのエラーは無視する。
- `src/index.ts`
  - `InstagramConnection` に `provider: InstagramProvider` を追加し、`expiresAt` を `string | null` にする。
  - `saveInstagramConnection`: `provider` を保存する。`expiresAt ?? ''` で保存する。
  - `mapInstagramConnectionRow`: `provider` を読み込む（未設定なら `instagram_login`）。`expires_at` が `''` なら `null` にする。
  - `listInstagramConnectionsExpiringBefore`: 条件を `provider = 'instagram_login' AND expires_at <> '' AND expires_at < ?` にする。mock 実装も同じ条件にする。

### 2. 連携（`packages/integrations/src/instagram-graph.ts`）

- `GRAPH_URL` / `GRAPH_VERSION` の定数をやめて、`graphBase(provider)` でホストを決める。
- `detectProvider(token)` を追加してエクスポートする。
- `connectInstagramToken(accessToken, options?: { igUserId?: string })`
  - `instagram_login` の場合: 今と同じ処理。
  - `facebook_login` の場合:
    1. `options.igUserId` があればそれを使う。なければ `GET /me/assigned_instagram_accounts?fields=id,username` を呼ぶ。0件ならエラーにする。複数件ある場合は、`igUserId` を指定するよう促すエラーにする。
    2. `GET /{igUserId}?fields=id,username` でアクセスできるか確認し、ユーザー名を取る。
    3. `expiresAt: null` を返す。
  - 戻り値の `InstagramTokenGrant` に `provider` を追加し、`expiresAt` を `string | null` にする。
- `graphGet` / `graphPost` / `waitForContainer` / `publishInstagramCarousel` に `provider` を渡すようにする（`PublishCarouselInput.provider`、省略時は `instagram_login`）。
- `refreshInstagramToken` は今のまま（instagram_login 専用であることをコメントに書く）。
- エラー処理（`readJson`）: Graph のエラーコードを `InstagramApiError.code` に持たせる。
  - `190`: 「トークンが無効か取り消されています。再接続してください」
  - `10` / `200`: 「権限が不足しています（必要な権限: instagram_basic, instagram_content_publish）」
- ファイル冒頭のコメントを、両方式に対応した内容に書き換える。

### 3. API（`apps/api`）

- `routes/instagram.ts`
  - `connectBodySchema` に `igUserId: z.string().trim().regex(/^\d+$/).optional()` を追加する。
  - `saveInstagramConnection` に `provider` を渡す。
  - レスポンスの `expiresAt` を `null` にできるようにする。
- `lib/instagram-publish.ts`
  - `publishPost`: `connection.expiresAt` が `null` でないときだけ期限チェックをする。`publishInstagramCarousel` に `provider` を渡す。
  - `refreshExpiringTokens`: 上の DB クエリで対象が絞られるので、処理の変更は不要。念のため `provider !== 'instagram_login'` の接続はスキップする処理も入れておく。

### 4. 共有型（`packages/shared/src/index.ts`）

- `instagramConnectionStatusSchema` の `expiresAt` を `nullable()` にする。必要なら `provider` も追加する。

### 5. Web（`apps/web`）

- `components/pages/agent-accounts-page.tsx`
  - `STEPS[0]` と説明の `<li>` を、両方式に対応した文言にする。例:「Meta アプリで発行したアクセストークン（Unified login のシステムユーザートークン、または Instagram ログインのトークン）」
  - 「詳細設定」として、IG ユーザー ID の入力欄を追加する（任意入力）。
  - 有効期限の表示: `expiresAt` が `null` なら「無期限（更新は不要です）」と表示する。
  - プレースホルダー: 「アクセストークン（EAA… / IGAA…）」
- `components/use-instagram-connection.ts` / `lib/api.ts`: `connect(accessToken, igUserId?)` にする。

### 6. ドキュメント

- `docs/phases.md` の「Instagram connect + scheduled publish」節: Unified login 方式を追加し、セットアップ手順を書き直す。
- `README.md`: 「Instagram publishing is not built yet」「mock client only」の古い記述を直す。
- `.env.example`: 使われていない `/api/instagram/callback` のコメントを削除する。

## テスト

`packages/integrations/src/__tests__/instagram-graph.test.ts` に以下を追加する。

- `detectProvider`: `EAA…` は `facebook_login`、`IGAA…` は `instagram_login` になること
- `connectInstagramToken`（facebook_login）
  - `assigned_instagram_accounts` が1件のとき、その ID とユーザー名で接続し、`expiresAt: null` になること
  - `igUserId` を指定したとき、`assigned_instagram_accounts` を呼ばずに `/{id}` で確認すること
  - 0件のとき、および複数件で `igUserId` が無いときにエラーになること
  - すべてのリクエストが `graph.facebook.com/v26.0` に向いていること
- `publishInstagramCarousel`（facebook_login）: ホストが graph.facebook.com であること。それ以外の流れは既存テストと同じ
- `readJson`: エラーコード 190 / 10 のときのメッセージ

DB（mock repository）について:

- `expiresAt: null` を保存して読み込むと `null` が返ること
- `listInstagramConnectionsExpiringBefore` に facebook_login の接続が含まれないこと

既存の instagram_login のテストがすべて通ることも確認する（後方互換）。

## 進め方と動作確認

1. ブランチを切る（`feat/instagram-unified-login`）
2. DB → integrations → API → shared → web の順に実装し、`pnpm test` と `pnpm typecheck` を通す
3. `pnpm --filter @ama/db setup:turso` で、本番とステージングの DB に `provider` カラムを追加する
4. ステージングで先方のトークンを貼り付けて接続する。`ac_test_1023` と表示され、有効期限が「無期限」になることを確認する
5. 先方の許可を得てから、`ac_test_1023` にテストのカルーセルを1件投稿し、permalink を確認する（確認後に削除）
6. cron のログに、リフレッシュ失敗のエラーが出ていないことを確認する

## 先方への依頼事項（実装と並行して確認）

- [ ] トークンを安全な方法で受け取る（または先方に管理画面へ直接入力してもらう）
- [ ] Meta アプリの「設定 → 詳細設定 → アプリシークレットを必須にする」が OFF であること。ON の場合は `appsecret_proof` 対応が追加で必要になる
- [ ] `ac_test_1023` へのテスト投稿の許可
- [ ] 本番アカウントへの切り替え手順（システムユーザーへのアセット割り当てと、新しい IG ID の連絡）
- [ ] トークンの再発行、アプリシークレットのリセット、アセット割り当ての変更をする場合の事前連絡

## リスクと未確定事項

- **`EAA…` は普通の Facebook ユーザートークンでもある**: 期限ありのユーザートークンが貼られても、期限なしとして扱ってしまう。期限切れになると投稿時に 190 エラーとして表面化するので、今回はそれで許容する。正確に判定するには `debug_token`（アプリトークンが必要）を使う必要があるため、今後の課題にする。
- **`me/assigned_instagram_accounts` の返り値**: 返ってくるフィールド（`username` が含まれるかなど）は、実際のトークンで確認する。含まれない場合は `/{id}?fields=username` で補う。
- **権限不足の可能性**: 投稿で `(#10)` / `(#200)` が出た場合は、先方に `pages_show_list` や `business_management` などの追加を相談する。
- **アプリシークレット必須の設定**: ON だった場合は、App Secret を預かって `appsecret_proof` を付ける対応が別途必要になる。
- **トークンの平文保存**: 現状どおり Turso に平文で保存される。期限なしのトークンなので漏洩した場合の影響が大きい。暗号化保存は別タスクで検討する。
