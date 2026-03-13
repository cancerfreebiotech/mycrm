# PRD：myCRM — Telegram 名片辨識 CRM 系統

> 此文件供 Claude Code 使用。請先閱讀完整 PRD，理解需求後提出技術架構與任務拆分計畫，確認後再開始實作。

---

## 一、專案概覽

| 項目 | 內容 |
|------|------|
| 專案名稱 | myCRM |
| 核心功能 | 透過 Telegram Bot 拍攝名片，自動 OCR 辨識後存入 CRM，並提供 Web 管理介面 |
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
telegraf
@google/generative-ai
nodemailer
sharp
lucide-react
```

### 服務整合
- **Supabase**：PostgreSQL 資料庫 + Storage（名片圖片）
- **Telegram Bot API**：透過 Telegraf 實作 Webhook
- **Google Gemini 1.5 Flash**：名片圖片 OCR 辨識
- **Nodemailer**：發送郵件（預留功能）

---

## 三、資料庫結構

> 使用 Supabase PostgreSQL，以下為各資料表規格。

### `authorized_users`
| 欄位 | 型別 | 說明 |
|------|------|------|
| id | uuid (PK, default gen_random_uuid()) | 主鍵 |
| telegram_id | bigint (UNIQUE, NOT NULL) | Telegram 使用者 ID |
| name | text | 顯示名稱 |
| is_admin | boolean (default false) | 是否為管理員 |
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
| created_by | bigint | 建立者 telegram_id |
| created_at | timestamptz (default now()) | 建立時間 |

### `interaction_logs`
| 欄位 | 型別 | 說明 |
|------|------|------|
| id | uuid (PK) | 主鍵 |
| contact_id | uuid (FK → contacts.id) | 關聯聯絡人 |
| content | text | 互動內容紀錄 |
| created_by | bigint | 紀錄者 telegram_id |
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

---

## 四、環境變數

建立 `.env.local`，包含以下變數：

```env
# Telegram
TELEGRAM_BOT_TOKEN=

# Google Gemini
GEMINI_API_KEY=

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Vercel (部署後設定)
NEXTAUTH_URL=
```

---

## 五、功能規格

### 5.1 基礎工具庫

#### `src/lib/supabase.ts`
- 初始化並匯出 Supabase client（使用 `@supabase/ssr`）
- 提供 `createClient()` 供 Server Component 使用
- 提供 `createServiceClient()` 使用 service role key（供 API route 使用）

#### `src/lib/gemini.ts`
- 初始化 Google Generative AI 客戶端
- 設定使用 `gemini-1.5-flash` 模型
- 匯出 `analyzeBusinessCard(imageBuffer: Buffer): Promise<CardData>` 函式
- System Prompt：`你是一個專業名片辨識助手，請從圖中提取：姓名、公司、職稱、Email、電話，並回傳純 JSON 格式，不要有任何其他文字。格式：{"name":"","company":"","job_title":"","email":"","phone":""}`

#### `src/lib/imageProcessor.ts`
- 使用 `sharp` 實作圖片壓縮
- 函式簽名：`processCardImage(inputBuffer: Buffer): Promise<Buffer>`
- 邏輯：將圖片長邊壓縮至最大 1024px（等比例縮放），輸出為 JPEG 格式，品質 85

---

### 5.2 Telegram Bot Webhook

#### 路徑：`src/app/api/bot/route.ts`

**POST 處理流程：**

1. **驗證 Telegram Secret Token**（選用，建議加上 `X-Telegram-Bot-Api-Secret-Token` header 驗證）
2. **權限檢查**：從 `message.from.id` 查詢 `authorized_users` 表，若不存在則回覆「⛔ 你沒有使用權限」並終止
3. **照片處理流程（收到 `message.photo` 時）**：
   - 取得最高解析度的 photo（`photo[photo.length - 1]`）
   - 呼叫 Telegram API 取得 `file_path`
   - 從 `https://api.telegram.org/file/bot{TOKEN}/{file_path}` 下載圖片至記憶體 Buffer
   - 呼叫 `processCardImage()` 壓縮圖片
   - 將壓縮後圖片上傳至 Supabase Storage，路徑：`cards/{telegram_id}_{timestamp}.jpg`
   - 將壓縮後圖片 Buffer 傳給 `analyzeBusinessCard()` 取得辨識結果
   - Bot 回覆辨識結果訊息，格式如下：
     ```
     📇 辨識結果：
     
     👤 姓名：{name}
     🏢 公司：{company}
     💼 職稱：{job_title}
     📧 Email：{email}
     📞 電話：{phone}
     
     請確認是否存檔？
     ```
   - 附上 Inline Keyboard Button：`[✅ 確認存檔]`，callback_data 格式：`save_{contactJSON_base64}`

4. **Callback Query 處理（收到 `callback_query` 且 data 以 `save_` 開頭時）**：
   - 解析 base64 取得聯絡人資料
   - 寫入 `contacts` 表，`created_by` 為 `from.id`
   - 同時寫入一筆 `interaction_logs`，content 為「透過 Telegram Bot 新增名片」
   - 回覆：「✅ 已成功存檔！」
   - 更新原訊息移除 Inline Button

5. **錯誤處理**：所有流程加上 try/catch，錯誤時回覆「❌ 處理失敗，請稍後再試」

---

### 5.3 Web 管理介面

> 使用 Tailwind CSS 美化，風格簡潔專業。所有頁面需要基本的登入保護（可先用 Supabase Auth 或簡單的 middleware 判斷）。

#### 共用 Layout：`src/app/(dashboard)/layout.tsx`
- 左側 Sidebar 導覽：Dashboard、聯絡人、白名單管理、郵件範本
- 頂部 Header：顯示系統名稱 myCRM

---

#### 頁面 1：聯絡人列表 `/contacts`

- 以表格列出所有 `contacts`，欄位：姓名、公司、職稱、Email、電話、建立時間
- 支援關鍵字搜尋（名字或公司）
- 每列可點擊進入詳情頁 `/contacts/[id]`
- 右上角顯示聯絡人總數

---

#### 頁面 2：聯絡人詳情 `/contacts/[id]`

- 顯示聯絡人基本資料（姓名、公司、職稱、Email、電話）
- 若有 `card_img_url`，顯示名片縮圖（點擊可放大）
- 互動紀錄時間軸：依 `created_at` 降序排列，顯示每筆 `interaction_logs` 的內容與時間
- 提供「新增互動紀錄」的文字輸入框，送出後即時更新時間軸
- 返回按鈕回到聯絡人列表

---

#### 頁面 3：白名單管理 `/admin/users`

- 列出所有 `authorized_users`（telegram_id、名稱、是否管理員、建立時間）
- 新增授權使用者：輸入 Telegram ID 與名稱，勾選是否為管理員，送出後新增至資料表
- 刪除：每列有刪除按鈕，確認後從資料表移除
- 僅 `is_admin = true` 的使用者可存取此頁面

---

#### 頁面 4：郵件範本 `/admin/templates`

- 列出所有 `email_templates`（標題、主旨、建立時間）
- 點擊「編輯」開啟編輯介面：
  - 輸入範本名稱、郵件主旨
  - 多行文字框編輯郵件內文（支援 HTML）
  - 附件 URL 清單（可新增/刪除）
- 儲存後更新 `email_templates` 表
- 支援新增與刪除範本

---

## 六、專案初始化指令

```bash
# 1. 建立 Next.js 專案
npx create-next-app@latest . --typescript --eslint --tailwind --src-dir --app --no-import-alias

# 2. 安裝核心套件
npm install @supabase/ssr @supabase/supabase-js telegraf @google/generative-ai nodemailer sharp lucide-react

# 3. 安裝型別定義
npm install -D @types/nodemailer
```

### 初始化 Git
```bash
git init
git add .
git commit -m "chore: initial commit"
```

### 建立 GitHub Repo 並推上去
```bash
# 先在 GitHub 手動建立一個名為 mycrm 的空白 repo（不要勾選任何初始檔案）
# 然後執行：
git remote add origin https://github.com/你的帳號/mycrm.git
git branch -M main
git push -u origin main
```

### 之後每次開發完
```bash
git add .
git commit -m "feat: 功能描述"
git push
```

---

## 七、Supabase Storage 設定

- 建立 bucket：`cards`
- 設定為 **public** bucket（方便直接用 URL 顯示名片圖片）
- RLS Policy：service role 可讀寫，public 可讀取

---

## 八、部署設定

### Vercel
- 連結 GitHub repo
- 設定所有環境變數（見第四節）
- Telegram Webhook URL 設定為：`https://{your-domain}/api/bot`

### 設定 Telegram Webhook
```bash
curl -X POST "https://api.telegram.org/bot{TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://{your-domain}/api/bot"}'
```

---

## 九、CLAUDE.md 內容（請在專案根目錄建立此檔案）

```markdown
# myCRM 專案說明

## 專案目標
透過 Telegram Bot 拍名片 → AI 辨識 → 存入 CRM，並提供 Web 管理介面。

## 技術棧
- Next.js 14 (App Router, TypeScript, Tailwind)
- Supabase (PostgreSQL + Storage)
- Telegraf (Telegram Bot)
- Google Gemini 1.5 Flash (OCR)
- Sharp (圖片處理)
- 部署：Vercel

## 重要路徑
- Bot Webhook: src/app/api/bot/route.ts
- Supabase 工具: src/lib/supabase.ts
- Gemini 工具: src/lib/gemini.ts
- 圖片處理: src/lib/imageProcessor.ts
- Web 頁面: src/app/(dashboard)/

## 開發規範
- 所有 API route 使用 service role client
- 前端 Component 使用 anon client
- 圖片一律壓縮後再存 Storage
- 錯誤處理：API 一律回傳 { error: string } 格式

## 環境變數
見 .env.local.example
```

---

## 十、開發任務清單（供 Claude Code 使用）

請依序完成以下任務，每個任務完成後確認再進行下一個：

- [ ] **Task 1**：專案初始化（create-next-app + 安裝套件）
- [ ] **Task 2**：建立資料庫 Migration SQL 並在 Supabase 執行
- [ ] **Task 3**：建立 `src/lib/supabase.ts`、`src/lib/gemini.ts`、`src/lib/imageProcessor.ts`
- [ ] **Task 4**：建立 `.env.local.example` 與 `CLAUDE.md`
- [ ] **Task 5**：實作 `src/app/api/bot/route.ts`（Telegram Webhook 完整邏輯）
- [ ] **Task 6**：建立 Dashboard Layout 與 Sidebar
- [ ] **Task 7**：實作 `/contacts` 聯絡人列表頁
- [ ] **Task 8**：實作 `/contacts/[id]` 聯絡人詳情頁
- [ ] **Task 9**：實作 `/admin/users` 白名單管理頁
- [ ] **Task 10**：實作 `/admin/templates` 郵件範本頁
- [ ] **Task 11**：設定 Vercel 部署與 Telegram Webhook URL
