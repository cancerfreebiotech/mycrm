# CHANGELOG

## v1.7.12 — 修正名片王確認人 display_name 快取問題（2026-03-22）

### 變更項目
- `resolveUser()` 偵測到 display_name 含 `@`（email 退回值）時強制重新抓取 `/api/me`，確保始終使用正確的顯示名稱

## v1.7.11 — 修正聯絡人頁面 extra_data 巢狀物件造成崩潰（2026-03-22）

### 變更項目
- `extra_data` 值若為物件（非字串）時改用 `JSON.stringify()` 顯示，避免 React 渲染崩潰

## v1.7.10 — 修正名片王確認人顯示名稱（改用 /api/me 取 display_name）（2026-03-22）

### 變更項目
- `resolveUser()` 改用 `auth.getUser()` 取 user.id + `/api/me` 取 display_name，解決瀏覽器 RLS 限制導致只能拿到 email 的問題

## v1.7.9 — 修正名片王確認人：改回瀏覽器 auth.getUser()（2026-03-22）

### 變更項目
- 捨棄 `/api/me` fetch 改回使用瀏覽器端 `supabase.auth.getUser()`，與第一版可運作的邏輯一致
- `resolveUser()` fallback 同樣使用 `auth.getUser()`，徹底消除 race condition

## v1.7.8 — 修正名片王確認人：action 時即時取 user（2026-03-22）

### 變更項目
- 新增 `resolveUser()` helper：確認/合併/批次確認時，若 `myUser` 尚未載入則即時呼叫 `/api/me`，確保每次 action 都能取得正確的確認人身份

## v1.7.7 — 修正名片王確認人識別改用 /api/me（2026-03-22）

### 變更項目
- 名片王審查頁：改用 `/api/me`（伺服器驗證）取得登入者 ID，解決 `getSession()` 快取失效導致確認人未記錄的問題
- SQL 補正 Brandon Possin、Brian Lim 的 created_by 與互動紀錄確認人

## v1.7.6 — 修正名片王確認人未記錄問題（2026-03-22）

### 變更項目
- confirm/merge route 新增 session cookie fallback：前端 myUser 未載入或批次確認未傳 userId 時，自動從 cookie 讀取登入者
- 修正 handleBatchConfirm 未傳 confirmedByUserId/Name 的問題
- SQL 補正 Bella Hsu 的 created_by 與互動紀錄

## v1.7.5 — 修正名片王確認後照片消失問題（2026-03-22）

### 變更項目
- 修正 confirm route 誤帶不存在的 `storage_path` 欄位導致 `card_img_url` 更新失敗，確認後照片顯示破圖
- 修補已確認 5 筆聯絡人的 `card_img_url`（Allen Chong、Andrew Chen、Chris Kim、Angela Feng、Akiyuki Takaya）
- 修正 import script `created_at` 固定為 `2020-01-01` 未生效問題

## v1.7.4 — 名片王 FK 修正 + 建立時間設為掃描時間（2026-03-22）

### 變更項目
- **FK 違反修正**：`created_by` 只在 `public.users` 查到對應 profile 時才設定，避免 FK constraint 錯誤
- **`created_at` 設為掃描時間**：從名片王確認的聯絡人 `created_at` 使用 `camcard_pending.created_at`，讓時間序列與實際掃描時間一致，不與手動建立的聯絡人混在一起

## v1.7.3 — 名片王確認人 server-side 解析 + created_by（2026-03-22）

### 變更項目
- **confirm/merge route 改為 server-side 讀取確認人**：使用 cookie-based session 取得當前登入者 ID，再以 service role 查 `display_name`，完全不依賴前端傳值，解決 confirmedByName 顯示 email 的問題
- **`contacts.created_by` 自動填入**：從名片王確認建立的聯絡人，`created_by` 自動設為確認者的 user ID
- **前端移除 `confirmedByName` 傳遞**：確認人邏輯全移至後端，前端不再需要傳 `confirmedByName`

## v1.7.2 — 確認人名稱修正（2026-03-22）

### 變更項目
- **`/api/me` 新增**：使用 service role 讀取目前登入者的 `display_name`，解決瀏覽器 client 受 RLS 限制無法讀取 `users` 表的問題
- **名片王審查頁**：確認人改由 `/api/me` 取得，互動紀錄顯示正確的 display_name 而非 email

## v1.7.1 — 名片王正反面配對 + 擴充聯絡人欄位（2026-03-21）

### 變更項目
- **名片王 Script 正反面配對**：自動配對 `{Name}-Card Front.jpg` / `{Name}-Card Back.jpg`，兩張圖一起送 Claude OCR（單次 API call），產生一筆 `camcard_pending` 紀錄
- **`(2)` 重複背面處理**：忽略 `*-Card Back(2).jpg` 重複掃描，以第一張為準
- **新聯絡人欄位**：`address_en`（英文地址）、`fax`（傳真）、`department`（部門）、`extra_data JSONB`（OCR 溢出資料）
- **OCR Prompt 更新**：新增傳真、英文地址、部門指示；雙語地址自動分配至 `address` / `address_en`；不認識的欄位存入 `extra_data`
- **聯絡人詳情頁**：顯示新欄位；有 `extra_data` 時顯示「其他資訊」區塊
- **編輯表單**：新增傳真、英文地址、部門欄位
- **i18n**：zh-TW / en / ja 新增 `addressEn`、`fax`、`department`、`extraData` 鍵

---

## v1.7.0 — 重複審查、名片王匯入、Newsletter 抑制名單、系統狀態（2026-03-21）

### 變更項目
- **聯絡人合併**：詳情頁新增「合併聯絡人」功能，搜尋目標聯絡人後合併，空白欄位從來源補入，名片/互動紀錄/Tag 全部轉移，來源聯絡人刪除
- **重複聯絡人審查 `/admin/duplicates`**：掃描相同 Email 及姓名相似配對，支援保留左/右/標記不是重複，合併確認 Modal
- **名片王批次匯入 Script** `scripts/camcard-import/import.ts`：本機 ts-node 腳本，Claude OCR 辨識，寫入 `camcard_pending` 暫存表，支援 `--dry-run`/`--resume`
- **名片王暫存審查 `/admin/camcard`**：按公司分組，確認新增 / 合併至現有聯絡人 / 略過 / 批次新增，重複偵測警告
- **系統狀態 `/admin/health`**：檢查 Supabase / Gemini / Telegram Bot / SendGrid / Teams Bot，顯示延遲 bar，支援 30 秒自動重整
- **`/docs` 存取控制**：未登入只顯示 Quick Start section，已登入顯示全部三章節；新增 zh-TW/en/ja 三語 Quick Start 內容
- **SendGrid 抑制名單匯入** `POST /api/sendgrid/import-suppressions`：拉取 hard bounce / invalid email / 全域退訂寫入黑名單與退訂表
- **聯絡人 Email 黑名單 badge**：詳情頁 Email 旁顯示「黑名單」/「已退訂」badge，即時查詢 newsletter 狀態
- **Newsletter 黑名單/退訂分頁**：加入搜尋 + server-side 分頁（每頁 50 筆）
- **筆記刪除**：筆記搜尋頁每筆 hover 顯示刪除按鈕，confirm 後刪除
- **DB Migration**：新增 `duplicate_pairs`、`camcard_pending` 表，`contacts` 新增 `source`/`imported_at` 欄位，啟用 pg_trgm，新增三個相似度搜尋 RPC
- **i18n**：zh-TW / en / ja 新增 `nav.duplicates`、`nav.camcard`、`nav.health`、`notes.confirmDelete`
- **Sidebar**：新增重複審查、名片王匯入、系統狀態三個 admin 項目

---


## v1.6.4 — Bot `/met` 批次套用認識場合（2026-03-19）

### 變更項目
- **Bot 新指令 `/met {數量} {描述}`**：AI（Gemini）解析場合/日期/介紹人，顯示最近 N 筆聯絡人確認，確認後批次更新並寫互動紀錄
- **新增 `gemini.ts parseMetCommand`**：Gemini 解析自然語言場合描述，支援「昨天」「上週五」等日期

---

## v1.6.3 — 認識場合記錄（2026-03-19）

### 變更項目
- **Migration**：`contacts` 新增 `met_at`（場合）、`met_date`（日期）、`referred_by`（介紹人）欄位
- **聯絡人列表**：多選 checkbox、批次編輯 Modal（填入三個欄位並寫 interaction_log）、`met_at` 場合篩選
- **聯絡人詳情**：新增「認識資訊」區塊顯示三個欄位
- **新增/編輯聯絡人表單**：新增「認識資訊」區塊

---

## v1.6.4 — Bot `/met` 批次套用認識場合（待實作）

### 變更項目
- **Bot 新指令 `/met {數量} {描述}`**：AI（Gemini）解析場合、日期、介紹人，顯示最近 N 筆聯絡人確認，確認後批次更新並寫互動紀錄

---

## v1.6.3 — 認識場合記錄（待實作）

### 變更項目
- **`contacts` 新增欄位**：`met_at`（場合）、`met_date`（日期）、`referred_by`（介紹人自由文字）
- **網頁批次編輯**：聯絡人列表多選後批次填入三個欄位，同步寫 interaction_log
- **聯絡人列表新增 `met_at` 篩選**

---

## v1.6.1 — 辨識失敗審查帶入名片圖片（2026-03-19）

### 變更項目
- **辨識失敗審查 → 手動建立聯絡人** 按鈕改為帶入名片圖片：開啟新增聯絡人頁面時自動顯示該名片圖片，儲存後自動關聯至聯絡人（不重新上傳）
- **新增 `/api/link-card`**：將已存在的 Storage 圖片直接關聯至聯絡人，同步將 `failed_scan` 標為已審查
- **新增聯絡人頁 OCR 支援**：當由失敗審查進入時，可直接對該圖片執行 OCR 辨識

---

## v1.6.0 — Newsletter 功能（2026-03-19）

### 變更項目
- **新增 Newsletter 管理頁 `/admin/newsletter`**（僅 super_admin）：Campaign Wizard（基本設定/編輯內容/收件人/排程）、列表、詳情、複製、暫停/繼續
- **SendGrid Email API 整合**：分批寄送（每天上限 500 封、自訂時間）、Open/Click Tracking
- **SendGrid Event Webhook `/api/sendgrid/webhook`**：同步開信、點擊、退訂、bounce、spam 事件到資料庫
- **TipTap 富文字編輯器**（`src/components/TipTapEditor.tsx`）：支援變數（`{{name}}`）、附件上傳、預覽模式、測試信
- **收件人邏輯**：Tag 聯集 + 手動勾選，自動排除退訂者和黑名單，寄送前鎖定名單快照至 `newsletter_recipients`
- **退訂頁面 `/unsubscribe`**：公開頁面，HMAC-SHA256 JWT token 驗證，選填退訂原因
- **黑名單管理**：hard bounce 和 spam 自動加入，可手動管理
- **互動紀錄**：每位收件人各寫一筆 interaction_log（type=email）
- **Supabase Edge Function `send-newsletter`**：pg_cron 每小時整點觸發，依 send_hour 過濾，分批寄送
- **DB Migration**：新增四張表（含 RLS）：`newsletter_campaigns`、`newsletter_recipients`、`newsletter_unsubscribes`、`newsletter_blacklist`
- **Sidebar**：新增「Newsletter 管理」（僅 super_admin）；i18n 三語言同步更新
- **新增環境變數**：`SENDGRID_API_KEY`、`SENDGRID_FROM_EMAIL`、`SENDGRID_FROM_NAME`、`SENDGRID_WEBHOOK_SECRET`

---


## v1.5.5 — AI 生成信件參考現有內文、修正語言偵測（2026-03-19）

### 變更項目
- AI 生成信件時，現有內文（template 載入或使用者手動輸入）自動作為參考內容傳入 Gemini
- 修正語言偵測邏輯：以使用者的 prompt 語言為準，不受範本或互動紀錄語言影響

## v1.5.4 — 修正收件人欄位離焦未自動加入（2026-03-19）

### 變更項目
- 修正 To/CC/BCC 輸入框：輸入 email 後直接點擊其他欄位（未按 Enter）時，自動將該 email 加入收件人清單

## v1.5.3 — 修正 Bot 確認存檔失敗（2026-03-19）

### 變更項目
- 修正按「✅ 確認存檔」時失敗的根本原因：`pending.data` 含有 `rotation` 欄位，但 contacts 表無此欄位，導致 insert 失敗
- 修正 `throw error` 拋出非標準 PostgrestError 導致錯誤訊息顯示 `[object Object]`
- 統一 callback catch block 的錯誤序列化方式

## v1.5.2 — Bot 錯誤診斷日誌強化（2026-03-19）

### 變更項目
- 加強 Telegram bot 名片處理錯誤的 console.error 日誌，完整序列化錯誤物件以便診斷 `[object Object]` 問題
- 修正 catch block 錯誤訊息提取：非 Error 物件改用 JSON.stringify 顯示，避免輸出 `[object Object]`

## v1.5.1 — Provider token 自動刷新、刪除聯絡人、新增聯絡人修正（2026-03-19）

### 變更項目
- **Microsoft token 自動刷新**：登入時加入 `offline_access` scope，儲存 refresh token；存取憑證快到期時自動透過 Microsoft 刷新，最長可維持 ~90 天免重新登入
- **新 API `/api/provider-token`**：前端寄信前呼叫此端點，確保取得最新 token
- **`getValidProviderToken(userId)`**：Bot（Telegram/Teams）確認行程、寄信時統一使用此函數取得有效 token
- **刪除聯絡人**：`super_admin` 可刪除所有聯絡人；上傳者可刪除自己上傳的聯絡人
- **新增聯絡人修正**：修正照片未儲存（`Uint8Array` → `Blob`）、互動紀錄未寫入的問題
- **CC / BCC 多收件人**：寄信支援 CC、BCC，以逗號分隔
- **Lightbox 縮放**：聯絡人名片圖片支援滾輪縮放、拖曳平移、雙指捏合
- 版本 1.5.0 → 1.5.1

## v1.5.0 — /meet 行程排程指令（Telegram + Teams）（2026-03-19）

### 變更項目
- **新指令 `/meet` / `/m`**：Telegram Bot 與 Teams Bot 均支援，AI 解析會議描述後顯示確認訊息，使用者確認後建立 Outlook 行事曆邀請
- **AI 解析**：自動識別時間、時長（30/60/90/120 分鐘）、參與者（僅組織成員）、地點
- **確認流程**：Telegram inline keyboard、Teams Adaptive Card，均含「確認建立」與「取消」按鈕
- **Outlook 行程**：確認後呼叫 Microsoft Graph `POST /me/events`，自動傳送會議邀請給被點名的組織成員
- **`meeting_drafts` 資料表**：暫存 AI 解析結果，確認或取消後自動刪除
- **登入 scope 加入 `Calendars.ReadWrite`**：使用者需重新登入一次
- 版本 1.4.4 → 1.5.0

## v1.4.4 — 寄信聯絡人選擇器、AI 生成主旨、多語言（2026-03-19）

### 變更項目
- **收件人 chip 選擇器**：To/CC/BCC 改為 chip 輸入，打名字/email 可搜尋 CRM 聯絡人，Enter 可新增任意 email
- **多聯絡人互動紀錄**：寄信後自動幫所有選到的 CRM 聯絡人各新增一筆互動紀錄
- **AI 同時生成主旨**：AI 生成信件時回傳 `{subject, html}`，自動填入主旨欄
- **AI 語言跟隨描述**：prompt 加入「語言請與使用者描述相同」指示
- **忽略名片掃描紀錄**：AI 生成時略過「透過 Telegram Bot 新增名片」的互動紀錄
- 聯絡人清單在開啟 Modal 時一次載入，後續全 client-side 過濾，不增加 DB 負擔
- 版本 1.4.3 → 1.4.4

## v1.4.3 — 修正寄信 Microsoft 存取權限錯誤（2026-03-19）

### 變更項目
- **修正寄信 provider_token 問題**：`@supabase/ssr` cookie session 不保留 `provider_token`，改從 `users` 表讀取
- **auth callback 強化**：登入時將 `provider_token` 寫入 `users.provider_token`（與 Bot 共用同一機制）
- 頁面 `load()` 一併讀取 `provider_token`，`handleSendMail` 改用 DB token
- 版本 1.4.2 → 1.4.3

## v1.4.2 — 寄信支援 CC / BCC 與多收件人（2026-03-19）

### 變更項目
- **CC / BCC 欄位**：寄信 Modal 新增副本、密件副本輸入框
- **多收件人**：To / CC / BCC 均支援逗號分隔多個地址（例：`a@co.com, b@co.com`）
- **`graph.ts`**：`sendMail` 函式新增 `cc` / `bcc` 參數，自動解析並填入 `ccRecipients` / `bccRecipients`
- 版本 1.4.1 → 1.4.2

## v1.4.1 — 名片圖片放大 Lightbox（2026-03-19）

### 變更項目
- **名片 Lightbox**：聯絡人頁面名片縮圖 hover 時顯示放大鏡圖示，點擊開啟全螢幕 Lightbox 檢視大圖
- **Lightbox 關閉方式**：點擊背景遮罩、右上角 ✕ 按鈕、或按 Escape 鍵皆可關閉
- 版本 1.4.0 → 1.4.1

## v1.4.0 — Vercel Cron 自動文件生成 + Teams Bot 診斷強化（2026-03-19）

### 變更項目
- **Vercel Cron**：新增 `vercel.json` 排程，每日凌晨 2:00（台北時間）自動呼叫 `/api/docs/cron` 重新生成 6 份說明書（zh-TW/en/ja × user/super_admin）並 upsert 進 Supabase
- **Teams Bot invoke 診斷**：新增完整 logging（RAW body、auth result、invoke value）方便查 Vercel Logs 排查問題
- **Teams Bot invoke 格式相容**：新增第三種 value 格式解析（`value.data.action`），確保所有 Teams invoke payload 格式皆可處理
- **Teams Bot invoke catch-all**：invoke block 結尾加上保底 `invokeResponse`，防止格式解析失敗時回傳錯誤格式

## v1.3.9 — 名片辨識失敗審查、/AI 指令、助理 tag picker、多項 UX 改善（2026-03-18）

### 變更項目
- **名片辨識失敗處理**：若 AI 無法識別姓名，照片保留在 Storage，存入 `failed_scans` 資料表，通知使用者已回報管理員；Super Admin 新增「辨識失敗審查」頁面可查看圖片並標記完成
- **新增 /AI 指令**：Telegram Bot 與 Teams Bot 皆支援 `/AI`，顯示目前帳號使用的 AI 模型名稱與端點
- **Telegram 503 重試**：`sendMessage` 遇到 503 時自動通知使用者「3 秒後重試」，重試失敗再告知無法傳送
- **助理選人改版**：個人設定 → 我的助理，改為 tag 式 picker（已選顯示可移除 tag，點「+ 新增助理」展開下拉選單）
- **任務指派人顯示**：指派人欄位 fallback 改為 email username（@ 前面），不再顯示完整 email
- **名片存檔後回傳連結**：確認存檔後 Bot 回傳可點擊的聯絡人頁面連結
- **國家新增自動填入**：輸入 2 字母 ISO code 後自動帶入中英日名稱與 emoji（收錄 60+ 國家）
- **DB migration**：新增 `failed_scans` 資料表（含 RLS）

## v1.3.8 — 任務管理強化 + 檔案限制 + 助理選擇（2026-03-18）

### 變更項目
- **任務管理**：新增任務編號（#N）、顯示指派時間與指派人、Supabase Realtime 即時更新狀態
- **Bot bug fix**：Telegram 按完成後 `completed_by` 改寫 email（之前誤寫 UUID）
- **Teams bot**：task_done 加入詳細 log + 若帳號未綁定給予明確錯誤訊息
- **檔案大小**：附件上傳限制從 2MB 改為 5MB（Email 附件、範本附件）
- **個人設定 → 助理**：從 email 輸入框改為 tag 式選人（從系統使用者清單中點選）
- **DB migration**：tasks 表新增 `task_number` SERIAL 欄位

## v1.3.7 — /docs TOC 移至左側 + Mermaid 流程圖（2026-03-18）

### 變更項目
- TOC（本頁目錄）從右欄移至左側導覽列（與 GitHub Pages Just the Docs 相同位置）
- 整合 mermaid.js，文件中的 mermaid code block 自動渲染為流程圖
- 更新 zh-TW 使用者文件：加入系統運作流程、名片辨識、任務指派等示意圖
- 更新 zh-TW Super Admin 文件：加入系統架構、Teams 綁定、RLS 權限流程圖
- 行動版新增可折疊的 TOC 面板

## v1.3.6 — /docs 頁面排版大幅改善（2026-03-18）

### 變更項目
- `/docs` 改為三欄式佈局：左側章節導覽 | 中間內容 | 右側目錄（TOC）
- 右側 TOC 自動從 markdown 標題（h1~h3）產生，含 IntersectionObserver 高亮目前段落
- 標題層級大幅改善：h1=1.875rem + 底線、h2=1.375rem + 底線、h3=1.125rem
- 表格、code block、blockquote 樣式全面優化（含深色模式）
- 標題加 anchor id，支援 TOC 錨點跳轉
- `marked` 自訂 renderer 以產生 slug id

## v1.3.5 — /n alias + /w 自動偵測聯絡人 + Teams 通知診斷（2026-03-17）

### 變更項目
- Bot：新增 `/n` 作為 `/note` 的別名
- Bot `/w`：AI 解析任務時自動偵測提及的外部聯絡人姓名，從 contacts 表搜尋並關聯（優先於 session 記錄）
- Bot `/w`：Teams 通知錯誤改為 console.error 記錄，便於診斷
- Bot `/w`：appUrl 回退補上 NEXT_PUBLIC_APP_URL

## v1.3.4 — 說明書改由 Claude Code Skill 生成（2026-03-17）

### 變更項目
- 說明書改由 `/generate-docs` Claude Code Skill 手動生成，不再依賴 Vercel serverless function
- 移除 `/api/docs/generate` route 及說明書頁面的生成按鈕
- 新增 `.claude/commands/generate-docs.md` skill

## v1.3.3 — 可折疊側邊欄 + 任務去重 + 任務聯絡人連結 + Teams 聯絡人通知（2026-03-17）

### 變更項目
- 側邊欄：桌面版新增折疊/展開切換按鈕，狀態儲存於 localStorage
- Telegram Bot：webhook update_id 去重，防止 AI 回應過慢導致重複建立任務
- 網頁任務列表：顯示關聯聯絡人姓名（可點擊跳至聯絡人頁面）
- Teams Bot：/w 指派任務時，同步傳送 Adaptive Card 給被指派者（含聯絡人姓名與公司）
- DB：新增 telegram_dedup 表（防重複）及 tasks.contact_id 欄位

## v1.3.2 — Dashboard 聯絡人連結 + 個設 Teams 狀態 + 任務聯絡人脈絡 + 全欄排序（2026-03-17）

### 變更項目
- Dashboard：總聯絡人數字卡片可點擊跳至聯絡人列表
- 個人設定：新增 Teams Bot 綁定狀態顯示（已綁定 / 未綁定）
- Telegram /w：指派任務給團隊成員時，通知訊息同時顯示相關聯絡人姓名與公司
- 聯絡人列表：姓名、公司、職稱、Email、電話、建立時間 欄位全部支援點擊排序

## v1.3.1 — 行動版聯絡人卡片 + Teams Bot 綁定狀態 + OCR 多語系姓名（2026-03-17）

### 變更項目
- 聯絡人列表：手機新增卡片式瀏覽，標題列按鈕在小螢幕自動折疊
- 使用者管理：新增 Teams Bot 欄位，顯示各用戶的 Teams Bot 綁定狀態
- Telegram /u 指令：成員列表改為 ✅/⬜ 同時顯示 Telegram 和 Teams 綁定狀態
- OCR prompt 更新：名片同時含中文、日文、英文姓名時分別存入對應欄位（name/name_local/name_en）
- 說明書語言切換器：加上 Globe 圖示與外框，更易識別
- 側邊選單：報表管理移到說明書上方

## v1.3.0 — 說明書多語言 + Prompt 自訂 + 報表權限 + 聯絡人篩選 + Dashboard 統計互動（2026-03-17）

### 變更項目
- **Task 66** Migration：新增 `docs_content`、`prompts`、`user_prompts` 表；`report_schedules` 新增 `owner_id`
- **Task 67** 新增 `src/lib/prompts.ts`：`SYSTEM_PROMPTS` 常數 + `getPrompt()` 三層優先級函式
- **Task 68** 新增 `/api/docs/generate` route：呼叫 AI 生成 3 語言 × 2 section 說明書，upsert `docs_content`
- **Task 69** 更新 `/docs` 頁面：語言切換按鈕、從 `docs_content` 撈內容、Markdown 渲染（marked）
- **Task 70** 新增 `/admin/prompts` 頁面：4 個 prompt 編輯 + 還原系統預設
- **Task 71** 更新 `/settings`：新增個人 `email_generate` prompt 編輯 + 還原組織預設
- **Task 72** 更新所有 AI 呼叫（OCR、email、任務解析）改用 `getPrompt()`
- **Task 73** 更新報表頁：依角色過濾排程（member 只看自己），報表資料範圍依 `created_by` 過濾
- **Task 74** `/contacts/new` 新增國家欄位 ✅（已完成）
- **Task 75** 聯絡人列表新增國家篩選 dropdown（單選）
- **Task 76** Dashboard 新增國家分布統計區塊（長條圖，可點擊跳轉 `/contacts?country=`）
- **Task 77** Dashboard Tag 分布每行改為可點擊 `<Link>` 跳轉 `/contacts?tag=`
- **Task 78** 聯絡人列表：URL query 初始化篩選、國家多選 dropdown、職稱三段排序（asc/desc/無）
- **[Task 67]** 新增 `src/lib/prompts.ts`：`SYSTEM_PROMPTS` 常數 + `getPrompt()` 三層取值
- **[Task 68]** 新增 `/api/docs/generate` route：讀 PRD → AI 生成 6 份說明書內容 → upsert `docs_content`；設定 Vercel build hook
- **[Task 69]** 更新 `/docs` 頁面：語言切換按鈕（繁中/EN/日），內容從 `docs_content` 撈取
- **[Task 70]** 新增 `/admin/prompts` 頁面（super_admin）：4 個 prompt 編輯 + 還原系統預設
- **[Task 71]** 更新 `/settings`：新增 `email_generate` prompt 編輯區塊 + 還原組織預設
- **[Task 72]** 更新所有 AI 呼叫（OCR、email 生成、任務解析、說明書生成）改用 `getPrompt()`
- **[Task 73]** 更新 `/admin/reports`：依角色過濾規則（owner_id），資料範圍依角色限縮
- **[Task 75]** 聯絡人列表新增國家篩選 dropdown（可與 Tag 篩選同時使用）
- **[Task 76]** Dashboard 新增國家統計長條圖，每行可點擊跳轉 `/contacts?country={code}`
- **[Task 77]** Dashboard Tag 分布改為可點擊，跳轉 `/contacts?tag={name}`，加 `›` 箭頭
- **[Task 78]** 聯絡人列表：URL query 初始化篩選（`?tag` / `?country`）+ 職稱欄三段式排序
- **i18n**：三份語言檔補 `dashboard.countryDistribution`、`dashboard.countryOther`、`contacts.countryFilter`

---


## v1.2.3 — 文件更新與 Dashboard 修復（2026-03-17）

### 變更項目
- **修復 Dashboard Tag 計數錯誤**：Tag 人數一律顯示 1 的 bug（`contact_tags(count)` 回傳值誤用陣列長度）已修正
- **Dashboard 隱藏零人 Tag**：count = 0 的 Tag 不再顯示於首頁統計區塊
- **修復外部 Telegram 使用者錯誤訊息**：改為「此 Bot 為 CancerFree Biotech 內部專用」
- **文件：第一次登入補充 Teams Bot 綁定說明**
- **文件：Telegram 綁定步驟改用 `@userinfobot`，補充 Bot 名稱 `@CF_CRMBot`**

---

## v1.2.2 — Bot 修復與強化（2026-03-17）

### 變更項目
- **修復 Telegram 重複 callback 錯誤**：`answerCallbackQuery` 移到 DB 操作之前，避免 Telegram retry 觸發「找不到暫存資料」錯誤；已處理的 callback 靜默回傳 ok（冪等）
- **Telegram OCR 結果顯示國家**：辨識結果新增 `🌍 國家` 欄位，顯示 emoji + 中文名稱（如 `🇹🇼 台灣`）

---

## v1.2.1 — Teams Bot 修復（2026-03-16）

### 變更項目
- **修復 Teams Bot 無法回覆**：`getBotToken` 改用 tenant-specific 端點（支援 single-tenant App Registration）
- **修復帳號自動綁定失敗**：email 比對改為大小寫不敏感（`ilike`），解決 Microsoft Graph 回傳大寫 email 與 DB 小寫不符問題
- **補充 Teams Bot 說明文件**：新增帳號自動綁定流程說明

---

## v1.2.0 — UX 強化 + 國家欄位 + 寄信強化（2026-03-16）

### 變更項目
- **Email copy 按鈕**：聯絡人詳情頁 email / 電話旁加複製圖示，點擊顯示「✅ 已複製」提示
- **多張名片上傳（最多 6 張）**：新增聯絡人和補充名片均支援，壓縮後合併送 AI 辨識，新增左右對照確認介面
- **新增國家欄位**：`contacts.country_code` FK → `countries.code`，現有聯絡人預設 NULL
- **`countries` 資料表**：super_admin 管理，預設台灣 🇹🇼、日本 🇯🇵、美國 🇺🇸、韓國 🇰🇷、新加坡 🇸🇬、印度 🇮🇳，支援中/英/日多語名稱與旗幟 emoji
- **新增 `/admin/countries` 頁面**（僅 super_admin）
- **全新寄信介面**：可編輯收件人（To）、套用範本附件自動帶入、AI 生成內文（帶入最近互動紀錄）、臨時附件上傳（每檔 2MB）
- **行動版 sidebar**：手機顯示 hamburger 滑出抽屜；平板收縮為 icon-only，hover 展開；桌機完整顯示
- **全站圖片壓縮統一規範**：所有上傳點一律 1024px / JPEG Q85
- **說明書更新**：GitHub Pages 文件反映 v1.2 所有新功能
- **版本號**：package.json / 側邊欄頁腳同步升至 v1.2.0

---


## v1.1.0 — 權限控管改善（2026-03-16）

### 變更項目
- **側邊欄權限分離**：標籤管理、未指派筆記、郵件範本移至 `super_admin` 專屬，一般 Member 不再看到
- **側邊欄分隔線**：Super Admin 的管理功能與一般功能之間加一條細線，視覺上明確區分
- **修復 Bot Webhook URL**：Telegram webhook 誤指向 `mycrm.vercel.app`（他人的 SvelteKit app），改為正確的 `mycrm-vert.vercel.app`
- **修復 middleware 攔截 Bot 請求**：`supabase.auth.getUser()` 在 bypass 檢查之前執行，導致 `/api/bot` 被攔截；改為對公開路由提前 return，不觸發 Supabase
- **文件更新**：角色說明、側邊欄說明、管理員功能列表同步更新；修正文件中的 URL

---

## v1.0.1 — Bug fixes & docs 改善（2026-03-16）

### 變更項目
- **修復登入頁語言切換無效**：`/api/set-locale` 未列入 middleware bypass，未登入狀態呼叫會被導向 `/login` 而無法設定 cookie
- **修復圖片上傳未壓縮**：新增聯絡人、名片重新辨識、名片附件上傳三個路徑補上 Canvas 壓縮（1024px、JPEG Q85），與 Bot / 批次上傳行為一致
- **修復 GitHub Pages dark mode**：將按鈕與 JS 合併至 `footer_custom.html`，解決跨檔案時序問題；補強 table `th`/`td`/`tr` dark mode 樣式；修正 header 右上角白色背景
- **文件結構重組**：新增「系統部署（IT）」章節，將環境設定、Telegram Bot 設定、Teams Bot 設定從使用者區移出，使用者與 IT 文件分開

---

## v1.0 — 任務管理 + Teams 整合（已完成 2026-03-15）

### 變更項目
- **Bot 新指令 `/work` / `/w`**：AI（Gemini）解析自然語言，提取任務標題、截止時間、負責人名稱，搜尋 users 表比對成員，建立任務並發 Telegram 通知指派對象；無指派對象時為自我提醒
- **Bot 新指令 `/tasks` / `/t`**：列出待處理任務（assigned to me + I created），每筆附 Inline Keyboard：✅ 完成 / ⏭ 延後 / ❌ 取消；延後需輸入新截止時間
- **任務管理頁 `/tasks`**：三個 Tab（我的提醒 / 我指派的 / 指派給我的）+ 關鍵字搜尋 + 狀態 badge + 完成/延後/取消操作 + 新增/編輯 modal（含多人指派 checkbox）
- **API routes**：`/api/tasks`（GET/POST）、`/api/tasks/[id]`（PATCH/DELETE）；助理可代主管標記完成，`completed_by` 記錄操作者
- **個人設定新增「我的助理」**：主管設定多位助理 Email，`/api/assistants`（GET/POST/DELETE）
- **Microsoft Teams Bot**：`/api/teams-bot` webhook（Adaptive Card 附「標記完成」按鈕、「前往任務管理」連結）；`src/lib/teams.ts` 封裝 Bot Framework token + sendTeamsTaskNotification()
- **提醒機制**：`supabase/functions/send-reminder/index.ts`，掃描 due_at 剛過 1 分鐘的 pending 任務，Telegram 通知指派者與建立者
- **新增資料表**：`tasks`、`task_assignees`、`user_assistants`（含 RLS）
- **新增環境變數**：`TEAMS_BOT_APP_ID`、`TEAMS_BOT_APP_SECRET`、`TEAMS_TENANT_ID`
- **i18n**：新增 `tasks` namespace（zh-TW / en / ja），nav 新增 `tasks` key
- **pg_cron 設定（手動執行一次）**：見 `send-reminder/index.ts` 頂部說明

---


## v0.9 — 報表功能（已完成 2026-03-15）

### 變更項目
- **新增報表管理頁 `/admin/reports`**（僅 super_admin）
- **立即產生**：自由選取時間範圍，網頁呈現表格，可下載 Excel（兩個 Sheet：新增名片 + 互動紀錄）
- **定時寄送**：排程 CRUD UI（週期 radio 選擇器：每週/每月/自訂 cron），排程清單可啟用/停用/刪除
- **Supabase Edge Function `send-report`**：接收 scheduleId 或批次執行所有活躍排程，產生 Excel 並透過 Gmail API 寄出
- **Gmail OAuth**：`/api/auth/gmail` 導向 Google OAuth，`/api/auth/gmail/callback` 交換 token 並存入 `gmail_oauth` 表；`/api/auth/gmail/status` 顯示已連結帳戶
- **callback URL 使用 `NEXT_PUBLIC_APP_URL`**：換網域只需更新環境變數
- **導覽列新增「報表管理」**（BarChart2 圖示，僅 super_admin 可見）
- **新增資料表**：`report_schedules`、`gmail_oauth`（含 RLS：super_admin only）
- **新增 API routes**：`/api/reports/generate`、`/api/reports/schedules`、`/api/reports/schedules/[id]`、`/api/auth/gmail`、`/api/auth/gmail/callback`、`/api/auth/gmail/status`
- **新增環境變數**：`GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`、`NEXT_PUBLIC_APP_URL`
- **i18n**：新增 `reports` namespace（zh-TW / en / ja），導覽列新增 `nav.reports` key

---


## v0.8 — 多語言支援 i18n（已完成 2026-03-15）

### 變更項目
- **新增 `next-intl` 套件**：支援繁體中文、English、日本語（cookie-based，無 URL prefix）
- **語言檔**：`messages/zh-TW.json`、`en.json`、`ja.json`，涵蓋全站所有 UI 文字
- **語言切換 UI**：Header 右上角 `🌐` dropdown，個人設定頁語言按鈕群組
- **語言偏好儲存**：`users.locale` 欄位（DB）+ `MYCRM_LOCALE` cookie（1 年），兩端同步
- **API route `/api/set-locale`**：POST 設定語言 cookie
- **所有頁面 hardcode 文字替換為 `useTranslations()` 呼叫**：涵蓋 contacts、notes、unassigned-notes、batch-upload、admin/tags、admin/users、admin/models、admin/templates、settings、dashboard、login 等 14 頁

---


## v0.7.1 — Bot 搜尋強化 + 網頁分頁（已完成 2026-03-15）

### 變更項目
- **Bot `/search` 強化**：搜尋結果不預載互動紀錄，改為每筆附 `[📋 互動紀錄]` 按鈕，點擊後按需載入最新 5 筆，支援 `[載入更多]`
- **分頁：聯絡人列表**：每頁 20 筆，底部頁碼導覽（«‹ 頁碼 ›»），搜尋/篩選後重置第 1 頁
- **分頁：筆記搜尋**：每頁 20 筆，server-side range() + count: exact
- **分頁：未歸類筆記**：每頁 20 筆，assign/delete 後自動修正頁碼
- **無限捲動：互動紀錄時間軸**：預設載入 20 筆，IntersectionObserver 捲到底自動載入下一批

---


## v0.7 — 聯絡人擴充 + 批次上傳（已完成 2026-03-15）

### 變更項目
- **Bot：連續傳圖保護**：同一使用者超過 5 張待確認時，拒絕新照片並提示先處理
- **Bot：`/note`、`/email` 預設上一個聯絡人**：不帶關鍵字時提示「要針對上一位 XXX 嗎？」，`bot_sessions` 新增 `last_contact_id`
- **`contacts` 新增 11 個欄位**：`name_en`、`name_local`、`company_en`、`company_local`、`address`、`website`、`notes`、`second_email`、`second_phone`、`linkedin_url`、`facebook_url`
- **新增 `contact_cards` 子表**：一個聯絡人可掛多張名片（正反面 + label），舊欄位 `card_img_url`/`card_img_back_url` 保留相容
- **名片與主資料脫鉤**：聯絡人主表欄位由使用者手動維護，名片只作附件參考
- **Gemini OCR Prompt 更新**：辨識所有新欄位，直接填入對應欄位
- **批次圖檔上傳 `/contacts/batch-upload`**：最多 50 張，並行（同時 5 張）+ 進度條 + 批次預覽表格 + 批次重複偵測 + 一鍵存檔
- **`interaction_logs.type` 新增 `system`**：系統自動紀錄，顯示系統圖示而非建立者
- **`/contacts/new` 更新**：支援所有新欄位，分四個 section（基本資訊/聯絡方式/社群/備註）
- **`/contacts/[id]` 更新**：顯示所有新欄位、contact_cards 管理（上傳/刪除）、編輯 modal 展開
- **⚠️ 聯絡人合併功能**：延後至後續版本實作

---


## v0.6.1 — 主題修正 + 孤兒圖片清理（已完成 2026-03-15）

### 變更項目

#### 主題系統（Light / Dark）
- **Tailwind v4 dark mode 修正**：在 `globals.css` 加入 `@variant dark (&:where(.dark, .dark *))` 讓 `dark:` utilities 跟著 `next-themes` 注入的 `.dark` class 切換，而非依賴 OS `prefers-color-scheme`（這是 dark mode toggle 完全無效的根本原因）
- **Dashboard Header 加入主題切換按鈕**：Sun / Moon icon button 顯示於右上角使用者名稱旁，可快速切換，無需進入個人設定
- **修正 hydration flash**：Settings 和 Docs 頁面加入 `mounted` state，防止 `useTheme()` 在 hydration 前 `theme === undefined` 導致主題按鈕狀態錯誤
- **修正 `body` 字體**：`globals.css` 改用 `var(--font-geist-sans)` 取代硬碼的 Arial，讓 Geist 字體實際生效
- **修正 docs 頁面 prose dark class 順序**：`prose-code:dark:bg-gray-800` 改為 `dark:prose-code:bg-gray-800`（正確的 Tailwind variant 順序）

#### Bot 孤兒圖片清理
- **A1 — 取消時即時刪圖**：`pending_contacts` 新增 `storage_path` 欄位，上傳名片時同步記錄路徑；使用者點「❌ 不存檔」時，先刪 Supabase Storage 圖檔，再刪 DB 記錄，不留孤兒圖片
- **C — pg_cron 每日定時清理**：啟用 `pg_cron` extension，排程 `cleanup-orphan-cards` 每天凌晨 03:00 UTC 掃描 `cards` bucket，刪除超過 24 小時且未被 `contacts` 或 `pending_contacts` 參照的孤兒圖檔（補強 crash / timeout 等極端情況）

#### DB Migration
- `pending_contacts` 新增欄位：`storage_path TEXT`
- 啟用 `pg_cron` extension
- 新增 cron job：`cleanup-orphan-cards`（每日 03:00 UTC）

---

## v0.6 — Bot 縮寫 + AI Endpoint 管理 + 說明書（已完成 2026-03-14）

### 變更項目
- **Bot：指令縮寫**：`/h`、`/s`、`/e`、`/ab`、`/u`，/help 顯示完整指令與縮寫對照
- **Bot：新增 `/user` / `/u` 指令**：列出所有組織成員的姓名、email、Telegram ID（所有人可用）
- **AI Endpoint 管理**：新增 `ai_endpoints` 表，super_admin 可從 `/admin/models` 管理多個 AI 服務商（名稱、Base URL、API Key）
- **AI Model 改為二層結構**：`ai_models` 表取代 `gemini_models`，model 屬於某個 endpoint
- **`users` 表新增 `ai_model_id`**：指向 `ai_models.id`，取代原本的 `gemini_model` 文字欄位
- **個人設定 model 選擇改為兩層**：先選 endpoint，再選 model
- **`/admin/models` 頁面重構**：支援 endpoint CRUD + 每個 endpoint 底下的 model CRUD
- **新增說明書頁面 `/docs`**：AI 根據 PRD 自動生成，分 User / Super Admin 兩個 section，含右側目錄導覽

---


## v0.5 — Bot 強化 + 網頁功能擴充（已完成 2026-03-14）

### 變更項目
- **Bot：新增 `/help` 指令**：列出所有可用指令
- **Bot：新增 `/search [關鍵字]`**：模糊搜尋聯絡人，回傳名片照片（正反面），每筆附 `[✉️ 發信]` `[📝 筆記]` 快速按鈕
- **Bot：所有指令統一操作模式**：輸入關鍵字 → 列出選項 → 回覆數字選擇
- **Bot：`/email` 發信功能**：場景 D（template + AI 生成都支援），使用觸發者 Microsoft 信箱發出，互動紀錄存完整內文，附件只記檔名
- **Bot：`/note` 改用統一搜尋模式**
- **Gemini model 改為資料庫管理**：新增 `gemini_models` 表，super_admin 可從 `/admin/models` 新增/停用，個人設定 dropdown 從 DB 讀取
- **Email Template：AI 生成功能**：新增「AI 生成」按鈕，輸入描述後 AI 生成完整郵件內文
- **新增 `/api/ai-email` route**：供 AI 生成 email 內容使用
- **RWD**：所有頁面 mobile friendly，sidebar 在 mobile 收合為 hamburger menu
- **筆記搜尋頁 `/notes`**：可依關鍵字、日期範圍、type 搜尋所有互動紀錄
- **Dashboard 強化**：Tag 聯絡人分布統計、未歸類筆記數統計卡片
- **版本資訊 footer**：所有頁面左下角顯示版本號 + Vercel 部署時間
- **`interaction_logs` 新增欄位**：`email_subject`、`email_attachments`（存檔名陣列）
- **新增 Gemini Model 管理頁 `/admin/models`**（僅 super_admin）

---

## v0.4 — Bot 強化 + 聯絡人管理擴充（已完成 2026-03-14）

### 變更項目
- **Bot：存檔確認新增 `[❌ 不存檔]` 按鈕**
- **Bot：支援會議筆記輸入**（/note 指令 + @姓名快速格式）
- **Bot：找不到聯絡人時建立未歸類筆記**（contact_id=null）
- **Bot：支援 `/add_back @姓名` 補充名片反面**
- **Bot：新增 `bot_sessions` 表管理多步驟對話狀態**
- **重複聯絡人偵測**：存檔前比對 email + 姓名相似度（pg_trgm）
- **`interaction_logs` 新增欄位**：`type`（note/meeting/email）、`meeting_date`；`contact_id` 改為 nullable
- **`contacts` 新增欄位**：`card_img_back_url`
- **網頁新增聯絡人**：`/contacts/new`，含照片上傳 + AI 辨識 + 重複偵測
- **網頁編輯聯絡人**：聯絡人詳情頁新增編輯 Modal
- **Export 功能**：Excel/CSV，依目前篩選結果
- **未歸類筆記頁 `/unassigned-notes`**
- **Dashboard 待處理區塊**：最新 5 筆未歸類筆記
- **新增 `/api/ocr` route**
- **新增 `src/lib/duplicate.ts`**
- **Gemini 多語言支援**：支援中英日文名片

---

## v0.3 — 功能擴充（已完成 2026-03-14）

### 變更項目
- **UI 修正**：所有輸入框文字色 `text-gray-900` / `dark:text-gray-100`
- **深色/淺色主題**：`next-themes`，偏好儲存於 `users.theme`
- **角色系統**：`admin` 改名為 `super_admin`，可有多位
- **個人設定頁**：顯示角色、Gemini model dropdown、主題切換
- **Gemini model 個人化**：Bot 掃名片使用該使用者的 model
- **圖片命名規則**：`yymmdd_hhmmss-流水號.jpg`
- **聯絡人 Tag 功能**：`tags` + `contact_tags` 表
- **Tag 管理頁 `/admin/tags`**
- **聯絡人列表 Tag 篩選**
- **郵件範本附件**：真實檔案上傳，單檔限 2MB

---

## v0.2 — 架構重設計（已完成 2026-03-14）

### 變更項目
- **廢除 `authorized_users` 表**，改由 `users` 表統一管理
- **`users` 表**：Microsoft AAD email 為主鍵，telegram_id 綁定
- **角色系統**：`role` 欄位（member / super_admin）
- **聯絡人共享**：`contacts.created_by` → `users.id`
- **互動紀錄歸屬**：`interaction_logs.created_by` → `users.id`
- **個人設定頁 `/settings`**
- **`src/lib/graph.ts`**：Microsoft Graph API 寄信
- **寄信功能**：從聯絡人詳情頁觸發
- **使用者管理頁**：管理 `users` 表，角色切換

---

## v0.1 — 初始版本（已上線）

- Telegram Bot 掃描名片 → Gemini OCR → 存入 Supabase
- Web Dashboard：聯絡人列表、詳情、互動紀錄
- Microsoft AAD SSO 登入（限 @cancerfree.io）
- 白名單管理（authorized_users）
- 郵件範本 CRUD
