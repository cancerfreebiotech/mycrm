/**
 * send-newsletter Edge Function
 *
 * 觸發方式：pg_cron 每天依各 campaign 的 send_hour 觸發
 * 環境變數：SENDGRID_API_KEY, SENDGRID_FROM_EMAIL, SENDGRID_FROM_NAME,
 *           NEXT_PUBLIC_APP_URL, NEXTAUTH_SECRET
 *
 * pg_cron 設定（執行一次）：
 *   select cron.schedule(
 *     'send-newsletter',
 *     '0 * * * *',   -- 每小時整點檢查，Edge Function 內部依 send_hour 過濾
 *     $$ select net.http_post(
 *       url := 'https://<ref>.supabase.co/functions/v1/send-newsletter',
 *       headers := '{"Authorization": "Bearer <anon_key>", "Content-Type": "application/json"}'::jsonb,
 *       body := '{}'::jsonb
 *     ) $$
 *   );
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createHmac } from 'https://deno.land/std@0.177.0/node/crypto.ts'

const SENDGRID_API = 'https://api.sendgrid.com/v3/mail/send'

interface Campaign {
  id: string
  title: string
  subject: string
  preview_text: string | null
  content_html: string
  send_hour: number
  daily_limit: number
  sent_count: number
  total_recipients: number
  created_by: string
}

interface Recipient {
  id: string
  campaign_id: string
  contact_id: string | null
  email: string
}

interface Contact {
  id: string
  name: string | null
  company: string | null
  job_title: string | null
}

function buildUnsubscribeToken(email: string, campaignId: string, secret: string): string {
  const payload = {
    email,
    campaignId,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 90, // 90 days
  }
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const payloadB64 = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const sig = createHmac('sha256', secret).update(`${header}.${payloadB64}`).digest('base64url')
  return `${header}.${payloadB64}.${sig}`
}

function personalise(html: string, contact: Contact | null): string {
  return html
    .replace(/\{\{name\}\}/g, contact?.name ?? '')
    .replace(/\{\{company\}\}/g, contact?.company ?? '')
    .replace(/\{\{job_title\}\}/g, contact?.job_title ?? '')
}

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const sgKey = Deno.env.get('SENDGRID_API_KEY')!
  const fromEmail = Deno.env.get('SENDGRID_FROM_EMAIL')!
  const fromName = Deno.env.get('SENDGRID_FROM_NAME') ?? 'CancerFree Biotech'
  const appUrl = Deno.env.get('NEXT_PUBLIC_APP_URL') ?? ''
  const secret = Deno.env.get('NEXTAUTH_SECRET') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? ''

  const nowHourUtc8 = (new Date().getUTCHours() + 8) % 24

  // Find campaigns that should send now
  const { data: campaigns, error: campErr } = await supabase
    .from('newsletter_campaigns')
    .select('id, title, subject, preview_text, content_html, send_hour, daily_limit, sent_count, total_recipients, created_by')
    .in('status', ['scheduled', 'sending'])
    .lte('scheduled_at', new Date().toISOString())
    .eq('send_hour', nowHourUtc8)

  if (campErr || !campaigns?.length) {
    return new Response(JSON.stringify({ ok: true, processed: 0 }), { headers: { 'Content-Type': 'application/json' } })
  }

  let totalSent = 0

  for (const campaign of campaigns as Campaign[]) {
    // Set to sending if still scheduled
    await supabase
      .from('newsletter_campaigns')
      .update({ status: 'sending' })
      .eq('id', campaign.id)
      .eq('status', 'scheduled')

    // Get pending recipients up to daily_limit
    const { data: recipients } = await supabase
      .from('newsletter_recipients')
      .select('id, campaign_id, contact_id, email')
      .eq('campaign_id', campaign.id)
      .eq('status', 'pending')
      .limit(campaign.daily_limit)

    if (!recipients?.length) {
      // All sent
      await supabase
        .from('newsletter_campaigns')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', campaign.id)
      continue
    }

    // Fetch contacts for personalisation
    const contactIds = recipients.map(r => r.contact_id).filter(Boolean) as string[]
    const contactMap: Record<string, Contact> = {}
    if (contactIds.length > 0) {
      const { data: contacts } = await supabase
        .from('contacts')
        .select('id, name, company, job_title')
        .in('id', contactIds)
      for (const c of contacts ?? []) contactMap[c.id] = c
    }

    let sentInBatch = 0

    for (const recipient of recipients as Recipient[]) {
      const contact = recipient.contact_id ? (contactMap[recipient.contact_id] ?? null) : null
      const html = personalise(campaign.content_html ?? '', contact)

      // Append unsubscribe footer
      const token = buildUnsubscribeToken(recipient.email, campaign.id, secret)
      const unsubUrl = `${appUrl}/unsubscribe?token=${token}`
      const finalHtml = `${html}<p style="margin-top:24px;font-size:11px;color:#aaa;text-align:center;">
        <a href="${unsubUrl}" style="color:#aaa;">取消訂閱 | Unsubscribe</a>
      </p>`

      const payload = {
        personalizations: [{
          to: [{ email: recipient.email }],
          custom_args: {
            'X-Campaign-Id': campaign.id,
            'X-Recipient-Id': recipient.id,
          },
        }],
        from: { email: fromEmail, name: fromName },
        subject: campaign.subject,
        content: [{ type: 'text/html', value: finalHtml }],
        tracking_settings: {
          click_tracking: { enable: true },
          open_tracking: { enable: true },
        },
      }

      const sgRes = await fetch(SENDGRID_API, {
        method: 'POST',
        headers: { Authorization: `Bearer ${sgKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const messageId = sgRes.headers.get('x-message-id') ?? null

      if (sgRes.ok || sgRes.status === 202) {
        await supabase
          .from('newsletter_recipients')
          .update({ status: 'sent', sent_at: new Date().toISOString(), sendgrid_message_id: messageId })
          .eq('id', recipient.id)
        sentInBatch++

        // Write interaction log
        if (recipient.contact_id) {
          await supabase.from('interaction_logs').insert({
            contact_id: recipient.contact_id,
            type: 'email',
            email_subject: campaign.subject,
            content: `寄送 Newsletter：${campaign.title}`,
            created_by: campaign.created_by,
          })
        }
      } else {
        await supabase
          .from('newsletter_recipients')
          .update({ status: 'failed' })
          .eq('id', recipient.id)
      }
    }

    // Update sent_count
    const newCount = campaign.sent_count + sentInBatch
    const allDone = newCount >= campaign.total_recipients

    await supabase
      .from('newsletter_campaigns')
      .update({
        sent_count: newCount,
        ...(allDone ? { status: 'sent', sent_at: new Date().toISOString() } : {}),
      })
      .eq('id', campaign.id)

    totalSent += sentInBatch
  }

  return new Response(JSON.stringify({ ok: true, processed: totalSent }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
