# PRD：myCRM — Telegram 名片辨識 CRM 系統

> 此文件供 Claude Code 使用。請先閱讀完整 PRD，理解需求後提出技術架構與任務拆分計畫，確認後再開始實作。

---

## 一、專案概覽

| 項目 | 內容 |
|------|------|
| 專案名稱 | myCRM |
| 核心功能 | 透過 Telegram Bot 拍攝名片，自動 OCR 辨識後存入組織共享 CRM，並提供 Web 管理介面 |
| 技術棧 | Next.js 14 (App Router, TypeScript) + Supabase + Telegram Bot + Gemini 1.5 Flash |
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
```

### 服務整合
- **Supabase**：PostgreSQL 資料庫 + Storage（名片圖片）+ Auth（Microsoft AAD OAuth）
- **Telegram Bot API**：原生 fetch 實作 Webhook（不使用 Telegraf）
- **Google Gemini 1.5 Flash**：名片圖片 OCR 辨識
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
| `admin` | 可管理所有使用者角色、查看操作紀錄 |

> 第一位登入者需由開發者在 Supabase 資料庫手動將 `role` 設為 `admin`。之後 Admin 可從 Web 介面管理其他人的角色。

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
| role | text (default 'member') | 角色：`member` 或 `admin` |
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
| attachment_urls | text[] | 預設附件 URL 陣列 |
| created_at | timestamptz (default now()) | 建立時間 |

> Email Template 為組織共享，所有成員均可使用與編輯。

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
- 初始化 Google Generative AI，使用 `gemini-1.5-flash` 模型
- 匯出 `analyzeBusinessCard(imageBuffer: Buffer): Promise<CardData>`
- System Prompt：`你是一個專業名片辨識助手，請從圖中提取：姓名、公司、職稱、Email、電話，並回傳純 JSON 格式，不要有任何其他文字。格式：{"name":"","company":"","job_title":"","email":"","phone":""}`

#### `src/lib/imageProcessor.ts`
- 使用 `sharp`，函式：`processCardImage(inputBuffer: Buffer): Promise<Buffer>`
- 長邊壓縮至最大 1024px，JPEG 品質 85

#### `src/lib/graph.ts`（新增）
- 封裝 Microsoft Graph API 呼叫
- 匯出 `sendMail({ accessToken, to, subject, body, attachments? })` 函式
- 使用 `https://graph.microsoft.com/v1.0/me/sendMail` endpoint
- accessToken 從 Supabase session 的 `provider_token` 取得

---

### 6.2 認證流程

#### `src/app/login/page.tsx`
- 顯示「Sign in with Microsoft」按鈕
- 呼叫 Supabase Auth `signInWithOAuth`，provider 為 `azure`
- 請求額外 scope：`Mail.Send`（用於後續寄信）

#### `src/app/api/auth/callback/route.ts`
- 處理 OAuth callback，交換 code 取得 session
- Upsert `users` 表：以 email 為 key，更新 `display_name`、`last_login_at`
- 導向至 `/`（Dashboard）

#### `src/middleware.ts`
- 保護所有 `/(dashboard)` 路由，未登入導向 `/login`

---

### 6.3 Telegram Bot Webhook

#### 路徑：`src/app/api/bot/route.ts`

**POST 處理流程：**

1. **權限檢查**：從 `message.from.id` 查詢 `users.telegram_id`，若不存在則回覆「⛔ 你沒有使用權限，請先在 myCRM 網站的個人設定綁定你的 Telegram ID」並終止
2. **照片處理流程（收到 `message.photo` 時）**：
   - 取得最高解析度的 photo
   - 呼叫 Telegram API 取得 `file_path`，下載圖片至記憶體 Buffer
   - 呼叫 `processCardImage()` 壓縮圖片
   - 上傳至 Supabase Storage，路徑：`cards/{user_id}_{timestamp}.jpg`
   - 呼叫 `analyzeBusinessCard()` 取得辨識結果
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

### 6.4 Web 管理介面

#### 共用 Layout：`src/app/(dashboard)/layout.tsx`
- 左側 Sidebar 導覽：Dashboard、聯絡人、使用者管理、郵件範本、個人設定
- 頂部 Header：顯示 myCRM、目前登入使用者名稱、Sign out 按鈕
- 使用者管理項目僅 `role = admin` 可見

---

#### 頁面 1：Dashboard `/`
- 歡迎訊息，顯示登入使用者姓名
- 統計卡片：聯絡人總數、本月新增名片數

---

#### 頁面 2：聯絡人列表 `/contacts`
- 表格列出所有 `contacts`，欄位：姓名、公司、職稱、Email、電話、建立者（`users.display_name`）、建立時間
- 支援關鍵字搜尋（姓名或公司）
- 每列點擊進入 `/contacts/[id]`
- 右上角顯示聯絡人總數

---

#### 頁面 3：聯絡人詳情 `/contacts/[id]`
- 顯示聯絡人完整資料，並顯示「由誰建立」
- 顯示名片縮圖（可點擊放大）
- 互動紀錄時間軸：顯示 `content`、紀錄者姓名（`users.display_name`）、時間
- 「新增互動紀錄」輸入框，送出後即時更新（`created_by` 為當前登入者）
- 「寄信」按鈕，開啟 Modal：
  - 收件人預帶聯絡人 email
  - 可選擇套用 email template，或自行填寫主旨與內文
  - 送出後呼叫 `graph.ts` 的 `sendMail()`
  - 寄出後自動新增互動紀錄：「寄送郵件：{subject}」
- 返回按鈕

---

#### 頁面 4：使用者管理 `/admin/users`（僅 admin 可見）
- 列出所有 `users`（display_name、email、telegram_id 是否已綁定、role、last_login_at）
- 可修改每位使用者的 `role`（member ↔ admin）
- 不提供手動新增（使用者需自行用 Microsoft 登入）
- 非 admin 使用者導向 `/`

---

#### 頁面 5：郵件範本 `/admin/templates`
- 列出所有 `email_templates`
- 新增、編輯（title、subject、body_content HTML、attachment_urls）、刪除
- 所有組織成員均可存取與編輯

---

#### 頁面 6：個人設定 `/settings`
- 顯示目前登入帳號（email、display_name）
- 輸入框設定 `telegram_id`
- 說明文字：「請在 Telegram 傳訊給 @userinfobot，它會回傳你的數字 ID」
- 儲存後更新 `users.telegram_id`

---

## 七、資料庫 Migration SQL

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
  attachment_urls text[],
  created_at timestamptz default now()
);
```

---

## 八、Supabase Storage 設定

- Bucket 名稱：`cards`
- 設定為 **public** bucket
- RLS Policy：service role 可讀寫，public 可讀取

---

## 九、Azure AD 設定

### App Registration 需要的 API Permissions
- `openid`、`profile`、`email`（預設）
- `Mail.Send`（Delegated）— 用於代表使用者寄信

### Supabase Auth Azure Provider 設定
- Redirect URI：`https://<supabase-project>.supabase.co/auth/v1/callback`
- 填入 Client ID、Client Secret、Tenant URL
- Additional Scopes：`Mail.Send`

---

## 十、部署設定

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

## 十一、開發任務清單（供 Claude Code 使用）

請先閱讀完整 PRD，理解整體架構後提出任務拆分計畫，確認後再依序實作：

- [ ] **Task 1**：執行資料庫 Migration SQL（第七節），建立新表結構
- [ ] **Task 2**：更新 `src/lib/supabase.ts`、`src/lib/supabase-browser.ts`
- [ ] **Task 3**：新增 `src/lib/graph.ts`（Microsoft Graph 寄信封裝）
- [ ] **Task 4**：更新認證流程（login 頁加 Mail.Send scope、auth callback upsert users 表、middleware）
- [ ] **Task 5**：更新 Bot Webhook（白名單改查 `users.telegram_id`，`created_by` 改存 `users.id`）
- [ ] **Task 6**：更新 Dashboard Layout（Sidebar 加「個人設定」，使用者管理僅 admin 可見）
- [ ] **Task 7**：更新聯絡人列表（新增「建立者」欄位顯示 display_name）
- [ ] **Task 8**：更新聯絡人詳情（互動紀錄顯示建立者姓名、新增寄信 Modal）
- [ ] **Task 9**：新增個人設定頁 `/settings`（Telegram ID 綁定）
- [ ] **Task 10**：更新使用者管理頁 `/admin/users`（改為管理 `users` 表、角色切換）
- [ ] **Task 11**：確認郵件範本頁欄位對應新 schema
