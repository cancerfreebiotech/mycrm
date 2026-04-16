import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getValidProviderToken } from '@/lib/graph-server'
import { sendMail } from '@/lib/graph'
import { generateOptOutToken } from '@/lib/email-optout'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://crm.cancerfree.io'

function injectOptOutFooter(html: string, optOutUrl: string): string {
  const footer = `<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;">若您希望停止接收相關郵件，<a href="${optOutUrl}" style="color:#9ca3af;text-decoration:underline;">請點此告知我們</a>。</div>`
  if (html.includes('</body>')) return html.replace('</body>', `${footer}</body>`)
  return html + footer
}

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
  cc?: string       // Outlook CC
  replyTo?: string  // SendGrid Reply-To
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

  const { contactIds, subject, bodyHtml, cc, replyTo, userId, sgMode = 'individual' } = body

  if (!contactIds?.length || !subject?.trim() || !bodyHtml?.trim() || !userId) {
    return NextResponse.json({ error: '缺少必要欄位' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Fetch contacts with valid emails, excluding opted-out
  const { data: contacts, error: cErr } = await supabase
    .from('contacts')
    .select('id, name, email, company, job_title, email_opt_out')
    .in('id', contactIds)
    .is('deleted_at', null)
    .not('email', 'is', null)

  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })

  const valid = (contacts ?? []).filter(c => c.email?.trim() && !c.email_opt_out)
  if (valid.length === 0) {
    return NextResponse.json({ error: '沒有有效的收件人' }, { status: 400 })
  }

  const emails = valid.map(c => c.email!.trim())
  let method: 'outlook' | 'sendgrid'
  let sentCount = 0
  const errors: string[] = []

  // Use client-chosen method, fallback to auto-detect by count
  const chosenMethod = body.method ?? (valid.length < OUTLOOK_MAX ? 'outlook' : 'sendgrid')
  method = chosenMethod

  // ── Create campaign record ──
  const { data: campaign } = await supabase
    .from('email_campaigns')
    .insert({
      subject,
      method: chosenMethod,
      sg_mode: chosenMethod === 'sendgrid' ? sgMode : null,
      total_recipients: valid.length,
      created_by: userId,
    })
    .select('id')
    .single()
  const campaignId = campaign?.id as string | undefined

  if (chosenMethod === 'outlook') {
    // ── Outlook (Graph API) BCC ──
    try {
      const accessToken = await getValidProviderToken(userId)
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
      // ── SendGrid BCC: one email, all recipients in BCC (no per-recipient tracking) ──
      const payload: Record<string, unknown> = {
        personalizations: [{
          to: [{ email: fromEmail }],
          bcc: emails.map(e => ({ email: e })),
        }],
        from: { email: fromEmail, name: fromName },
        subject,
        content: [{ type: 'text/html', value: bodyHtml }],
        ...(campaignId ? { custom_args: { campaign_id: campaignId } } : {}),
        ...(replyTo ? { reply_to: { email: replyTo.split(',')[0].trim() } } : {}),
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
      // ── SendGrid personalizations (one per person, with contact_id for tracking + opt-out) ──
      const hasVars = /\{\{(name|company|job_title)\}\}/.test(bodyHtml) || /\{\{(name|company|job_title)\}\}/.test(subject)

      // Inject opt-out footer placeholder — substituted per-recipient below
      const bodyWithFooter = injectOptOutFooter(bodyHtml, '{{optout_url}}')

      const BATCH = 1000
      for (let i = 0; i < emails.length; i += BATCH) {
        const batch = valid.slice(i, i + BATCH)

        const personalizations = batch.map(c => {
          const optOutToken = generateOptOutToken({
            email: c.email!.trim(),
            contactId: c.id,
            campaignId: campaignId ?? '',
          })
          const optOutUrl = `${APP_URL}/email-optout?token=${optOutToken}`
          return {
            to: [{ email: c.email!.trim() }],
            // custom_args are merged into webhook events — used for tracking
            ...(campaignId ? {
              custom_args: {
                campaign_id: campaignId,
                contact_id: c.id,
              },
            } : {}),
            substitutions: {
              ...(hasVars ? {
                '{{name}}': c.name ?? '',
                '{{company}}': c.company ?? '',
                '{{job_title}}': c.job_title ?? '',
              } : {}),
              '{{optout_url}}': optOutUrl,
            },
          }
        })

        const payload: Record<string, unknown> = {
          personalizations,
          from: { email: fromEmail, name: fromName },
          subject,
          content: [{ type: 'text/html', value: bodyWithFooter }],
          ...(replyTo ? { reply_to: { email: replyTo.split(',')[0].trim() } } : {}),
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
      campaign_id: campaignId ?? null,
    }))

    for (let i = 0; i < logRows.length; i += 500) {
      await supabase.from('interaction_logs').insert(logRows.slice(i, i + 500))
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    method,
    campaignId,
    sent: sentCount,
    total: valid.length,
    errors,
  })
}
