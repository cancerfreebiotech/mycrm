import { NextRequest, NextResponse } from 'next/server'
import { simpleParser, type AddressObject, type ParsedMail } from 'mailparser'
import { createServiceClient } from '@/lib/supabase'
import { findOrCreateContactByEmail } from '@/lib/findOrCreateContactByEmail'
import {
  extractForwardedFrom,
  isForwardedSubject,
  stripQuotedReply,
} from '@/lib/parseEmailHeaders'

// POST /api/inbound-email
// Receives a raw RFC822 message from the Cloudflare Email Worker.
// Auth: header `X-Inbound-Secret` must match env INBOUND_PARSE_SECRET.
// Always returns 200 unless secret is wrong (401) or body is unparseable (400).
// 5xx triggers Worker retry — only return 5xx for actual transient failures.

export const runtime = 'nodejs'
// Allow up to 30s; mailparser + DB writes for big mails can take a while.
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
  const provided = req.headers.get('x-inbound-secret') ?? ''
  const expected = process.env.INBOUND_PARSE_SECRET ?? ''
  if (!expected || provided !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const raw = await req.text()
  if (!raw || raw.length < 10) {
    return NextResponse.json({ error: 'empty body' }, { status: 400 })
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

  // Security: only accept email when an org address appears somewhere
  // (sender or recipient). Blocks unrelated mail being dumped into the inbox.
  const hasOrgFrom = isOrgAddress(fromAddr.email)
  const hasOrgRecipient = allRecipients.some((a) => isOrgAddress(a.email))
  if (!hasOrgFrom && !hasOrgRecipient) {
    return NextResponse.json({ error: 'no org party' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Identify the cancerfree-side user. Priority: From if org, else first org recipient.
  // This becomes interaction_logs.created_by.
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
    // Fallback: super_admin pohan.chen@cancerfree.io
    const { data: superAdmin } = await supabase
      .from('users')
      .select('id')
      .ilike('email', 'pohan.chen@cancerfree.io')
      .maybeSingle()
    createdBy = superAdmin?.id ?? null
  }

  const subject = parsed.subject ?? ''
  const isForward = isForwardedSubject(subject)

  // Determine direction + the "other party" (contact side)
  // - BCC outbound: sender is org user, recipients include external addresses → outbound
  // - Forwarded inbound: sender is org user, subject is "Fwd:", body has "From: ..." → inbound
  let direction: 'inbound' | 'outbound'
  let counterparties: AddressEntry[] = []

  if (isForward && hasOrgFrom) {
    direction = 'inbound'
    const orig = extractForwardedFrom(parsed.text ?? '')
    if (orig) {
      counterparties = [{ name: orig.name, email: orig.email.toLowerCase() }]
    } else {
      // Fallback: treat external recipients as the contacts
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
    // External sender → an external party emailed an org user directly to the BCC inbox.
    // Treat as inbound; the external sender is the contact.
    direction = 'inbound'
    counterparties = [fromAddr]
  }

  counterparties = dedupeByEmail(counterparties)
  if (counterparties.length === 0) {
    // Nothing to attach to — likely an internal-only mail. Skip silently.
    return NextResponse.json({ ok: true, skipped: 'no external party' })
  }

  const bodyText = parsed.text ?? ''
  const bodyClean = stripQuotedReply(bodyText) || bodyText
  const emailBodySnippet = bodyClean.slice(0, 50000) // hard cap 50KB

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
        console.error('inbound-email log insert failed', { email: party.email, err: logErr })
        continue
      }
      created.push({ contact_id: result.id, created: result.created, email: party.email })
    } catch (e) {
      console.error('inbound-email contact failed', { email: party.email, err: e })
    }
  }

  return NextResponse.json({
    ok: true,
    direction,
    contacts: created.length,
    created_new: created.filter((c) => c.created).length,
  })
}
