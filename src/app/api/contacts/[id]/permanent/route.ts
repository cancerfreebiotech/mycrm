import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'
import { getOrgContext, orgScopedClient } from '@/lib/orgContext'
import { logAdminAction } from '@/lib/adminAudit'
import { addErasureTombstones } from '@/lib/erasureTombstone'

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

  const ctx = await getOrgContext()
  const db = orgScopedClient(ctx)

  // 確認聯絡人存在且已軟刪除（只能永久刪除回收區的聯絡人）
  const { data: contact } = await db
    .from('contacts')
    .select('id, email, second_email')
    .eq('id', id)
    .not('deleted_at', 'is', null)
    .single()

  if (!contact) {
    return NextResponse.json({ error: 'Contact not found in trash' }, { status: 404 })
  }

  // 刪除 Storage 圖片（contact_cards + contact_photos，兩者皆存於 'cards' bucket）
  const [{ data: cards }, { data: photos }] = await Promise.all([
    db.from('contact_cards').select('storage_path').eq('contact_id', id),
    db.from('contact_photos').select('storage_path').eq('contact_id', id),
  ])

  const paths = [...(cards ?? []), ...(photos ?? [])]
    .map((c: { storage_path: string | null }) => c.storage_path)
    .filter(Boolean) as string[]

  if (paths.length > 0) {
    await service.storage.from('cards').remove(paths)
  }

  // 永久刪除（CASCADE 會自動清除 contact_cards、contact_tags、interaction_logs 等）
  const { error } = await db
    .from('contacts')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // 防復活：把 email 寫入 erasure 名單，避免隔天被 inbound capture / hunter 重建
  const tombstoned = await addErasureTombstones(service, [contact.email, contact.second_email])

  await logAdminAction(db, {
    actorEmail: user.email ?? 'unknown',
    action: 'permanent_delete_contact',
    target: id,
    detail: { erasure_tombstone: tombstoned },
  })

  return NextResponse.json({ success: true })
}
