# PRD：myCRM — Telegram 名片辨識 CRM 系統

> 此文件供 Claude Code 使用。請先閱讀完整 PRD，理解需求後提出技術架構與任務拆分計畫，確認後再開始實作。

---

## ⚠️ Claude Code 工作守則（請務必遵守）

1. **每個 Task 開始前**，先列出你打算新增或修改的檔案清單，等待人類確認後才開始實作
2. **Task 清單中未提及的現有檔案，不得主動修改**
3. **每完成一個 Task**，告知完成內容，等待確認後再繼續下一個
4. 如對需求有疑問，先提問，不要自行假設

---

## 現況說明（v0.1 已實作）

此專案已有部分功能上線（v0.1），以下檔案已存在且運作中，**Task 清單中未提及者請勿重寫**：

| 檔案 | 狀態 | 說明 |
|------|------|------|
| `src/app/api/bot/route.ts` | 已實作，需修改 | Bot webhook，目前查 authorized_users，需改查 users |
| `src/app/api/auth/callback/route.ts` | 已實作，需修改 | Auth callback，需加 upsert users 邏輯 |
| `src/app/login/page.tsx` | 已實作，需修改 | 登入頁，需加 Mail.Send scope |
| `src/app/(dashboard)/layout.tsx` | 已實作，需修改 | Sidebar，需更新導覽項目與權限 |
| `src/app/(dashboard)/page.tsx` | 已實作，需修改 | Dashboard 首頁，需加統計與未歸類筆記區塊 |
| `src/app/(dashboard)/contacts/page.tsx` | 已實作，需修改 | 聯絡人列表，需加 Tags、篩選、Export |
| `src/app/(dashboard)/contacts/[id]/page.tsx` | 已實作，需修改 | 聯絡人詳情，需加編輯、Tags、反面照片、寄信 |
| `src/app/(dashboard)/admin/users/page.tsx` | 已實作，需修改 | 使用者管理，需改為管理 users 表 |
| `src/app/(dashboard)/admin/templates/page.tsx` | 已實作，需修改 | 郵件範本，需加真實附件上傳、AI 生成 |
| `src/lib/supabase.ts` | 已實作，需修改 | Supabase client |
| `src/lib/supabase-browser.ts` | 已實作，可能需修改 | Browser Supabase client |
| `src/lib/gemini.ts` | 已實作，需修改 | Gemini OCR，需加 model 參數與多語言 |
| `src/lib/imageProcessor.ts` | 已實作，需修改 | 圖片壓縮，需加新命名規則 |
| `src/middleware.ts` | 已實作，需確認 | Route 保護 |

**以下為全新新增，現在不存在：**
- `src/lib/graph.ts`
- `src/lib/duplicate.ts`
- `src/app/api/ocr/route.ts`
- `src/app/api/ai-email/route.ts`
- `src/app/(dashboard)/contacts/new/page.tsx`
- `src/app/(dashboard)/unassigned-notes/page.tsx`
- `src/app/(dashboard)/notes/page.tsx`
- `src/app/(dashboard)/admin/tags/page.tsx`
- `src/app/(dashboard)/admin/models/page.tsx`
- `src/app/(dashboard)/settings/page.tsx`

---

## 一、專案概覽

| 項目 | 內容 |
|------|------|
| 專案名稱 | myCRM |
| 核心功能 | 透過 Telegram Bot 拍攝名片，自動 OCR 辨識後存入組織共享 CRM，並提供 Web 管理介面 |
| 技術棧 | Next.js 14 (App Router, TypeScript) + Supabase + Telegram Bot + Gemini |
| 部署平台 | Vercel (前端 + API) + Supabase (DB + Storage) |

---

## 二、技術棧規格

### Frontend / Backend
- **Framework**：Next.js 14，使用 App Router、TypeScript、ESLint、Tailwind CSS、`src/` 目錄結構
- **RWD**：所有頁面必須 mobile friendly，使用 Tailwind responsive prefix（sm / md / lg）
- **UI 元件**：Tailwind CSS（優先），可選用 shadcn/ui

### 核心套件
```
@supabase/ssr
@supabase/supabase-js
@google/generative-ai
sharp
lucide-react
next-themes
xlsx
```

### 服務整合
- **Supabase**：PostgreSQL 資料庫 + Storage + Auth（Microsoft AAD OAuth）
- **Telegram Bot API**：原生 fetch 實作 Webhook（不使用 Telegraf）
- **Google Gemini**：名片 OCR、Email AI 生成，model 從 `gemini_models` 表動態讀取
- **Microsoft Graph API**：以使用者身份寄送郵件（`Mail.Send` permission）

---

## 三、使用者與身份系統

### 登入流程
1. 使用者點擊「Sign in with Microsoft」
2. Supabase Auth 處理 OAuth，限制僅 `@cancerfree.io` 帳號可通過
3. 登入成功後 upsert `users` 表（by email），更新 `display_name`、`last_login_at`

### Telegram 綁定
1. 登入後前往個人設定，輸入 Telegram 數字 ID（傳訊給 @userinfobot 可取得）
2. 儲存後自動成為 Bot 授權使用者

### 角色

| 角色 | 說明 |
|------|------|
| `member` | 預設，所有 `@cancerfree.io` 登入者自動取得 |
| `super_admin` | 可管理使用者角色、Gemini model 清單，系統可有多位 |

> 第一位使用者需由開發者在 Supabase 手動設為 `super_admin`。

---

## 四、資料庫結構

### `users`
| 欄位 | 型別 | 說明 |
|------|------|------|
| id | uuid (PK) | 主鍵 |
| email | text (UNIQUE, NOT NULL) | Microsoft 帳號 |
| display_name | text | 顯示名稱 |
| telegram_id | bigint (UNIQUE, nullable) | Telegram 數字 ID |
| role | text (default 'member') | `member` 或 `super_admin` |
| gemini_model | text (default 'gemini-1.5-flash') | 個人偏好 model_id，對應 gemini_models.model_id |
| theme | text (default 'light') | `light` 或 `dark` |
| last_login_at | timestamptz | 最後登入時間 |
| created_at | timestamptz (default now()) | 建立時間 |

### `gemini_models`
| 欄位 | 型別 | 說明 |
|------|------|------|
| id | uuid (PK) | 主鍵 |
| model_id | text (UNIQUE, NOT NULL) | 傳給 API 的字串，如 `gemini-1.5-flash` |
| display_name | text | 顯示名稱，如 `Gemini 1.5 Flash` |
| is_active | boolean (default true) | 是否顯示於個人設定的 dropdown |
| created_at | timestamptz (default now()) | 建立時間 |

> 初始資料：gemini-1.5-flash、gemini-1.5-pro、gemini-2.0-flash、gemini-2.5-pro

### `contacts`
| 欄位 | 型別 | 說明 |
|------|------|------|
| id | uuid (PK) | 主鍵 |
| name | text | 姓名 |
| company | text | 公司名稱 |
| job_title | text | 職稱 |
| email | text | 電子郵件 |
| phone | text | 電話 |
| card_img_url | text | 正面名片圖片 URL |
| card_img_back_url | text (nullable) | 反面名片圖片 URL |
| created_by | uuid (FK → users.id) | 建立者 |
| created_at | timestamptz (default now()) | 建立時間 |

### `tags`
| 欄位 | 型別 | 說明 |
|------|------|------|
| id | uuid (PK) | 主鍵 |
| name | text (UNIQUE, NOT NULL) | Tag 名稱 |
| created_at | timestamptz (default now()) | 建立時間 |

### `contact_tags`（junction）
| 欄位 | 型別 | 說明 |
|------|------|------|
| contact_id | uuid (FK → contacts.id, ON DELETE CASCADE) | 聯絡人 |
| tag_id | uuid (FK → tags.id, ON DELETE CASCADE) | Tag |
| PRIMARY KEY (contact_id, tag_id) | | 複合主鍵 |

### `interaction_logs`
| 欄位 | 型別 | 說明 |
|------|------|------|
| id | uuid (PK) | 主鍵 |
| contact_id | uuid (FK → contacts.id, ON DELETE CASCADE, **nullable**) | 聯絡人，null 代表未歸類 |
| type | text (default 'note') | `note` / `meeting` / `email` |
| content | text | 互動內容（email 類型存完整信件內容） |
| meeting_date | date (nullable) | 會議日期（type=meeting） |
| email_subject | text (nullable) | 郵件主旨（type=email） |
| email_attachments | text[] (nullable) | 附件檔名清單（type=email，只存檔名不存檔案） |
| created_by | uuid (FK → users.id, nullable) | 紀錄者 |
| created_at | timestamptz (default now()) | 建立時間 |

### `email_templates`
| 欄位 | 型別 | 說明 |
|------|------|------|
| id | uuid (PK) | 主鍵 |
| title | text | 範本名稱 |
| subject | text | 郵件主旨 |
| body_content | text | 郵件內文（HTML） |
| created_at | timestamptz (default now()) | 建立時間 |

### `template_attachments`
| 欄位 | 型別 | 說明 |
|------|------|------|
| id | uuid (PK) | 主鍵 |
| template_id | uuid (FK → email_templates.id, ON DELETE CASCADE) | 所屬範本 |
| file_name | text | 原始檔名 |
| file_url | text | Supabase Storage URL |
| file_size | int | 檔案大小（bytes） |
| created_at | timestamptz (default now()) | 建立時間 |

### `bot_sessions`
| 欄位 | 型別 | 說明 |
|------|------|------|
| id | uuid (PK) | 主鍵 |
| telegram_id | bigint (UNIQUE, NOT NULL) | Telegram 使用者 ID |
| state | text | 目前對話狀態 |
| context | jsonb | 暫存資料（選到的聯絡人、draft 等） |
| updated_at | timestamptz | 最後更新時間 |

---

## 五、環境變數

```env
# Telegram
TELEGRAM_BOT_TOKEN=

# Google Gemini
GEMINI_API_KEY=

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Microsoft Graph（寄信用 Supabase session provider_token，不需額外設定）
# 僅需確認 Azure AD App Registration 已開啟 Mail.Send permission

# 版本資訊（Vercel build 時自動注入）
NEXT_PUBLIC_APP_VERSION=0.2.0
NEXT_PUBLIC_DEPLOY_TIME=
```

---

## 六、功能規格

### 6.1 基礎工具庫

#### `src/lib/supabase.ts`
- `createClient()` — Server Component 用
- `createServiceClient()` — API route 用（service role）

#### `src/lib/supabase-browser.ts`
- `createBrowserSupabaseClient()` — Client Component 用

#### `src/lib/gemini.ts`
- `analyzeBusinessCard(buffers: Buffer[], model: string): Promise<CardData>`
  - 支援多張圖片（正反面）
  - 多語言 System Prompt：`你是一個專業名片辨識助手。名片可能為中文、英文或日文，請辨識後以原文回傳。從圖中提取：姓名、公司、職稱、Email、電話，回傳純 JSON，不要有任何其他文字。格式：{"name":"","company":"","job_title":"","email":"","phone":""}`
- `generateEmailContent(description: string, template?: string, model: string): Promise<string>`
  - 根據使用者描述（和可選的 template 內容）生成完整郵件內文
  - 回傳 HTML 字串

#### `src/lib/imageProcessor.ts`
- `processCardImage(inputBuffer: Buffer): Promise<Buffer>`
- 長邊壓縮至最大 1024px，JPEG 品質 85
- **命名規則**：`yymmdd_hhmmss-{流水號}.jpg`，流水號每天從 001 重置，3 位數補零

#### `src/lib/graph.ts`
- `sendMail({ accessToken, to, subject, body, attachmentNames? }): Promise<void>`
- 使用 `https://graph.microsoft.com/v1.0/me/sendMail`
- accessToken 從 Supabase session `provider_token` 取得

#### `src/lib/duplicate.ts`
- `checkDuplicates(email: string, name: string): Promise<{ exact: Contact | null, similar: Contact[] }>`
- 完全重複：email 完全相符
- 疑似重複：姓名 similarity() >= 0.6（需 pg_trgm）

---

### 6.2 主題系統
- `next-themes` 管理全域主題，儲存於 `users.theme`
- **全域 CSS 規範**（所有頁面強制執行）：
  - input / textarea / select 文字色：`text-gray-900 dark:text-gray-100`
  - placeholder：`placeholder-gray-400 dark:placeholder-gray-500`
  - 禁止 `text-white` 或過淺灰色作為輸入文字色

---

### 6.3 認證流程
- login 頁：`signInWithOAuth`，provider `azure`，額外 scope `Mail.Send`
- auth callback：upsert `users` by email，更新 `display_name`、`last_login_at`
- middleware：保護所有 `/(dashboard)` 路由

---

### 6.4 Telegram Bot

#### 路徑：`src/app/api/bot/route.ts`

所有指令統一操作模式：**輸入關鍵字 → Bot 列出選項（附數字） → 回覆數字選擇 → 繼續流程**

---

**`/help`**

回覆所有可用指令說明：
```
🤖 myCRM Bot 指令列表

📷 傳送照片 — 掃描名片，AI 辨識後存入 CRM

/search [關鍵字] — 搜尋聯絡人
/note — 新增會議筆記
/email — 發送郵件給聯絡人
/add_back @姓名 — 補充名片反面
/help — 顯示此說明
```

---

**`/search [關鍵字]`**

1. 模糊搜尋姓名或公司
2. 找到結果：每筆顯示姓名、公司、職稱、Email、電話，並傳送名片照片（有反面則傳兩張）
3. 每筆附快速按鈕：`[✉️ 發信]` `[📝 筆記]`
4. 找不到：「找不到符合的聯絡人」

---

**照片（名片掃描）**

1. 權限檢查：查 `users.telegram_id`，不存在回覆「⛔ 你沒有使用權限，請先在 myCRM 網站的個人設定綁定你的 Telegram ID」
2. 下載 → `processCardImage()` 壓縮 → 上傳 Storage
3. 以使用者 `gemini_model` 呼叫 `analyzeBusinessCard()`
4. 重複檢查（`checkDuplicates()`）：
   - 完全重複：「⚠️ 此 email 已有聯絡人：{name}（{company}）」
   - 疑似重複：「🔍 系統有相似聯絡人：{name}（{company}）」
5. 回覆辨識結果 + `[✅ 確認存檔]` `[❌ 不存檔]`
6. Callback：
   - `save_xxx`：存 contacts + interaction_log（type=note）
   - `cancel_xxx`：「已取消，名片未存檔」，移除按鈕

---

**`/note`**

1. Bot 問：「請輸入聯絡人姓名或公司關鍵字：」
2. 使用者輸入 → 模糊搜尋：
   - 找到唯一：直接進入步驟 3
   - 找到多筆：列出選項，回覆數字選擇
   - 找不到：「找不到此聯絡人，筆記將存為未歸類，可至網頁手動歸類」→ 存 interaction_log（contact_id=null, type=meeting）
3. Bot 問：「請輸入筆記內容（會議日期可在第一行輸入 DATE:YYYY-MM-DD）：」
4. 存入 interaction_log（type=meeting）

快速格式（不用 /note 指令）：
```
@關鍵字
筆記內容
```

---

**`/email`**

1. Bot 問：「請輸入聯絡人姓名或公司關鍵字：」
2. 模糊搜尋 → 列出選項 → 選人
3. Bot 問：「請選擇發信方式：\n1. 使用 Email Template\n2. 直接描述，AI 幫你生成」
4a. **選 Template**：列出所有 email_templates，選擇後 Bot 問「有要補充的內容嗎？（直接傳送請回覆 skip）」，有補充則 AI 合併 template + 補充生成最終內容
4b. **AI 生成**：Bot 問「請描述這封信的目的：」，AI 根據描述生成完整郵件
5. Bot 回覆預覽（主旨 + 內文摘要前 200 字）+ `[✅ 確認發送]` `[❌ 取消]`
6. 確認後：
   - 呼叫 `graph.ts` 的 `sendMail()` 從使用者 Microsoft 信箱發出
   - 寫入 interaction_log（type=email，email_subject=主旨，content=完整內文，email_attachments=附件檔名[]）
   - Bot 回覆「✅ 郵件已發送！」

---

**`/add_back @姓名`**

1. 搜尋聯絡人（模糊搜尋）→ 找到後回覆「請傳送名片反面照片」
2. 下一張照片：壓縮上傳，更新 `contacts.card_img_back_url`，Gemini 辨識補充缺少欄位
3. 回覆「✅ 已更新名片反面資訊」

---

**多步驟對話狀態管理**

使用 `bot_sessions` 表儲存狀態：

| state | 說明 |
|-------|------|
| `waiting_contact_for_note` | 等待輸入筆記的聯絡人關鍵字 |
| `waiting_content_for_note` | 等待輸入筆記內容 |
| `waiting_contact_for_email` | 等待輸入發信聯絡人關鍵字 |
| `waiting_email_method` | 等待選擇 template 或 AI 生成 |
| `waiting_template_choice` | 等待選擇 template |
| `waiting_email_supplement` | 等待補充內容或 skip |
| `waiting_email_description` | 等待 AI 生成描述 |
| `waiting_back_card` | 等待傳送名片反面 |

---

### 6.5 Web 管理介面

#### RWD 規範
- 所有頁面支援 mobile（375px+）、tablet（768px+）、desktop（1280px+）
- Sidebar 在 mobile 收合為 hamburger menu
- 表格在 mobile 改為 card 列表顯示

#### 版本資訊（全域 Footer）
- 所有頁面左下角固定顯示：`v{NEXT_PUBLIC_APP_VERSION} · 部署於 {NEXT_PUBLIC_DEPLOY_TIME}`
- Vercel 在 build 時自動注入 `NEXT_PUBLIC_DEPLOY_TIME`（格式：`YYYY-MM-DD HH:mm`）

---

#### 頁面 1：Dashboard `/`
- 統計卡片：
  1. 聯絡人總數
  2. 本月新增名片數
  3. 未歸類筆記數（點擊導向 `/unassigned-notes`）
- **Tag 聯絡人分布**：列出每個 tag 及其聯絡人數量（長條圖或列表）
- **「待處理」區塊**：最新 5 筆未歸類筆記，每筆有「指定聯絡人」按鈕（搜尋 modal）
- 「查看全部」連結 → `/unassigned-notes`

---

#### 頁面 2：聯絡人列表 `/contacts`
- 表格欄位：姓名、公司、職稱、Email、電話、Tags、建立者、建立時間
- 關鍵字搜尋（姓名或公司）
- Tag 多選篩選 dropdown
- **Export 按鈕**：匯出目前篩選結果為 Excel（.xlsx）或 CSV
  - 欄位：姓名、公司、職稱、Email、電話、Tags、建立者、建立時間
- **「新增聯絡人」按鈕**

---

#### 頁面 3：新增聯絡人 `/contacts/new`
- 表單：姓名、公司、職稱、Email、電話、Tags
- 照片上傳（正面）→ 自動呼叫 `/api/ocr` AI 辨識 → 填入表單（可修改）
- 即時重複偵測（填 email 或姓名後提示）
- 儲存後導向 `/contacts/[id]`

---

#### 頁面 4：聯絡人詳情 `/contacts/[id]`
- 完整資料 + 建立者
- 正面 / 反面名片縮圖（可點擊放大）
- **編輯按鈕**：Modal，可修改所有欄位 + 上傳新照片（AI 重新辨識）
- **Tags 區塊**：顯示、新增、移除
- **互動紀錄時間軸**：type badge（筆記 / 會議 / 郵件）、內容、紀錄者、時間
  - type=meeting：顯示會議日期
  - type=email：顯示主旨，點擊展開完整內文，顯示附件檔名清單
- 「新增互動紀錄」：選 type（筆記 / 會議），會議可填日期
- 「寄信」按鈕 → Modal（收件人預帶 email、選 template 或描述、AI 生成、確認發送、自動寫 log）
- 返回按鈕

---

#### 頁面 5：筆記搜尋 `/notes`
- 搜尋所有 interaction_logs（含已歸類與未歸類）
- 篩選條件：關鍵字（content / email_subject）、日期範圍（created_at）、type（全部 / 筆記 / 會議 / 郵件）
- 每筆顯示：type badge、內容摘要、聯絡人姓名（未歸類顯示「未歸類」）、建立者、時間
- 點擊已歸類筆記 → 導向 `/contacts/[id]`

---

#### 頁面 6：未歸類筆記 `/unassigned-notes`
- 列出所有 contact_id=null 的 interaction_logs
- 每筆：內容、類型、建立者、時間
- 每筆有「指定聯絡人」（搜尋 modal 更新 contact_id）和「刪除」按鈕

---

#### 頁面 7：Tag 管理 `/admin/tags`
- 列出所有 tags（name、使用中聯絡人數、建立時間）
- 新增、編輯名稱、刪除（確認後關聯自動移除）

---

#### 頁面 8：Gemini Model 管理 `/admin/models`（僅 super_admin）
- 列出所有 `gemini_models`（display_name、model_id、is_active、建立時間）
- 新增 model（填 model_id 和 display_name）
- 切換 is_active（停用後不出現在個人設定 dropdown）
- 刪除 model
- 非 super_admin 導向 `/`

---

#### 頁面 9：使用者管理 `/admin/users`（僅 super_admin）
- 列出所有 users（display_name、email、telegram_id 綁定狀態、role、last_login_at）
- 修改 role（member ↔ super_admin）
- 非 super_admin 導向 `/`

---

#### 頁面 10：郵件範本 `/admin/templates`
- 列出所有 email_templates
- 新增、編輯（title、subject、body_content HTML）、刪除
- **AI 生成按鈕**：輸入描述 → 呼叫 `/api/ai-email` → 生成內容填入編輯框（可再修改）
- 附件管理：上傳至 `template-attachments` bucket，單檔限 2MB，顯示列表可刪除

---

#### 頁面 11：個人設定 `/settings`
- 顯示 email、display_name、role
- Telegram ID 輸入框（說明：傳訊給 @userinfobot）
- Gemini model dropdown（從 `gemini_models` 表撈 is_active=true 的項目）
- 主題切換（Light / Dark）
- 儲存更新 users 表

---

### 6.6 API Routes

#### `src/app/api/ocr/route.ts`（新增）
- POST：接收圖片 base64 陣列 + model
- 呼叫 `analyzeBusinessCard()`，回傳 CardData

#### `src/app/api/ai-email/route.ts`（新增）
- POST：接收 `{ description, templateContent?, model }`
- 呼叫 `generateEmailContent()`，回傳生成的 HTML 內文

---

## 七、UI / 表單全域規範

- input / textarea / select 文字色：`text-gray-900 dark:text-gray-100`
- placeholder：`placeholder-gray-400 dark:placeholder-gray-500`
- 禁止 `text-white` 或淺灰色作輸入文字色
- 所有頁面支援 RWD（mobile 375px+）
- 頁面左下角固定 footer：版本號 + 部署時間

---

## 八、資料庫 Migration SQL

```sql
-- 廢除舊表
drop table if exists authorized_users;

-- 使用者表
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  display_name text,
  telegram_id bigint unique,
  role text not null default 'member',
  gemini_model text not null default 'gemini-1.5-flash',
  theme text not null default 'light',
  last_login_at timestamptz,
  created_at timestamptz default now()
);

-- Gemini model 清單（super_admin 管理）
create table if not exists gemini_models (
  id uuid primary key default gen_random_uuid(),
  model_id text unique not null,
  display_name text not null,
  is_active boolean not null default true,
  created_at timestamptz default now()
);

-- 初始 model 資料
insert into gemini_models (model_id, display_name) values
  ('gemini-1.5-flash', 'Gemini 1.5 Flash'),
  ('gemini-1.5-pro', 'Gemini 1.5 Pro'),
  ('gemini-2.0-flash', 'Gemini 2.0 Flash'),
  ('gemini-2.5-pro', 'Gemini 2.5 Pro')
on conflict (model_id) do nothing;

-- 聯絡人表
create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  name text,
  company text,
  job_title text,
  email text,
  phone text,
  card_img_url text,
  card_img_back_url text,
  created_by uuid references users(id),
  created_at timestamptz default now()
);

-- Tags
create table if not exists tags (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  created_at timestamptz default now()
);

-- Contact Tags junction
create table if not exists contact_tags (
  contact_id uuid references contacts(id) on delete cascade,
  tag_id uuid references tags(id) on delete cascade,
  primary key (contact_id, tag_id)
);

-- 互動紀錄
create table if not exists interaction_logs (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references contacts(id) on delete cascade,
  type text not null default 'note',
  content text,
  meeting_date date,
  email_subject text,
  email_attachments text[],
  created_by uuid references users(id),
  created_at timestamptz default now()
);

-- 郵件範本
create table if not exists email_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subject text,
  body_content text,
  created_at timestamptz default now()
);

-- 郵件範本附件
create table if not exists template_attachments (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references email_templates(id) on delete cascade,
  file_name text not null,
  file_url text not null,
  file_size int not null,
  created_at timestamptz default now()
);

-- Bot 對話狀態
create table if not exists bot_sessions (
  id uuid primary key default gen_random_uuid(),
  telegram_id bigint unique not null,
  state text,
  context jsonb,
  updated_at timestamptz default now()
);

-- 啟用 pg_trgm（疑似重複偵測）
create extension if not exists pg_trgm;
```

---

## 九、Supabase Storage 設定

| Bucket | 說明 | 存取 |
|--------|------|------|
| `cards` | 名片圖片（正反面） | Public |
| `template-attachments` | 郵件範本附件 | Public |

---

## 十、Azure AD 設定

- Permissions：`openid`、`profile`、`email`、`Mail.Send`（Delegated）
- Redirect URI：`https://<supabase-project>.supabase.co/auth/v1/callback`
- Additional Scopes：`Mail.Send`

---

## 十一、Vercel 部署設定

```bash
# 設定 Telegram Webhook
curl -X POST "https://api.telegram.org/bot{TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://{your-domain}/api/bot"}'
```

**Vercel 環境變數（需手動設定）：**
- 所有 `.env` 變數
- `NEXT_PUBLIC_APP_VERSION`：目前版本號，如 `0.2.0`
- `NEXT_PUBLIC_DEPLOY_TIME`：在 Vercel Build Command 前加 `NEXT_PUBLIC_DEPLOY_TIME=$(date '+%Y-%m-%d %H:%M') &&` 自動注入

---

## 十二、開發任務清單（供 Claude Code 使用）

請先閱讀完整 PRD，每個 Task 開始前列出要動的檔案，確認後再實作：

- [x] **Task 1** `[修改]` — 資料庫 Migration SQL（含 gemini_models 表與初始資料、pg_trgm）
- [x] **Task 2** `[修改]` — 安裝套件（next-themes、xlsx）；設定全域主題；更新全域 CSS；新增版本 footer 元件
- [x] **Task 3** `[修改]` — 更新 `src/lib/supabase.ts`、`src/lib/supabase-browser.ts`
- [x] **Task 4** `[修改]` — 更新 `src/lib/gemini.ts`（多語言、model 參數、多張圖片、新增 generateEmailContent）
- [x] **Task 5** `[新增]` — 新增 `src/lib/graph.ts`；新增 `src/lib/duplicate.ts`
- [x] **Task 6** `[修改]` — 更新 `src/lib/imageProcessor.ts`（命名規則）
- [x] **Task 7** `[修改]` — 更新認證流程（login Mail.Send scope、auth callback upsert users、middleware）
- [x] **Task 8** `[修改]` — 更新 Bot Webhook（全部指令：/help、/search、/note、/email、/add_back、名片掃描、bot_sessions 狀態管理）
- [x] **Task 9** `[新增]` — 新增 `/api/ocr` 和 `/api/ai-email` route
- [x] **Task 10** `[修改]` — 更新 Dashboard Layout（RWD sidebar、新 Sidebar 項目、super_admin 判斷）
- [x] **Task 11** `[修改]` — 更新 Dashboard 首頁（統計卡片、Tag 分布、待處理區塊）
- [x] **Task 12** `[修改]` — 更新聯絡人列表（Tags 欄、Tag 篩選、Export、RWD）
- [x] **Task 13** `[新增]` — 新增聯絡人新增頁 `/contacts/new`（表單、OCR、重複偵測）
- [x] **Task 14** `[修改]` — 更新聯絡人詳情（編輯 Modal、正反面、Tags、互動紀錄 type badge、email log 展開、寄信 Modal）
- [x] **Task 15** `[新增]` — 新增筆記搜尋頁 `/notes`（關鍵字、日期、type 篩選）
- [x] **Task 16** `[新增]` — 新增未歸類筆記頁 `/unassigned-notes`
- [x] **Task 17** `[新增]` — 新增 Tag 管理頁 `/admin/tags`
- [x] **Task 18** `[新增]` — 新增 Gemini Model 管理頁 `/admin/models`（僅 super_admin）
- [x] **Task 19** `[修改]` — 更新使用者管理頁 `/admin/users`（管理 users 表、角色切換）
- [x] **Task 20** `[修改]` — 更新郵件範本頁（AI 生成、多附件上傳 2MB 限制）
- [x] **Task 21** `[新增]` — 新增個人設定頁 `/settings`（Telegram ID、model dropdown 從 DB 讀取、主題）

---

## 十三、v0.6 新增功能規格

### 13.1 Bot 指令縮寫

所有指令支援完整版與縮寫版，功能完全相同：

| 完整指令 | 縮寫 | 說明 |
|----------|------|------|
| `/help` | `/h` | 顯示指令說明 |
| `/search` | `/s` | 搜尋聯絡人 |
| `/note` | `/note` | 新增會議筆記（無縮寫，避免誤觸） |
| `/email` | `/e` | 發送郵件 |
| `/add_back` | `/ab` | 補充名片反面 |
| `/user` | `/u` | 列出組織成員 |

`/help` 回覆內容需同時顯示完整指令和縮寫。

---

### 13.2 `/user` / `/u` 指令

- 所有授權使用者均可使用
- 列出所有 `users` 表中的成員資料
- 每筆顯示：display_name、email、telegram_id（若已綁定）
- 格式範例：
  ```
  👥 組織成員列表（共 5 人）

  1. 王小明
     📧 ming@cancerfree.io
     📱 Telegram ID：123456789

  2. 陳大華
     📧 david@cancerfree.io
     📱 Telegram ID：未設定
  ```

---

### 13.3 AI Endpoint 管理（重構 `/admin/models`）

原本的 `/admin/models` 頁面改為二層結構：**Endpoint → Model**

#### 資料表新增

**`ai_endpoints`**
| 欄位 | 型別 | 說明 |
|------|------|------|
| id | uuid (PK) | 主鍵 |
| name | text (NOT NULL) | 顯示名稱，如 `Google Gemini` |
| base_url | text (NOT NULL) | API Base URL |
| api_key | text (NOT NULL) | API Key（加密儲存） |
| is_active | boolean (default true) | 是否啟用 |
| created_at | timestamptz (default now()) | 建立時間 |

**`ai_models`**（取代原 `gemini_models` 表）
| 欄位 | 型別 | 說明 |
|------|------|------|
| id | uuid (PK) | 主鍵 |
| endpoint_id | uuid (FK → ai_endpoints.id, ON DELETE CASCADE) | 所屬 endpoint |
| model_id | text (NOT NULL) | 傳給 API 的字串，如 `gemini-1.5-flash` |
| display_name | text (NOT NULL) | 顯示名稱 |
| is_active | boolean (default true) | 是否顯示於使用者 dropdown |
| created_at | timestamptz (default now()) | 建立時間 |

> `users.gemini_model` 欄位改為 `users.ai_model_id`（FK → ai_models.id）

#### `/admin/models` 頁面（僅 super_admin）

**Endpoint 管理區塊**
- 列出所有 endpoints（名稱、Base URL、is_active、model 數量）
- 新增 endpoint：填名稱、Base URL、API Key
- 切換 is_active、刪除 endpoint（連同底下 models 一起刪除）
- API Key 顯示為遮蔽（`sk-****`），可點擊重新設定

**Model 管理區塊**
- 選擇一個 endpoint 後，顯示該 endpoint 底下的所有 models
- 新增 model：填 model_id、display_name
- 切換 is_active、刪除 model

#### 個人設定頁 `/settings` 更新
- Gemini model dropdown 改為兩層選擇：
  1. 先選 Endpoint（從 `ai_endpoints` 撈 is_active=true）
  2. 再選 Model（從 `ai_models` 撈對應 endpoint 且 is_active=true）
- 儲存更新 `users.ai_model_id`

#### Migration SQL 補充
```sql
-- AI Endpoint 表
create table if not exists ai_endpoints (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  base_url text not null,
  api_key text not null,
  is_active boolean not null default true,
  created_at timestamptz default now()
);

-- AI Model 表（取代 gemini_models）
create table if not exists ai_models (
  id uuid primary key default gen_random_uuid(),
  endpoint_id uuid references ai_endpoints(id) on delete cascade,
  model_id text not null,
  display_name text not null,
  is_active boolean not null default true,
  created_at timestamptz default now()
);

-- 初始資料：Google Gemini endpoint
insert into ai_endpoints (name, base_url, api_key) values
  ('Google Gemini', 'https://generativelanguage.googleapis.com', 'placeholder')
on conflict do nothing;

-- users 表新增 ai_model_id 欄位
alter table users add column if not exists ai_model_id uuid references ai_models(id);
```

---

### 13.4 說明書頁面 `/docs`

- 網頁內嵌，不需登入即可瀏覽（或登入後才能看，視安全需求）
- 內容由 AI 根據 PRD 自動生成，在 build 時或首次載入時生成並 cache
- 分兩個 Section：

**Section 1：一般使用者**
- 如何登入
- 如何綁定 Telegram ID
- Bot 所有指令說明（含縮寫）
- 如何在網頁新增 / 搜尋 / 編輯聯絡人
- 如何新增筆記與會議紀錄
- 如何寄信
- 如何使用 Tag 分類
- 如何 export 聯絡人
- 個人設定說明（主題、Gemini model）

**Section 2：Super Admin**
- 如何管理使用者角色
- 如何管理 AI Endpoint 與 Model
- 如何管理 Tag
- 如何管理郵件範本

- 頁面右側有目錄（anchor 導覽）
- 支援深色 / 淺色主題

---

## 十四、v0.6 開發任務清單

- [x] **Task 22** `[修改]` — 執行新增 Migration SQL（ai_endpoints、ai_models 表，users 加 ai_model_id 欄位）
- [x] **Task 23** `[修改]` — 更新 Bot Webhook 加入指令縮寫（/h、/s、/e、/ab、/u）和 `/user` 指令
- [x] **Task 24** `[修改]` — 重構 `/admin/models` 為 Endpoint + Model 二層管理（新增 ai_endpoints、ai_models CRUD）
- [x] **Task 25** `[修改]` — 更新個人設定頁 `/settings`（model 選擇改為 endpoint → model 兩層 dropdown，儲存 ai_model_id）
- [x] **Task 26** `[修改]` — 更新 `src/lib/gemini.ts` 及相關呼叫（從 ai_endpoints 讀取 base_url 和 api_key，動態初始化 AI client）
- [ ] **Task 27** `[新增]` — 新增說明書頁面 `/docs`（AI 根據 PRD 生成內容，分 User / Super Admin section，含目錄）
