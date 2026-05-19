import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getValidProviderToken } from '@/lib/graph-server'

// POST /api/admin/notify-release
//
// Called by the Claude Code skill after each git push to broadcast a release
// notification to MFA-enabled users. Sends as pohan.chen@cancerfree.io via
// Microsoft Graph (token auto-refreshed if expired).
//
// Auth: shared secret in `Authorization: Bearer ${RELEASE_NOTIFY_TOKEN}` header.
//
// Body:
//   version    — e.g. "6.4.7" (used in logs / response)
//   subject    — email subject (e.g. "myCRM 已更新到 v6.4.7")
//   bodyHtml   — full HTML body
//   dryRun?    — if true, returns recipient list without sending
//   testEmail? — if set, only sends to this single address (overrides recipient query)
const SENDER_EMAIL = 'pohan.chen@cancerfree.io'

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

  const supabase = createServiceClient()

  const { data: sender } = await supabase
    .from('users')
    .select('id, email')
    .eq('email', SENDER_EMAIL)
    .single()
  if (!sender) return NextResponse.json({ error: `sender ${SENDER_EMAIL} not found in users table` }, { status: 500 })

  let recipients: string[]
  if (testEmail) {
    recipients = [testEmail]
  } else {
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

  let accessToken: string
  try {
    accessToken = await getValidProviderToken(sender.id)
  } catch (e) {
    return NextResponse.json({
      error: e instanceof Error ? e.message : 'token refresh failed',
      hint: `${SENDER_EMAIL} needs to sign out and sign back in to refresh the Microsoft Graph token`,
    }, { status: 500 })
  }

  const errors: { email: string; error: string }[] = []
  let sent = 0
  for (const email of recipients) {
    const payload = {
      message: {
        subject,
        body: { contentType: 'HTML', content: bodyHtml },
        toRecipients: [{ emailAddress: { address: email } }],
      },
      saveToSentItems: 'true',
    }
    try {
      const res = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        errors.push({ email, error: err?.error?.message ?? `HTTP ${res.status}` })
      } else {
        sent++
      }
    } catch (e) {
      errors.push({ email, error: e instanceof Error ? e.message : 'unknown' })
    }
  }

  return NextResponse.json({
    version,
    sent,
    failed: errors.length,
    total: recipients.length,
    errors,
  })
}
