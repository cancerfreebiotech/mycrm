import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

const SG_BASE = 'https://api.sendgrid.com/v3'
const PAGE_SIZE = 500
// Last 90 days
const START_TIME = Math.floor(Date.now() / 1000) - 90 * 24 * 60 * 60

interface SgBounce { email: string; created: number; reason: string; status: string }
interface SgInvalid { email: string; created: number; error: string }
interface SgUnsubscribe { email: string; created: number }

/** Paginate through a SendGrid suppression endpoint and return all records */
async function sgFetchAll<T>(path: string, apiKey: string, extraParams = ''): Promise<T[]> {
  const all: T[] = []
  let offset = 0
  while (true) {
    const url = `${SG_BASE}${path}?limit=${PAGE_SIZE}&offset=${offset}&start_time=${START_TIME}${extraParams}`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok) throw new Error(`SendGrid ${path} HTTP ${res.status}`)
    const page = await res.json() as T[]
    all.push(...page)
    if (page.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }
  return all
}

/**
 * Find contacts in DB matching a list of emails, create system interaction logs
 * for those that don't already have a log matching the given content prefix.
 * Only creates logs for contacts that exist in CRM (no-match emails are ignored).
 */
async function createSendGridLogs(
  supabase: ReturnType<typeof createServiceClient>,
  emailToInfo: Map<string, { created: number; content: string }>,
  contentPrefix: string,
) {
  if (emailToInfo.size === 0) return 0

  const emails = Array.from(emailToInfo.keys())

  // Find matching CRM contacts
  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, email')
    .in('email', emails)
    .is('deleted_at', null)
  if (!contacts || contacts.length === 0) return 0

  const contactIds = contacts.map((c) => c.id)

  // Check which contacts already have a SendGrid log of this type
  const { data: existingLogs } = await supabase
    .from('interaction_logs')
    .select('contact_id')
    .in('contact_id', contactIds)
    .eq('type', 'system')
    .ilike('content', `${contentPrefix}%`)

  const alreadyLogged = new Set((existingLogs ?? []).map((l) => l.contact_id))

  // Build log rows only for contacts that don't have one yet
  const logRows = contacts
    .filter((c) => !alreadyLogged.has(c.id))
    .map((c) => {
      const info = emailToInfo.get(c.email!.toLowerCase())!
      return {
        contact_id: c.id,
        type: 'system',
        content: info.content,
        created_at: new Date(info.created * 1000).toISOString(),
      }
    })

  if (logRows.length > 0) {
    await supabase.from('interaction_logs').insert(logRows)
  }
  return logRows.length
}

async function runImport() {
  const apiKey = process.env.SENDGRID_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'SENDGRID_API_KEY not configured' }, { status: 500 })
  }

  const supabase = createServiceClient()
  const result = { bounces: 0, invalidEmails: 0, unsubscribes: 0, logsCreated: 0, errors: [] as string[] }

  // 1. Hard bounces → blacklist + contacts + logs
  try {
    const bounces = await sgFetchAll<SgBounce>('/suppression/bounces', apiKey)
    if (bounces.length > 0) {
      const rows = bounces.map((b) => ({
        email: b.email.toLowerCase().trim(),
        reason: `hard_bounce: ${b.reason ?? b.status ?? ''}`.slice(0, 200),
      }))
      const { error } = await supabase
        .from('newsletter_blacklist')
        .upsert(rows, { onConflict: 'email' })
      if (error) throw new Error(error.message)

      const emails = rows.map((r) => r.email)
      await supabase.from('contacts').update({ email_status: 'bounced' }).in('email', emails).is('deleted_at', null)

      // Build log map: email → { created, content }
      const emailToInfo = new Map(bounces.map((b) => [
        b.email.toLowerCase().trim(),
        {
          created: b.created,
          content: `SendGrid 硬退信：${(b.reason ?? b.status ?? '').slice(0, 200)}`,
        },
      ]))
      result.logsCreated += await createSendGridLogs(supabase, emailToInfo, 'SendGrid 硬退信')
      result.bounces = rows.length
    }
  } catch (e) {
    result.errors.push(`bounces: ${e instanceof Error ? e.message : String(e)}`)
  }

  // 2. Invalid emails → blacklist + contacts + logs
  try {
    const invalids = await sgFetchAll<SgInvalid>('/suppression/invalid_emails', apiKey)
    if (invalids.length > 0) {
      const rows = invalids.map((i) => ({
        email: i.email.toLowerCase().trim(),
        reason: `invalid_email: ${i.error ?? ''}`.slice(0, 200),
      }))
      const { error } = await supabase
        .from('newsletter_blacklist')
        .upsert(rows, { onConflict: 'email' })
      if (error) throw new Error(error.message)

      const emails = rows.map((r) => r.email)
      await supabase.from('contacts').update({ email_status: 'invalid' }).in('email', emails).is('deleted_at', null)

      const emailToInfo = new Map(invalids.map((i) => [
        i.email.toLowerCase().trim(),
        {
          created: i.created,
          content: `SendGrid 無效信箱：${(i.error ?? '').slice(0, 200)}`,
        },
      ]))
      result.logsCreated += await createSendGridLogs(supabase, emailToInfo, 'SendGrid 無效信箱')
      result.invalidEmails = rows.length
    }
  } catch (e) {
    result.errors.push(`invalid_emails: ${e instanceof Error ? e.message : String(e)}`)
  }

  // 3. Unsubscribes → newsletter_unsubscribes + contacts + logs
  try {
    const unsubs = await sgFetchAll<SgUnsubscribe>('/suppression/unsubscribes', apiKey)
    if (unsubs.length > 0) {
      const rows = unsubs.map((u) => ({
        email: u.email.toLowerCase().trim(),
        source: 'sendgrid_import',
        reason: 'SendGrid global unsubscribe',
        unsubscribed_at: new Date(u.created * 1000).toISOString(),
      }))
      const { error } = await supabase
        .from('newsletter_unsubscribes')
        .upsert(rows, { onConflict: 'email' })
      if (error) throw new Error(error.message)

      const emails = rows.map((r) => r.email)
      await supabase.from('contacts').update({ email_status: 'unsubscribed' }).in('email', emails).is('deleted_at', null)

      const emailToInfo = new Map(unsubs.map((u) => [
        u.email.toLowerCase().trim(),
        {
          created: u.created,
          content: 'SendGrid 已退訂：global unsubscribe',
        },
      ]))
      result.logsCreated += await createSendGridLogs(supabase, emailToInfo, 'SendGrid 已退訂')
      result.unsubscribes = rows.length
    }
  } catch (e) {
    result.errors.push(`unsubscribes: ${e instanceof Error ? e.message : String(e)}`)
  }

  const total = result.bounces + result.invalidEmails + result.unsubscribes
  return NextResponse.json({ ok: result.errors.length === 0, total, ...result })
}

/**
 * POST /api/sendgrid/import-suppressions
 * Fetches SendGrid suppression lists (last 90 days, paginated) and:
 *   1. Upserts into newsletter_blacklist / newsletter_unsubscribes
 *   2. Updates contacts.email_status
 *   3. Creates system interaction logs for matched CRM contacts
 */
export async function POST() {
  return runImport()
}

/**
 * GET /api/sendgrid/import-suppressions
 * Vercel Cron entry point. Authenticates via CRON_SECRET bearer token.
 * vercel.json: { "path": "/api/sendgrid/import-suppressions", "schedule": "0 19 * * *" }
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return runImport()
}
