-- feedback.created_by 修正（已套用至 live: gaxjgcztzfxokesiraai）
--
-- 問題：feedback.created_by 的 FK 原本指向 auth.users(id)，但 feedback 的 RLS
--   INSERT policy 要求 created_by = public.users.id（以 email 對應）。由於本專案
--   auth.users.id ≠ public.users.id（全站靠 email 對應 user），兩個約束互斥，
--   任何 created_by 值都無法同時滿足 → 回報表單的 insert 一律被擋下，無人能送出。
--
-- 修正：將 FK 對齊到 public.users(id)，與 RLS policy、admin 頁的 users join、
--   以及全站 created_by = public.users.id 的慣例一致。前端送出改帶 profile.id。
--   （表內 0 筆，變更無資料風險。）

ALTER TABLE public.feedback DROP CONSTRAINT IF EXISTS feedback_created_by_fkey;
ALTER TABLE public.feedback
  ADD CONSTRAINT feedback_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;
