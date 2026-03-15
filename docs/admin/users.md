# 使用者管理

路徑：`/admin/users`（僅 super_admin 可見）

---

## 使用者列表

顯示所有已登入系統的成員，欄位包含：

| 欄位 | 說明 |
|------|------|
| 顯示名稱 | 使用者設定的名稱 |
| Email | Microsoft 帳號（主鍵） |
| 角色 | member / super_admin |
| Telegram ID | 已綁定的 Telegram 帳號 |
| AI 模型 | 個人使用的 AI 模型 |
| 加入時間 | 首次登入時間 |

---

## 角色管理

點擊使用者列表中的角色按鈕即可切換：

- `member` → 一般使用者
- `super_admin` → 可存取管理功能

> 注意：至少需要保留一位 super_admin，避免所有管理員被降權。

---

## 注意事項

- 使用者帳號在**第一次登入**時自動建立，無法手動預先建立
- 只有 `@cancerfree.io` 網域的 Microsoft 帳號才能登入
- 刪除使用者：目前需透過 Supabase Dashboard 直接操作 DB
