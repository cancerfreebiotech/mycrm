import { NextRequest, NextResponse } from 'next/server'

// Sends a fake "open" event to our own webhook to verify it's working end-to-end.
// Uses the SENDGRID_WEBHOOK_SECRET env var so the webhook auth passes.
export async function POST(req: NextRequest) {
  const { campaignId } = await req.json()

  const secret = process.env.SENDGRID_WEBHOOK_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'SENDGRID_WEBHOOK_SECRET not set' }, { status: 500 })
  }

  const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://crm.cancerfree.io'
  const webhookUrl = `${APP_URL}/api/email/webhook?secret=${encodeURIComponent(secret)}`

  const fakeEvent = [{
    email: 'webhook-test@cancerfree.io',
    timestamp: Math.floor(Date.now() / 1000),
    event: 'open',
    sg_message_id: 'test-msg-id',
    campaign_id: campaignId ?? null,
    contact_id: null,
  }]

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fakeEvent),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      return NextResponse.json({ ok: true, inserted: data.inserted })
    }
    return NextResponse.json({ ok: false, error: data.error ?? `HTTP ${res.status}` }, { status: 502 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
