import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { logAdminAction } from '@/lib/adminAudit'

// POST /api/admin/notify-release
//
// Called by the Claude Code notify-release skill after each git push to
// broadcast a release notification to MFA-enabled users. Sends via SendGrid
// (static API key — no OAuth token expiry to worry about).
//
// Auth: shared secret in `Authorization: Bearer ${RELEASE_NOTIFY_TOKEN}` header.
//
// Body:
//   version    — e.g. "6.4.7" (used in logs / response)
//   subject    — email subject (e.g. "myCRM 已更新到 v6.4.7")
//   bodyHtml   — full HTML body
//   dryRun?    — if true, returns recipient list without sending
//   testEmail? — if set, only sends to this single address (overrides MFA query)
const SG_SEND_URL = 'https://api.sendgrid.com/v3/mail/send'
const REPLY_TO_EMAIL = 'pohan.chen@cancerfree.io'
const FROM_NAME = 'Po-Han Chen (myCRM)'

interface RequestBody {
  version?: string
  subject?: string
  bodyHtml?: string
  dryRun?: boolean
  testEmail?: string
}

export async function POST(req: Request) {
  const expectedToken = process.env.RELEASE_NOTIFY_TOKEN
  if (!expectedToken) {
    return NextResponse.json({ error: 'RELEASE_NOTIFY_TOKEN not configured' }, { status: 500 })
  }
  const auth = req.headers.get('authorization') ?? ''
  const provided = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (provided !== expectedToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await req.json().catch(() => ({}))) as RequestBody
  const { version, subject, bodyHtml, dryRun, testEmail } = body
  if (!version || !subject || !bodyHtml) {
    return NextResponse.json({ error: 'version, subject, bodyHtml are required' }, { status: 400 })
  }

  const sgKey = process.env.SENDGRID_API_KEY
  const fromEmail = process.env.SENDGRID_FROM_EMAIL
  if (!sgKey || !fromEmail) {
    return NextResponse.json({ error: 'SendGrid not configured (SENDGRID_API_KEY / SENDGRID_FROM_EMAIL)' }, { status: 500 })
  }

  let recipients: string[]
  if (testEmail) {
    recipients = [testEmail]
  } else {
    const supabase = createServiceClient()
    const { data: mfaRows, error: rpcErr } = await supabase.rpc('get_users_mfa_status')
    if (rpcErr) return NextResponse.json({ error: `mfa lookup failed: ${rpcErr.message}` }, { status: 500 })
    recipients = ((mfaRows ?? []) as { email: string; has_mfa: boolean }[])
      .filter((r) => r.has_mfa && r.email)
      .map((r) => r.email)
  }

  if (recipients.length === 0) {
    return NextResponse.json({ version, sent: 0, failed: 0, recipients: [], note: 'no MFA-enabled recipients' })
  }

  if (dryRun) {
    return NextResponse.json({ version, dryRun: true, recipients, count: recipients.length })
  }

  // SendGrid: one personalization per recipient so each To: only contains
  // that recipient (no BCC leak). Capped at 1000 per call; we have ≤ 8.
  const payload = {
    from: { email: fromEmail, name: FROM_NAME },
    reply_to: { email: REPLY_TO_EMAIL },
    subject,
    content: [{ type: 'text/html', value: bodyHtml }],
    personalizations: recipients.map((email) => ({ to: [{ email }] })),
  }

  const res = await fetch(SG_SEND_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${sgKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    return NextResponse.json({
      version,
      sent: 0,
      failed: recipients.length,
      total: recipients.length,
      error: `SendGrid ${res.status}: ${errText.slice(0, 500)}`,
    }, { status: 502 })
  }

  // Auth is a shared RELEASE_NOTIFY_TOKEN (no user identity) → actor is unknown.
  await logAdminAction(createServiceClient(), {
    actorEmail: 'unknown',
    action: 'notify_release',
    target: version,
    detail: { recipients },
  })

  return NextResponse.json({
    version,
    sent: recipients.length,
    failed: 0,
    total: recipients.length,
  })
}
