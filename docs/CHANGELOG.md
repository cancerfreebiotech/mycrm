# CHANGELOG

## v0.5 — Bot 強化 + 網頁功能擴充（待實作）

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
