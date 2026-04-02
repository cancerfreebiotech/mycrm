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
| `GEMINI_API_KEY` | Google Gemini API Key |
| `NEXT_PUBLIC_APP_URL` | 完全な URL、例：`https://mycrm.vercel.app` |

### Gmail レポート送信（任意）

| 変数名 | 説明 |
|--------|------|
| `GOOGLE_CLIENT_ID` | Google OAuth 2.0 Client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth 2.0 Client Secret |

### Teams Bot（任意）

| 変数名 | 説明 |
|--------|------|
| `TEAMS_BOT_APP_ID` | Azure AD Bot の App ID |
| `TEAMS_BOT_APP_SECRET` | Azure AD Bot の App Secret |
| `TEAMS_TENANT_ID` | Azure AD テナント ID |

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

### 環境変数の設定（Supabase Dashboard → Edge Functions → Secrets）

```
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>
TELEGRAM_BOT_TOKEN=<telegram_token>
NEXT_PUBLIC_APP_URL=https://mycrm.vercel.app
GOOGLE_CLIENT_ID=<google_client_id>
GOOGLE_CLIENT_SECRET=<google_client_secret>
```

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

## Google OAuth 設定（Gmail レポート）

1. [Google Cloud Console](https://console.cloud.google.com/) → **API とサービス** → **認証情報** に移動します
2. **OAuth 2.0 クライアント ID** を作成します（種類：ウェブ アプリケーション）
3. 承認済みのリダイレクト URI に次を設定します：`https://<DOMAIN>/api/auth/gmail/callback`
4. Client ID と Secret を Vercel 環境変数に入力します
