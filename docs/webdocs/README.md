# 網頁內建手冊來源（docs_content）

此目錄是系統內 `/docs` 頁（DB 表 `docs_content`，3 章 × 3 語）的**來源檔**。

- 章節：`quick_start`（登入前可見）/ `user`（一般使用者）/ `super_admin`（管理員）
- 語言：`zh-TW` / `en` / `ja`
- 格式：純 Markdown，`##`/`###` 標題（頁面 TOC 依標題生成）、無 H1、無 front-matter、無外部連結與圖片

**修改流程**：改這裡的檔案 → 以 service client 對正式 DB 執行
`UPDATE public.docs_content SET content = $$…$$ WHERE locale = '<locale>' AND section = '<section>'`
（或請 Claude 同步）。**同步後必須逐列 md5 對帳**（repo 來源 vs DB content）——2026-07-11 曾發生 prod `docs_content` 被外部自動化改寫成精簡版，已還原並重同步。

**本目錄是使用手冊的唯一來源**——舊的 GitBook 結構手冊（getting-started/features/bot/admin/SUMMARY）已於 2026-07-06 移除，避免更新到錯的地方；行為疑義一律以 src/ 原始碼為準。docs/ 其餘保留檔案：CHANGELOG、PRD、newsletter-templates（compose runtime 使用）、deployment（部署指南）、mcp 文件。

最後同步：2026-07-11（v8.1.5 super_admin 三語更新＋全部 9 列自 repo 重同步、md5 對帳）。
