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
- [x] **Task 27** `[新增]` — 新增說明書頁面 `/docs`（AI 根據 PRD 生成內容，分 User / Super Admin section，含目錄）

---

## 十五、v0.6.1 修正項目

### 15.1 主題系統修正

#### 根本問題
Tailwind v4 的 `dark:` utilities 預設使用 `@media (prefers-color-scheme: dark)`（OS 層級），而非 `next-themes` 加到 `<html>` 的 `.dark` class，導致 toggle 完全無效。

#### 修正內容

**`src/app/globals.css`**
- 加入 `@variant dark (&:where(.dark, .dark *));` 讓 Tailwind v4 改用 class-based dark mode
- `body font-family` 改用 `var(--font-geist-sans)` 取代硬碼 Arial

**`src/app/(dashboard)/layout.tsx`**
- Header 右上角加入 Sun / Moon toggle button（`useTheme`）
- 加入 `mounted` state 防止 hydration flash

**`src/app/(dashboard)/settings/page.tsx`**
- 加入 `mounted` state，主題按鈕 active 判斷加 `mounted &&` guard

**`src/app/docs/page.tsx`**
- 加入 `mounted` state，toggle icon 加 guard
- 修正 `prose-code:dark:bg-gray-800` → `dark:prose-code:bg-gray-800`

---

### 15.2 Bot 孤兒圖片清理

#### 問題
使用者點「❌ 不存檔」時，`pending_contacts` DB 記錄被刪除，但 Supabase Storage 中已上傳的名片圖片仍然保留，造成孤兒圖檔累積。

#### 解決方案（A1 + C）

**A1 — 取消時即時刪除**
- `pending_contacts` 新增 `storage_path TEXT` 欄位
- `handlePhoto()` 上傳圖片後同步寫入 `storage_path`
- cancel callback 先查 `storage_path`，呼叫 `supabase.storage.from('cards').remove([path])` 刪圖，再刪 DB 記錄

**C — 每日定時清理（防禦補強）**
- 啟用 `pg_cron` extension
- cron job `cleanup-orphan-cards` 每天 03:00 UTC 執行
- 刪除 `storage.objects` 中 bucket=cards、超過 24 小時、且不在 `contacts.card_img_url`、`contacts.card_img_back_url`、`pending_contacts.storage_path` 中的圖檔

#### DB Migration
```sql
-- A1
ALTER TABLE pending_contacts ADD COLUMN storage_path TEXT;

-- C
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'cleanup-orphan-cards',
  '0 3 * * *',
  $$
  DELETE FROM storage.objects
  WHERE bucket_id = 'cards'
    AND created_at < NOW() - INTERVAL '24 hours'
    AND name NOT IN (
      SELECT substring(card_img_url from '.*/public/cards/(.+)$')
      FROM contacts WHERE card_img_url IS NOT NULL
      UNION
      SELECT substring(card_img_back_url from '.*/public/cards/(.+)$')
      FROM contacts WHERE card_img_back_url IS NOT NULL
      UNION
      SELECT storage_path FROM pending_contacts WHERE storage_path IS NOT NULL
    );
  $$
);
```

---

## 十六、v0.6.1 開發任務清單

- [x] **Task 28** `[修正]` — 加入 `@variant dark` 解決 Tailwind v4 class-based dark mode 無效問題
- [x] **Task 29** `[新增]` — Dashboard Header 加入 Sun/Moon 主題切換按鈕
- [x] **Task 30** `[修正]` — Settings / Docs 頁面加入 `mounted` guard 修正 hydration flash
- [x] **Task 31** `[修正]` — `body font-family` 改用 Geist CSS variable；修正 docs prose dark class 順序
- [x] **Task 32** `[新增]` — `pending_contacts` 加 `storage_path` 欄位，取消時即時刪除 Storage 圖檔（A1）
- [x] **Task 33** `[新增]` — 啟用 pg_cron，建立每日孤兒圖清理排程（C）

---

## 十五、v0.7 新增功能規格

### 15.1 Bot：連續傳圖保護

- 每次成功上傳名片（壓縮並送出辨識）後，記錄到 `pending_contacts` 表（已存在）
- Bot 收到新照片前，先查詢該使用者的 pending 數量
- 若已有 **5 筆或以上**待確認，回覆：「⚠️ 你目前有 5 張名片待確認，請先處理後再傳新的」，不繼續處理
- 第 1–4 張正常處理

---

### 15.2 Bot：`/note`、`/email` 預設上一個聯絡人

**`bot_sessions` 新增欄位**：`last_contact_id uuid references contacts(id)`

- `bot_sessions` 以 `telegram_id` 為 unique key，**每個使用者各自獨立一筆**，`last_contact_id` 完全 per-user，不同使用者之間互不影響
- 只有**這個使用者自己**按下「✅ 確認存檔」時，才更新自己的 `last_contact_id`
- 其他使用者的存檔操作不影響此欄位

**流程變更**：

`/note` 或 `/email` 不帶關鍵字時：
1. 查詢 `bot_sessions.last_contact_id`
2. 若有上一個聯絡人，回覆：
   ```
   要針對上一位聯絡人嗎？
   👤 王小明（ABC 公司）
   ```
   附按鈕：`[✅ 是，就是他]` `[🔍 搜尋其他人]`
3. 若沒有上一個聯絡人，直接問「請輸入聯絡人姓名或公司關鍵字：」

---

### 15.3 聯絡人欄位擴充

#### `contacts` 表新增欄位
| 欄位 | 型別 | 說明 |
|------|------|------|
| name_en | text (nullable) | 英文名 |
| name_local | text (nullable) | 本地語言名（如日文） |
| company_en | text (nullable) | 公司英文名 |
| company_local | text (nullable) | 公司本地語言名 |
| address | text (nullable) | 地址 |
| website | text (nullable) | 官網 |
| notes | text (nullable) | 備註（自由填寫） |
| second_email | text (nullable) | 第二 Email |
| second_phone | text (nullable) | 第二電話 |
| linkedin_url | text (nullable) | LinkedIn 個人頁面 URL |
| facebook_url | text (nullable) | Facebook 個人頁面 URL |

#### `contacts` 表移除欄位
- `card_img_url` — 移至 `contact_cards` 子表
- `card_img_back_url` — 移至 `contact_cards` 子表

#### 新增 `contact_cards` 子表
| 欄位 | 型別 | 說明 |
|------|------|------|
| id | uuid (PK) | 主鍵 |
| contact_id | uuid (FK → contacts.id, ON DELETE CASCADE) | 所屬聯絡人 |
| card_img_url | text | 正面名片圖片 URL |
| card_img_back_url | text (nullable) | 反面名片圖片 URL |
| label | text (nullable) | 標籤，如「現職」、「前職 ABC」 |
| created_at | timestamptz (default now()) | 建立時間 |

> 聯絡人主表欄位（公司、職稱等）與名片脫鉤，使用者手動維護「目前的」資料。名片只作為附件參考。

#### Gemini OCR Prompt 更新

System Prompt 更新為辨識所有新欄位，回傳 JSON：
```
你是一個專業名片辨識助手。名片可能為中文、英文或日文，請辨識後以原文回傳各欄位。
從圖中提取以下資訊，回傳純 JSON，不要有任何其他文字：
{
  "name": "",           // 主要姓名
  "name_en": "",        // 英文名（若有）
  "name_local": "",     // 本地語言名，如日文（若有）
  "company": "",        // 主要公司名
  "company_en": "",     // 公司英文名（若有）
  "company_local": "",  // 公司本地語言名（若有）
  "job_title": "",      // 職稱
  "email": "",          // 主要 Email
  "second_email": "",   // 第二 Email（若有）
  "phone": "",          // 主要電話
  "second_phone": "",   // 第二電話（若有）
  "address": "",        // 地址（若有）
  "website": "",        // 官網（若有）
  "linkedin_url": "",   // LinkedIn URL（若有）
  "facebook_url": ""    // Facebook URL（若有）
}
```

---

### 15.4 批次圖檔上傳（網頁端）

#### 入口
- 聯絡人列表頁 `/contacts` 新增「批次上傳」按鈕
- 開啟批次上傳頁面 `/contacts/batch-upload`

#### 上傳流程
1. 使用者選擇最多 50 張圖片（支援拖拉放）
2. 前端顯示所有縮圖預覽
3. 點「開始辨識」後：
   - 並行處理，同時最多 5 張，其他排隊
   - 頁面顯示整體進度條（第 x / 50 張）
   - 每張完成後即時更新狀態（✅ 完成 / ⚠️ 低信心度 / ❌ 失敗）
4. 全部完成後進入「批次預覽確認」

#### 批次預覽確認表格
- 每行一張名片，欄位：縮圖、姓名、公司、職稱、Email、電話、狀態
- 低信心度（OCR 結果有空白關鍵欄位）標黃色警示
- 重複偵測：
  - 與資料庫比對（email 完全相符 / 姓名相似度 >= 0.6）
  - 批次內部互相比對（同一批次內有相似的）
  - 重複者標橘色，顯示「⚠️ 疑似與第 X 筆重複」或「⚠️ 資料庫已有相似聯絡人」
- 每行可點擊展開編輯所有欄位
- 勾選框：預設全選，可取消勾選不想存的
- 底部按鈕：「存檔勾選的（X 筆）」一鍵存入 `contacts`

#### 信心度判斷規則
- 以下欄位若全部為空：`name`、`email`、`phone` → 標為低信心度

---

### 15.5 聯絡人合併

#### 入口
- 聯絡人詳情頁 `/contacts/[id]` 新增「合併聯絡人」按鈕（所有人可用）

#### 合併流程
1. 點擊後開啟搜尋 Modal，搜尋要被合併的聯絡人（來源）
2. 顯示確認畫面：
   - 左欄：當前聯絡人（保留）的主要資料
   - 右欄：來源聯絡人的主要資料
   - 說明：「將保留左側聯絡人的所有欄位資料，來源的名片、互動紀錄、Tag 將全部合併過來」
3. 使用者確認後執行合併：
   - `contact_cards`：來源的全部移到保留的聯絡人
   - `interaction_logs`：來源的全部移到保留的聯絡人
   - `contact_tags`：合併（去重複）
   - 自動新增一筆 `interaction_log`：
     - type = `system`
     - content = `合併聯絡人：{來源姓名}（{來源公司}）`
     - `created_by` = 執行合併的使用者 id
   - 刪除來源聯絡人

#### `interaction_logs.type` 新增值
- `system`：系統自動產生的紀錄（合併、名片新增等），不顯示建立者，改顯示系統圖示

#### Migration SQL 補充
```sql
-- contacts 新增欄位
alter table contacts add column if not exists name_en text;
alter table contacts add column if not exists name_local text;
alter table contacts add column if not exists company_en text;
alter table contacts add column if not exists company_local text;
alter table contacts add column if not exists address text;
alter table contacts add column if not exists website text;
alter table contacts add column if not exists notes text;
alter table contacts add column if not exists second_email text;
alter table contacts add column if not exists second_phone text;
alter table contacts add column if not exists linkedin_url text;
alter table contacts add column if not exists facebook_url text;

-- contact_cards 子表
create table if not exists contact_cards (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references contacts(id) on delete cascade,
  card_img_url text,
  card_img_back_url text,
  label text,
  created_at timestamptz default now()
);

-- 遷移現有名片資料到 contact_cards
insert into contact_cards (contact_id, card_img_url, card_img_back_url, label)
select id, card_img_url, card_img_back_url, '名片'
from contacts
where card_img_url is not null
on conflict do nothing;

-- bot_sessions 新增 last_contact_id
alter table bot_sessions add column if not exists last_contact_id uuid references contacts(id);
```

---

## 十六、v0.7 開發任務清單

- [ ] **Task 28** `[修改]` — 執行 Migration SQL（contacts 新增欄位、contact_cards 表、bot_sessions.last_contact_id、遷移現有名片資料）
- [ ] **Task 29** `[修改]` — 更新 `src/lib/gemini.ts`（OCR prompt 更新，辨識所有新欄位）
- [ ] **Task 30** `[修改]` — 更新 Bot Webhook（連續傳圖保護、/note /email 預設上一個聯絡人、更新 last_contact_id）
- [ ] **Task 31** `[修改]` — 更新聯絡人新增頁 `/contacts/new`（新欄位表單、contact_cards 子表）
- [ ] **Task 32** `[修改]` — 更新聯絡人詳情頁（新欄位顯示、contact_cards 管理、合併功能）
- [ ] **Task 33** `[新增]` — 新增批次上傳頁 `/contacts/batch-upload`（上傳、進度、預覽表格、重複偵測、一鍵存檔）
- [ ] **Task 34** `[修改]` — 更新聯絡人列表頁（新增「批次上傳」按鈕）

---

## 十七、v0.7 補充規格

### 17.1 Bot 搜尋強化

#### `/search` / `/s` 回傳格式更新

搜尋結果每筆顯示基本資料，**不預載互動紀錄**，改為按需載入：

```
👤 王小明
🏢 ABC 公司 ／ 業務總監
📧 ming@abc.com
📞 0912-345-678

[✉️ 發信]  [📝 筆記]  [📋 互動紀錄]
```

#### `[📋 互動紀錄]` 按鈕行為

1. 點擊後查詢該聯絡人的 `interaction_logs`
2. 回傳最新 **5 筆**，每筆格式：
   ```
   [類型] 日期 — 內容前 50 字...
   ```
   例：`[會議] 2026-03-10 — 討論 Q2 合作方案，對方表示...`
3. 若超過 5 筆，附 `[載入更多]` 按鈕，每次再載入 5 筆
4. 若無紀錄，回覆「此聯絡人尚無互動紀錄」

#### 公司搜尋行為
- 搜尋結果列出該公司所有聯絡人
- 每個人各自有獨立的 `[📋 互動紀錄]` 按鈕
- 不提供「整家公司所有人的互動紀錄」合併查詢（避免資料量過大）

---

### 17.2 網頁分頁與無限捲動

#### 原則
- **表格類頁面**（有搜尋/篩選）：使用**分頁**，每頁 20 筆，頁碼導覽
- **時間軸類頁面**（互動紀錄）：使用**無限捲動**，每次載入 20 筆

#### 各頁面實作規格

| 頁面 | 方式 | 每批筆數 |
|------|------|----------|
| `/contacts` 聯絡人列表 | 分頁 | 20 筆/頁 |
| `/notes` 筆記搜尋 | 分頁 | 20 筆/頁 |
| `/unassigned-notes` 未歸類筆記 | 分頁 | 20 筆/頁 |
| `/contacts/[id]` 互動紀錄時間軸 | 無限捲動 | 每次 20 筆 |

#### 聯絡人列表分頁細節
- 頂部顯示「共 X 筆聯絡人」
- 底部分頁導覽：`← 上一頁  1  2  3 ...  下一頁 →`
- 搜尋或 Tag 篩選後重置到第 1 頁

#### 互動紀錄無限捲動細節
- 預設載入最新 20 筆（依 `created_at` 降序）
- 捲動到底部自動觸發載入下一批
- 頂部顯示「共 X 筆紀錄」
- 全部載完後顯示「已顯示全部紀錄」

---

## 十八、v0.7 補充任務清單

- [ ] **Task 35** `[修改]` — 更新 Bot `/search` 回傳格式（加 `[📋 互動紀錄]` 按鈕、按需載入 5 筆、`[載入更多]`）
- [ ] **Task 36** `[修改]` — 更新聯絡人列表 `/contacts`（分頁，每頁 20 筆）
- [ ] **Task 37** `[修改]` — 更新筆記搜尋 `/notes`（分頁，每頁 20 筆）
- [ ] **Task 38** `[修改]` — 更新未歸類筆記 `/unassigned-notes`（分頁，每頁 20 筆）
- [ ] **Task 39** `[修改]` — 更新聯絡人詳情互動紀錄（無限捲動，每次 20 筆）

---

## 十九、v0.8 — 多語言支援（i18n）

### 19.1 技術方案

- 套件：`next-intl`
- 語言檔位置：`src/messages/`
- 支援語言：
  - `zh-TW`：繁體中文（預設）
  - `en`：English
  - `ja`：日本語

### 19.2 語言檔結構

```
src/messages/
  zh-TW.json
  en.json
  ja.json
```

所有 UI 文字必須透過語言檔 key 取得，禁止在元件內 hardcode 中文、英文或日文字串。

### 19.3 語言偏好

儲存位置（兩處都存，優先順序由高到低）：
1. `users.locale` 欄位（登入後從 DB 載入）
2. `localStorage`（未登入時記住選擇）
3. 瀏覽器語言自動偵測
4. 預設：`zh-TW`

`users` 表新增欄位：
```sql
alter table users add column if not exists locale text not null default 'zh-TW';
```

### 19.4 語言切換 UI

位置：Dashboard Header 右上角，月亮 / 太陽圖示旁邊

```
[🌐 ZH]  [🌙]  王小明  登出
```

點擊展開 dropdown，選項：
- 繁體中文
- English
- 日本語

切換後即時更新畫面，並儲存至 `users.locale`。

### 19.5 開發任務

- [ ] **Task 40** `[新增]` — 安裝 `next-intl`，設定 i18n routing，建立語言檔載入機制
- [ ] **Task 41** `[修改]` — 更新 Dashboard Layout（Header 加語言切換 dropdown）
- [ ] **Task 42** `[修改]` — 將所有頁面的 hardcode 文字替換為 i18n key（使用現有三份語言檔）
- [ ] **Task 43** `[修改]` — 更新個人設定頁（語言選擇 dropdown）；DB Migration 加 `users.locale`

---

## 二十、v0.9 — 報表功能

### 20.1 架構概覽

```
Super Admin 設定規則
  → 儲存至 report_schedules 表
  → pg_cron 依 cron_expression 定時觸發
  → 呼叫 Supabase Edge Function: generate-report
  → Edge Function 查詢資料 + 產生 Excel + Gmail API 寄出
```

立即產生（點按鈕）→ 呼叫 Next.js API route → 網頁直接呈現表格

---

### 20.2 資料表

#### `report_schedules`
| 欄位 | 型別 | 說明 |
|------|------|------|
| id | uuid (PK) | 主鍵 |
| name | text (NOT NULL) | 規則名稱，如「每週業務報表」 |
| frequency | text (NOT NULL) | `weekly` / `monthly` / `custom` |
| cron_expression | text (NOT NULL) | cron 字串，如 `0 9 * * 1`（每週一早上9點） |
| date_from_offset | int | 報表起始日回溯天數（相對於觸發時間） |
| date_to_offset | int (default 0) | 報表結束日回溯天數（0 = 今天） |
| recipients | uuid[] (NOT NULL) | 收件人 users.id 陣列 |
| is_active | boolean (default true) | 是否啟用 |
| created_by | uuid (FK → users.id) | 建立者 |
| created_at | timestamptz (default now()) | 建立時間 |

#### `gmail_oauth`（系統唯一一筆）
| 欄位 | 型別 | 說明 |
|------|------|------|
| id | uuid (PK) | 主鍵 |
| access_token | text | 加密儲存（Supabase Vault） |
| refresh_token | text | 加密儲存（Supabase Vault） |
| expires_at | timestamptz | access token 過期時間 |
| gmail_address | text | 寄件 Gmail 地址 |
| updated_at | timestamptz | 最後更新時間 |

---

### 20.3 報表內容

時間範圍內的兩個區塊：

**區塊 1：新增名片**
- 欄位：姓名、公司、職稱、Email、電話、新增者、新增時間
- 依新增時間降序排列

**區塊 2：互動紀錄**
- 欄位：類型（筆記/會議/郵件）、內容摘要（前100字）、聯絡人姓名、紀錄者、時間
- 依時間降序排列

---

### 20.4 立即產生（網頁呈現）

- 使用者自由選取開始日期和結束日期
- 點「產生報表」後呼叫 `/api/reports/preview`
- 在網頁以表格呈現兩個區塊
- 頁面頂部顯示摘要：「共 X 筆新增名片、Y 筆互動紀錄（{開始日期} ~ {結束日期}）」
- 提供「下載 Excel」按鈕，可將目前報表匯出

---

### 20.5 定時寄送（Excel email）

**觸發流程**
1. pg_cron 依 `cron_expression` 觸發
2. 呼叫 Supabase Edge Function `generate-report`，傳入 `schedule_id`
3. Edge Function：
   - 查詢 `report_schedules` 取得規則
   - 計算時間範圍（`now() - date_from_offset days` 到 `now() - date_to_offset days`）
   - 查詢資料庫產生報表資料
   - 用 `xlsx` 產生 Excel（兩個 sheet：新增名片、互動紀錄）
   - 從 Supabase Vault 取得 Gmail OAuth token（若過期自動 refresh）
   - 用 Gmail API 寄出，收件人為 `recipients` 陣列對應的 email
   - 主旨：`[myCRM] {規則名稱} {開始日期}~{結束日期}`

**Excel 格式**
- Sheet 1「新增名片」：姓名、公司、職稱、Email、電話、新增者、新增時間
- Sheet 2「互動紀錄」：類型、內容、聯絡人、紀錄者、時間

---

### 20.6 Gmail OAuth 設定（Super Admin 一次性設定）

入口：`/admin/reports` 頁面頂部「Gmail 連結狀態」區塊

**未連結狀態**
- 顯示「尚未連結 Gmail 帳號」
- 「連結 Gmail」按鈕 → 走 Google OAuth flow（scope：`gmail.send`）
- 授權完成後 access token 和 refresh token 存入 Supabase Vault

**已連結狀態**
- 顯示已連結的 Gmail 地址
- 「重新連結」按鈕（更換帳號或 token 失效時使用）

**環境變數（新增）**
```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GMAIL_OAUTH_REDIRECT_URI=https://{your-domain}/api/auth/gmail-callback
```

---

### 20.7 `/admin/reports` 頁面（僅 super_admin）

**頂部：Gmail 連結狀態區塊**

**中間：立即產生區塊**
- 開始日期、結束日期選擇器
- 「產生報表」按鈕
- 報表呈現區（表格）
- 「下載 Excel」按鈕

**下方：排程規則列表**
- 每條規則顯示：名稱、頻率、時間範圍設定、收件人、啟用狀態
- 「新增規則」按鈕
- 新增/編輯規則 Modal：
  - 規則名稱
  - 頻率選擇：每週（選星期幾 + 時間）、每月（選幾號 + 時間）、自訂（輸入 cron 表達式）
  - 時間範圍：開始回溯天數、結束回溯天數（例如：30天前到今天 = `date_from_offset=30, date_to_offset=0`）
  - 收件人：從 users 多選（顯示 display_name + email）
  - 啟用/停用

---

### 20.8 Migration SQL

```sql
-- 報表排程規則
create table if not exists report_schedules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  frequency text not null default 'weekly',
  cron_expression text not null,
  date_from_offset int not null default 7,
  date_to_offset int not null default 0,
  recipients uuid[] not null default '{}',
  is_active boolean not null default true,
  created_by uuid references users(id),
  created_at timestamptz default now()
);

-- Gmail OAuth（系統唯一）
create table if not exists gmail_oauth (
  id uuid primary key default gen_random_uuid(),
  gmail_address text,
  expires_at timestamptz,
  updated_at timestamptz default now()
);
-- access_token 和 refresh_token 存入 Supabase Vault，不存在資料表
```

---

## 二十一、v0.9 開發任務清單

- [ ] **Task 44** `[修改]` — 執行 Migration SQL（report_schedules、gmail_oauth 表）
- [ ] **Task 45** `[新增]` — Gmail OAuth 設定流程（`/api/auth/gmail` 和 `/api/auth/gmail-callback` routes，token 存 Supabase Vault）
- [ ] **Task 46** `[新增]` — `/api/reports/preview` route（查詢資料，回傳報表 JSON）
- [ ] **Task 47** `[新增]` — Supabase Edge Function `generate-report`（查詢資料 + 產生 Excel + Gmail API 寄出）
- [ ] **Task 48** `[修改]` — 設定 pg_cron，依 `report_schedules` 動態新增/刪除 cron job（觸發 Edge Function）
- [ ] **Task 49** `[新增]` — 新增報表管理頁 `/admin/reports`（Gmail 狀態、立即產生、排程規則 CRUD）

---

## 二十二、v1.0 — 任務管理 + Teams 整合

### 22.1 資料表

#### `tasks`
| 欄位 | 型別 | 說明 |
|------|------|------|
| id | uuid (PK) | 主鍵 |
| title | text (NOT NULL) | 任務標題 |
| description | text (nullable) | 任務說明 |
| assigned_by | uuid (FK → users.id) | 指派人 |
| remind_at | timestamptz (nullable) | 提醒時間 |
| created_at | timestamptz (default now()) | 建立時間 |

#### `task_assignees`
| 欄位 | 型別 | 說明 |
|------|------|------|
| id | uuid (PK) | 主鍵 |
| task_id | uuid (FK → tasks.id, ON DELETE CASCADE) | 所屬任務 |
| user_id | uuid (FK → users.id) | 被指派人 |
| status | text (default 'pending') | `pending` / `done` / `cancelled` |
| completed_at | timestamptz (nullable) | 完成時間 |
| completed_by | uuid (FK → users.id, nullable) | 標記完成的人（本人或助理） |

#### `user_assistants`（助理關係）
| 欄位 | 型別 | 說明 |
|------|------|------|
| manager_id | uuid (FK → users.id, ON DELETE CASCADE) | 主管 |
| assistant_id | uuid (FK → users.id, ON DELETE CASCADE) | 助理 |
| PRIMARY KEY (manager_id, assistant_id) | | 複合主鍵 |

> 一個主管可有多位助理，一個助理可協助多位主管。

---

### 22.2 Bot 指令

#### `/work` / `/w`（建立任務）

**指派給別人：**
```
/w 請 Luna 做 XXX
/w 請 Luna 和 David 準備下週的簡報
```
流程：
1. AI 解析訊息，識別人名（查詢 `users.display_name` 模糊比對）
2. 若有多個人名：各自建立 `task_assignees` 記錄
3. 找不到對應使用者：Bot 回問「找不到 Luna，請確認姓名」
4. 確認後：
   - 建立 `tasks` 記錄
   - 同時發 Telegram 通知給被指派人：「{指派人} 指派了一個任務給你：XXX」
   - 同時發 Teams 訊息給被指派人（Adaptive Card）
5. Bot 回覆：「✅ 已通知 Luna（Telegram + Teams）」

**提醒自己：**
```
/w 下週提醒我做 XXX
/w 明天早上九點提醒我回覆報價
/w 三天後提醒我跟進王小明
```
流程：
1. AI 解析時間（呼叫 Gemini 解析自然語言時間）
2. 若時間模糊（如「下週」），預設下週一 09:00，Bot 回覆「已設定提醒：下週一 2026-03-23 09:00，是否確認？」附 `[✅ 確認]` `[✏️ 修改時間]`
3. 確認後建立 `tasks`，`assigned_by` = 自己，`task_assignees.user_id` = 自己

#### `/tasks` / `/t`（查看我的任務）

回傳待處理任務列表：
```
📋 你的待處理任務（3 筆）

1. 做 XXX（自己設定，2026-03-20 09:00）
2. 回覆報價（Luna 指派，無截止時間）
3. 準備簡報（David 指派，2026-03-22）

回覆數字選擇操作
```
選擇後附按鈕：`[✅ 標記完成]` `[⏰ 延後1小時]` `[❌ 取消]`

---

### 22.3 提醒觸發機制

- pg_cron 每分鐘掃描 `tasks` 中 `remind_at <= now()` 且 `status = pending` 的記錄
- 呼叫 Supabase Edge Function `send-reminder`
- Edge Function 同時：
  - 發 Telegram Bot 訊息給每位 `task_assignees` 的 Telegram（若已綁定）
  - 發 Teams Adaptive Card 給每位被指派人（用 Graph API）
- Telegram 訊息附按鈕：`[✅ 完成]` `[⏰ 延後1小時]` `[❌ 取消]`
- Teams Adaptive Card 附按鈕：`[✅ 完成]` `[⏰ 延後1小時]`
- 按鈕觸發後更新 `task_assignees.status`，並通知指派人

---

### 22.4 Teams Bot 設定

- 在 Azure AD 註冊 Bot Channel Registration
- Bot endpoint：`https://{your-domain}/api/teams/callback`
- 申請 Graph API permissions：
  - `Chat.ReadWrite`（Delegated）— 發私訊
  - `ChannelMessage.Send`（Delegated）— 發頻道訊息
- Teams Adaptive Card 按鈕回調 URL：`https://{your-domain}/api/teams/actions`

**新增環境變數：**
```env
TEAMS_BOT_APP_ID=
TEAMS_BOT_APP_SECRET=
TEAMS_TENANT_ID=
```

---

### 22.5 網頁任務管理頁 `/tasks`

#### 三個 Tab

**Tab 1：我的提醒**
- 列出 `assigned_by = 我` 且 `task_assignees.user_id = 我` 的任務（提醒自己）
- 欄位：任務內容、提醒時間、狀態
- 可標記完成、取消、編輯提醒時間

**Tab 2：我指派的**
- 列出 `assigned_by = 我` 且有其他人被指派的任務
- 每個任務展開顯示每位被指派人的狀態（待處理 / 已完成 / 已取消）
- 可催促（重新發通知）、取消任務

**Tab 3：指派給我的**
- 列出 `task_assignees.user_id = 我` 且 `assigned_by ≠ 我` 的任務
- 可標記完成、取消

#### 助理視角
- 助理登入後，在 Tab 2 可看到所屬**每位主管**的「我指派的」任務（有標示「{主管名} 的任務」）
- 助理可代為標記完成，`completed_by` 記錄助理的 user_id
- 助理**不能**新增或指派任務

#### 搜尋
- 每個 Tab 都有關鍵字搜尋（搜尋 `tasks.title`）
- 可篩選狀態：全部 / 待處理 / 已完成 / 已取消

#### 新增任務按鈕
- 填寫：任務標題、說明（可選）、指派對象（可多選，不選 = 提醒自己）、提醒時間（可選）
- 儲存後同步發 Telegram + Teams 通知

---

### 22.6 個人設定頁更新

新增「我的助理」區塊：
- 列出目前設定的助理
- 新增助理：從 `users` 搜尋選擇
- 移除助理

---

### 22.7 Migration SQL

```sql
-- 任務主表
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  assigned_by uuid references users(id),
  remind_at timestamptz,
  created_at timestamptz default now()
);

-- 任務被指派人
create table if not exists task_assignees (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks(id) on delete cascade,
  user_id uuid references users(id),
  status text not null default 'pending',
  completed_at timestamptz,
  completed_by uuid references users(id)
);

-- 助理關係
create table if not exists user_assistants (
  manager_id uuid references users(id) on delete cascade,
  assistant_id uuid references users(id) on delete cascade,
  primary key (manager_id, assistant_id)
);
```

---

## 二十三、v1.0 開發任務清單

- [ ] **Task 50** `[修改]` — 執行 Migration SQL（tasks、task_assignees、user_assistants）
- [ ] **Task 51** `[修改]` — 更新 Bot Webhook（`/work`、`/w`、`/tasks`、`/t` 指令，AI 解析人名和時間）
- [ ] **Task 52** `[新增]` — Supabase Edge Function `send-reminder`（pg_cron 每分鐘觸發，發 Telegram + Teams）
- [ ] **Task 53** `[新增]` — Teams Bot 設定（`/api/teams/callback`、`/api/teams/actions` routes，Adaptive Card）
- [ ] **Task 54** `[新增]` — 新增任務管理頁 `/tasks`（三個 Tab、搜尋、助理視角、新增任務）
- [ ] **Task 55** `[修改]` — 更新個人設定頁（新增「我的助理」管理區塊）
- [ ] **Task 56** `[修改]` — 更新 Dashboard Layout（Sidebar 新增「任務管理」項目）

---

## 二十四、v1.2 功能規格

### 24.1 Email Copy 按鈕

**聯絡人列表 `/contacts`**
- Email 欄位旁加一個 📋 copy icon 按鈕
- 點擊後複製 email 到剪貼簿
- 顯示「✅ 已複製」tooltip，1.5 秒後消失

**聯絡人詳情 `/contacts/[id]`**
- 同上，Email 和 second_email 欄位旁都加 copy 按鈕

---

### 24.2 多張名片照片上傳（最多 6 張）

#### 新增聯絡人 `/contacts/new`

- 照片上傳區支援最多 **6 張**照片（正面 / 反面 / 其他名片）
- 所有圖片上傳前先壓縮（1024px、JPEG Q85）
- 點「開始辨識」後，6 張一起送 Gemini，合併辨識結果
- AI 自動選最完整的欄位值填入表單
- 若同一欄位在不同張名片有衝突值，AI 選信心度最高的，使用者可手動修改
- **確認介面**：
  - 左側：可點開放大的照片縮圖列表（支援左右切換）
  - 右側：辨識結果表單（可逐欄修改）
  - 方便使用者人工比對照片與 AI 辨識資料

#### 編輯聯絡人（名片管理獨立區塊）

- 編輯表單只包含文字欄位，照片上傳移至「名片管理」獨立區塊
- 名片管理區塊支援上傳最多 **6 張**新照片
- 上傳前壓縮（1024px、JPEG Q85）
- 送 Gemini 合併辨識，結果用來**補充**現有欄位（空白欄位才填入，已有資料不覆蓋）
- 使用者確認後存入 `contact_cards` 子表

---

### 24.3 國家欄位

#### `countries` 資料表（super_admin 管理）
| 欄位 | 型別 | 說明 |
|------|------|------|
| id | uuid (PK) | 主鍵 |
| name_zh | text (NOT NULL) | 繁體中文名稱 |
| name_en | text (NOT NULL) | 英文名稱 |
| name_ja | text (NOT NULL) | 日文名稱 |
| emoji | text | 旗幟 emoji，如 🇯🇵 |
| code | text (UNIQUE, NOT NULL) | ISO 國碼，如 `JP`、`TW` |
| is_active | boolean (default true) | 是否顯示於 dropdown |
| created_at | timestamptz (default now()) | 建立時間 |

**初始資料：**
```sql
insert into countries (name_zh, name_en, name_ja, emoji, code) values
  ('台灣', 'Taiwan', '台湾', '🇹🇼', 'TW'),
  ('日本', 'Japan', '日本', '🇯🇵', 'JP'),
  ('美國', 'United States', 'アメリカ', '🇺🇸', 'US'),
  ('韓國', 'South Korea', '韓国', '🇰🇷', 'KR'),
  ('新加坡', 'Singapore', 'シンガポール', '🇸🇬', 'SG'),
  ('印度', 'India', 'インド', '🇮🇳', 'IN')
on conflict (code) do nothing;
```

#### `contacts` 表新增欄位
```sql
alter table contacts add column if not exists country_code text references countries(code);
```

#### AI 自動判斷國家

Gemini OCR prompt 新增國家辨識，依據：
- 電話號碼國碼（`+81` → JP，`+886` → TW）
- 地址內容
- 公司名稱語言特徵
- 回傳 ISO 國碼（如 `JP`、`TW`），找不到則回傳 `null`

OCR JSON 新增欄位：
```json
"country_code": "JP"
```

#### `/admin/countries` 頁面（僅 super_admin）
- 列出所有國家（emoji + 名稱 + code + is_active）
- 新增國家（填四個欄位）
- 切換 is_active
- 編輯、刪除

---

### 24.4 寄信功能強化

#### 全新寄信介面（取代現有陽春 Modal）

從聯絡人詳情頁點「寄信」後，開啟**全頁或大型 Modal**，包含：

**收件人區塊**
- 預帶聯絡人 email（可修改）
- 顯示收件人姓名、公司（context 用，不顯示在信件）

**Template 選擇**
- Dropdown 選擇 email template
- 選擇後自動帶入 subject、body_content
- **附件自動帶入**：template 的附件（`template_attachments`）自動列入附件清單

**AI 寫信**
- 「AI 生成」按鈕
- AI context：
  - 收件人姓名、公司、職稱
  - 最近 **1 筆** interaction_log 內容（自動抓取）
- 使用者輸入描述後 AI 生成完整信件內容填入編輯框
- 可再手動修改

**信件編輯**
- 主旨輸入框
- 內文編輯框（支援基本 HTML 或純文字）

**附件管理**
- 支援臨時上傳多個附件（每次寄信時選）
- 每個檔案限制 **2MB**
- 若選了 template，template 附件自動帶入（可移除）
- 顯示附件清單（檔名 + 大小），可個別刪除

**發送**
- 「確認發送」按鈕
- 寄出後寫入 interaction_log：
  - type = `email`
  - email_subject = 主旨
  - content = 完整內文
  - email_attachments = 附件檔名陣列（只存檔名，不存檔案）

---

### 24.5 手機 / 平板 RWD Sidebar

#### 手機（< 768px）
- Sidebar 預設**隱藏**
- 左上角顯示 ☰ hamburger 按鈕
- 點擊後 sidebar 從左側滑出（overlay，帶半透明遮罩）
- 點遮罩或任意選單項目後關閉 sidebar

#### 平板（768px – 1024px）
- Sidebar 預設收縮為**只顯示 icon**（不顯示文字）
- 點擊 icon 直接導向對應頁面
- sidebar 右上角有 `>` 按鈕，點擊展開為完整模式（顯示文字）
- 展開狀態用 localStorage 記住

#### 桌面（> 1024px）
- 現有完整 sidebar，不變

---

### 24.6 圖片壓縮規範（全站統一）

所有圖片上傳點一律壓縮後再處理：
- 長邊最大 **1024px**（等比例縮放）
- 格式：**JPEG**，品質 **85**
- 適用範圍：Bot 名片上傳、網頁新增聯絡人、網頁編輯名片、批次上傳、template 附件**以外**的所有圖片

---

### 24.7 Migration SQL

```sql
-- 國家資料表
create table if not exists countries (
  id uuid primary key default gen_random_uuid(),
  name_zh text not null,
  name_en text not null,
  name_ja text not null,
  emoji text,
  code text unique not null,
  is_active boolean not null default true,
  created_at timestamptz default now()
);

-- 初始國家資料
insert into countries (name_zh, name_en, name_ja, emoji, code) values
  ('台灣', 'Taiwan', '台湾', '🇹🇼', 'TW'),
  ('日本', 'Japan', '日本', '🇯🇵', 'JP'),
  ('美國', 'United States', 'アメリカ', '🇺🇸', 'US'),
  ('韓國', 'South Korea', '韓国', '🇰🇷', 'KR'),
  ('新加坡', 'Singapore', 'シンガポール', '🇸🇬', 'SG'),
  ('印度', 'India', 'インド', '🇮🇳', 'IN')
on conflict (code) do nothing;

-- contacts 新增 country_code
alter table contacts add column if not exists country_code text references countries(code);
```

---

## 二十五、v1.2 開發任務清單

- [ ] **Task 57** `[修改]` — 執行 Migration SQL（countries 表 + 初始資料、contacts.country_code）
- [ ] **Task 58** `[修改]` — 更新 Gemini OCR prompt（新增 country_code 辨識）；更新 `src/lib/gemini.ts`
- [ ] **Task 59** `[修改]` — 更新聯絡人列表（Email copy 按鈕）
- [ ] **Task 60** `[修改]` — 更新聯絡人詳情（Email copy 按鈕、名片管理獨立區塊支援多張、全新寄信介面）
- [ ] **Task 61** `[修改]` — 更新新增聯絡人頁（多張照片上傳最多6張、壓縮、合併辨識、左右對照確認介面）
- [ ] **Task 62** `[新增]` — 新增國家管理頁 `/admin/countries`（super_admin，CRUD + is_active 切換）
- [ ] **Task 63** `[修改]` — 更新 Dashboard Layout（Sidebar RWD：手機 hamburger、平板 icon-only + 展開）
- [ ] **Task 64** `[修改]` — 更新 `/docs` 說明書（同步 v1.2 新功能：多張名片、國家欄位、寄信強化、sidebar）
- [ ] **Task 65** `[修改]` — i18n 語言檔新增 v1.2 相關 key（countries、copyEmail、sendEmail 強化）

---

## 二十四、v1.3 功能規格

### 24.1 說明書多國語言

#### 設計原則
- 預先生成三種語言版本，存入資料庫，切換語言只是顯示不同內容，不消耗 AI token
- 部署時自動觸發重新生成

#### 資料表

**`docs_content`**
| 欄位 | 型別 | 說明 |
|------|------|------|
| id | uuid (PK) | 主鍵 |
| locale | text (NOT NULL) | `zh-TW` / `en` / `ja` |
| section | text (NOT NULL) | `user` / `super_admin` |
| content | text | 生成的 Markdown 內容 |
| generated_at | timestamptz | 生成時間 |
| UNIQUE (locale, section) | | 每個語言每個 section 唯一一筆 |

#### 生成流程
1. Vercel build 時呼叫 `/api/docs/generate`（POST）
2. API route 讀取 `docs/PRD.md`
3. 分別呼叫 AI 生成 zh-TW、en、ja 三種語言 × user、super_admin 兩個 section = 共 6 次呼叫
4. 結果 upsert 進 `docs_content` 表

#### `/docs` 頁面更新
- 頁面頂部加語言切換按鈕：`繁中` `English` `日本語`
- 切換時從 `docs_content` 表撈對應語言的內容顯示
- 預設語言跟隨使用者的 `users.locale` 設定

---

### 24.2 Prompt 自訂

#### 層級設計
```
系統 hardcode（程式碼預設值）
    ↓ super admin 可修改組織預設，可「還原成系統預設」
組織預設（存 prompts 表）
    ↓ 個人可修改，可「還原成組織預設」
個人設定（存 user_prompts 表）
```

使用順序：個人設定 → 組織預設 → 系統 hardcode

#### Prompt 清單

| key | 說明 | Super Admin 可改 | 個人可改 |
|-----|------|-----------------|---------|
| `ocr_card` | 名片 OCR | ✅ | ❌ |
| `email_generate` | Email 內容生成 | ✅ | ✅ |
| `task_parse` | 任務 AI 解析 | ✅ | ❌ |
| `docs_generate` | 說明書生成 | ✅ | ❌ |

#### 資料表

**`prompts`**（組織預設，super admin 管理）
| 欄位 | 型別 | 說明 |
|------|------|------|
| id | uuid (PK) | 主鍵 |
| key | text (UNIQUE, NOT NULL) | prompt 識別鍵，如 `ocr_card` |
| content | text (NOT NULL) | prompt 內容 |
| updated_by | uuid (FK → users.id) | 最後修改者 |
| updated_at | timestamptz | 最後修改時間 |

**`user_prompts`**（個人覆蓋）
| 欄位 | 型別 | 說明 |
|------|------|------|
| id | uuid (PK) | 主鍵 |
| user_id | uuid (FK → users.id, ON DELETE CASCADE) | 使用者 |
| key | text (NOT NULL) | prompt 識別鍵（限 `email_generate`） |
| content | text (NOT NULL) | 個人 prompt 內容 |
| updated_at | timestamptz | 最後修改時間 |
| UNIQUE (user_id, key) | | 每人每個 key 唯一一筆 |

#### Super Admin 管理頁面（`/admin/prompts`）
- 列出所有可管理的 prompt（4 個）
- 每個 prompt 顯示：目前內容（組織預設或系統 hardcode）、最後修改者、修改時間
- 點「編輯」開啟大型 textarea 修改
- 「還原成系統預設」按鈕：清除 `prompts` 表該筆記錄，回到 hardcode
- 儲存後更新 `prompts` 表

#### 個人設定頁（`/settings`）新增 Prompt 區塊
- 只顯示 `email_generate` prompt
- 顯示目前使用的內容（個人設定 or 組織預設，標示來源）
- 點「編輯」修改個人 prompt
- 「還原成組織預設」按鈕：清除 `user_prompts` 該筆記錄

#### 系統 hardcode 預設值（供還原參考）
程式碼中以 `SYSTEM_PROMPTS` 常數定義，`src/lib/prompts.ts` 統一管理：
```typescript
export const SYSTEM_PROMPTS = {
  ocr_card: `你是一個專業名片辨識助手...`,
  email_generate: `你是一個專業的商務郵件撰寫助手...`,
  task_parse: `你是一個任務解析助手...`,
  docs_generate: `你是一個技術文件撰寫專家...`,
}
```

---

### 24.3 報表權限調整

#### 一般使用者
- 只能看到自己建立的 `report_schedules`
- 立即產生報表：資料範圍限「自己新增的聯絡人」和「自己的互動紀錄」
- 定時報表：同上，資料範圍限個人

#### Super Admin
- 可看到並管理所有人的 `report_schedules`
- 立即產生 / 定時報表：資料範圍為全組織

#### DB 變更
```sql
-- report_schedules 新增 owner_id
alter table report_schedules add column if not exists owner_id uuid references users(id);
-- 更新現有記錄：owner_id = created_by
update report_schedules set owner_id = created_by where owner_id is null;
```

#### `/admin/reports` 頁面更新
- Super admin：顯示所有規則，每筆顯示建立者
- 一般使用者：只顯示自己的規則
- 立即產生時依角色自動套用資料範圍

---

### 24.4 聯絡人國家欄位與篩選

#### 新增聯絡人 `/contacts/new` 更新
- 表單新增「國家」欄位（dropdown，從 `countries` 表撈 is_active=true 的項目）
- 顯示旗幟 emoji + 國家名稱（依目前語言顯示）

#### 聯絡人列表 `/contacts` 更新
- 篩選列新增「國家」dropdown（多選，從 `countries` 表動態載入）
- 國家篩選與 Tag 篩選可同時使用

---

### 24.5 Migration SQL

```sql
-- 說明書內容
create table if not exists docs_content (
  id uuid primary key default gen_random_uuid(),
  locale text not null,
  section text not null,
  content text,
  generated_at timestamptz default now(),
  unique (locale, section)
);

-- 組織預設 prompt
create table if not exists prompts (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  content text not null,
  updated_by uuid references users(id),
  updated_at timestamptz default now()
);

-- 個人 prompt 覆蓋
create table if not exists user_prompts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  key text not null,
  content text not null,
  updated_at timestamptz default now(),
  unique (user_id, key)
);

-- report_schedules 新增 owner_id
alter table report_schedules add column if not exists owner_id uuid references users(id);
update report_schedules set owner_id = created_by where owner_id is null;
```

---

## 二十五、v1.3 開發任務清單

- [ ] **Task 66** `[修改]` — 執行 Migration SQL（docs_content、prompts、user_prompts、report_schedules.owner_id）
- [ ] **Task 67** `[新增]` — 新增 `src/lib/prompts.ts`（SYSTEM_PROMPTS 常數 + getPrompt() 函式，依層級取 prompt）
- [ ] **Task 68** `[新增]` — 新增 `/api/docs/generate` route（讀 PRD、呼叫 AI 生成 6 份內容、upsert docs_content）；設定 Vercel build hook 自動觸發
- [ ] **Task 69** `[修改]` — 更新 `/docs` 頁面（語言切換按鈕、從 docs_content 撈內容）
- [ ] **Task 70** `[新增]` — 新增 Prompt 管理頁 `/admin/prompts`（4 個 prompt 的編輯 + 還原系統預設）
- [ ] **Task 71** `[修改]` — 更新個人設定頁 `/settings`（新增 email_generate prompt 編輯區塊 + 還原組織預設）
- [ ] **Task 72** `[修改]` — 更新所有 AI 呼叫處（OCR、email 生成、任務解析、說明書生成）改為呼叫 `getPrompt()`
- [ ] **Task 73** `[修改]` — 更新報表頁 `/admin/reports`（依角色過濾規則，資料範圍加入 owner_id 判斷）
- [ ] **Task 74** `[修改]` — 更新新增聯絡人頁 `/contacts/new`（補國家欄位）
- [ ] **Task 75** `[修改]` — 更新聯絡人列表 `/contacts`（新增國家篩選 dropdown）

---

## 二十六、v1.3 補充功能規格（Dashboard 統計互動 + 聯絡人排序）

### 26.1 Dashboard 國家統計區塊

#### 新增 `CountryStat` interface
```ts
interface CountryStat {
  code: string    // ISO 國碼，或 '__other__' 代表未設定
  name: string    // 依目前 locale 顯示 name_zh / name_en / name_ja
  emoji: string | null
  count: number
}
```

#### 資料載入
新增 `loadCountryStats()` 函式，流程：
1. 查詢 `contacts` 的 `country_code`，join `countries` 取 `name_zh`/`name_en`/`name_ja`/`emoji`
2. Group by 國家，依 count 降序排列
3. `country_code IS NULL` 的聯絡人歸入「其他 / 未設定」（`code: '__other__'`）
4. count = 0 的國家不顯示

#### UI 位置
放在 Tag 分布區塊正下方，樣式與 Tag 分布長條圖一致。

#### 可點擊行為
每一行包在 `<Link href="/contacts?country={code}">` 內：
- 一般國碼：`/contacts?country=TW`
- 未設定：`/contacts?country=__other__`
- hover 效果：底色加深（`hover:bg-gray-50 dark:hover:bg-gray-800`）+ 右側顯示 `›` 箭頭

#### i18n 新增 key（`dashboard` namespace，三份語言檔都要加）
```json
"countryDistribution": "國家分布",
"countryOther": "其他 / 未設定"
```

---

### 26.2 Dashboard Tag 統計可點擊跳轉

#### 修改範圍
`src/app/(dashboard)/page.tsx` 的 Tag 分布區塊。

現有每一行的外層 `<div key={tag.name}>` 改為：
```tsx
<Link
  href={`/contacts?tag=${encodeURIComponent(tag.name)}`}
  className="flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg px-2 -mx-2 cursor-pointer"
>
  {/* 原有內容不變 */}
  <ChevronRight size={14} className="text-gray-300 dark:text-gray-600 shrink-0" />
</Link>
```

> 使用 `tag.name` 作為 query 參數（contacts page 會自動比對 name → id）。

---

### 26.3 聯絡人列表：URL query 篩選 + 欄位排序

#### A. URL query 參數初始化（支援 Dashboard 跳轉）

在 `ContactsPage` 頂部加入 `useSearchParams()`，讀取以下參數並設定初始 state：

| 參數 | 行為 |
|------|------|
| `?tag={tagName}` | 自動比對 `allTags.find(t => t.name === tagName)`，找到則設入 `selectedTags` |
| `?country={code}` | 設入 `selectedCountries`（含 `__other__`） |

> `useSearchParams()` 需包在 `<Suspense>` 內，或直接在現有 `'use client'` 頁面使用（Next.js App Router client component 可直接呼叫）。

#### B. 國家篩選 UI

在 Tag 篩選 dropdown 旁新增「國家篩選」dropdown，邏輯與 Tag 篩選完全相同。

新增 state：
```ts
const [selectedCountries, setSelectedCountries] = useState<string[]>([])
const [countryDropdownOpen, setCountryDropdownOpen] = useState(false)
const [allCountries, setAllCountries] = useState<{ code: string; name: string; emoji: string | null }[]>([])
```

資料載入：從 `countries` 表撈 `is_active=true`，依 `name_zh`/`name_en`/`name_ja`（依 locale）排序，最後附加「其他 / 未設定」選項（`code: '__other__'`）。

`contacts` select query 補上 `country_code`。

篩選邏輯（加入現有的 `filtered` 計算中）：
```ts
const matchCountry =
  selectedCountries.length === 0 ||
  selectedCountries.some((code) =>
    code === '__other__' ? !c.country_code : c.country_code === code
  )
```

#### C. `job_title` 欄排序

新增 state：
```ts
const [sortField, setSortField] = useState<'job_title' | null>(null)
const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
```

「職稱」header 點擊行為（三段式循環）：
1. `sortField === null` → 設 `sortField = 'job_title'`, `sortDir = 'asc'`
2. `sortField === 'job_title'` && `sortDir === 'asc'` → 設 `sortDir = 'desc'`
3. `sortField === 'job_title'` && `sortDir === 'desc'` → 設 `sortField = null`

排序在 `filtered` 陣列之後、`paginated` 切割之前套用（client-side）：
```ts
const sorted = sortField
  ? [...filtered].sort((a, b) => {
      const va = a.job_title ?? ''
      const vb = b.job_title ?? ''
      if (!va && !vb) return 0
      if (!va) return 1   // null 排最後
      if (!vb) return -1
      return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
    })
  : filtered
const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
```

Header 顯示排序圖示（使用已有的 `lucide-react`）：
- 無排序：`<ChevronsUpDown size={12} className="text-gray-400" />`
- asc：`<ChevronUp size={12} className="text-blue-500" />`
- desc：`<ChevronDown size={12} className="text-blue-500" />`

只有「職稱」欄有此行為，其餘欄位 header 不變。

#### i18n 新增 key（`contacts` namespace，三份語言檔都要加）
```json
"countryFilter": "國家篩選"
```

---

## 二十七、v1.3 補充任務清單

- [x] **Task 76** `[修改]` — Dashboard 新增國家統計區塊（`loadCountryStats()`，長條圖，每行可點擊跳轉 `/contacts?country={code}`）；修改檔案：`src/app/(dashboard)/page.tsx`、`messages/zh-TW.json`、`messages/en.json`、`messages/ja.json`
- [x] **Task 77** `[修改]` — Dashboard Tag 分布區塊改為可點擊（每行包 `<Link href="/contacts?tag={name}">`，加 `›` 箭頭）；修改檔案：`src/app/(dashboard)/page.tsx`
- [x] **Task 78** `[修改]` — 聯絡人列表新增：(A) `useSearchParams()` 讀取 `?tag` / `?country` 初始化篩選、(B) 國家篩選 dropdown、(C) 職稱欄三段式排序（asc/desc/無）；修改檔案：`src/app/(dashboard)/contacts/page.tsx`、`messages/zh-TW.json`、`messages/en.json`、`messages/ja.json`

---

## 二十八、v1.4 功能規格（✅ 已完成）

> 主軸：寄信功能完整化、名片瀏覽體驗、文件自動化

### 28.1 寄信功能強化

#### CC / BCC 多收件人
- 寄信 Modal 新增「副本（CC）」與「密件副本（BCC）」欄位
- To / CC / BCC 均支援逗號分隔多個地址
- `graph.ts` `sendMail()` 新增 `cc` / `bcc` 參數，解析後填入 Graph API `ccRecipients` / `bccRecipients`

#### 收件人 Chip 選擇器
- To / CC / BCC 改為 chip 輸入元件（`RecipientChipInput`）
- 輸入名字或 email 可即時搜尋 CRM 聯絡人，點選加入；按 Enter 或逗號確認任意 email
- 輸入框失去焦點（`onBlur`）自動確認已輸入的 email，避免遺漏

#### AI 同時生成主旨
- AI 生成信件時一次回傳 `{ subject, text }`，自動填入主旨欄與內文
- `gemini.ts` `generateEmailContent()` 新增 `generateSubject` 參數
- 語言以使用者描述（prompt）為準，不受範本語言影響
- 內文改為純文字（無 HTML 標籤），以 `\n` 換行

#### 多聯絡人互動紀錄
- 寄信後，所有被選到的 CRM 聯絡人均自動新增 `email` 類型互動紀錄
- 紀錄含：信件主旨（`email_subject`）、純文字內文（`email_body`）、附件檔名清單（`email_attachments`）
- `interaction_logs` 表新增 `email_subject text`、`email_body text`、`email_attachments text[]` 欄位
- 聯絡人頁面互動紀錄列表：email 類型可展開查看主旨、內文、附件

### 28.2 名片圖片 Lightbox

- 聯絡人詳情頁名片縮圖：hover 顯示放大鏡，點擊開啟全螢幕 Lightbox
- Lightbox 支援：滾輪縮放、拖曳平移、雙指捏合（mobile）
- 關閉方式：點擊背景遮罩、右上角 ✕、或 Escape 鍵

### 28.3 Vercel Cron 自動文件生成

- 新增 `vercel.json` 排程：每日凌晨 2:00（台北時間）觸發 `/api/docs/cron`
- Cron 呼叫 `/generate-docs` 邏輯，重新生成 6 份說明書（zh-TW / en / ja × user / super_admin）並 upsert 進 Supabase `docs_content` 表

### 28.4 Microsoft Token 管理

- `graph-server.ts`（新增，server-only）：`getValidProviderToken(userId)` 檢查 token 到期時間，自動呼叫 Microsoft 刷新
- 登入時加入 `offline_access` scope，取得並儲存 `refresh_token`
- 新增 `/api/provider-token` GET 端點：前端寄信前呼叫，確保取得最新 access token
- Bot（Telegram / Teams）寄信、建立行程統一改用 `getValidProviderToken()`

---

## 二十九、v1.5 功能規格（✅ 已完成）

> 主軸：行程排程指令、聯絡人管理補強、Bot 穩定性

### 29.1 /meet 行程排程指令

#### 支援平台
- Telegram Bot：`/meet` / `/m`
- Teams Bot：`/meet` / `/m`

#### AI 解析
- 使用 Gemini 解析自然語言描述，提取：
  - 標題、開始時間（ISO UTC）、時長（30 / 60 / 90 / 120 分鐘）
  - 參與者（僅組織內成員，從 `users` 表比對）
  - 地點（選填）
- 解析結果暫存至 `meeting_drafts` 資料表

#### 確認流程
- Telegram：inline keyboard 顯示「確認建立 ✅」與「取消 ❌」
- Teams：Adaptive Card 含確認與取消按鈕
- 確認後呼叫 Microsoft Graph `POST /me/events`，自動發送 Outlook 日曆邀請給所有被點名的成員
- 確認或取消後刪除 `meeting_drafts` 記錄

#### 新增 DB 表：`meeting_drafts`
| 欄位 | 型別 | 說明 |
|------|------|------|
| id | uuid (PK) | |
| user_id | uuid | 建立者 |
| title | text | 會議標題 |
| start_at | timestamptz | 開始時間 |
| duration_minutes | int | 30 / 60 / 90 / 120 |
| attendee_ids | uuid[] | 參與者 user id |
| location | text | 地點（可為 null）|
| created_at | timestamptz | |

### 29.2 聯絡人管理補強

#### 刪除聯絡人
- `super_admin` 可刪除任何聯絡人
- 一般使用者可刪除自己上傳的聯絡人
- 刪除前確認 Modal，刪除後跳轉聯絡人列表

#### 新增聯絡人照片上傳
- Web 新增聯絡人頁面支援上傳正面、反面名片照
- 改用 `/api/upload-card`（server route，使用 service client）繞過 RLS 限制
- 任一上傳失敗則 rollback 刪除剛建立的聯絡人

### 29.3 Bot 穩定性

#### 名片辨識失敗改進
- 重構為「先上傳圖片、再 OCR」：OCR 失敗時圖片已存在 Storage，可存入 `failed_scans`
- catch block 錯誤序列化：非 Error 物件改用 `JSON.stringify` 避免輸出 `[object Object]`
- 確認存檔時過濾 `rotation` 欄位（OCR 專用，contacts 表無此欄）

#### `contact_cards` 欄位修正
- 實際欄位為 `card_img_url`（非 `url`），相關查詢、插入、顯示全數修正
- 新增 `storage_path` 欄位用於 Storage 路徑記錄


---

## 二十六、v1.6 — Newsletter 功能

### 26.1 架構概覽

```
Super Admin 建立 Campaign
  → 選收件人（Tag 聯集 + 手動勾選）- 退訂者 - 黑名單
  → 編輯內容（富文字編輯器）
  → 設定排程（開始時間、每天幾封、幾點寄）
  → 系統分批寄送（pg_cron 觸發 Supabase Edge Function）
  → SendGrid API 發送
  → SendGrid Event Webhook 回傳事件
  → 同步開信/點擊/退訂到資料庫
  → 每個收件人寫一筆 interaction_log
```

---

### 26.2 資料表

#### `newsletter_campaigns`
| 欄位 | 型別 | 說明 |
|------|------|------|
| id | uuid (PK) | 主鍵 |
| title | text (NOT NULL) | Campaign 名稱（內部用） |
| subject | text (NOT NULL) | 郵件主旨 |
| preview_text | text | 預覽文字（inbox 顯示的摘要） |
| content_html | text | 郵件內文 HTML |
| content_json | jsonb | 編輯器原始資料（供再編輯） |
| tag_ids | uuid[] | 選取的 Tag ID 陣列 |
| extra_contact_ids | uuid[] | 手動加選的聯絡人 ID 陣列 |
| status | text (default 'draft') | `draft` / `scheduled` / `sending` / `paused` / `sent` |
| scheduled_at | timestamptz | 開始寄送時間 |
| daily_limit | int (default 500) | 每天寄幾封 |
| send_hour | int (default 9) | 每天幾點寄（UTC+8，0-23） |
| total_recipients | int | 預計寄送總人數 |
| sent_count | int (default 0) | 已寄送數量 |
| created_by | uuid (FK → users.id) | 建立者 |
| created_at | timestamptz (default now()) | 建立時間 |
| sent_at | timestamptz | 全部寄完時間 |

#### `newsletter_recipients`
| 欄位 | 型別 | 說明 |
|------|------|------|
| id | uuid (PK) | 主鍵 |
| campaign_id | uuid (FK → newsletter_campaigns.id, ON DELETE CASCADE) | 所屬 Campaign |
| contact_id | uuid (FK → contacts.id) | 聯絡人 |
| email | text (NOT NULL) | 寄送 email（快照，避免聯絡人 email 變更影響） |
| status | text (default 'pending') | `pending` / `sent` / `failed` |
| sent_at | timestamptz | 實際寄出時間 |
| opened_at | timestamptz | 開信時間（SendGrid webhook 更新） |
| clicked_at | timestamptz | 首次點擊時間 |
| sendgrid_message_id | text | SendGrid message ID（用於對應 webhook 事件） |

#### `newsletter_unsubscribes`
| 欄位 | 型別 | 說明 |
|------|------|------|
| id | uuid (PK) | 主鍵 |
| email | text (UNIQUE, NOT NULL) | 退訂 email |
| contact_id | uuid (FK → contacts.id, nullable) | 對應聯絡人（若有） |
| reason | text (nullable) | 退訂原因（退訂頁面選填） |
| unsubscribed_at | timestamptz (default now()) | 退訂時間 |
| source | text | `webhook`（SendGrid 回傳）/ `manual`（手動加入）|

#### `newsletter_blacklist`
| 欄位 | 型別 | 說明 |
|------|------|------|
| id | uuid (PK) | 主鍵 |
| email | text (UNIQUE, NOT NULL) | 黑名單 email |
| contact_id | uuid (FK → contacts.id, nullable) | 對應聯絡人 |
| reason | text | 原因（hard bounce / spam / 手動）|
| created_by | uuid (FK → users.id, nullable) | 手動加入者 |
| created_at | timestamptz (default now()) | 建立時間 |

---

### 26.3 收件人邏輯

**計算公式：**
```
收件人 = (選取 Tag 的聯絡人 ∪ 手動勾選的聯絡人)
         - newsletter_unsubscribes
         - newsletter_blacklist
         - email 為空的聯絡人
```

**寄送前鎖定名單：**
Campaign 確認排程時，將計算後的收件人快照寫入 `newsletter_recipients` 表（含 email 快照），之後名單不再變動。

---

### 26.4 編輯器

使用 **TipTap**（open source 富文字編輯器，Next.js 友好）：
- 支援：標題、粗體、斜體、連結、圖片插入、無序清單、有序清單、分隔線
- 支援插入變數：`{{name}}`、`{{company}}`、`{{job_title}}`（寄送時自動替換）
- 預覽模式：可即時預覽渲染後的 HTML
- 支援上傳附件（至 Supabase Storage `newsletter-attachments` bucket）
- 底部自動插入退訂連結（不可移除）：`取消訂閱 | Unsubscribe`

---

### 26.5 分批寄送機制

**排程設定：**
- 開始日期時間（台灣時間 UTC+8）
- 每天寄幾封（1–500，預設 500）
- 每天幾點寄（0–23，預設 9）
- 系統自動顯示「預計 X 天完成，預計完成日：YYYY-MM-DD」

**觸發流程：**
1. pg_cron 每天指定時間觸發
2. 呼叫 Supabase Edge Function `send-newsletter`
3. Edge Function 查詢當天需要寄送的 campaign（status=`sending` 或到達 `scheduled_at`）
4. 每個 campaign 取 `daily_limit` 筆 `pending` 的 recipients
5. 呼叫 SendGrid API 逐一發送
6. 更新 `newsletter_recipients.status = 'sent'`、`sent_at`
7. 更新 `newsletter_campaigns.sent_count`
8. 若全部寄完：status = `sent`、`sent_at = now()`

**暫停 / 繼續：**
- Super admin 可隨時將 status 改為 `paused`，pg_cron 跳過 `paused` 的 campaign
- 繼續時改回 `sending`，從剩餘 `pending` 的 recipients 繼續

---

### 26.6 SendGrid 設定

**API 呼叫：**
- 使用 SendGrid v3 API：`POST https://api.sendgrid.com/v3/mail/send`
- 每封信帶入自訂 header `X-Campaign-Id` 和 `X-Recipient-Id`（供 webhook 對應）
- 開啟 Open Tracking 和 Click Tracking

**Event Webhook（`/api/sendgrid/webhook`）：**
- 接收事件：`open`、`click`、`unsubscribe`、`bounce`、`spam_report`
- 驗證 SendGrid Webhook Signature（`SENDGRID_WEBHOOK_SECRET`）
- 事件處理：
  - `open`：更新 `newsletter_recipients.opened_at`
  - `click`：更新 `newsletter_recipients.clicked_at`
  - `unsubscribe`：加入 `newsletter_unsubscribes`，同步 contact 標記
  - `bounce`（hard）：加入 `newsletter_blacklist`，reason = `hard_bounce`
  - `spam_report`：加入 `newsletter_blacklist`，reason = `spam`

---

### 26.7 退訂頁面（`/unsubscribe`）

- 公開頁面，不需登入
- URL 格式：`/unsubscribe?token={jwt_token}`（token 含 email + campaign_id，有效期 90 天）
- 頁面顯示：「您即將取消訂閱來自 cancerfree.io 的電子報」
- 選填退訂原因（radio）：太多信 / 內容不相關 / 不記得訂閱 / 其他
- 可選「降低寄送頻率」替代退訂（記錄偏好，暫不實作限流）
- 確認退訂後：加入 `newsletter_unsubscribes`，顯示「已成功取消訂閱」

---

### 26.8 互動紀錄

每封寄出的 newsletter，對應聯絡人寫一筆 `interaction_logs`：
- `type` = `email`
- `email_subject` = newsletter 主旨
- `content` = `寄送 Newsletter：{campaign title}`
- `created_by` = campaign 建立者

---

### 26.9 網頁管理頁面（`/admin/newsletter`，僅 super_admin）

**Campaign 列表**
- 列出所有 campaigns（標題、狀態 badge、收件人數、已寄/總數進度條、建立時間）
- 可複製 campaign（複製內容和設定，狀態重置為 draft）
- 可刪除 draft 狀態的 campaign

**新增 / 編輯 Campaign**
四個步驟的 Wizard：

1. **基本設定**：Campaign 名稱、郵件主旨、預覽文字
2. **編輯內容**：TipTap 富文字編輯器 + 預覽模式 + 附件上傳 + 寄送測試信（填入 email 立即寄一封）
3. **選擇收件人**：Tag 多選 + 手動勾選聯絡人 + 顯示「預計寄送 X 人」+ 收件人預覽列表（可確認名單）
4. **排程設定**：開始時間、每天封數、每天幾點 + 顯示預計完成日 + 確認送出

**Campaign 詳情頁**
- 基本資訊 + 狀態
- 進度：已寄 X / 總計 Y（進度條）
- 統計：開信率、點擊率（從 newsletter_recipients 計算）
- 暫停 / 繼續按鈕（status = sending / paused 時顯示）
- 收件人列表（可搜尋，顯示每人狀態：待寄/已寄/已開信/已點擊）

**退訂管理**
- 列出 `newsletter_unsubscribes`（email、退訂原因、時間）
- 可手動移除退訂（重新加回寄送名單）

**黑名單管理**
- 列出 `newsletter_blacklist`
- 可手動新增 email 到黑名單
- 可手動移除黑名單

---

### 26.10 環境變數新增

```env
SENDGRID_API_KEY=
SENDGRID_FROM_EMAIL=
SENDGRID_FROM_NAME=
SENDGRID_WEBHOOK_SECRET=
NEXT_PUBLIC_APP_URL=  # 已有，用於退訂連結
```

---

### 26.11 Migration SQL

```sql
-- Newsletter campaign
create table if not exists newsletter_campaigns (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subject text not null,
  preview_text text,
  content_html text,
  content_json jsonb,
  tag_ids uuid[] default '{}',
  extra_contact_ids uuid[] default '{}',
  status text not null default 'draft',
  scheduled_at timestamptz,
  daily_limit int not null default 500,
  send_hour int not null default 9,
  total_recipients int default 0,
  sent_count int default 0,
  created_by uuid references users(id),
  created_at timestamptz default now(),
  sent_at timestamptz
);

-- Newsletter recipients（快照）
create table if not exists newsletter_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references newsletter_campaigns(id) on delete cascade,
  contact_id uuid references contacts(id),
  email text not null,
  status text not null default 'pending',
  sent_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  sendgrid_message_id text
);

-- 退訂名單
create table if not exists newsletter_unsubscribes (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  contact_id uuid references contacts(id),
  reason text,
  unsubscribed_at timestamptz default now(),
  source text not null default 'webhook'
);

-- 黑名單
create table if not exists newsletter_blacklist (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  contact_id uuid references contacts(id),
  reason text,
  created_by uuid references users(id),
  created_at timestamptz default now()
);
```

---

## 二十七、v1.6 開發任務清單

- [ ] **Task 76** `[修改]` — 執行 Migration SQL（newsletter 相關四張表）
- [ ] **Task 77** `[新增]` — 安裝 TipTap，建立富文字編輯器元件（變數插入、預覽模式、附件上傳）
- [ ] **Task 78** `[新增]` — 新增 `/api/sendgrid/webhook` route（接收並處理 SendGrid 事件）
- [ ] **Task 79** `[新增]` — 新增 `/unsubscribe` 公開頁面（退訂流程、原因選擇）
- [ ] **Task 80** `[新增]` — Supabase Edge Function `send-newsletter`（分批寄送邏輯）
- [ ] **Task 81** `[修改]` — 設定 pg_cron 每天依 send_hour 觸發 `send-newsletter`
- [ ] **Task 82** `[新增]` — 新增 Newsletter 管理頁 `/admin/newsletter`（Campaign 列表、Wizard 新增/編輯、詳情、退訂管理、黑名單）
- [ ] **Task 83** `[修改]` — 更新 Dashboard Layout（Sidebar 新增 Newsletter 項目，僅 super_admin）

---

## 二十八、v1.6.1 — 認識場合記錄

### 28.1 `contacts` 新增欄位

| 欄位 | 型別 | 說明 |
|------|------|------|
| met_at | text (nullable) | 認識場合，如「台北生技展 2026」 |
| met_date | date (nullable) | 認識日期，預設今天 |
| referred_by | text (nullable) | 介紹人（自由文字） |

### 28.2 網頁批次編輯

聯絡人列表新增多選功能：
- 勾選多筆聯絡人後，出現「批次編輯」按鈕
- 開啟 Modal，填入：認識場合、認識日期（預設今天）、介紹人
- 確認後批次更新選取聯絡人的三個欄位
- 同時每個聯絡人各寫一筆 interaction_log：
  - type = `meeting`
  - content = `認識於：{met_at}（{met_date}）{referred_by 若有則加「，介紹人：{referred_by}」}`

### 28.3 聯絡人列表新增篩選

- 新增 `met_at` 關鍵字篩選（文字 contains）
- 可與 Tag、國家篩選同時使用

### 28.4 Migration SQL

```sql
alter table contacts add column if not exists met_at text;
alter table contacts add column if not exists met_date date;
alter table contacts add column if not exists referred_by text;
```

---

## 二十九、v1.6.2 — Bot `/met` 批次套用

### 29.1 指令設計

**格式：**
```
/met {數量} {自然語言描述}
```

**範例：**
```
/met 5 台北生技展 王小明 昨天
/met 5 上週的生技展
/met 3 在王小明公司的會議 他介紹的 上週五
/met 10 今天的醫療論壇 無介紹人
```

### 29.2 AI 解析流程

1. 收到 `/met` 指令後，將數量後的文字送給 Gemini 解析
2. Gemini 回傳 JSON：
```json
{
  "met_at": "台北生技展",
  "met_date": "2026-03-18",
  "referred_by": "王小明"
}
```
- `met_date` 沒提到日期 → 預設今天
- `referred_by` 沒提到介紹人 → null
- 日期自然語言（昨天、上週五）自動換算成實際日期

3. Bot 顯示確認訊息：
```
📍 準備套用到最近 5 位聯絡人：

場合：台北生技展
日期：2026-03-18
介紹人：王小明

最近 5 位聯絡人：
1. 陳大華（ABC 公司）
2. 林美玲（XYZ 公司）
3. ...

[✅ 確認套用] [❌ 取消]
```

4. 確認後：
   - 批次更新這 N 筆聯絡人的 `met_at`、`met_date`、`referred_by`
   - 每筆各寫一筆 interaction_log（type=`meeting`）
   - Bot 回覆「✅ 已套用至 5 位聯絡人」

### 29.3 `/help` 更新

新增 `/met` 指令說明：
```
/met {數量} {描述} — 批次記錄最近 N 位聯絡人的認識場合
例：/met 5 台北生技展 王小明介紹 昨天
```

### 29.4 Migration SQL

無需新增（欄位已在 v1.6.1 新增）

---

## 三十、v1.6.1 + v1.6.2 開發任務清單

- [ ] **Task 84** `[修改]` — 執行 Migration SQL（contacts 新增 met_at、met_date、referred_by）
- [ ] **Task 85** `[修改]` — 更新聯絡人列表（多選功能、批次編輯 Modal、met_at 篩選）
- [ ] **Task 86** `[修改]` — 更新聯絡人詳情（顯示 met_at、met_date、referred_by 欄位）
- [ ] **Task 87** `[修改]` — 更新新增/編輯聯絡人表單（新增三個欄位）
- [ ] **Task 88** `[修改]` — 更新 Bot Webhook（新增 `/met` 指令，AI 解析場合/日期/介紹人，批次確認套用）
- [ ] **Task 89** `[修改]` — 更新 `/help` 指令（新增 `/met` 說明）

---

## 三十一、v1.7 功能規格

> 主軸：合併聯絡人、名片王匯入、API Health Check、文件權限、SendGrid 歷史資料整合

---

### 31.1 合併聯絡人

#### 入口一：聯絡人詳情頁（手動）

- 所有人可用
- 「合併聯絡人」按鈕 → 開啟搜尋 Modal，搜尋要被合併的聯絡人（來源）
- 確認畫面：
  - 左欄：當前聯絡人（**保留**）的主要資料
  - 右欄：來源聯絡人的資料
  - 說明：「將以左側資料為主，右側空白欄位補入左側，名片、互動紀錄、Tag 全部合併」
- 欄位合併規則（選項 A）：
  - 保留筆的欄位有值 → 保留，不覆蓋
  - 保留筆的欄位為空、來源筆有值 → 補入
  - `contact_cards`：來源的全部移到保留筆
  - `interaction_logs`：來源的全部移到保留筆
  - `contact_tags`：取聯集（去重複）
  - 自動新增一筆 `interaction_log`：
    - type = `system`
    - content = `合併聯絡人：{來源姓名}（{來源公司}）`
    - created_by = 執行者
  - 刪除來源聯絡人

#### 入口二：重複聯絡人審查頁 `/admin/duplicates`（super admin only）

- Sidebar 新增「重複審查」項目（僅 super_admin 可見）
- 頁面頂部：「立即掃描」按鈕 + 「上次掃描時間：YYYY-MM-DD HH:mm」
- 掃描邏輯（點按鈕後執行，非排程）：
  - Email 完全相符（`email` 欄位相同且非空）→ 標為「完全重複」
  - 姓名 similarity >= 0.6（pg_trgm）→ 標為「疑似重複」
  - 結果寫入 `duplicate_pairs` 表（見下方 DB 結構）
- 掃描結果列表：
  - 每組顯示兩筆聯絡人的姓名、公司、Email、建立時間、來源（source）
  - 操作按鈕：「合併（保留左）」「合併（保留右）」「不是重複（忽略）」
  - 忽略後該組不再出現（`is_ignored = true`）
- 合併邏輯與入口一相同

#### 新增 DB 表：`duplicate_pairs`

| 欄位 | 型別 | 說明 |
|------|------|------|
| id | uuid (PK) | 主鍵 |
| contact_id_a | uuid (FK → contacts.id) | 聯絡人 A |
| contact_id_b | uuid (FK → contacts.id) | 聯絡人 B |
| match_type | text | `exact_email` / `similar_name` |
| similarity_score | float | pg_trgm similarity 分數 |
| is_ignored | boolean (default false) | 使用者標記「不是重複」 |
| scanned_at | timestamptz | 掃描時間 |

#### Migration SQL

```sql
-- 重複配對記錄表
create table if not exists duplicate_pairs (
  id uuid primary key default gen_random_uuid(),
  contact_id_a uuid references contacts(id) on delete cascade,
  contact_id_b uuid references contacts(id) on delete cascade,
  match_type text not null,
  similarity_score float,
  is_ignored boolean not null default false,
  scanned_at timestamptz default now()
);

-- contacts 新增 source 欄位
alter table contacts add column if not exists source text not null default 'web';
-- source 值：'web' / 'telegram' / 'camcard' / 'batch'

-- contacts 新增 imported_at 欄位（名片王匯入用）
alter table contacts add column if not exists imported_at timestamptz;
```

---

### 31.2 名片王匯入（本機 Claude Code Script）

#### 概覽

不走系統 UI，由 Claude Code 在本機執行獨立 script，直接讀取圖片資料夾，呼叫 Claude API 做 OCR，結果寫入 Supabase 暫存區，再透過系統 UI 人工確認後移入正式聯絡人。

#### Script 位置

`scripts/camcard-import/`
- `import.ts` — 主程式
- `progress.json` — 斷點記錄（自動產生）
- `failed.txt` — 失敗圖檔清單（自動產生）
- `README.md` — 使用說明

#### Script 功能

**執行模式**
```bash
npx ts-node scripts/camcard-import/import.ts --dir /path/to/photos --dry-run 10
npx ts-node scripts/camcard-import/import.ts --dir /path/to/photos
npx ts-node scripts/camcard-import/import.ts --dir /path/to/photos --resume
```

- `--dry-run N`：只處理前 N 張，不寫 DB，確認格式正確
- `--resume`：讀取 `progress.json`，跳過已處理的圖檔，斷點續跑
- 無額外參數：全跑

**處理流程（每張圖）**
1. 讀取圖片 → 壓縮（1024px / JPEG Q85，與全站一致）
2. 上傳壓縮後圖片至 Supabase Storage `cards` bucket
3. 呼叫 Claude API（`claude-sonnet-4-5` 或更新版），使用與現有系統相同欄位的 OCR prompt
4. 解析 JSON 回傳
5. 寫入 `camcard_pending` 暫存表（見下方）
6. 更新 `progress.json`

**進度顯示**
```
[進度] 1523 / 5000 張 | ✅ 1498 成功 | ⚠️ 25 失敗 | 預計剩餘 23 分鐘
```

**斷點機制**
- 每張處理完後更新 `progress.json`：`{ "processed": ["img001.jpg", ...], "failed": [...] }`
- `--resume` 時跳過 `processed` 清單內的圖檔
- 失敗的圖檔寫入 `failed.txt`，不阻擋後續處理

**OCR Prompt**
使用 Claude vision，與現有系統 `ocr_card` prompt 一致，回傳相同 JSON 欄位結構（name, name_en, name_local, company, company_en, company_local, job_title, email, second_email, phone, second_phone, address, website, linkedin_url, facebook_url, country_code）

#### 新增 DB 表：`camcard_pending`

| 欄位 | 型別 | 說明 |
|------|------|------|
| id | uuid (PK) | 主鍵 |
| image_filename | text | 原始圖檔名 |
| card_img_url | text | Storage URL |
| storage_path | text | Storage 路徑（供刪除用）|
| ocr_data | jsonb | Claude OCR 回傳的完整 JSON |
| status | text (default 'pending') | `pending` / `confirmed` / `merged` / `skipped` |
| duplicate_contact_id | uuid (FK → contacts.id, nullable) | 偵測到的重複聯絡人 |
| match_type | text (nullable) | `exact_email` / `similar_name` |
| confirmed_by | uuid (FK → users.id, nullable) | 確認者 |
| confirmed_at | timestamptz | 確認時間 |
| imported_at | timestamptz (default now()) | 真實匯入時間 |
| created_at | timestamptz (default now()) | 記錄建立時間 |

#### 系統 UI：`/admin/camcard` 暫存區審查頁（super admin only）

**頁面功能**
- 顯示統計：待審查 X 筆 / 已確認 Y 筆 / 已合併 Z 筆 / 已略過 W 筆
- 按公司名稱分組顯示（`ocr_data->>'company'` group by）
- 每組可展開，顯示該公司所有待審查名片

**每筆顯示**
- 名片縮圖（可點擊放大）
- OCR 辨識結果（所有欄位）
- 重複偵測結果：
  - 「⚠️ 疑似與現有聯絡人重複：{姓名}（{公司}）」
  - 或「✅ 無重複」

**操作按鈕**
- 「✅ 確認新增」→ 建立新 contact，`source='camcard'`，`created_at='2020-01-01'`，`imported_at=now()`，寫 interaction_log（`來自名片王匯入，匯入時間：{imported_at}`）
- 「🔀 合併至現有」（有重複時顯示）→ 進入合併流程（保留現有聯絡人，補入空白欄位，合併名片）
- 「⏭ 略過」→ status = `skipped`

**批次操作**
- 勾選多筆 → 「批次確認新增」（無重複者）
- 「略過全部無重複者」一鍵略過

---

### 31.3 API Health Check

#### 位置

`/admin/health`（super admin only），Sidebar 新增「系統狀態」項目

#### 監控項目

| 服務 | 檢查方式 | 顯示 |
|------|---------|------|
| SendGrid | `GET https://api.sendgrid.com/v3/user/profile`（驗證 API key 是否有效） | ✅ / ❌ + 最後檢查時間 |
| AI Endpoints | 對每個 `ai_endpoints` 表中 is_active=true 的 endpoint 送一個極短的 test prompt | ✅ / ❌ + latency(ms) + 最後檢查時間 |

#### 行為

- 頁面載入時自動執行一次 health check（呼叫 `/api/health-check`）
- 「重新檢查」按鈕可手動觸發
- 結果不存 DB，每次即時查詢
- AI endpoint 測試 prompt：`"Reply with OK"` — 只確認有回應，不計費

#### API Route

`/api/health-check`（POST，super admin only）
- 並行呼叫所有服務
- 回傳：`{ sendgrid: { ok, latency, checkedAt }, aiEndpoints: [{ id, name, ok, latency, checkedAt }] }`

---

### 31.4 文件權限 + Quick Start

#### 存取控制

| 狀態 | 可看內容 |
|------|---------|
| 未登入 | Quick Start 僅此一節 |
| 登入一般用戶 | Quick Start + 使用者文件（user section） |
| Super Admin | 全部（Quick Start + 使用者 + Super Admin section） |

#### `/docs` 頁面更新

- Server component 讀取 session，判斷角色，只渲染對應 section
- 未登入者看到 Quick Start 後，顯示「登入後查看完整文件」按鈕
- section 選單（左側導覽）依角色顯示對應項目

#### Quick Start 內容（AI 生成，存入 `docs_content` 表）

新增 `section = 'quick_start'`，三個語言版本（zh-TW / en / ja），AI 根據以下大綱生成：

1. **登入系統**：Microsoft SSO，限 @cancerfree.io 帳號，步驟圖示
2. **綁定 Telegram Bot**：找到 `@CF_CRMBot`，取得自己的 Telegram ID（傳訊給 @userinfobot），填入個人設定
3. **綁定 Teams Bot**：系統自動比對 Microsoft 帳號，第一次傳訊給 Teams Bot 即完成綁定
4. **掃描第一張名片**：在 Telegram 直接傳名片照片，Bot 自動辨識，確認後存入 CRM

#### `docs_content` 表新增記錄

```sql
-- Quick Start 新增為獨立 section
-- section 值新增 'quick_start'（原有 'user' / 'super_admin' 不變）
```

---

### 31.5 SendGrid 歷史資料整合

#### 一次性匯入流程

入口：`/admin/newsletter` → 新增「SendGrid 歷史資料」分頁

**步驟**
1. 點「從 SendGrid 匯入歷史抑制名單」按鈕
2. 呼叫 `/api/sendgrid/import-suppressions`
3. API 呼叫 SendGrid Suppressions API 三個端點：
   - `GET /v3/suppression/bounces`（hard bounce）
   - `GET /v3/suppression/unsubscribes`
   - `GET /v3/suppression/spam_reports`
4. 寫入 `newsletter_blacklist`（bounce / spam）和 `newsletter_unsubscribes`（unsubscribe）
5. 比對 `contacts.email`，找到匹配的聯絡人
6. 每筆匹配的聯絡人寫一筆 `interaction_log`：
   - type = `email`
   - email_subject = `SendGrid 歷史紀錄`
   - content = `來自 SendGrid 歷史紀錄｜狀態：{hard bounce / unsubscribe / spam report}｜SendGrid 記錄時間：{YYYY-MM-DD}`
   - created_by = 執行匯入的 super_admin user_id
7. 回傳匯入摘要：bounce X 筆 / unsubscribe Y 筆 / spam Z 筆 / 比對到聯絡人 W 筆

**重複處理**
- 已存在於 blacklist / unsubscribes 的 email 用 `ON CONFLICT DO NOTHING` 跳過
- 同一聯絡人不重複寫 interaction_log（以 email_subject='SendGrid 歷史紀錄' 檢查是否已存在）

#### 聯絡人詳情頁黑名單標記

- 若聯絡人 email 存在於 `newsletter_blacklist` 或 `newsletter_unsubscribes`，在 Email 欄位旁顯示：
  - 🚫 `硬退信（Hard Bounce）`
  - 🔕 `已退訂`
  - ⚠️ `Spam 檢舉`
- 點擊 badge 可查看詳細原因和時間

#### `/admin/newsletter` 新增分頁

**Blacklist 分頁**
- 列出 `newsletter_blacklist`（email、原因、來源、時間）
- 可手動新增 email 到黑名單
- 可手動移除（有確認 modal）
- 搜尋框

**Unsubscribes 分頁**
- 列出 `newsletter_unsubscribes`（email、退訂原因、來源、時間）
- 可手動移除（重新加回寄送名單，有確認 modal）
- 搜尋框

---

### 31.6 Migration SQL

```sql
-- 重複配對記錄
create table if not exists duplicate_pairs (
  id uuid primary key default gen_random_uuid(),
  contact_id_a uuid references contacts(id) on delete cascade,
  contact_id_b uuid references contacts(id) on delete cascade,
  match_type text not null,
  similarity_score float,
  is_ignored boolean not null default false,
  scanned_at timestamptz default now()
);

-- contacts 新增欄位
alter table contacts add column if not exists source text not null default 'web';
alter table contacts add column if not exists imported_at timestamptz;

-- 名片王暫存表
create table if not exists camcard_pending (
  id uuid primary key default gen_random_uuid(),
  image_filename text,
  card_img_url text,
  storage_path text,
  ocr_data jsonb,
  status text not null default 'pending',
  duplicate_contact_id uuid references contacts(id),
  match_type text,
  confirmed_by uuid references users(id),
  confirmed_at timestamptz,
  imported_at timestamptz default now(),
  created_at timestamptz default now()
);

-- docs_content 支援 quick_start section（無需改表，新增資料即可）
```

---

## 三十二、v1.7 開發任務清單

- [ ] **Task 90** `[修改]` — 執行 Migration SQL（duplicate_pairs、contacts 新增 source/imported_at、camcard_pending）
- [ ] **Task 91** `[修改]` — 聯絡人詳情頁新增「合併聯絡人」按鈕與合併流程（搜尋 Modal、確認畫面、欄位聯集邏輯、system log）
- [ ] **Task 92** `[新增]` — 新增 `/admin/duplicates` 頁面（手動觸發掃描、配對列表、合併/忽略操作）；新增 `/api/contacts/scan-duplicates` route
- [ ] **Task 93** `[新增]` — 新增 `scripts/camcard-import/` 目錄與 `import.ts` script（dry-run、resume、進度顯示、Claude API OCR、寫入 camcard_pending）
- [ ] **Task 94** `[新增]` — 新增 `/admin/camcard` 暫存區審查頁（按公司分組、重複偵測顯示、確認新增/合併/略過、批次操作）
- [ ] **Task 95** `[新增]` — 新增 `/admin/health` Health Check 頁面與 `/api/health-check` route（SendGrid ping、AI endpoint test）
- [ ] **Task 96** `[修改]` — 更新 `/docs` 頁面（access control 依登入狀態與角色、Quick Start section）；新增 `/api/docs/generate` 支援 `quick_start` section 生成
- [ ] **Task 97** `[新增]` — 新增 `/api/sendgrid/import-suppressions` route（拉取三種歷史抑制名單、寫 blacklist/unsubscribes、比對聯絡人寫 interaction_log）
- [ ] **Task 98** `[修改]` — 更新聯絡人詳情頁（Email 旁顯示黑名單 badge：硬退信 / 已退訂 / Spam）
- [ ] **Task 99** `[修改]` — 更新 `/admin/newsletter`（新增 Blacklist 分頁、Unsubscribes 分頁，各含搜尋、手動新增/移除）
- [ ] **Task 100** `[修改]` — 更新 Dashboard Layout（Sidebar 新增「重複審查」、「名片王匯入」、「系統狀態」項目，均僅 super_admin 可見）
- [ ] **Task 101** `[修改]` — i18n 三份語言檔新增 v1.7 相關 key（duplicates、camcard、health、docs quick_start）

---

## 三十三、v1.8 功能規格

### 33.1 聯絡人重要性（importance）

#### 概覽

為聯絡人新增「重要性」欄位，供使用者標記每位聯絡人的優先程度，並可在聯絡人列表依此篩選。

#### DB 變更

```sql
alter table contacts
  add column if not exists importance text not null default 'medium'
  check (importance in ('high', 'medium', 'low'));
```

#### 欄位規格

| 屬性 | 值 |
|------|-----|
| 欄位名 | `importance` |
| 型別 | `text` |
| 允許值 | `'high'` / `'medium'` / `'low'` |
| 預設值 | `'medium'` |
| constraint | CHECK constraint |

#### 聯絡人列表顯示

- 每筆聯絡人列顯示一個顏色圓點 icon，**不顯示文字**：
  - 🔴 `high`（紅色）
  - 🟡 `medium`（黃色）
  - 🔵 `low`（藍色）
- icon 位置：姓名欄左側或獨立小欄，不佔太多空間
- `medium` 為預設，所有既有聯絡人顯示黃色點

#### 篩選

- 聯絡人列表頂部 filter bar 新增「重要性」下拉選單
- 選項：全部 / High / Medium / Low
- 預設：全部
- 與現有搜尋、tag 篩選、場合篩選並存，可疊加使用
- query string 同步：`?importance=high`

#### 編輯入口

1. **聯絡人詳情頁**：「基本資料」區塊顯示重要性欄位，可點擊切換（High / Medium / Low 三選一 segmented control 或 select）
2. **新增聯絡人表單**：加入「重要性」欄位，預設 Medium

#### API 變更

- `GET /api/contacts`：新增 `importance` query 參數（`high` / `medium` / `low`），傳入時加 WHERE 條件
- `POST /api/contacts`：接受 `importance` 欄位，未傳入時預設 `'medium'`
- `PATCH /api/contacts/[id]`：接受 `importance` 欄位更新

#### i18n 新增 key

```
importance: "重要性" / "Importance" / "重要度"
importance.high: "高" / "High" / "高"
importance.medium: "中" / "Medium" / "中"
importance.low: "低" / "Low" / "低"
importance.all: "全部" / "All" / "すべて"
```

---

## 三十四、v1.8 開發任務清單

- [ ] **Task 102** `[修改]` — 執行 Migration SQL（contacts 新增 `importance` 欄位，default 'medium'，CHECK constraint）
- [ ] **Task 103** `[修改]` — 更新 `GET /api/contacts`（新增 `importance` query 參數過濾）；`POST /api/contacts` 與 `PATCH /api/contacts/[id]` 接受 `importance` 欄位
- [ ] **Task 104** `[修改]` — 聯絡人列表：每筆新增顏色圓點 icon（高=紅、中=黃、低=藍）；頂部 filter bar 新增「重要性」下拉選單（全部/High/Medium/Low），支援 query string `?importance=`
- [ ] **Task 105** `[修改]` — 聯絡人詳情頁「基本資料」區塊新增「重要性」欄位（可編輯，segmented control 或 select）
- [ ] **Task 106** `[修改]` — 新增聯絡人表單加入「重要性」欄位（預設 Medium）
- [ ] **Task 107** `[修改]` — i18n 三份語言檔新增 `importance` 相關 key（zh-TW / en / ja）
