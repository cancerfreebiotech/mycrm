-- ============================================================
-- newsletter_overview_list_stats() — 名單健康度 SQL 聚合（v8.0）
-- 執行日期：2026-07-06
--
-- 取代 /api/newsletter/overview 原本「1000 列分頁把 180 天 openers 的 email
-- 與全部 list memberships 載入記憶體」的作法（訂閱數上萬後逼近 maxDuration）。
-- 一句聚合 SQL 算出每名單的成員數與「180 天未開信」數。
--
-- 語意與原 TS 逐條等價：
--   * openers：本 org 於 p_opened_since 之後 opened_at 有值的 recipient email，
--     以 lower(trim(email)) 正規化去重（原 norm() = email.toLowerCase().trim()）。
--   * 成員來源：newsletter_subscriber_lists（org 過濾），左接 newsletter_subscribers
--     取 email（原 PostgREST embed 為 left join、不對 subscriber 再套 org 過濾）。
--   * member_count：該名單全部 membership 列數（原 TS 亦未排除 unsubscribed）。
--   * non_opener_count：email 為 NULL，或 lower(trim(email)) 不在 openers 內的列數
--     （原 TS：`!email || !openerEmails.has(norm(email))`）。
--   * 僅回傳「有 membership」的名單；沒有成員的名單由 route 端補 0/0（同原行為）。
--
-- security definer：newsletter_recipients 無 SELECT policy，本函式僅回傳彙總
-- 計數（無 PII）。org 隔離以 p_org_id 參數負責，route 傳入 ctx.orgId。
-- 僅授權 service_role（route 以 service client 呼叫）。
-- ============================================================

create or replace function public.newsletter_overview_list_stats(
  p_org_id uuid,
  p_opened_since timestamptz
)
returns table(list_id uuid, member_count bigint, non_opener_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with openers as (
    select distinct lower(trim(r.email)) as e
    from public.newsletter_recipients r
    where r.org_id = p_org_id
      and r.opened_at >= p_opened_since
  ),
  members as (
    select
      sl.list_id as list_id,
      (
        s.email is null
        or not exists (
          select 1 from openers o
          where o.e = lower(trim(s.email::text))
        )
      ) as is_non_opener
    from public.newsletter_subscriber_lists sl
    left join public.newsletter_subscribers s on s.id = sl.subscriber_id
    where sl.org_id = p_org_id
  )
  select
    m.list_id,
    count(*)::bigint as member_count,
    count(*) filter (where m.is_non_opener)::bigint as non_opener_count
  from members m
  group by m.list_id
$$;

revoke all on function public.newsletter_overview_list_stats(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.newsletter_overview_list_stats(uuid, timestamptz) to service_role;
comment on function public.newsletter_overview_list_stats(uuid, timestamptz) is
'Per-list member count + 180-day non-opener count for the newsletter overview. Aggregate counts only; org-scoped by p_org_id. service_role only.';
