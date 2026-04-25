---
title: 電子報
parent: 管理員
nav_order: 7
render_with_liquid: false
---

# 電子報（Newsletter）

路徑：`/admin/newsletter/campaigns`

完整流程：訂閱者管理 → 電子報編輯 → 測試寄送 → 正式寄送 → PDF 匯出 → 發布到 RSS 給 Substack 自動抓草稿。

---

## 訂閱者（newsletter_subscribers）

訂閱者是**獨立於 CRM 聯絡人**的實體。一個 email 只要被匯入成 subscriber 就可以收電子報，不需要也是 CRM 聯絡人。但：

- 匯入時會**自動連結**到同 email 的既有聯絡人（大小寫不敏感）
- 之後有新聯絡人建立或被更新同 email → forward trigger 也會連
- 一個 subscriber **可屬於多個 list**（例如 `zh-TW` + `zh-TW-marketing`）

### 名單（newsletter_lists）

以 `key` 識別的群組（例：`zh-TW`、`en`、`ja`、`zh-TW-marketing`、`2604-zh-unsent`）。寄送時選 list，會展開到所有成員 email。

### CSV 匯入

`scripts/import-newsletter-subscribers.mjs`（SendGrid 標準 CSV schema）：
```
EMAIL,FIRST_NAME,LAST_NAME,ADDRESS_LINE_1,...,CREATED_AT,UPDATED_AT,CONTACT_ID
```
- 指令：`node scripts/import-newsletter-subscribers.mjs --csv path/to/x.csv --list <list-key>`
- 冪等（同 email 不會重複，額外 list 成員會補上）
- 大批匯入建議分 chunk（script 預設 500，若出現 `fetch failed` 改成 50 或 100）

---

## 電子報清單頁

路徑：`/admin/newsletter/campaigns`

顯示所有 `newsletter_campaigns`，含狀態（draft / sent）、是否已發布到 RSS、建立時間。點進去開 **Quick-Send** 頁。

---

## Quick-Send 頁

路徑：`/admin/newsletter/quick-send/[id]`

左側：
- **主旨** / **預覽文字**：可編輯，按「儲存草稿」持久化
- **HTML 預覽**：iframe 即時顯示
- **匯出 PDF**：`window.print()` on preview iframe，可直接存成 PDF

右側：
- **收件名單**：多選 checkbox，顯示每份 list 的訂閱者人數
- **測試寄送**：填一個 email，SendGrid 只寄給它一個人（不動 sent_count/sent_at）
- **正式寄送**：有二次確認，寄送給所有勾選 list 的訂閱者
- **發布到 RSS**：把 `published_at` 設為現在，公開的 `/api/newsletter/feed.xml` 立刻包含這份

寄送透過 SendGrid Email API，一次 API call 送 1000 封（personalizations 陣列，每人各自 To: 欄位）。送出後：
- `newsletter_campaigns.status='sent'`, `sent_at`, `sent_count`, `total_recipients` 都會寫回
- 每個有綁定 `contact_id` 的 subscriber 會寫一筆 `interaction_logs`（type=`email`, `send_method='sendgrid'`, `campaign_id`）
- ⚠ SendGrid 寄送**不會**計入聯絡人的「最後活動時間」（見聯絡人文件的行為矩陣）

---

## 圖片資產

所有電子報圖片（logo、活動照片等）應放在 **Supabase Storage bucket `newsletter-assets`**，不要用外部 CDN（歷史上的 listmonk CDN 已淘汰）。

- Public bucket，URL 格式：`https://<project>.supabase.co/storage/v1/object/public/newsletter-assets/<period>/<filename>`
- 檔名禁用非 ASCII（Storage key 限制）；含中文時用 hash-based fallback（`asset-<8-char-sha256>.ext`）
- 一次性遷移 script：`scripts/migrate-newsletter-images.mjs`（讀 campaign HTML → 下載所有外部圖 → 上傳 Storage → 改寫 `<img src>`）

---

## RSS Feed (給 Substack)

公開端點：`/api/newsletter/feed.xml`（RSS 2.0）

- 只輸出 `published_at IS NOT NULL` 的 campaigns
- 最新 20 筆，`published_at DESC`
- 每個 item 包含：`title` / `link`（指到 `/newsletter/view/<slug>`）/ `guid` / `pubDate` / `description`（preview_text）/ `content:encoded`（完整 HTML in CDATA）

### Substack 設定
1. Substack → Settings → **Import from RSS**
2. URL：`https://crm.cancerfree.io/api/newsletter/feed.xml`
3. Substack 會定期 poll（通常幾小時），每次發現新 item → 自動建草稿
4. 你在 Substack 登入確認版面 → 按 publish

備註：Substack 沒有 Post-by-Email API（已確認），所以走 RSS route。

---

## AI 輔助撰寫（v4.0.0+）

路徑：`/admin/newsletter/ai-compose`（campaigns 頁右上角「🪄 AI 撰寫」按鈕）

### 工作流程
1. **輸入期別**：`YYYY-MM`（如 `2026-05`），預設下個月
2. **自動翻譯 toggle**：勾選會同時生成 zh-TW / en / ja 三份草稿；關掉只生成中文
3. **開場介紹（中文）**：textarea 寫本月重點，AI 會改寫成正式開場段落；可留空
4. **故事段落**：「新增段落」按鈕動態加卡片，每張卡輸入：
   - 標題（中文，必填）
   - 大綱 / 重點（中文 bullet 或完整句，必填）— AI 會擴展成 200-400 字段落
   - 圖片（可選）— 直接上傳，自動存到 `newsletter-assets/<period>/`
   - 相關連結（可選）— URL + 中文標籤，可多組
5. 按「**AI 生成電子報**」→ 等 30-60 秒 → 自動跳到 zh-TW 草稿的 quick-send 頁

### AI 如何生成內容
- 從 `newsletter_tone_samples` 載入目標語言最近 2 份電子報當 **few-shot tone reference**
- 用 Portkey + Gemini 2.5 Flash 依你的大綱 + 過往語氣產出段落 HTML
- 英日版會先翻譯標題，內文直接用該語言 tone 重寫（不是硬翻）
- 填入乾淨的 skeleton 模板（logo + header + intro + 編號故事 + 社群 icon + unsubscribe 底部）

### Skeleton 模板
存於 `email_templates` 表，三語各一份。用 placeholder `{{subject}}` / `{{period_label}}` / `{{intro_html}}` / `{{stories_html}}` / `{{{unsubscribe}}}`。每篇 ~2.5 KB 乾淨 HTML，不再是 listmonk 表格地獄。修改 skeleton 即可改全體格式。

### Tone 語料庫維護
`newsletter_tone_samples` 存過往電子報範本。新增/更新用 `scripts/import-newsletter-tone-samples.mjs`。每次發布一份 campaign 後若覺得品質好，可手動插入一筆當未來 AI 範本（或寫個 trigger 自動累積 — 目前沒做）。

---

## 每月例行流程（v4.0.0 建議）

1. **到 `/admin/newsletter/ai-compose`** 輸入本月內容（中文一次，自動翻譯三語）
2. 等 AI 生成 → 跳 quick-send 中文草稿
3. **調整主旨/預覽文字** 必要時修內文（split view 即時預覽）
4. 切到英日版 campaigns 檢查翻譯 / 補充
5. **測試寄送** 到自己 email 確認排版（SendGrid）
6. **發布到 RSS** → Substack 自動抓草稿 → 登 Substack 確認版面
7. **正式寄送** 給所有訂閱者
8. Substack 端按 publish

---

## Email 寄送狀態（email_status）— v4.3.x

`contacts.email_status` 共 7 種值（加 `null` 共 8 種）。任何非 null 都會被寄送流程**自動排除**，直到手動清除。

| 狀態 | 中文 | 永久性 | 觸發條件 |
|---|---|---|---|
| `null` | 訂閱中 | — | 預設，可寄送 |
| `bounced` | 硬退信 | 永久 | SMTP `5.1.1` / `5.5.0` / "user unknown" / "bounced address" |
| `invalid` | 無效信箱 | 永久 | "mx info missing" / 格式或 domain 錯誤 |
| `unsubscribed` | 已退訂 | 永久 | 收到 unsubscribe event 或 SendGrid Suppression API |
| `deferred` | 暫時無法寄送 | **可恢復** | i/o timeout / `5.0.0` / "service unavailable" / "no route to host" |
| `mailbox_full` | 信箱已滿 | **可恢復** | `5.2.1` / `5.2.2` / "over quota" / "out of storage" |
| `sender_blocked` | 寄件方問題 | **可恢復** | DKIM 失敗 / SpamTrap / `5.7.134` / SenderNotAuthenticated / Gmail 反垃圾 |
| `recipient_blocked` | 收件方擋信 | **可恢復** | Relay denied / Transport rules / hop count / `5.7.129` / `5.4.14` / 對方公司政策 |

### 三條同步路徑

| 路徑 | 觸發 | 內容 | 設定位置 |
|---|---|---|---|
| **Webhook（即時）** | SendGrid 推送 | 每個 event 即時分類 | SendGrid Dashboard → Mail Settings → Event Webhook |
| **每日 Cron** | 03:00 Asia/Taipei | 抓 SendGrid Suppressions API 過去 90 天 | `vercel.json` + `CRON_SECRET` env var |
| **手動同步** | 名單頁右上角「同步 SendGrid」按鈕 | 立即跑一次 import-suppressions | UI 操作 |

⚠ **Webhook 必須在 SendGrid Dashboard 勾選「Dropped」事件**，否則 pre-send drop 不會被即時記錄。

### Webhook 自動分類規則（`classifyByReason`）

每個 SendGrid `bounce` / `dropped` event 的 `reason` 會被檢查關鍵字，自動分到 7 種狀態：

- 含 "mailbox full" / "over quota" / `5.2.1` / `5.2.2` → **mailbox_full**
- 含 "DKIM" / "SpamTrap" / "SenderNotAuthenticated" / `5.7.134` / "unsolicited" → **sender_blocked**
- 含 "relay denied" / "transport rules" / "hop count" / "mail loop" / `5.7.129` / `5.4.14` / "access denied" → **recipient_blocked**
- 含 "i/o timeout" / "no route to host" / "service unavailable" / `5.0.0` → **deferred**
- 含 "mx info" / "unrecognized address" → **invalid**
- 含 `5.1.1` / `5.5.0` / "user unknown" / "bounced address" → **bounced**
- 含 "unsubscribe" → **unsubscribed**
- `spamreport` event → **sender_blocked**
- 不認識 → **bounced**（保守）

### 雙資料源（CRM 聯絡人 vs 外部訂閱者）

- **有對應 CRM 聯絡人** → 寫入 `contacts.email_status`（**canonical 來源**）
- **沒對應 CRM 聯絡人**（外部訂閱者）→ 寫入 `newsletter_blacklist.status`（v4.3.0+ 加的 column）

寄送 API（`/api/newsletter/campaigns/[id]/send`）過濾條件交叉檢查三張表：
1. `contacts.email_status IS NOT NULL`（任何狀態都排除）
2. `newsletter_blacklist`（任何 row 都排除）
3. `newsletter_unsubscribes`（任何 row 都排除）

### 名單詳情頁的 stats 卡

| 卡 | 統計範圍 |
|---|---|
| 總訂閱者 | 該 list 的所有 subscriber |
| 已連結聯絡人 | subscriber.contact_id IS NOT NULL |
| 可寄送 | email_status IS NULL（不在 blacklist/unsubscribes） |
| 退信/無效 | bounced + invalid |
| 待處理 | deferred + mailbox_full + sender_blocked + recipient_blocked |
| 已退訂 | unsubscribed |

⚠ 這些統計**只反映該 list 內**的訂閱者狀態，不是全資料庫的 SendGrid 全域數字。

### 手動清除狀態（恢復寄送）

聯絡人詳情頁有 banner 顯示當前 email_status，按右側「清除狀態」按鈕 → email_status 設為 null → 下次寄送會包含這個聯絡人。

適用情境：
- `mailbox_full`：對方清出信箱空間了
- `sender_blocked`：我方修好 DKIM / 讓對方加白名單
- `recipient_blocked`：對方公司或 IT 設定變了
- `deferred`：對方伺服器過幾天恢復了

---

## 不會污染 last_activity 的保證

SendGrid 寄送的 interaction_logs 都會標 `send_method='sendgrid'`；`contacts.last_activity_at` 的 DB trigger 過濾條件 `send_method IS DISTINCT FROM 'sendgrid'` 會排除這些 log。

意思是：即使電子報寄給 4000+ 訂閱者，連帶寫的 interaction_logs 不會把所有聯絡人的「最後活動」洗到同一時間。這個機制不用另外做，已經內建。
