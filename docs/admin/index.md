---
title: 管理員
nav_order: 5
has_children: true
---

# 管理員

> 本區為系統管理功能，多數僅限 `super_admin`。自 v2.3 起，部分功能可由 super_admin 在[使用者管理](users.md)中逐項授權給一般成員；未授權的成員不會在側邊欄看到對應項目。

**可授權給一般成員的功能**：標籤、未分配筆記、郵件範本、提示詞、國家、電子報、辨識失敗審查、重複聯絡人、名片王匯入、回收區、匯出聯絡人、群發郵件、使用者管理（限重設 MFA / 編輯 Telegram）。

**報表**開放所有成員使用，各自管理自己的排程；super_admin 可看到全部排程。

**僅限 super_admin**：AI 模型、系統健康、MCP 活動、MCP 權杖、Email 復活、共用 Email、意見回饋。

| 功能 | 說明 |
|------|------|
| [使用者管理](users.md) | 管理成員帳號、角色、功能授權、重設 MFA、編輯 Telegram、Teams 綁定狀態、維護模式 |
| [標籤管理](tags.md) | 新增、重新命名、刪除聯絡人標籤，並可將標籤設為 Email 黑名單 |
| [AI 模型](models.md) | 設定 AI 服務商（Endpoint）與可用模型 |
| [郵件範本](templates.md) | 管理 AI 產生郵件的提示詞範本 |
| [提示詞](prompts.md) | 設定名片辨識與 AI 助理使用的系統提示詞（留空則用系統預設） |
| [國家管理](countries.md) | 維護國家清單（ISO 代碼、多語系名稱、旗幟 emoji、啟用狀態） |
| 電子報 | 訂閱者管理 / 電子報編輯 / 寄送 / PDF 匯出 / RSS 給 Substack 抓草稿 |
| [報表](reports.md) | 產生互動紀錄報表（JSON 預覽或 Excel）與定期排程寄送 |
| [名片王匯入審查](camcard.md) | 批次匯入名片並依公司分組審查辨識結果 |
| [重複聯絡人審查](duplicates.md) | 找出並合併重複的聯絡人 |
| [辨識失敗審查](failed-scans.md) | 檢視辨識失敗（無法識別姓名）的名片，手動建立聯絡人後標記完成 |
| 未指派筆記 | 查看尚未綁定聯絡人的 Bot 筆記 |
| [回收區](trash.md) | 還原或永久刪除已刪除的聯絡人 |
| [Email 復活](email-recovery.md) | 針對退信／無效 email 的聯絡人，找出換工作後的新名片並一鍵替換 email |
| [共用 Email 聯絡人](shared-emails.md) | 找出兩個以上聯絡人共用同一個 email（夫妻、家人、共用信箱） |
| [意見回饋管理](feedback.md) | 檢視並處理使用者送出的意見回饋 |
| [系統健康](health.md) | 檢視各外部服務與系統元件的健康狀態 |
| [MCP 活動紀錄](mcp-activity.md) | 檢視 AI 助理（MCP）的操作紀錄 |
| [MCP 權杖](mcp-tokens.md) | 管理外部 agent 使用的存取金鑰（明文僅顯示一次） |
| [稽核日誌](audit-log.md) | 檢視角色變更、刪除等特權操作的稽核紀錄 |
| [組織設定與品牌](org-settings.md) | 全公司名稱、登入網域與電子報品牌設定 |
