-- ============================================================
-- has_feature() 切換至 organization_members — v8.0 Phase 3
-- 執行日期：2026-07-06
--
-- 1. 最終 re-sync：users.granted_features →（default org 的）
--    organization_members.granted_features。此後 members 為 RLS 層真相來源。
-- 2. has_feature() 改讀 current_org_id() 對應 membership 的 granted_features
--   （per-org 授權；super_admin 仍平台級一律 true）。
--
-- TS/API 層此階段仍讀 users.granted_features；管理端（admin/users access
-- route）自 v7.9.4 起「雙寫」users + organization_members，兩來源恆一致。
-- TS 層切換與 per-org 授權 UI 隨 Phase 3 後續批次處理。
-- ============================================================

update public.organization_members m
set granted_features = coalesce(u.granted_features, '{}')
from public.users u
where u.id = m.user_id
  and m.org_id = '00000000-0000-0000-0000-000000000001'
  and m.granted_features is distinct from coalesce(u.granted_features, '{}');

-- super_admin 為平台級身分：不依賴 membership（COALESCE 惰性求值短路）。
create or replace function public.has_feature(feature_key text)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(
    (select true
     from public.users u
     where u.email = (auth.jwt() ->> 'email') and u.role = 'super_admin'),
    (select m.granted_features @> array[feature_key]
     from public.users u
     join public.organization_members m
       on m.user_id = u.id
      and m.status = 'active'
      and m.org_id = public.current_org_id()
     where u.email = (auth.jwt() ->> 'email')),
    false
  )
$$;
