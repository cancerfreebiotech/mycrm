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

  // Fetch contacts in batches — `.in('id', [...uuids])` becomes a URL query
  // param, and >~200 uuids easily breaks the ~32 KB PostgREST URL limit
  // (silently returning an empty array). Real-world calls send 2000+ ids
  // when the user creates a list from a big language filter.
  const FETCH_BATCH = 200
  const fetchedRows: ContactRow[] = []
  for (let i = 0; i < body.contactIds.length; i += FETCH_BATCH) {
    const batch = body.contactIds.slice(i, i + FETCH_BATCH)
    const { data, error } = await service
      .from('contacts')
      .select('id, email, email_opt_out, email_status, name, name_en, name_local, company, contact_tags(tags(is_email_blacklist))')
      .in('id', batch)
      .is('deleted_at', null)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    fetchedRows.push(...((data ?? []) as unknown as ContactRow[]))
  }
  const rows = fetchedRows

  // Unsubscribe pre-pass: `newsletter_unsubscribes` is the canonical source
  // of truth (it's the audit log; subscribers.unsubscribed_at + contacts
  // .email_status='unsubscribed' are denormalized views of this).
  const QUERY_BATCH = 200
  const allRowEmails = Array.from(
    new Set(rows.map((r) => r.email?.trim().toLowerCase()).filter((e): e is string => !!e)),
  )
  const unsubEmails = new Set<string>()
  for (let i = 0; i < allRowEmails.length; i += QUERY_BATCH) {
    const batch = allRowEmails.slice(i, i + QUERY_BATCH)
    const { data } = await service
      .from('newsletter_unsubscribes')
      .select('email')
      .in('email', batch)
    for (const u of data ?? []) {
      if (u.email) unsubEmails.add((u.email as string).toLowerCase())
    }
  }

  const excluded = { no_email: 0, opt_out: 0, bad_status: 0, blacklist: 0, unsubscribed: 0 }
  const valid: ContactRow[] = []
  for (const c of rows) {
    // Priority: blacklist > unsubscribed > no_email > opt_out > bad_status.
    // Blacklist always wins (per-tag policy); unsubscribed is a hard legal
    // gate (CAN-SPAM/GDPR) regardless of email-health state.
    if ((c.contact_tags ?? []).some((ct) => ct.tags?.is_email_blacklist)) { excluded.blacklist++; continue }
    if (!c.email || !c.email.trim()) { excluded.no_email++; continue }
    if (unsubEmails.has(c.email.trim().toLowerCase())) { excluded.unsubscribed++; continue }
    if (c.email_opt_out) { excluded.opt_out++; continue }
    if (c.email_status) { excluded.bad_status++; continue }
    valid.push(c)
  }

  // Bulk find-or-create + link, in batches. Replaces 4000+ sequential queries
  // (which on 2000 contacts took >60s) with ~6-10 batched queries.
  //
  // KEY INVARIANT (v5.1.4+): subscriber identity is derived from CONTACT EMAIL
  // (the canonical source), NOT from any pre-existing subscriber linked via
  // contact_id. We previously did a contact_id pre-lookup that reused old
  // subscribers even when their stored email had drifted from the contact's
  // current email — leading to dirty CSV-imported emails (e.g. "jadecha")
  // sneaking into freshly-built lists. Now we go email-first end-to-end.
  const errors: string[] = []
  const subscriberIdByContact = new Map<string, string>()

  // Step 1: bulk lookup existing subscribers BY EMAIL (canonical source)
  const emailLookup = Array.from(new Set(valid.map((c) => c.email!.trim()).filter((e) => !!e)))
  const subscriberIdByEmail = new Map<string, string>()
  for (let i = 0; i < emailLookup.length; i += QUERY_BATCH) {
    const batch = emailLookup.slice(i, i + QUERY_BATCH)
    const { data } = await service
      .from('newsletter_subscribers')
      .select('id, email')
      .in('email', batch)
    for (const s of data ?? []) {
      if (s.email) subscriberIdByEmail.set((s.email as string).toLowerCase(), s.id as string)
    }
  }

  // Step 2: build bulk-insert payload, deduped by email. Multiple CRM contacts
  // can share an email (shared inboxes / spouse-of pattern); we want one
  // subscriber per email and link all those CRM contacts to the same subscriber.
  type NewSub = { email: string; contact_id: string; first_name: string | null; last_name: string | null; company: string | null; source: string }
  const seenInsertEmails = new Set<string>()
  const toCreate: NewSub[] = []
  for (const c of valid) {
    const lc = c.email!.trim().toLowerCase()
    const existing = subscriberIdByEmail.get(lc)
    if (existing) {
      subscriberIdByContact.set(c.id, existing)
      continue
    }
    if (seenInsertEmails.has(lc)) continue  // another contact with same email already queued
    seenInsertEmails.add(lc)
    const dn = (c.name || c.name_en || c.name_local || '').split(' ')
    toCreate.push({
      email: c.email!,
      contact_id: c.id,
      first_name: dn[0] || null,
      last_name: dn.slice(1).join(' ') || null,
      company: c.company,
      source: 'crm',
    })
  }

  // Step 4: upsert with ignoreDuplicates so a stray case-insensitive collision
  // doesn't kill the whole batch. Returns nothing useful; we re-fetch IDs next.
  const INSERT_BATCH = 500
  for (let i = 0; i < toCreate.length; i += INSERT_BATCH) {
    const chunk = toCreate.slice(i, i + INSERT_BATCH)
    const { error: insErr } = await service
      .from('newsletter_subscribers')
      .upsert(chunk, { onConflict: 'email', ignoreDuplicates: true })
    if (insErr) {
      errors.push(`bulk upsert subscribers (batch ${i / INSERT_BATCH}): ${insErr.message}`)
    }
  }

  // Step 4b: re-fetch subscriber IDs by email (canonical mapping for link rows).
  // No need to filter by unsubscribed_at here — unsubscribed contacts have
  // already been excluded above via the newsletter_unsubscribes pre-pass.
  const allEmails = Array.from(new Set(valid.map((c) => c.email!.trim()).filter(Boolean)))
  subscriberIdByEmail.clear()
  for (let i = 0; i < allEmails.length; i += QUERY_BATCH) {
    const batch = allEmails.slice(i, i + QUERY_BATCH)
    const { data } = await service
      .from('newsletter_subscribers')
      .select('id, email')
      .in('email', batch)
    for (const s of data ?? []) {
      if (s.email) subscriberIdByEmail.set((s.email as string).toLowerCase(), s.id as string)
    }
  }
  for (const c of valid) {
    if (subscriberIdByContact.has(c.id)) continue
    const sid = subscriberIdByEmail.get(c.email!.trim().toLowerCase())
    if (sid) subscriberIdByContact.set(c.id, sid)
  }

  // Step 5: build link rows, deduped by subscriber_id (multiple contacts
  // sharing one email collapse to one membership row).
  const seenSubIds = new Set<string>()
  const linkRows: { list_id: string; subscriber_id: string }[] = []
  for (const c of valid) {
    const sid = subscriberIdByContact.get(c.id)
    if (!sid || seenSubIds.has(sid)) continue
    seenSubIds.add(sid)
    linkRows.push({ list_id: created.id, subscriber_id: sid })
  }

  let added = 0
  for (let i = 0; i < linkRows.length; i += INSERT_BATCH) {
    const chunk = linkRows.slice(i, i + INSERT_BATCH)
    const { error: linkErr } = await service
      .from('newsletter_subscriber_lists')
      .insert(chunk)
    if (linkErr) {
      errors.push(`bulk insert links (batch ${i / INSERT_BATCH}): ${linkErr.message}`)
      continue
    }
    added += chunk.length
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

// Allow up to 5 minutes for very large lists (Vercel Pro / Enterprise).
// Default Hobby plan caps at 10s and will still time out for 2k+ contacts.
export const maxDuration = 300
