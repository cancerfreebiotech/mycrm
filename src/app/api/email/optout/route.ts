import { NextRequest, NextResponse } from 'next/server'
import { verifyOptOutToken } from '@/lib/email-optout'
import { systemOrgContext, orgScopedClient } from '@/lib/orgContext'

export async function POST(req: NextRequest) {
  const { token } = await req.json()
  if (!token) return NextResponse.json({ error: '缺少 token' }, { status: 400 })

  const decoded = verifyOptOutToken(token)
  if (!decoded) return NextResponse.json({ error: '無效或已過期的連結' }, { status: 400 })

  // Phase 2+: 由 payload（opt-out token）解析 org
  const ctx = systemOrgContext()
  const db = orgScopedClient(ctx)

  const { error } = await db
    .from('contacts')
    .update({ email_opt_out: true })
    .eq('id', decoded.contactId)
    .eq('email', decoded.email) // double-check email matches

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, email: decoded.email })
}
