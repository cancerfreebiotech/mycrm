-- face_embeddings — AI 人臉特徵向量（v7.1 Phase 2）
--
-- ⚠️ 生物辨識資料（GDPR Art.9 特種個資 / 美國 BIPA）：
--   * 與 photo_faces / 業務資料分表，可單獨刪除
--   * RLS 啟用且不建 authenticated policy → 僅 service role（API route / Edge Function）可存取
--   * 前端永遠不直接讀向量
--   * face_recognition 為全域 opt-in 開關（system_settings.face_recognition_enabled，預設 false）

create extension if not exists vector;

create table if not exists public.face_embeddings (
  id          uuid primary key default gen_random_uuid(),
  face_id     uuid not null references public.photo_faces(id) on delete cascade,
  contact_id  uuid references public.contacts(id) on delete cascade,  -- 指認後回填，加速比對
  embedding   vector(128) not null,        -- @vladmandic/face-api descriptor = 128 維
  model_tag   text not null,               -- 模型版本（換模型時重算用）
  created_at  timestamptz not null default now()
);

create index if not exists idx_face_embeddings_face    on public.face_embeddings(face_id);
create index if not exists idx_face_embeddings_contact on public.face_embeddings(contact_id);
create index if not exists idx_face_embeddings_vec      on public.face_embeddings using hnsw (embedding vector_cosine_ops);

alter table public.face_embeddings enable row level security;
revoke all on public.face_embeddings from anon, authenticated;

-- 「這張臉像哪位聯絡人」：對 query 向量做 cosine 最近鄰，回傳超過相似度門檻者
create or replace function public.match_face_embedding(
  query_embedding vector(128),
  match_threshold real default 0.4,
  match_count int default 5
) returns table (contact_id uuid, similarity real)
language sql stable security definer set search_path = public, pg_temp as $$
  select fe.contact_id,
         (1 - (fe.embedding <=> query_embedding))::real as similarity
  from public.face_embeddings fe
  where fe.contact_id is not null
    and (1 - (fe.embedding <=> query_embedding)) >= match_threshold
  order by fe.embedding <=> query_embedding
  limit match_count;
$$;

-- 全域功能開關（預設關閉）
insert into public.system_settings (key, value)
values ('face_recognition_enabled', 'false')
on conflict (key) do nothing;
