import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'
import { logAdminAction } from '@/lib/adminAudit'
import { addErasureTombstones } from '@/lib/erasureTombstone'

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

  type TargetRow = { id: string; email: string | null; second_email: string | null }
  let targets: TargetRow[] = []

  if (body.all === true) {
    const { data: allTrashed } = await service
      .from('contacts')
      .select('id, email, second_email')
      .not('deleted_at', 'is', null)
    targets = (allTrashed ?? []) as TargetRow[]
  } else if (Array.isArray(body.ids) && body.ids.length > 0) {
    // 驗證這些 ID 都確實在回收區（避免誤刪未軟刪除的聯絡人）
    const { data: verified } = await service
      .from('contacts')
      .select('id, email, second_email')
      .in('id', body.ids)
      .not('deleted_at', 'is', null)
    targets = (verified ?? []) as TargetRow[]
  } else {
    return NextResponse.json({ error: 'Provide ids[] or all=true' }, { status: 400 })
  }

  const targetIds = targets.map((c) => c.id)

  if (targetIds.length === 0) {
    return NextResponse.json({ deleted: 0 })
  }

  // 收集要刪的 Storage 圖片（contact_cards + contact_photos，兩者皆存於 'cards' bucket）
  const [{ data: cards }, { data: photos }] = await Promise.all([
    service.from('contact_cards').select('storage_path').in('contact_id', targetIds),
    service.from('contact_photos').select('storage_path').in('contact_id', targetIds),
  ])

  const paths = [...(cards ?? []), ...(photos ?? [])]
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

  // 防復活：把 email 寫入 erasure 名單，避免隔天被 inbound capture / hunter 重建
  const tombstoned = await addErasureTombstones(
    service,
    targets.flatMap((c) => [c.email, c.second_email]),
  )

  await logAdminAction(service, {
    actorEmail: user.email ?? 'unknown',
    action: 'permanent_delete_bulk',
    detail: { count: targetIds.length, erasure_tombstone: tombstoned },
  })

  return NextResponse.json({ deleted: targetIds.length })
}
