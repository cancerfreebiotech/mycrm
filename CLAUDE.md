# myCRM 專案說明

## 專案目標
透過 Telegram Bot 拍名片 → AI 辨識 → 存入 CRM，並提供 Web 管理介面。

## 技術棧
- Next.js 14 (App Router, TypeScript, Tailwind)
- Supabase (PostgreSQL + Storage)
- Telegraf (Telegram Bot)
- Google Gemini 1.5 Flash (OCR)
- Sharp (圖片處理)
- 部署：Vercel

## 重要路徑
- Bot Webhook: src/app/api/bot/route.ts
- Supabase 工具: src/lib/supabase.ts
- Gemini 工具: src/lib/gemini.ts
- 圖片處理: src/lib/imageProcessor.ts
- Web 頁面: src/app/(dashboard)/

## 開發規範
- 所有 API route 使用 service role client
- 前端 Component 使用 anon client
- 圖片一律壓縮後再存 Storage
- 錯誤處理：API 一律回傳 { error: string } 格式

## 環境變數
見 .env.local.example
