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

type SuppressStatus =
  | 'bounced'
  | 'invalid'
  | 'unsubscribed'
  | 'deferred'
  | 'mailbox_full'
  | 'sender_blocked'
  | 'recipient_blocked'

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
      .upsert({ email: normalized, reason, status }, { onConflict: 'email' })
  }
}

// Classify a SendGrid event reason (from `bounce`/`dropped` events) into one of
// the 7 email_status categories. Heuristic — order matters: more specific
// reasons checked before generic ones.
function classifyByReason(reason: string): SuppressStatus {
  const r = reason.toLowerCase()

  // ── Mailbox quota / inactive ──
  if (r.includes('mailbox full') || r.includes('over quota') ||
      r.includes('out of storage') || r.includes('quota exceeded') ||
      r.includes('overquota') ||
      r.match(/5\.2\.[12]/)) return 'mailbox_full'

  // ── Sender side issues (DKIM / spam trap / sender auth) ──
  if (r.includes('dkim') || r.includes('spamtrap') || r.includes('spam trap') ||
      r.includes('sendernotauthenticated') || r.includes('not authenticated') ||
      r.includes('fake sender') || r.includes('unsolicited mail') ||
      r.includes('5.7.134') || r.includes('5.7.26') ||
      (r.includes('spam') && !r.includes('spamreport'))) return 'sender_blocked'

  // ── Recipient policy / org blocks ──
  if (r.includes('relay access denied') || r.includes('relay denied') ||
      r.includes('not permitted to relay') ||
      r.includes('transport.rules') || r.includes('transport rules') ||
      r.includes('rejectmessage') ||
      r.includes('hop count') || r.includes('mail loop') || r.includes('delivery loop') ||
      r.includes('restrictedtorecipientspermission') ||
      r.includes('access denied') ||
      r.includes('5.7.129') || r.includes('5.4.14')) return 'recipient_blocked'

  // ── Temporary network/server errors ──
  if (r.includes('i/o timeout') || r.includes('io timeout') ||
      r.includes('no route to host') || r.includes('connection reset') ||
      r.includes('connection refused') || r.includes('error dialing') ||
      r.includes('service unavailable') || r.match(/5\.0\.0/) ||
      r.includes('try again later')) return 'deferred'

  // ── Unsubscribed (SendGrid suppression) ──
  if (r.includes('unsubscribe')) return 'unsubscribed'

  // ── Invalid (no MX / domain doesn't exist) ──
  if (r.includes('mx info') || r.includes('mx record') ||
      r.includes('unrecognized address')) return 'invalid'

  // ── Permanent address bounces (5.1.1 user unknown / no such user) ──
  if (r.match(/5\.1\.1/) || r.match(/5\.5\.0/) ||
      r.includes('user unknown') || r.includes('does not exist') ||
      r.includes('no such user') || r.includes('recipient not found') ||
      r.includes('bounced address')) return 'bounced'

  // Unknown / unclassified → conservative: bounced
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

      case 'bounce': {
        // type='bounce' = hard bounce; type='blocked' = SMTP-level block
        // Classify by reason (SMTP response), fallback by event type
        const reason = ev.reason ?? ev.bounce_classification ?? ''
        const status = reason
          ? classifyByReason(reason)
          : (ev.type === 'blocked' ? 'recipient_blocked' : 'bounced')
        await markSuppressed(supabase, ev.email, status, `${ev.type ?? 'bounce'}: ${reason}`.slice(0, 200))
        if (recipientId) {
          await supabase.from('newsletter_recipients').update({ status: 'failed' }).eq('id', recipientId)
        }
        break
      }

      case 'dropped': {
        // Pre-send drop — classify by reason
        const reason = ev.reason ?? 'dropped'
        const status = classifyByReason(reason)
        await markSuppressed(supabase, ev.email, status, `dropped: ${reason}`.slice(0, 200))
        if (recipientId) {
          await supabase.from('newsletter_recipients').update({ status: 'failed' }).eq('id', recipientId)
        }
        break
      }

      case 'spamreport':
        // Recipient marked as spam — sender-side reputation issue
        await markSuppressed(supabase, ev.email, 'sender_blocked', 'spam_report')
        break
    }
  }

  return NextResponse.json({ ok: true })
}
