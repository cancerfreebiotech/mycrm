import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { verifyOptOutToken } from '@/lib/email-optout'

export async function POST(req: NextRequest) {
  const { token } = await req.json()
  if (!token) return NextResponse.json({ error: '缺少 token' }, { status: 400 })

  const decoded = verifyOptOutToken(token)
  if (!decoded) return NextResponse.json({ error: '無效或已過期的連結' }, { status: 400 })

  const supabase = createServiceClient()

  const { error } = await supabase
    .from('contacts')
    .update({ email_opt_out: true })
    .eq('id', decoded.contactId)
    .eq('email', decoded.email) // double-check email matches

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, email: decoded.email })
}
