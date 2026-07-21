import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'
import { getValidProviderToken } from '@/lib/graph-server'
import { sendMail } from '@/lib/graph'
import { generateOptOutToken } from '@/lib/email-optout'
import { recordUsage } from '@/lib/usage'
import { getOrgContext, orgScopedClient } from '@/lib/orgContext'
import { getOrgSettings } from '@/lib/orgSettings'
import { hasFeatureAccess } from '@/lib/featureAccess'

function injectOptOutFooter(html: string, optOutUrl: string): string {
  const footer = `<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;">若您希望停止接收相關郵件，<a href="${optOutUrl}" style="color:#9ca3af;text-decoration:underline;">請點此告知我們</a>。<br>If you wish to unsubscribe, <a href="${optOutUrl}" style="color:#9ca3af;text-decoration:underline;">click here to let us know</a>.</div>`
  if (html.includes('</body>')) return html.replace('</body>', `${footer}</body>`)
  return html + footer
}

const SG_SEND_URL = 'https://api.sendgrid.com/v3/mail/send'
const OUTLOOK_MAX = 450

function buildConfirmationHtml(
  subject: string,
  sentCount: number,
  recipients: Array<{ name: string | null; email: string | null; company: string | null }>,
  bodyHtml: string,
  mode: 'individual' | 'bcc',
): string {
  const now = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })
  const rows = recipients.slice(0, sentCount).map((c, i) =>
    `<tr style="background:${i % 2 === 0 ? '#fff' : '#f9fafb'};">
      <td style="padding:7px 12px;border-bottom:1px solid #f3f4f6;">${c.name ?? '—'}</td>
      <td style="padding:7px 12px;border-bottom:1px solid #f3f4f6;color:#6b7280;">${c.company ?? '—'}</td>
      <td style="padding:7px 12px;border-bottom:1px solid #f3f4f6;color:#3b82f6;">${c.email ?? ''}</td>
    </tr>`
  ).join('')
  const summaryLine = mode === 'bcc'
    ? `1 封 BCC 郵件送達 <strong style="color:#111827;">${sentCount} 位聯絡人</strong>`
    : `已寄出 <strong style="color:#111827;">${sentCount} 封個人化郵件</strong>`
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:640px;margin:0 auto;padding:24px 20px;color:#111827;">
  <h2 style="font-size:15px;font-weight:600;margin:0 0 6px;">寄件確認</h2>
  <p style="font-size:13px;color:#6b7280;margin:0 0 20px;">${now} &nbsp;·&nbsp; ${summaryLine}</p>
  <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px 16px;margin-bottom:20px;">
    <p style="margin:0 0 3px;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:.05em;">主旨</p>
    <p style="margin:0;font-size:14px;font-weight:600;">${subject}</p>
  </div>
  <p style="font-size:12px;color:#6b7280;font-weight:500;margin:0 0 6px;">收件人名單（${sentCount} 位）</p>
  <table style="width:100%;border-collapse:collapse;font-size:13px;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;margin-bottom:28px;">
    <thead>
      <tr style="background:#f3f4f6;">
        <th style="padding:8px 12px;text-align:left;color:#6b7280;font-weight:500;border-bottom:1px solid #e5e7eb;">姓名</th>
        <th style="padding:8px 12px;text-align:left;color:#6b7280;font-weight:500;border-bottom:1px solid #e5e7eb;">公司</th>
        <th style="padding:8px 12px;text-align:left;color:#6b7280;font-weight:500;border-bottom:1px solid #e5e7eb;">Email</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <p style="font-size:12px;color:#6b7280;font-weight:500;margin:0 0 8px;">郵件內容預覽</p>
  <div style="border:1px solid #e5e7eb;border-radius:8px;padding:20px 24px;background:#fff;">
    ${bodyHtml}
  </div>
</div>`
}

interface FileAttachment {
  name: string
  type: string
  content: string // base64
}

interface SendBody {
  contactIds: string[]
  subject: string
  bodyHtml: string
  cc?: string        // Outlook CC
  replyTo?: string   // SendGrid Reply-To
  userId: string
  method?: 'outlook' | 'sendgrid'
  sgMode?: 'individual' | 'bcc'
  outlookMode?: 'bcc' | 'to'
  selfEmail?: string // sender's own copy — added as real recipient (SendGrid only)
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

  const { contactIds, subject, bodyHtml, cc, replyTo, sgMode = 'individual', outlookMode = 'bcc', selfEmail } = body

  const supabase = createServiceClient()

  // Derive the sender from the session — never trust body.userId, or any logged-in
  // user could send from a teammate's Outlook mailbox and forge attribution.
  const authClient = await createClient()
  const { data: { user: authUser } } = await authClient.auth.getUser()
  if (!authUser?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await hasFeatureAccess(authUser.email, 'bulk_email'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const ctx = await getOrgContext()
  const db = orgScopedClient(ctx)
  const { data: senderProfile } = await supabase.from('users').select('id').ilike('email', authUser.email).maybeSingle()
  const userId = senderProfile?.id

  if (!contactIds?.length || !subject?.trim() || !bodyHtml?.trim() || !userId) {
    return NextResponse.json({ error: '缺少必要欄位' }, { status: 400 })
  }

  // Fetch contacts in batches — `.in('id', [...uuids])` URL param breaks
  // around 200 uuids (~32 KB). SendGrid mode supports up to thousands.
  const FETCH_BATCH = 200
  const fetchedContacts: { id: string; name: string | null; email: string | null; company: string | null; job_title: string | null; email_opt_out: boolean | null; email_status: string | null }[] = []
  for (let i = 0; i < contactIds.length; i += FETCH_BATCH) {
    const batch = contactIds.slice(i, i + FETCH_BATCH)
    const { data: chunk, error: cErr } = await db
      .from('contacts')
      .select('id, name, email, company, job_title, email_opt_out, email_status, contact_tags(tags(is_email_blacklist))')
      .in('id', batch)
      .is('deleted_at', null)
      .not('email', 'is', null)
    if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })
    fetchedContacts.push(...((chunk ?? []) as unknown as { id: string; name: string | null; email: string | null; company: string | null; job_title: string | null; email_opt_out: boolean | null; email_status: string | null }[]))
  }
  const contacts = fetchedContacts

  // Look up canonical unsubscribe table once for all recipients
  const allEmails = Array.from(
    new Set(contacts.map((c) => c.email?.trim().toLowerCase()).filter((e): e is string => !!e)),
  )
  const unsubEmails = new Set<string>()
  const UNSUB_BATCH = 200
  for (let i = 0; i < allEmails.length; i += UNSUB_BATCH) {
    const batch = allEmails.slice(i, i + UNSUB_BATCH)
    const { data: unsubs } = await db
      .from('newsletter_unsubscribes')
      .select('email')
      .in('email', batch)
    for (const u of (unsubs ?? []) as { email: string | null }[]) {
      if (u.email) unsubEmails.add((u.email as string).toLowerCase())
    }
  }

  // Filter then dedupe by email — multiple CRM contacts sharing one email
  // (couples / shared inboxes) should produce ONE send, not N.
  const filtered = contacts.filter(c => {
    if (!c.email?.trim()) return false
    if (unsubEmails.has(c.email.trim().toLowerCase())) return false
    if (c.email_opt_out) return false
    if (c.email_status) return false
    const tags = (c as unknown as { contact_tags?: { tags: { is_email_blacklist: boolean | null } | null }[] }).contact_tags ?? []
    if (tags.some((ct) => ct.tags?.is_email_blacklist)) return false
    return true
  })
  const seenEmails = new Set<string>()
  const valid: typeof filtered = []
  for (const c of filtered) {
    const lc = c.email!.trim().toLowerCase()
    if (seenEmails.has(lc)) continue
    seenEmails.add(lc)
    valid.push(c)
  }
  if (valid.length === 0) {
    return NextResponse.json({ error: '沒有有效的收件人' }, { status: 400 })
  }

  const emails = valid.map(c => c.email!.trim())
  let method: 'outlook' | 'sendgrid'
  let sentCount = 0
  // Contacts the provider actually accepted (per successful batch). Used for logs +
  // the confirmation email so a failed batch doesn't attribute sends to the wrong people.
  const sentContacts: typeof valid = []
  const errors: string[] = []

  // Use client-chosen method, fallback to auto-detect by count
  const chosenMethod = body.method ?? (valid.length < OUTLOOK_MAX ? 'outlook' : 'sendgrid')
  method = chosenMethod

  // ── Create campaign record ──
  const { data: campaign } = await db
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
      const outlookTo = outlookMode === 'to' ? emails.join(',') : senderEmail
      const outlookBcc = outlookMode === 'to' ? undefined : emails.join(',')
      await sendMail({
        accessToken,
        to: outlookTo,
        bcc: outlookBcc,
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
      sentContacts.push(...valid)
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
  } else {
    // ── SendGrid ──
    const sgKey = process.env.SENDGRID_API_KEY
    const fromEmail = process.env.SENDGRID_FROM_EMAIL

    if (!sgKey || !fromEmail) {
      return NextResponse.json({ error: 'SendGrid 設定缺失' }, { status: 500 })
    }
    // Sender display name + app base URL from org settings (env fallback baked in).
    const { sender_name: fromName, app_url: APP_URL } = await getOrgSettings(supabase, ['sender_name', 'app_url'], ctx.orgId)

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
      const bccList = [
        ...emails.map(e => ({ email: e })),
        ...(selfEmail ? [{ email: selfEmail }] : []),
      ]
      const payload: Record<string, unknown> = {
        personalizations: [{
          to: [{ email: fromEmail }],
          bcc: bccList,
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
          sentContacts.push(...valid)
        } else {
          const err = await res.json().catch(() => ({}))
          errors.push(`SendGrid BCC: ${JSON.stringify(err)}`)
        }
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e))
      }
    } else {
      // ── SendGrid individual (one per person, with contact_id for tracking + opt-out) ──
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
            sentContacts.push(...batch)
          } else {
            const err = await res.json().catch(() => ({}))
            errors.push(`SendGrid batch ${i}: ${JSON.stringify(err)}`)
          }
        } catch (e) {
          errors.push(`SendGrid batch ${i}: ${e instanceof Error ? e.message : String(e)}`)
        }
      }

      // ── Self-copy (individual mode): send the exact same email to the sender ──
      let selfSent = false
      if (selfEmail && sentCount > 0) {
        try {
          const selfOptOutToken = generateOptOutToken({ email: selfEmail, contactId: '', campaignId: campaignId ?? '' })
          const selfOptOutUrl = `${APP_URL}/email-optout?token=${selfOptOutToken}`
          const selfRes = await fetch(SG_SEND_URL, {
            method: 'POST',
            headers: { Authorization: `Bearer ${sgKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              personalizations: [{
                to: [{ email: selfEmail }],
                ...(campaignId ? { custom_args: { campaign_id: campaignId } } : {}),
                substitutions: { '{{name}}': '', '{{company}}': '', '{{job_title}}': '', '{{optout_url}}': selfOptOutUrl },
              }],
              from: { email: fromEmail, name: fromName },
              subject,
              content: [{ type: 'text/html', value: bodyWithFooter }],
              ...(replyTo ? { reply_to: { email: replyTo.split(',')[0].trim() } } : {}),
              ...(sgAttachments ? { attachments: sgAttachments } : {}),
            }),
          })
          if (selfRes.ok || selfRes.status === 202) {
            selfSent = true
            sentCount += 1
          }
        } catch {
          // self-copy failure is non-fatal
        }
      }
    }

    // ── Send confirmation copy to sender ──
    if (sentCount > 0) {
      try {
        const { data: senderData } = await supabase.from('users').select('email').eq('id', userId).single()
        const senderEmail = senderData?.email
        if (senderEmail) {
          const selfSent = selfEmail && sentCount > sentContacts.length
          const confirmRecipients = selfSent
            ? [...sentContacts, { name: '我', email: selfEmail!, company: null }]
            : sentContacts
          const confirmHtml = buildConfirmationHtml(subject, sentCount, confirmRecipients, bodyHtml, sgMode)
          await fetch(SG_SEND_URL, {
            method: 'POST',
            headers: { Authorization: `Bearer ${sgKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              personalizations: [{ to: [{ email: senderEmail }] }],
              from: { email: fromEmail, name: fromName },
              subject: `[寄件確認] ${subject}`,
              content: [{ type: 'text/html', value: confirmHtml }],
            }),
          })
        }
      } catch {
        // confirmation failure is non-fatal
      }
    }
  }

  // ── Create interaction logs ──
  if (sentCount > 0) {
    const logLabel = method === 'outlook'
      ? (outlookMode === 'to' ? 'Outlook TO' : 'Outlook BCC')
      : sgMode === 'bcc' ? 'SendGrid BCC' : 'SendGrid 個人化'
    const logRows = sentContacts.map(c => ({
      contact_id: c.id,
      type: 'email' as const,
      direction: 'outbound' as const,
      content: `群發郵件（${logLabel}）：${subject}`,
      email_subject: subject,
      email_body: bodyHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
      created_by: userId,
      campaign_id: campaignId ?? null,
      send_method: method as 'outlook' | 'sendgrid',
    }))

    for (let i = 0; i < logRows.length; i += 500) {
      const { error: logErr } = await db.from('interaction_logs').insert(logRows.slice(i, i + 500))
      // Don't fail the send (mail already went out), but surface the loss —
      // silently dropping these skews interaction history and analytics.
      if (logErr) console.error('[email/send] interaction_logs insert failed:', logErr.message)
    }
  }

  // `sent` = contacts reached; `emailCount` = physical emails actually sent.
  // BCC / TO modes send one email to many recipients → emailCount is 1.
  // Individual mode sends one email per recipient → emailCount equals sent.
  const isGrouped =
    (method === 'outlook') ||
    (method === 'sendgrid' && sgMode === 'bcc')
  const emailCount = isGrouped ? (sentCount > 0 ? 1 : 0) : sentCount

  if (sentCount > 0) await recordUsage(supabase, { email_sent: sentCount })

  return NextResponse.json({
    ok: errors.length === 0,
    method,
    mode: method === 'outlook' ? outlookMode : sgMode,
    campaignId,
    sent: sentCount,
    emailCount,
    total: valid.length,
    errors,
  })
}
