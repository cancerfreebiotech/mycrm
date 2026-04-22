import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'

const SG_SEND_URL = 'https://api.sendgrid.com/v3/mail/send'

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

  if (body.testOnly) {
    if (!body.testEmail) return NextResponse.json({ error: 'testEmail required' }, { status: 400 })
    recipients = [{ id: 'test', email: body.testEmail, first_name: null, last_name: null, contact_id: null }]
  } else {
    const listIds = (campaign.list_ids as string[] | null) ?? []
    if (listIds.length === 0) return NextResponse.json({ error: 'campaign has no list_ids' }, { status: 400 })

    const { data: membership } = await service
      .from('newsletter_subscriber_lists')
      .select('subscriber_id')
      .in('list_id', listIds)
    const subIds = [...new Set((membership ?? []).map((r: { subscriber_id: string }) => r.subscriber_id))]
    if (subIds.length === 0) return NextResponse.json({ error: 'no subscribers in selected lists' }, { status: 400 })

    const { data: subs } = await service
      .from('newsletter_subscribers')
      .select('id, email, first_name, last_name, contact_id')
      .in('id', subIds)
      .is('unsubscribed_at', null)
    recipients = (subs ?? []) as Subscriber[]
  }

  if (recipients.length === 0) return NextResponse.json({ error: 'no valid recipients after filters' }, { status: 400 })

  // ── Send via SendGrid ──
  // SendGrid supports up to 1000 personalizations per API call
  const CHUNK = 1000
  let sent = 0
  const errors: string[] = []

  for (let i = 0; i < recipients.length; i += CHUNK) {
    const slice = recipients.slice(i, i + CHUNK)
    const personalizations = slice.map((r) => {
      const name = [r.first_name, r.last_name].filter(Boolean).join(' ').trim()
      return { to: [name ? { email: r.email, name } : { email: r.email }] }
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
    testOnly: !!body.testOnly,
  })
}
