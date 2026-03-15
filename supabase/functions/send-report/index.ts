import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import * as XLSX from 'https://esm.sh/xlsx@0.18.5'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

async function refreshGmailToken(refreshToken: string): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`Token refresh failed: ${JSON.stringify(data)}`)

  // Update stored token
  const expiry = new Date(Date.now() + data.expires_in * 1000).toISOString()
  await supabase
    .from('gmail_oauth')
    .update({ access_token: data.access_token, expiry })
    .eq('refresh_token', refreshToken)

  return data.access_token
}

async function getAccessToken(): Promise<{ token: string; senderEmail: string }> {
  const { data, error } = await supabase
    .from('gmail_oauth')
    .select('access_token, refresh_token, expiry, email')
    .limit(1)
    .single()

  if (error || !data) throw new Error('No Gmail OAuth token stored')

  const isExpired = new Date(data.expiry) <= new Date(Date.now() + 60_000)
  const token = isExpired ? await refreshGmailToken(data.refresh_token) : data.access_token

  return { token, senderEmail: data.email }
}

async function generateExcel(dateFrom: string, dateTo: string): Promise<Uint8Array> {
  const fromISO = `${dateFrom}T00:00:00.000Z`
  const toISO = `${dateTo}T23:59:59.999Z`

  const { data: contacts } = await supabase
    .from('contacts')
    .select('name, company, email, phone, job_title, created_at, contact_tags(tags(name))')
    .gte('created_at', fromISO)
    .lte('created_at', toISO)
    .order('created_at', { ascending: false })

  const { data: logs } = await supabase
    .from('interaction_logs')
    .select('type, content, email_subject, meeting_date, created_at, contacts(name, company)')
    .gte('created_at', fromISO)
    .lte('created_at', toISO)
    .order('created_at', { ascending: false })

  const contactRows = (contacts ?? []).map((c: Record<string, unknown>) => ({
    姓名: c.name ?? '',
    公司: c.company ?? '',
    Email: c.email ?? '',
    電話: c.phone ?? '',
    職稱: c.job_title ?? '',
    Tags: (c.contact_tags as Array<{ tags: { name: string } }>)
      ?.map(ct => ct.tags?.name)
      .filter(Boolean)
      .join(', ') ?? '',
    建立時間: c.created_at ? new Date(c.created_at as string).toLocaleString('zh-TW') : '',
  }))

  const logRows = (logs ?? []).map((l: Record<string, unknown>) => ({
    聯絡人: (l.contacts as { name?: string })?.name ?? '',
    公司: (l.contacts as { company?: string })?.company ?? '',
    類型: l.type ?? '',
    內容: l.email_subject ?? l.content ?? '',
    時間: l.meeting_date
      ? new Date(l.meeting_date as string).toLocaleString('zh-TW')
      : l.created_at ? new Date(l.created_at as string).toLocaleString('zh-TW') : '',
  }))

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(contactRows), '新增名片')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(logRows), '互動紀錄')

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Uint8Array
}

async function sendGmail(
  accessToken: string,
  senderEmail: string,
  recipients: string[],
  subject: string,
  htmlBody: string,
  excelBuf: Uint8Array,
  filename: string,
) {
  const boundary = '----=_Part_0_boundary'
  const b64Excel = btoa(String.fromCharCode(...excelBuf))

  const rawEmail = [
    `From: ${senderEmail}`,
    `To: ${recipients.join(', ')}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    '',
    htmlBody,
    '',
    `--${boundary}`,
    `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`,
    `Content-Transfer-Encoding: base64`,
    `Content-Disposition: attachment; filename="${filename}"`,
    '',
    b64Excel,
    '',
    `--${boundary}--`,
  ].join('\r\n')

  const encodedEmail = btoa(rawEmail).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: encodedEmail }),
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(`Gmail send failed: ${JSON.stringify(err)}`)
  }
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const scheduleId: string | undefined = body.scheduleId

    // If scheduleId provided, send for that schedule; otherwise send all active due schedules.
    let scheduleRows
    if (scheduleId) {
      const { data } = await supabase
        .from('report_schedules')
        .select('*')
        .eq('id', scheduleId)
        .eq('is_active', true)
        .limit(1)
      scheduleRows = data ?? []
    } else {
      const { data } = await supabase
        .from('report_schedules')
        .select('*')
        .eq('is_active', true)
      scheduleRows = data ?? []
    }

    if (scheduleRows.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const { token, senderEmail } = await getAccessToken()

    let sent = 0
    for (const schedule of scheduleRows) {
      const dateTo = new Date().toISOString().slice(0, 10)
      const dateFrom = new Date(Date.now() - schedule.date_range_days * 86400000)
        .toISOString()
        .slice(0, 10)

      const excelBuf = await generateExcel(dateFrom, dateTo)
      const filename = `report_${dateFrom}_${dateTo}.xlsx`
      const subject = `[myCRM 報表] ${schedule.name} ${dateTo}`
      const htmlBody = `<p>您好，</p><p>附件為 ${schedule.name} 的報表（${dateFrom} ～ ${dateTo}）。</p><p>— myCRM 自動寄送</p>`

      await sendGmail(token, senderEmail, schedule.recipients, subject, htmlBody, excelBuf, filename)
      sent++
    }

    return new Response(JSON.stringify({ ok: true, sent }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('send-report error:', message)
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
