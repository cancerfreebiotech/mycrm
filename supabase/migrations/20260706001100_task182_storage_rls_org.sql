-- ============================================================
-- Storage RLS org 隔離 — v8.0 Task 182
-- 執行日期：2026-07-06
--
-- 1. 移除既存安全洞：「Public read cards」policy 對所有角色（含 anon）開放
--    cards bucket 讀取——bucket 雖 private，持 anon key 者仍可經 storage API
--    下載全部名片圖。移除後 authenticated 的 select policy 照常支撐
--    client 端 createSignedUrl。
-- 2. storage_org_ok(name)：物件 key 第一段是 uuid → 驗 is_org_member()；
--    否則（舊物件的 cards/、photos/、camcard/、{period}/… 路徑）grandfather
--    給 authenticated。新上傳自 v7.9.3 起帶 {org_id}/ 前綴。
-- 3. 各 bucket 的 authenticated policy 以 AND 疊加 storage_org_ok；
--    template-attachments 補 select policy（轉 private 後 client 簽名需要）。
--    feedback bucket 維持既有 per-user（{uid}/ 前綴）模式不動。
-- ============================================================

create or replace function public.storage_org_ok(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when (storage.foldername(object_name))[1]
         ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      then public.is_org_member(((storage.foldername(object_name))[1])::uuid)
    else true
  end
$$;

drop policy if exists "Public read cards" on storage.objects;

alter policy cards_authenticated_select on storage.objects
  using (bucket_id = 'cards' and public.storage_org_ok(name));
alter policy cards_authenticated_insert on storage.objects
  with check (bucket_id = 'cards' and public.storage_org_ok(name));
alter policy cards_authenticated_update on storage.objects
  using (bucket_id = 'cards' and public.storage_org_ok(name))
  with check (bucket_id = 'cards' and public.storage_org_ok(name));
alter policy cards_authenticated_delete on storage.objects
  using (bucket_id = 'cards' and public.storage_org_ok(name));

alter policy camcard_authenticated_insert on storage.objects
  with check (bucket_id = 'camcard' and public.storage_org_ok(name));
alter policy camcard_authenticated_update on storage.objects
  using (bucket_id = 'camcard' and public.storage_org_ok(name))
  with check (bucket_id = 'camcard' and public.storage_org_ok(name));
alter policy camcard_authenticated_delete on storage.objects
  using (bucket_id = 'camcard' and public.storage_org_ok(name));

alter policy newsletter_assets_authenticated_insert on storage.objects
  with check (bucket_id = 'newsletter-assets' and public.storage_org_ok(name));
alter policy newsletter_assets_authenticated_update on storage.objects
  using (bucket_id = 'newsletter-assets' and public.storage_org_ok(name))
  with check (bucket_id = 'newsletter-assets' and public.storage_org_ok(name));
alter policy newsletter_assets_authenticated_delete on storage.objects
  using (bucket_id = 'newsletter-assets' and public.storage_org_ok(name));

alter policy template_attachments_authenticated_insert on storage.objects
  with check (bucket_id = 'template-attachments' and public.storage_org_ok(name));
alter policy template_attachments_authenticated_update on storage.objects
  using (bucket_id = 'template-attachments' and public.storage_org_ok(name))
  with check (bucket_id = 'template-attachments' and public.storage_org_ok(name));
alter policy template_attachments_authenticated_delete on storage.objects
  using (bucket_id = 'template-attachments' and public.storage_org_ok(name));

create policy template_attachments_authenticated_select on storage.objects
  for select to authenticated
  using (bucket_id = 'template-attachments' and public.storage_org_ok(name));
