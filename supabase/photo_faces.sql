-- photo_faces — 相簿照片「一張照片對多位聯絡人」的多對多連結（v7.1）
--
-- 取代 contact_photos.contact_id 一對一關係。單表同時承載：
--   * 手動標記（source='manual', status='confirmed'）
--   * AI 偵測的人臉框（source='ai_detected', status='suggested'）— Phase 2 才寫入
-- contact_id 可為 NULL：偵測到一張臉但尚未指認是誰。
--
-- 注意：contact_photos.contact_id 欄位「先保留」，過渡期由上傳路徑雙寫，
-- 待全部讀寫切到 photo_faces 並驗證後，才在後續 migration 移除（部署後執行）。

create table if not exists public.photo_faces (
  id           uuid primary key default gen_random_uuid(),
  photo_id     uuid not null references public.contact_photos(id) on delete cascade,
  contact_id   uuid references public.contacts(id) on delete cascade,  -- NULL = 未指認

  -- 人臉框：正規化座標 0~1（與影像解析度無關）；手動無框時為 NULL
  bbox_x real, bbox_y real, bbox_w real, bbox_h real,

  source       text not null default 'manual'
               check (source in ('manual', 'ai_detected')),
  status       text not null default 'confirmed'
               check (status in ('confirmed', 'suggested', 'rejected')),
  suggested_contact_id uuid references public.contacts(id) on delete set null,
  confidence   real,   -- AI 相似度（0~1）；手動為 NULL

  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now(),

  -- 同一張照片不可重複指向同一聯絡人。contact_id 為 NULL 時 Postgres 視 NULL 互不相等，
  -- 故多個未指認臉框可共存。
  constraint photo_faces_unique_manual unique (photo_id, contact_id)
);

create index if not exists idx_photo_faces_photo   on public.photo_faces(photo_id);
create index if not exists idx_photo_faces_contact on public.photo_faces(contact_id);
create index if not exists idx_photo_faces_status  on public.photo_faces(status);

-- 回填既有資料：每筆有 contact_id 的照片 → 一筆 manual / confirmed / 無框的 photo_face
-- （以 NOT EXISTS 防重，讓本檔可安全重跑）
insert into public.photo_faces (photo_id, contact_id, source, status, created_at)
select cp.id, cp.contact_id, 'manual', 'confirmed', cp.created_at
from public.contact_photos cp
where cp.contact_id is not null
  and not exists (
    select 1 from public.photo_faces pf
    where pf.photo_id = cp.id and pf.contact_id = cp.contact_id
  );

-- RLS：沿用既有「登入即共享」慣例（多租戶隔離留待 v8.0）
alter table public.photo_faces enable row level security;

create policy "photo_faces_read"   on public.photo_faces for select to authenticated using (true);
create policy "photo_faces_insert" on public.photo_faces for insert to authenticated with check (true);
create policy "photo_faces_update" on public.photo_faces for update to authenticated using (true) with check (true);
create policy "photo_faces_delete" on public.photo_faces for delete to authenticated using (true);
