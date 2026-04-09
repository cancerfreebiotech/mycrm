# CHANGELOG

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
