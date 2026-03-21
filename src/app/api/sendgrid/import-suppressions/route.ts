import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

const SG_BASE = 'https://api.sendgrid.com/v3'

interface SgBounce { email: string; created: number; reason: string; status: string }
interface SgInvalid { email: string; created: number; error: string }
interface SgUnsubscribe { email: string; created: number }

async function sgFetch<T>(path: string, apiKey: string): Promise<T[]> {
  const res = await fetch(`${SG_BASE}${path}?limit=500&offset=0`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`SendGrid ${path} HTTP ${res.status}`)
  return res.json() as Promise<T[]>
}

/**
 * POST /api/sendgrid/import-suppressions
 * Fetches three SendGrid suppression lists and upserts into Supabase:
 *   - /suppression/bounces        → newsletter_blacklist (reason: hard_bounce)
 *   - /suppression/invalid_emails → newsletter_blacklist (reason: invalid_email)
 *   - /suppression/unsubscribes   → newsletter_unsubscribes (source: sendgrid_import)
 */
export async function POST() {
  const apiKey = process.env.SENDGRID_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'SENDGRID_API_KEY not configured' }, { status: 500 })
  }

  const supabase = createServiceClient()
  const result = { bounces: 0, invalidEmails: 0, unsubscribes: 0, errors: [] as string[] }

  // 1. Hard bounces → blacklist
  try {
    const bounces = await sgFetch<SgBounce>('/suppression/bounces', apiKey)
    if (bounces.length > 0) {
      const rows = bounces.map((b) => ({
        email: b.email.toLowerCase().trim(),
        reason: `hard_bounce: ${b.reason ?? b.status ?? ''}`.slice(0, 200),
      }))
      const { error } = await supabase
        .from('newsletter_blacklist')
        .upsert(rows, { onConflict: 'email' })
      if (error) throw new Error(error.message)
      result.bounces = rows.length
    }
  } catch (e) {
    result.errors.push(`bounces: ${e instanceof Error ? e.message : String(e)}`)
  }

  // 2. Invalid emails → blacklist
  try {
    const invalids = await sgFetch<SgInvalid>('/suppression/invalid_emails', apiKey)
    if (invalids.length > 0) {
      const rows = invalids.map((i) => ({
        email: i.email.toLowerCase().trim(),
        reason: `invalid_email: ${i.error ?? ''}`.slice(0, 200),
      }))
      const { error } = await supabase
        .from('newsletter_blacklist')
        .upsert(rows, { onConflict: 'email' })
      if (error) throw new Error(error.message)
      result.invalidEmails = rows.length
    }
  } catch (e) {
    result.errors.push(`invalid_emails: ${e instanceof Error ? e.message : String(e)}`)
  }

  // 3. Global unsubscribes → newsletter_unsubscribes
  try {
    const unsubs = await sgFetch<SgUnsubscribe>('/suppression/unsubscribes', apiKey)
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
      result.unsubscribes = rows.length
    }
  } catch (e) {
    result.errors.push(`unsubscribes: ${e instanceof Error ? e.message : String(e)}`)
  }

  const total = result.bounces + result.invalidEmails + result.unsubscribes
  return NextResponse.json({ ok: result.errors.length === 0, total, ...result })
}
