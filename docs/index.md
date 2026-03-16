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
| 📷 名片掃描 | Telegram Bot 或網頁上傳，最多 6 張合併 AI 辨識，左右對照確認 |
| 👥 聯絡人管理 | 完整的聯絡人資料庫，含國家欄位、Email 複製、Tag 分類、批次上傳、Excel 匯出 |
| ✅ 任務管理 | Bot 自然語言建立任務，Web 介面三分頁管理，可指派助理代為完成 |
| 📝 互動紀錄 | 筆記、會議記錄、Email 紀錄，與聯絡人連結 |
| 📧 增強寄信 | 可編輯收件人、套用範本（含附件）、AI 生成內文、臨時附件 |
| 📊 報表 | Excel 報表一鍵下載，或設定排程自動寄 Gmail |
| 🌍 國家管理 | Admin 維護多語系國家清單（含旗幟 emoji），與聯絡人連結 |
| 🌐 多語系 | 繁體中文 / English / 日本語 |
| 🌓 深色模式 | 支援 Light / Dark 主題切換 |
| 📱 行動版 | Hamburger 側邊選單，平板收縮為 icon-only |

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

目前版本：**v1.2.1**（2026-03-16）

> 詳細版本紀錄請見 [CHANGELOG](CHANGELOG.md)

---

## 快速導覽

- **一般使用者**：請從 [第一次登入](getting-started/first-login.md) 開始
- **Bot 使用者**：請看 [指令列表](bot/commands.md)
- **管理員**：請看 [管理員專區](admin/users.md)
- **IT / 部署**：請看 [系統部署](deployment/setup.md)
