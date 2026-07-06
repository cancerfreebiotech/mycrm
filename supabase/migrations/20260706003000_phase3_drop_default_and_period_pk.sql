-- ============================================================
-- DROP org_id DEFAULT + period_meta PK 交換 — v8.0 Phase 3
-- 執行日期：2026-07-06（⚠️ 必須在 v7.9.4 程式碼部署完成「之後」套用：
--   - client 端 24 個 insert/upsert 自 v7.9.4 起明確帶 org_id——DEFAULT 移除
--     後舊程式碼的 client 寫入會 NOT NULL 失敗。
--   - period-meta route 的 onConflict 自 v7.9.4 起為 'org_id,period'。）
--
-- 1. 43 張業務表 DROP org_id DEFAULT：開放 onboarding 前的關鍵防呆——
--    此後漏帶 org_id 的寫入會「顯式失敗」，而不是靜默落入 CancerFree org。
--    （server 端由 orgScopedClient 注入、client 端由頁面顯式帶值。）
-- 2. newsletter_period_meta PK (period) → (org_id, period)。
-- ============================================================

alter table public.contacts             alter column org_id drop default;
alter table public.contact_cards        alter column org_id drop default;
alter table public.contact_photos       alter column org_id drop default;
alter table public.contact_tags         alter column org_id drop default;
alter table public.tags                 alter column org_id drop default;
alter table public.tasks                alter column org_id drop default;
alter table public.task_assignees       alter column org_id drop default;
alter table public.interaction_logs     alter column org_id drop default;
alter table public.email_templates      alter column org_id drop default;
alter table public.template_attachments alter column org_id drop default;
alter table public.prompts              alter column org_id drop default;
alter table public.user_prompts         alter column org_id drop default;
alter table public.pending_contacts     alter column org_id drop default;
alter table public.camcard_pending      alter column org_id drop default;
alter table public.duplicate_pairs      alter column org_id drop default;
alter table public.failed_scans         alter column org_id drop default;
alter table public.feedback             alter column org_id drop default;
alter table public.agent_tokens         alter column org_id drop default;
alter table public.agent_actions        alter column org_id drop default;
alter table public.report_schedules     alter column org_id drop default;
alter table public.bot_sessions         alter column org_id drop default;
alter table public.telegram_dedup       alter column org_id drop default;
alter table public.newsletter_blacklist        alter column org_id drop default;
alter table public.newsletter_campaigns        alter column org_id drop default;
alter table public.newsletter_compose_cache    alter column org_id drop default;
alter table public.newsletter_drafts           alter column org_id drop default;
alter table public.newsletter_events           alter column org_id drop default;
alter table public.newsletter_lists            alter column org_id drop default;
alter table public.newsletter_period_meta      alter column org_id drop default;
alter table public.newsletter_recipients       alter column org_id drop default;
alter table public.newsletter_subscriber_lists alter column org_id drop default;
alter table public.newsletter_subscribers      alter column org_id drop default;
alter table public.newsletter_tone_samples     alter column org_id drop default;
alter table public.newsletter_unsubscribes     alter column org_id drop default;
alter table public.contact_briefings alter column org_id drop default;
alter table public.meeting_drafts    alter column org_id drop default;
alter table public.face_embeddings   alter column org_id drop default;
alter table public.photo_faces       alter column org_id drop default;
alter table public.saved_views       alter column org_id drop default;
alter table public.user_assistants   alter column org_id drop default;
alter table public.email_campaigns   alter column org_id drop default;
alter table public.email_events      alter column org_id drop default;
alter table public.admin_actions     alter column org_id drop default;

-- period_meta：PK (period) → (org_id, period)（沿用既有唯一索引）
alter table public.newsletter_period_meta
  drop constraint if exists newsletter_period_meta_pkey;
alter table public.newsletter_period_meta
  add constraint newsletter_period_meta_pkey primary key using index uq_newsletter_period_meta_org_period;
