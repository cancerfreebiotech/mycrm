import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getValidProviderToken } from '@/lib/graph-server'
import { sendMail } from '@/lib/graph'

const SG_SEND_URL = 'https://api.sendgrid.com/v3/mail/send'
const OUTLOOK_MAX = 450

interface FileAttachment {
  name: string
  type: string
  content: string // base64
}

interface SendBody {
  contactIds: string[]
  subject: string
  bodyHtml: string
  cc?: string
  userId: string
  method?: 'outlook' | 'sendgrid'
  sgMode?: 'individual' | 'bcc'
}

export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type') ?? ''
  let body: SendBody
  let attachments: FileAttachment[] = []

  if (contentType.includes('multipart/form-data')) {
    const fd = await req.formData()
    body = JSON.parse(fd.get('data') as string) as SendBody
    const files = fd.getAll('attachments') as File[]
    attachments = await Promise.all(
      files.map(async (f) => ({
        name: f.name,
        type: f.type || 'application/octet-stream',
        content: Buffer.from(await f.arrayBuffer()).toString('base64'),
      }))
    )
  } else {
    body = (await req.json()) as SendBody
  }

  const { contactIds, subject, bodyHtml, cc, userId, sgMode = 'individual' } = body

  if (!contactIds?.length || !subject?.trim() || !bodyHtml?.trim() || !userId) {
    return NextResponse.json({ error: '缺少必要欄位' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Fetch contacts with valid emails
  const { data: contacts, error: cErr } = await supabase
    .from('contacts')
    .select('id, name, email, company, job_title')
    .in('id', contactIds)
    .is('deleted_at', null)
    .not('email', 'is', null)

  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })

  const valid = (contacts ?? []).filter(c => c.email?.trim())
  if (valid.length === 0) {
    return NextResponse.json({ error: '沒有有效的收件人' }, { status: 400 })
  }

  const emails = valid.map(c => c.email!.trim())
  let method: 'outlook' | 'sendgrid'
  let sentCount = 0
  const errors: string[] = []

  // Use client-chosen method, fallback to auto-detect by count
  const chosenMethod = body.method ?? (valid.length < OUTLOOK_MAX ? 'outlook' : 'sendgrid')

  if (chosenMethod === 'outlook') {
    // ── Outlook (Graph API) BCC ──
    method = 'outlook'
    try {
      const accessToken = await getValidProviderToken(userId)
      // Fetch sender's own email for the To field
      const { data: sender } = await supabase
        .from('users')
        .select('email')
        .eq('id', userId)
        .single()
      const senderEmail = sender?.email ?? emails[0]
      await sendMail({
        accessToken,
        to: senderEmail,
        bcc: emails.join(','),
        cc: cc || undefined,
        subject,
        body: bodyHtml,
        attachments: attachments.length > 0 ? attachments.map(a => ({
          name: a.name,
          contentType: a.type,
          contentBytes: a.content,
        })) : undefined,
      })
      sentCount = valid.length
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
  } else {
    // ── SendGrid ──
    method = 'sendgrid'
    const sgKey = process.env.SENDGRID_API_KEY
    const fromEmail = process.env.SENDGRID_FROM_EMAIL
    const fromName = process.env.SENDGRID_FROM_NAME ?? 'CancerFree Biotech'

    if (!sgKey || !fromEmail) {
      return NextResponse.json({ error: 'SendGrid 設定缺失' }, { status: 500 })
    }

    const sgAttachments = attachments.length > 0
      ? attachments.map(a => ({
          content: a.content,
          type: a.type,
          filename: a.name,
          disposition: 'attachment',
        }))
      : undefined

    if (sgMode === 'bcc') {
      // ── SendGrid BCC mode: one email, all recipients in BCC ──
      const payload: Record<string, unknown> = {
        personalizations: [{
          to: [{ email: fromEmail }],
          bcc: emails.map(e => ({ email: e })),
        }],
        from: { email: fromEmail, name: fromName },
        subject,
        content: [{ type: 'text/html', value: bodyHtml }],
        ...(cc ? { reply_to: { email: cc.split(',')[0].trim() } } : {}),
        ...(sgAttachments ? { attachments: sgAttachments } : {}),
      }
      try {
        const res = await fetch(SG_SEND_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${sgKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (res.ok || res.status === 202) {
          sentCount = valid.length
        } else {
          const err = await res.json().catch(() => ({}))
          errors.push(`SendGrid BCC: ${JSON.stringify(err)}`)
        }
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e))
      }
    } else {
      // ── SendGrid personalizations (one per person, batched max 1000) ──
      const hasVars = /\{\{(name|company|job_title)\}\}/.test(bodyHtml) || /\{\{(name|company|job_title)\}\}/.test(subject)

      const BATCH = 1000
      for (let i = 0; i < emails.length; i += BATCH) {
        const batch = valid.slice(i, i + BATCH)

        const personalizations = batch.map(c => ({
          to: [{ email: c.email!.trim() }],
          ...(hasVars ? {
            substitutions: {
              '{{name}}': c.name ?? '',
              '{{company}}': c.company ?? '',
              '{{job_title}}': c.job_title ?? '',
            },
          } : {}),
        }))

        const payload: Record<string, unknown> = {
          personalizations,
          from: { email: fromEmail, name: fromName },
          subject,
          content: [{ type: 'text/html', value: bodyHtml }],
          ...(cc ? { reply_to: { email: cc.split(',')[0].trim() } } : {}),
          ...(sgAttachments ? { attachments: sgAttachments } : {}),
        }

        try {
          const res = await fetch(SG_SEND_URL, {
            method: 'POST',
            headers: { Authorization: `Bearer ${sgKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
          if (res.ok || res.status === 202) {
            sentCount += batch.length
          } else {
            const err = await res.json().catch(() => ({}))
            errors.push(`SendGrid batch ${i}: ${JSON.stringify(err)}`)
          }
        } catch (e) {
          errors.push(`SendGrid batch ${i}: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
    }
  }

  // ── Create interaction logs ──
  if (sentCount > 0) {
    const logLabel = method === 'outlook'
      ? 'Outlook BCC'
      : sgMode === 'bcc' ? 'SendGrid BCC' : 'SendGrid 個人化'
    const logRows = valid.slice(0, sentCount).map(c => ({
      contact_id: c.id,
      type: 'email' as const,
      content: `群發郵件（${logLabel}）：${subject}`,
      email_subject: subject,
      email_body: bodyHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
      created_by: userId,
    }))

    // Insert in batches of 500 to avoid payload limits
    for (let i = 0; i < logRows.length; i += 500) {
      await supabase.from('interaction_logs').insert(logRows.slice(i, i + 500))
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    method,
    sent: sentCount,
    total: valid.length,
    errors,
  })
}
