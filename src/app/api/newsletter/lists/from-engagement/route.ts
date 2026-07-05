import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'
import { hasFeature } from '@/lib/features'
import { getOrgContext, orgScopedClient, type OrgDb } from '@/lib/orgContext'

// POST /api/newsletter/lists/from-engagement
// Create a NEW newsletter list from a campaign's engagement segment.
//
// Body: { campaignId: string; segment: 'openers' | 'clickers' | 'non_openers' }
//
// Segments (over newsletter_recipients of the campaign):
//   openers     → opened_at IS NOT NULL
//   clickers    → clicked_at IS NOT NULL
//   non_openers → status = 'sent' AND opened_at IS NULL
//
// Auth + subscriber/list mechanics mirror from-contacts (auth gate, slugify,
// list-create-with-unique-key) and import-csv (upsert subscribers by email,
// link into list). Per the import-csv policy (2026-05-20), unsubscribed /
// blacklisted emails are STILL added to the list — they are only excluded at
// send time — so no suppression filtering happens here.

type Segment = 'openers' | 'clickers' | 'non_openers'

const SEGMENT_LABEL: Record<Segment, string> = {
  openers: '開信者',
  clickers: '點擊者',
  non_openers: '未開信',
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

  const ctx = await getOrgContext()
  const db: OrgDb = orgScopedClient(ctx)

  const body = (await req.json().catch(() => ({}))) as {
    campaignId?: string
    segment?: Segment
  }
  const campaignId = body.campaignId?.trim()
  const segment = body.segment
  if (!campaignId) return NextResponse.json({ error: 'campaignId required' }, { status: 400 })
  if (segment !== 'openers' && segment !== 'clickers' && segment !== 'non_openers') {
    return NextResponse.json({ error: 'invalid segment' }, { status: 400 })
  }

  const { data: campaign } = await db
    .from('newsletter_campaigns')
    .select('id, title, subject')
    .eq('id', campaignId)
    .maybeSingle()
  if (!campaign) return NextResponse.json({ error: 'campaign not found' }, { status: 404 })

  // Collect segment emails. Paginate — a campaign can have thousands of
  // recipients and PostgREST caps a single select at ~1000 rows.
  const PAGE_SIZE = 1000
  const emailSet = new Set<string>()
  for (let offset = 0; ; offset += PAGE_SIZE) {
    let q = db
      .from('newsletter_recipients')
      .select('email')
      .eq('campaign_id', campaignId)
      .range(offset, offset + PAGE_SIZE - 1)
    if (segment === 'openers') q = q.not('opened_at', 'is', null)
    else if (segment === 'clickers') q = q.not('clicked_at', 'is', null)
    else q = q.eq('status', 'sent').is('opened_at', null)
    const { data, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    for (const row of data ?? []) {
      const e = (row.email as string | null)?.trim().toLowerCase()
      if (e) emailSet.add(e)
    }
    if (!data || data.length < PAGE_SIZE) break
  }
  const emails = Array.from(emailSet)
  if (emails.length === 0) return NextResponse.json({ error: 'no_recipients' }, { status: 400 })

  // Create list with a unique key (append stamp on collision).
  const baseTitle = campaign.title?.trim() || campaign.subject?.trim() || 'Campaign'
  const name = `${baseTitle} — ${SEGMENT_LABEL[segment]}`
  let key = slugify(name)
  const { data: existing } = await db
    .from('newsletter_lists')
    .select('id')
    .eq('key', key)
    .maybeSingle()
  if (existing) key = `${key}-${Date.now().toString(36)}`

  const { data: created, error: createErr } = await db
    .from('newsletter_lists')
    .insert({ key, name, description: null })
    .select('id, key, name')
    .single()
  if (createErr || !created) {
    return NextResponse.json({ error: createErr?.message ?? 'failed to create list' }, { status: 500 })
  }

  // Upsert subscribers by email (one row per unique email; existing preserved).
  // The reverse trigger `link_subscriber_to_contact` backfills contact_id.
  const INSERT_BATCH = 500
  const QUERY_BATCH = 200
  const errors: string[] = []
  const source = `engagement_${segment}`
  const subscriberPayload = emails.map((email) => ({ email, source }))
  for (let i = 0; i < subscriberPayload.length; i += INSERT_BATCH) {
    const chunk = subscriberPayload.slice(i, i + INSERT_BATCH)
    const { error } = await db
      .from('newsletter_subscribers')
      .upsert(chunk, { onConflict: 'org_id,email', ignoreDuplicates: true })
    if (error) errors.push(`upsert subscribers batch ${i / INSERT_BATCH}: ${error.message}`)
  }

  // Re-fetch subscriber IDs by email to build link rows.
  const subscriberIdByEmail = new Map<string, string>()
  for (let i = 0; i < emails.length; i += QUERY_BATCH) {
    const batch = emails.slice(i, i + QUERY_BATCH)
    const { data } = await db
      .from('newsletter_subscribers')
      .select('id, email')
      .in('email', batch)
    for (const s of data ?? []) {
      if (s.email) subscriberIdByEmail.set((s.email as string).toLowerCase(), s.id as string)
    }
  }

  const seenSubIds = new Set<string>()
  const linkRows: { list_id: string; subscriber_id: string }[] = []
  for (const email of emails) {
    const sid = subscriberIdByEmail.get(email)
    if (!sid || seenSubIds.has(sid)) continue
    seenSubIds.add(sid)
    linkRows.push({ list_id: created.id, subscriber_id: sid })
  }

  let count = 0
  for (let i = 0; i < linkRows.length; i += INSERT_BATCH) {
    const chunk = linkRows.slice(i, i + INSERT_BATCH)
    const { error } = await db.from('newsletter_subscriber_lists').insert(chunk)
    if (error) {
      errors.push(`insert link rows batch ${i / INSERT_BATCH}: ${error.message}`)
      continue
    }
    count += chunk.length
  }

  return NextResponse.json({
    listId: created.id,
    name: created.name,
    count,
    errors: errors.length > 0 ? errors : undefined,
  })
}

export const maxDuration = 300
