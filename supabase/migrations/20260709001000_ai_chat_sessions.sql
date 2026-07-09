-- ============================================================
-- ai_chat_sessions：Web AI 助理對話持久化（v8.1.2）
-- 執行日期：2026-07-09
--
-- 每位使用者一列（org, user），messages 為完整對話 jsonb 陣列
-- （[{role:'user'|'model', content:text}, ...]，寫入端裁切保留最後 40 則）。
-- 只由 /api/ai-chat route（service role）讀寫：RLS 啟用且不建 policy＝
-- anon/authenticated 一律拒絕，瀏覽器不可直接碰此表。
-- ============================================================

create table if not exists public.ai_chat_sessions (
  org_id     uuid not null references public.organizations(id),
  user_id    uuid not null references public.users(id) on delete cascade,
  messages   jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

alter table public.ai_chat_sessions enable row level security;

grant all on public.ai_chat_sessions to service_role;
