import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'
import { systemOrgContext, orgScopedClient, type OrgDb } from '@/lib/orgContext'
import { recordCronRun } from '@/lib/cronHeartbeat'

const SG_BASE = 'https://api.sendgrid.com/v3'
const PAGE_SIZE = 500
// Last 90 days
const START_TIME = Math.floor(Date.now() / 1000) - 90 * 24 * 60 * 60

interface SgBounce { email: string; created: number; reason: string; status: string }
interface SgInvalid { email: string; created: number; error: string }
interface SgUnsubscribe { email: string; created: number }
interface SgBlock { email: string; created: number; reason: string; status: string }
interface SgSpamReport { email: string; created: number; ip?: string }

/** Dedupe rows by `email` (keep last) — a single upsert can't touch the same
 *  ON CONFLICT key twice, which SendGrid lists occasionally contain. */
function dedupeByEmail<T extends { email: string }>(rows: T[]): T[] {
  const m = new Map<string, T>()
  for (const r of rows) m.set(r.email, r)
  return [...m.values()]
}

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
  supabase: OrgDb,
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
    .is('deleted_at', null) as { data: { id: string; email: string | null }[] | null }
  if (!contacts || contacts.length === 0) return 0

  const contactIds = contacts.map((c) => c.id)

  // Check which contacts already have a SendGrid log of this type
  const { data: existingLogs } = await supabase
    .from('interaction_logs')
    .select('contact_id')
    .in('contact_id', contactIds)
    .eq('type', 'system')
    .ilike('content', `${contentPrefix}%`) as { data: { contact_id: string }[] | null }

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

  // Phase 2+: 逐 org 迭代／由 payload 解析 org
  const ctx = systemOrgContext()
  const db = orgScopedClient(ctx)
  const result = { bounces: 0, invalidEmails: 0, unsubscribes: 0, blocks: 0, spamReports: 0, logsCreated: 0, errors: [] as string[] }

  // 1. Hard bounces → blacklist + contacts + logs
  try {
    const bounces = await sgFetchAll<SgBounce>('/suppression/bounces', apiKey)
    if (bounces.length > 0) {
      const rows = bounces.map((b) => ({
        email: b.email.toLowerCase().trim(),
        reason: `hard_bounce: ${b.reason ?? b.status ?? ''}`.slice(0, 200),
      }))
      const emails = rows.map((r) => r.email)

      // Update contacts.email_status for CRM contacts (canonical source for contacts)
      await db.from('contacts').update({ email_status: 'bounced' }).in('email', emails).is('deleted_at', null)

      // Find which emails have matching CRM contacts — those skip blacklist (status is enough)
      const { data: matchingContacts } = await db
        .from('contacts').select('email').in('email', emails).is('deleted_at', null)
      const contactEmails = new Set(((matchingContacts ?? []) as { email: string }[]).map((c) => c.email.toLowerCase().trim()))
      const blacklistRows = rows.filter((r) => !contactEmails.has(r.email))

      if (blacklistRows.length > 0) {
        const { error } = await db
          .from('newsletter_blacklist')
          .upsert(dedupeByEmail(blacklistRows), { onConflict: 'email' })
        if (error) throw new Error(error.message)
      }

      // Build log map: email → { created, content }
      const emailToInfo = new Map(bounces.map((b) => [
        b.email.toLowerCase().trim(),
        {
          created: b.created,
          content: `SendGrid 硬退信：${(b.reason ?? b.status ?? '').slice(0, 200)}`,
        },
      ]))
      result.logsCreated += await createSendGridLogs(db, emailToInfo, 'SendGrid 硬退信')
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
      const emails = rows.map((r) => r.email)

      await db.from('contacts').update({ email_status: 'invalid' }).in('email', emails).is('deleted_at', null)

      const { data: matchingContacts } = await db
        .from('contacts').select('email').in('email', emails).is('deleted_at', null)
      const contactEmails = new Set(((matchingContacts ?? []) as { email: string }[]).map((c) => c.email.toLowerCase().trim()))
      const blacklistRows = rows.filter((r) => !contactEmails.has(r.email))

      if (blacklistRows.length > 0) {
        const { error } = await db
          .from('newsletter_blacklist')
          .upsert(dedupeByEmail(blacklistRows), { onConflict: 'email' })
        if (error) throw new Error(error.message)
      }

      const emailToInfo = new Map(invalids.map((i) => [
        i.email.toLowerCase().trim(),
        {
          created: i.created,
          content: `SendGrid 無效信箱：${(i.error ?? '').slice(0, 200)}`,
        },
      ]))
      result.logsCreated += await createSendGridLogs(db, emailToInfo, 'SendGrid 無效信箱')
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
      const { error } = await db
        .from('newsletter_unsubscribes')
        .upsert(dedupeByEmail(rows), { onConflict: 'email' })
      if (error) throw new Error(error.message)

      const emails = rows.map((r) => r.email)
      await db.from('contacts').update({ email_status: 'unsubscribed' }).in('email', emails).is('deleted_at', null)

      const emailToInfo = new Map(unsubs.map((u) => [
        u.email.toLowerCase().trim(),
        {
          created: u.created,
          content: 'SendGrid 已退訂：global unsubscribe',
        },
      ]))
      result.logsCreated += await createSendGridLogs(db, emailToInfo, 'SendGrid 已退訂')
      result.unsubscribes = rows.length
    }
  } catch (e) {
    result.errors.push(`unsubscribes: ${e instanceof Error ? e.message : String(e)}`)
  }

  // 4. Blocks → recipient_blocked status + blacklist + logs
  //    (receiving server rejected delivery; SendGrid suppresses until cleared)
  try {
    const blocks = await sgFetchAll<SgBlock>('/suppression/blocks', apiKey)
    if (blocks.length > 0) {
      const rows = blocks.map((b) => ({
        email: b.email.toLowerCase().trim(),
        status: 'recipient_blocked',
        reason: `block: ${(b.reason ?? b.status ?? '').slice(0, 180)}`.slice(0, 200),
      }))
      const emails = rows.map((r) => r.email)

      await db.from('contacts').update({ email_status: 'recipient_blocked' }).in('email', emails).is('deleted_at', null)

      const { data: matchingContacts } = await db
        .from('contacts').select('email').in('email', emails).is('deleted_at', null)
      const contactEmails = new Set(((matchingContacts ?? []) as { email: string }[]).map((c) => c.email.toLowerCase().trim()))
      const blacklistRows = rows.filter((r) => !contactEmails.has(r.email))
      if (blacklistRows.length > 0) {
        const { error } = await db.from('newsletter_blacklist').upsert(dedupeByEmail(blacklistRows), { onConflict: 'email' })
        if (error) throw new Error(error.message)
      }

      const emailToInfo = new Map(blocks.map((b) => [
        b.email.toLowerCase().trim(),
        { created: b.created, content: `SendGrid 被擋下：${(b.reason ?? b.status ?? '').slice(0, 200)}` },
      ]))
      result.logsCreated += await createSendGridLogs(db, emailToInfo, 'SendGrid 被擋下')
      result.blocks = rows.length
    }
  } catch (e) {
    result.errors.push(`blocks: ${e instanceof Error ? e.message : String(e)}`)
  }

  // 5. Spam reports → spam_report status + newsletter_unsubscribes + logs
  //    A spam complaint is a hard "never email again" (legal), so we also write
  //    it to newsletter_unsubscribes to guarantee send-time exclusion.
  try {
    const spam = await sgFetchAll<SgSpamReport>('/suppression/spam_reports', apiKey)
    if (spam.length > 0) {
      const emails = spam.map((s) => s.email.toLowerCase().trim())

      await db.from('contacts').update({ email_status: 'spam_report' }).in('email', emails).is('deleted_at', null)

      const unsubRows = spam.map((s) => ({
        email: s.email.toLowerCase().trim(),
        source: 'sendgrid_spam_report',
        reason: 'SendGrid spam report (recipient marked as spam)',
        unsubscribed_at: new Date(s.created * 1000).toISOString(),
      }))
      const { error } = await db.from('newsletter_unsubscribes').upsert(dedupeByEmail(unsubRows), { onConflict: 'email' })
      if (error) throw new Error(error.message)

      const emailToInfo = new Map(spam.map((s) => [
        s.email.toLowerCase().trim(),
        { created: s.created, content: 'SendGrid 垃圾信檢舉：recipient marked as spam' },
      ]))
      result.logsCreated += await createSendGridLogs(db, emailToInfo, 'SendGrid 垃圾信檢舉')
      result.spamReports = emails.length
    }
  } catch (e) {
    result.errors.push(`spam_reports: ${e instanceof Error ? e.message : String(e)}`)
  }

  const total = result.bounces + result.invalidEmails + result.unsubscribes + result.blocks + result.spamReports
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
  // /api/sendgrid/* is exempted from the auth middleware, so guard the manual
  // (dashboard) trigger with a super-admin session check. The GET/cron path uses CRON_SECRET.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const service = createServiceClient()
  const { data: profile } = await service.from('users').select('role').eq('email', user.email).single()
  if (profile?.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
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

  // Heartbeat only on the cron (GET) path — the manual POST import is not recorded.
  const startMs = Date.now()
  const res = await runImport()
  try {
    const body = await res.clone().json()
    const status: 'ok' | 'error' = body?.ok === false || body?.error ? 'error' : 'ok'
    await recordCronRun(createServiceClient(), 'import-suppressions', status, body, Date.now() - startMs)
  } catch { /* recording must never break the cron response */ }
  return res
}
