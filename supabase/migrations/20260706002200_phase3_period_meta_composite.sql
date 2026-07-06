-- ============================================================
-- newsletter_period_meta 複合唯一（並存）— v8.0 Phase 3
-- 執行日期：2026-07-06
--
-- period_meta 的 PK 是 (period)——多租戶下兩個 org 的同月份會撞鍵（Phase 0
-- 當時漏列）。比照並存策略：先加 (org_id, period) 唯一索引，程式碼 onConflict
-- 改複合目標部署後，再由 20260706003000 交換 PK。
-- ============================================================

create unique index if not exists uq_newsletter_period_meta_org_period
  on public.newsletter_period_meta(org_id, period);
