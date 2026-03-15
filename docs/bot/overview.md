---
title: Telegram Bot 總覽
parent: Bot 使用說明
nav_order: 1
---

# Telegram Bot 總覽

myCRM Telegram Bot 是系統的主要資料輸入管道，支援：

| 功能 | 指令 |
|------|------|
| 名片掃描（拍照上傳） | 直接傳送照片 |
| 搜尋聯絡人 | `/search` |
| 新增互動筆記 | `/note` |
| 發送 Email | `/email` |
| 補充名片反面 | `/add_back` |
| 建立任務 | `/work` |
| 查看我的任務 | `/tasks` |
| 列出組織成員 | `/user` |
| 說明 | `/help` |

---

## 使用流程（名片掃描）

```
使用者傳送名片照片
        ↓
Bot 上傳圖片到 Supabase Storage
        ↓
呼叫 Gemini AI 辨識所有欄位
        ↓
Bot 顯示辨識結果，詢問是否存檔
        ↓
使用者選擇：
  ✅ 存檔 → 寫入 contacts 表
  ❌ 不存檔 → 刪除圖片
```

---

## 多步驟對話

Bot 使用 `bot_sessions` 資料表管理多步驟的對話狀態（例如：搜尋聯絡人 → 選擇 → 輸入筆記內容），每位使用者獨立維護對話狀態。

---

## 連續傳圖保護

同一使用者若有超過 **5 張**待確認的名片未處理，Bot 會拒絕新照片並提示先處理現有待確認項目。
