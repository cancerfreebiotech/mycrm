import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'

interface ListStat { total: number; eligible: number }

// GET — return per-list recipient stats (total + eligible-to-send) for all lists
// Eligibility filter matches campaigns/[id]/send/route.ts:
//   - newsletter_subscribers.unsubscribed_at IS NULL
//   - email NOT in newsletter_blacklist (for non-CRM subscribers)
//   - email NOT in newsletter_unsubscribes
//   - linked contacts.email_status IS NULL (if has contact)
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()

  // Paginate memberships fetch — PostgREST default caps at 1000 rows; a single
  // list with 1937 members + others would silently truncate, making the stats
  // for the truncated lists show 0.
  type Membership = { list_id: string; newsletter_subscribers: { id: string; email: string; contact_id: string | null; unsubscribed_at: string | null } | null }
  const rows: Membership[] = []
  const BATCH = 1000
  let mFrom = 0
  while (true) {
    const { data, error } = await service
      .from('newsletter_subscriber_lists')
      .select('list_id, newsletter_subscribers(id, email, contact_id, unsubscribed_at)')
      .range(mFrom, mFrom + BATCH - 1)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data || data.length === 0) break
    rows.push(...(data as unknown as Membership[]))
    if (data.length < BATCH) break
    mFrom += BATCH
  }

  // Same paginate for blacklist + unsubs (could grow too)
  const blRows: { email: string }[] = []
  let bFrom = 0
  while (true) {
    const { data } = await service.from('newsletter_blacklist').select('email').range(bFrom, bFrom + BATCH - 1)
    if (!data || data.length === 0) break
    blRows.push(...(data as { email: string }[]))
    if (data.length < BATCH) break
    bFrom += BATCH
  }
  const unsubRows: { email: string }[] = []
  let uFrom = 0
  while (true) {
    const { data } = await service.from('newsletter_unsubscribes').select('email').range(uFrom, uFrom + BATCH - 1)
    if (!data || data.length === 0) break
    unsubRows.push(...(data as { email: string }[]))
    if (data.length < BATCH) break
    uFrom += BATCH
  }
  const blSet = new Set(blRows.map((r) => r.email.toLowerCase().trim()))
  const unsubSet = new Set(unsubRows.map((r) => r.email.toLowerCase().trim()))
  const contactIds = [...new Set(rows.map((r) => r.newsletter_subscribers?.contact_id).filter((x): x is string => !!x))]

  // Batch the contact lookup — `.in('id', uuids)` becomes a URL query param
  // and >~200 UUIDs breaks PostgREST's ~32 KB URL limit (returns partial /
  // empty), undercounting suppressed contacts and inflating eligible. Same
  // pattern fixed in v4.11.4 for from-contacts/email-send.
  const badContactIds = new Set<string>()
  const ID_BATCH = 200
  for (let i = 0; i < contactIds.length; i += ID_BATCH) {
    const slice = contactIds.slice(i, i + ID_BATCH)
    const { data: badContacts } = await service
      .from('contacts').select('id').in('id', slice).not('email_status', 'is', null)
    for (const c of (badContacts ?? []) as { id: string }[]) badContactIds.add(c.id)
  }

  const stats: Record<string, ListStat> = {}
  for (const r of rows) {
    const s = r.newsletter_subscribers
    if (!s) continue
    if (!stats[r.list_id]) stats[r.list_id] = { total: 0, eligible: 0 }
    stats[r.list_id].total += 1

    const em = s.email.toLowerCase().trim()
    const suppressed =
      s.unsubscribed_at ||
      blSet.has(em) ||
      unsubSet.has(em) ||
      (s.contact_id && badContactIds.has(s.contact_id))
    if (!suppressed) stats[r.list_id].eligible += 1
  }

  return NextResponse.json({ stats })
}
