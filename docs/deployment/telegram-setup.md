---
title: Telegram Bot 設定
parent: 系統部署（IT）
nav_order: 2
---

# Telegram Bot 設定教學

## 步驟 1：建立 Bot

1. 在 Telegram 搜尋 `@BotFather`
2. 發送 `/newbot`
3. 輸入 Bot 顯示名稱（例如 `myCRM Bot`）
4. 輸入 Bot 帳號名稱（必須以 `bot` 結尾，例如 `mycrm_notify_bot`）
5. 取得 **Bot Token**（格式：`123456:ABC-DEF...`）

---

## 步驟 2：設定環境變數

將 Token 與兩個密鑰填入 Vercel 環境變數：

```
TELEGRAM_BOT_TOKEN=<你的 token>
TELEGRAM_WEBHOOK_SECRET=<自訂的隨機字串>
ADMIN_SECRET=<自訂的隨機字串>
```

- `TELEGRAM_WEBHOOK_SECRET`：Bot 用來驗證每筆更新的密鑰。
- `ADMIN_SECRET`：保護註冊 Webhook 管理端點的密鑰。

兩者請各自使用夠長的隨機字串。

---

## 步驟 3：設定 Webhook

部署完成後，於瀏覽器開啟以下網址註冊 Webhook（一次性）：

```
https://<APP_URL>/api/admin/set-webhook?secret=<ADMIN_SECRET>
```

此端點會以 `TELEGRAM_WEBHOOK_SECRET` 作為 Webhook 的 secret token 註冊，讓 Bot 只接受帶有正確密鑰的更新。

> ⚠️ 請勿改用 `curl .../setWebhook?url=...` 手動註冊：這樣註冊的 Webhook 缺少 secret token，Bot 會因為找不到 `x-telegram-bot-api-secret-token` 標頭而回傳 403，導致所有訊息被拒絕。

成功回應（節錄）：
```json
{"setWebhook":{"ok":true,"result":true,"description":"Webhook was set"},"webhookUrl":"https://mycrm.vercel.app/api/bot"}
```

---

## 步驟 4：使用者綁定 Telegram ID

每位使用者需要自行綁定 Telegram ID：

1. 登入 Web Dashboard → **個人設定**
2. 對 Bot 發送任意訊息（如 `/start`），Bot 會回覆你的 Telegram ID
3. 將 ID 填入個人設定中的「Telegram ID」欄位並儲存

---

## 確認正常運作

綁定完成後，發送 `/help` 給 Bot，應收到指令列表回覆。
