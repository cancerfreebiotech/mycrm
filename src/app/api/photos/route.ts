import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'
import { getOrgContext, orgScopedClient } from '@/lib/orgContext'

interface FaceContactRow {
  id: string
  name: string | null
  name_en: string | null
}

interface PhotoFace {
  id: string
  contact_id: string | null
  contact_name: string | null
  status: 'confirmed' | 'suggested' | 'rejected'
  source: 'manual' | 'ai_detected'
  confidence: number | null
  bbox: { x: number; y: number; w: number; h: number } | null
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const ctx = await getOrgContext()
  const db = orgScopedClient(ctx)
  const q = req.nextUrl.searchParams.get('q')?.trim().toLowerCase() ?? ''
  const sortParam = req.nextUrl.searchParams.get('sort') ?? 'created_at'
  const sort: 'created_at' | 'taken_at' | 'name' =
    sortParam === 'taken_at' || sortParam === 'name' ? sortParam : 'created_at'

  // 相簿在前端以單一網格呈現，且 name 排序/搜尋於 JS 端跨全集進行，故此處載入全集。
  // 為避免無上限的全表載入，設一個防禦性上限並回報是否被截斷，而非靜默丟資料。
  const MAX_PHOTOS = 1000

  let query = db
    .from('contact_photos')
    .select('id, photo_url, storage_path, note, taken_at, location_name, latitude, longitude, created_at', { count: 'exact' })
    .limit(MAX_PHOTOS)

  if (sort === 'taken_at') {
    query = query
      .order('taken_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
  } else {
    // 'created_at' (default) and 'name' both pull by created_at desc; 'name' is re-sorted in JS below.
    query = query.order('created_at', { ascending: false })
  }

  const { data: photoRows, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const truncated = (count ?? 0) > MAX_PHOTOS

  // 一張照片可對應多位聯絡人 → 從 photo_faces 取每張照片框到的人（排除已拒絕的建議）。
  // contact_id 與 suggested_contact_id 都指向 contacts，故用 contacts:contact_id 明確指定 FK 以消歧義。
  const { data: faceRows, error: faceErr } = await db
    .from('photo_faces')
    .select('id, photo_id, contact_id, status, source, confidence, bbox_x, bbox_y, bbox_w, bbox_h, contacts:contact_id(id, name, name_en, deleted_at)')
    .neq('status', 'rejected')
  if (faceErr) return NextResponse.json({ error: faceErr.message }, { status: 500 })

  const facesByPhoto = new Map<string, PhotoFace[]>()
  for (const f of faceRows ?? []) {
    const contact = (Array.isArray(f.contacts) ? f.contacts[0] : f.contacts) as (FaceContactRow & { deleted_at: string | null }) | null
    // 聯絡人為軟刪除（deleted_at），其標記不應再出現在相簿。
    if (contact?.deleted_at) continue
    const arr = facesByPhoto.get(f.photo_id) ?? []
    arr.push({
      id: f.id,
      contact_id: f.contact_id,
      contact_name: contact?.name || contact?.name_en || null,
      status: f.status,
      source: f.source,
      confidence: f.confidence,
      bbox: f.bbox_x != null ? { x: f.bbox_x, y: f.bbox_y, w: f.bbox_w, h: f.bbox_h } : null,
    })
    facesByPhoto.set(f.photo_id, arr)
  }

  // Generate signed URLs (1 hour) and attach faces[]
  let photos = await Promise.all(
    (photoRows ?? []).map(async (p) => {
      let signedUrl = p.photo_url
      if (p.storage_path) {
        const { data: signed } = await service.storage
          .from('cards')
          .createSignedUrl(p.storage_path, 3600)
        if (signed?.signedUrl) signedUrl = signed.signedUrl
      }
      return {
        id: p.id,
        photo_url: signedUrl,
        note: p.note,
        taken_at: p.taken_at,
        location_name: p.location_name,
        latitude: p.latitude,
        longitude: p.longitude,
        created_at: p.created_at,
        faces: facesByPhoto.get(p.id) ?? [],
      }
    })
  )

  // 搜尋：附註 / 地點 / 任一框到的聯絡人姓名（資料量不大，於 JS 端過濾）
  if (q) {
    photos = photos.filter((p) => {
      if (p.note?.toLowerCase().includes(q)) return true
      if (p.location_name?.toLowerCase().includes(q)) return true
      return p.faces.some((f) => f.contact_name?.toLowerCase().includes(q))
    })
  }

  if (sort === 'name') {
    photos.sort((a, b) => {
      // 以第一位框到的聯絡人姓名排序；未標記者（無 face）排最後
      const aName = a.faces[0]?.contact_name ?? null
      const bName = b.faces[0]?.contact_name ?? null
      if (aName === null && bName === null) return 0
      if (aName === null) return 1
      if (bName === null) return -1
      return aName.localeCompare(bName, undefined, { sensitivity: 'base' })
    })
  }

  return NextResponse.json({ photos, total: photos.length, totalStored: count ?? photos.length, truncated })
}
