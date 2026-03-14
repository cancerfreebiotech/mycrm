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
| `src/app/(dashboard)/page.tsx` | 已實作，需修改 | Dashboard 首頁，需加未歸類筆記區塊 |
| `src/app/(dashboard)/contacts/page.tsx` | 已實作，需修改 | 聯絡人列表，需加 Tags、篩選、Export |
| `src/app/(dashboard)/contacts/[id]/page.tsx` | 已實作，需修改 | 聯絡人詳情，需加編輯、Tags、反面照片、寄信 |
| `src/app/(dashboard)/admin/users/page.tsx` | 已實作，需修改 | 使用者管理，需改為管理 users 表 |
| `src/app/(dashboard)/admin/templates/page.tsx` | 已實作，需修改 | 郵件範本，需加真實附件上傳 |
| `src/lib/supabase.ts` | 已實作，需修改 | Supabase client |
| `src/lib/supabase-browser.ts` | 已實作，可能需修改 | Browser Supabase client |
| `src/lib/gemini.ts` | 已實作，需修改 | Gemini OCR，需加 model 參數與多語言 |
| `src/lib/imageProcessor.ts` | 已實作，需修改 | 圖片壓縮，需加新命名規則 |
| `src/middleware.ts` | 已實作，需確認 | Route 保護 |

**以下為全新新增，現在不存在：**
- `src/lib/graph.ts`
- `src/lib/duplicate.ts`
- `src/app/api/ocr/route.ts`
- `src/app/(dashboard)/contacts/new/page.tsx`
- `src/app/(dashboard)/unassigned-notes/page.tsx`
- `src/app/(dashboard)/admin/tags/page.tsx`
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
- **Supabase**：PostgreSQL 資料庫 + Storage（名片圖片）+ Auth（Microsoft AAD OAuth）
- **Telegram Bot API**：原生 fetch 實作 Webhook（不使用 Telegraf）
- **Google Gemini**：名片圖片 OCR 辨識，支援中英日文名片，model 可由使用者個人設定切換
- **Microsoft Graph API**：以使用者身份寄送郵件（`Mail.Send` permission）

---

## 三、使用者與身份系統

### 設計原則

系統以 **Microsoft AAD 帳號為唯一身份**，Telegram 為附加綁定。廢除獨立的 `authorized_users` 白名單表，改由 `users` 表統一管理。

### 登入流程

1. 使用者點擊「Sign in with Microsoft」
2. Supabase Auth 處理 OAuth，限制僅 `@cancerfree.io` 帳號可通過
3. 登入成功後，在 `auth callback` 自動於 `users` 表建立或更新記錄（upsert by email）
4. 之後每次登入更新 `last_login_at`

### Telegram 綁定流程

1. 使用者登入 Web 後，前往「個人設定」頁面
2. 輸入自己的 Telegram 數字 ID（說明：在 Telegram 傳訊給 @userinfobot 可取得）
3. 儲存後即自動成為 Bot 授權使用者，無需另外管理白名單

### 角色

| 角色 | 說明 |
|------|------|
| `member` | 預設角色，所有 `@cancerfree.io` 登入者自動取得 |
| `super_admin` | 可管理所有使用者角色，系統可有多位 super_admin |

> 第一位登入者需由開發者在 Supabase 資料庫手動將 `role` 設為 `super_admin`。之後 super_admin 可從 Web 介面指派其他人為 super_admin。

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
| gemini_model | text (default 'gemini-1.5-flash') | 個人偏好 Gemini model |
| theme | text (default 'light') | `light` 或 `dark` |
| last_login_at | timestamptz | 最後登入時間 |
| created_at | timestamptz (default now()) | 建立時間 |

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

> 所有組織成員共享所有聯絡人，無個人私有名片。

### `tags`
| 欄位 | 型別 | 說明 |
|------|------|------|
| id | uuid (PK) | 主鍵 |
| name | text (UNIQUE, NOT NULL) | Tag 名稱 |
| created_at | timestamptz (default now()) | 建立時間 |

### `contact_tags`（junction table）
| 欄位 | 型別 | 說明 |
|------|------|------|
| contact_id | uuid (FK → contacts.id, ON DELETE CASCADE) | 聯絡人 |
| tag_id | uuid (FK → tags.id, ON DELETE CASCADE) | Tag |
| PRIMARY KEY (contact_id, tag_id) | | 複合主鍵 |

### `interaction_logs`
| 欄位 | 型別 | 說明 |
|------|------|------|
| id | uuid (PK) | 主鍵 |
| contact_id | uuid (FK → contacts.id, ON DELETE CASCADE, **nullable**) | 關聯聯絡人，null 代表未歸類 |
| type | text (default 'note') | `note` / `meeting` / `email` |
| content | text | 互動內容 |
| meeting_date | date (nullable) | 會議日期（type=meeting 時使用） |
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

# Microsoft Graph API 寄信使用 Supabase session 的 provider_token，不需額外設定
# 僅需確認 Azure AD App Registration 已開啟 Mail.Send permission

# Vercel
NEXTAUTH_URL=
```

---

## 六、功能規格

### 6.1 基礎工具庫

#### `src/lib/supabase.ts`
- 提供 `createClient()` 供 Server Component 使用
- 提供 `createServiceClient()` 使用 service role key

#### `src/lib/supabase-browser.ts`
- 提供 `createBrowserSupabaseClient()` 供 Client Component 使用

#### `src/lib/gemini.ts`
- 匯出 `analyzeBusinessCard(imageBuffer: Buffer, model: string): Promise<CardData>`
- 支援傳入多張圖片（正反面）：`analyzeBusinessCard(buffers: Buffer[], model: string)`
- **多語言支援**：System Prompt 指定「名片可能為中文、英文或日文，請辨識後以原文回傳各欄位」
- System Prompt：`你是一個專業名片辨識助手。名片可能為中文、英文或日文，請辨識後以原文回傳。從圖中提取：姓名、公司、職稱、Email、電話，回傳純 JSON，不要有任何其他文字。格式：{"name":"","company":"","job_title":"","email":"","phone":""}`
- 支援的 model 清單：`gemini-1.5-flash`、`gemini-1.5-pro`、`gemini-2.0-flash`、`gemini-2.5-pro`

#### `src/lib/imageProcessor.ts`
- 函式：`processCardImage(inputBuffer: Buffer): Promise<Buffer>`
- 長邊壓縮至最大 1024px，JPEG 品質 85
- **圖片命名規則**：`yymmdd_hhmmss-{流水號}.jpg`
  - 流水號每天從 001 開始，3 位數補零
  - 從 Supabase 查詢當天已存檔數量 +1 計算

#### `src/lib/graph.ts`
- 匯出 `sendMail({ accessToken, to, subject, body, attachments? })`
- 使用 `https://graph.microsoft.com/v1.0/me/sendMail`

#### `src/lib/duplicate.ts`（新增）
- 匯出 `checkDuplicates(email: string, name: string): Promise<DuplicateResult>`
- 完全重複：查詢 email 完全相符的聯絡人
- 疑似重複：查詢姓名相似度（使用 PostgreSQL `similarity()` 函式，threshold 0.6）
- 回傳 `{ exact: Contact | null, similar: Contact[] }`

---

### 6.2 主題系統

- 使用 `next-themes` 管理全域主題
- 主題儲存於 `users.theme`，登入後載入套用
- **全域 CSS 規範**：
  - 所有 `input`、`textarea`、`select` 文字色：`text-gray-900 dark:text-gray-100`
  - Placeholder：`placeholder-gray-400 dark:placeholder-gray-500`
  - 禁止使用 `text-white` 或過淺灰色作為輸入文字色

---

### 6.3 認證流程

#### `src/app/login/page.tsx`
- 「Sign in with Microsoft」按鈕
- provider：`azure`，額外 scope：`Mail.Send`

#### `src/app/api/auth/callback/route.ts`
- Upsert `users` 表（by email），更新 `display_name`、`last_login_at`
- 導向 `/`

#### `src/middleware.ts`
- 保護所有 `/(dashboard)` 路由

---

### 6.4 Telegram Bot Webhook

#### 路徑：`src/app/api/bot/route.ts`

**支援的互動類型：**

**A. 照片（名片掃描）**
1. 權限檢查：查 `users.telegram_id`，不存在回覆「⛔ 你沒有使用權限，請先在 myCRM 網站的個人設定綁定你的 Telegram ID」
2. 下載照片 → `processCardImage()` 壓縮 → 上傳 Storage（命名規則 `yymmdd_hhmmss-流水號.jpg`）
3. 以使用者的 `gemini_model` 呼叫 `analyzeBusinessCard()`
4. **重複檢查**：呼叫 `checkDuplicates()`，若有結果在回覆中附加警告：
   - 完全重複：「⚠️ 此 email 已有聯絡人：{name}（{company}），是否仍要新增？」
   - 疑似重複：「🔍 系統有相似聯絡人：{name}（{company}），請確認是否為同一人」
5. 回覆辨識結果，附上兩個按鈕：
   ```
   [✅ 確認存檔]  [❌ 不存檔]
   ```
6. Callback Query：
   - `save_xxx`：存入 contacts，寫入 interaction_log（type=note，content=「透過 Telegram Bot 新增名片」）
   - `cancel_xxx`：回覆「已取消，名片未存檔」，移除按鈕

**B. 文字訊息（會議筆記）**

支援兩種格式：

*格式 1：指令式*
```
/note
```
Bot 回問：「請輸入聯絡人姓名或 Email：」
使用者回覆後，Bot 搜尋聯絡人：
- 找到唯一：回問「請輸入筆記內容：」，收到後存入 interaction_log（type=meeting）
- 找到多筆：列出選項讓使用者選擇
- 找不到：回覆「找不到此聯絡人，筆記將存為未歸類，可至網頁手動歸類」，存入 interaction_log（contact_id=null，type=meeting）

*格式 2：快速格式*
```
@姓名或email
筆記內容（可多行）
```
第一行 `@` 開頭視為聯絡人識別，其餘為筆記內容。搜尋邏輯同上。

**C. `/add_back @姓名` 指令（補充名片反面）**
- 解析姓名，搜尋聯絡人
- 找到後回覆「請傳送名片反面照片」
- 下一張照片：壓縮上傳，更新 `contacts.card_img_back_url`，以 Gemini 辨識補充缺少的欄位
- 回覆「✅ 已更新名片反面資訊」

**D. 多步驟對話狀態管理**
- 使用 Supabase 或記憶體暫存使用者的對話狀態（waiting_for_note_contact / waiting_for_note_content / waiting_for_back_card）
- 建議用 Supabase 的 `bot_sessions` 表儲存：`{ telegram_id, state, context, updated_at }`

---

### 6.5 Web 管理介面

#### 共用 Layout
- Sidebar：Dashboard、聯絡人、Tag 管理、未歸類筆記、使用者管理（僅 super_admin）、郵件範本、個人設定
- Header：myCRM、登入使用者名稱、Sign out

---

#### 頁面 1：Dashboard `/`
- 歡迎訊息
- 統計卡片：聯絡人總數、本月新增名片數
- **「待處理」區塊**：顯示最新 5 筆未歸類筆記（contact_id=null），每筆有「指定聯絡人」快速按鈕，點擊後跳出搜尋 modal 指定歸類
- 「查看全部未歸類筆記」連結 → `/unassigned-notes`

---

#### 頁面 2：聯絡人列表 `/contacts`
- 表格欄位：姓名、公司、職稱、Email、電話、Tags、建立者、建立時間
- 關鍵字搜尋（姓名或公司）
- Tag 多選篩選 dropdown
- **Export 按鈕**：匯出「目前篩選結果」為 Excel（.xlsx）或 CSV，使用 `xlsx` 套件
  - 匯出欄位：姓名、公司、職稱、Email、電話、Tags、建立者、建立時間
- **「新增聯絡人」按鈕**：開啟新增頁面

---

#### 頁面 3：新增聯絡人 `/contacts/new`
- 表單欄位：姓名、公司、職稱、Email、電話、Tags
- **照片上傳區**：
  - 可上傳正面名片照片
  - 上傳後自動呼叫 `/api/ocr`（Server Action），以當前使用者的 `gemini_model` 辨識
  - 辨識結果自動填入表單，使用者可修改
  - **重複檢查**：填入 email 或姓名後，即時提示重複或相似聯絡人
- 儲存後導向 `/contacts/[id]`

---

#### 頁面 4：聯絡人詳情 `/contacts/[id]`
- 顯示聯絡人完整資料 + 建立者
- 正面名片縮圖（可放大）；若有反面則並排顯示
- **編輯按鈕**：開啟編輯 Modal，可修改所有欄位、上傳新照片（含 AI 重新辨識）
- **Tags 區塊**：顯示已套用 tags，可新增/移除
- **互動紀錄時間軸**：依 `created_at` 降序，顯示 type badge（筆記/會議/郵件）、內容、紀錄者、時間；meeting 類型額外顯示會議日期
- 「新增互動紀錄」：可選 type（筆記 / 會議），會議類型可填日期
- 「寄信」按鈕 → Modal（收件人預帶 email、可選 template、寄出後自動新增 email log）
- 返回按鈕

---

#### 頁面 5：未歸類筆記 `/unassigned-notes`
- 列出所有 contact_id=null 的 interaction_logs
- 每筆顯示：內容、類型、建立者、建立時間
- 每筆有「指定聯絡人」按鈕：搜尋聯絡人後更新 `contact_id`
- 每筆有「刪除」按鈕

---

#### 頁面 6：Tag 管理 `/admin/tags`
- 列出所有 tags（name、使用中聯絡人數、建立時間）
- 新增、編輯名稱、刪除（確認後關聯自動移除）
- 所有成員可存取

---

#### 頁面 7：使用者管理 `/admin/users`（僅 super_admin）
- 列出所有 users（display_name、email、telegram_id 綁定狀態、role、last_login_at）
- 修改 role（member ↔ super_admin）
- 非 super_admin 導向 `/`

---

#### 頁面 8：郵件範本 `/admin/templates`
- 列出所有 email_templates
- 新增、編輯（title、subject、body_content HTML）、刪除
- 附件管理：上傳至 `template-attachments` bucket，單檔限 2MB，顯示已上傳檔案列表可個別刪除
- 所有成員可存取

---

#### 頁面 9：個人設定 `/settings`
- 顯示 email、display_name、role
- Telegram ID 輸入框（說明：傳訊給 @userinfobot 取得數字 ID）
- Gemini model dropdown（gemini-1.5-flash / gemini-1.5-pro / gemini-2.0-flash / gemini-2.5-pro）
- 主題切換（Light / Dark）
- 儲存更新 users 表

---

### 6.6 OCR API Route

#### `src/app/api/ocr/route.ts`（新增）
- POST，接收圖片 base64 + model 參數
- 呼叫 `analyzeBusinessCard()`，回傳辨識結果
- 供網頁新增/編輯聯絡人時使用

---

## 七、UI / 表單全域規範

- 所有 `input`、`textarea`、`select` 文字色：`text-gray-900 dark:text-gray-100`
- Placeholder：`placeholder-gray-400 dark:placeholder-gray-500`
- 禁止使用 `text-white` 或淺灰色作為輸入文字色

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

-- 互動紀錄（contact_id nullable 支援未歸類）
create table if not exists interaction_logs (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references contacts(id) on delete cascade,
  type text not null default 'note',
  content text,
  meeting_date date,
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

-- 啟用 pg_trgm 擴充（疑似重複偵測用）
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

## 十一、部署設定

```bash
# 設定 Telegram Webhook
curl -X POST "https://api.telegram.org/bot{TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://{your-domain}/api/bot"}'
```

---

## 十二、開發任務清單（供 Claude Code 使用）

請先閱讀完整 PRD，理解整體架構後提出任務拆分計畫，確認後再依序實作：

- [ ] **Task 1** `[修改]` — 資料庫 Migration SQL（第八節全部執行，含 pg_trgm 擴充）
- [ ] **Task 2** `[修改]` — 安裝套件（next-themes、xlsx）；設定全域主題；更新全域 CSS 規範
- [ ] **Task 3** `[修改]` — 更新 `src/lib/supabase.ts`、`src/lib/supabase-browser.ts`
- [ ] **Task 4** `[修改]` — 更新 `src/lib/gemini.ts`（多語言 prompt、接受 model 參數、支援多張圖片）
- [ ] **Task 5** `[新增]` — 新增 `src/lib/graph.ts`；新增 `src/lib/duplicate.ts`（重複偵測）
- [ ] **Task 6** `[修改]` — 更新 `src/lib/imageProcessor.ts`（命名規則 yymmdd_hhmmss-流水號）
- [ ] **Task 7** `[修改]` — 更新認證流程（login 加 Mail.Send scope、auth callback upsert users、確認 middleware）
- [ ] **Task 8** `[修改]` — 更新 Bot Webhook（白名單查 users.telegram_id、個人 gemini_model、存檔/不存檔按鈕、重複偵測、會議筆記指令、/add_back、bot_sessions 狀態管理）
- [ ] **Task 9** `[新增]` — 新增 OCR API Route `src/app/api/ocr/route.ts`
- [ ] **Task 10** `[修改]` — 更新 Dashboard Layout（Sidebar 新增未歸類筆記、Tag 管理；super_admin 判斷）
- [ ] **Task 11** `[修改]` — 更新 Dashboard 首頁（待處理未歸類筆記區塊）
- [ ] **Task 12** `[修改]` — 更新聯絡人列表（Tags 欄、Tag 篩選、Export Excel/CSV）
- [ ] **Task 13** `[新增]` — 新增聯絡人新增頁 `/contacts/new`（表單、照片上傳 + AI 辨識、重複偵測）
- [ ] **Task 14** `[修改]` — 更新聯絡人詳情（編輯 Modal、正反面照片、Tags、互動紀錄 type badge、會議日期、寄信 Modal）
- [ ] **Task 15** `[新增]` — 新增未歸類筆記頁 `/unassigned-notes`
- [ ] **Task 16** `[新增]` — 新增 Tag 管理頁 `/admin/tags`
- [ ] **Task 17** `[修改]` — 更新使用者管理頁 `/admin/users`（改管理 users 表、super_admin 角色切換）
- [ ] **Task 18** `[修改]` — 更新郵件範本頁（多附件上傳，2MB 限制，template_attachments 表）
- [ ] **Task 19** `[新增]` — 新增個人設定頁 `/settings`（Telegram ID、Gemini model、主題、顯示角色）
