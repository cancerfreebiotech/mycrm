import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'

// POST /api/photo-faces — 手動把一位聯絡人標記到一張照片（一張照片可標多人）
// body: { photo_id: string, contact_id: string, bbox?: {x,y,w,h} }
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const photoId = body?.photo_id
  const contactId = body?.contact_id
  if (!photoId || !contactId) {
    return NextResponse.json({ error: 'photo_id and contact_id are required' }, { status: 400 })
  }
  const bbox = body?.bbox

  const service = createServiceClient()
  const { data, error } = await service
    .from('photo_faces')
    .insert({
      photo_id: photoId,
      contact_id: contactId,
      source: 'manual',
      status: 'confirmed',
      bbox_x: bbox?.x ?? null,
      bbox_y: bbox?.y ?? null,
      bbox_w: bbox?.w ?? null,
      bbox_h: bbox?.h ?? null,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (error) {
    // 23505 = unique_violation：此人已被標記在這張照片上
    if (error.code === '23505') {
      return NextResponse.json({ error: 'already_tagged' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ id: data.id })
}
