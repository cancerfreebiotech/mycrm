-- ============================================================
-- feedback 使用者確認流程（v7.9.8）
-- 執行日期：2026-07-07
--
-- 規則（Po 2026-07-07）：所有 issue 都要由「回報者本人」按完成。
--   * 管理端只能設 open / in_progress / resolved / wont_fix
--     （/api/feedback-status 同步擋 done）。
--   * resolved（已處理，待確認）後由回報者在 /feedback 按「確認完成」→ done。
-- ============================================================

alter table public.feedback drop constraint feedback_status_check;
alter table public.feedback add constraint feedback_status_check
  check (status = any (array['open'::text, 'in_progress'::text, 'resolved'::text, 'done'::text, 'wont_fix'::text]));

-- 回報者本人：僅允許把自己的 resolved 列改為 done（其他更新仍僅 super admin）
create policy feedback_confirm_own on public.feedback
  for update
  using (
    status = 'resolved'
    and org_id = public.current_org_id()
    and created_by = (
      select u.id from public.users u
      where u.email = ((select auth.jwt()) ->> 'email')
    )
  )
  with check (
    status = 'done'
    and org_id = public.current_org_id()
    and created_by = (
      select u.id from public.users u
      where u.email = ((select auth.jwt()) ->> 'email')
    )
  );
