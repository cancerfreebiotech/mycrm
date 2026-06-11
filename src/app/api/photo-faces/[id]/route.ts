import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'

// PATCH /api/photo-faces/[id] — 接受 / 拒絕 AI 建議，或改指認的聯絡人
// body: { action?: 'accept' | 'reject', contact_id?: string }
//   accept：把 suggested 框轉為 confirmed，並把 suggested_contact_id 寫入 contact_id
//   reject：把框標為 rejected（不顯示）
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => null)
  const service = createServiceClient()

  if (body?.action === 'accept') {
    const { data: face } = await service
      .from('photo_faces')
      .select('suggested_contact_id, contact_id')
      .eq('id', id)
      .single()
    const target = body?.contact_id ?? face?.contact_id ?? face?.suggested_contact_id
    if (!target) return NextResponse.json({ error: 'no_contact_to_confirm' }, { status: 400 })
    const { error } = await service
      .from('photo_faces')
      .update({ status: 'confirmed', contact_id: target })
      .eq('id', id)
    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: 'already_tagged' }, { status: 409 })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  }

  if (body?.action === 'reject') {
    const { error } = await service.from('photo_faces').update({ status: 'rejected' }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (body?.contact_id) {
    const { error } = await service
      .from('photo_faces')
      .update({ contact_id: body.contact_id, status: 'confirmed' })
      .eq('id', id)
    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: 'already_tagged' }, { status: 409 })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'no_valid_action' }, { status: 400 })
}

// DELETE /api/photo-faces/[id] — 移除一個人臉標記
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const service = createServiceClient()
  const { error } = await service.from('photo_faces').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
