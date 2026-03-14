# CHANGELOG

## v0.4 — Bot 強化 + 聯絡人管理擴充（待實作）

### 變更項目
- **Bot：存檔確認新增 `[❌ 不存檔]` 按鈕**
- **Bot：支援會議筆記輸入**（/note 指令 + @姓名快速格式）
- **Bot：找不到聯絡人時建立未歸類筆記**（contact_id=null）
- **Bot：支援 `/add_back @姓名` 補充名片反面**
- **Bot：新增 `bot_sessions` 表管理多步驟對話狀態**
- **重複聯絡人偵測**：存檔前比對 email（完全重複）+ 姓名相似度（疑似重複），需啟用 pg_trgm
- **`interaction_logs` 新增欄位**：`type`（note/meeting/email）、`meeting_date`；`contact_id` 改為 nullable
- **`contacts` 新增欄位**：`card_img_back_url`（名片反面）
- **網頁新增聯絡人**：`/contacts/new` 頁面，含照片上傳 + AI 辨識 + 重複偵測
- **網頁編輯聯絡人**：聯絡人詳情頁新增編輯 Modal
- **Export 功能**：聯絡人列表可匯出 Excel/CSV（依目前篩選結果）
- **未歸類筆記頁**：`/unassigned-notes`，可指定歸類到聯絡人
- **Dashboard 待處理區塊**：顯示最新 5 筆未歸類筆記
- **新增 OCR API Route**：`/api/ocr`，供網頁端使用
- **新增 `src/lib/duplicate.ts`**：重複聯絡人偵測邏輯
- **Gemini 多語言支援**：System Prompt 調整，支援中英日文名片

---

## v0.3 — 功能擴充（待實作）

### 變更項目
- **UI 修正**：所有輸入框文字色改為 `text-gray-900` / `dark:text-gray-100`
- **深色/淺色主題**：`next-themes`，偏好儲存於 `users.theme`
- **角色系統**：`admin` 改名為 `super_admin`，可有多位
- **個人設定頁**：顯示角色、Gemini model dropdown、主題切換
- **Gemini model 個人化**：Bot 掃名片使用該使用者的 model
- **圖片命名規則**：`yymmdd_hhmmss-流水號.jpg`，流水號每天從 001 重置
- **聯絡人 Tag 功能**：`tags` 表 + `contact_tags` junction 表
- **Tag 管理頁**：`/admin/tags`
- **聯絡人列表 Tag 篩選**
- **郵件範本附件**：真實檔案上傳，單檔限 2MB，`template_attachments` 表

---

## v0.2 — 架構重設計（待實作）

### 變更項目
- **廢除 `authorized_users` 表**，改由 `users` 表統一管理
- **`users` 表**：Microsoft AAD email 為主鍵，附加 telegram_id 綁定
- **角色系統**：`role` 欄位（member / super_admin）
- **聯絡人共享**：`contacts.created_by` → `users.id`
- **互動紀錄歸屬**：`interaction_logs.created_by` → `users.id`
- **個人設定頁 `/settings`**：Telegram ID 綁定
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
