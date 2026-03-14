# CHANGELOG

## v0.2 — 架構重設計（待實作）

### 變更項目
- **廢除 `authorized_users` 表**，改由 `users` 表統一管理身份
- **新增 `users` 表**：以 Microsoft AAD email 為主鍵，附加 telegram_id 綁定
- **使用者角色系統**：新增 `role` 欄位（member / admin），取代舊的 `is_admin` boolean
- **聯絡人共享**：`contacts.created_by` 改為 FK → `users.id`（原為 telegram bigint）
- **互動紀錄歸屬**：`interaction_logs.created_by` 改為 FK → `users.id`，修正 Web 端新增紀錄時 created_by 為 null 的問題
- **新增個人設定頁 `/settings`**：使用者自行綁定 Telegram ID
- **新增 `src/lib/graph.ts`**：封裝 Microsoft Graph API，支援以使用者身份寄信
- **新增寄信功能**：從聯絡人詳情頁觸發，使用 Microsoft 信箱，可套用 email template
- **更新使用者管理頁**：改為管理 `users` 表，支援角色切換，移除手動新增（改為自動登入建立）

---

## v0.1 — 初始版本（已上線）

- Telegram Bot 掃描名片 → Gemini OCR → 存入 Supabase
- Web Dashboard：聯絡人列表、詳情、互動紀錄
- Microsoft AAD SSO 登入（限 @cancerfree.io）
- 白名單管理（authorized_users）
- 郵件範本 CRUD
