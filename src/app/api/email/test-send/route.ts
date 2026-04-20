import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getValidProviderToken } from '@/lib/graph-server'
import { sendMail } from '@/lib/graph'
import { generateOptOutToken } from '@/lib/email-optout'

const SG_SEND_URL = 'https://api.sendgrid.com/v3/mail/send'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://crm.cancerfree.io'

function injectOptOutFooter(html: string, optOutUrl: string): string {
  const footer = `<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;">若您希望停止接收相關郵件，<a href="${optOutUrl}" style="color:#9ca3af;text-decoration:underline;">請點此告知我們</a>。<br>If you wish to unsubscribe, <a href="${optOutUrl}" style="color:#9ca3af;text-decoration:underline;">click here to let us know</a>.</div>`
  if (html.includes('</body>')) return html.replace('</body>', `${footer}</body>`)
  return html + footer
}

interface FileAttachment {
  name: string
  type: string
  content: string // base64
}

interface TestSendBody {
  subject: string
  bodyHtml: string
  method: 'outlook' | 'sendgrid'
  userId: string
  toEmail: string
}

export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type') ?? ''
  let body: TestSendBody
  let attachments: FileAttachment[] = []

  if (contentType.includes('multipart/form-data')) {
    const fd = await req.formData()
    body = JSON.parse(fd.get('data') as string) as TestSendBody
    const files = fd.getAll('attachments') as File[]
    attachments = await Promise.all(
      files.map(async (f) => ({
        name: f.name,
        type: f.type || 'application/octet-stream',
        content: Buffer.from(await f.arrayBuffer()).toString('base64'),
      }))
    )
  } else {
    body = (await req.json()) as TestSendBody
  }

  const { subject, bodyHtml, method, userId, toEmail } = body
  if (!subject?.trim() || !bodyHtml?.trim() || !userId || !toEmail) {
    return NextResponse.json({ error: '缺少必要欄位' }, { status: 400 })
  }

  const testSubject = `[測試] ${subject}`

  if (method === 'outlook') {
    try {
      const accessToken = await getValidProviderToken(userId)
      await sendMail({
        accessToken,
        to: toEmail,
        subject: testSubject,
        body: bodyHtml,
        attachments: attachments.length > 0 ? attachments.map(a => ({
          name: a.name,
          contentType: a.type,
          contentBytes: a.content,
        })) : undefined,
      })
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
    const optOutToken = generateOptOutToken({ email: toEmail, contactId: '', campaignId: '' })
    const optOutUrl = `${APP_URL}/email-optout?token=${optOutToken}`
    const bodyWithFooter = injectOptOutFooter(bodyHtml, optOutUrl)
    // Fetch sender name for the "from" display
    const { data: sender } = await supabase.from('users').select('email').eq('id', userId).single()
    const sgAttachments = attachments.length > 0
      ? attachments.map(a => ({
          content: a.content,
          type: a.type,
          filename: a.name,
          disposition: 'attachment',
        }))
      : undefined
    const res = await fetch(SG_SEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sgKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: toEmail }] }],
        from: { email: fromEmail, name: fromName },
        reply_to: sender?.email ? { email: sender.email } : undefined,
        subject: testSubject,
        content: [{ type: 'text/html', value: bodyWithFooter }],
        ...(sgAttachments ? { attachments: sgAttachments } : {}),
      }),
    })
    if (res.ok || res.status === 202) return NextResponse.json({ ok: true })
    const err = await res.json().catch(() => ({}))
    return NextResponse.json({ error: JSON.stringify(err) }, { status: 500 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
