import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'

// DELETE /api/contacts/[id] — 軟刪除聯絡人（建立者或 super_admin）
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // 取得當前登入使用者
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const service = createServiceClient()

  // 查詢使用者資料（role）
  const { data: profile } = await service
    .from('users')
    .select('id, role')
    .eq('email', user.email!)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'User not found' }, { status: 403 })
  }

  // 查詢聯絡人（確認存在且未被刪除）
  const { data: contact } = await service
    .from('contacts')
    .select('id, created_by')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (!contact) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
  }

  // 權限檢查：只有建立者或 super_admin 可刪除
  const isSuperAdmin = profile.role === 'super_admin'
  const isCreator = contact.created_by === profile.id

  if (!isSuperAdmin && !isCreator) {
    return NextResponse.json({ error: 'Permission denied' }, { status: 403 })
  }

  // 軟刪除：設定 deleted_at / deleted_by
  const { error: updateError } = await service
    .from('contacts')
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: profile.id,
    })
    .eq('id', id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
