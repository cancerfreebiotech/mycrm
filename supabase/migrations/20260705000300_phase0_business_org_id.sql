-- ============================================================
-- 業務表加 org_id — v8.0 Phase 0（Task 173）
-- 執行日期：2026-07-05
--
-- 43 張業務表加 nullable org_id：uuid、FK → organizations、
-- DEFAULT = default org（CancerFree）。
--
-- 與 PRD 45.3 鐵律的差異（有意為之）：
--   PRD 順序是「nullable 無 DEFAULT → 部署寫 org_id 的程式碼 → backfill
--   → NOT NULL + DEFAULT」。這裡直接在 ADD COLUMN 帶 DEFAULT：
--   - PG11+ 的 ADD COLUMN ... DEFAULT <常數> 是 metadata-only，既有列
--     即刻視為已 backfill，無需另跑 UPDATE、無長鎖。
--   - 舊程式碼（不帶 org_id 的 insert）由 DEFAULT 補值 → 不會累積 NULL，
--     也不會擋任何線上寫入（鐵律要防的是「先 NOT NULL」，這裡仍 nullable）。
--   - 單租戶期間 DEFAULT = default org 語意正確。⚠️ Phase 3 對外開放
--     onboarding 前必須 DROP DEFAULT（屆時 org_id 由 orgScopedClient 顯式
--     注入），否則漏帶 org_id 的寫入會靜默落入 CancerFree org。
--   NOT NULL 仍留待 Phase 2（Task 180）。
--
-- 複合索引（leftmost org_id）刻意不在此建：單一 org 期間所有列同值，
-- 索引無用且拖慢寫入；待 Phase 1 route 實際以 .eq('org_id') 查詢時，
-- 連同熱路徑索引一併重排（Task 177 附帶）。Task 174 的複合 UNIQUE
-- （見 20260705000400）本身即提供 org_id leftmost 的唯一索引。
--
-- 排除（維持全域，PRD 45.2）：countries、ai_endpoints、ai_models、
-- gemini_models、medical_departments、docs_content、system_settings、
-- users（身分本體）；另 gmail_oauth（per-user 憑證，隨 users 全域）、
-- bot_errors / cron_runs（系統 dead-letter / 心跳）、usage_counters
-- （v7.8.0 全域預算計數器；計費已自 roadmap 移除，不改造為 per-org）。
--
-- 冪等：IF NOT EXISTS，可安全重跑。
-- ============================================================

-- PRD 45.2 原列業務表（22）
alter table public.contacts             add column if not exists org_id uuid default '00000000-0000-0000-0000-000000000001' references public.organizations(id);
alter table public.contact_cards        add column if not exists org_id uuid default '00000000-0000-0000-0000-000000000001' references public.organizations(id);
alter table public.contact_photos       add column if not exists org_id uuid default '00000000-0000-0000-0000-000000000001' references public.organizations(id);
alter table public.contact_tags         add column if not exists org_id uuid default '00000000-0000-0000-0000-000000000001' references public.organizations(id);
alter table public.tags                 add column if not exists org_id uuid default '00000000-0000-0000-0000-000000000001' references public.organizations(id);
alter table public.tasks                add column if not exists org_id uuid default '00000000-0000-0000-0000-000000000001' references public.organizations(id);
alter table public.task_assignees       add column if not exists org_id uuid default '00000000-0000-0000-0000-000000000001' references public.organizations(id);
alter table public.interaction_logs     add column if not exists org_id uuid default '00000000-0000-0000-0000-000000000001' references public.organizations(id);
alter table public.email_templates      add column if not exists org_id uuid default '00000000-0000-0000-0000-000000000001' references public.organizations(id);
alter table public.template_attachments add column if not exists org_id uuid default '00000000-0000-0000-0000-000000000001' references public.organizations(id);
alter table public.prompts              add column if not exists org_id uuid default '00000000-0000-0000-0000-000000000001' references public.organizations(id);
alter table public.user_prompts         add column if not exists org_id uuid default '00000000-0000-0000-0000-000000000001' references public.organizations(id);
alter table public.pending_contacts     add column if not exists org_id uuid default '00000000-0000-0000-0000-000000000001' references public.organizations(id);
alter table public.camcard_pending      add column if not exists org_id uuid default '00000000-0000-0000-0000-000000000001' references public.organizations(id);
alter table public.duplicate_pairs      add column if not exists org_id uuid default '00000000-0000-0000-0000-000000000001' references public.organizations(id);
alter table public.failed_scans         add column if not exists org_id uuid default '00000000-0000-0000-0000-000000000001' references public.organizations(id);
alter table public.feedback             add column if not exists org_id uuid default '00000000-0000-0000-0000-000000000001' references public.organizations(id);
alter table public.agent_tokens         add column if not exists org_id uuid default '00000000-0000-0000-0000-000000000001' references public.organizations(id);
alter table public.agent_actions        add column if not exists org_id uuid default '00000000-0000-0000-0000-000000000001' references public.organizations(id);
alter table public.report_schedules     add column if not exists org_id uuid default '00000000-0000-0000-0000-000000000001' references public.organizations(id);
alter table public.bot_sessions         add column if not exists org_id uuid default '00000000-0000-0000-0000-000000000001' references public.organizations(id);
alter table public.telegram_dedup       add column if not exists org_id uuid default '00000000-0000-0000-0000-000000000001' references public.organizations(id);

-- newsletter_* 家族（12）
alter table public.newsletter_blacklist        add column if not exists org_id uuid default '00000000-0000-0000-0000-000000000001' references public.organizations(id);
alter table public.newsletter_campaigns        add column if not exists org_id uuid default '00000000-0000-0000-0000-000000000001' references public.organizations(id);
alter table public.newsletter_compose_cache    add column if not exists org_id uuid default '00000000-0000-0000-0000-000000000001' references public.organizations(id);
alter table public.newsletter_drafts           add column if not exists org_id uuid default '00000000-0000-0000-0000-000000000001' references public.organizations(id);
alter table public.newsletter_events           add column if not exists org_id uuid default '00000000-0000-0000-0000-000000000001' references public.organizations(id);
alter table public.newsletter_lists            add column if not exists org_id uuid default '00000000-0000-0000-0000-000000000001' references public.organizations(id);
alter table public.newsletter_period_meta      add column if not exists org_id uuid default '00000000-0000-0000-0000-000000000001' references public.organizations(id);
alter table public.newsletter_recipients       add column if not exists org_id uuid default '00000000-0000-0000-0000-000000000001' references public.organizations(id);
alter table public.newsletter_subscriber_lists add column if not exists org_id uuid default '00000000-0000-0000-0000-000000000001' references public.organizations(id);
alter table public.newsletter_subscribers      add column if not exists org_id uuid default '00000000-0000-0000-0000-000000000001' references public.organizations(id);
alter table public.newsletter_tone_samples     add column if not exists org_id uuid default '00000000-0000-0000-0000-000000000001' references public.organizations(id);
alter table public.newsletter_unsubscribes     add column if not exists org_id uuid default '00000000-0000-0000-0000-000000000001' references public.organizations(id);

-- PRD 撰寫後新增的業務表（9）
alter table public.contact_briefings add column if not exists org_id uuid default '00000000-0000-0000-0000-000000000001' references public.organizations(id);
alter table public.meeting_drafts    add column if not exists org_id uuid default '00000000-0000-0000-0000-000000000001' references public.organizations(id);
alter table public.face_embeddings   add column if not exists org_id uuid default '00000000-0000-0000-0000-000000000001' references public.organizations(id);
alter table public.photo_faces       add column if not exists org_id uuid default '00000000-0000-0000-0000-000000000001' references public.organizations(id);
alter table public.saved_views       add column if not exists org_id uuid default '00000000-0000-0000-0000-000000000001' references public.organizations(id);
alter table public.user_assistants   add column if not exists org_id uuid default '00000000-0000-0000-0000-000000000001' references public.organizations(id);
alter table public.email_campaigns   add column if not exists org_id uuid default '00000000-0000-0000-0000-000000000001' references public.organizations(id);
alter table public.email_events      add column if not exists org_id uuid default '00000000-0000-0000-0000-000000000001' references public.organizations(id);
alter table public.admin_actions     add column if not exists org_id uuid default '00000000-0000-0000-0000-000000000001' references public.organizations(id);
