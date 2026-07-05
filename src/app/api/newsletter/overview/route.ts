import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'

// Super-admin only (same guard pattern as /api/admin/hunter).
// Returns { error } on denial, else { email } of the authenticated super_admin.
async function requireSuperAdmin(): Promise<{ error: NextResponse } | { email: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const service = createServiceClient()
  const { data: profile } = await service.from('users').select('role').eq('email', user.email).single()
  if (profile?.role !== 'super_admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { email: user.email }
}

interface CampaignOverview {
  id: string
  title: string | null
  sent_at: string
  sent_count: number
  recipients: number
  opened: number
  clicked: number
  openRate: number | null
  clickRate: number | null
}

interface ListHealth {
  id: string
  name: string
  members: number
  nonOpeners180d: number
}

const BATCH = 1000
const norm = (email: string) => email.toLowerCase().trim()

// GET — newsletter overview aggregates:
//   campaigns — last 12 sent campaigns with open/click rates (newsletter_recipients
//               grouped by campaign_id via the get_campaign_engagement RPC)
//   lists     — per list: member count + 180-day non-opener count
//   totals    — subscribers / unsubscribed / blacklist
export async function GET() {
  const auth = await requireSuperAdmin(); if ('error' in auth) return auth.error
  const service = createServiceClient()

  // ── (a) last 12 sent campaigns ──
  const { data: campaignRows, error: campaignErr } = await service
    .from('newsletter_campaigns')
    .select('id, title, sent_at, sent_count')
    .not('sent_at', 'is', null)
    .order('sent_at', { ascending: false })
    .limit(12)
  if (campaignErr) return NextResponse.json({ error: campaignErr.message }, { status: 500 })

  // Open/click aggregates grouped by campaign_id. newsletter_recipients has RLS
  // with no SELECT policy — the SECURITY DEFINER RPC (granted to authenticated)
  // exposes only aggregate counts; call it with the session client.
  const engagementById = new Map<string, { recipients: number; opened: number; clicked: number }>()
  const campaignIds = (campaignRows ?? []).map((c) => c.id)
  if (campaignIds.length > 0) {
    const sessionClient = await createClient()
    const { data: eng } = await sessionClient.rpc('get_campaign_engagement', { p_campaign_ids: campaignIds })
    for (const e of (eng ?? []) as { campaign_id: string; recipients: number; opened: number; clicked: number }[]) {
      engagementById.set(e.campaign_id, { recipients: e.recipients, opened: e.opened, clicked: e.clicked })
    }
  }

  const campaigns: CampaignOverview[] = (campaignRows ?? []).map((c) => {
    const e = engagementById.get(c.id) ?? { recipients: 0, opened: 0, clicked: 0 }
    const denom = e.recipients || c.sent_count || 0
    return {
      id: c.id,
      title: c.title,
      sent_at: c.sent_at as string,
      sent_count: c.sent_count ?? 0,
      recipients: e.recipients,
      opened: e.opened,
      clicked: e.clicked,
      openRate: denom > 0 ? e.opened / denom : null,
      clickRate: denom > 0 ? e.clicked / denom : null,
    }
  })

  // ── (b) per-list health: member count + 180-day non-openers ──
  const { data: listRows, error: listErr } = await service
    .from('newsletter_lists')
    .select('id, name')
    .order('name')
  if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 })

  // Emails that opened ANY campaign within the last 180 days.
  const cutoff = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString()
  const openerEmails = new Set<string>()
  for (let from = 0; ; from += BATCH) {
    const { data, error } = await service
      .from('newsletter_recipients')
      .select('email')
      .gte('opened_at', cutoff)
      .order('id')
      .range(from, from + BATCH - 1)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data || data.length === 0) break
    for (const r of data as { email: string }[]) openerEmails.add(norm(r.email))
    if (data.length < BATCH) break
  }

  // All list memberships with subscriber email (paginated — PostgREST caps at 1000).
  type Membership = { list_id: string; newsletter_subscribers: { email: string } | null }
  const memberships: Membership[] = []
  for (let from = 0; ; from += BATCH) {
    const { data, error } = await service
      .from('newsletter_subscriber_lists')
      .select('list_id, newsletter_subscribers(email)')
      .order('list_id')
      .order('subscriber_id')
      .range(from, from + BATCH - 1)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data || data.length === 0) break
    memberships.push(...(data as unknown as Membership[]))
    if (data.length < BATCH) break
  }

  const healthById = new Map<string, { members: number; nonOpeners: number }>()
  for (const m of memberships) {
    let h = healthById.get(m.list_id)
    if (!h) {
      h = { members: 0, nonOpeners: 0 }
      healthById.set(m.list_id, h)
    }
    h.members++
    const email = m.newsletter_subscribers?.email
    if (!email || !openerEmails.has(norm(email))) h.nonOpeners++
  }

  const lists: ListHealth[] = (listRows ?? []).map((l) => {
    const h = healthById.get(l.id) ?? { members: 0, nonOpeners: 0 }
    return { id: l.id, name: l.name, members: h.members, nonOpeners180d: h.nonOpeners }
  })

  // ── (c) totals ──
  const [subsR, unsubR, blR] = await Promise.all([
    service.from('newsletter_subscribers').select('*', { count: 'exact', head: true }),
    service.from('newsletter_subscribers').select('*', { count: 'exact', head: true }).not('unsubscribed_at', 'is', null),
    service.from('newsletter_blacklist').select('*', { count: 'exact', head: true }),
  ])

  return NextResponse.json({
    campaigns,
    lists,
    totals: {
      subscribers: subsR.count ?? 0,
      unsubscribed: unsubR.count ?? 0,
      blacklist: blR.count ?? 0,
    },
  })
}

export const maxDuration = 300
