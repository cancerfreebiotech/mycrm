# 環境設定與部署

## 必要條件

| 工具 | 版本 |
|------|------|
| Node.js | 20+ |
| Supabase 帳號 | — |
| Vercel 帳號 | — |
| Telegram Bot Token | — |
| Google Cloud 專案（Gemini API + Gmail OAuth）| — |
| Microsoft Azure AD（Teams Bot，選用）| — |

---

## 環境變數

在 Vercel 專案設定（或本地 `.env.local`）填入以下變數：

### 必填

| 變數名稱 | 說明 |
|----------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 專案 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key（後端用） |
| `TELEGRAM_BOT_TOKEN` | Telegram BotFather 產生的 token |
| `GEMINI_API_KEY` | Google Gemini API Key |
| `NEXT_PUBLIC_APP_URL` | 完整網址，例如 `https://mycrm.vercel.app` |

### Gmail 報表寄送（選用）

| 變數名稱 | 說明 |
|----------|------|
| `GOOGLE_CLIENT_ID` | Google OAuth 2.0 Client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth 2.0 Client Secret |

### Teams Bot（選用）

| 變數名稱 | 說明 |
|----------|------|
| `TEAMS_BOT_APP_ID` | Azure AD Bot 的 App ID |
| `TEAMS_BOT_APP_SECRET` | Azure AD Bot 的 App Secret |
| `TEAMS_TENANT_ID` | Azure AD 租用戶 ID |

---

## 資料庫建置

資料庫 Migration 已記錄於 Supabase 後台。首次建置請按版本順序套用 Migration，或直接使用 Supabase MCP 工具執行。

主要資料表：

| 資料表 | 說明 |
|--------|------|
| `users` | 組織成員，Microsoft AAD email 為主鍵 |
| `contacts` | 聯絡人主表 |
| `contact_cards` | 名片附件（支援一人多張） |
| `contact_tags` | 聯絡人標籤關聯 |
| `tags` | 標籤定義 |
| `interaction_logs` | 互動紀錄（筆記/會議/Email） |
| `tasks` | 任務主表 |
| `task_assignees` | 任務指派關聯 |
| `user_assistants` | 主管與助理對應 |
| `bot_sessions` | Telegram Bot 多步驟對話狀態 |
| `pending_contacts` | 名片待確認暫存 |
| `ai_endpoints` | AI 服務商管理 |
| `ai_models` | AI 模型管理 |
| `report_schedules` | 報表排程 |
| `gmail_oauth` | Gmail OAuth Token 儲存 |
| `email_templates` | 郵件範本 |

---

## Telegram Webhook 設定

部署完成後，執行一次 webhook 設定（替換 `<TOKEN>` 和 `<DOMAIN>`）：

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<DOMAIN>/api/bot"
```

---

## Supabase Edge Functions 設定

### 函數清單

| 函數名稱 | 用途 |
|----------|------|
| `send-reminder` | 掃描到期任務，發 Telegram 提醒 |
| `send-report` | 產生 Excel 報表，透過 Gmail 寄出 |

### 設定環境變數（Supabase Dashboard → Edge Functions → Secrets）

```
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>
TELEGRAM_BOT_TOKEN=<telegram_token>
NEXT_PUBLIC_APP_URL=https://mycrm.vercel.app
GOOGLE_CLIENT_ID=<google_client_id>
GOOGLE_CLIENT_SECRET=<google_client_secret>
```

> Secrets 為整個專案共用，設定一次即可。

### pg_cron 任務提醒

在 Supabase SQL Editor 執行一次（替換 `<project>` 和 `<anon_key>`）：

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

## Google OAuth 設定（Gmail 報表）

1. 前往 [Google Cloud Console](https://console.cloud.google.com/) → **API 和服務** → **憑證**
2. 建立 **OAuth 2.0 用戶端 ID**（類型：網頁應用程式）
3. 授權重新導向 URI 填入：`https://<DOMAIN>/api/auth/gmail/callback`
4. 將 Client ID 和 Secret 填入 Vercel 環境變數
