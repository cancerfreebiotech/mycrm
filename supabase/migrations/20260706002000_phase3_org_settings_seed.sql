-- ============================================================
-- organizations.settings 種子 — v8.0 Phase 3（Task 185 前置）
-- 執行日期：2026-07-06
--
-- orgSettings.ts v2 解析順序改為 organizations.settings → system_settings →
-- env/預設。本 migration 把 default org 目前在 system_settings 的 org 類
-- 設定值複製進 organizations.settings（jsonb），讓 per-org 讀取即刻有值；
-- system_settings 舊列保留（fallback 鏈，不刪）。
-- 冪等：以 system_settings 現值覆蓋同名 key（admin 尚未用新面板編輯過，
-- system_settings 即最新真相）。
-- ============================================================

update public.organizations o
set settings = coalesce(o.settings, '{}'::jsonb) || coalesce((
  select jsonb_object_agg(s.key, to_jsonb(s.value))
  from public.system_settings s
  where s.key in (
    'org_name','allowed_email_domains','newsletter_logo_url','newsletter_reply_to',
    'company_website','company_facebook','company_linkedin','feedback_recipient',
    'sender_name','internal_email_domain','org_email_domain','bcc_inbox_domain',
    'postal_address','owner_email','app_url','hunter_enabled','ai_assistant_enabled'
  )
    and s.value is not null
    and btrim(s.value::text, '" ') <> ''
), '{}'::jsonb)
where o.id = '00000000-0000-0000-0000-000000000001';
