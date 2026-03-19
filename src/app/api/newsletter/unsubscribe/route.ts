import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { createHmac } from 'crypto'

function verifyToken(token: string): { email: string; campaignId: string } | null {
  try {
    const [headerB64, payloadB64, sig] = token.split('.')
    if (!headerB64 || !payloadB64 || !sig) return null
    const secret = process.env.NEXTAUTH_SECRET ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
    const expected = createHmac('sha256', secret).update(`${headerB64}.${payloadB64}`).digest('base64url')
    if (sig !== expected) return null
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString())
    if (payload.exp && Date.now() / 1000 > payload.exp) return null
    return { email: payload.email, campaignId: payload.campaignId }
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  const { token, reason } = await req.json()
  if (!token) return NextResponse.json({ error: '缺少 token' }, { status: 400 })

  const decoded = verifyToken(token)
  if (!decoded) return NextResponse.json({ error: '無效或已過期的連結' }, { status: 400 })

  const supabase = createServiceClient()

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
