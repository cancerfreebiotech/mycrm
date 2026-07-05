-- ============================================================
-- custom_access_token_hook — v8.0 Phase 1（Task 176 前半）
-- 執行日期：2026-07-05
--
-- JWT 注入 org_id claim（app_metadata.org_id），供 Phase 2 RLS 的
-- current_org_id() 零查詢讀取。
--
-- ⚠️ 本 migration 只「建函式」；hook 的啟用需在 Supabase Dashboard
-- （Authentication → Hooks → Customize Access Token）手動開啟——
-- Phase 1 的 API 層隔離不依賴此 claim（getOrgContext 直接查 DB），
-- 開關留待 Phase 2 接 RLS 前開啟並驗證。
--
-- security definer：以擁有者權限執行，繞過 users / organization_members
-- 的 RLS（兩表 RLS enabled、無 policy = service-role only，
-- supabase_auth_admin 以 invoker 權限會被擋）。
-- 身分慣例：auth.users.id ≠ public.users.id，一律以 email 解析。
-- ============================================================

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  claims jsonb;
  user_email text;
  resolved_org uuid;
begin
  claims := coalesce(event->'claims', '{}'::jsonb);
  user_email := claims->>'email';

  if user_email is not null then
    select m.org_id into resolved_org
    from public.users u
    join public.organization_members m
      on m.user_id = u.id and m.status = 'active'
    where u.email = user_email
    order by m.created_at
    limit 1;
  end if;

  if resolved_org is not null then
    claims := jsonb_set(
      claims,
      '{app_metadata}',
      coalesce(claims->'app_metadata', '{}'::jsonb)
        || jsonb_build_object('org_id', resolved_org),
      true
    );
    event := jsonb_set(event, '{claims}', claims);
  end if;

  return event;
end;
$$;

grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;
