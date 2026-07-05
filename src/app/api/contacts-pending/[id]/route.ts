import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'
import { getOrgContext, orgScopedClient, type OrgDb } from '@/lib/orgContext'
import { checkDuplicates } from '@/lib/duplicate'
import { mergeIntoContact, type MergeMode } from '@/lib/merge-into-contact'

// User-facing pending review actions: save / merge / delete.
// RLS on pending_contacts (created_by = current user) is the auth gate.
// All writes use service client AFTER verifying the pending row belongs to the user.

async function getAuthUserId(): Promise<{ userId: string; userEmail: string; isSuperAdmin: boolean } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return null
  const service = createServiceClient()
  const { data } = await service.from('users').select('id, role').eq('email', user.email).single()
  if (!data?.id) return null
  return { userId: data.id, userEmail: user.email, isSuperAdmin: data.role === 'super_admin' }
}

async function fetchOwnedPending(db: OrgDb, pendingId: string, userId: string, isSuperAdmin: boolean) {
  const { data } = await db
    .from('pending_contacts')
    .select('id, data, storage_path, created_by, status')
    .eq('id', pendingId)
    .single()
  if (!data || (!isSuperAdmin && data.created_by !== userId)) return null
  return data
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await getAuthUserId()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ctx = await getOrgContext()
  const db = orgScopedClient(ctx)

  const body = await req.json().catch(() => ({}))
  const action = body.action as 'save' | 'merge' | undefined

  const pending = await fetchOwnedPending(db, id, auth.userId, auth.isSuperAdmin)
  if (!pending) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (pending.status !== 'done') {
    return NextResponse.json({ error: 'Pending row is not ready for review (status=' + pending.status + ')' }, { status: 400 })
  }

  const service = createServiceClient()
  const pdata = pending.data as Record<string, unknown>

  if (action === 'save') {
    // Defensive re-check: between OCR and now, the user may have already saved
    // an earlier pending row with the same email. Re-run checkDuplicates and
    // return 409 if there's an exact email match — frontend shows a dialog.
    const force = body.force === true
    if (!force) {
      const { exact } = await checkDuplicates({
        email: pdata.email as string | null | undefined,
        secondEmail: pdata.second_email as string | null | undefined,
        name: pdata.name as string | null | undefined,
        nameEn: pdata.name_en as string | null | undefined,
        nameLocal: pdata.name_local as string | null | undefined,
      }, ctx)
      if (exact.length > 0) {
        return NextResponse.json({
          error: 'duplicate_exact',
          suggested_target_id: exact[0].id,
          suggested_target_name: exact[0].name,
        }, { status: 409 })
      }
    }

    // Strip rotation + merge-target hidden fields + batch-dup markers + tag ids
    // (handled separately) + card image URLs (multi-card uses contact_cards)
    const { rotation: _r, _merge_target_id: _mt, _merge_target_name: _mn, _batch_dup_of_id: _bdi, _batch_dup_of_name: _bdn, _tag_ids: _ti, card_img_url: _ci, card_img_back_url: _cb, ...contactFields } = pdata
    const tagIds = Array.isArray(_ti) ? (_ti as string[]) : []
    // Default importance to 'medium' if user didn't explicitly choose
    if (!contactFields.importance) contactFields.importance = 'medium'
    const { data: inserted, error } = await db
      .from('contacts')
      .insert({ ...contactFields, created_by: auth.userId })
      .select('id, name')
      .single()
    if (error || !inserted) {
      return NextResponse.json({ error: error?.message ?? 'Insert failed' }, { status: 500 })
    }

    await db.from('interaction_logs').insert({
      contact_id: inserted.id,
      type: 'system',
      content: '從 Pending 區確認新增名片',
      created_by: auth.userId,
    })

    if (tagIds.length > 0) {
      await db.from('contact_tags').insert(
        tagIds.map((tagId) => ({ contact_id: inserted.id, tag_id: tagId }))
      )
    }

    if (pdata.card_img_url) {
      const now = new Date()
      const cardLabel = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      await db.from('contact_cards').insert({
        contact_id: inserted.id,
        card_img_url: pdata.card_img_url as string,
        storage_path: pending.storage_path,
        label: cardLabel,
      })
    }

    await db.from('pending_contacts').delete().eq('id', id)
    return NextResponse.json({ ok: true, contact_id: inserted.id, name: inserted.name })
  }

  if (action === 'merge') {
    // target_id from request body (manual picker) takes precedence over the
    // OCR-detected duplicate in pdata._merge_target_id (auto-suggested).
    const manualTargetId = typeof body.target_id === 'string' ? body.target_id : undefined
    const targetId = manualTargetId ?? (pdata._merge_target_id as string | undefined)
    if (!targetId) return NextResponse.json({ error: 'No merge target' }, { status: 400 })

    const mode: MergeMode = body.mode === 'replace' ? 'replace' : 'fill'
    const tagIds = Array.isArray(pdata._tag_ids) ? (pdata._tag_ids as string[]) : []
    const now = new Date()
    const cardLabel = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

    const result = await mergeIntoContact(service, {
      targetId,
      newData: pdata,
      cardImgUrl: pdata.card_img_url as string | undefined,
      cardImgBackUrl: pdata.card_img_back_url as string | undefined,
      storagePath: pending.storage_path,
      cardLabel,
      mode,
      userId: auth.userId,
      tagIds,
      logPrefix: mode === 'replace' ? '從 Pending 區更新聯絡人' : '從 Pending 區合併新名片',
    })

    if (!result.ok) return NextResponse.json({ error: result.error ?? 'Merge failed' }, { status: 500 })

    await db.from('pending_contacts').delete().eq('id', id)
    return NextResponse.json({
      ok: true,
      contact_id: result.contact_id,
      filled: result.filled,
      replaced: result.replaced,
      conflicts: result.conflicts,
    })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await getAuthUserId()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ctx = await getOrgContext()
  const db = orgScopedClient(ctx)

  const pending = await fetchOwnedPending(db, id, auth.userId, auth.isSuperAdmin)
  if (!pending) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const service = createServiceClient()
  if (pending.storage_path) {
    await service.storage.from('cards').remove([pending.storage_path])
  }
  await db.from('pending_contacts').delete().eq('id', id)
  return NextResponse.json({ ok: true })
}
