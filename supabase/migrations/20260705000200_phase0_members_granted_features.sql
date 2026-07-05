-- ============================================================
-- organization_members.granted_features — v8.0 Phase 0 收尾（Task 172 補完）
-- 執行日期：2026-07-05
--
-- PRD 45.2：granted_features 從 users 搬到 organization_members（per-org 授權）。
-- Phase 0 只「加欄 + 複製一份」：users.granted_features 仍是唯一真相來源
-- （has_feature() 與所有讀取點不動），本欄是 Phase 2（Task 181）切換讀取
-- 來源前的鷹架。切換當下需重新同步一次，因為這份複製會隨 users 端的
-- 後續變更而過期。
--
-- 冪等：IF NOT EXISTS；複製僅在目標仍為空陣列時進行，不覆蓋日後的
-- per-org 編輯。
-- ============================================================

alter table public.organization_members
  add column if not exists granted_features text[] not null default '{}';

update public.organization_members m
set granted_features = u.granted_features
from public.users u
where u.id = m.user_id
  and m.org_id = '00000000-0000-0000-0000-000000000001'
  and coalesce(u.granted_features, '{}') <> '{}'
  and m.granted_features = '{}';
