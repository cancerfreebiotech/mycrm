# CHANGELOG

## v0.9 — 報表功能（待實作）

### 變更項目
- **新增報表管理頁 `/admin/reports`**（僅 super_admin）
- **立即產生**：自由選取時間範圍，網頁呈現表格，可下載 Excel
- **定時寄送**：pg_cron + Supabase Edge Function + Gmail API（OAuth）
- **報表內容**：新增名片（Sheet 1）+ 互動紀錄（Sheet 2）
- **Gmail OAuth 一次性設定**：super admin 在頁面授權，token 存 Supabase Vault
- **排程規則**：可新增多條，支援每週/每月/自訂 cron，自由設定時間範圍與收件人
- **新增資料表**：`report_schedules`、`gmail_oauth`
- **新增環境變數**：`GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`、`GMAIL_OAUTH_REDIRECT_URI`

---


## v0.8 — 多語言支援 i18n（待實作）

### 變更項目
- **新增 `next-intl` 套件**：支援繁體中文、English、日本語
- **語言檔**：`src/messages/zh-TW.json`、`en.json`、`ja.json`，涵蓋所有 UI 文字
- **語言切換 UI**：Header 右上角加 `[🌐]` dropdown
- **語言偏好儲存**：`users.locale` 欄位 + localStorage
- **預設語言**：瀏覽器自動偵測，fallback 繁體中文
- **所有頁面 hardcode 文字替換為 i18n key**

---


## v0.7.1 — Bot 搜尋強化 + 網頁分頁（待實作）

### 變更項目
- **Bot `/search` 強化**：搜尋結果不預載互動紀錄，改為每筆附 `[📋 互動紀錄]` 按鈕，點擊後按需載入最新 5 筆，支援 `[載入更多]`
- **分頁：聯絡人列表**：每頁 20 筆，底部頁碼導覽，搜尋/篩選後重置第 1 頁
- **分頁：筆記搜尋**：每頁 20 筆
- **分頁：未歸類筆記**：每頁 20 筆
- **無限捲動：互動紀錄時間軸**：預設載入 20 筆，捲到底自動載入下一批

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
