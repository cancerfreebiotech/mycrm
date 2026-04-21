import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'

// DELETE /api/contacts/trash/bulk — 批次永久刪除回收區聯絡人（僅 super_admin）
// Body: { ids: string[] }  OR  { all: true } 清空整個回收區
export async function DELETE(req: NextRequest) {
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

  const body = await req.json().catch(() => ({})) as { ids?: string[]; all?: boolean }

  let targetIds: string[] = []

  if (body.all === true) {
    const { data: allTrashed } = await service
      .from('contacts')
      .select('id')
      .not('deleted_at', 'is', null)
    targetIds = (allTrashed ?? []).map((c: { id: string }) => c.id)
  } else if (Array.isArray(body.ids) && body.ids.length > 0) {
    // 驗證這些 ID 都確實在回收區（避免誤刪未軟刪除的聯絡人）
    const { data: verified } = await service
      .from('contacts')
      .select('id')
      .in('id', body.ids)
      .not('deleted_at', 'is', null)
    targetIds = (verified ?? []).map((c: { id: string }) => c.id)
  } else {
    return NextResponse.json({ error: 'Provide ids[] or all=true' }, { status: 400 })
  }

  if (targetIds.length === 0) {
    return NextResponse.json({ deleted: 0 })
  }

  // 收集要刪的 Storage 圖片
  const { data: cards } = await service
    .from('contact_cards')
    .select('storage_path')
    .in('contact_id', targetIds)

  const paths = (cards ?? [])
    .map((c: { storage_path: string | null }) => c.storage_path)
    .filter(Boolean) as string[]

  if (paths.length > 0) {
    await service.storage.from('cards').remove(paths)
  }

  // 永久刪除（CASCADE 清 contact_cards、contact_tags、interaction_logs）
  const { error } = await service
    .from('contacts')
    .delete()
    .in('id', targetIds)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ deleted: targetIds.length })
}
