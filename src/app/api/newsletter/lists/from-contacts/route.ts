import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'
import { hasFeature } from '@/lib/features'

// POST /api/newsletter/lists/from-contacts
// Create a NEW newsletter list from a set of contact IDs.
//
// Body: { name: string; description?: string; key?: string; contactIds: string[] }
//
// Behavior:
// 1. Auth + 'newsletter' permission gate
// 2. Generate slug-key from name if key not provided; ensure uniqueness
// 3. Insert newsletter_lists row
// 4. Fetch contacts by IDs, filter same as send: email present && !email_opt_out && !email_status
// 5. For each valid contact: find-or-create subscriber, insert into newsletter_subscriber_lists
// 6. Return { list_id, list_name, list_key, added, excluded: {no_email, opt_out, bad_status} }

interface ContactRow {
  id: string
  email: string | null
  email_opt_out: boolean | null
  email_status: string | null
  name: string | null
  name_en: string | null
  name_local: string | null
  company: string | null
  contact_tags: { tags: { is_email_blacklist: boolean | null } | null }[]
}

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
  return slug || `list-${Date.now().toString(36)}`
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const { data: me } = await service
    .from('users')
    .select('id, role, granted_features')
    .ilike('email', user.email)
    .maybeSingle()
  if (!me || !hasFeature(me.role ?? '', (me.granted_features as string[]) ?? [], 'newsletter')) {
    return NextResponse.json({ error: 'Forbidden — newsletter permission required' }, { status: 403 })
  }

  const body = (await req.json().catch(() => ({}))) as {
    name?: string
    description?: string
    key?: string
    contactIds?: string[]
  }

  const name = body.name?.trim()
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })
  if (!Array.isArray(body.contactIds) || body.contactIds.length === 0) {
    return NextResponse.json({ error: 'contactIds required (non-empty)' }, { status: 400 })
  }

  // Resolve key
  let key = body.key?.trim() || slugify(name)
  // Ensure uniqueness — append stamp on collision
  const { data: existing } = await service
    .from('newsletter_lists')
    .select('id')
    .eq('key', key)
    .maybeSingle()
  if (existing) key = `${key}-${Date.now().toString(36)}`

  // Create list
  const { data: created, error: createErr } = await service
    .from('newsletter_lists')
    .insert({ key, name, description: body.description?.trim() || null })
    .select('id, key, name')
    .single()
  if (createErr || !created) {
    return NextResponse.json({ error: createErr?.message ?? 'failed to create list' }, { status: 500 })
  }

  // Fetch contacts (with tag blacklist info via embedded join)
  const { data: contacts, error: cErr } = await service
    .from('contacts')
    .select('id, email, email_opt_out, email_status, name, name_en, name_local, company, contact_tags(tags(is_email_blacklist))')
    .in('id', body.contactIds)
    .is('deleted_at', null)
  if (cErr) {
    return NextResponse.json({ error: cErr.message }, { status: 500 })
  }

  const rows = (contacts ?? []) as unknown as ContactRow[]
  const excluded = { no_email: 0, opt_out: 0, bad_status: 0, blacklist: 0 }
  const valid: ContactRow[] = []
  for (const c of rows) {
    // Priority: blacklist > no_email > opt_out > bad_status. Blacklist is the
    // strongest signal — always count as blacklist regardless of other gaps.
    if ((c.contact_tags ?? []).some((ct) => ct.tags?.is_email_blacklist)) { excluded.blacklist++; continue }
    if (!c.email || !c.email.trim()) { excluded.no_email++; continue }
    if (c.email_opt_out) { excluded.opt_out++; continue }
    if (c.email_status) { excluded.bad_status++; continue }
    valid.push(c)
  }

  let added = 0
  const errors: string[] = []
  for (const c of valid) {
    // find-or-create subscriber (prefer match by contact_id, fallback by email)
    let subscriberId: string | null = null
    const { data: byContact } = await service
      .from('newsletter_subscribers')
      .select('id')
      .eq('contact_id', c.id)
      .maybeSingle()
    if (byContact) subscriberId = byContact.id as string
    if (!subscriberId) {
      const { data: byEmail } = await service
        .from('newsletter_subscribers')
        .select('id')
        .eq('email', c.email!)
        .maybeSingle()
      if (byEmail) subscriberId = byEmail.id as string
    }
    if (!subscriberId) {
      const dn = (c.name || c.name_en || c.name_local || '').split(' ')
      const { data: createdSub, error: subErr } = await service
        .from('newsletter_subscribers')
        .insert({
          email: c.email,
          contact_id: c.id,
          first_name: dn[0] || null,
          last_name: dn.slice(1).join(' ') || null,
          company: c.company,
          source: 'crm',
        })
        .select('id')
        .single()
      if (subErr || !createdSub) {
        errors.push(`${c.email}: ${subErr?.message ?? 'subscriber insert failed'}`)
        continue
      }
      subscriberId = createdSub.id as string
    }

    const { error: linkErr } = await service
      .from('newsletter_subscriber_lists')
      .insert({ list_id: created.id, subscriber_id: subscriberId })
    if (linkErr) {
      // duplicate key means already linked — count as added (shouldn't happen on a new list, but safe)
      if (!linkErr.message.toLowerCase().includes('duplicate')) {
        errors.push(`${c.email}: ${linkErr.message}`)
        continue
      }
    }
    added++
  }

  return NextResponse.json({
    list_id: created.id,
    list_key: created.key,
    list_name: created.name,
    total_input: rows.length,
    added,
    excluded,
    errors: errors.length > 0 ? errors : undefined,
  })
}
