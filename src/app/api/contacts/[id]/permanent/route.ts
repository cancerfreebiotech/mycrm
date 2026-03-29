import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'

// DELETE /api/contacts/[id]/permanent — 永久刪除聯絡人（僅 super_admin）
export async function DELETE(
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

  // 確認聯絡人存在且已軟刪除（只能永久刪除回收區的聯絡人）
  const { data: contact } = await service
    .from('contacts')
    .select('id')
    .eq('id', id)
    .not('deleted_at', 'is', null)
    .single()

  if (!contact) {
    return NextResponse.json({ error: 'Contact not found in trash' }, { status: 404 })
  }

  // 刪除 Storage 圖片（contact_cards）
  const { data: cards } = await service
    .from('contact_cards')
    .select('storage_path')
    .eq('contact_id', id)

  const paths = (cards ?? [])
    .map((c: { storage_path: string | null }) => c.storage_path)
    .filter(Boolean) as string[]

  if (paths.length > 0) {
    await service.storage.from('cards').remove(paths)
  }

  // 永久刪除（CASCADE 會自動清除 contact_cards、contact_tags、interaction_logs 等）
  const { error } = await service
    .from('contacts')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
