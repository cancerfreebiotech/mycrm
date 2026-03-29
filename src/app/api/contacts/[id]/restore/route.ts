import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'

// POST /api/contacts/[id]/restore — 還原已軟刪除的聯絡人（僅 super_admin）
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const service = createServiceClient()

  const { data: profile } = await service
    .from('users')
    .select('role')
    .eq('email', user.email!)
    .single()

  if (profile?.role !== 'super_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // 確認聯絡人存在且已軟刪除
  const { data: contact } = await service
    .from('contacts')
    .select('id')
    .eq('id', id)
    .not('deleted_at', 'is', null)
    .single()

  if (!contact) {
    return NextResponse.json({ error: 'Contact not found in trash' }, { status: 404 })
  }

  const { error } = await service
    .from('contacts')
    .update({ deleted_at: null, deleted_by: null })
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
