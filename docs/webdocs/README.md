# 網頁內建手冊來源（docs_content）

此目錄是系統內 `/docs` 頁（DB 表 `docs_content`，3 章 × 3 語）的**來源檔**。

- 章節：`quick_start`（登入前可見）/ `user`（一般使用者）/ `super_admin`（管理員）
- 語言：`zh-TW` / `en` / `ja`
- 格式：純 Markdown，`##`/`###` 標題（頁面 TOC 依標題生成）、無 H1、無 front-matter、無外部連結與圖片

**修改流程**：改這裡的檔案 → 以 service client 對正式 DB 執行
`UPDATE public.docs_content SET content = $$…$$ WHERE locale = '<locale>' AND section = '<section>'`
（或請 Claude 同步）。docs/ 其餘目錄為完整版手冊（GitBook 結構遺產），供取材與對照。

最後同步：2026-07-06（v7.9.6 全功能重寫）。
