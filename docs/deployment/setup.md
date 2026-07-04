---
title: 環境設定與部署
parent: 系統部署（IT）
nav_order: 1
---

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
| `TELEGRAM_WEBHOOK_SECRET` | Telegram Webhook 驗證密鑰；Bot 只接受帶此密鑰的更新 |
| `ADMIN_SECRET` | 保護管理用 API（如註冊 Webhook）的密鑰 |
| `PORTKEY_API_KEY` | Portkey AI Gateway API Key；所有 AI 呼叫的主要路徑 |
| `PORTKEY_CONFIG_ID` | Portkey Config ID，定義路由與重試策略 |
| `GEMINI_API_KEY` | Google Gemini API Key；Portkey 不可用時的備援，並供 AI 對話/情報功能使用 |
| `SENDGRID_API_KEY` | SendGrid API Key；所有郵件寄送 |
| `SENDGRID_FROM_EMAIL` | 寄件人 email（須通過 SendGrid 驗證） |
| `SENDGRID_WEBHOOK_SECRET` | 驗證 SendGrid 事件 Webhook 簽章的密鑰（開信／點擊／退信／退訂等事件回報） |
| `NEXTAUTH_SECRET` | 郵件連結 token 與 HMAC 簽章密鑰 |
| `CRON_SECRET` | 保護所有 Vercel Cron 任務的密鑰 |
| `NEXT_PUBLIC_APP_URL` | 完整網址，例如 `https://mycrm.vercel.app` |
| `NEXTAUTH_URL` | 產生郵件連結、Bot 回覆等絕對網址的基底；優先於 `NEXT_PUBLIC_APP_URL` |

### Gmail 報表寄送（選用）

| 變數名稱 | 說明 |
|----------|------|
| `GOOGLE_CLIENT_ID` | Google OAuth 2.0 Client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth 2.0 Client Secret |

### Teams Bot / Microsoft OAuth（選用）

| 變數名稱 | 說明 |
|----------|------|
| `TEAMS_BOT_APP_ID` | Azure AD Bot 的 App ID |
| `TEAMS_BOT_APP_SECRET` | Azure AD Bot 的 App Secret |
| `TEAMS_TENANT_ID` | Azure AD 租用戶 ID |
| `AZURE_OAUTH_CLIENT_ID` | Azure AD OAuth Client ID；未設定則沿用 `TEAMS_BOT_APP_ID` |
| `AZURE_OAUTH_CLIENT_SECRET` | Azure AD OAuth Client Secret；未設定則沿用 `TEAMS_BOT_APP_SECRET` |

### MCP 端點與登入網域（選用）

| 變數名稱 | 說明 |
|----------|------|
| `MCP_AGENT_TOKEN` | 保護 MCP 端點（`/api/mcp`）的存取權杖，供外部 AI agent 呼叫；未設定則該端點拒絕存取 |
| `ALLOWED_EMAIL_DOMAIN` | 允許登入的公司信箱網域白名單（預設 `cancerfree.io`）。此為 Next.js 應用端設定，對應下方 Supabase Edge Functions 的 `ORG_EMAIL_DOMAIN` secret（inbound-parse 判斷組織自有網域）；兩者屬不同執行環境，通常設為相同值 |

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

## Supabase Edge Functions 設定

### 函數清單

| 函數名稱 | 用途 |
|----------|------|
| `send-reminder` | 掃描到期任務，發 Telegram 提醒 |
| `send-report` | 產生 Excel 報表，透過 Gmail 寄出 |
| `inbound-parse` | 接收 BCC 郵件並寫入互動紀錄；跑在 Supabase Edge，Pro 方案容許 25 MB 內文（Vercel 上限僅 4.5 MB） |
| `send-newsletter` | 透過 SendGrid 寄送電子報 |

### 設定環境變數（Supabase Dashboard → Edge Functions → Secrets）

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

各函數額外需要的 Secrets（`SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`、`NEXT_PUBLIC_APP_URL` 為共用）：

| 函數 | 額外 Secrets |
|------|-------------|
| `send-reminder` | `TELEGRAM_BOT_TOKEN`、`CRON_SECRET` |
| `send-report` | `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET` |
| `inbound-parse` | `INBOUND_PARSE_SECRET`、`ORG_EMAIL_DOMAIN`、`BCC_INBOX_DOMAIN` |
| `send-newsletter` | `SENDGRID_API_KEY`、`SENDGRID_FROM_EMAIL`、`SENDGRID_FROM_NAME`、`NEXTAUTH_SECRET` |

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

## Vercel Cron Jobs

`vercel.json` 已定義以下排程任務，部署到 Vercel 後自動生效。所有 Cron 均由 `CRON_SECRET` 保護——Vercel 會自動帶上 `Authorization: Bearer <CRON_SECRET>`，未設定或不符者拒絕執行。

| 路徑 | 排程 (UTC) | 用途 |
|------|-----------|------|
| `/api/hunter/cron` | `0 18 * * *` | 每日以 Hunter.io 補全待處理聯絡人的 email |
| `/api/sendgrid/import-suppressions` | `0 19 * * *` | 同步 SendGrid 退信/無效/退訂/封鎖名單 |
| `/api/cron/process-pending-ocr` | `*/2 * * * *` | 每 2 分鐘補跑 Webhook 未完成的名片 OCR |
| `/api/cron/process-pending-briefings` | `*/2 * * * *` | 每 2 分鐘處理聯絡人情報產生佇列 |
| `/api/cron/check-feedback` | `0 18 * * *` | 每日檢查系統回報並寄出摘要 |
| `/api/cron/run-report-schedules` | `0 * * * *` | 每小時執行到期的報表排程 |
| `/api/cron/purge-retention` | `30 19 * * *` | 每日清理逾保留期的軟刪除／過期資料（垃圾桶聯絡人、bot 對話、去重紀錄等） |
| `/api/cron/health-watchdog` | `*/10 * * * *` | 每 10 分鐘執行服務健康檢查並巡查 cron 心跳，逾時／失敗時以 Telegram 通知 super admin |
| `/api/cron/process-scheduled-campaigns` | `*/10 * * * *` | 每 10 分鐘寄出到期的排程電子報 |
| `/api/cron/task-reminders` | `0 1 * * *` | 每日 09:00（Asia/Taipei）以 Telegram 發送個人任務摘要（逾期＋今日到期） |
| `/api/cron/pre-meeting-briefings` | `0 */6 * * *` | 每 6 小時掃描 Outlook 行事曆未來 24 小時的會議，為外部與會者自動排入會前 briefing |

---

## Google OAuth 設定（Gmail 報表）

1. 前往 [Google Cloud Console](https://console.cloud.google.com/) → **API 和服務** → **憑證**
2. 建立 **OAuth 2.0 用戶端 ID**（類型：網頁應用程式）
3. 授權重新導向 URI 填入：`https://<DOMAIN>/api/auth/gmail/callback`
4. 將 Client ID 和 Secret 填入 Vercel 環境變數
