# CHANGELOG

## v3.8.2 — fix(bot): `/p 姓名 | 公司` 超出 Telegram 64-byte callback_data 上限（2026-04-22）

Po 實測 `/p 姜至剛|衛福部食藥署` bot 無反應，但 `/p 姜至剛` 正常。追到根因：v3.8.1 把 name+company 用 JSON base64 塞進 `callback_data`，**Telegram 硬上限 64 bytes 當場爆表**（`create_p_` + base64(`{"n":"姜至剛","c":"衛福部食藥署"}`) = 65 bytes，超 1）。Telegram 直接回 400 拒收整則 inline_keyboard 訊息，bot 看起來像沒反應。

### Fix
改用 session 承載任意長度的 name / company：
- `/p 姓名 | 公司` 找不到 → `setSession(fromId, 'confirm_create_p', { name, company })`
- `callback_data` 改固定字串 `confirm_create_p` / `cancel_p`（各 17 bytes 以內，遠低於 64）
- Callback handler 優先讀 session context，若拿不到就 fallback 舊格式 `create_p_<base64>`（in-flight 舊訊息相容，24 小時後可刪）
- `cancel_p` 也記得 `clearSession` 避免 dangling state

### 改動
- `src/app/api/bot/route.ts`：`/p` 找不到段改 session 模式；callback handler 加 `confirm_create_p` 分支，保留 legacy 解析；`cancel_p` 清 session
- `package.json` 3.8.1 → 3.8.2

## v3.8.1 — fix(hunter): 回報三態 + /p 帶公司 + 編輯重試 + help 更新（2026-04-22）

v3.8.0 送出後 Po 實測：/p 戴建丞 建立後 bot 完全靜默（像沒動作）、且真實情況下 Hunter 對純中文名 + 政府單位基本查不到。本版處理三個具體 gap。

### A. Hunter 查詢結果一律回報（Telegram 不再沉默）
`enrichContactEmail` 改回傳 `{ status, email }` 六態：
- `found` — 查到並寫回
- `not_found` — 查了 Hunter 但無結果（cron 30 天後重試）
- `skipped_cjk_name` — 純 CJK 名 Hunter 參數驗證會直接 400，未送，**不記 hunter_searched_at**（未來補英文名即可重試）
- `skipped_no_company` — Hunter 沒 company 不能查，**不記**
- `skipped_no_key` — 系統未設 API key
- `error` — 網路/API 錯誤（記 searched_at、30 天重試）

三語 `enrichStatusMessage()` 把 status 翻成使用者可讀訊息。Bot `/a` / `/li` / `/p` 建立新聯絡人三處都呼叫，**不管查到沒都發一則狀態訊息**。Web 新增/批次上傳仍是 fire-and-forget（背景），編輯頁特殊情況會 alert。

### B. `/p 姓名 | 公司` 帶公司語法
Bot 新指令語法（向下相容）：
- `/p 戴建丞` — 現有行為
- `/p 戴建丞 | 經濟部` — 找不到時建立新聯絡人**同時填入公司**
- `/p 戴建丞, 經濟部` — 逗號分隔也接受

callback payload 從 `base64(name)` 改 `base64(JSON {n, c})`，callback handler 相容舊格式。bot-messages.ts 三語 help 同步更新。

### C. 編輯聯絡人自動重試
`contacts/[id]` 編輯儲存時：若 `email` 仍空 + (`company` 從空變填 OR `name_en` 從空變填)：
- 自動把 `hunter_searched_at` 設 null
- Fire `/api/hunter/enrich` 背景查
- 查到的話 alert 顯示新 email 並 reload

意味著「名片 OCR 沒抓到公司 → 事後手動編輯補公司」也能觸發 Hunter 第二次查詢。

### 改動
- `src/lib/hunter.ts`：`EnrichStatus` / `EnrichResult` 型別 + `enrichStatusMessage(r, lang)` 三語訊息；`splitName` 對 CJK-only 名直接 return empty（防 Hunter 400）
- `src/app/api/bot/route.ts`：
  - `/a` 名片存檔後 Hunter 段改 call shared helper、一律 `sendMessage(status)`
  - `/li` 大段 inline Hunter 碼 refactor 為 10 行 shared helper 呼叫
  - `/p 姓名` 加 `| 公司` 語法解析、callback payload 改 JSON
  - `create_p_*` handler 解析新 JSON 並帶 company insert
- `src/app/(dashboard)/contacts/[id]/page.tsx`：`saveEdit()` 加 Hunter 重試邏輯
- `src/app/api/hunter/enrich/route.ts`：回傳完整 `EnrichResult`
- `src/lib/bot-messages.ts` 三語：`/p` help 句更新為 `[姓名] 或 /p 姓名 | 公司`
- `src/messages/{zh-TW,en,ja}.json`：`contacts.hunterFoundEmail` toast key
- `docs/features/contacts.{md,en.md,ja.md}` 三語：Hunter 章節擴充（bot 三態訊息、編輯重試、CJK 限制說明）
- `package.json` 3.8.0 → 3.8.1

### 戴建丞現況處理
- DB 手動 reset `hunter_searched_at = null`
- 現狀 `name='戴建丞'`, `name_en=null`, `company='經濟部'`, `email=null`
- Hunter 目前仍不會查（CJK-only name）→ 建議 Po 編輯補上 `name_en`（例如「Chien-Cheng Tai」）→ 編輯儲存會自動重試
- 但政府單位 Hunter 命中率極低，實際能不能查到靠運氣

## v3.8.0 — feat(hunter): 全新建流程自動查 email + 每日 cron 清舊帳（2026-04-22）

Po 反映：原本 Hunter.io Email Finder 只有 `/li` LinkedIn 辨識時會自動查，其他新建路徑（`/a` 名片、批次上傳、手動新增、`/p 姓名` 找不到）都沒用上，舊 800 筆沒 email 的聯絡人也沒排程清理。重點是 Hunter Free tier 50/mo 但「找不到不扣 credit」，所以可以積極批次清。

### 改動
- **`src/lib/hunter.ts`（新）**：抽共用模組
  - `enrichContactEmail(contactId, nameEn, name, company)` — 單查，寫回 email + hunter_searched_at
  - `runHunterBatch({ maxContacts, cooldownDays, remainingBuffer })` — 批次查，執行前檢查 Hunter 帳號 credits，低於 buffer 就 skip
  - `getHunterAccount(apiKey)` — 讀 plan / used / available / remaining
- **新建聯絡人自動查 email 空的四條路徑**：
  - `/a` 名片 bot 流程 (`route.ts:1805`)：OCR 無 email → fire Hunter → 查到訊息通知
  - `/p 姓名` 找不到 (`route.ts:1642`)：新增「建立新聯絡人」按鈕流程 → callback `create_p_*` 建 minimal contact → 等照片 + 查 Hunter
  - 批次上傳 (`batch-upload/page.tsx:201`)：每筆 insert 後 fire-and-forget `/api/hunter/enrich`
  - 手動新增 (`contacts/new/page.tsx:353`)：submit 無 email → fire-and-forget enrich
  - `/li` 保留原 inline 邏輯不動（低風險、已經 stable）
- **`/api/hunter/enrich`（新）**：client-side 新建流程用的包裝 endpoint
- **`/api/hunter/cron`（新）**：cron route，每天 02:00 TPE/JST 跑 50 筆 backlog
  - auth 用 `Bearer CRON_SECRET`
  - credit buffer = 5（Hunter 帳號剩 < 5 searches 就 skip 這次）
  - 800 筆舊帳約 16 天清完一輪（30 天 cooldown 擋重查）
- **`vercel.json`**：加 `crons: [{ path: "/api/hunter/cron", schedule: "0 18 * * *" }]`
- **Vercel env**：新增 `CRON_SECRET`（production + development）。原 `CRON_SECRE`（拼錯 T）保留備查，可後續手動刪
- **`src/app/api/admin/hunter/route.ts`**：POST 重構為 `runHunterBatch({ maxContacts: 100 })` 一行

### 部署後要做
1. Vercel dashboard 手動補 `CRON_SECRET` 到 **Preview** 環境（CLI 對 preview all-branches 模式有限制）
2. 確認舊 `CRON_SECRE` 可以刪除後手動清掉（本次不動避免誤刪還有其他地方在讀）

## v3.7.1 — refactor(last_activity): 排除所有 SendGrid 寄送（含 ad-hoc 群發）（2026-04-21）

v3.7.0 只用 `campaign_id IS NOT NULL` 過濾，Po 指出其實**不管是否掛 campaign**，只要是 SendGrid 寄的都不該算進 last_activity（因為 SendGrid 典型用途是自動大量發送）。互動紀錄仍照常寫進 DB，只是不影響「誰跟我最近有互動」的排序訊號。

### 改動
- **DB migration `interaction_logs_send_method`**：
  - `interaction_logs` 加 `send_method text CHECK (in outlook/sendgrid/null)`
  - Backfill：既有 campaign 綁定的 log 統統標 `'sendgrid'`（過去 campaign 都是走 SG 寄的）；3827 筆個別 log 因無法回推維持 NULL
  - 部分索引 `idx_interaction_logs_contact_activity` 配合新 trigger 查詢
  - 兩個 trigger function 過濾條件從 `campaign_id IS NULL` 改為 **`send_method IS DISTINCT FROM 'sendgrid'`** — NULL 視為可計入（向下相容），`'outlook'` 可計入，`'sendgrid'` 排除
  - 全表 backfill contacts.last_activity_at
- `src/app/api/email/send/route.ts`：所有插入的 interaction_logs 帶 `send_method: method`
- `src/app/(dashboard)/contacts/[id]/page.tsx`：個別寄信 insert log 時帶 `send_method: 'outlook'`
- `src/app/(dashboard)/email/compose/page.tsx`：SendGrid 按鈕選中時顯示紫色提示「⚠ SendGrid 寄送不會計入聯絡人最後活動時間（仍會寫互動紀錄）」
- i18n 三語加 `sendgridActivityNote` key
- `package.json` 3.7.0 → 3.7.1

### 行為矩陣
| 寄送途徑 | send_method | 算 last_activity? |
|---|---|---|
| 聯絡人頁寄信（個別） | `outlook` | ✅ |
| `/email/compose` Outlook | `outlook` | ✅ |
| `/email/compose` SendGrid | `sendgrid` | ❌ |
| Newsletter campaign | `sendgrid` | ❌ |
| Bot /met /work /meet | NULL (非 email) | ✅（type=note/meeting） |

## v3.7.0 — feat(mail): 寄信附加聯絡人照片 + fix: last_activity 排除 newsletter（2026-04-21）

### 1. 寄信可附加聯絡人已上傳的照片
Po 的工作流：拍合照 → `/p` bot 上傳 → 在聯絡人頁寫感謝信 → 要附照片進去。原本只能再從本機上傳一次同樣的檔案，冗餘。

- 寄信 modal 新增「聯絡人照片」區塊（有照片才出現）
- 顯示該聯絡人所有已上傳照片的縮圖 gallery
- 點縮圖即從 Supabase Storage 抓圖、轉 base64、加到附件；再點一下移除
- 已附加狀態用藍框 + 藍色勾勾 icon 標示
- 共用 5 MB 單檔上限
- i18n 三語同步 4 個新 key

### 2. Newsletter 群發不再污染 last_activity
Po 提醒：一封 newsletter 寄給 4000+ subscribers，如果每個 contact 的 `interaction_logs` 都算活動，last_activity_at 會被洗到全部「今天」，訊號崩潰。

**Heuristic**：`interaction_logs.campaign_id IS NOT NULL` → 是 newsletter campaign 送出 → **排除**不算活動。個別 1-to-1 email（contact detail 頁、bot 等）`campaign_id` 都是 NULL 會照算。

- DB migration `last_activity_exclude_newsletter_campaigns`：兩個 trigger function 都加 `AND il.campaign_id IS NULL` 過濾；全表 backfill
- 現有 3907 筆 note/meeting/email log 中，80 筆 campaign 送出的被排除，3827 筆個別互動繼續算

### 邊界
- Ad-hoc 群發（`/email/compose` 沒綁 campaign_id）仍會算活動。使用者一次寄給 10 人通常還是想 follow up，不過度過濾。未來若要更嚴，可加 `is_bulk` 欄位或用 batch size 判斷。

### 改動
- `src/app/(dashboard)/contacts/[id]/page.tsx`：
  - `tempAttaches` shape 擴展可選 `photoId`
  - `toggleContactPhotoAttach()` handler
  - mail modal 加 "聯絡人照片" 區塊（含 hover / attached 狀態）
- `src/messages/{zh-TW,en,ja}.json`：`contactPhotos` / `attachPhoto` / `photoAttached` / `attachPhotoFailed`
- DB migration `last_activity_exclude_newsletter_campaigns`
- `package.json` 3.6.2 → 3.7.0

## v3.6.2 — refactor(contacts): last_activity 簡化 + fix: 照片上傳也算活動（2026-04-21）

v3.6.0 加了「最後活動」欄位到聯絡人列表，Po 回饋：**欄位在 UI 上多餘** — 既然預設排序就把最近有活動的人推到頂，多一欄日期反而資訊重複。而且他舉的實際場景暴露了另一個 bug：拍了三好健嗣的合照上傳後，三好沒浮到頂。

**根因**：照片上傳只寫 `contact_photos` 表，沒寫 `interaction_logs`（即使有合照附註，寫的也是 `type='system'` 被 trigger 過濾掉）。所以 `last_activity_at` 不會被 bump，照片上傳不算活動。

### 改動
- **DB migration `contact_photos_bump_last_activity`**：
  - 新 trigger `trg_contact_photos_last_activity` 監聽 `contact_photos` INSERT/DELETE，以 `GREATEST(interaction_logs MAX, contact_photos MAX, created_at)` 公式重算
  - 舊 `update_contact_last_activity()` 函式同步擴大 — 加 note/meeting/email 時不能 REGRESS 一個更晚時間的照片活動
  - Backfill 全表：把過往的照片時間戳納入既有 `last_activity_at`
  - 驗證：奥津徹 + 三好健嗣 (今天上傳照片) 都正確浮到 last_activity_at = 2026-04-21
- **UI 拿掉「最後活動」欄位**（v3.6.0 新增的）— 預設排序生效但不佔列寬
- i18n `lastActivity` key 三語皆刪（孤兒）
- `package.json` 3.6.1 → 3.6.2

### 背後模型（保留紀錄供日後調整）
`contacts.last_activity_at` 目前訊號來源：
- ✅ `interaction_logs` type IN (`note`, `meeting`, `email`)
- ✅ `contact_photos` 任何 row (INSERT/DELETE)
- ❌ `interaction_logs` type=`system`（刻意排除，避免 bot 自動產生的「名片新資料」/「合照附註」這種系統記錄污染訊號）

## v3.6.1 — feat(newsletter): 匯入過去 3 期電子報當 AI tone corpus（2026-04-21）

Po 提供 2026 年 2、3、4 月電子報（中/英/日各一份，9 個檔）作為未來 AI 撰寫新電子報的語氣參考語料庫。

### 改動
- **DB migration `newsletter_tone_samples`**：
  - `newsletter_tone_samples` 表：`language` (zh-TW/en/ja check)、`period` (YYYY-MM)、`html_content`、`plain_text` (HTML strip 後)、`title` (自動抓 h1/h2)、`source_file`
  - 索引 `(language, period DESC)` 方便按語言撈最新幾期做 few-shot
  - RLS：authenticated 可讀；寫入走 service role
- **`scripts/import-newsletter-tone-samples.mjs`**（新）：讀 `NEWSLETTER_CORPUS_DIR` 下的月份資料夾 → 偵測語言 (中/英/日 keyword) → parse period (2604 → 2026-04) → strip HTML → upsert。冪等（重跑會刪掉同 lang+period 後再 insert）

### 匯入結果（2026-04-21 執行）
| period | zh-TW | en | ja |
|---|---|---|---|
| 2026-02 | 2989 chars | **0 chars (原檔為空)** | 3046 chars |
| 2026-03 | 2742 | 4848 | 2815 |
| 2026-04 | 4402 | 8399 | 4629 |

9 筆中 8 筆有效。2026-02 英文版原始檔只有 3 bytes — Po 需要重新提供該月英文版（不影響目前使用，AI 可用另外 2 期英文做 few-shot）。

### 還沒做（下次 session）
- `/api/ai-newsletter-compose` 接入 Gemini few-shot：從 `newsletter_tone_samples` 按語言撈最新 3 期 → 注入 system prompt 當 tone reference → 用戶的 outline + 照片 → 生出符合該語氣的新電子報 section HTML
- Admin UI：`/admin/newsletter/compose` 讓 Po 輸入 outline bullets + 上傳照片 → 預覽 + 寄測試
- 仍 block 在「SendGrid CSV 匯入 subscribers」未完成

### 範圍
- `package.json` 3.6.0 → 3.6.1
- 新檔：`scripts/import-newsletter-tone-samples.mjs`
- DB migration：`newsletter_tone_samples`

## v3.6.0 — feat(contacts): 依最後活動時間排序（2026-04-21）

Po 反映有些舊聯絡人最近有新活動紀錄，但列表按 created_at 排序就藏在後面很難找。加「最後活動時間」欄位讓這些聯絡人浮到前面，保留原本「建立時間」欄供切換。

### 改動
- **DB migration `contacts_last_activity_at`**：
  - `contacts.last_activity_at timestamptz NOT NULL DEFAULT now()`
  - 部分索引 `idx_contacts_last_activity_at (last_activity_at DESC) WHERE deleted_at IS NULL`
  - Trigger `trg_update_contact_last_activity`：`interaction_logs` INSERT/UPDATE/DELETE 時，把該 contact 的 last_activity_at 重算成 `MAX(created_at) WHERE type IN ('note','meeting','email')` 或 fallback `contacts.created_at`
  - 意外遷移：UPDATE 若改變 contact_id（極罕見），新舊兩邊都會重算
  - Backfill 執行完 2374 筆聯絡人中 1568 有活動紀錄，805 無活動退回 created_at
- **API `/api/contacts/all`**：`select` 加 `last_activity_at`，預設排序改 `.order('last_activity_at', { ascending: false })`
- **UI `/contacts`**：
  - 表格加一欄「最後活動」，點 header 可排序
  - 欄位值若等於 `created_at` 顯示「—」避免資訊重複
  - 保留原「建立時間」欄
  - 預設順序依 API（活動時間 DESC）
- i18n 三語加 `lastActivity` key
- `package.json` 3.5.1 → 3.6.0

### 範圍定義（用戶確認）
- 「活動紀錄」只算 type = `note` / `meeting` / `email`（排除 `system`/`scan`）
- 無活動紀錄的聯絡人 fallback 到 `created_at`（不會永遠沉底）
- UI 加切換 = 點欄位 header 切換排序

## v3.5.1 — fix(auth): /api/me 用 email 查 + feat(mail): 單聯絡人改用 TipTap（2026-04-21）

### 1. 刪除按鈕真正原因
終於找到 Po 明明是 super_admin 卻看不到刪除按鈕的根源：**auth.users.id ≠ public.users.id**。`/api/me` 原本用 `.eq('id', user.id)` 查 public.users，auth id 和 public id 不同 UUID，查不到 row → role 回空字串 → 前端 `role === 'super_admin'` 判斷永遠 false。聯絡人詳細頁的 `currentUserRole` state 也因此從來沒被正確填進去。

修法：
- `/api/me` 改用 `.ilike('email', user.email).maybeSingle()`，加詳細註解避免下次又有人踩雷
- contact detail page 改用 `/api/me` fetch profile（而非 client-side query），canDelete 權限判斷 `super_admin OR 建立者` 救回來
- 拿掉上 commit 偷渡的「永遠顯示」fallback
- 刪除按鈕的 `ml-auto` 拿掉，回到原本 inline 位置（跟 編輯/寄信/合併 同一列）

### 2. 單聯絡人寄信 UI 統一
原本單聯絡人「寄信」modal 用 `<textarea>`，而群發郵件用 TipTapEditor，UI / 功能都差很多。把 modal body 換成 TipTapEditor，AI 生成 call `returnHtml: true` 產生 HTML 格式，套用範本時 bump editor key 讓 TipTap 重新渲染 HTML content。

### 改動
- `src/app/api/me/route.ts`：email lookup + 完整型別 + 防呆註解
- `src/app/(dashboard)/contacts/[id]/page.tsx`：
  - `load()` 改用 `/api/me`
  - 救回 `currentUserRole` state + `canDelete` 判斷
  - 刪除按鈕拿掉 `ml-auto`
  - 寄信 modal `<textarea>` → `<TipTapEditor>`
  - AI 生成加 `returnHtml: true`，範本套用 + AI 生成都 bump `mailEditorKey`
- `package.json`：3.5.0 → 3.5.1

## v3.5.0 — feat(trash): 批次永久刪除 + fix(contacts): 刪除按鈕可見性（2026-04-21）

### 1. 刪除按鈕可見性 fix
Po 回報「編輯/寄信/合併都看到，就是沒有刪除」。DB 確認 `pohan.chen@cancerfree.io` role 是 super_admin，email case 一致、RLS policy 是 `qual=true`，code 邏輯 `currentUserRole === 'super_admin' || created_by === currentUserId` 正確，但前端 role state 在某些情境下沒正確設進來（暫時無法在生產端 repro，診斷成本高）。把前端 canDelete 改成「已登入就顯示」，真正的權限檢查由 backend `DELETE /api/contacts/[id]` 把關（原本就有 super_admin OR creator check，會回 403）。改完 Po 一定看得到按鈕，不是 super_admin / creator 的人按了會 alert 錯誤 — 符合 CRM 常見做法。

另外把 client 的 profile 查詢改成 `ilike` + `maybeSingle()`，並加 error / warn log，方便以後遇到類似問題可以看 console 診斷。

### 2. 回收區批次永久刪除
`/admin/trash` 以前要一筆一筆按「永久刪除」。加：
- 表格第一欄 checkbox，header 有全選 / 取消全選（含 indeterminate 狀態）
- 選取 >0 時右上 banner 冒出「永久刪除選取 (N)」紅字按鈕
- 永遠顯示的「全部永久刪除」紅底按鈕（一鍵清空整個回收區）
- 新 API `DELETE /api/contacts/trash/bulk`，body `{ ids: [...] }` 或 `{ all: true }`，super_admin only，會一併清 Storage 名片圖，CASCADE 清 contact_cards / contact_tags / interaction_logs
- i18n 三語同步（warningBanner / selectAll / bulkDeleteSelected / deleteAll / confirmBulkDelete / confirmDeleteAll / bulkDeleteSuccess / bulkDeleteFailed）

### 改動
- `src/app/api/contacts/trash/bulk/route.ts`（新）
- `src/app/(dashboard)/admin/trash/page.tsx`：多選狀態、bulk handler、checkbox 欄、bulk action banner
- `src/app/(dashboard)/contacts/[id]/page.tsx`：canDelete 放寬 + profile 查詢 robustness
- `src/messages/{zh-TW,en,ja}.json`：trash namespace 加 8 個 key
- `package.json`：3.4.0 → 3.5.0

## v3.4.0 — feat(bot): Portkey gateway 容錯 Gemini 503（2026-04-21）

Telegram bot 最近在 Google AI Studio 免費 tier 碰到 503（Gemini 被降低優先級）。原本的 `withGeminiRetry` 只做「1 次重試、固定等 3 秒」，救不回大部分失敗。引入 [Portkey](https://portkey.ai) AI Gateway 代理 Gemini，取得 **loadbalance 兩把 Gemini project key + 3 次指數退避重試（1 → 2 → 4 秒）** 加集中觀測能力。兩把 key 50/50 隨機分流，單一 project 壓力減半，大幅降低觸發 free-tier priority degradation 的機率；策略定義在 Portkey Config，可從 dashboard 即時調整而不需 redeploy。

### 改動
- `src/lib/gemini.ts`：
  - 新增 `portkey-ai` 依賴，以 OpenAI-compatible chat completions API 包 Gemini 呼叫
  - 以 `config: process.env.PORTKEY_CONFIG_ID` 指向 Portkey dashboard 上的 config（loadbalance + retry 在那邊定義；virtual key 也在那邊存放 Google AI keys）
  - 遷移：`analyzeBusinessCard` / `parseTaskCommand` / `parseMeetingCommand` / `parseMetCommand` / `parseVisitNote`
  - 新增 `parseLinkedInScreenshot()` — 把 bot route 原本 inline 的 LinkedIn OCR 邏輯收攏
  - 移除 `withGeminiRetry()`（Portkey 已做更完整的重試）
  - `generateEmailContent` 保留原 `@google/generative-ai`（`safety_settings` BLOCK_NONE 不透過 Portkey 無法乾淨透傳；且該函式只由 web `/api/ai-email` 呼叫，不在本階段範圍）
- `src/app/api/bot/route.ts`：
  - 4 處 `withGeminiRetry(() => ..., onFirstFailure)` 改為直接呼叫 parseXxx / analyzeBusinessCard
  - `/li` LinkedIn 路徑 40 行 inline 程式碼換成一行 `parseLinkedInScreenshot(...)`
- `.env.local.example`：新增 `PORTKEY_API_KEY` 與 `PORTKEY_CONFIG_ID`
- `package.json`：3.3.9 → 3.4.0，加 `portkey-ai`

### 範圍（刻意限縮）
- ✅ Bot 指令全受保護：`/a` 名片、`/li` LinkedIn、`/work` 任務、`/meet` 會議、`/met` 拜訪筆記（含 visit note parse）、teams-bot 的會議解析
- ✅ 副作用：`/api/ocr`、`/api/ai-format`、`/api/linkedin/parse` 因共用 `gemini.ts` 自動受惠
- ❌ 不升級 Gemini 付費 tier、不換模型、不動 `failed_scans` retry queue — 留作後續 iteration

### 部署前需手動做
1. 到 https://app.portkey.ai，用 2 把 Gemini project API key 建 2 個 Virtual Keys
2. 建一個 loadbalance Config 指向兩個 VK（weight 0.5 / 0.5、retry on 429/5xx）
3. 把 Portkey API key 與 Config ID 填進 Vercel env vars（production / preview / development 三環境）
4. `GEMINI_API_KEY` 仍保留（`generateEmailContent` 走原生 SDK 還需要它）

### 不影響
- DB schema 無變更
- `ai_models` / `ai_endpoints` 使用者自訂 key 機制維持
- 影像處理（`imageProcessor.ts`）維持 1024×1024 JPEG q85
- 使用者介面訊息維持「🔍 辨識中...」，Portkey 重試期間靜默（7 秒內完成）

## v3.3.9 — Chore: newsletter wizard step 4 簡化（2026-04-21）

SendGrid API 寄信時會自己做 rate limiting，`daily_limit` / `send_hour` 這兩個欄位只是假的節流、沒有實際意義（使用者也跟我確認過）。把兩個 input 與相關「N 天完成」計算統統拿掉，step 4 只剩「排程寄送時間（留空 = 立即寄送）」一欄。

### 改動
- `src/app/(dashboard)/admin/newsletter/page.tsx`：
  - 刪 `dailyLimit` / `sendHour` 狀態、UI 輸入、`estimateDays()` 工具函式、schedule summary 區塊
  - `duplicateCampaign` / `campaignPayload` 不再帶 `daily_limit` / `send_hour`（DB column 還在，有 default 值 500 / 9，不影響既有資料）
  - step 4 現在只剩 datetime-local 一欄 + 說明
- `src/messages/{zh-TW,en,ja}.json`：刪 5 個 keys（`dailyLimit` / `sendHour` / `scheduleSummary` / `estimatedCompletionDate` / `daysToComplete`）、加 2 個（`scheduleHintImmediate` / `sendSummary`）、改 `startTime` 措辭
- `package.json`：3.3.8 → 3.3.9

### 不影響
- DB schema 不變（`newsletter_campaigns.daily_limit` / `send_hour` 保留不 drop；之後再遷移時再拆）
- 寄送 API（`/api/email/send`）本來就沒吃這兩個欄位
- 既有 campaign 的 `daily_limit` / `send_hour` 值保留（UI 不顯示而已）

## v3.3.8 — Refactor: 自動產生的 note 改用 `type='system'`（2026-04-21）

架構債清理。`/notes` 原本靠 6 條 `.not('content', 'ilike', '<prefix>%')` 把系統筆記擋掉，每新加一個 prefix 就要兩邊同步，容易漏（像昨天的 `【名片新資料】` 就是被漏掉的受害者）。

### 改動
- **7 處寫入點**從 `type: 'note'` 改 `type: 'system'`：
  - `src/app/api/bot/route.ts:524, 581, 1830`（bot 拍名片 / 合照附註 / 新增名片）
  - `src/app/(dashboard)/contacts/batch-upload/page.tsx:207`（批次上傳）
  - `src/app/(dashboard)/contacts/new/page.tsx:354`（手動新增）
  - `src/app/(dashboard)/contacts/[id]/page.tsx:630, 735`（名片更新 / 合照附註）
- **DB migration**：把既有 339 筆 `type='note'` 的系統筆記改成 `type='system'`（三語 prefix 全覆蓋）
  - before: meeting=3140, system=1382, email=726, note=371
  - after:  meeting=3140, system=1721, email=726, **note=32**（剩下的 32 筆就是真正的使用者筆記）
- **`/notes/page.tsx`**：刪掉 6 條 `.not('content', 'ilike', ...)`、改用單一 `.neq('type', 'system')`

### 不影響
- `/contacts/[id]` 詳情頁的互動時間軸依然顯示所有類型（含 system），使用者看得到「這人何時被匯入 / 合併」的歷史
- `admin/reports` 不依 type='note' 計數（grep 確認過）

### 動到的檔
- `src/app/api/bot/route.ts`
- `src/app/(dashboard)/contacts/batch-upload/page.tsx`
- `src/app/(dashboard)/contacts/new/page.tsx`
- `src/app/(dashboard)/contacts/[id]/page.tsx`
- `src/app/(dashboard)/notes/page.tsx`
- DB migration: `migrate_auto_notes_to_system_type`
- `package.json`：3.3.7 → 3.3.8

## v3.3.7 — Fix: 筆記搜尋漏掉兩個系統自動筆記的過濾（2026-04-20）

使用者反饋：`/notes` 類別選「筆記」時，會看到 `【名片新資料】...` 這種系統自動產生的資料。

原因：`notes/page.tsx` 的 DB filter 清單有列其他 4 條（Telegram bot / 名片王匯入 / 批次上傳 / 名片王合併），但漏掉 Telegram bot 的這兩條：
- `【名片新資料】...`（拍名片時）
- `【合照附註】...`（合照附註時）

修正：補上兩條 `.not('content', 'ilike', ...)`。

### 動到的檔
- `src/app/(dashboard)/notes/page.tsx`：filter 清單加 2 條
- `package.json`：3.3.6 → 3.3.7

### 後續架構債（非本次範圍）
自動產生的 note 分散在 7 處、只能靠字串 prefix 濾掉；理想做法是加 `subtype` 欄位或統一用 `type='system'`。現階段維持字串比對。

## v3.3.6 — Fix: 測試寄信沒附附件（2026-04-20）

使用者反饋：「我測試信件時候附件好像不會 attached。」

原因：`/api/email/test-send` 完全沒寫附件處理邏輯，`handleTestSend()` 也只用 JSON 送請求、沒帶附件檔。群發 (`/api/email/send`) 的 multipart/form-data 流程沒複製到測試寄信這邊。

修正：
- `/api/email/test-send` 比照群發 route 加 `multipart/form-data` 處理：讀 FormData、把 files 轉 base64、Outlook 送 Graph API 的 `attachments`、SendGrid 送 `attachments` 陣列
- `handleTestSend()` 有附件時改用 FormData 送，沒有就沿用 JSON

### 動到的檔
- `src/app/api/email/test-send/route.ts`：加 `FileAttachment` / `TestSendBody` types、multipart 解析、Outlook + SendGrid 附件傳遞
- `src/app/(dashboard)/email/compose/page.tsx`：`handleTestSend` 附件時改走 FormData
- `package.json`：3.3.5 → 3.3.6

## v3.3.5 — Feat: Outlook TO/BCC 可選；修正 BCC 寄信數錯字（2026-04-20）

兩個相關修正（`/email/compose`）：

### 1. Outlook 加 TO/BCC 選擇
- 原本 Outlook 群發鎖死 BCC：寄件人自己在 TO、所有收件人放 BCC，互相看不到。
- 新增 sub-mode toggle（跟 SendGrid 的做法對齊）：
  - **BCC**（預設，現有行為）：1 封郵件，收件人互相看不到
  - **全部 TO**：1 封郵件，所有收件人在 TO，互相看得到（內部介紹 / 小組討論情境）
- 後端 `/api/email/send` 接 `outlookMode: 'bcc' | 'to'`，Graph API 的 to/bcc 欄位依此切換。

### 2. 修正成功訊息錯字
原本訊息「已成功寄出 {N} 封」誤導：Outlook BCC 與 SendGrid BCC 都是 **1 封**郵件寄到 N 位聯絡人，不是 N 封。改成語意正確：

| 模式 | 訊息 |
|---|---|
| Outlook BCC | 1 封郵件送達 N 位聯絡人（BCC，互相看不到） |
| Outlook TO | 1 封郵件送達 N 位聯絡人（全部 TO，共同可見） |
| SendGrid BCC | 1 封郵件送達 N 位聯絡人（SendGrid BCC） |
| SendGrid 個人化 | 已寄出 N 封個人化郵件（每人一封） |

寄件確認信（SendGrid）的統計句也跟著調整。

### 動到的檔
- `src/app/api/email/send/route.ts`：加 `outlookMode`、回傳 `emailCount`/`mode`、`buildConfirmationHtml` 接 `mode` 參數
- `src/app/(dashboard)/email/compose/page.tsx`：UI toggle、請求帶 `outlookMode`、成功訊息依模式切換 key
- `src/messages/{zh-TW,en,ja}.json`：新增 9 個 keys（3 語言同步）
- `package.json`：3.3.4 → 3.3.5

## v3.3.4 — Fix: TipTap 段落間空行在預覽 / 寄出時被 margin collapse 吃掉（2026-04-20）

使用者反饋：寫信時段落間空一行，預覽時空行不見。

原因：TipTap 對「連按兩次 Enter」產生 `<p></p>` 空段落。HTML 瀏覽器的 margin collapse 會讓相鄰 `<p>` 的上下 margin 合併，空 `<p></p>` 本身沒內容也沒 line-height → 視覺上完全消失，不管幾個空行都一樣。

修正：`TipTapEditor` 對輸出內容和 preview HTML 做一次 `<p></p>` → `<p>&nbsp;</p>` 轉換，讓空段落保留 line-height。三個使用此元件的頁面（`/admin/templates` / `/email/compose` / `/admin/newsletter`）全部受惠。收件端（Gmail/Outlook）也會正常顯示空行，不再被壓扁。

### 動到的檔
- `src/components/TipTapEditor.tsx`：加 `preserveBlankParagraphs()` helper，`onUpdate` 與 `previewHtml` 各套一次
- `package.json`：3.3.3 → 3.3.4

## v3.3.3 — Fix: 郵件範本頁手機可看、內文就地展開、編輯器升級 TipTap（2026-04-20）

三點使用者反饋修正（`/admin/templates`）：

1. **手機看不到內文** — 原本只有桌面 `<table>`，手機上欄位擠成一團看不清楚。改成響應式卡片列表，手機/桌面共用一套版面。
2. **網頁版要看內文要按編輯** — 列表無內文預覽，必須開啟 modal。改為點範本標題列展開，內文就地 render。
3. **範本編輯器比群發陽春** — 原本 `<textarea rows={8}>`，純文字、無工具列。改用跟 `/email/compose` 共用的 `<TipTapEditor>`：粗體/斜體/清單/連結/圖片/變數 `{{name}}` 等、附預覽模式與 AI 排版。

### 動到的檔
- `src/app/(dashboard)/admin/templates/page.tsx`：table → 可展開卡片、textarea → TipTapEditor、新增 `expandedId` state
- `package.json`：3.3.2 → 3.3.3

### 不用動
- i18n：新增的 UI 只靠 icon + 既有 keys（`common.edit`/`common.delete`、`templates.attachCount`），無新翻譯需求
- TipTapEditor 本身：沿用同一元件，不改它的實作

## v3.3.2 — Fix: 聯絡人照片刪除、手機多選寄信（2026-04-20）

### 🐛 Bug #1：聯絡人照片刪不掉
`contacts/[id]/page.tsx:deletePhoto` 不檢查 Supabase delete error，失敗時靜默吞掉；且 storage 檔案沒一起刪，留垃圾。

修正：
- 加 error 檢查 + 失敗時 alert
- 刪 DB 後順手 `supabase.storage.from('cards').remove([storage_path])` 清理檔案
- `ContactPhoto` interface 加 `storage_path`
- `load()` 查詢把 `storage_path` 一起 select 回來

### 🐛 Bug #2：手機版無法多選聯絡人寄信
`contacts/page.tsx` 桌面版 table（L666）有 checkbox，但 `sm:hidden` 的手機卡片版**完全沒 checkbox**，所以手機上無法選取多人。`selectedIds` 永遠空 → 「寄信給 N 人」按鈕不出現。

修正：
- 手機卡片加上選取 checkbox（每張左側）
- 手機清單頂部加「全選 / 已選 N 人」bar
- 選取狀態用琥珀色 border 高亮（和桌面版 `bg-amber-50` 呼應）
- 新增 i18n keys：`contacts.selectAll`、`contacts.selectedCount`

選完後畫面頂部原有的「寄信給 N 人」+「批次編輯」按鈕會自動出現（已在 header，不分桌機手機）。

## v3.3.1 — 放寬 users 表 SELECT（保留 OAuth token 防護）（2026-04-20）

### 動機
v3.3.0 把 `public.users` 設成全操作限 super_admin，結果**非 super_admin 使用者**在 `/contacts`、`/contacts/[id]`、`/admin/trash` 等頁面看「建立者 / 刪除者」欄時全部空白（因為 Supabase join `users(display_name)` 被 RLS 擋）。

### 變更
- **RLS policy 改為 per-op**：
  - `users_select` — authenticated 全員可讀（UX 修好）
  - `users_insert / users_update / users_delete` — 仍限 `is_super_admin()`
- **Column-level privilege**：
  - authenticated 可 SELECT 15 個欄位：`id / email / display_name / role / granted_features / last_login_at / created_at / telegram_id / teams_user_id / teams_conversation_id / teams_service_url / locale / theme / ai_model_id / gemini_model`
  - `provider_token` + `provider_refresh_token` 不 grant → **這兩個欄位只有 service_role 讀得到**（它們是活的 Microsoft Graph OAuth bearer token，員工讀到會能盜用同事身份寄 email）

### 驗證
- 已執行 `SELECT column_name FROM information_schema.column_privileges WHERE grantee='authenticated'` 確認 `provider_token` / `provider_refresh_token` 不在 grant 清單
- Supabase Security Advisor 無新問題

### Tradeoff
- `role` 和 `granted_features` 對所有員工公開 — 不是安全問題（大家知道誰是 super_admin、誰有 bulk_email 權限對內部工具無害）
- 寫入仍只有 super_admin（等於「誰能改 role」這件事本身是 super_admin 的特權，與 v3.3.0 一致）

## v3.3.0 — RLS 全面部署 + 安全硬化（2026-04-20）

Supabase Security Advisor 從 **18 ERRORS + 23 WARN = 41 問題** → **0 ERROR + 15 WARN**。

### 設計原則

共享 CRM：「登入 = 可信員工，全員看得到所有聯絡人」。管理權限沿用現有 `users.granted_features` 陣列（12 個 feature）+ `role='super_admin'`。

### Migration（已 apply 到 Supabase myCRM project via MCP）

**1. Helper functions**
- `has_feature(feature_key text) → bool`：super_admin 自動全有 / 否則檢查 `granted_features @> ARRAY[key]`
- `is_super_admin() → bool`：以 JWT email 查 `public.users.role`

**2. ai_endpoints：api_key 欄位限 service_role**
- RLS + column privilege 雙層防護
- `REVOKE SELECT ON ai_endpoints FROM anon, authenticated` + `GRANT SELECT (id, name, base_url, is_active) TO authenticated`
- 寫入 policy 限 `is_super_admin()`
- **結果**：即使員工登入也看不到 Gemini API key；只有 service role（API routes）能讀

**3. Tier 0 — 核心共享（11 張表 RLS + authenticated 全員讀寫）**
`contacts`、`contact_tags`、`contact_cards`、`contact_photos`、`interaction_logs`、`pending_contacts`、`gemini_models`（讀）、`ai_models`（讀）
- 例外：`contacts` 的 `DELETE`（永久刪除）需 `has_feature('trash')`
- `gemini_models` / `ai_models` 的**寫入**限 `is_super_admin()`

**4. Tier 1 — Feature-gated writes（15 張表）**
| Table | Feature gate |
|---|---|
| `tags` | `tags` |
| `countries` | `countries` |
| `email_templates`, `template_attachments` | `email_templates` |
| `prompts` | `prompts` |
| `camcard_pending` | `camcard` |
| `duplicate_pairs` | `duplicates` |
| `failed_scans` | `failed_scans` |
| Newsletter 一家 7 張表 | `newsletter` |

**5. Tier 2 — super_admin only**
- `users`：全部操作限 super_admin（讀/寫都是）。**注意**：非 super_admin 使用者看不到其他人的 display_name，未來可能要引入 view 或 API route 補 UX
- `system_settings`、`docs_content`、`medical_departments`：讀全員、寫 super_admin

**6. Tier 3 — user-scoped**
- `user_prompts`：`user_id = 目前使用者的 users.id`
- `feedback`：自己看自己的 + super_admin 看全部；UPDATE/DELETE 限 super_admin

**7. Service-role-only（無 policy）**
- `bot_sessions`、`telegram_dedup`：RLS 開啟但無 policy → 只走 service_role（Telegram webhook）

**8. Function search_path 硬化（14 個 function）**
`ALTER FUNCTION ... SET search_path = public, pg_temp`

**9. Storage bucket policies**
- 移除舊的 `Public read cards`（允許 LIST all files）和偽裝成 service-role 的 `Service role upload cards`
- `cards` / `camcard` / `template-attachments`：authenticated 可 INSERT/UPDATE/DELETE；SELECT 不需 policy（bucket `public=true` 直接 URL 可讀）
- `feedback` bucket：保留既有 "auth users can upload own feedback screenshots" INSERT policy，新增 authenticated DELETE

**SQL 檔**：`supabase/rls_security.sql`（consolidated）

### 剩下的 15 個 warnings（都是設計使然）

- 8 × `rls_policy_always_true`：核心共享 table 的 `USING(true)`／`WITH CHECK(true)` — 這就是共享 CRM 設計
- 2 × `rls_enabled_no_policy`：`bot_sessions` / `telegram_dedup` 刻意只給 service_role
- 3 × `extension_in_public`：`pg_trgm` / `pg_net` / `citext` — 移動風險高，不動
- 1 × `auth_leaked_password_protection`：需手動到 Dashboard → Authentication → 打開 "Prevent sign-ups with compromised passwords"
- 1 × bot-related infos（RLS 開啟無 policy）

### ⚠️ 手動動作（user 需做）

1. 到 Supabase Dashboard → Authentication → Policies → 打開 **"Prevent sign-ups with compromised passwords"**
2. **關注**：非 super_admin 使用者在 `/contacts` 等頁面看聯絡人時，「建立者」欄可能變空白（因為 `users` 表限 super_admin）。如果要修，之後可加一個 `users_public` view 或 API route

## v3.2.3 — TypeScript 錯誤清零（40 → 0，含 3 個真 bug 修正）（2026-04-20）

### 🔴 修到的真 bug（都是 TS 告狀才發現的）

- **`bot/route.ts:1191`** — `/lang` 指令用了 `from`（undefined），應該是 `fromId`。實際執行會拋 ReferenceError，使用者切語言會失敗。
- **`bot/route.ts:1295, 1326`** — `generateEmailContent()` 回 `{ text, subject? }`，但程式把整個 object 當 HTML 存：`body_html: body` 變 `[object Object]`。Bot 的 AI 郵件預覽 + 送出都拿錯內容。
- **`reset-mfa/route.ts:49-50`** — `service.auth.admin.mfa.listFactors()` 回的是 `{ factors: Factor[] }`，程式當成 `{ totp: [], phone: [] }` 存取，`allFactors` 永遠空，reset MFA 永遠回報 `deleted: 0`。

### 其他修正

- **`tsconfig.json`**：`target` 從 ES2017 → ES2020；`exclude` 加入 `supabase/functions/**/*`（Deno 邊緣函式，不該被 Node TS 編譯）→ 一次消掉 21 個 Deno 相關假錯誤
- **`src/types/heic-convert.d.ts`**（新檔）：補缺失的模組宣告
- **`admin/prompts/page.tsx`**：`PROMPT_USER_EDITABLE` Record 補上 `meeting_parse: false`
- **`bot/route.ts:773`**：`cardData.rotation && cardData.rotation !== 0` → `cardData.rotation`（truthy 檢查已排除 0，`!== 0` 多餘）
- **`hunter/route.ts:163`**：`.select('id', { count: 'exact', head: true })` 在 update query 不支援，改成 `.select('id')` + `data.length`
- **TipTap v3 遷移**（`TipTapEditor.tsx`）：
  - `setContent(html, true)` → `setContent(html, { emitUpdate: true })` × 2
  - `extendMarkToLink({ href: '' }).unsetLink()` → `extendMarkRange('link').unsetLink()`
- **Supabase relation 型別轉換**（7 處）：`as X` → `as unknown as X`（supabase-js 推論 relation 為陣列，程式當 1:1 物件用）
  - `admin/newsletter/page.tsx:661`、`admin/trash/page.tsx:116`、`notes/page.tsx:88`
  - `bot/route.ts:170, 645`、`linkedin/parse/route.ts:56`、`lib/gemini.ts:62`

### 結果
- `npx tsc --noEmit` → **0 errors**
- i18n audit 仍然乾淨（只有 6 個 DB filter literal 刻意保留）

## v3.2.2 — 完成 i18n 遷移尾巴 11 個檔案（2026-04-20）

### 變更項目
- 剩下 11 個檔案的 hardcode 中文全部改用 `t()`：
  - `admin/reports/page.tsx`：tag/country filter、互動類型、時間/地點表頭
  - `contacts/batch-upload/page.tsx`：OCR 失敗 / 處理失敗 / `legacyCardFront` / `cardAlt`
  - `notes/page.tsx`：跳至 placeholder（4 個 `.ilike()` DB filter literals 保留並加 `// i18n:` 註記）
  - `admin/models/page.tsx`：4 個 placeholder（endpoint / API key / model id / model name）
  - `admin/users/page.tsx`：MFA 重設 confirm / alert / 「已設定」「未設定」「重設中...」「重設」
  - `tasks/page.tsx`：指派時間 / 指派人 title
  - `PermissionGate.tsx`：沒有權限 / 請聯絡管理員
  - `email/compose/page.tsx`：「我」label
  - `feedback/page.tsx`：上傳截圖 button
  - `unassigned-notes/page.tsx`：（空白）fallback
  - `layout.tsx`：Next.js metadata 改用 `generateMetadata` async function + `getTranslations('app')`
- 使用既有的 key（`scripts/add-final-keys.mjs` 昨晚已 seed）
- Three-language key count: **1105 / 1105 / 1105**，sync diff = 0

### 最終結果
Audit 顯示剩 6 行，全是**刻意 SKIP**的 DB filter literals（`.includes('新增名片')` / `.ilike('%透過 Telegram Bot 新增名片%')` 等）— 這些字串由 bot / batch-upload / camcard 寫入 DB 當 log 內容，UI 篩選這些 log 時需 literal 比對，不能改。都附上 `// i18n: ...` 註解說明原因。

真實 i18n 違規：**0**

### Remote trigger 關閉
昨晚建的 `mycrm-i18n-nightly`（`trig_01GfPK42u2uhprqGa5jmnbqd`）在 02:13 JST 觸發但沒 push（推測 remote agent 缺 GitHub push token）。已 disable trigger 避免日後空轉。Lesson: 需 write-back 的工作不適合 remote scheduled trigger，本地 `/loop` 或手動執行較可靠。

## v3.2.1 — Newsletter migration + skeleton templates 已部署（2026-04-20）

### 變更項目
- **已 apply**：`supabase/newsletter_subscribers.sql` 的 migration 已透過 Supabase MCP 執行到 myCRM 專案
  - 3 張表建好：`newsletter_subscribers`（0 rows）、`newsletter_lists`（4 rows seeded）、`newsletter_subscriber_lists`（0 rows）
  - `link_subscriber_to_contact` trigger 上線
  - RLS 啟用（authenticated read / service_role write）
  - citext extension 啟用
- **已 insert**：3 份 newsletter skeleton 模板已寫入 `email_templates` 表
  - `Newsletter Skeleton — 中文月報`（5879 bytes）
  - `Newsletter Skeleton — English`（5402 bytes）
  - `Newsletter Skeleton — 日本語`（5405 bytes）
- **Advisor fix**：`link_subscriber_to_contact` 函式加上 `SET search_path = public, pg_temp` 防止 function_search_path_mutable 警告
- SQL 檔同步更新，下次 re-run idempotent

### 已部署驗收
```
newsletter_subscribers  → 0 rows（等 CSV 匯入）
newsletter_lists        → 4 rows（zh-TW/en/ja/zh-TW-marketing）
email_templates (skel)  → 3 rows
```

### 下一步（等 user 提供資料或決策後才動）
- 跑 `scripts/import-newsletter-subscribers.mjs` 匯入 4 份 CSV
- 建 `/admin/newsletter/compose` UI
- 實作 AI tone-aware compose（等 user 提供歷史電子報 corpus）
- 改 newsletter wizard：`tag_ids` → `list_ids`
- 建 `/admin/newsletter/unlinked` 報表頁

## v3.2.0 — Newsletter subscriber schema + import 腳本鋪底（2026-04-20）

### 變更項目
- `supabase/newsletter_subscribers.sql`：新增 3 張表 + trigger，可手動在 Supabase Dashboard SQL Editor 執行
  - `newsletter_subscribers`（獨立於 contacts 的訂閱戶池）
  - `newsletter_lists`（群組；預先 seed 4 個：`zh-TW / en / ja / zh-TW-marketing`）
  - `newsletter_subscriber_lists`（M:N junction，處理 email overlap）
  - 自動 link trigger：contact email 變更時，同 email 的 subscriber 會自動 link `contact_id`
  - Backfill query：對已有 contacts 和 subscribers 做一次性 link
  - citext extension（case-insensitive email）
  - RLS 啟用：authenticated 可讀、service_role 可寫（管理寫入走 API route）
- `scripts/import-newsletter-templates.mjs`：把 `docs/newsletter-templates/` 三份 skeleton 塞進 `email_templates`（冪等 upsert by title）
- `scripts/import-newsletter-subscribers.mjs`：SendGrid CSV → subscribers。支援多個 CSV → 多個 list 對應；同 email 出現在多份 CSV 會被合併成同一 subscriber 並掛到多個 list。column alias 可調整（預設認 `email / first_name / last_name` 各種拼寫）

### 還沒做（要等資料或決策）
- 執行 SQL migration（需要 Supabase 權限 + user review）
- 執行 template import 腳本（需要 service role env var 或 user 手動跑）
- 執行 CSV import（等 user 提供 4 份 CSV 路徑 + 確認欄位名稱）
- `/api/ai-newsletter-compose` endpoint（等 user 提供歷史電子報作為 tone corpus）
- 新增 `/admin/newsletter/unlinked` 管理頁面（未 link subscribers 清單）
- `newsletter_campaigns` 改用 `list_ids` 取代 `tag_ids`

## v3.1.0 — 查重規則升級 (A+B+E+F) + API 統一化（2026-04-20）

### 變更項目
- **規則 A**：`email` 比對改為 case-insensitive（`John@X.com` 跟 `john@x.com` 視為同一）
- **規則 B**：同步比對 `second_email`（主要 email 沒重複時，第二 email 也查）
- **規則 E**：`find_similar_contacts` 也跑在 `name_en` 上（英文名片能找到中文版聯絡人）
- **規則 F**：同樣跑在 `name_local` 上（日文名片亦然）
- **API 統一**：新增 `POST /api/contacts/check-duplicates` 伺服端端點；`contacts/new/page.tsx` 和 `contacts/batch-upload/page.tsx` 原本各自直接呼叫 `supabase.rpc()`，現在全部改走 API — 規則寫在 `src/lib/duplicate.ts` 單一位置，不會再出現 client-side 跟 server-side 行為不同步的問題
- **Telegram Bot**（`src/app/api/bot/route.ts:805`）原本就用 shared helper，更新參數簽章傳入所有 5 個欄位（email/second_email/name/name_en/name_local）
- **回傳結構**：`DuplicateResult.exact` 改為 `Contact[]`（原本是 `Contact | null`，因現在可能同時 match 主 email 與 second_email）

### 未採用（user 2026-04-19 決定）
- C（LinkedIn URL exact）、D（電話 normalize）、G（email domain + similar name）、H（門檻降 0.5）、I（同 company + similar name）— 誤判風險太高或收益有限

### 技術細節
- `lib/duplicate.ts` 的 `.ilike()` 呼叫會 escape `%/_/\\` wildcards，避免 email 內含特殊字元造成 pattern bypass
- 同一個聯絡人若同時符合 exact 和 similar，只回傳在 exact（不重複）

## v3.0.0 — Newsletter 模板骨架化：從 listmonk 重建為 mycrm 三語骨架（2026-04-19）

### 變更項目
- 新增 `docs/newsletter-templates/` 目錄收納月報骨架
- `skeleton-zh-TW.html`、`skeleton-en.html`、`skeleton-ja.html`：三語月報骨架，與原 listmonk 版本視覺一致（teal `#0D9488`、600px 容器、Helvetica Neue），但用 `{{placeholder}}` 取代所有可變欄位（logo / month / substack / intro / upcoming / recap / 社群連結 / opt-out URL）
- `block-section.html`：單一 section 區塊範本，每個 story 複製一份填空（`{{number}}｜{{title}}`、paragraphs、link、image）
- `README.md`：完整 placeholder 字典 + 後續規劃（AI compose endpoint、Supabase Storage 圖片搬家、template import 腳本）
- 骨架擺脫 listmonk 和 mailerlite 的 CDN 依賴（圖片 URL 全都是 placeholder），為後續自主運作鋪路

### 後續（待實作，已記入 project memory）
- 實作 `/api/ai-newsletter-compose`（吃 stories + photos → 填骨架）
- `newsletter_subscribers` + `newsletter_lists` schema + CSV 匯入 + 未 link 訂閱戶報表
- 三語骨架寫入 `email_templates` 資料表

## v2.17.0 — i18n 大規模遷移 + CLAUDE.md 整合 flightpath 規範（2026-04-19）

### 變更項目
- **i18n 遷移**：將 13 個頁面從 hardcode 繁中改為 `next-intl` `t()` 呼叫
  - contacts/[id]、admin/newsletter、admin/camcard、admin/trash
  - contacts/new、email/campaigns/[id]、settings、admin/health
  - contacts/page、TipTapEditor、docs、admin/countries、email-optout Suspense fallback
- 三語 JSON（zh-TW/en/ja）同步新增 334 keys（768 → 1102），en/ja 翻譯已寫入
- 跳過項：DB 字串比對（`.includes('新增名片')` 等）、公開頁自帶 3 語 dict（email-optout、unsubscribe、docs）
- 新增輔助腳本（`scripts/`）：`audit-i18n-darkmode.mjs` 盤點、`extract-zh.mjs` 單檔提取、`add-*-keys.mjs` 批次加入 key
- **CLAUDE.md 整合**：從 flightpath 整合 Behavioral Guidelines、Dark mode 強制、Mobile-first、i18n 三語同步、MFA 強制、RLS、Conventional Commits、效能標準、Vitest/Playwright 測試等章節；移除 DrAva Bot Engine、pnpm 禁令、`{ success, data }` API 格式等不適用 myCRM 的規定

## v2.9.0 — Email 編輯器強化：模板、變數、預覽（2026-04-16）

### 變更項目
- 新增模板選擇器：從 email_templates 載入已存模板，一鍵套用主旨 + 內文
- 新增個人化變數：內文和主旨支援 `{{name}}`、`{{company}}`、`{{job_title}}`，SendGrid 路徑自動替換每位收件人資料
- Outlook BCC 模式使用變數時顯示警告（BCC 無法個人化）
- 新增預覽模式：可選擇模擬收件人，即時看到變數替換後的效果
- 主旨 placeholder 提示可用變數

## v2.8.4 — Microsoft OAuth scope 修正（2026-04-15）

### 變更項目
- 修正 Microsoft token refresh 缺少 `openid` scope 導致寄信失敗

## v2.8.3 — 寄送方式可選 + AI 潤稿修正（2026-04-15）

### 變更項目
- Outlook / SendGrid 寄送方式改為使用者可選（預設仍按人數自動建議）
- 超過 450 人選 Outlook 時顯示警告提示
- AI 潤稿改送純文字（去除 HTML 標籤），避免 Gemini PROHIBITED_CONTENT 錯誤

## v2.8.2 — BCC 修正 + AI 潤稿簡化（2026-04-15）

### 變更項目
- 修正 Outlook 路徑：所有聯絡人放 BCC，To 放寄件人自己（原本第一位聯絡人被放在 To 會被其他人看到）
- AI 潤稿簡化：移除額外描述框，直接一鍵抓內文潤飾成正式郵件
- Gemini 安全過濾器設為 BLOCK_NONE，避免商業郵件被誤擋

## v2.8.1 — 群發郵件 BCC 編輯、AI 撰寫、CC 多 email（2026-04-15）

### 變更項目
- BCC 收件人可展開編輯：點「展開編輯」可檢視所有收件人，點 X 可移除
- CC 欄位支援多個 email（逗號分隔），CC 不建立互動紀錄
- 新增「AI 撰寫」按鈕：可用自然語言描述信件內容，AI 生成郵件（可基於已有內文修改）
- 若主旨為空，AI 會一併生成主旨

## v2.8.0 — 群發郵件功能 + Tag 篩選排序改進（2026-04-15）

### 變更項目
- 新增群發郵件功能：聯絡人頁面篩選後可一鍵寄信，< 450 人走 Outlook Graph API（BCC），>= 450 人走 SendGrid（personalizations 逐封寄出）
- 新增 `/email/compose` 撰寫頁面：BCC 收件人摘要、CC 欄位（預設自己 email）、主旨、TipTap 富文字編輯器
- 新增 `/api/email/send` API：自動判斷 Outlook/SendGrid 路徑，寄完為每位聯絡人建立 email 類型互動紀錄
- Tag 篩選邏輯改為 OR（選多個 tag 時，符合任一即顯示）
- Tags 欄位新增排序功能（點擊 header 可按 tag name 排序）

## v2.7.2 — SendGrid 匯入寫入互動紀錄（2026-04-14）

### 變更項目
- import-suppressions API 重寫：分頁取全部（突破 500 筆限制）、限最近 90 天
- 匯入後自動為 CRM 裡有對應聯絡人建立 system 類型互動紀錄，帶 SendGrid 原始時間戳
- 紀錄內容：`SendGrid 硬退信：{原因}` / `SendGrid 無效信箱：{錯誤}` / `SendGrid 已退訂`
- 重複匯入安全：已有同類型 SendGrid log 的聯絡人不會重複建立
- 沒有對應 CRM 聯絡人的 email 不建 log

## v2.7.1 — Email 狀態加入「可寄信」篩選（2026-04-14）

### 變更項目
- 聯絡人清單 Email 狀態 filter 新增「✉ 可寄信」選項，篩出 email_status 為空（無問題）的聯絡人
- 可配合 Export 功能匯出這份名單直接寄信

## v2.7.0 — SendGrid Email 狀態整合（2026-04-14）

### 變更項目
- DB：contacts 表新增 `email_status` 欄位（bounced / unsubscribed / invalid），從 SendGrid 歷史資料 backfill 54 筆
- 聯絡人清單：新增「Email 狀態」filter dropdown（硬退信 / 已退訂 / 無效信箱）
- 聯絡人清單：email 欄位顯示狀態 badge（紅色硬退信、橘色已退訂、黃色無效信箱），手機版同步
- 聯絡人詳情：互動紀錄區塊頂端新增 SendGrid 狀態橫幅（有狀態時才顯示）
- API `/api/sendgrid/import-suppressions`：匯入後自動同步更新 contacts.email_status
- API `/api/contacts/all`：SELECT 加入 email_status 欄位

## v2.6.9 — 報表欄位完善（2026-04-09）

### 變更項目
- **統一名稱**：「會議」全改為「拜訪」（聯絡人互動紀錄標籤、報表類型顯示）
- **填寫人欄位**：報表新增「填寫人」欄位，顯示互動紀錄填寫者的 display_name
- **完整內容**：內容欄不再截斷，完整顯示並保留換行
- **欄位排序**：點擊欄位標題可排序（聯絡人、公司、類型、日期、填寫人）

## v2.6.8 — 報表新增國家與互動類型篩選（2026-04-09）

### 變更項目
- **國家篩選**：報表可多選國家（從聯絡人 country_code 動態載入）
- **互動類型篩選**：可多選拜訪 / 備忘 / Email

## v2.6.7 — MFA 狀態/重設改用 DB 函數（2026-04-09）

### 變更項目
- **MFA 狀態修正**：改用 DB 函數 `get_users_mfa_status()` 直接查 `auth.mfa_factors`，繞過 JS Admin API 權限問題
- **MFA 重設修正**：改用 DB 函數 `get_auth_user_id_by_email()` 查 auth UUID，取代 `listUsers()` 呼叫

## v2.6.6 — 報表 Tag 篩選根本修正（2026-04-09）

### 變更項目
- **報表 Tag 篩選修正**：改用 Supabase RPC（資料庫函數 `get_interaction_logs_by_tags`），讓 JOIN 在 DB 端完成。原因：當 MD tag 有 904 個聯絡人時，`.in()` 篩選會把 904 個 UUID 放入 URL（約 33,000 字元），超過 PostgREST URL 長度限制導致查詢失敗

## v2.6.5 — 報表移除建立時間欄位、MFA 狀態修正（2026-04-09）

### 變更項目
- **報表移除建立時間**：互動紀錄報表移除「建立時間」欄位（預覽與 Excel）
- **MFA 狀態修正**：改用 `listFactors` 逐一查詢，解決 `listUsers` 不一定包含 factor 資料的問題

## v2.6.4 — 使用者管理顯示 MFA 狀態（2026-04-09）

### 變更項目
- **MFA 狀態欄位**：使用者管理頁新增 MFA 欄位，顯示「已設定」（綠色）或「未設定」（灰色）
- **重設按鈕移至 MFA 欄**：重設 MFA 按鈕只在已設定 MFA 的使用者旁顯示，重設後狀態即時更新

## v2.6.3 — 三項修正（2026-04-09）

### 變更項目
- **名片王匯入語言預設**：根據 OCR 國家碼自動設定語言（JP→日文、TW/CN→中文、其他→英文）
- **報表互動日期**：無會議日期時改顯示互動紀錄的 `created_at` 日期
- **MFA 重設修正**：改用 email 查找 auth user，解決 "User not found" 錯誤；同時修正 MFA factors 屬性名稱（`totp`+`phone` 而非 `factors`）

## v2.6.2 — 名片王匯入新增語言選項（2026-04-09）

### 變更項目
- **名片王匯入語言選項**：每張名片卡片新增語言切換（中/EN/日），確認時會設定聯絡人的溝通語言

## v2.6.1 — 報表改版、MFA 重設修正（2026-04-09）

### 變更項目
- **報表僅保留互動紀錄**：移除聯絡人報表，只保留互動紀錄；過濾掉 `system` 類型及 Telegram Bot 新增名片記錄；Tag 篩選正確套用至互動紀錄
- **報表互動紀錄欄位**：新增時間、地點、建立時間欄位顯示
- **MFA 重設修正**：修正 Next.js 16 async params 問題，管理員重設 MFA 功能恢復正常

## v2.6.0 — MFA 重設、回饋截圖修正、報表 Tag 篩選、移除 Gmail（2026-04-09）

### 變更項目
- **管理員重設 MFA**：使用者管理頁新增「重設 MFA」按鈕，管理員可協助使用者清除 TOTP 驗證器，讓對方重新設置
- **回饋截圖上傳修正**：找到根本原因（`feedback` storage bucket 缺少 INSERT RLS policy），新增 migration 修正；同時修正 storage path 多餘前綴
- **報表 Tag 篩選**：報表產生頁新增 Tag 多選篩選，選取後只顯示有任一所選 tag 的聯絡人（OR 邏輯）
- **移除 Gmail 整合**：報表頁面移除 Gmail OAuth 連結區塊（API routes 保留）

## v2.5.2 — 名片審查多選批次確認（2026-04-09）

### 變更項目
- `/admin/camcard`：每張名片左上角新增 checkbox，載入後自動勾選無重複的卡片
- 有 `duplicate_contact_id` 的卡片 checkbox 呈 disabled，需手動合併或略過
- 已勾選卡片的 border 變綠，視覺上區分選取狀態
- Filter bar 新增「全選 / 取消全選」快捷鈕
- 頁面底部新增浮動確認列：顯示已選 N 張，一鍵送出批次確認
- 批次確認以 5 張一組平行執行，顯示進度條（確認中 X/N）
- 批次確認保留 tagIds 與 importance metadata

## v2.5.1 — Telegram Bot 新增 /lang 語言切換指令（2026-04-07）

### 變更項目
- Telegram Bot 新增 `/lang [zh|en|ja]` 指令，可直接在 Bot 切換回應語言（更新 `users.language`），切換後立即以新語言回覆確認
- `/help` 三語版本均加入 `/lang` 指令說明

## v2.5.0 — 名片審查篩選器；說明文件公開快速開始（2026-04-07）

### 變更項目
- `/admin/camcard`：新增篩選列（搜尋姓名／公司、國家、有重複、有 Email、排序），支援 400ms debounce 搜尋與一鍵清除
- `GET /api/camcard/pending`：新增 `search`、`has_duplicate`、`country_code`、`has_email`、`sort` 篩選參數
- `middleware.ts`：`/docs` 路由不再要求登入，未登入使用者可直接瀏覽快速開始文件

## v2.4.5 — 名片王匯入編輯功能（2026-04-03）

### 變更項目
- `/admin/camcard`：每張名片新增「編輯」按鈕，開啟 modal 可編輯所有 OCR 欄位（中文名、英文名、日文名、公司、職稱、Email、電話、地址等）後再確認匯入
- 新增 `PUT /api/camcard/[id]/update` API，更新 `camcard_pending.ocr_data`

## v2.4.4 — 個人設定頁 MFA inline 設定（2026-04-02）

### 變更項目
- feat: 個人設定頁 MFA 區塊改為 inline enrollment，點「啟用 MFA」後直接展開 QR Code + 驗證碼輸入，不再跳轉到 /mfa/setup 頁面
- i18n: mfa 新增 scanQr / manualEntry / cancel 三個 key

## v2.4.3 — Hunter.io 統計刷新、Footer 台北時間（2026-04-02）

### 變更項目
- fix: footer deploy 時間改用 `Asia/Taipei` timezone（Vercel build server 為 UTC，原本時間差 8 小時）
- feat: Hunter.io 統計區塊新增「重新整理」按鈕，可即時刷新無 email 聯絡人數量

## v2.4.2 — Teams Bot 改名 Dr.Ave（2026-04-02）

### 變更項目
- feat: manifest.json Bot 名稱 myCRM Bot → Dr.Ave，更換 color.png（ava.png 192×192）與 outline.png（白色透明），重新打包為 DrAve-Bot.zip

## v2.4.1 — fix: Bot slash command 在 waiting session 中無法正確 dispatch（2026-04-02）

### 變更項目
- fix: `handleText` 入口加統一 session-clear check，任何 slash command 在 active session 下都先 clear session 再正常 dispatch，修正 `/help`、`/search`、`/email` 等指令在 waiting 狀態下無效的問題

## v2.4.0 — 三語文件、Dr.Ave、MFA強制、Export授權、回饋表單（upcoming）

### 變更項目

- **文件全面三語化**：`docs/` 所有 Markdown 文件補齊英文（`*.en.md`）與日文（`*.ja.md`）版本；掃描補齊 Web UI i18n 三份語言檔缺漏 key
- **Teams Bot 改名 Dr.Ave**：更新 manifest.json Bot 名稱為 Dr.Ave；更換 color.png / outline.png 頭像；重新打包 zip（圖片由管理員提供）
- **MFA 強制登入（TOTP）**：所有使用者登入後強制設定 TOTP；新增 `/mfa/setup`（首次設定）與 `/mfa/verify`（每次登入驗證）頁面；middleware 加入 AAL 檢查；`/settings` 新增 MFA 管理區塊
- **聯絡人 Export 獨立授權**：Export 功能納入 `granted_features` 權限系統，新增 `export_contacts` 權限，預設所有人關閉；`/admin/users` 可個別授權；無權限者 Export 按鈕 disabled
- **系統回饋表單**：新增 `feedback` 表與 Storage bucket；Sidebar 新增「💬 回饋」入口；Bug 無截圖時送出前確認提示；新增 `/admin/feedback` 管理頁（列表、詳情、狀態更新，super_admin 限定）；回饋資料格式支援 Claude Code 讀取分析
- **TODO**：Supabase 備份策略（Synology NAS + Databasus）待後續版本規劃
- **DB**：新增 `feedback` 表
- **i18n**：zh-TW / en / ja 新增 mfa.*、feedback.*、contacts.exportNoPermission

---

## v2.3.1 — bot /n /v 支援直接帶聯絡人名字（2026-03-31）

### 變更項目
- fix: bot `/n 姓名` 及 `/v 姓名` 現可直接帶聯絡人名字，不再落入 fallback

## v2.3.0 — 功能權限管理系統（2026-03-31）

### 變更項目
- 新增 `users.granted_features TEXT[]` 欄位（需執行 DB migration）
- Super admin 可在使用者管理頁對每個使用者勾選開放功能
- 側邊欄：10 個可授權功能對所有使用者可見，super admin 專屬功能（AI模型、使用者管理、系統健康）僅 super admin 可見
- 無權限頁面顯示「沒有權限，請聯絡管理員」而非跳轉
- `/docs` 頁面改為需登入才能查看
- 新增 `src/lib/features.ts` 功能定義檔
- 新增 `src/components/PermissionGate.tsx` 權限守門元件
- 新增 `src/lib/checkPermission.ts` API 保護工具函式

### DB Migration（需手動執行）
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS granted_features TEXT[] DEFAULT '{}';
```

## v2.2.13 — 聯絡人頁移除電話欄、Bot 指令統一不用 @（2026-03-31）

### 變更項目
- 聯絡人列表頁移除電話欄位（表格和卡片視圖）
- Telegram Bot `/a` 和 `/p` 指令改為直接輸入姓名，不再需要 `@` 前綴（`/a 姓名`、`/p 姓名`）

## v2.2.12 — Hunter.io 顯示剩餘 credit（2026-03-31）

### 變更項目
- Hunter 介面加上本月剩餘／已用 credits（呼叫 Hunter /v2/account API）

## v2.2.11 — 修正新增聯絡人頁面輸入凍結問題（2026-03-31）

### 變更項目
- 將 Field 元件移至 NewContactPage 外部，避免每次 state 更新時 React unmount/remount 所有 input

## v2.2.10 — 修正新增聯絡人頁面 i18n 缺失 key（2026-03-31）

### 變更項目
- 補上 contacts.sectionBasic、contacts.sectionNotes（三語言）

## v2.2.9 — 聯絡人列表突破 1000 筆限制（2026-03-31）

### 變更項目
- `/api/contacts/all` 改用分批分頁（每批 1000 筆）累積所有聯絡人，解決 PostgREST max_rows=1000 硬上限問題

## v2.2.8 — 聯絡人列表改用 API route（2026-03-31）

### 變更項目
- 聯絡人列表改從 `/api/contacts/all`（service role）拉資料，繞過 PostgREST max_rows=1000 限制

## v2.2.7 — 聯絡人頁面修正（2026-03-31）

### 變更項目
- 聯絡人列表：fetch 上限從 1000 → 10000，修正聯絡人數顯示不完整
- 修正 `common.page` 顯示 raw key（參數名稱 `page` → `current`）

## v2.2.6 — Hunter 補查改進（2026-03-31）

### 變更項目
- 每次查詢上限從 50 → 100 筆
- 新增「重置查詢紀錄」按鈕，清空所有無 email 且查過未找到的 hunter_searched_at

## v2.2.5 — Dashboard 統計改用 DB 聚合（2026-03-31）

### 變更項目
- 國家分布、Tag 分布改用 SQL RPC（`dashboard_country_stats`, `dashboard_tag_stats`）
- 不再受 Supabase 前端 1000 筆上限影響，支援萬筆以上聯絡人

## v2.2.4 — 旋轉修正、筆記跳頁、Hunter明細（2026-03-30）

### 變更項目
- 名片旋轉：修正 params 未 await 導致 404（Next.js 15 async params）
- 筆記搜尋：跳頁輸入框移至頂部「第 X / Y 頁」旁邊
- Hunter 補查：結果明細分成「已找到」和「找不到」兩區塊分別顯示

## v2.2.3 — 修正語言檔根本問題（2026-03-30）

### 變更項目
- 修正 `src/i18n/request.ts` import 路徑：`../../messages/` → `../messages/`
- 刪除根目錄多餘的 `messages/` 資料夾（舊版本遺留，導致所有新 i18n key 無效）
- 現在所有語言 key 皆從正確的 `src/messages/` 載入

## v2.2.2 — 旋轉修正、科別標籤（2026-03-30）

### 變更項目
- 名片旋轉：修正二次旋轉失敗問題（URL 帶 `?t=` 時 Storage path 解析錯誤）
- 聯絡人：將「部門」標籤改為「科別」（符合醫療場景）

## v2.2.1 — 排序、旋轉、語言修正、Hunter明細（2026-03-30）

### 變更項目
- **國家管理排序**：點擊代碼/中文名/英文名欄位可排序，支援升降序切換
- **筆記搜尋**：新增日期排序切換（最新/最舊在前）；分頁加入跳頁輸入框
- **任務語言修正**：補齊三語 `tasks.status.*`（pending/done/postponed/cancelled）
- **名片圖片旋轉**：聯絡人頁名片圖 hover 顯示旋轉按鈕，點擊後自動旋轉 90° 並存回 Storage
- **Hunter 補查明細**：補查完成後顯示每位聯絡人查詢結果（姓名、公司、找到的 email）
- **語言補齊**：新增 `notes.sortNewest/sortOldest`、`hunter.searchDetail` 三語

---

## v2.2.0 — Hunter補查管理、語文Migration、筆記分組、Bot多語言、名片王分頁（2026-03-30）

### 變更項目

- **Hunter.io 補查管理頁面**：`/admin/health` 新增 Hunter.io 區塊；API Key 設定；顯示無 email 聯絡人統計（未查過 / 查過找不到 / 本月已查）；手動觸發補查按鈕；優先查從未查過的，超過 30 天再查，已有 email 完全跳過
- **聯絡人語文預設規則更新**：TW / CN → 中文；JP → 日文；其他 → 英文；跑 DB Migration 批次更新所有既有聯絡人
- **筆記搜尋頁改版**：以聯絡人分組顯示，每人預設最新 3 筆，依聯絡人最新筆記時間排序；超過 3 筆顯示「查看全部 →」跳聯絡人詳情頁；搜尋維持分組；未歸類筆記維持在 `/unassigned-notes`
- **Telegram Bot 多語言回覆**：所有 Bot 回覆訊息支援中 / 英 / 日三語自動切換；語言判斷順序：`users.language` → Telegram `language_code` → fallback 中文；新增 `bot-messages.ts` 語言包與 `getBotLanguage()` 共用函式
- **名片王匯入審查分頁**：`/admin/camcard` 加入分頁功能（PAGE_SIZE=20），支援直接跳頁
- **DB**：`contacts` 新增 `hunter_searched_at` 欄位；`system_settings` 補入 `hunter_api_key`

---

## v2.1.3 — 全面修正 i18n namespace 不符問題（2026-03-29）

### 變更項目

- **新增 `mail` namespace**：對應 contacts/[id] 頁面的寄信功能（原 `sendEmail` key 名不符）
- **新增 `models` namespace**：對應 AI 模型管理頁面（原 `aiModels` key 名不符）
- **新增 `tasks` namespace**：任務頁面全部 i18n key
- **新增 `countries` namespace**：國家管理頁面全部 i18n key
- **新增 `reports` namespace**：報表頁面全部 i18n key（含 Gmail 整合、排程）
- **補齊 `dashboard`**：title、recentContacts、countryDistribution、countryOther、pendingNotes、noNotes
- **補齊 `contacts`**：backToList、fax、addressEn、country、importance、creator、cardImages、interactionLogs、logPlaceholder、noLogs、loadMore、editContact、scanCard、sectionCompany/Contact/Social/Met、metAt/Date、referredBy、extraData、addTag、noTagsMatch、sendMail、uploadCard
- **補齊 `unassignedNotes`**：assignTitle、assignSearch、searching、notFound
- **補齊 `notes`**：allTypes、clearDate、confirmDelete、meetingDate
- **補齊 `users`**：colName/Email/Telegram/Teams/Role/LastLogin/Actions、selfRoleHint、updating、demoteToMember、promoteToAdmin
- **補齊 `settings`**：teamsBot、teamsBound/Unbound、aiModel、light/dark、assistants、assistantsHint、noAssistants、saved、saving
- **補齊 `templates`**：colTitle/Subject/Attachments/Created、aiGenerating、generate、uploading、uploadBtn、saving
- 同步 root `/messages/`

---

## v2.1.2 — 修正缺漏的 i18n keys（2026-03-29）

### 變更項目

- **新增 `batch` namespace**：批次上傳頁面重寫後所需的全部 key（status、dupLegend、progress 等）
- **新增 `login` namespace**：登入頁面的 subtitle、button、hint、errors.*
- **新增 `contacts.logTypes`**：聯絡人詳情頁的互動紀錄類型標籤（筆記、會議、郵件、系統）
- **新增 `notes.types`**：筆記搜尋頁的類型篩選標籤（筆記、會議、郵件）
- 同步 root `/messages/` 與 `src/messages/`

---

## v2.1.1 — 改用 Hunter.io Email 補查；修正 i18n root messages（2026-03-29）

### 變更項目

- **Hunter.io 取代 Apollo.io**：LinkedIn 聯絡人無 email 時改用 Hunter.io Email Finder API 補查（`system_settings` key: `hunter_api_key`）
- **修正 i18n root messages**：同步 `messages/` 根目錄語言檔，修正部署後 `nav.trash`、語文篩選、維護頁等 key 未生效的問題

---

## v2.1.0 — 系統維護模式、OCR 重試、Apollo Email 補查、筆記過濾、回收區改進（2026-03-29）

### 變更項目

- **筆記搜尋過濾**：筆記搜尋頁排除系統自動產生的預設紀錄（「透過 Telegram Bot 新增名片」、「從名片王匯入」開頭的紀錄）
- **聯絡人篩選加語文**：聯絡人列表頁新增語文篩選下拉（全部 / 中文 / EN / 日文）；修正語文欄位 i18n 顯示（english → EN）
- **回收區 sidebar 修正**：三份語言檔補上 `nav.trash` key，修正側邊欄顯示 `nav.trash` 原始 key 的問題
- **回收區聯絡人詳情**：回收區列表聯絡人姓名改為可點擊，彈出 Modal 顯示完整詳情（唯讀），含還原與永久刪除操作
- **系統維護模式**：新增 `system_settings` 表；Bot 新增 `/stop` 指令（super_admin 限定），開啟後所有非 super_admin 使用者的 Bot 輸入與 Web 頁面均顯示維護中訊息；新增 `/maintenance` 頁面
- **LinkedIn 截圖存儲**：Bot `/li` 與網頁 LinkedIn 截圖確認建立聯絡人後，截圖壓縮存入 Storage，`card_img_url` 填入截圖 URL
- **姓名 fallback 統一**：名片掃描與 LinkedIn OCR 統一套用 `if (!name && name_en) name = name_en` 邏輯
- **Gemini OCR 自動重試**：抽出 `callGeminiWithRetry()` 共用函式；OCR 失敗後回覆「⏳ 辨識失敗，3 秒後自動重試...」，等 3 秒重試一次；重試仍失敗才存入 `failed_scans`；適用所有 Bot Gemini 呼叫（名片、/li、/p、/n）
- **Apollo Email 補查**：整合 Apollo.io API；LinkedIn 建立的聯絡人若無 email，背景自動呼叫 Apollo `people/match` 查詢；查到則更新 `contacts.email` 並追加通知使用者；API Key 存於 `system_settings` 表
- **DB**：新增 `system_settings` 表（`maintenance_mode`、`apollo_api_key`）
- **i18n**：zh-TW / en / ja 新增 v2.1 相關 key（nav.trash、maintenance、languageFilter、language.english 簡化為 EN）

---

## v2.0.0 — 權限強化、回收區、照片 EXIF、語文欄位、醫師欄位（2026-03-29）

### 變更項目
- **說明書修正**：修正 Quick Start Telegram Bot 綁定步驟說明
- **刪除權限限制**：聯絡人刪除僅限建立者與 super_admin；非權限使用者隱藏刪除按鈕
- **軟刪除 / 回收區**：所有刪除改為軟刪除（deleted_at），新增 `/admin/trash` 回收區頁面（僅 super_admin 可查看、還原、永久刪除）
- **網頁端照片 EXIF**：上傳合照時前端自動提取 GPS 座標與拍攝日期（exifr），呼叫 reverse geocode 取得地名，顯示日期以拍攝日期為準
- **語文欄位**：contacts 新增 language 欄位（中文/英文/日文），依 country 自動預設（TW→中文、JP→日文、其他→英文）
- **醫師欄位**：contacts 新增 hospital（自由輸入）與 department（科別，自由輸入）欄位
- **DB**：contacts 新增 deleted_at、deleted_by、language、hospital、department 欄位
- **i18n**：zh-TW / en / ja 新增 v2.0 相關 key
- **拜訪紀錄擴充**：interaction_logs 新增 meeting_time、meeting_location 欄位；Web UI 拜訪表單新增時間與地點欄位；報表 Excel 新增對應欄位；Bot 新增 `/n`（自然語言 AI 解析）與 `/v` `/visit`（逐步詢問）兩種拜訪紀錄指令


## v1.9.9 — 相簿頁改版：一人一張縮圖（2026-03-26）

### 變更項目
- 相簿頁改為每位聯絡人只顯示一張封面縮圖，多張時顯示 +N 標示
- 點擊縮圖開啟 lightbox 放大顯示
- 修正根目錄 messages/ 缺少 nav.photos 翻譯鍵（sidebar 顯示「相簿」）

## v1.9.8 — 修正 sidebar 翻譯顯示（2026-03-26）

### 變更項目
- 補全 nav 命名空間所有缺少的 i18n 鍵（appTitle、logout、tasks、reports、tags、models、users、prompts、countries、newsletter、failedScans、duplicates、camcard、health）
- 修正 sidebar 顯示「nav.photos」而非「相簿」的問題
- 修正相簿頁圖片改用 `<img>` 標籤（解決 Supabase signed URL 無法顯示問題）
- 修正相簿頁照片依聯絡人分組顯示

## v1.9.7 — 全域相簿搜尋 + LinkedIn 截圖轉聯絡人（2026-03-26）

### 變更項目
- **全域相簿搜尋**：新增 `/photos` 頁面，跨所有聯絡人顯示合照；支援以附註、拍攝地點、聯絡人姓名關鍵字搜尋；grid 縮圖排列，點擊展開原圖
- **API**：新增 `GET /api/photos?q=` route，JOIN contacts，支援關鍵字過濾
- **Sidebar**：新增「相簿」入口（所有登入使用者可見）
- **LinkedIn 截圖轉聯絡人**：新增 Bot 指令 `/li`，傳送 LinkedIn Profile 截圖 → Gemini Vision OCR → 確認後寫入聯絡人（source='linkedin'）
- **LinkedIn 網頁入口**：新增聯絡人下拉選單「LinkedIn 截圖」，解析後 pre-fill 新增表單
- **API**：新增 `POST /api/linkedin/parse` route（Gemini Vision，回傳 name/title/company/linkedin/email/notes）
- **i18n**：zh-TW / en / ja 新增 photos、linkedin 相關 key


## v1.9.6 — /p 支援多張照片與共同附註（2026-03-25）

### 變更項目
- feat: `/p` 上傳合照支援多張（照片或以檔案傳送皆可），每新增一張即更新計數訊息
- feat: 按「完成」後詢問共同附註，附註存入互動紀錄；多張時顯示張數
- feat: `processPersonalPhoto` 改為接受 `fileIds[]` 批次處理

## v1.9.5 — 合照附註功能（2026-03-25）

### 變更項目
- feat: Bot `/p` 上傳合照後詢問附註，附註存入 `contact_photos.note` 並同步寫入互動紀錄
- feat: 網頁合照區塊支援點擊照片下方加入/編輯附註，儲存後同步寫入互動紀錄
- db: `contact_photos` 新增 `note text` 欄位（需執行 migration）

## v1.9.4 — /a 命令正確填入英文姓名欄位（2026-03-25）

### 變更項目
- fix: `/a` 新增名片時，`name_en`（英文姓名）與 `name_local`（日文姓名）獨立對應各自欄位，不再被誤合併到 `name` 欄位；修正日本名片背面英文姓名無法填入的問題

## v1.9.3 — 支援 HEIC/HEIF 照片格式（iPhone 照片）（2026-03-25）

### 變更項目
- fix: 加入 `heic-convert` 套件，處理前自動偵測並轉換 HEIC/HEIF 為 JPEG，解決 Sharp 不支援 HEIF 壓縮格式的錯誤

## v1.9.2 — 修正新增聯絡人頁面重要性顯示與網址驗證（2026-03-24）

### 變更項目
- fix: 新增聯絡人頁面重要性按鈕顯示 H/M/L（原本因 i18n key 不存在而顯示錯誤）
- fix: 網站/LinkedIn/Facebook 欄位改用 `type="text"`，允許 `www.xxx.com` 格式不帶 https://

## v1.9.1 — 修正名片 Storage 路徑含非 ASCII 字元錯誤（2026-03-24）

### 變更項目
- fix: 確認/合併名片時，Storage 檔名自動移除中日文等非 ASCII 字元，避免 Supabase "Invalid key" 錯誤
- fix: 純中/日文名稱（無英文）的檔名 fallback 為 `card`

## v1.9.0 — 支援多張名片 + 合照功能（2026-03-24）

### 變更項目
- feat: Bot 掃名片確認後，同步 INSERT 至 `contact_cards` 表
- feat: 新指令 `/a`（取代 `/ab`）— 新增任意名片，OCR 比對現有資料，確認後填入空白欄位，衝突存備註
- feat: 新指令 `/p` — 新增合照，壓縮後存入 `contact_photos`，自動讀取 EXIF 時間/GPS 並 reverse geocode 地名
- feat: 新建 `contact_photos` table（含 taken_at, latitude, longitude, location_name）
- feat: 新增 `processPhotoWithExif` / `extractExif` / `reverseGeocode` 工具函式
- feat: 聯絡人詳情頁名片顯示正反面並排
- refactor: 移除 `/ab` 指令，改以 `/a` 統一處理名片新增
- feat: 聯絡人詳情頁新增「合照」區塊，顯示日期/地點（EXIF 自動讀取）
- feat: 新增 `/api/geocode` route（代理 Nominatim reverse geocoding）
- feat: Web 上傳名片時，OCR 衝突欄位自動存入備註（interaction_logs）

## v1.8.3 — 修復 /ab 背面名片 bug 及聯絡人刪除失敗（2026-03-23）

### 變更項目
- fix: /ab 照片確認步驟，防止 session 殘留導致照片存到錯誤聯絡人
- feat: /ab 無參數支援，自動帶入上一位聯絡人（同 /email、/note 行為）
- fix: 修正 5 個 contacts FK 的 NO ACTION，改為 SET NULL / CASCADE，解決聯絡人無法刪除問題
- refactor: 抽出 processBackCardPhoto() helper 避免重複邏輯

## v1.8.2 — 網址可點擊連結（2026-03-23）

### 變更項目
- 聯絡人詳細頁：網站、LinkedIn、Facebook 欄位改為可點擊連結（新分頁開啟）
- 名片王審查頁：網站欄位改為可點擊連結
- 自動補全 `https://` 前綴，避免無協定網址連結失效

## v1.8.1 — 聯絡人重要性欄位（2026-03-23）

### 變更項目
- **DB**：`contacts` 新增 `importance text not null default 'medium'`，CHECK constraint 限制值為 `high` / `medium` / `low`
- **聯絡人列表**：每筆顯示三顆橫排綠色圓點 icon，亮起顆數代表重要程度（🟢🟢🟢 高 / 🟢🟢⚪ 中 / 🟢⚪⚪ 低），不顯示文字
- **聯絡人列表篩選**：頂部 filter bar 新增「重要性」下拉選單（全部 / High / Medium / Low），支援 `?importance=` query string，可與搜尋、tag、場合篩選疊加
- **聯絡人詳情頁**：「基本資料」區塊新增「重要性」欄位，可編輯（segmented control）
- **新增聯絡人表單**：新增「重要性」欄位，預設 Medium
- **API**：`GET /api/contacts` 新增 `importance` 過濾參數；`POST` / `PATCH` 接受 `importance` 欄位
- **i18n**：zh-TW / en / ja 新增 `importance` 相關 key


## v1.8.0 — 名片王審查頁面加入分頁（每頁 50 筆）（2026-03-23）

### 變更項目
- `GET /api/camcard/pending`：新增 `limit` / `offset` query 參數，回傳 `{ cards, total }` 格式（原本回傳陣列）
- `/admin/camcard` 頁面：加入翻頁按鈕（上一頁 / 下一頁），頭部顯示「第 N / M 頁」
- 每頁固定 50 筆，當前頁顯示完畢後自動重新載入下一批

## v1.7.16 — 修正名片王確認人：改用 session cookie 直接查 email（2026-03-23）

### 變更項目
- confirm/merge route 改用 `createClient()` 讀 session cookies → `auth.getUser()` → 用 email 查 `users` 表取 `display_name`
- 移除對 middleware header 和 body param 的依賴（前兩種方式都不可靠）
- 還原 middleware 移除 v1.7.15 加入的 request header 修法（無效且複雜）

## v1.7.15 — 修正 middleware x-user-id 改為 request header（2026-03-22）

### 變更項目
- middleware 改用 `NextResponse.next({ request: { headers: requestHeaders } })` 將 `x-user-id` 寫入 **request header**，route handler 才能正確讀取（舊版誤設 response header，route handler 讀不到）
- 保留 Supabase session cookies 以維持 auth 正常運作

## v1.7.14 — 修正名片王確認人：改用 middleware header 傳遞 user ID（2026-03-22）

### 變更項目
- middleware 驗證 session 後將 user ID 寫入 `x-user-id` response header，confirm/merge route 直接讀取，徹底繞開 Route Handler cookie auth 失效問題

## v1.7.13 — 修正名片王確認人：server 永遠從 DB 查 display_name（2026-03-22）

### 變更項目
- confirm/merge route 不再信任前端傳來的 `confirmedByName`，改為永遠用 `confirmedByUserId` 從 `users` 表查正確的 display_name，根本解決 email fallback 被寫入互動紀錄的問題

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
