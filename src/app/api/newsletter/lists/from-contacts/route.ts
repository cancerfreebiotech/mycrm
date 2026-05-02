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

  // Bulk find-or-create + link, in batches. Replaces 4000+ sequential queries
  // (which on 2000 contacts took >60s) with ~6-10 batched queries.
  const errors: string[] = []
  const subscriberIdByContact = new Map<string, string>()

  // Step 1: bulk lookup existing subscribers by contact_id
  const validIds = valid.map((c) => c.id)
  const QUERY_BATCH = 200
  for (let i = 0; i < validIds.length; i += QUERY_BATCH) {
    const batch = validIds.slice(i, i + QUERY_BATCH)
    const { data } = await service
      .from('newsletter_subscribers')
      .select('id, contact_id')
      .in('contact_id', batch)
    for (const s of data ?? []) {
      if (s.contact_id) subscriberIdByContact.set(s.contact_id as string, s.id as string)
    }
  }

  // Step 2: for contacts not yet matched, fall back to email lookup
  const needEmailLookup = valid.filter((c) => !subscriberIdByContact.has(c.id))
  const emailLookup = needEmailLookup.map((c) => c.email!.trim()).filter((e) => !!e)
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

  // Step 3: build bulk-insert payload, deduped by email. Multiple CRM contacts
  // can share an email (e.g., shared inboxes); we want one subscriber per email
  // and link all those CRM contacts to the same subscriber.
  type NewSub = { email: string; contact_id: string; first_name: string | null; last_name: string | null; company: string | null; source: string }
  const seenInsertEmails = new Set<string>()
  const toCreate: NewSub[] = []
  for (const c of needEmailLookup) {
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

  // Step 4b: re-fetch subscriber IDs by email, EXCLUDING those already
  // marked unsubscribed at the subscriber level (newsletter_subscribers
  // .unsubscribed_at). They shouldn't be added to a fresh list.
  const allEmails = Array.from(new Set(valid.map((c) => c.email!.trim()).filter(Boolean)))
  const unsubscribedSubEmails = new Set<string>()
  subscriberIdByEmail.clear()  // rebuild fresh — earlier set may have stale unsubscribed entries
  for (let i = 0; i < allEmails.length; i += QUERY_BATCH) {
    const batch = allEmails.slice(i, i + QUERY_BATCH)
    const { data } = await service
      .from('newsletter_subscribers')
      .select('id, email, unsubscribed_at')
      .in('email', batch)
    for (const s of data ?? []) {
      if (!s.email) continue
      const lc = (s.email as string).toLowerCase()
      if (s.unsubscribed_at) {
        unsubscribedSubEmails.add(lc)
        continue
      }
      subscriberIdByEmail.set(lc, s.id as string)
    }
  }
  // Resolve subscriberIdByContact for any contact still unmapped
  // (and clear out any contact whose subscriber is unsubscribed).
  let excludedUnsubscribedSubscriber = 0
  const droppedContactIds = new Set<string>()
  for (const c of valid) {
    const lc = c.email!.trim().toLowerCase()
    if (unsubscribedSubEmails.has(lc)) {
      excludedUnsubscribedSubscriber++
      droppedContactIds.add(c.id)
      // also clear if Step 1 mapped it via contact_id (shouldn't happen but safe)
      subscriberIdByContact.delete(c.id)
      continue
    }
    if (subscriberIdByContact.has(c.id)) continue
    const sid = subscriberIdByEmail.get(lc)
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
    excluded: { ...excluded, unsubscribed_subscriber: excludedUnsubscribedSubscriber },
    errors: errors.length > 0 ? errors : undefined,
  })
}

// Allow up to 5 minutes for very large lists (Vercel Pro / Enterprise).
// Default Hobby plan caps at 10s and will still time out for 2k+ contacts.
export const maxDuration = 300
