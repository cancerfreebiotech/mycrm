---
title: 環境設定とデプロイ
parent: システムデプロイ（IT）
nav_order: 1
---

# 環境設定とデプロイ

## 前提条件

| ツール | バージョン |
|--------|----------|
| Node.js | 20+ |
| Supabase アカウント | — |
| Vercel アカウント | — |
| Telegram Bot Token | — |
| Google Cloud プロジェクト（Gemini API + Gmail OAuth）| — |
| Microsoft Azure AD（Teams Bot、任意）| — |

---

## 環境変数

Vercel プロジェクト設定（またはローカルの `.env.local`）に以下の変数を入力します：

### 必須

| 変数名 | 説明 |
|--------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase プロジェクト URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key（バックエンド用） |
| `TELEGRAM_BOT_TOKEN` | Telegram BotFather が生成したトークン |
| `TELEGRAM_WEBHOOK_SECRET` | Telegram Webhook 検証用シークレット。Bot はこのシークレット付きの更新のみ受け付けます |
| `ADMIN_SECRET` | 管理用 API（Webhook 登録など）を保護するシークレット |
| `PORTKEY_API_KEY` | Portkey AI Gateway API Key。すべての AI 呼び出しの主経路 |
| `PORTKEY_CONFIG_ID` | ルーティングとリトライ戦略を定義する Portkey Config ID |
| `GEMINI_API_KEY` | Google Gemini API Key。Portkey が利用できない場合のフォールバック、および AI チャット/ブリーフィング機能で使用 |
| `SENDGRID_API_KEY` | SendGrid API Key。すべてのメール送信 |
| `SENDGRID_FROM_EMAIL` | 送信元メール（SendGrid で検証済みであること） |
| `SENDGRID_WEBHOOK_SECRET` | SendGrid イベント Webhook の署名を検証するシークレット（開封／クリック／バウンス／配信停止などのイベント通知） |
| `NEXTAUTH_SECRET` | メールリンクのトークンと HMAC 署名用シークレット |
| `CRON_SECRET` | すべての Vercel Cron を保護するシークレット |
| `NEXT_PUBLIC_APP_URL` | 完全な URL、例：`https://mycrm.vercel.app` |
| `NEXTAUTH_URL` | メールリンクや Bot 返信などの絶対 URL を生成する際のベース。`NEXT_PUBLIC_APP_URL` より優先 |

### Gmail レポート送信（任意）

| 変数名 | 説明 |
|--------|------|
| `GOOGLE_CLIENT_ID` | Google OAuth 2.0 Client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth 2.0 Client Secret |

### Teams Bot / Microsoft OAuth（任意）

| 変数名 | 説明 |
|--------|------|
| `TEAMS_BOT_APP_ID` | Azure AD Bot の App ID |
| `TEAMS_BOT_APP_SECRET` | Azure AD Bot の App Secret |
| `TEAMS_TENANT_ID` | Azure AD テナント ID |
| `AZURE_OAUTH_CLIENT_ID` | Azure AD OAuth Client ID。未設定の場合は `TEAMS_BOT_APP_ID` を使用 |
| `AZURE_OAUTH_CLIENT_SECRET` | Azure AD OAuth Client Secret。未設定の場合は `TEAMS_BOT_APP_SECRET` を使用 |

### MCP エンドポイントとログインドメイン（任意）

| 変数名 | 説明 |
|--------|------|
| `MCP_AGENT_TOKEN` | 外部 AI エージェント向けの MCP エンドポイント（`/api/mcp`）を保護するアクセストークン。未設定の場合は当該エンドポイントへのアクセスを拒否 |
| `ALLOWED_EMAIL_DOMAIN` | ログインを許可する会社メールドメインの許可リスト（デフォルトは `cancerfree.io`）。これは Next.js アプリ側の設定で、下記 Supabase Edge Functions の `ORG_EMAIL_DOMAIN` secret（inbound-parse が組織自身のドメインを判定）に対応します。両者は異なる実行環境ですが、通常は同じ値に設定します |

---

## データベースのセットアップ

データベースのマイグレーションは Supabase ダッシュボードに記録されています。初回セットアップではバージョン順にマイグレーションを適用するか、Supabase MCP ツールを使って実行してください。

主要なテーブル：

| テーブル | 説明 |
|---------|------|
| `users` | 組織メンバー。Microsoft AAD メールが主キー |
| `contacts` | 連絡先メインテーブル |
| `contact_cards` | 名刺添付ファイル（1 連絡先に複数対応） |
| `contact_tags` | 連絡先とタグの関連付け |
| `tags` | タグ定義 |
| `interaction_logs` | インタラクション記録（メモ/会議/メール） |
| `tasks` | タスクメインテーブル |
| `task_assignees` | タスク割り当ての関連付け |
| `user_assistants` | マネージャーとアシスタントのマッピング |
| `bot_sessions` | Telegram Bot マルチステップ会話の状態 |
| `pending_contacts` | 名刺確認待ちの一時バッファ |
| `ai_endpoints` | AI プロバイダー管理 |
| `ai_models` | AI モデル管理 |
| `report_schedules` | レポートスケジュール |
| `gmail_oauth` | Gmail OAuth トークンの保存 |
| `email_templates` | メールテンプレート |

---

## Supabase Edge Functions の設定

### 関数一覧

| 関数名 | 用途 |
|--------|------|
| `send-reminder` | 期限切れタスクをスキャンして Telegram リマインダーを送信 |
| `send-report` | Excel レポートを生成して Gmail 経由で送信 |
| `inbound-parse` | BCC メールを受信してインタラクション記録に書き込む。Supabase Edge 上で動作し、Pro プランでは 25 MB の本文が許容される（Vercel の上限は 4.5 MB） |
| `send-newsletter` | SendGrid 経由でニュースレターを送信 |

### 環境変数の設定（Supabase Dashboard → Edge Functions → Secrets）

```
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>
NEXT_PUBLIC_APP_URL=https://mycrm.vercel.app
TELEGRAM_BOT_TOKEN=<telegram_token>
CRON_SECRET=<cron_secret>
GOOGLE_CLIENT_ID=<google_client_id>
GOOGLE_CLIENT_SECRET=<google_client_secret>
SENDGRID_API_KEY=<sendgrid_api_key>
SENDGRID_FROM_EMAIL=<sender_email>
SENDGRID_FROM_NAME=<sender_name>
NEXTAUTH_SECRET=<nextauth_secret>
INBOUND_PARSE_SECRET=<inbound_parse_secret>
ORG_EMAIL_DOMAIN=cancerfree.io
BCC_INBOX_DOMAIN=bcc.cancerfree.io
```

各関数が追加で必要とする Secrets（`SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`、`NEXT_PUBLIC_APP_URL` は共通）：

| 関数 | 追加 Secrets |
|------|-------------|
| `send-reminder` | `TELEGRAM_BOT_TOKEN`、`CRON_SECRET` |
| `send-report` | `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET` |
| `inbound-parse` | `INBOUND_PARSE_SECRET`、`ORG_EMAIL_DOMAIN`、`BCC_INBOX_DOMAIN` |
| `send-newsletter` | `SENDGRID_API_KEY`、`SENDGRID_FROM_EMAIL`、`SENDGRID_FROM_NAME`、`NEXTAUTH_SECRET` |

> Secrets はプロジェクト全体で共有されます。一度設定すれば十分です。

### pg_cron タスクリマインダー

Supabase SQL Editor で一度実行します（`<project>` と `<anon_key>` を置き換えてください）：

```sql
SELECT cron.schedule('send-reminder', '* * * * *',
  $$SELECT net.http_post(
    url := 'https://<project>.supabase.co/functions/v1/send-reminder',
    headers := '{"Authorization": "Bearer <anon_key>", "Content-Type": "application/json"}',
    body := '{}'
  )$$
);
```

---

## Vercel Cron Jobs

`vercel.json` に以下のスケジュールジョブが定義されており、Vercel へのデプロイ後に自動的に有効になります。すべての Cron は `CRON_SECRET` で保護されます——Vercel は自動的に `Authorization: Bearer <CRON_SECRET>` を送信し、未設定または不一致のリクエストは拒否されます。

| パス | スケジュール (UTC) | 用途 |
|------|-------------------|------|
| `/api/hunter/cron` | `0 18 * * *` | 未処理連絡先のメールを Hunter.io で毎日補完 |
| `/api/sendgrid/import-suppressions` | `0 19 * * *` | SendGrid のバウンス/無効/配信停止/ブロックリストを同期 |
| `/api/cron/process-pending-ocr` | `*/2 * * * *` | 2 分ごとに、Webhook が完了しなかった名刺 OCR を再実行 |
| `/api/cron/process-pending-briefings` | `*/2 * * * *` | 2 分ごとに連絡先ブリーフィング生成キューを処理 |
| `/api/cron/check-feedback` | `0 18 * * *` | システムフィードバックを毎日チェックし要約メールを送信 |
| `/api/cron/run-report-schedules` | `0 * * * *` | 期限が来たレポートスケジュールを毎時実行 |
| `/api/cron/purge-retention` | `30 19 * * *` | 保持期間を過ぎたソフト削除／期限切れ行（ゴミ箱の連絡先、bot セッション、重複排除記録など）を毎日削除 |
| `/api/cron/health-watchdog` | `*/10 * * * *` | 10 分ごとにサービスヘルスチェックを実行し cron ハートビートを点検。遅延／失敗ジョブを Telegram で super admin に通知 |
| `/api/cron/process-scheduled-campaigns` | `*/10 * * * *` | 10 分ごとに、期限が来た予約済みニュースレターを送信 |
| `/api/cron/task-reminders` | `0 1 * * *` | 毎日 09:00（Asia/Taipei）に Telegram で個人タスクダイジェストを送信（期限切れ＋本日期限） |
| `/api/cron/pre-meeting-briefings` | `0 */6 * * *` | 6 時間ごとに Outlook カレンダーの今後 24 時間の会議をスキャンし、外部参加者の会議前ブリーフィングを自動キュー投入 |

---

## Google OAuth 設定（Gmail レポート）

1. [Google Cloud Console](https://console.cloud.google.com/) → **API とサービス** → **認証情報** に移動します
2. **OAuth 2.0 クライアント ID** を作成します（種類：ウェブ アプリケーション）
3. 承認済みのリダイレクト URI に次を設定します：`https://<DOMAIN>/api/auth/gmail/callback`
4. Client ID と Secret を Vercel 環境変数に入力します
