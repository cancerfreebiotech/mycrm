---
title: 首頁
nav_order: 1
---

# myCRM 說明書

myCRM 是 CancerFree Biotech 內部使用的聯絡人關係管理系統，核心功能是透過 **Telegram Bot 拍名片 → AI 辨識 → 自動存入資料庫**，並搭配 Web 管理介面進行聯絡人維護、任務指派、報表匯出等作業。

---

## 系統特色

| 功能 | 說明 |
|------|------|
| 📷 名片掃描 | Telegram Bot 接收名片照片，Gemini AI 自動辨識所有欄位 |
| 👥 聯絡人管理 | 完整的聯絡人資料庫，支援 Tag 分類、批次上傳、Excel 匯出 |
| ✅ 任務管理 | Bot 自然語言建立任務，Web 介面三分頁管理，Teams Bot 通知 |
| 📝 互動紀錄 | 筆記、會議記錄、Email 紀錄，與聯絡人連結 |
| 📊 報表 | Excel 報表一鍵下載，或設定排程自動寄 Gmail |
| 🌐 多語系 | 繁體中文 / English / 日本語 |
| 🌓 深色模式 | 支援 Light / Dark 主題切換 |

---

## 系統架構

```
Telegram Bot ──→ Webhook (Next.js API Route)
                      │
                      ├──→ Gemini AI (OCR + 任務解析)
                      │
                      └──→ Supabase (PostgreSQL + Storage)
                                │
                          Web Dashboard (Next.js)
                                │
                          Microsoft Teams Bot
```

---

## 版本資訊

目前版本：**v1.0**（2026-03-15）

> 詳細版本紀錄請見 [CHANGELOG](CHANGELOG.md)

---

## 快速導覽

- **一般使用者**：請從 [第一次登入](getting-started/first-login.md) 開始
- **Bot 使用者**：請看 [指令列表](bot/commands.md)
- **管理員**：請看 [管理員專區](admin/users.md)
