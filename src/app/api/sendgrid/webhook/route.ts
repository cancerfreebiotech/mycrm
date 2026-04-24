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
  event: 'open' | 'click' | 'unsubscribe' | 'bounce' | 'dropped' | 'spamreport' | string
  email: string
  timestamp: number
  'X-Campaign-Id'?: string
  'X-Recipient-Id'?: string
  bounce_classification?: string
  type?: string // hard / soft for bounce
  reason?: string // drop reason (e.g. "Bounced Address", "Invalid")
  url?: string
}

type SuppressStatus = 'bounced' | 'invalid' | 'unsubscribed'

// Canonical suppression update: for CRM contacts → update contacts.email_status;
// for non-CRM emails → write to newsletter_blacklist (or unsubscribes).
// Mirrors the policy enforced in /api/sendgrid/import-suppressions (v4.2.1).
async function markSuppressed(
  supabase: ReturnType<typeof createServiceClient>,
  email: string,
  status: SuppressStatus,
  reason: string,
) {
  const normalized = email.toLowerCase().trim()
  const { data: contact } = await supabase
    .from('contacts')
    .select('id')
    .eq('email', normalized)
    .is('deleted_at', null)
    .maybeSingle()

  if (contact) {
    await supabase.from('contacts').update({ email_status: status }).eq('id', contact.id)
    return
  }

  if (status === 'unsubscribed') {
    await supabase
      .from('newsletter_unsubscribes')
      .upsert({ email: normalized, source: 'webhook', reason }, { onConflict: 'email' })
  } else {
    await supabase
      .from('newsletter_blacklist')
      .upsert({ email: normalized, reason }, { onConflict: 'email' })
  }
}

// Classify a SendGrid "dropped" event's reason into a suppression status.
// SendGrid drop reasons include:
//   "Bounced Address" / "Invalid" / "Spam Reported" / "Unsubscribed Address" /
//   "Invalid SMTPAPI header" / "Recipient List over Package Quota"
function classifyDropReason(reason: string): SuppressStatus | null {
  const r = reason.toLowerCase()
  if (r.includes('unsubscribe')) return 'unsubscribed'
  if (r.includes('invalid')) return 'invalid'
  if (r.includes('bounce') || r.includes('spam')) return 'bounced'
  // Unknown drop reason → conservative: mark as bounced
  return 'bounced'
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
            .is('opened_at', null)
        }
        break

      case 'click':
        if (recipientId) {
          await supabase
            .from('newsletter_recipients')
            .update({ clicked_at: new Date(ev.timestamp * 1000).toISOString() })
            .eq('id', recipientId)
            .is('clicked_at', null)
        }
        break

      case 'unsubscribe':
        await markSuppressed(supabase, ev.email, 'unsubscribed', 'SendGrid webhook unsubscribe')
        break

      case 'bounce':
        if (ev.type === 'bounce') {
          // Hard bounce
          await markSuppressed(supabase, ev.email, 'bounced', `hard_bounce: ${ev.bounce_classification ?? ''}`.slice(0, 200))
        }
        if (recipientId) {
          await supabase.from('newsletter_recipients').update({ status: 'failed' }).eq('id', recipientId)
        }
        break

      case 'dropped': {
        // Pre-send drop — SendGrid refused to deliver. Reasons include
        // bounced address, invalid format, spam, prior unsubscribe etc.
        const reason = ev.reason ?? 'dropped'
        const status = classifyDropReason(reason)
        if (status) {
          await markSuppressed(supabase, ev.email, status, `dropped: ${reason}`.slice(0, 200))
        }
        if (recipientId) {
          await supabase.from('newsletter_recipients').update({ status: 'failed' }).eq('id', recipientId)
        }
        break
      }

      case 'spamreport':
        await markSuppressed(supabase, ev.email, 'bounced', 'spam_report')
        break
    }
  }

  return NextResponse.json({ ok: true })
}
