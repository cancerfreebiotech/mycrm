import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'
import { checkDuplicates } from '@/lib/duplicate'

// User-facing pending review actions: save / merge / delete.
// RLS on pending_contacts (created_by = current user) is the auth gate.
// All writes use service client AFTER verifying the pending row belongs to the user.

async function getAuthUserId(): Promise<{ userId: string; userEmail: string } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return null
  const service = createServiceClient()
  const { data } = await service.from('users').select('id').eq('email', user.email).single()
  if (!data?.id) return null
  return { userId: data.id, userEmail: user.email }
}

async function fetchOwnedPending(pendingId: string, userId: string) {
  const service = createServiceClient()
  const { data } = await service
    .from('pending_contacts')
    .select('id, data, storage_path, created_by, status')
    .eq('id', pendingId)
    .single()
  if (!data || data.created_by !== userId) return null
  return data
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await getAuthUserId()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const action = body.action as 'save' | 'merge' | undefined

  const pending = await fetchOwnedPending(id, auth.userId)
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
      })
      if (exact.length > 0) {
        return NextResponse.json({
          error: 'duplicate_exact',
          suggested_target_id: exact[0].id,
          suggested_target_name: exact[0].name,
        }, { status: 409 })
      }
    }

    // Strip rotation + merge-target hidden fields + batch-dup markers + card image URLs (multi-card uses contact_cards)
    const { rotation: _r, _merge_target_id: _mt, _merge_target_name: _mn, _batch_dup_of_id: _bdi, _batch_dup_of_name: _bdn, card_img_url: _ci, card_img_back_url: _cb, ...contactFields } = pdata
    const { data: inserted, error } = await service
      .from('contacts')
      .insert({ ...contactFields, created_by: auth.userId })
      .select('id, name')
      .single()
    if (error || !inserted) {
      return NextResponse.json({ error: error?.message ?? 'Insert failed' }, { status: 500 })
    }

    await service.from('interaction_logs').insert({
      contact_id: inserted.id,
      type: 'system',
      content: '從 Pending 區確認新增名片',
      created_by: auth.userId,
    })

    if (pdata.card_img_url) {
      const now = new Date()
      const cardLabel = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      await service.from('contact_cards').insert({
        contact_id: inserted.id,
        card_img_url: pdata.card_img_url as string,
        storage_path: pending.storage_path,
        label: cardLabel,
      })
    }

    await service.from('pending_contacts').delete().eq('id', id)
    return NextResponse.json({ ok: true, contact_id: inserted.id, name: inserted.name })
  }

  if (action === 'merge') {
    const targetId = pdata._merge_target_id as string | undefined
    if (!targetId) return NextResponse.json({ error: 'No merge target' }, { status: 400 })

    const { data: existing } = await service
      .from('contacts')
      .select('id, name, name_en, name_local, company, job_title, email, phone, second_phone, address, website')
      .eq('id', targetId)
      .single()
    if (!existing) return NextResponse.json({ error: 'Target contact not found' }, { status: 404 })

    const FIELD_LABELS: Record<string, string> = {
      name: '姓名', name_en: '英文名', name_local: '當地語名',
      company: '公司', job_title: '職稱', email: 'Email',
      phone: '電話', second_phone: '備用電話', address: '地址', website: '網站',
    }
    const toFill: Record<string, string> = {}
    const conflicts: Array<{ key: string; label: string; newVal: string; oldVal: string }> = []
    for (const key of Object.keys(FIELD_LABELS)) {
      const newVal = pdata[key] as string | null | undefined
      const oldVal = (existing as Record<string, unknown>)[key] as string | null | undefined
      if (!newVal) continue
      if (!oldVal) toFill[key] = newVal
      else if (oldVal !== newVal) conflicts.push({ key, label: FIELD_LABELS[key], newVal, oldVal })
    }

    if (Object.keys(toFill).length > 0) {
      await service.from('contacts').update(toFill).eq('id', targetId)
    }

    if (pdata.card_img_url) {
      const now = new Date()
      const cardLabel = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      await service.from('contact_cards').insert({
        contact_id: targetId,
        card_img_url: pdata.card_img_url as string,
        storage_path: pending.storage_path,
        label: cardLabel,
      })
    }

    if (conflicts.length > 0) {
      const noteLines = conflicts.map(c => `${c.label}：${c.newVal}（現有：${c.oldVal}）`).join('\n')
      await service.from('interaction_logs').insert({
        contact_id: targetId,
        type: 'system',
        content: `合併新名片資料（與現有不同的欄位）：\n${noteLines}`,
        created_by: auth.userId,
      })
    }

    await service.from('pending_contacts').delete().eq('id', id)
    return NextResponse.json({
      ok: true,
      contact_id: targetId,
      filled: Object.keys(toFill).length,
      conflicts: conflicts.length,
    })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await getAuthUserId()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const pending = await fetchOwnedPending(id, auth.userId)
  if (!pending) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const service = createServiceClient()
  if (pending.storage_path) {
    await service.storage.from('cards').remove([pending.storage_path])
  }
  await service.from('pending_contacts').delete().eq('id', id)
  return NextResponse.json({ ok: true })
}
