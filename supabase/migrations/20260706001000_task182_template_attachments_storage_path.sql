-- ============================================================
-- template_attachments.storage_path — v8.0 Task 182
-- 執行日期：2026-07-06
--
-- template-attachments bucket 將轉 private：此表原本只存完整 public URL
--（file_url），補 storage_path 欄（相對 path）供簽名下載；舊列由 file_url
-- 正則回填。程式碼自此雙寫（file_url 照舊 + storage_path）。
-- ============================================================

alter table public.template_attachments
  add column if not exists storage_path text;

update public.template_attachments
set storage_path = substring(file_url from '/storage/v1/object/public/template-attachments/(.+)$')
where storage_path is null
  and file_url like '%/storage/v1/object/public/template-attachments/%';
