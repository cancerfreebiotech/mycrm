---
title: Telegram Bot 設定
parent: Bot 使用說明
nav_order: 3
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

將 Token 填入 Vercel 環境變數：

```
TELEGRAM_BOT_TOKEN=<你的 token>
```

---

## 步驟 3：設定 Webhook

部署完成後，執行以下指令設定 Webhook（一次性）：

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://mycrm.vercel.app/api/bot"
```

成功回應：
```json
{"ok":true,"result":true,"description":"Webhook was set"}
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
