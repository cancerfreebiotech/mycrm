import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { createHmac } from 'crypto'
import { emailTokenSecret } from '@/lib/emailTokenSecret'

function verifyToken(token: string): { email: string; campaignId: string } | null {
  try {
    const [headerB64, payloadB64, sig] = token.split('.')
    if (!headerB64 || !payloadB64 || !sig) return null
    const secret = emailTokenSecret()
    const expected = createHmac('sha256', secret).update(`${headerB64}.${payloadB64}`).digest('base64url')
    if (sig !== expected) return null
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString())
    if (payload.exp && Date.now() / 1000 > payload.exp) return null
    return { email: payload.email, campaignId: payload.campaignId }
  } catch {
    return null
  }
}

// GET — preference center data: the verified subscriber's list memberships.
// Email comes from the HMAC-verified token, never from user input.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') ?? ''
  if (!token) return NextResponse.json({ error: '缺少 token' }, { status: 400 })

  const decoded = verifyToken(token)
  if (!decoded) return NextResponse.json({ error: '無效或已過期的連結' }, { status: 400 })

  const supabase = createServiceClient()

  const { data: subscriber } = await supabase
    .from('newsletter_subscribers')
    .select('id')
    .eq('email', decoded.email)
    .maybeSingle()

  if (!subscriber) return NextResponse.json({ email: decoded.email, lists: [] })

  const { data: memberships } = await supabase
    .from('newsletter_subscriber_lists')
    .select('newsletter_lists(id, name)')
    .eq('subscriber_id', subscriber.id)

  const lists = ((memberships ?? []) as unknown as { newsletter_lists: { id: string; name: string } | null }[])
    .map((m) => m.newsletter_lists)
    .filter((l): l is { id: string; name: string } => !!l)

  return NextResponse.json({ email: decoded.email, lists })
}

// POST — two modes:
//   mode 'all' (default, backward compatible with old links/POST bodies):
//     global unsubscribe via newsletter_unsubscribes upsert (original behavior).
//   mode 'lists' + list_ids[]:
//     remove ONLY those newsletter_subscriber_lists memberships. Does NOT set
//     unsubscribed_at and does NOT touch newsletter_blacklist.
export async function POST(req: NextRequest) {
  const { token, reason, mode, list_ids } = await req.json()
  if (!token) return NextResponse.json({ error: '缺少 token' }, { status: 400 })

  const decoded = verifyToken(token)
  if (!decoded) return NextResponse.json({ error: '無效或已過期的連結' }, { status: 400 })

  const supabase = createServiceClient()

  if (mode === 'lists') {
    if (
      !Array.isArray(list_ids) ||
      list_ids.length === 0 ||
      !list_ids.every((id: unknown) => typeof id === 'string')
    ) {
      return NextResponse.json({ error: '缺少 list_ids' }, { status: 400 })
    }

    const { data: subscriber } = await supabase
      .from('newsletter_subscribers')
      .select('id')
      .eq('email', decoded.email)
      .maybeSingle()

    if (!subscriber) return NextResponse.json({ error: '找不到訂閱資料' }, { status: 404 })

    const { error } = await supabase
      .from('newsletter_subscriber_lists')
      .delete()
      .eq('subscriber_id', subscriber.id)
      .in('list_id', list_ids)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  }

  // mode 'all' (default) — original all-or-nothing behavior, unchanged.
  const { data: contact } = await supabase
    .from('contacts')
    .select('id')
    .eq('email', decoded.email)
    .maybeSingle()

  await supabase
    .from('newsletter_unsubscribes')
    .upsert(
      {
        email: decoded.email,
        contact_id: contact?.id ?? null,
        reason: reason || null,
        source: 'manual',
      },
      { onConflict: 'email' }
    )

  return NextResponse.json({ ok: true })
}
