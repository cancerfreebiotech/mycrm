-- ============================================================
-- RLS org 隔離 — v8.0 Phase 2（Task 181）
-- 執行日期：2026-07-06
--
-- 1. current_org_id()：JWT claim（app_metadata.org_id，hook 啟用後零查詢）
--    優先，email → membership 子查詢 fallback——**hook 未啟用也正確**，
--    因此本 migration 不依賴 Dashboard 的 hook 開關（開關仍建議於驗證
--    claim 後開啟，作為效能最佳化）。
-- 2. is_org_member(uuid)：Phase 3 org switcher / 多 org 驗證用。
-- 3. 將 43 張業務表上所有 authenticated/public 的 permissive policy 以
--    AND 疊加 `org_id = current_org_id()`（qual 與 with_check 皆疊）。
--    - 原本的 has_feature()/owner 檢查全數保留（語意收緊、不放寬）。
--    - service_role-only policy 不動（service role BYPASSRLS，本就繞過）。
--    - INSERT 的 with_check 在 DB DEFAULT 補完 org_id 後評估 → client
--      anon insert 不帶 org_id 也能通過（值必等於 default org）。
--    - 冪等：qual/with_check 已含 current_org_id 者跳過。
--
-- 單租戶等價性：所有列與所有使用者的 current_org_id() 都是 default org
-- → 疊加條件恆真。
--
-- 刻意不做（記錄）：has_feature() 仍讀 users.granted_features——切換到
-- organization_members.granted_features 需同步改管理端寫入路徑並重同步
-- 複本，與多 org 授權一起留到 Phase 3。
-- ============================================================

create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    nullif((auth.jwt() -> 'app_metadata' ->> 'org_id'), '')::uuid,
    (
      select m.org_id
      from public.users u
      join public.organization_members m
        on m.user_id = u.id and m.status = 'active'
      where u.email = (auth.jwt() ->> 'email')
      order by m.created_at
      limit 1
    )
  )
$$;

create or replace function public.is_org_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.users u
    join public.organization_members m
      on m.user_id = u.id and m.status = 'active'
    where u.email = (auth.jwt() ->> 'email')
      and m.org_id = target_org
  )
$$;

do $$
declare
  org_tables constant text[] := array[
    'contacts','contact_cards','contact_photos','contact_tags','tags','tasks',
    'task_assignees','interaction_logs','email_templates','template_attachments',
    'prompts','user_prompts','pending_contacts','camcard_pending','duplicate_pairs',
    'failed_scans','feedback','agent_tokens','agent_actions','report_schedules',
    'bot_sessions','telegram_dedup',
    'newsletter_blacklist','newsletter_campaigns','newsletter_compose_cache',
    'newsletter_drafts','newsletter_events','newsletter_lists','newsletter_period_meta',
    'newsletter_recipients','newsletter_subscriber_lists','newsletter_subscribers',
    'newsletter_tone_samples','newsletter_unsubscribes',
    'contact_briefings','meeting_drafts','face_embeddings','photo_faces',
    'saved_views','user_assistants','email_campaigns','email_events','admin_actions'
  ];
  p record;
  stmt text;
begin
  for p in
    select pol.tablename, pol.policyname, pol.qual, pol.with_check, pol.roles::text as roles_txt
    from pg_policies pol
    where pol.schemaname = 'public'
      and pol.tablename = any (org_tables)
      and coalesce(pol.qual, '') not like '%current_org_id%'
      and coalesce(pol.with_check, '') not like '%current_org_id%'
  loop
    if p.roles_txt = '{service_role}' then
      continue; -- BYPASSRLS 角色的 policy，保留原樣
    end if;
    stmt := format('alter policy %I on public.%I', p.policyname, p.tablename);
    if p.qual is not null then
      stmt := stmt || format(' using ((%s) and org_id = public.current_org_id())', p.qual);
    end if;
    if p.with_check is not null then
      stmt := stmt || format(' with check ((%s) and org_id = public.current_org_id())', p.with_check);
    end if;
    if p.qual is not null or p.with_check is not null then
      execute stmt;
    end if;
  end loop;
end $$;
