---
title: 退訂與寄送資格
parent: 管理員
nav_order: 20
---

# 退訂與寄送資格

路徑：`/admin/suppressions`（僅 `super_admin`）

---

## 這頁在做什麼

查詢任一 email「**能不能寄、為什麼**」，並綜覽全系統的抑制（壓制）名單狀態。判定採**嚴格聯集**：只要任一來源抑制，即判為不可寄送。

本頁有兩種檢視：

- **查詢單一 email**：輸入地址 → 顯示可否寄送的判定卡片，以及五個來源逐項的狀態表。
- **不輸入（預設）**：顯示各來源的**統計數**與**最近 50 筆**抑制紀錄（跨來源合併，依時間新到舊）。

> 這頁是唯讀檢視——它反映抑制狀態，但不在此新增或解除抑制。

---

## 五個抑制來源

「能不能寄」由以下五個分散在系統各處的來源共同決定（以原始碼為準；判定語意對齊電子報寄送 worker `src/lib/newsletter-send-worker.ts` 與 CRM 直寄路徑 `/api/email/send`）：

| 來源 | 判定條件 | 說明 |
|------|----------|------|
| 聯絡人退訂 (opt-out) | `contacts.email_opt_out = true` | CRM 直寄路徑會尊重此旗標 |
| 聯絡人 Email 狀態 | `contacts.email_status` **非空** | 寄送 worker 對**任何**非空狀態都抑制；值如 `bounced`／`invalid`／`unsubscribed`／`recipient_blocked`／`spam_report` |
| 黑名單 | 存在於 `newsletter_blacklist` | 通常來自 SendGrid 硬退信／無效信箱／被擋下 |
| 全域退訂 | 存在於 `newsletter_unsubscribes` | 全域封鎖；含 SendGrid 退訂與垃圾信檢舉 |
| 訂閱者退訂 | `newsletter_subscribers.unsubscribed_at` **非空** | 電子報訂閱者自行退訂 |

比對規則：

- 「聯絡人退訂」「聯絡人 Email 狀態」比對聯絡人的 `email` 或 `第二 email`，且**僅計未刪除**（`deleted_at IS NULL`）的聯絡人。
- 黑名單／全域退訂／訂閱者退訂以 email 欄位精確比對（不分大小寫）。

---

## 與每日 SendGrid 抑制匯入（cron）的關係

本頁讀取的多個來源，是由排程 `POST/GET /api/sendgrid/import-suppressions` 每日**回填**的：

- 排程時間：`vercel.json` 的 cron `0 19 * * *`（UTC 19:00，約台北隔日凌晨 03:00）。
- 內容：分頁抓取 SendGrid 近 90 天的五種抑制清單，並寫回本系統：

| SendGrid 清單 | 寫入 `contacts.email_status` | 另寫入 | 互動紀錄 |
|---------------|------------------------------|--------|----------|
| 硬退信 bounces | `bounced` | 非 CRM 地址 → 黑名單 | 「SendGrid 硬退信」 |
| 無效信箱 invalid_emails | `invalid` | 非 CRM 地址 → 黑名單 | 「SendGrid 無效信箱」 |
| 退訂 unsubscribes | `unsubscribed` | 全域退訂（來源 `sendgrid_import`） | 「SendGrid 已退訂」 |
| 被擋下 blocks | `recipient_blocked` | 非 CRM 地址 → 黑名單 | 「SendGrid 被擋下」 |
| 垃圾信檢舉 spam_reports | `spam_report` | 全域退訂（來源 `sendgrid_spam_report`） | 「SendGrid 垃圾信檢舉」 |

- 已存在於 CRM 的聯絡人只更新 `email_status`（不重複進黑名單）；非 CRM 地址才進黑名單。
- 匹配到的 CRM 聯絡人會補一筆 system 互動紀錄（同類型不重複建立）。
- 也可由 super_admin 手動觸發（電子報名單頁的匯入按鈕）。cron 執行會記錄心跳，於[系統健康](health.md)頁可見。

> 一句話：**這頁只是檢視器**，真正把 SendGrid 的退信／退訂／檢舉灌進「聯絡人 Email 狀態／黑名單／全域退訂」的，是這支每日 cron。

---

## 誰能用

- 僅 `super_admin` 可開啟本頁。
- 後端 API `/api/admin/suppressions` 會再次驗證權限：未登入回 401、非 super_admin 回 403。

---

## 怎麼用

1. **查單一地址**：輸入完整 email（格式錯誤會提示）→ 按「查詢」→ 看判定卡片與各來源狀態表。
2. **看整體狀態**：不輸入即為預設檢視 → 各來源統計 + 最近 50 筆抑制紀錄。

---

## 欄位說明

### 各來源狀態表（查詢單一地址時）

| 欄位 | 說明 |
|------|------|
| 來源 | 上述五個來源之一 |
| 狀態 | 「已抑制」（紅）或「正常」（綠） |
| 詳情 | 該來源的補充資訊（如狀態值、退訂原因、退訂時間） |

### 最近的抑制紀錄（預設檢視）

| 欄位 | 說明 |
|------|------|
| Email | 被抑制的地址 |
| 來源 | 抑制來源 |
| 詳情 | 補充資訊 |
| 時間 | 該筆抑制的時間（新到舊） |

---

## 注意事項

- 本頁僅 super_admin 可用，後端 API 也會再次驗證權限。
- 唯讀檢視——解除抑制請於對應來源處理（例如聯絡人頁的 Email 狀態、[Email 復活](email-recovery.md)、退訂名單維護）。
- 同一套判定也用於電子報／群發寄送流程的收件人排除。
