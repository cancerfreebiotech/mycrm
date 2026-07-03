import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'
import { logAdminAction } from '@/lib/adminAudit'

// POST /api/admin/email-recovery/apply
// Body: {
//   bad_contact_id: string,        // contact whose email is bouncing
//   new_email: string,             // replacement email (from new business card)
//   merge_from_contact_id?: string,  // optional: a duplicate contact to soft-delete
// }
//
// Behavior:
// 1. Append "舊 email: X (replaced YYYY-MM-DD because Y)" to bad contact's notes
// 2. Update bad contact: email = new_email, email_status = NULL
// 3. Optionally soft-delete the duplicate contact (merge_from_contact_id)
// 4. Write a system interaction_log on the bad contact recording the change

export const runtime = 'nodejs'
export const maxDuration = 30

const VALID_EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as {
    bad_contact_id?: string
    new_email?: string
    merge_from_contact_id?: string
  }
  if (!body.bad_contact_id || !body.new_email) {
    return NextResponse.json({ error: 'bad_contact_id + new_email required' }, { status: 400 })
  }
  const newEmail = body.new_email.trim()
  if (!VALID_EMAIL.test(newEmail)) {
    return NextResponse.json({ error: 'new_email format invalid' }, { status: 400 })
  }

  const service = createServiceClient()

  const { data: me } = await service
    .from('users')
    .select('id')
    .ilike('email', user.email)
    .maybeSingle()
  const userId = me?.id ?? null

  const { data: bad } = await service
    .from('contacts')
    .select('id, email, email_status, notes, name')
    .eq('id', body.bad_contact_id)
    .is('deleted_at', null)
    .maybeSingle()
  if (!bad) return NextResponse.json({ error: 'bad_contact_id not found' }, { status: 404 })

  const oldEmail = bad.email ?? '(empty)'
  const oldStatus = bad.email_status ?? 'none'
  const today = new Date().toISOString().slice(0, 10)
  const notesAddon = `📧 ${today} email 從 "${oldEmail}" (${oldStatus}) 換到 "${newEmail}"`
  const newNotes = bad.notes
    ? `${bad.notes}\n\n${notesAddon}`
    : notesAddon

  // Apply update
  const { error: updErr } = await service
    .from('contacts')
    .update({
      email: newEmail,
      email_status: null,
      notes: newNotes,
    })
    .eq('id', body.bad_contact_id)
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  // Audit log
  await service.from('interaction_logs').insert({
    contact_id: body.bad_contact_id,
    type: 'system',
    content: `Email recovery: 舊 ${oldEmail} (${oldStatus}) → 新 ${newEmail}`,
    created_by: userId,
  })

  // Optional: soft-delete the merge-from duplicate
  if (body.merge_from_contact_id) {
    await service
      .from('contacts')
      .update({ deleted_at: new Date().toISOString(), deleted_by: userId })
      .eq('id', body.merge_from_contact_id)
      .is('deleted_at', null)
  }

  await logAdminAction(service, {
    actorEmail: user.email ?? 'unknown',
    action: 'email_recovery_apply',
    target: body.bad_contact_id,
    detail: { new_email: newEmail, merge_from_contact_id: body.merge_from_contact_id ?? null },
  })

  return NextResponse.json({ ok: true, contact_id: body.bad_contact_id, new_email: newEmail })
}
