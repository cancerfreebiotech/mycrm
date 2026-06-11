-- contact_briefings — Social Briefing（v7.2）
-- 對某聯絡人產生「這個人 + 他公司的最新動態」briefing。非同步：API 寫 pending 列，
-- cron worker 處理（複用 pending-ocr-worker 的 claim/unstick/retry 模式）。
-- 資料源：Gemini + Google Search grounding（公開、可標來源），不爬社群平台。

create table if not exists public.contact_briefings (
  id            uuid primary key default gen_random_uuid(),
  contact_id    uuid not null references public.contacts(id) on delete cascade,
  status        text not null default 'pending' check (status in ('pending','processing','done','failed')),
  trigger       text not null default 'manual' check (trigger in ('manual','nl_command','pre_meeting')),
  meeting_at    timestamptz,
  result_md     text,
  sources       jsonb not null default '[]'::jsonb,   -- [{title,url}]
  model_used    text,
  error_message text,
  retry_count   int not null default 0,
  created_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  processed_at  timestamptz
);

create index if not exists idx_contact_briefings_status  on public.contact_briefings(status, created_at);
create index if not exists idx_contact_briefings_contact on public.contact_briefings(contact_id, created_at desc);

alter table public.contact_briefings enable row level security;
-- 共享 CRM：登入者皆可讀；寫入只由 API/worker（service role）執行
create policy "contact_briefings_read" on public.contact_briefings for select to authenticated using (true);
