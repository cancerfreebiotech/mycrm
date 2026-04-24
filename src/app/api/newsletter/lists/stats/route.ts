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

  const [{ data: memberships }, { data: blacklist }, { data: unsubs }] = await Promise.all([
    service
      .from('newsletter_subscriber_lists')
      .select('list_id, newsletter_subscribers(id, email, contact_id, unsubscribed_at)'),
    service.from('newsletter_blacklist').select('email'),
    service.from('newsletter_unsubscribes').select('email'),
  ])

  const blSet = new Set(((blacklist ?? []) as { email: string }[]).map((r) => r.email.toLowerCase().trim()))
  const unsubSet = new Set(((unsubs ?? []) as { email: string }[]).map((r) => r.email.toLowerCase().trim()))

  // Collect contact IDs to look up email_status
  type Membership = { list_id: string; newsletter_subscribers: { id: string; email: string; contact_id: string | null; unsubscribed_at: string | null } | null }
  const rows = (memberships ?? []) as unknown as Membership[]
  const contactIds = [...new Set(rows.map((r) => r.newsletter_subscribers?.contact_id).filter((x): x is string => !!x))]

  const badContactIds = new Set<string>()
  if (contactIds.length > 0) {
    const { data: badContacts } = await service
      .from('contacts').select('id').in('id', contactIds).not('email_status', 'is', null)
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
