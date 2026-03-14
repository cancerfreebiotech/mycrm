# CHANGELOG

## v0.3 — 功能擴充（待實作）

### 變更項目
- **UI 修正**：所有輸入框文字色改為 `text-gray-900`（light）/ `text-gray-100`（dark），禁止過淺顏色
- **深色/淺色主題**：新增全域主題切換，使用 `next-themes`，偏好儲存於 `users.theme`
- **角色系統調整**：`admin` 改名為 `super_admin`，系統可有多位 super_admin
- **個人設定頁新增**：顯示角色、Gemini model dropdown 切換、主題切換
- **Gemini model 個人化**：每位使用者可設定偏好 model，Bot 掃名片時使用該使用者的 model
- **圖片命名規則**：改為 `yymmdd_hhmmss-{流水號}.jpg`，流水號每天從 001 重置
- **聯絡人 Tag 功能**：新增 `tags` 表與 `contact_tags` junction 表，聯絡人可貼多個 tag
- **Tag 管理頁**：新增 `/admin/tags` 頁面，所有成員可管理
- **聯絡人列表 Tag 篩選**：可依 tag 多選篩選
- **郵件範本附件**：改為真實檔案上傳（Supabase Storage），單檔限 2MB，新增 `template_attachments` 表

---

## v0.2 — 架構重設計（待實作）

### 變更項目
- **廢除 `authorized_users` 表**，改由 `users` 表統一管理身份
- **新增 `users` 表**：以 Microsoft AAD email 為主鍵，附加 telegram_id 綁定
- **使用者角色系統**：新增 `role` 欄位（member / super_admin），取代舊的 `is_admin` boolean
- **聯絡人共享**：`contacts.created_by` 改為 FK → `users.id`
- **互動紀錄歸屬**：`interaction_logs.created_by` 改為 FK → `users.id`
- **新增個人設定頁 `/settings`**：使用者自行綁定 Telegram ID
- **新增 `src/lib/graph.ts`**：Microsoft Graph API 寄信
- **新增寄信功能**：從聯絡人詳情頁觸發，使用 Microsoft 信箱，可套用 email template
- **更新使用者管理頁**：管理 `users` 表，支援角色切換

---

## v0.1 — 初始版本（已上線）

- Telegram Bot 掃描名片 → Gemini OCR → 存入 Supabase
- Web Dashboard：聯絡人列表、詳情、互動紀錄
- Microsoft AAD SSO 登入（限 @cancerfree.io）
- 白名單管理（authorized_users）
- 郵件範本 CRUD
