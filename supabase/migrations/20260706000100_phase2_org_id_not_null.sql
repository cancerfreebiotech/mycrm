-- ============================================================
-- 業務表 org_id SET NOT NULL — v8.0 Phase 2（Task 180）
-- 執行日期：2026-07-06
--
-- 前置條件（皆已滿足）：Phase 0 以 ADD COLUMN DEFAULT 即刻 backfill、
-- Phase 1 全部寫入路徑經 orgScopedClient 或 DB DEFAULT 補值 → 全表無 NULL。
-- DEFAULT 已於 Phase 0 設定（Task 180 的另一半）；⚠️ Phase 3 開放
-- onboarding 前必須 DROP DEFAULT。
-- 冪等：SET NOT NULL 對已 NOT NULL 欄位為 no-op。
-- ============================================================

alter table public.contacts             alter column org_id set not null;
alter table public.contact_cards        alter column org_id set not null;
alter table public.contact_photos       alter column org_id set not null;
alter table public.contact_tags         alter column org_id set not null;
alter table public.tags                 alter column org_id set not null;
alter table public.tasks                alter column org_id set not null;
alter table public.task_assignees       alter column org_id set not null;
alter table public.interaction_logs     alter column org_id set not null;
alter table public.email_templates      alter column org_id set not null;
alter table public.template_attachments alter column org_id set not null;
alter table public.prompts              alter column org_id set not null;
alter table public.user_prompts         alter column org_id set not null;
alter table public.pending_contacts     alter column org_id set not null;
alter table public.camcard_pending      alter column org_id set not null;
alter table public.duplicate_pairs      alter column org_id set not null;
alter table public.failed_scans         alter column org_id set not null;
alter table public.feedback             alter column org_id set not null;
alter table public.agent_tokens         alter column org_id set not null;
alter table public.agent_actions        alter column org_id set not null;
alter table public.report_schedules     alter column org_id set not null;
alter table public.bot_sessions         alter column org_id set not null;
alter table public.telegram_dedup       alter column org_id set not null;
alter table public.newsletter_blacklist        alter column org_id set not null;
alter table public.newsletter_campaigns        alter column org_id set not null;
alter table public.newsletter_compose_cache    alter column org_id set not null;
alter table public.newsletter_drafts           alter column org_id set not null;
alter table public.newsletter_events           alter column org_id set not null;
alter table public.newsletter_lists            alter column org_id set not null;
alter table public.newsletter_period_meta      alter column org_id set not null;
alter table public.newsletter_recipients       alter column org_id set not null;
alter table public.newsletter_subscriber_lists alter column org_id set not null;
alter table public.newsletter_subscribers      alter column org_id set not null;
alter table public.newsletter_tone_samples     alter column org_id set not null;
alter table public.newsletter_unsubscribes     alter column org_id set not null;
alter table public.contact_briefings alter column org_id set not null;
alter table public.meeting_drafts    alter column org_id set not null;
alter table public.face_embeddings   alter column org_id set not null;
alter table public.photo_faces       alter column org_id set not null;
alter table public.saved_views       alter column org_id set not null;
alter table public.user_assistants   alter column org_id set not null;
alter table public.email_campaigns   alter column org_id set not null;
alter table public.email_events      alter column org_id set not null;
alter table public.admin_actions     alter column org_id set not null;
