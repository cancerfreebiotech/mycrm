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

トークンを Vercel の環境変数に入力します：

```
TELEGRAM_BOT_TOKEN=<あなたのトークン>
```

---

## ステップ 3：Webhook の設定

デプロイが完了したら、以下のコマンドを実行して Webhook を設定します（一度だけ）：

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://mycrm.vercel.app/api/bot"
```

成功時のレスポンス：
```json
{"ok":true,"result":true,"description":"Webhook was set"}
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
