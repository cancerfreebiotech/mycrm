import { NextRequest, NextResponse, after } from 'next/server'
import { simpleParser, type AddressObject, type ParsedMail } from 'mailparser'
import { createServiceClient } from '@/lib/supabase'
import { systemOrgContext, orgScopedClient } from '@/lib/orgContext'
import { findOrCreateContactByEmail } from '@/lib/findOrCreateContactByEmail'
import {
  buildHeaderBlock,
  extractForwardedFrom,
  extractForwardedParticipants,
  isForwardedSubject,
  stripQuotedReply,
} from '@/lib/parseEmailHeaders'
import { hunterEnrich } from '@/lib/hunterEnrich'

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

const ORG_DOMAIN = (process.env.ORG_EMAIL_DOMAIN ?? 'cancerfree.io').trim().toLowerCase()
const BCC_INBOX_DOMAIN = (process.env.BCC_INBOX_DOMAIN ?? 'bcc.cancerfree.io').trim().toLowerCase()

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
    console.error('[inbound-parse] unauthorized: key mismatch')
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch (e) {
    console.error('[inbound-parse] formData parse error:', (e as Error).message)
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
    console.error('[inbound-parse] no raw email field')
    return NextResponse.json(
      { error: 'no raw email field; enable "POST raw" in SendGrid Inbound Parse' },
      { status: 400 }
    )
  }

  let parsed: ParsedMail
  try {
    parsed = await simpleParser(raw)
  } catch (e) {
    console.error('[inbound-parse] simpleParser error:', (e as Error).message)
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
    console.error('[inbound-parse] no From address in parsed email')
    return NextResponse.json({ error: 'no From address' }, { status: 400 })
  }

  const hasOrgFrom = isOrgAddress(fromAddr.email)

  // Accept external-sender emails only when our inbox address is explicitly
  // in To/CC (i.e., a counterparty replied-all and the inbox was already on
  // the thread). Must also have at least one @cancerfree.io recipient so we
  // know whose interaction to attribute it to.
  const hasBccInRecipients = allRecipients.some((a) => isBccInbox(a.email))
  const orgRecipient = allRecipients.find((a) => isOrgAddress(a.email))

  if (!hasOrgFrom && !(hasBccInRecipients && orgRecipient)) {
    console.error('[inbound-parse] rejected: sender not in org', fromAddr.email)
    return NextResponse.json(
      { error: 'sender not in org; reject', from: fromAddr.email },
      { status: 400 }
    )
  }

  const supabase = createServiceClient()
  // Phase 2+: 由 payload（org 收件人 email）解析 org
  const ctx = systemOrgContext()
  const db = orgScopedClient(ctx)

  // Determine which org user to attribute the interaction to:
  // - outbound / forward: the From address (org user who sent)
  // - inbound reply from external: the org recipient found above
  const orgEmail = hasOrgFrom ? fromAddr.email : orgRecipient!.email

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

  if (!hasOrgFrom) {
    // External sender replied-all and CC'd our inbox → inbound
    direction = 'inbound'
    counterparties = [fromAddr]
  } else if (isForward) {
    direction = 'inbound'
    // Extract all participants (From + To + Cc) from the forwarded body block
    const fwdParticipants = extractForwardedParticipants(parsed.text ?? '')
    const externalFwd = fwdParticipants.filter(
      (a) => !isOrgAddress(a.email) && !isBccInbox(a.email)
    )
    if (externalFwd.length > 0) {
      counterparties = externalFwd
    } else {
      // Fallback: try single-From extraction, then outer envelope recipients
      const orig = extractForwardedFrom(parsed.text ?? '')
      if (orig && !isOrgAddress(orig.email) && !isBccInbox(orig.email)) {
        counterparties = [{ name: orig.name, email: orig.email.toLowerCase() }]
      } else {
        counterparties = allRecipients.filter(
          (a) => !isOrgAddress(a.email) && !isBccInbox(a.email)
        )
      }
    }
  } else {
    direction = 'outbound'
    counterparties = allRecipients.filter(
      (a) => !isOrgAddress(a.email) && !isBccInbox(a.email)
    )
  }

  counterparties = dedupeByEmail(counterparties)
  if (counterparties.length === 0) {
    console.warn('[inbound-parse] skipped: no external counterparties found', { from: fromAddr.email, subject: parsed.subject })
    return NextResponse.json({ ok: true, skipped: 'no external party' })
  }

  const bodyText = parsed.text ?? ''
  const bodyClean = stripQuotedReply(bodyText) || bodyText

  // Prepend From/To/Cc header block so users can see who else was on the
  // email (especially Cc — otherwise invisible in the captured log).
  const headerBlock = buildHeaderBlock({
    from: fromAddr,
    to: toList,
    cc: ccList,
  })
  const emailBodyWithHeaders = `${headerBlock}\n\n---\n\n${bodyClean}`
  const emailBodySnippet = emailBodyWithHeaders.slice(0, 50000)

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
      // erasure tombstone → 跳過，不重建也不留紀錄
      if (!result) continue
      const { error: logErr } = await db.from('interaction_logs').insert({
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

  // Hunter enrichment runs after the response is sent so SendGrid never times out
  // waiting for it. Only triggers for contacts that were just created (not existing).
  const newContacts = created.filter((c) => c.created)
  if (newContacts.length > 0) {
    after(async () => {
      for (const c of newContacts) {
        await hunterEnrich(supabase, c.contact_id, c.email, createdBy)
      }
    })
  }

  return NextResponse.json({
    ok: true,
    direction,
    contacts: created.length,
    created_new: newContacts.length,
  })
}
