---
title: Telegram Bot 設定
parent: システムデプロイ（IT）
nav_order: 2
---

# Telegram Bot 設定ガイド

## ステップ 1：Bot の作成

1. Telegram で `@BotFather` を検索します
2. `/newbot` を送信します
3. Bot の表示名を入力します（例：`myCRM Bot`）
4. Bot のユーザー名を入力します（`bot` で終わる必要があります。例：`mycrm_notify_bot`）
5. **Bot Token** を取得します（形式：`123456:ABC-DEF...`）

---

## ステップ 2：環境変数の設定

トークンと 2 つのシークレットを Vercel の環境変数に入力します：

```
TELEGRAM_BOT_TOKEN=<あなたのトークン>
TELEGRAM_WEBHOOK_SECRET=<任意のランダムな文字列>
ADMIN_SECRET=<任意のランダムな文字列>
```

- `TELEGRAM_WEBHOOK_SECRET`：Bot が各更新を検証するために使用するシークレット。
- `ADMIN_SECRET`：Webhook を登録する管理用エンドポイントを保護するシークレット。

それぞれ十分に長いランダムな文字列を使用してください。

---

## ステップ 3：Webhook の設定

デプロイが完了したら、ブラウザで以下の URL を開いて Webhook を登録します（一度だけ）：

```
https://<APP_URL>/api/admin/set-webhook?secret=<ADMIN_SECRET>
```

このエンドポイントは `TELEGRAM_WEBHOOK_SECRET` を Webhook の secret token として登録するため、Bot は正しいシークレット付きの更新のみを受け付けます。

> ⚠️ `curl .../setWebhook?url=...` で手動登録しないでください：その方法で登録した Webhook には secret token がなく、`x-telegram-bot-api-secret-token` ヘッダーが見つからないため Bot が 403 を返し、すべてのメッセージが拒否されます。

成功時のレスポンス（抜粋）：
```json
{"setWebhook":{"ok":true,"result":true,"description":"Webhook was set"},"webhookUrl":"https://mycrm.vercel.app/api/bot"}
```

---

## ステップ 4：ユーザーの Telegram ID 連携

各ユーザーが自分の Telegram ID を連携する必要があります：

1. Web ダッシュボードにログイン → **個人設定**
2. Bot に任意のメッセージを送信します（例：`/start`）。Bot があなたの Telegram ID を返信します
3. 個人設定の「Telegram ID」フィールドに ID を入力して保存します

---

## 正常動作の確認

連携後、Bot に `/help` を送信すると、コマンド一覧が返信されるはずです。
