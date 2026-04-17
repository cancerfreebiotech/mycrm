import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getValidProviderToken } from '@/lib/graph-server'
import { sendMail } from '@/lib/graph'

const SG_SEND_URL = 'https://api.sendgrid.com/v3/mail/send'

export async function POST(req: NextRequest) {
  const { subject, bodyHtml, method, userId, toEmail } = await req.json()
  if (!subject?.trim() || !bodyHtml?.trim() || !userId || !toEmail) {
    return NextResponse.json({ error: '缺少必要欄位' }, { status: 400 })
  }

  const testSubject = `[測試] ${subject}`

  if (method === 'outlook') {
    try {
      const accessToken = await getValidProviderToken(userId)
      await sendMail({ accessToken, to: toEmail, subject: testSubject, body: bodyHtml })
      return NextResponse.json({ ok: true })
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
    }
  }

  // SendGrid
  const sgKey = process.env.SENDGRID_API_KEY
  const fromEmail = process.env.SENDGRID_FROM_EMAIL
  const fromName = process.env.SENDGRID_FROM_NAME ?? 'CancerFree Biotech'
  if (!sgKey || !fromEmail) {
    return NextResponse.json({ error: 'SendGrid 設定缺失' }, { status: 500 })
  }

  try {
    const supabase = createServiceClient()
    // Fetch sender name for the "from" display
    const { data: sender } = await supabase.from('users').select('email').eq('id', userId).single()
    const res = await fetch(SG_SEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sgKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: toEmail }] }],
        from: { email: fromEmail, name: fromName },
        reply_to: sender?.email ? { email: sender.email } : undefined,
        subject: testSubject,
        content: [{ type: 'text/html', value: bodyHtml }],
      }),
    })
    if (res.ok || res.status === 202) return NextResponse.json({ ok: true })
    const err = await res.json().catch(() => ({}))
    return NextResponse.json({ error: JSON.stringify(err) }, { status: 500 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
