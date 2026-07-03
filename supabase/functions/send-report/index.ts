import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import * as XLSX from 'https://esm.sh/xlsx@0.18.5'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

// ── Token at-rest crypto ─────────────────────────────────────────────────────
// Mirror of src/lib/tokenCrypto.ts (AES-256-GCM, key = sha256(NEXTAUTH_SECRET),
// format enc:v1:<iv>:<ct>:<tag> base64url). Keep both sides in sync.
const ENC_PREFIX = 'enc:v1:'

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '=')), (c) => c.charCodeAt(0))
}
function bytesToB64url(b: Uint8Array): string {
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function cryptoKey(): Promise<CryptoKey> {
  const secret = Deno.env.get('NEXTAUTH_SECRET')
  if (!secret) throw new Error('NEXTAUTH_SECRET secret missing — cannot decrypt gmail tokens')
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret))
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

async function decryptToken(stored: string): Promise<string> {
  if (!stored.startsWith(ENC_PREFIX)) return stored // legacy plaintext row
  const [ivB64, ctB64, tagB64] = stored.slice(ENC_PREFIX.length).split(':')
  const iv = b64urlToBytes(ivB64)
  const ct = b64urlToBytes(ctB64)
  const tag = b64urlToBytes(tagB64)
  const combined = new Uint8Array(ct.length + tag.length)
  combined.set(ct)
  combined.set(tag, ct.length)
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await cryptoKey(), combined)
  return new TextDecoder().decode(plain)
}

async function encryptToken(plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const buf = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await cryptoKey(), new TextEncoder().encode(plain)),
  )
  const ct = buf.slice(0, buf.length - 16)
  const tag = buf.slice(buf.length - 16)
  return `${ENC_PREFIX}${bytesToB64url(iv)}:${bytesToB64url(ct)}:${bytesToB64url(tag)}`
}

async function refreshGmailToken(rowId: string, refreshToken: string): Promise<string> {
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

  // Update stored token (encrypted at rest; match by row id — the stored
  // refresh_token is ciphertext so it can't be used as a lookup key)
  const expiry = new Date(Date.now() + data.expires_in * 1000).toISOString()
  await supabase
    .from('gmail_oauth')
    .update({ access_token: await encryptToken(data.access_token), expiry })
    .eq('id', rowId)

  return data.access_token
}

async function getAccessToken(): Promise<{ token: string; senderEmail: string }> {
  const { data, error } = await supabase
    .from('gmail_oauth')
    .select('id, access_token, refresh_token, expiry, email')
    .limit(1)
    .single()

  if (error || !data) throw new Error('No Gmail OAuth token stored')

  const isExpired = new Date(data.expiry) <= new Date(Date.now() + 60_000)
  const token = isExpired
    ? await refreshGmailToken(data.id, await decryptToken(data.refresh_token))
    : await decryptToken(data.access_token)

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

Deno.serve(async (req) => {
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
