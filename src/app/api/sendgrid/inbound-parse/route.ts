import { NextRequest, NextResponse } from 'next/server'
import { simpleParser, type AddressObject, type ParsedMail } from 'mailparser'
import { createServiceClient } from '@/lib/supabase'
import { findOrCreateContactByEmail } from '@/lib/findOrCreateContactByEmail'
import {
  extractForwardedFrom,
  isForwardedSubject,
  stripQuotedReply,
} from '@/lib/parseEmailHeaders'

// POST /api/sendgrid/inbound-parse?key=<INBOUND_PARSE_SECRET>
// Receives mail forwarded by SendGrid Inbound Parse (multipart/form-data).
// SendGrid posts raw MIME in the `email` field when the "POST raw" checkbox
// is enabled in the dashboard. We parse the raw MIME with mailparser to get
// uniform behavior regardless of headers/encoding edge cases.
//
// Auth: shared secret in URL query (?key=...). SendGrid Inbound Parse doesn't
// sign requests, so URL secret is the standard pattern. Plus we filter that
// at least one cancerfree.io address appears in From/To/Cc as a soft sanity
// check against random spam landing in the parse webhook.

export const runtime = 'nodejs'
export const maxDuration = 30

const ORG_DOMAIN = (process.env.ORG_EMAIL_DOMAIN ?? 'cancerfree.io').toLowerCase()
const BCC_INBOX_DOMAIN = (process.env.BCC_INBOX_DOMAIN ?? 'bcc.cancerfree.io').toLowerCase()

interface AddressEntry {
  name?: string
  email: string
}

function flattenAddresses(field: AddressObject | AddressObject[] | undefined): AddressEntry[] {
  if (!field) return []
  const arr = Array.isArray(field) ? field : [field]
  const out: AddressEntry[] = []
  for (const obj of arr) {
    for (const v of obj.value ?? []) {
      if (!v.address) continue
      out.push({ name: v.name?.trim() || undefined, email: v.address.trim().toLowerCase() })
    }
  }
  return out
}

function isOrgAddress(email: string): boolean {
  return email.toLowerCase().endsWith('@' + ORG_DOMAIN)
}

function isBccInbox(email: string): boolean {
  return email.toLowerCase().endsWith('@' + BCC_INBOX_DOMAIN)
}

function dedupeByEmail(list: AddressEntry[]): AddressEntry[] {
  const seen = new Set<string>()
  const out: AddressEntry[] = []
  for (const a of list) {
    if (seen.has(a.email)) continue
    seen.add(a.email)
    out.push(a)
  }
  return out
}

export async function POST(req: NextRequest) {
  const provided = new URL(req.url).searchParams.get('key') ?? ''
  const expected = process.env.INBOUND_PARSE_SECRET ?? ''
  if (!expected || provided !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch (e) {
    return NextResponse.json(
      { error: 'expected multipart/form-data', detail: (e as Error).message },
      { status: 400 }
    )
  }

  // SendGrid posts raw MIME in `email` when "POST raw" is enabled.
  // Fallback: try `text` + `headers` if raw isn't present (parsed mode).
  const rawField = form.get('email')
  const raw = typeof rawField === 'string' ? rawField : ''
  if (!raw || raw.length < 10) {
    return NextResponse.json(
      { error: 'no raw email field; enable "POST raw" in SendGrid Inbound Parse' },
      { status: 400 }
    )
  }

  let parsed: ParsedMail
  try {
    parsed = await simpleParser(raw)
  } catch (e) {
    return NextResponse.json(
      { error: 'parse failed', detail: (e as Error).message },
      { status: 400 }
    )
  }

  const fromList = flattenAddresses(parsed.from)
  const toList = flattenAddresses(parsed.to)
  const ccList = flattenAddresses(parsed.cc)
  const bccList = flattenAddresses(parsed.bcc)
  const allRecipients = [...toList, ...ccList, ...bccList]

  const fromAddr = fromList[0]
  if (!fromAddr) {
    return NextResponse.json({ error: 'no From address' }, { status: 400 })
  }

  const hasOrgFrom = isOrgAddress(fromAddr.email)
  const hasOrgRecipient = allRecipients.some((a) => isOrgAddress(a.email))
  if (!hasOrgFrom && !hasOrgRecipient) {
    return NextResponse.json({ error: 'no org party' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const orgEmail = hasOrgFrom
    ? fromAddr.email
    : allRecipients.find((a) => isOrgAddress(a.email))!.email

  const { data: orgUser } = await supabase
    .from('users')
    .select('id')
    .ilike('email', orgEmail)
    .maybeSingle()

  let createdBy: string | null = orgUser?.id ?? null
  if (!createdBy) {
    const { data: superAdmin } = await supabase
      .from('users')
      .select('id')
      .ilike('email', 'pohan.chen@cancerfree.io')
      .maybeSingle()
    createdBy = superAdmin?.id ?? null
  }

  const subject = parsed.subject ?? ''
  const isForward = isForwardedSubject(subject)

  let direction: 'inbound' | 'outbound'
  let counterparties: AddressEntry[] = []

  if (isForward && hasOrgFrom) {
    direction = 'inbound'
    const orig = extractForwardedFrom(parsed.text ?? '')
    if (orig) {
      counterparties = [{ name: orig.name, email: orig.email.toLowerCase() }]
    } else {
      counterparties = allRecipients.filter(
        (a) => !isOrgAddress(a.email) && !isBccInbox(a.email)
      )
    }
  } else if (hasOrgFrom) {
    direction = 'outbound'
    counterparties = allRecipients.filter(
      (a) => !isOrgAddress(a.email) && !isBccInbox(a.email)
    )
  } else {
    direction = 'inbound'
    counterparties = [fromAddr]
  }

  counterparties = dedupeByEmail(counterparties)
  if (counterparties.length === 0) {
    return NextResponse.json({ ok: true, skipped: 'no external party' })
  }

  const bodyText = parsed.text ?? ''
  const bodyClean = stripQuotedReply(bodyText) || bodyText
  const emailBodySnippet = bodyClean.slice(0, 50000)

  const directionLabel = direction === 'inbound' ? '收信' : '寄信'
  const contentSummary = `Outlook ${directionLabel}：${subject}`.slice(0, 500)

  const created: Array<{ contact_id: string; created: boolean; email: string }> = []
  for (const party of counterparties) {
    try {
      const result = await findOrCreateContactByEmail(supabase, {
        email: party.email,
        name: party.name,
        createdBy,
      })
      const { error: logErr } = await supabase.from('interaction_logs').insert({
        contact_id: result.id,
        type: 'email',
        direction,
        send_method: 'outlook',
        email_subject: subject,
        email_body: emailBodySnippet,
        content: contentSummary,
        created_by: createdBy,
      })
      if (logErr) {
        console.error('inbound-parse log insert failed', { email: party.email, err: logErr })
        continue
      }
      created.push({ contact_id: result.id, created: result.created, email: party.email })
    } catch (e) {
      console.error('inbound-parse contact failed', { email: party.email, err: e })
    }
  }

  return NextResponse.json({
    ok: true,
    direction,
    contacts: created.length,
    created_new: created.filter((c) => c.created).length,
  })
}
