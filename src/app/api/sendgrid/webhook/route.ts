import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { createHmac } from 'crypto'

// Verify SendGrid webhook signature
function verifySignature(req: NextRequest, rawBody: string): boolean {
  const secret = process.env.SENDGRID_WEBHOOK_SECRET
  if (!secret) return true // skip verification if not configured
  const signature = req.headers.get('x-twilio-email-event-webhook-signature') ?? ''
  const timestamp = req.headers.get('x-twilio-email-event-webhook-timestamp') ?? ''
  const payload = timestamp + rawBody
  const expected = createHmac('sha256', secret).update(payload).digest('base64')
  return signature === expected
}

interface SendGridEvent {
  event: 'open' | 'click' | 'unsubscribe' | 'bounce' | 'spamreport' | string
  email: string
  timestamp: number
  'X-Campaign-Id'?: string
  'X-Recipient-Id'?: string
  bounce_classification?: string
  type?: string // hard / soft for bounce
  url?: string
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()

  if (!verifySignature(req, rawBody)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let events: SendGridEvent[]
  try {
    events = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const supabase = createServiceClient()

  for (const ev of events) {
    const recipientId = ev['X-Recipient-Id']

    switch (ev.event) {
      case 'open':
        if (recipientId) {
          await supabase
            .from('newsletter_recipients')
            .update({ opened_at: new Date(ev.timestamp * 1000).toISOString() })
            .eq('id', recipientId)
            .is('opened_at', null) // only set first open
        }
        break

      case 'click':
        if (recipientId) {
          await supabase
            .from('newsletter_recipients')
            .update({ clicked_at: new Date(ev.timestamp * 1000).toISOString() })
            .eq('id', recipientId)
            .is('clicked_at', null) // only set first click
        }
        break

      case 'unsubscribe': {
        // Find contact by email
        const { data: contact } = await supabase
          .from('contacts')
          .select('id')
          .eq('email', ev.email)
          .maybeSingle()

        await supabase
          .from('newsletter_unsubscribes')
          .upsert(
            { email: ev.email, contact_id: contact?.id ?? null, source: 'webhook' },
            { onConflict: 'email' }
          )
        break
      }

      case 'bounce':
        if (ev.type === 'bounce') {
          // Hard bounce → blacklist
          const { data: contact } = await supabase
            .from('contacts')
            .select('id')
            .eq('email', ev.email)
            .maybeSingle()

          await supabase
            .from('newsletter_blacklist')
            .upsert(
              { email: ev.email, contact_id: contact?.id ?? null, reason: 'hard_bounce' },
              { onConflict: 'email' }
            )
        }
        if (recipientId) {
          await supabase
            .from('newsletter_recipients')
            .update({ status: 'failed' })
            .eq('id', recipientId)
        }
        break

      case 'spamreport': {
        const { data: contact } = await supabase
          .from('contacts')
          .select('id')
          .eq('email', ev.email)
          .maybeSingle()

        await supabase
          .from('newsletter_blacklist')
          .upsert(
            { email: ev.email, contact_id: contact?.id ?? null, reason: 'spam' },
            { onConflict: 'email' }
          )
        break
      }
    }
  }

  return NextResponse.json({ ok: true })
}
