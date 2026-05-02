import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

const SELECT_FIELDS = 'id, name, company, job_title, email, phone, country_code, met_at, created_at, last_activity_at, importance, language, email_status, email_opt_out, created_by, users!created_by(display_name), contact_tags(tags(id, name, is_email_blacklist))'
const BATCH_SIZE = 1000
const QUERY_BATCH = 200

// GET — fetch all contacts (bypasses PostgREST 1000-row limit via pagination)
// Default order: last_activity_at DESC (interaction_logs.created_at MAX for
// types note/meeting/email, fallback to contacts.created_at). Keeps contacts
// with recent activity near the top even if the row itself is old.
//
// Derives `email_status='unsubscribed'` from `newsletter_unsubscribes` when
// the contact's own `email_status` is NULL. `newsletter_unsubscribes` is the
// audit-log canonical source for unsubscribe state (per-email, includes
// emails that may not yet have a subscriber row). The contact field stays
// as a denormalized view so existing UI / filter logic keeps working.
interface ContactRow {
  id: string
  email: string | null
  email_status: string | null
  [k: string]: unknown
}

export async function GET() {
  const supabase = createServiceClient()

  const allContacts: ContactRow[] = []
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from('contacts')
      .select(SELECT_FIELDS)
      .is('deleted_at', null)
      .order('last_activity_at', { ascending: false })
      .range(from, from + BATCH_SIZE - 1)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data || data.length === 0) break

    allContacts.push(...(data as unknown as ContactRow[]))
    if (data.length < BATCH_SIZE) break
    from += BATCH_SIZE
  }

  // Build set of emails currently flagged unsubscribed at subscriber level.
  const emails = Array.from(
    new Set(
      allContacts
        .map((c) => (typeof c.email === 'string' ? c.email.trim().toLowerCase() : ''))
        .filter((e) => e.length > 0),
    ),
  )
  const unsubscribed = new Set<string>()
  for (let i = 0; i < emails.length; i += QUERY_BATCH) {
    const batch = emails.slice(i, i + QUERY_BATCH)
    const { data } = await supabase
      .from('newsletter_unsubscribes')
      .select('email')
      .in('email', batch)
    for (const u of data ?? []) {
      if (u.email) unsubscribed.add((u.email as string).toLowerCase())
    }
  }

  // Apply derivation: if contact.email_status is NULL but the email is
  // unsubscribed at subscriber level, surface 'unsubscribed'. Don't overwrite
  // existing values (bounce/invalid stay — they're stronger signals).
  const decorated = allContacts.map((c) => {
    if (c.email_status) return c
    const lc = typeof c.email === 'string' ? c.email.trim().toLowerCase() : ''
    if (lc && unsubscribed.has(lc)) {
      return { ...c, email_status: 'unsubscribed' }
    }
    return c
  })

  return NextResponse.json(decorated)
}
