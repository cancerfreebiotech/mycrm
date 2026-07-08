-- ============================================================
-- ai_feature_models：AI 功能 → 模型指派表（v8.0.0）
-- 執行日期：2026-07-08
--
-- 每個 (org, feature) 至多指派一個 ai_models 列；未指派＝走程式內建預設
-- （env / 現行寫死值，行為與指派系統上線前 100% 等價）。
-- feature 合法值由 src/lib/aiRouting.ts 的 AI_FEATURES 單一來源定義，
-- DB 不設 check，避免新增功能鍵時需要 migration。
-- 模型被刪除時 on delete set null → 解析鏈視同未指派，fallback 預設。
-- ============================================================

create table if not exists public.ai_feature_models (
  org_id      uuid not null references public.organizations(id),
  feature     text not null,
  ai_model_id uuid references public.ai_models(id) on delete set null,
  updated_at  timestamptz not null default now(),
  primary key (org_id, feature)
);

alter table public.ai_feature_models enable row level security;

-- org 成員唯讀（前端顯示用；寫入一律走 service role API + super_admin 檢查）
create policy ai_feature_models_select on public.ai_feature_models
  for select
  using (org_id = public.current_org_id());

-- super_admin 全權（防 DB 直改繞過 API）
create policy ai_feature_models_admin_write on public.ai_feature_models
  for all
  using (
    org_id = public.current_org_id()
    and exists (
      select 1 from public.users u
      where u.email = ((select auth.jwt()) ->> 'email')
        and u.role = 'super_admin'
    )
  )
  with check (
    org_id = public.current_org_id()
    and exists (
      select 1 from public.users u
      where u.email = ((select auth.jwt()) ->> 'email')
        and u.role = 'super_admin'
    )
  );

grant select on public.ai_feature_models to authenticated;
grant all on public.ai_feature_models to service_role;
