import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'
import { createHmac } from 'crypto'

const SG_SEND_URL = 'https://api.sendgrid.com/v3/mail/send'

// Sign a JWT-like token for per-recipient unsubscribe link. Verified by
// /api/newsletter/unsubscribe which shares the same secret + algorithm.
function signUnsubToken(email: string, campaignId: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(
    JSON.stringify({ email, campaignId, exp: Math.floor(Date.now() / 1000) + 365 * 24 * 3600 })
  ).toString('base64url')
  const secret = process.env.NEXTAUTH_SECRET ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
  const sig = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url')
  return `${header}.${payload}.${sig}`
}

interface Subscriber {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  contact_id: string | null
}

// POST — send this campaign via SendGrid to everyone in its list_ids
//
// Strategy:
//   - Gather subscribers from newsletter_subscriber_lists (filter unsubscribed_at IS NULL)
//   - Chunk into groups of 1000 (SendGrid personalizations cap)
//   - One SendGrid API call per chunk, each recipient gets their own To: header
//   - After send, write interaction_logs for subscribers with linked contact_id
//     (type=email, send_method='sendgrid', campaign_id=this campaign).
//     These logs are EXCLUDED from last_activity_at by our existing filter.
//   - Update campaign.sent_count / sent_at / status='sent'
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: campaignId } = await params
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const { data: me } = await service.from('users').select('id').ilike('email', authUser.email).maybeSingle()
  const userId = me?.id ?? null

  // Optional: allow overrides in body (testOnly flag to send only to self)
  const body = (await req.json().catch(() => ({}))) as { testOnly?: boolean; testEmail?: string }

  const { data: campaign } = await service
    .from('newsletter_campaigns')
    .select('id, subject, preview_text, content_html, list_ids, sent_at')
    .eq('id', campaignId)
    .maybeSingle()
  if (!campaign) return NextResponse.json({ error: 'campaign not found' }, { status: 404 })
  if (!campaign.subject || !campaign.content_html) {
    return NextResponse.json({ error: 'campaign missing subject or content_html' }, { status: 400 })
  }

  const sgKey = process.env.SENDGRID_API_KEY
  const fromEmail = process.env.SENDGRID_FROM_EMAIL
  const fromName = process.env.SENDGRID_FROM_NAME ?? 'CancerFree Biotech'
  if (!sgKey || !fromEmail) {
    return NextResponse.json({ error: 'SendGrid not configured (SENDGRID_API_KEY / SENDGRID_FROM_EMAIL)' }, { status: 500 })
  }

  // ── Gather recipients ──
  let recipients: Subscriber[] = []
  let invalidEmails: string[] = []

  if (body.testOnly) {
    if (!body.testEmail) return NextResponse.json({ error: 'testEmail required' }, { status: 400 })
    recipients = [{ id: 'test', email: body.testEmail, first_name: null, last_name: null, contact_id: null }]
  } else {
    const listIds = (campaign.list_ids as string[] | null) ?? []
    if (listIds.length === 0) return NextResponse.json({ error: 'campaign has no list_ids' }, { status: 400 })

    // Supabase default LIMIT is 1000 — paginate to grab the full membership.
    // For our scale (lists up to ~10k) this is fine; bigger lists would want
    // a server-side aggregation but we're far from that.
    const PAGE = 1000
    const allMembership: { subscriber_id: string }[] = []
    for (let from = 0; ; from += PAGE) {
      const { data: page } = await service
        .from('newsletter_subscriber_lists')
        .select('subscriber_id')
        .in('list_id', listIds)
        .range(from, from + PAGE - 1)
      if (!page || page.length === 0) break
      allMembership.push(...(page as { subscriber_id: string }[]))
      if (page.length < PAGE) break
    }
    const subIds = [...new Set(allMembership.map((r) => r.subscriber_id))]
    if (subIds.length === 0) return NextResponse.json({ error: 'no subscribers in selected lists' }, { status: 400 })

    // PostgREST URL length cap (~32KB). Large lists (1000+ UUIDs/emails) in
    // a single .in() get silently truncated → empty result. Chunk every
    // .in() lookup to BATCH (200) to stay under the URL limit.
    const BATCH = 200
    async function chunkedIn<T>(
      table: string,
      select: string,
      column: string,
      values: string[],
      extraFilter?: (q: ReturnType<ReturnType<typeof service.from>['select']>) => unknown
    ): Promise<T[]> {
      const out: T[] = []
      for (let i = 0; i < values.length; i += BATCH) {
        let q = service.from(table).select(select).in(column, values.slice(i, i + BATCH))
        if (extraFilter) q = extraFilter(q) as typeof q
        const { data } = await q
        if (data) out.push(...(data as T[]))
      }
      return out
    }

    const rawSubs = await chunkedIn<Subscriber>(
      'newsletter_subscribers',
      'id, email, first_name, last_name, contact_id',
      'id',
      subIds,
      (q) => (q as unknown as { is: (col: string, v: null) => unknown }).is('unsubscribed_at', null)
    )

    // Filter out suppressed emails.
    // Sources checked (in priority order):
    //   1. contacts.email_status ∈ {bounced, invalid, unsubscribed} — canonical for CRM contacts
    //   2. newsletter_blacklist — for non-contact emails (external subscribers)
    //   3. newsletter_unsubscribes — global unsubscribe tracking
    const emails = [...new Set(rawSubs.map((s) => s.email.toLowerCase().trim()))]
    const contactIds = [...new Set(rawSubs.map((s) => s.contact_id).filter((x): x is string => !!x))]

    const [bl, unsubs, badContacts] = await Promise.all([
      chunkedIn<{ email: string }>('newsletter_blacklist', 'email', 'email', emails),
      chunkedIn<{ email: string }>('newsletter_unsubscribes', 'email', 'email', emails),
      contactIds.length > 0
        ? chunkedIn<{ id: string }>('contacts', 'id', 'id', contactIds, (q) =>
            (q as unknown as { not: (col: string, op: string, v: null) => unknown }).not(
              'email_status',
              'is',
              null
            )
          )
        : Promise.resolve([] as { id: string }[]),
    ])

    const suppressed = new Set<string>([
      ...bl.map((r) => r.email.toLowerCase().trim()),
      ...unsubs.map((r) => r.email.toLowerCase().trim()),
    ])
    const suppressedContactIds = new Set<string>(badContacts.map((c) => c.id))

    // Email syntax check — SendGrid rejects the WHOLE chunk if any single
    // address in personalizations is malformed (e.g. has whitespace, missing
    // domain). Filter these out client-side and report them so the user can
    // clean up the source data.
    const VALID_EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/

    recipients = rawSubs.filter((r) => {
      const norm = r.email.toLowerCase().trim()
      if (suppressed.has(norm)) return false
      if (r.contact_id && suppressedContactIds.has(r.contact_id)) return false
      if (!VALID_EMAIL.test(r.email.trim())) {
        invalidEmails.push(r.email)
        return false
      }
      return true
    })

    if (invalidEmails.length > 0) {
      console.warn('[newsletter send] dropped invalid emails', invalidEmails)
    }
  }

  if (recipients.length === 0) return NextResponse.json({ error: 'no valid recipients after filters' }, { status: 400 })

  // ── Send via SendGrid ──
  // SendGrid supports up to 1000 personalizations per API call
  const CHUNK = 1000
  let sent = 0
  const errors: string[] = []

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://crm.cancerfree.io'
  for (let i = 0; i < recipients.length; i += CHUNK) {
    const slice = recipients.slice(i, i + CHUNK)
    const personalizations = slice.map((r) => {
      const name = [r.first_name, r.last_name].filter(Boolean).join(' ').trim()
      const token = signUnsubToken(r.email, campaignId)
      const unsubUrl = `${baseUrl}/unsubscribe?token=${token}`
      return {
        to: [name ? { email: r.email, name } : { email: r.email }],
        // SendGrid per-personalization substitutions: keys must match exactly
        // in the body/subject. Newsletter HTML from listmonk uses {{{unsubscribe}}}
        // and {{{unsubscribe_preferences}}} — map both to our mycrm unsubscribe URL.
        substitutions: {
          '{{{unsubscribe}}}': unsubUrl,
          '{{{unsubscribe_preferences}}}': unsubUrl,
        },
      }
    })
    const payload = {
      from: { email: fromEmail, name: fromName },
      subject: campaign.subject,
      content: [{ type: 'text/html', value: campaign.content_html }],
      personalizations,
      // Best-effort preview text via SendGrid custom_args; also set subject summary
      ...(campaign.preview_text ? { headers: { 'X-Preview-Text': campaign.preview_text } } : {}),
    }
    try {
      const res = await fetch(SG_SEND_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${sgKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const errText = await res.text()
        errors.push(`chunk ${i}: ${res.status} ${errText.slice(0, 200)}`)
        continue
      }
      sent += slice.length
    } catch (e) {
      errors.push(`chunk ${i}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // ── Write interaction_logs for linked subscribers ──
  // send_method='sendgrid' keeps these out of last_activity_at by existing filter.
  if (!body.testOnly && sent > 0) {
    const linkedContactIds = recipients
      .filter((r) => r.contact_id)
      .map((r) => r.contact_id as string)
    if (linkedContactIds.length > 0) {
      const logRows = linkedContactIds.map((cid) => ({
        contact_id: cid,
        type: 'email' as const,
        direction: 'outbound' as const,
        content: `電子報：${campaign.subject}`,
        email_subject: campaign.subject,
        email_body: campaign.content_html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 2000),
        created_by: userId,
        campaign_id: campaignId,
        send_method: 'sendgrid' as const,
      }))
      for (let i = 0; i < logRows.length; i += 500) {
        await service.from('interaction_logs').insert(logRows.slice(i, i + 500))
      }
    }
  }

  // ── Update campaign state ──
  if (!body.testOnly) {
    await service
      .from('newsletter_campaigns')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        sent_count: sent,
        total_recipients: recipients.length,
      })
      .eq('id', campaignId)
  }

  return NextResponse.json({
    ok: errors.length === 0,
    sent,
    total: recipients.length,
    errors,
    invalidEmails,
    testOnly: !!body.testOnly,
  })
}
