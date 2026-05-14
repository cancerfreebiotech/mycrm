// Supabase Edge Function: inbound-parse
//
// Receives SendGrid Inbound Parse webhook POSTs and writes interaction_logs.
// Lives on Supabase Edge (Pro: 25 MB body limit) because Vercel rejects > 4.5 MB.
//
// SendGrid Inbound Parse settings:
//   Destination URL: https://gaxjgcztzfxokesiraai.supabase.co/functions/v1/inbound-parse?key=<INBOUND_PARSE_SECRET>
//   "POST the raw, full MIME message": OFF  ← parsed mode (no mailparser needed)
//
// Attachment binaries are intentionally discarded — only filenames preserved
// into interaction_logs.email_attachments (text[]).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ORG_DOMAIN = (Deno.env.get('ORG_EMAIL_DOMAIN') ?? 'cancerfree.io').trim().toLowerCase()
const BCC_INBOX_DOMAIN = (Deno.env.get('BCC_INBOX_DOMAIN') ?? 'bcc.cancerfree.io').trim().toLowerCase()
const INBOUND_PARSE_SECRET = Deno.env.get('INBOUND_PARSE_SECRET') ?? ''

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SBC = any

interface AddressEntry { name?: string; email: string }

function parseAddressList(value: string): AddressEntry[] {
  if (!value) return []
  const out: AddressEntry[] = []
  const parts: string[] = []
  let buf = '', depth = 0, inQuote = false
  for (const ch of value) {
    if (ch === '"') inQuote = !inQuote
    else if (!inQuote && ch === '<') depth++
    else if (!inQuote && ch === '>') depth--
    else if (!inQuote && depth === 0 && ch === ',') { parts.push(buf); buf = ''; continue }
    buf += ch
  }
  if (buf.trim()) parts.push(buf)
  for (const raw of parts) {
    const trimmed = raw.trim(); if (!trimmed) continue
    const m = trimmed.match(/^(.+?)\s*<([^>]+)>$/)
    if (m) {
      const email = m[2].trim().toLowerCase()
      if (email.includes('@')) out.push({ name: m[1].trim().replace(/^"|"$/g, '') || undefined, email })
    } else if (trimmed.includes('@')) {
      out.push({ email: trimmed.toLowerCase() })
    }
  }
  return out
}
function isOrgAddress(email: string) { return email.toLowerCase().endsWith('@' + ORG_DOMAIN) }
function isBccInbox(email: string) { return email.toLowerCase().endsWith('@' + BCC_INBOX_DOMAIN) }
function dedupeByEmail(list: AddressEntry[]): AddressEntry[] {
  const seen = new Set<string>(); const out: AddressEntry[] = []
  for (const a of list) { if (!seen.has(a.email)) { seen.add(a.email); out.push(a) } }
  return out
}

const FORWARD_FROM_PATTERNS = [
  /^From:\s*(.+?)\s*<([^>]+)>/im,
  /^From:\s*([^\n\r<]+@[^\s<]+)/im,
  /^寄件者:\s*(.+?)\s*<([^>]+)>/im,
  /^寄件者:\s*([^\n\r<]+@[^\s<]+)/im,
  /^差出人:\s*(.+?)\s*<([^>]+)>/im,
  /^差出人:\s*([^\n\r<]+@[^\s<]+)/im,
]
function extractForwardedFrom(text: string): AddressEntry | null {
  if (!text) return null
  for (const re of FORWARD_FROM_PATTERNS) {
    const m = text.match(re); if (!m) continue
    if (m[2]) return { name: m[1].trim().replace(/^"|"$/g, '') || undefined, email: m[2].trim() }
    return { email: m[1].trim() }
  }
  return null
}
function extractForwardedParticipants(text: string): AddressEntry[] {
  if (!text) return []
  const lines = text.split(/\r?\n/)
  let blockStart = -1
  for (let i = 0; i < lines.length; i++) {
    if (/^(From|寄件者|差出人):\s/i.test(lines[i])) {
      const next4 = lines.slice(i + 1, i + 5).join('\n')
      if (/^(Sent|Date|傳送日期|送信日時|日期):\s/im.test(next4)) { blockStart = i; break }
    }
  }
  if (blockStart === -1) return []
  const headers: string[] = []
  for (let i = blockStart; i < lines.length; i++) {
    const line = lines[i]; if (line.trim() === '') break
    if (/^\s+/.test(line) && headers.length > 0) headers[headers.length - 1] += ' ' + line.trim()
    else headers.push(line)
    if (/^Subject:\s/i.test(line)) break
  }
  const parseSemi = (v: string): AddressEntry[] => {
    const r: AddressEntry[] = []
    for (const part of v.split(/;\s*/)) {
      const t = part.trim(); if (!t) continue
      const m = t.match(/^(.+?)\s*<([^>]+)>$/)
      if (m) { const e = m[2].trim().toLowerCase(); if (e.includes('@')) r.push({ name: m[1].trim().replace(/^"|"$/g, '') || undefined, email: e }) }
      else if (t.includes('@')) r.push({ email: t.toLowerCase() })
    }
    return r
  }
  const result: AddressEntry[] = []
  for (const header of headers) {
    if (/^(From|寄件者|差出人):\s/i.test(header)) result.push(...parseSemi(header.replace(/^(From|寄件者|差出人):\s*/i, '')))
    else if (/^To:\s/i.test(header)) result.push(...parseSemi(header.replace(/^To:\s*/i, '')))
    else if (/^Cc:\s/i.test(header)) result.push(...parseSemi(header.replace(/^Cc:\s*/i, '')))
  }
  return result
}
function isForwardedSubject(subject: string | null): boolean {
  return !!subject && /^(fwd?:|轉寄:|轉送:|fw:|転送:)\s*/i.test(subject.trim())
}
function stripQuotedReply(text: string): string {
  if (!text) return ''
  const lines = text.split(/\r?\n/); const out: string[] = []; let quoteLevel = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]; let q = false
    if (/^On\s.+wrote:\s*$/i.test(line)) q = true
    else if (/^(From|寄件者|差出人):\s/.test(line)) {
      const next3 = lines.slice(i + 1, i + 4).join('\n')
      if (/^(Sent|傳送日期|送信日時|Date|日期):\s/m.test(next3)) q = true
    }
    if (q) { quoteLevel++; if (quoteLevel >= 2) break }
    if (/^>+\s?/.test(line)) continue
    out.push(line)
  }
  return out.join('\n').trim()
}
function formatAddress(e: AddressEntry) { return e.name ? `${e.name} <${e.email}>` : e.email }
function formatAddressList(l: AddressEntry[]) { return l.map(formatAddress).join(', ') }
function buildHeaderBlock(f: AddressEntry, to: AddressEntry[], cc: AddressEntry[]): string {
  const lines = [`From: ${formatAddress(f)}`]
  if (to.length > 0) lines.push(`To: ${formatAddressList(to)}`)
  if (cc.length > 0) lines.push(`Cc: ${formatAddressList(cc)}`)
  return lines.join('\n')
}

const TLD_TO_COUNTRY: Record<string, string> = {
  jp: 'JP', tw: 'TW', kr: 'KR', cn: 'CN', hk: 'HK', sg: 'SG', au: 'AU', nz: 'NZ',
  in: 'IN', th: 'TH', my: 'MY', id: 'ID', ph: 'PH', vn: 'VN',
  de: 'DE', fr: 'FR', uk: 'GB', it: 'IT', es: 'ES', nl: 'NL', ch: 'CH', se: 'SE',
  no: 'NO', dk: 'DK', fi: 'FI', pl: 'PL', at: 'AT', be: 'BE', pt: 'PT', cz: 'CZ',
  hu: 'HU', ro: 'RO', gr: 'GR', ru: 'RU', ua: 'UA',
  ca: 'CA', mx: 'MX', br: 'BR', ar: 'AR', cl: 'CL', co: 'CO',
  il: 'IL', ae: 'AE', sa: 'SA', tr: 'TR', eg: 'EG', za: 'ZA',
}
function tldToCountryCode(email: string): string | null {
  const domain = email.split('@')[1]; if (!domain) return null
  const parts = domain.toLowerCase().split('.')
  return TLD_TO_COUNTRY[parts[parts.length - 1]] ?? null
}
function countryCodeToLanguage(cc: string | null): string {
  if (!cc) return 'english'
  if (cc === 'TW' || cc === 'CN') return 'chinese'
  if (cc === 'JP') return 'japanese'
  return 'english'
}

async function findOrCreateContactByEmail(
  sb: SBC,
  args: { email: string; name?: string | null; createdBy: string | null }
): Promise<{ id: string; created: boolean }> {
  const norm = args.email.trim().toLowerCase()
  if (!norm) throw new Error('email required')
  const { data: existing } = await sb.from('contacts')
    .select('id').ilike('email', norm).is('deleted_at', null).limit(1).maybeSingle()
  if (existing?.id) return { id: existing.id, created: false }

  const cc = tldToCountryCode(norm)
  const language = countryCodeToLanguage(cc)
  const { data: inserted, error: insErr } = await sb.from('contacts').insert({
    name: args.name?.trim() || norm,
    email: norm,
    source: 'inbound_email',
    importance: 'medium',
    language,
    created_by: args.createdBy,
    ...(cc ? { country_code: cc } : {}),
  }).select('id').single()
  if (insErr) throw insErr

  const { data: bccTag } = await sb.from('tags').select('id').ilike('name', 'BCC').maybeSingle()
  if (bccTag?.id) await sb.from('contact_tags').insert({ contact_id: inserted.id, tag_id: bccTag.id })

  return { id: inserted.id, created: true }
}

const sb: SBC = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

Deno.serve(async (req) => {
  const provided = new URL(req.url).searchParams.get('key') ?? ''
  if (!INBOUND_PARSE_SECRET || provided !== INBOUND_PARSE_SECRET) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } })
  }

  let form: FormData
  try { form = await req.formData() }
  catch (e) {
    return new Response(JSON.stringify({ error: 'invalid form', detail: (e as Error).message }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }

  const fromRaw = (form.get('from') as string | null) ?? ''
  const toRaw = (form.get('to') as string | null) ?? ''
  const ccRaw = (form.get('cc') as string | null) ?? ''
  const subject = (form.get('subject') as string | null) ?? ''
  const text = (form.get('text') as string | null) ?? ''
  const attachmentInfoRaw = (form.get('attachment-info') as string | null) ?? ''
  const envelopeRaw = (form.get('envelope') as string | null) ?? ''

  if (!fromRaw) return new Response(JSON.stringify({ error: 'no From address' }), { status: 400, headers: { 'Content-Type': 'application/json' } })

  const fromList = parseAddressList(fromRaw)
  const toList = parseAddressList(toRaw)
  const ccList = parseAddressList(ccRaw)
  const allRecipients = [...toList, ...ccList]

  const fromAddr = fromList[0]
  if (!fromAddr) return new Response(JSON.stringify({ error: 'invalid From address' }), { status: 400, headers: { 'Content-Type': 'application/json' } })

  const hasOrgFrom = isOrgAddress(fromAddr.email)

  let envelopeTo: string[] = []
  try {
    const env = envelopeRaw ? JSON.parse(envelopeRaw) : null
    envelopeTo = Array.isArray(env?.to) ? env.to.map((s: string) => s.toLowerCase()) : []
  } catch { /* noop */ }

  const hasBccInRecipients = envelopeTo.some((e) => e.endsWith('@' + BCC_INBOX_DOMAIN))
  const orgRecipient: AddressEntry | null = allRecipients.find((a) => isOrgAddress(a.email))
    ?? (envelopeTo.find((e) => e.endsWith('@' + ORG_DOMAIN)) ? { email: envelopeTo.find((e) => e.endsWith('@' + ORG_DOMAIN))! } : null)

  console.log('[inbound-parse] received', {
    from: fromAddr.email,
    to: toList.map((a) => a.email),
    cc: ccList.map((a) => a.email),
    envelopeTo, subject,
    hasOrgFrom, hasBccInRecipients,
    orgRecipient: orgRecipient?.email ?? null,
  })

  if (!hasOrgFrom && !(hasBccInRecipients && orgRecipient)) {
    return new Response(JSON.stringify({ error: 'sender not in org; reject', from: fromAddr.email }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }

  const orgEmail = hasOrgFrom ? fromAddr.email : orgRecipient!.email
  const { data: orgUser } = await sb.from('users').select('id').ilike('email', orgEmail).maybeSingle()
  let createdBy: string | null = orgUser?.id ?? null
  if (!createdBy) {
    const { data: superAdmin } = await sb.from('users').select('id').ilike('email', 'pohan.chen@cancerfree.io').maybeSingle()
    createdBy = superAdmin?.id ?? null
  }

  const isForward = isForwardedSubject(subject)
  let direction: 'inbound' | 'outbound'
  let counterparties: AddressEntry[] = []
  if (!hasOrgFrom) { direction = 'inbound'; counterparties = [fromAddr] }
  else if (isForward) {
    direction = 'inbound'
    const fwd = extractForwardedParticipants(text)
    const ext = fwd.filter((a) => !isOrgAddress(a.email) && !isBccInbox(a.email))
    if (ext.length > 0) counterparties = ext
    else {
      const orig = extractForwardedFrom(text)
      if (orig && !isOrgAddress(orig.email) && !isBccInbox(orig.email)) counterparties = [{ name: orig.name, email: orig.email.toLowerCase() }]
      else counterparties = allRecipients.filter((a) => !isOrgAddress(a.email) && !isBccInbox(a.email))
    }
  } else {
    direction = 'outbound'
    counterparties = allRecipients.filter((a) => !isOrgAddress(a.email) && !isBccInbox(a.email))
  }

  counterparties = dedupeByEmail(counterparties)
  if (counterparties.length === 0) {
    return new Response(JSON.stringify({ ok: true, skipped: 'no external party' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  const bodyClean = stripQuotedReply(text) || text
  const headerBlock = buildHeaderBlock(fromAddr, toList, ccList)
  const emailBodyWithHeaders = `${headerBlock}\n\n---\n\n${bodyClean}`
  const emailBodySnippet = emailBodyWithHeaders.slice(0, 50000)
  const directionLabel = direction === 'inbound' ? '收信' : '寄信'
  const contentSummary = `Outlook ${directionLabel}：${subject}`.slice(0, 500)

  let attachmentFilenames: string[] = []
  if (attachmentInfoRaw) {
    try {
      const info = JSON.parse(attachmentInfoRaw) as Record<string, { filename?: string }>
      attachmentFilenames = Object.values(info)
        .map((v) => v.filename || '(unnamed)')
        .filter((f) => f && f.length < 256)
    } catch { /* noop */ }
  }

  const created: Array<{ contact_id: string; created: boolean; email: string }> = []
  for (const party of counterparties) {
    try {
      const result = await findOrCreateContactByEmail(sb, { email: party.email, name: party.name, createdBy })
      const { error: logErr } = await sb.from('interaction_logs').insert({
        contact_id: result.id,
        type: 'email',
        direction,
        send_method: 'outlook',
        email_subject: subject,
        email_body: emailBodySnippet,
        email_attachments: attachmentFilenames.length > 0 ? attachmentFilenames : null,
        content: contentSummary,
        created_by: createdBy,
      })
      if (logErr) { console.error('log insert failed', party.email, logErr); continue }
      created.push({ contact_id: result.id, created: result.created, email: party.email })
    } catch (e) { console.error('contact failed', party.email, (e as Error).message) }
  }

  console.log('[inbound-parse] done', { direction, contacts: created.length, attachments: attachmentFilenames.length })
  return new Response(JSON.stringify({
    ok: true, direction,
    contacts: created.length,
    attachments: attachmentFilenames.length,
    attachment_filenames: attachmentFilenames,
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })
})
