import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'
import { getOrgContext, orgScopedClient } from '@/lib/orgContext'
import { logAdminAction } from '@/lib/adminAudit'

const MERGE_FIELDS = [
  'name', 'name_en', 'name_local',
  'company', 'company_en', 'company_local',
  'job_title',
  'email', 'second_email',
  'phone', 'second_phone',
  'address', 'website',
  'linkedin_url', 'facebook_url',
  'notes',
  'country_code',
  'met_at', 'met_date', 'referred_by',
  'card_img_url', 'card_img_back_url',
] as const

/**
 * POST /api/contacts/[id]/merge
 * Body: { sourceId: string }
 *
 * Merges sourceId into [id] (keep contact).
 * Rules:
 *   - Keep contact's fields are preserved if non-null
 *   - Empty fields on keep contact are filled from source
 *   - contact_cards, interaction_logs, contact_tags from source are moved to keep
 *   - A system interaction_log is written recording the merge
 *   - Source contact is deleted
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: keepId } = await params
  const { sourceId } = await req.json()

  if (!keepId || !sourceId || keepId === sourceId) {
    return NextResponse.json({ error: 'Invalid IDs' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Resolve the caller from the session cookie (proxy already requires a login;
  // any logged-in user can merge per PRD). The service client above can't read
  // the session, so use the route client purely for actor identity/audit.
  const authClient = await createClient()
  const { data: { user } } = await authClient.auth.getUser()
  const ctx = await getOrgContext()
  const db = orgScopedClient(ctx)

  // Load both contacts
  const [{ data: keepContact }, { data: sourceContact }] = await Promise.all([
    db.from('contacts').select('*').eq('id', keepId).single(),
    db.from('contacts').select('*').eq('id', sourceId).single(),
  ])

  if (!keepContact || !sourceContact) {
    return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
  }

  // Build merged fields: keep non-null from keepContact, fill nulls from sourceContact
  const updates: Record<string, unknown> = {}
  for (const field of MERGE_FIELDS) {
    if (!keepContact[field] && sourceContact[field]) {
      updates[field] = sourceContact[field]
    }
  }

  // 1. Update keep contact with merged fields
  if (Object.keys(updates).length > 0) {
    await db.from('contacts').update(updates).eq('id', keepId)
  }

  // 2. Move contact_cards from source to keep
  await db.from('contact_cards').update({ contact_id: keepId }).eq('contact_id', sourceId)

  // 3. Move contact_photos from source to keep
  await db.from('contact_photos').update({ contact_id: keepId }).eq('contact_id', sourceId)

  // 3b. Move photo_faces (v7.1 多人標記) from source to keep.
  //     UNIQUE(photo_id, contact_id)：先刪掉同一張照片已標記 keep 的 source 列避免衝突，再搬其餘。
  {
    const { data: keepFaces } = await db
      .from('photo_faces').select('photo_id').eq('contact_id', keepId)
    const keepPhotoIds = (keepFaces ?? []).map(f => f.photo_id)
    if (keepPhotoIds.length > 0) {
      await db.from('photo_faces').delete()
        .eq('contact_id', sourceId).in('photo_id', keepPhotoIds)
    }
    await db.from('photo_faces').update({ contact_id: keepId }).eq('contact_id', sourceId)
  }

  // 4. Move interaction_logs from source to keep
  await db.from('interaction_logs').update({ contact_id: keepId }).eq('contact_id', sourceId)

  // 5. Move tasks from source to keep
  await db.from('tasks').update({ contact_id: keepId }).eq('contact_id', sourceId)

  // 6. Move email_events from source to keep
  await db.from('email_events').update({ contact_id: keepId }).eq('contact_id', sourceId)

  // 7. Move newsletter tables to keep by re-pointing contact_id. (Previously an
  //    upsert-with-source-PK + delete, which hit ON CONFLICT DO NOTHING and
  //    silently DELETED the rows instead of moving them → unsubscribed/bounced
  //    contacts became re-mailable.) Safe: these tables' uniqueness is on email
  //    (unchanged here), and none is unique on contact_id.
  for (const table of ['newsletter_blacklist', 'newsletter_recipients', 'newsletter_unsubscribes'] as const) {
    await supabase.from(table).update({ contact_id: keepId }).eq('contact_id', sourceId)
  }

  // 7b. Move the source's AI briefings, face embeddings, and newsletter-subscriber
  //     link to keep BEFORE the delete — otherwise the contact delete CASCADE-drops
  //     briefings/embeddings and NULLs the subscriber link (losing email suppression).
  for (const table of ['contact_briefings', 'face_embeddings', 'newsletter_subscribers'] as const) {
    await supabase.from(table).update({ contact_id: keepId }).eq('contact_id', sourceId)
  }

  // 8. Merge contact_tags (union — upsert ignores conflicts)
  const { data: sourceTags } = await db
    .from('contact_tags')
    .select('tag_id')
    .eq('contact_id', sourceId)

  if (sourceTags && sourceTags.length > 0) {
    const tagInserts = sourceTags.map((t: { tag_id: string }) => ({
      contact_id: keepId,
      tag_id: t.tag_id,
    }))
    await db.from('contact_tags').upsert(tagInserts, { onConflict: 'contact_id,tag_id' })
  }

  // 9. Remove all duplicate_pairs involving source contact
  await db.from('duplicate_pairs').delete().or(`contact_id_a.eq.${sourceId},contact_id_b.eq.${sourceId}`)

  // 10. Write system interaction_log
  const sourceName = sourceContact.name || sourceContact.name_en || sourceId
  const sourceCompany = sourceContact.company || sourceContact.company_en || ''
  await db.from('interaction_logs').insert({
    contact_id: keepId,
    type: 'system',
    content: `合併聯絡人：${sourceName}${sourceCompany ? `（${sourceCompany}）` : ''}`,
  })

  // 11. Delete source contact (cascades contact_tags)
  await db.from('contacts').delete().eq('id', sourceId)

  // Caller identity from the session cookie (route client above); the proxy
  // guarantees a session exists, so 'unknown' only appears for edge cases.
  await logAdminAction(supabase, {
    actorEmail: user?.email ?? 'unknown',
    action: 'contact_merge',
    target: keepId,
    detail: { sourceId },
  })

  return NextResponse.json({ ok: true })
}
