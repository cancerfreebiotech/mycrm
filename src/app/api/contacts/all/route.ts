import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

const SELECT_FIELDS = 'id, name, company, job_title, email, phone, country_code, met_at, met_date, created_at, last_activity_at, importance, language, email_status, email_opt_out, created_by, users!created_by(display_name), contact_tags(tags(id, name, is_email_blacklist))'
const BATCH_SIZE = 1000
const MAX_BATCHES = 20  // safety cap (== 20,000 contacts)

interface ContactRow {
  id: string
  email: string | null
  email_status: string | null
  [k: string]: unknown
}

// GET — fetch all contacts (bypasses PostgREST 1000-row limit via pagination)
// Default order: last_activity_at DESC.
//
// Derives `email_status='unsubscribed'` from `newsletter_unsubscribes` when
// the contact's own `email_status` is NULL.
export async function GET() {
  const supabase = createServiceClient()

  // 1) Get total count (cheap) so we can parallelize range fetches.
  const { count: totalCount, error: countErr } = await supabase
    .from('contacts')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null)
  if (countErr) return NextResponse.json({ error: countErr.message }, { status: 500 })
  const total = totalCount ?? 0

  // 2) Parallel-fetch all pages.
  const pageCount = Math.min(MAX_BATCHES, Math.ceil(total / BATCH_SIZE))
  const pagePromises: Promise<{ data: unknown[] | null; error: { message: string } | null }>[] = []
  for (let i = 0; i < pageCount; i++) {
    const from = i * BATCH_SIZE
    pagePromises.push(
      supabase
        .from('contacts')
        .select(SELECT_FIELDS)
        .is('deleted_at', null)
        .order('last_activity_at', { ascending: false })
        .range(from, from + BATCH_SIZE - 1)
        .then((r) => ({ data: r.data, error: r.error }))
    )
  }

  // 3) In parallel, fetch ALL newsletter_unsubscribes (small table — typically tens of rows).
  const unsubsPromise = supabase
    .from('newsletter_unsubscribes')
    .select('email')

  const [unsubsResult, ...pageResults] = await Promise.all([unsubsPromise, ...pagePromises])

  const allContacts: ContactRow[] = []
  for (const r of pageResults) {
    if (r.error) return NextResponse.json({ error: r.error.message }, { status: 500 })
    if (r.data) allContacts.push(...(r.data as unknown as ContactRow[]))
  }

  const unsubscribed = new Set<string>()
  for (const u of (unsubsResult.data ?? []) as Array<{ email: string | null }>) {
    if (u.email) unsubscribed.add(u.email.toLowerCase())
  }

  // Apply derivation: if contact.email_status is NULL but the email is
  // unsubscribed at subscriber level, surface 'unsubscribed'. Don't overwrite
  // existing values (bounce/invalid stay — they're stronger signals).
  const decorated = allContacts.map((c) => {
    if (c.email_status) return c
    const lc = typeof c.email === 'string' ? c.email.trim().toLowerCase() : ''
    if (lc && unsubscribed.has(lc)) return { ...c, email_status: 'unsubscribed' }
    return c
  })

  return NextResponse.json(decorated)
}
