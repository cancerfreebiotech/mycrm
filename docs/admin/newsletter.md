---
title: 電子報
parent: 管理員
nav_order: 7
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

## 每月例行流程（建議）

1. **準備內容**：撰寫月度電子報（之後可用 AI 輔助 from `newsletter_tone_samples`）
2. **建 campaign**：直接在 DB 插入，或之後做 `/admin/newsletter/compose` UI 從 skeleton 生成
3. **匯入圖片到 Storage**（如果有新圖）
4. **Quick-Send 頁**：調整主旨/預覽文字，選 list
5. **測試寄送** 到自己 email 確認排版
6. **發布到 RSS** → Substack 自動抓草稿 → 確認 Substack 版面
7. **正式寄送** 給所有訂閱者
8. Substack 端按 publish

---

## 不會污染 last_activity 的保證

SendGrid 寄送的 interaction_logs 都會標 `send_method='sendgrid'`；`contacts.last_activity_at` 的 DB trigger 過濾條件 `send_method IS DISTINCT FROM 'sendgrid'` 會排除這些 log。

意思是：即使電子報寄給 4000+ 訂閱者，連帶寫的 interaction_logs 不會把所有聯絡人的「最後活動」洗到同一時間。這個機制不用另外做，已經內建。
