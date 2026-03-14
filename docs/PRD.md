# PRD：myCRM — Telegram 名片辨識 CRM 系統

> 此文件供 Claude Code 使用。請先閱讀完整 PRD，理解需求後提出技術架構與任務拆分計畫，確認後再開始實作。

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
```

### 服務整合
- **Supabase**：PostgreSQL 資料庫 + Storage（名片圖片）+ Auth（Microsoft AAD OAuth）
- **Telegram Bot API**：原生 fetch 實作 Webhook（不使用 Telegraf）
- **Google Gemini**：名片圖片 OCR 辨識，model 可由使用者個人設定切換
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

> 使用 Supabase PostgreSQL，以下為各資料表規格。

### `users`
| 欄位 | 型別 | 說明 |
|------|------|------|
| id | uuid (PK, default gen_random_uuid()) | 主鍵 |
| email | text (UNIQUE, NOT NULL) | Microsoft 帳號（`@cancerfree.io`） |
| display_name | text | 顯示名稱（從 AAD 取得） |
| telegram_id | bigint (UNIQUE, nullable) | Telegram 數字 ID，使用者自行設定 |
| role | text (default 'member') | 角色：`member` 或 `super_admin` |
| gemini_model | text (default 'gemini-1.5-flash') | 個人偏好的 Gemini model |
| theme | text (default 'light') | 個人主題偏好：`light` 或 `dark` |
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
| card_img_url | text | 名片圖片 URL（Supabase Storage） |
| created_by | uuid (FK → users.id) | 建立者（哪位組織成員掃描） |
| created_at | timestamptz (default now()) | 建立時間 |

> **所有組織成員共享所有聯絡人**，無個人私有名片。

### `contact_tags`（junction table）
| 欄位 | 型別 | 說明 |
|------|------|------|
| contact_id | uuid (FK → contacts.id, ON DELETE CASCADE) | 聯絡人 |
| tag_id | uuid (FK → tags.id, ON DELETE CASCADE) | Tag |
| PRIMARY KEY (contact_id, tag_id) | | 複合主鍵 |

### `tags`
| 欄位 | 型別 | 說明 |
|------|------|------|
| id | uuid (PK) | 主鍵 |
| name | text (UNIQUE, NOT NULL) | Tag 名稱 |
| created_at | timestamptz (default now()) | 建立時間 |

### `interaction_logs`
| 欄位 | 型別 | 說明 |
|------|------|------|
| id | uuid (PK) | 主鍵 |
| contact_id | uuid (FK → contacts.id, ON DELETE CASCADE) | 關聯聯絡人 |
| content | text | 互動內容紀錄 |
| created_by | uuid (FK → users.id, nullable) | 紀錄者（nullable 保留系統自動紀錄） |
| created_at | timestamptz (default now()) | 建立時間 |

### `email_templates`
| 欄位 | 型別 | 說明 |
|------|------|------|
| id | uuid (PK) | 主鍵 |
| title | text | 範本名稱 |
| subject | text | 郵件主旨 |
| body_content | text | 郵件內文（支援 HTML） |
| created_at | timestamptz (default now()) | 建立時間 |

> Email Template 附件改為上傳至 Supabase Storage（`template-attachments` bucket），不再存 URL 陣列在資料表。

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
- 提供 `createClient()` 供 Server Component 使用（使用 `@supabase/ssr`，帶 cookie）
- 提供 `createServiceClient()` 使用 service role key（供 API route 使用）

#### `src/lib/supabase-browser.ts`
- 提供 `createBrowserSupabaseClient()` 供 Client Component 使用

#### `src/lib/gemini.ts`
- 初始化 Google Generative AI
- 匯出 `analyzeBusinessCard(imageBuffer: Buffer, model: string): Promise<CardData>`
- model 參數由呼叫端傳入（從 `users.gemini_model` 取得）
- 支援的 model 清單（供前端 dropdown 使用）：
  ```
  gemini-1.5-flash
  gemini-1.5-pro
  gemini-2.0-flash
  gemini-2.5-pro
  ```
- System Prompt：`你是一個專業名片辨識助手，請從圖中提取：姓名、公司、職稱、Email、電話，並回傳純 JSON 格式，不要有任何其他文字。格式：{"name":"","company":"","job_title":"","email":"","phone":""}`

#### `src/lib/imageProcessor.ts`
- 使用 `sharp`，函式：`processCardImage(inputBuffer: Buffer): Promise<Buffer>`
- 長邊壓縮至最大 1024px，JPEG 品質 85
- **圖片命名規則**：`yymmdd_hhmmss-{流水號}.jpg`
  - 流水號為當天的序號，每天從 001 開始，3 位數補零
  - 例：`250314_143052-001.jpg`、`250314_143052-002.jpg`
  - 流水號從 Supabase 查詢當天已存檔數量 +1 計算

#### `src/lib/graph.ts`
- 封裝 Microsoft Graph API 呼叫
- 匯出 `sendMail({ accessToken, to, subject, body, attachments? })` 函式
- 使用 `https://graph.microsoft.com/v1.0/me/sendMail` endpoint
- accessToken 從 Supabase session 的 `provider_token` 取得

---

### 6.2 主題系統（深色 / 淺色）

- 使用 `next-themes` 套件管理全域主題
- 主題儲存在 `users.theme`（`light` / `dark`），登入後從資料庫載入套用
- 在個人設定頁可切換，切換後即時更新畫面並儲存至資料庫
- **全域 CSS 規範**：
  - 所有輸入框（`input`、`textarea`、`select`）文字色必須為 `text-gray-900`（light）/ `text-gray-100`（dark），禁止使用 `text-white` 或過淺的灰色
  - placeholder 使用 `placeholder-gray-400`（light）/ `placeholder-gray-500`（dark）
  - 背景色：light 模式為白色 / 淺灰，dark 模式為深灰 / 黑

---

### 6.3 認證流程

#### `src/app/login/page.tsx`
- 顯示「Sign in with Microsoft」按鈕
- 呼叫 Supabase Auth `signInWithOAuth`，provider 為 `azure`
- 請求額外 scope：`Mail.Send`

#### `src/app/api/auth/callback/route.ts`
- 處理 OAuth callback，交換 code 取得 session
- Upsert `users` 表：以 email 為 key，更新 `display_name`、`last_login_at`
- 導向至 `/`

#### `src/middleware.ts`
- 保護所有 `/(dashboard)` 路由，未登入導向 `/login`

---

### 6.4 Telegram Bot Webhook

#### 路徑：`src/app/api/bot/route.ts`

**POST 處理流程：**

1. **權限檢查**：從 `message.from.id` 查詢 `users.telegram_id`，若不存在則回覆「⛔ 你沒有使用權限，請先在 myCRM 網站的個人設定綁定你的 Telegram ID」並終止
2. **照片處理流程（收到 `message.photo` 時）**：
   - 取得最高解析度的 photo
   - 呼叫 Telegram API 取得 `file_path`，下載圖片至記憶體 Buffer
   - 呼叫 `processCardImage()` 壓縮圖片
   - 計算當天流水號，依命名規則 `yymmdd_hhmmss-{流水號}.jpg` 命名
   - 上傳至 Supabase Storage `cards/` 目錄
   - 以該使用者的 `gemini_model` 設定呼叫 `analyzeBusinessCard(buffer, model)`
   - 回覆辨識結果，格式：
     ```
     📇 辨識結果：

     👤 姓名：{name}
     🏢 公司：{company}
     💼 職稱：{job_title}
     📧 Email：{email}
     📞 電話：{phone}

     請確認是否存檔？
     ```
   - 附上 Inline Keyboard：`[✅ 確認存檔]`，callback_data：`save_{contactJSON_base64}`
3. **Callback Query 處理（data 以 `save_` 開頭）**：
   - 解析 base64 取得聯絡人資料
   - 查詢 `users.id`（by telegram_id）
   - 寫入 `contacts` 表，`created_by` 為 `users.id`
   - 寫入 `interaction_logs`，content 為「透過 Telegram Bot 新增名片」，`created_by` 為 `users.id`
   - 回覆「✅ 已成功存檔！」，移除 Inline Button
4. **錯誤處理**：所有流程 try/catch，錯誤回覆「❌ 處理失敗，請稍後再試」

---

### 6.5 Web 管理介面

#### 共用 Layout：`src/app/(dashboard)/layout.tsx`
- 左側 Sidebar 導覽：Dashboard、聯絡人、Tag 管理、使用者管理、郵件範本、個人設定
- 使用者管理項目僅 `role = super_admin` 可見
- 頂部 Header：顯示 myCRM、目前登入使用者名稱、Sign out 按鈕

---

#### 頁面 1：Dashboard `/`
- 歡迎訊息，顯示登入使用者姓名
- 統計卡片：聯絡人總數、本月新增名片數

---

#### 頁面 2：聯絡人列表 `/contacts`
- 表格列出所有 `contacts`，欄位：姓名、公司、職稱、Email、電話、Tags、建立者（`users.display_name`）、建立時間
- 支援關鍵字搜尋（姓名或公司）
- 支援依 Tag 篩選：多選 Tag dropdown，選取後只顯示包含所選 tag 的聯絡人
- 每列點擊進入 `/contacts/[id]`
- 右上角顯示聯絡人總數

---

#### 頁面 3：聯絡人詳情 `/contacts/[id]`
- 顯示聯絡人完整資料，並顯示「由誰建立」
- 顯示名片縮圖（可點擊放大）
- **Tags 區塊**：顯示已套用的 tags，可新增（從 tag 列表選擇）或移除
- 互動紀錄時間軸：顯示 `content`、紀錄者姓名（`users.display_name`）、時間
- 「新增互動紀錄」輸入框，送出後即時更新（`created_by` 為當前登入者）
- 「寄信」按鈕，開啟 Modal：
  - 收件人預帶聯絡人 email
  - 可選擇套用 email template（帶入 subject 與 body_content）
  - 可自行填寫或修改主旨與內文
  - 送出後呼叫 `graph.ts` 的 `sendMail()`
  - 寄出後自動新增互動紀錄：「寄送郵件：{subject}」
- 返回按鈕

---

#### 頁面 4：Tag 管理 `/admin/tags`
- 列出所有 `tags`（name、使用中的聯絡人數、建立時間）
- 新增 tag：輸入名稱後送出
- 刪除 tag（需確認，刪除後聯絡人的關聯自動移除）
- 編輯 tag 名稱
- 所有組織成員均可存取

---

#### 頁面 5：使用者管理 `/admin/users`（僅 super_admin 可見）
- 列出所有 `users`（display_name、email、telegram_id 是否已綁定、role、last_login_at）
- 可修改每位使用者的 `role`（member ↔ super_admin）
- 不提供手動新增（使用者需自行用 Microsoft 登入）
- 非 super_admin 使用者導向 `/`

---

#### 頁面 6：郵件範本 `/admin/templates`
- 列出所有 `email_templates`
- 新增、編輯（title、subject、body_content HTML）、刪除
- **附件管理**：
  - 每個範本可上傳多個附件至 Supabase Storage `template-attachments/` bucket
  - 單檔限制 2MB，超過顯示錯誤提示，拒絕上傳
  - 顯示已上傳附件列表（檔名、大小），可個別刪除
  - 支援任意格式（PDF、Word、圖片等）
- 所有組織成員均可存取與編輯

---

#### 頁面 7：個人設定 `/settings`
- 顯示目前登入帳號（email、display_name）
- 顯示目前角色（role）
- 輸入框設定 `telegram_id`（文字色 `text-gray-900` / dark 模式 `text-gray-100`，確保可讀）
  - 說明文字：「請在 Telegram 傳訊給 @userinfobot，它會回傳你的數字 ID」
- **Gemini Model 選擇**：dropdown 選擇偏好的 model，選項：
  - `gemini-1.5-flash`（預設，速度快）
  - `gemini-1.5-pro`（較精準）
  - `gemini-2.0-flash`
  - `gemini-2.5-pro`
- **主題切換**：Light / Dark 切換，即時套用並儲存
- 儲存後更新 `users` 對應欄位

---

## 七、UI / 表單全域規範

> Claude Code 實作所有頁面時必須遵守以下規範：

- 所有 `input`、`textarea`、`select` 的文字顏色：
  - Light 模式：`text-gray-900`
  - Dark 模式：`dark:text-gray-100`
- Placeholder 顏色：`placeholder-gray-400 dark:placeholder-gray-500`
- 禁止在輸入框使用 `text-white`、`text-gray-300` 或更淺的顏色作為輸入文字色
- 所有表單元素需在 light 與 dark 模式下均清晰可讀

---

## 八、資料庫 Migration SQL

```sql
-- 廢除舊的 authorized_users 表（若存在）
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
  created_by uuid references users(id),
  created_at timestamptz default now()
);

-- Tags 表
create table if not exists tags (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  created_at timestamptz default now()
);

-- 聯絡人 Tags junction 表
create table if not exists contact_tags (
  contact_id uuid references contacts(id) on delete cascade,
  tag_id uuid references tags(id) on delete cascade,
  primary key (contact_id, tag_id)
);

-- 互動紀錄表
create table if not exists interaction_logs (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references contacts(id) on delete cascade,
  content text,
  created_by uuid references users(id),
  created_at timestamptz default now()
);

-- 郵件範本表
create table if not exists email_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subject text,
  body_content text,
  created_at timestamptz default now()
);

-- 郵件範本附件表
create table if not exists template_attachments (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references email_templates(id) on delete cascade,
  file_name text not null,
  file_url text not null,
  file_size int not null,
  created_at timestamptz default now()
);
```

---

## 九、Supabase Storage 設定

| Bucket | 說明 | 存取 |
|--------|------|------|
| `cards` | 名片圖片 | Public（直接 URL 顯示） |
| `template-attachments` | 郵件範本附件 | Public |

兩個 bucket 均設定：service role 可讀寫，public 可讀取。

---

## 十、Azure AD 設定

### App Registration 需要的 API Permissions
- `openid`、`profile`、`email`（預設）
- `Mail.Send`（Delegated）

### Supabase Auth Azure Provider 設定
- Redirect URI：`https://<supabase-project>.supabase.co/auth/v1/callback`
- 填入 Client ID、Client Secret、Tenant URL
- Additional Scopes：`Mail.Send`

---

## 十一、部署設定

### Vercel
- 連結 GitHub repo，設定所有環境變數
- Telegram Webhook：`https://{your-domain}/api/bot`

### 設定 Telegram Webhook
```bash
curl -X POST "https://api.telegram.org/bot{TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://{your-domain}/api/bot"}'
```

---

## 十二、開發任務清單（供 Claude Code 使用）

請先閱讀完整 PRD，理解整體架構後提出任務拆分計畫，確認後再依序實作：

- [ ] **Task 1**：執行資料庫 Migration SQL（第八節），建立新表結構
- [ ] **Task 2**：安裝 `next-themes`，設定全域主題系統；更新全域 CSS 規範（輸入框文字色）
- [ ] **Task 3**：更新 `src/lib/supabase.ts`、`src/lib/supabase-browser.ts`
- [ ] **Task 4**：更新 `src/lib/gemini.ts`（接受 model 參數）；新增 `src/lib/graph.ts`
- [ ] **Task 5**：更新 `src/lib/imageProcessor.ts`（圖片命名規則 yymmdd_hhmmss-流水號）
- [ ] **Task 6**：更新認證流程（login 頁、auth callback upsert users、middleware）
- [ ] **Task 7**：更新 Bot Webhook（查 users.telegram_id、用個人 gemini_model、新命名規則）
- [ ] **Task 8**：更新 Dashboard Layout（Sidebar 加 Tag 管理、使用者管理僅 super_admin 可見）
- [ ] **Task 9**：更新聯絡人列表（Tags 欄位、Tag 篩選 dropdown）
- [ ] **Task 10**：更新聯絡人詳情（Tags 區塊、互動紀錄顯示建立者、寄信 Modal）
- [ ] **Task 11**：新增 Tag 管理頁 `/admin/tags`
- [ ] **Task 12**：更新使用者管理頁 `/admin/users`（super_admin 角色切換）
- [ ] **Task 13**：更新郵件範本頁（多附件上傳，單檔 2MB 限制，template_attachments 表）
- [ ] **Task 14**：更新個人設定頁 `/settings`（Telegram ID、Gemini model dropdown、主題切換、顯示角色）
