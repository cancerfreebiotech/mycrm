-- ============================================================
-- organization_invites — v8.0 Phase 0 收尾（Task 171 補完）
-- 執行日期：2026-07-05
--
-- PRD 45.2 規格：email 受邀但尚未有帳號時的邀請單。實際的邀請流程
-- （一次性連結、登入分流）是 Phase 3（Task 184）；本表先落地讓
-- Phase 0 的資料層完整。
--
-- RLS：僅啟用、無 policy（service-role only），與 organizations /
-- organization_members 相同模式；policy 於 Phase 2 RLS 重寫時再補。
--
-- 冪等：IF NOT EXISTS，可安全重跑。
-- ============================================================

create table if not exists public.organization_invites (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  email       text not null,
  role        text not null default 'member',
  token       text not null unique,
  expires_at  timestamptz not null,
  accepted_at timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists idx_org_invites_org   on public.organization_invites(org_id);
create index if not exists idx_org_invites_email on public.organization_invites(lower(email));

alter table public.organization_invites enable row level security;
