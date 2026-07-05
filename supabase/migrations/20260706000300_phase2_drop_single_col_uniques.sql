-- ============================================================
-- DROP 單欄 UNIQUE（並存策略後半）— v8.0 Phase 2
-- 執行日期：2026-07-06（⚠️ 必須在含複合 onConflict 目標的程式碼
-- 部署完成「之後」才套用——舊程式碼的單欄 onConflict 在約束移除後
-- 會以 42P10 失敗）
--
-- Phase 0 建立的複合唯一索引 (org_id, x) 自此成為唯一的唯一性來源：
-- 跨租戶可重複、org 內唯一（PRD 風險 #4 的真正解法）。
-- 保留不動：agent_tokens(token_hash)（全域 secret）、
-- photo_faces / task_assignees（鍵首欄已是 org 所屬 FK）、全域表。
-- 注意：supabase/newsletter_subscribers.sql（as-built 歷史檔）的種子
-- ON CONFLICT (key) 於本 migration 後不可重放——新環境請以 migrations
-- 目錄為準。user_assistants 的 insert-catch-23505 模式不受影響
--（複合唯一違反同樣拋 23505）。
-- 冪等：IF EXISTS。
-- ============================================================

alter table public.bot_sessions            drop constraint if exists bot_sessions_telegram_id_key;
alter table public.newsletter_blacklist    drop constraint if exists newsletter_blacklist_email_key;
alter table public.newsletter_lists        drop constraint if exists newsletter_lists_key_key;
alter table public.newsletter_subscribers  drop constraint if exists newsletter_subscribers_email_key;
alter table public.newsletter_unsubscribes drop constraint if exists newsletter_unsubscribes_email_key;
alter table public.prompts                 drop constraint if exists prompts_key_key;
alter table public.tags                    drop constraint if exists tags_name_key;
alter table public.user_assistants         drop constraint if exists user_assistants_manager_email_assistant_email_key;
alter table public.user_prompts            drop constraint if exists user_prompts_user_id_key_key;
