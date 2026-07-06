-- ============================================================
-- v7.7.2／v7.8.0 時代 prod-only schema 回填 — as-built 記錄（v7.9.5）
-- 原始執行：2026-07-04 前後（execute_sql 直打正式 DB，未進 repo）
-- 收錄進 migration 歷史：2026-07-06（冪等重放，對 prod 為 no-op）
--
-- 內容（依 prod 現況逐項內省還原）：
--   1. bot_errors — Telegram bot dead-letter（v7.8.0 維運項）
--   2. contact_briefings += notify_user_id / outcome_prompted_at（v7.8.0 推播）
--   3. newsletter_campaigns += ab_*（v7.8.0 A/B holdout 四欄）
--   4. newsletter_recipients += error（v7.8.0 失敗明細）
--   5. protect_super_admin() trigger（v7.7.2 Super Admin DB 層保護）
-- 自 v7.9.0 起 schema 改動一律進 repo migrations；本檔補齊歷史缺口，
-- 使 migrations 目錄可完整重放。
-- ============================================================

-- 1. bot_errors
create table if not exists public.bot_errors (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  chat_id       bigint,
  update_type   text,
  error_message text,
  payload       jsonb,
  resolved      boolean not null default false
);
alter table public.bot_errors enable row level security;

-- 2. contact_briefings 新欄
alter table public.contact_briefings
  add column if not exists notify_user_id uuid references public.users(id) on delete set null;
alter table public.contact_briefings
  add column if not exists outcome_prompted_at timestamptz;

-- 3. newsletter_campaigns A/B holdout 欄
alter table public.newsletter_campaigns add column if not exists ab_test_pct integer;
alter table public.newsletter_campaigns add column if not exists ab_wait_minutes integer;
alter table public.newsletter_campaigns add column if not exists ab_winner text;
alter table public.newsletter_campaigns add column if not exists ab_decided_at timestamptz;

-- 4. newsletter_recipients 失敗明細
alter table public.newsletter_recipients add column if not exists error text;

-- 5. Super Admin DB 層保護（v7.7.2）
create or replace function public.protect_super_admin()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if lower(old.email) = 'pohan.chen@cancerfree.io' then
      raise exception 'Super Admin account (%) cannot be deleted', old.email;
    end if;
    return old;
  end if;
  if lower(old.email) = 'pohan.chen@cancerfree.io'
     and new.role is distinct from 'super_admin' then
    raise exception 'Super Admin account (%) cannot be demoted', old.email;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_super_admin on public.users;
create trigger trg_protect_super_admin
  before delete or update on public.users
  for each row execute function public.protect_super_admin();
