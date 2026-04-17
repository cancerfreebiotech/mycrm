import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// SendGrid Email Activity API — requires "Email Activity" feature enabled on account
// Docs: https://docs.sendgrid.com/api-reference/e-mail-activity-feed/filter-messages-by-query

const SG_MESSAGES_URL = 'https://api.sendgrid.com/v3/messages'

interface SGMessage {
  msg_id: string
  to_email: string
  from_email: string
  subject: string
  status: string        // 'delivered' | 'not_delivered' | 'processing'
  opens_count: number
  clicks_count: number
  last_event_time: string  // ISO datetime
  unique_args?: string  // JSON string of custom_args
}

export async function POST(req: NextRequest) {
  const { campaignId } = await req.json()
  if (!campaignId) {
    return NextResponse.json({ error: 'campaignId required' }, { status: 400 })
  }

  const sgKey = process.env.SENDGRID_API_KEY
  if (!sgKey) {
    return NextResponse.json({ error: 'SendGrid not configured' }, { status: 500 })
  }

  const supabase = createServiceClient()

  // Get all contacts that received this campaign
  const { data: logs } = await supabase
    .from('interaction_logs')
    .select('contact_id')
    .eq('campaign_id', campaignId)
    .eq('type', 'email')

  if (!logs?.length) {
    return NextResponse.json({ error: 'No interaction logs found for campaign' }, { status: 404 })
  }

  const contactIds = logs.map(l => l.contact_id)
  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, email')
    .in('id', contactIds)

  const emailToContactId = new Map<string, string>(
    (contacts ?? []).map(c => [c.email!.toLowerCase(), c.id])
  )

  // Query SendGrid Activity API filtered by campaign_id in unique_args
  const query = `unique_args["campaign_id"]="${campaignId}"`
  const url = `${SG_MESSAGES_URL}?limit=1000&query=${encodeURIComponent(query)}`

  let messages: SGMessage[] = []
  try {
    const sgRes = await fetch(url, {
      headers: { Authorization: `Bearer ${sgKey}`, 'Content-Type': 'application/json' },
    })
    if (!sgRes.ok) {
      const err = await sgRes.json().catch(() => ({}))
      return NextResponse.json({ error: 'SendGrid Activity API error', detail: err, status: sgRes.status }, { status: 502 })
    }
    const body = await sgRes.json()
    messages = body.messages ?? []
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }

  if (messages.length === 0) {
    return NextResponse.json({ ok: true, inserted: 0, messages: 0, note: 'SendGrid returned 0 messages — check if Email Activity feature is enabled on your account' })
  }

  // Build event rows from SendGrid message summaries
  const rows: Array<{
    campaign_id: string
    contact_id: string | null
    email: string
    event: string
    occurred_at: string
    sg_message_id: string | null
  }> = []

  for (const msg of messages) {
    const email = msg.to_email?.toLowerCase() ?? ''
    const contactId = emailToContactId.get(email) ?? null
    const eventTime = msg.last_event_time ?? new Date().toISOString()

    // Delivered (status delivered, opened, clicked all mean it arrived)
    if (['delivered'].includes(msg.status)) {
      rows.push({ campaign_id: campaignId, contact_id: contactId, email, event: 'delivered', occurred_at: eventTime, sg_message_id: msg.msg_id ?? null })
    }

    // Open
    if ((msg.opens_count ?? 0) > 0) {
      rows.push({ campaign_id: campaignId, contact_id: contactId, email, event: 'open', occurred_at: eventTime, sg_message_id: msg.msg_id ?? null })
    }

    // Click
    if ((msg.clicks_count ?? 0) > 0) {
      rows.push({ campaign_id: campaignId, contact_id: contactId, email, event: 'click', occurred_at: eventTime, sg_message_id: msg.msg_id ?? null })
    }

    // Bounce / not delivered
    if (msg.status === 'not_delivered') {
      rows.push({ campaign_id: campaignId, contact_id: contactId, email, event: 'bounce', occurred_at: eventTime, sg_message_id: msg.msg_id ?? null })
    }
  }

  if (rows.length === 0) {
    return NextResponse.json({ ok: true, inserted: 0, messages: messages.length, note: 'All messages are still processing — try again later' })
  }

  // Upsert (ignore duplicates by checking existing)
  const { data: existing } = await supabase
    .from('email_events')
    .select('email, event')
    .eq('campaign_id', campaignId)

  const existingSet = new Set((existing ?? []).map(e => `${e.email}::${e.event}`))
  const newRows = rows.filter(r => !existingSet.has(`${r.email}::${r.event}`))

  if (newRows.length === 0) {
    return NextResponse.json({ ok: true, inserted: 0, messages: messages.length, note: 'All events already exist' })
  }

  const { error } = await supabase.from('email_events').insert(newRows)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, inserted: newRows.length, messages: messages.length })
}
