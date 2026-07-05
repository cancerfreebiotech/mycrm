-- ============================================================
-- organizations / organization_members — v8.0 Phase 0 baseline
-- 原始執行：2026-07-04（execute_sql，prod-only）
-- 收錄進 migration 歷史：2026-07-05（apply_migration 冪等重放，對 prod 為 no-op）
--
-- 注意：MCP apply_migration 的 runner 寫入歷史表時依賴
-- supabase_migrations.schema_migrations(idempotency_key) 唯一索引；本專案的
-- 歷史表是舊格式、缺此索引，會以誤導性的 42P10（ON CONFLICT 無對應約束）
-- 失敗——已於 2026-07-05 手動補上該索引。種子語句用 WHERE NOT EXISTS，
-- 與 ON CONFLICT 等效冪等。
-- 身分慣例：organization_members.user_id 參照 public.users(id)（非 auth.users）。
-- ============================================================

create table if not exists public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  plan_tier   text not null default 'internal',
  status      text not null default 'active',
  settings    jsonb default '{}',
  branding    jsonb default '{}',
  created_at  timestamptz default now()
);

create table if not exists public.organization_members (
  org_id     uuid not null references public.organizations(id) on delete cascade,
  user_id    uuid not null references public.users(id) on delete cascade,
  role       text default 'member',
  status     text default 'active',
  created_at timestamptz default now(),
  primary key (org_id, user_id)
);

alter table public.organizations        enable row level security;
alter table public.organization_members enable row level security;

insert into public.organizations (id, name, slug, plan_tier, status)
select '00000000-0000-0000-0000-000000000001', 'cancerfree', 'cancerfree', 'internal', 'active'
where not exists (
  select 1 from public.organizations where id = '00000000-0000-0000-0000-000000000001'
);

insert into public.organization_members (org_id, user_id, role, status)
select
  '00000000-0000-0000-0000-000000000001',
  u.id,
  case when u.role = 'super_admin' then 'owner' else 'member' end,
  'active'
from public.users u
where not exists (
  select 1 from public.organization_members m
  where m.org_id = '00000000-0000-0000-0000-000000000001' and m.user_id = u.id
);
