-- ============================================================
-- organizations / organization_members — v8.0 Phase 0 鷹架
-- 執行日期：2026-07-04（此檔為「已於 prod 執行的 DDL」之 repo 內真相記錄）
--
-- Phase 0 性質：純基礎設施，零行為改變。
--   - 只「建表 + 建 default org + 全員入籍」，不改任何業務表、不加 org_id、
--     不改任何 RLS policy、不改任何既有 route。
--   - 新程式碼從今天起寫成 org-aware（見 src/lib/orgContext.ts），
--     但實際的 org 隔離（業務表加 org_id、orgScopedClient 注入 .eq、RLS 重寫）
--     留待 Phase 1 / Phase 2。
--   - 對應 PRD「四十五、v8.0 SaaS 多租戶化」與「四十六、v8.0 開發任務清單」
--     Phase 0（Task 171 / 172）。
--
-- 冪等：使用 IF NOT EXISTS / ON CONFLICT DO NOTHING，可安全重跑。
-- 身分慣例：organization_members.user_id 參照 public.users(id)（非 auth.users）。
-- ============================================================

-- ------------------------------------------------------------
-- 1. 租戶主表
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- 2. user ↔ org 多對多 + 角色
-- ------------------------------------------------------------
create table if not exists public.organization_members (
  org_id     uuid not null references public.organizations(id) on delete cascade,
  user_id    uuid not null references public.users(id) on delete cascade,
  role       text default 'member',
  status     text default 'active',
  created_at timestamptz default now(),
  primary key (org_id, user_id)
);

-- ------------------------------------------------------------
-- 3. RLS（Phase 0 僅啟用；policy 於 Phase 1 隔離時再補）
-- ------------------------------------------------------------
alter table public.organizations       enable row level security;
alter table public.organization_members enable row level security;

-- ------------------------------------------------------------
-- 4. Default org（CancerFree）
-- ------------------------------------------------------------
insert into public.organizations (id, name, slug, plan_tier, status)
values ('00000000-0000-0000-0000-000000000001', 'cancerfree', 'cancerfree', 'internal', 'active')
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- 5. 全員 backfill：現有 users 全部加入 default org
--    平台級 super_admin → org owner，其餘 → member
-- ------------------------------------------------------------
insert into public.organization_members (org_id, user_id, role, status)
select
  '00000000-0000-0000-0000-000000000001',
  u.id,
  case when u.role = 'super_admin' then 'owner' else 'member' end,
  'active'
from public.users u
on conflict (org_id, user_id) do nothing;
