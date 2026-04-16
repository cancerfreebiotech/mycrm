import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// SendGrid merges custom_args into each event object at the top level
interface SGEvent {
  email: string
  timestamp: number
  event: string
  sg_message_id?: string
  ip?: string
  useragent?: string
  url?: string
  // from custom_args
  campaign_id?: string
  contact_id?: string
}

export async function POST(req: NextRequest) {
  // Verify shared secret in query param: ?secret=SENDGRID_WEBHOOK_SECRET
  const secret = req.nextUrl.searchParams.get('secret')
  if (!secret || secret !== process.env.SENDGRID_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let events: SGEvent[]
  try {
    events = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!Array.isArray(events) || events.length === 0) {
    return NextResponse.json({ ok: true, inserted: 0 })
  }

  const TRACKED = new Set(['delivered', 'open', 'click', 'bounce', 'spamreport', 'unsubscribe'])

  const rows = events
    .filter(e => e.email && e.timestamp && e.event && TRACKED.has(e.event))
    .map(e => ({
      campaign_id:   e.campaign_id  || null,
      contact_id:    e.contact_id   || null,
      email:         e.email,
      event:         e.event,
      occurred_at:   new Date(e.timestamp * 1000).toISOString(),
      sg_message_id: e.sg_message_id || null,
      ip:            e.ip           || null,
      user_agent:    e.useragent    || null,
      url:           e.url          || null,
    }))

  if (rows.length === 0) {
    return NextResponse.json({ ok: true, inserted: 0 })
  }

  const supabase = createServiceClient()
  const { error } = await supabase.from('email_events').insert(rows)

  if (error) {
    console.error('[email/webhook] insert error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, inserted: rows.length })
}
