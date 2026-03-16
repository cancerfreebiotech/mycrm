---
title: Teams Bot 總覽
parent: Bot 使用說明
nav_order: 4
---

# Teams Bot 總覽

myCRM Teams Bot 提供任務通知功能，當有任務指派給你時，會在 Microsoft Teams 個人聊天中收到 **Adaptive Card** 通知。

---

## 功能

| 功能 | 說明 |
|------|------|
| 任務通知 | 新任務指派時，在 Teams 推送 Adaptive Card |
| 一鍵完成 | 在 Teams 直接點擊「標記完成」按鈕，不需開啟 Web |
| 任務連結 | Card 附「前往任務管理」連結 |
| `/help` 指令 | 在 Teams 聊天輸入 `help` 顯示說明 |

---

## 通知卡片範例

```
┌────────────────────────────────────┐
│ ✅ 任務指派通知                     │
│                                    │
│ 📌 請整理 Q1 業績報告              │
│ ⏰ 截止：2026/03/31 18:00          │
│ 👤 指派者：陳總監                  │
│                                    │
│  [標記完成]  [前往任務管理]        │
└────────────────────────────────────┘
```

點擊「標記完成」後，Bot 會更新任務狀態並回覆確認訊息。

---

## 帳號綁定

Bot 採用**自動綁定**機制，不需任何手動操作：

1. 在 Teams 搜尋 Bot 名稱，開啟 **1-on-1 聊天**
2. 傳送任何訊息（例如 `help`）
3. Bot 自動透過 Microsoft Graph 解析你的 AAD 帳號 → 比對 CRM 使用者 → 完成綁定

綁定成功後，`help` 指令會顯示：
```
📋 myCRM Bot（已綁定：your.email@company.com）
任務通知會自動傳送到這裡。
```

> 綁定需要你的 Teams 帳號 email 與 CRM 登入 email 相同（同一個 Microsoft 365 帳號）。

---

## 限制

- Teams Bot 目前僅支援**個人聊天**通知（不支援 Channel 主動推播）
- 需要使用者在 Teams 中先與 Bot 對話一次才能接收通知
- 設定教學請見 [Teams Bot 設定](../deployment/teams-setup.md)
