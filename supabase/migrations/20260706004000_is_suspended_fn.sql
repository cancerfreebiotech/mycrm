-- ============================================================
-- is_suspended() — 停權即時生效（v7.9.5）
-- 執行日期：2026-07-06
--
-- proxy.ts 每個受守衛請求呼叫本 RPC：任一 membership 為 suspended 即
-- 註銷 session。security definer 繞過 users/organization_members 的
-- service-role-only RLS。語意與 auth/callback 的登入 gate 一致
--（任一 org 停權即全站封鎖——單租戶假設，多租戶時改 per-org）。
-- ============================================================

create or replace function public.is_suspended()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.users u
    join public.organization_members m on m.user_id = u.id
    where u.email = (auth.jwt() ->> 'email')
      and m.status = 'suspended'
  )
$$;

grant execute on function public.is_suspended() to authenticated;
revoke execute on function public.is_suspended() from anon, public;
