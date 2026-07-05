-- ============================================================
-- tasks ↔ task_assignees policy 遞迴修復 — v8.0 Phase 2 附帶
-- 執行日期：2026-07-06
--
-- 既存潛在問題（早於 v8.0）：tasks_access 與 task_assignees_access 互相
-- EXISTS 對方的表，任何 anon/authenticated 查詢實際觸發 policy 時都會
-- 42P17 無限遞迴——過去 tasks 全走 service-role API 才未曝光，Phase 2
-- 的 RLS 模擬測試炸出。以 security definer 函式封裝對方表的查詢
--（以擁有者權限讀、繞過其 policy）斷開循環；語意與原 policy 1:1 等價，
-- org 檢查（Phase 2）照疊。
-- ============================================================

create or replace function public.can_view_task(p_task_id uuid, p_created_by text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select (p_created_by = auth.email())
      or exists (
        select 1 from public.task_assignees ta
        where ta.task_id = p_task_id and ta.assignee_email = auth.email())
      or exists (
        select 1 from public.user_assistants ua
        where ua.assistant_email = auth.email()
          and (p_created_by = ua.manager_email
               or exists (
                 select 1 from public.task_assignees ta2
                 where ta2.task_id = p_task_id and ta2.assignee_email = ua.manager_email)))
$$;

create or replace function public.can_view_task_assignee(p_task_id uuid, p_assignee_email text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select (p_assignee_email = auth.email())
      or exists (
        select 1 from public.tasks t
        where t.id = p_task_id and t.created_by = auth.email())
      or exists (
        select 1 from public.user_assistants ua
        where ua.assistant_email = auth.email()
          and (p_assignee_email = ua.manager_email
               or exists (
                 select 1 from public.tasks t2
                 where t2.id = p_task_id and t2.created_by = ua.manager_email)))
$$;

alter policy tasks_access on public.tasks
  using (public.can_view_task(id, created_by) and org_id = public.current_org_id());

alter policy task_assignees_access on public.task_assignees
  using (public.can_view_task_assignee(task_id, assignee_email) and org_id = public.current_org_id());
