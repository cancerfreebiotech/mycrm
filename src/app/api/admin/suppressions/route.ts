import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'
import type { SupabaseClient } from '@supabase/supabase-js'

// /api/admin/* is exempted from the auth middleware (src/middleware.ts), so this
// handler MUST self-guard. Super-admin only. Mirrors /api/admin/hunter.
// Returns { error } on denial, else { email } of the authenticated super_admin.
async function requireSuperAdmin(): Promise<{ error: NextResponse } | { email: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const service = createServiceClient()
  const { data: profile } = await service.from('users').select('role').eq('email', user.email).single()
  if (profile?.role !== 'super_admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { email: user.email }
}

// Basic email syntax — also guards the PostgREST .or() filter value below.
const VALID_EMAIL = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/

// The five scattered places that decide "can we email this address":
export type SuppressionSourceKey =
  | 'contact_opt_out'   // contacts.email_opt_out = true (CRM send path honors this)
  | 'contact_status'    // contacts.email_status IS NOT NULL (send worker suppresses on ANY non-null)
  | 'blacklist'         // present in newsletter_blacklist
  | 'unsubscribe'       // present in newsletter_unsubscribes (global block)
  | 'subscriber_unsub'  // newsletter_subscribers.unsubscribed_at IS NOT NULL

export interface SuppressionReason {
  source: SuppressionSourceKey
  detail: string | null
}

export interface SuppressionVerdict {
  email: string
  canEmail: boolean
  reasons: SuppressionReason[]
  sources: {
    contact_opt_out: boolean
    contact_status: string | null
    blacklist: { status: string | null; reason: string | null } | null
    unsubscribe: { reason: string | null; unsubscribed_at: string | null } | null
    subscriber_unsub: string | null
  }
}

// Shared "can we email this address?" resolver. Matches the newsletter send
// worker's semantics (src/lib/newsletter-send-worker.ts): a contact with ANY
// non-null email_status is suppressed, and presence in the blacklist /
// unsubscribes tables suppresses. Additionally honors email_opt_out (the CRM
// direct-send path in /api/email/send) and per-subscriber unsubscribed_at, so
// the verdict is the strict union of every suppression signal.
export async function checkSuppression(service: SupabaseClient, rawEmail: string): Promise<SuppressionVerdict> {
  const email = rawEmail.trim().toLowerCase()

  const [contactsRes, blRes, unsubRes, subRes] = await Promise.all([
    service.from('contacts')
      .select('email_opt_out, email_status')
      .or(`email.ilike.${email},second_email.ilike.${email}`)
      .is('deleted_at', null),
    service.from('newsletter_blacklist').select('status, reason').ilike('email', email).limit(1),
    service.from('newsletter_unsubscribes').select('reason, unsubscribed_at').ilike('email', email).limit(1),
    service.from('newsletter_subscribers').select('unsubscribed_at').ilike('email', email)
      .not('unsubscribed_at', 'is', null).limit(1),
  ])

  const contactRows = (contactsRes.data ?? []) as { email_opt_out: boolean | null; email_status: string | null }[]
  const optOut = contactRows.some((c) => c.email_opt_out === true)
  const status = contactRows.map((c) => c.email_status).find((s): s is string => !!s) ?? null

  const bl = (blRes.data?.[0] ?? null) as { status: string | null; reason: string | null } | null
  const unsub = (unsubRes.data?.[0] ?? null) as { reason: string | null; unsubscribed_at: string | null } | null
  const subUnsubAt = (subRes.data?.[0]?.unsubscribed_at ?? null) as string | null

  const reasons: SuppressionReason[] = []
  if (optOut) reasons.push({ source: 'contact_opt_out', detail: null })
  if (status) reasons.push({ source: 'contact_status', detail: status })
  if (bl) reasons.push({ source: 'blacklist', detail: bl.status ?? bl.reason ?? null })
  if (unsub) reasons.push({ source: 'unsubscribe', detail: unsub.reason ?? null })
  if (subUnsubAt) reasons.push({ source: 'subscriber_unsub', detail: subUnsubAt })

  return {
    email,
    canEmail: reasons.length === 0,
    reasons,
    sources: {
      contact_opt_out: optOut,
      contact_status: status,
      blacklist: bl,
      unsubscribe: unsub,
      subscriber_unsub: subUnsubAt,
    },
  }
}

interface RecentEntry {
  source: SuppressionSourceKey
  email: string
  detail: string | null
  at: string | null
}

// GET
//   ?email=<addr> → per-source status + final verdict for one address
//   (no param)    → summary counts per source + recent 50 suppressed entries
export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin(); if ('error' in auth) return auth.error
  const service = createServiceClient()

  const emailParam = req.nextUrl.searchParams.get('email')?.trim()
  if (emailParam) {
    if (!VALID_EMAIL.test(emailParam)) return NextResponse.json({ error: 'invalid email' }, { status: 400 })
    const verdict = await checkSuppression(service, emailParam)
    return NextResponse.json({ verdict })
  }

  // ── Summary counts per source ──
  const [optOutC, statusC, blC, unsubC, subC] = await Promise.all([
    service.from('contacts').select('id', { count: 'exact', head: true }).eq('email_opt_out', true).is('deleted_at', null),
    service.from('contacts').select('id', { count: 'exact', head: true }).not('email_status', 'is', null).is('deleted_at', null),
    service.from('newsletter_blacklist').select('id', { count: 'exact', head: true }),
    service.from('newsletter_unsubscribes').select('id', { count: 'exact', head: true }),
    service.from('newsletter_subscribers').select('id', { count: 'exact', head: true }).not('unsubscribed_at', 'is', null),
  ])

  const summary = {
    contact_opt_out: optOutC.count ?? 0,
    contact_status: statusC.count ?? 0,
    blacklist: blC.count ?? 0,
    unsubscribe: unsubC.count ?? 0,
    subscriber_unsub: subC.count ?? 0,
  }

  // ── Recent 50 suppressed entries (union across sources, newest first) ──
  const [blRows, unsubRows, subRows, statusRows, optOutRows] = await Promise.all([
    service.from('newsletter_blacklist').select('email, status, reason, created_at')
      .order('created_at', { ascending: false }).limit(50),
    service.from('newsletter_unsubscribes').select('email, reason, unsubscribed_at')
      .order('unsubscribed_at', { ascending: false }).limit(50),
    service.from('newsletter_subscribers').select('email, unsubscribed_at')
      .not('unsubscribed_at', 'is', null).order('unsubscribed_at', { ascending: false }).limit(50),
    service.from('contacts').select('email, email_status, created_at')
      .not('email_status', 'is', null).is('deleted_at', null).order('created_at', { ascending: false }).limit(50),
    service.from('contacts').select('email, created_at')
      .eq('email_opt_out', true).is('deleted_at', null).order('created_at', { ascending: false }).limit(50),
  ])

  const entries: RecentEntry[] = [
    ...((blRows.data ?? []) as { email: string; status: string | null; reason: string | null; created_at: string }[])
      .map((r) => ({ source: 'blacklist' as const, email: r.email, detail: r.status ?? r.reason ?? null, at: r.created_at })),
    ...((unsubRows.data ?? []) as { email: string; reason: string | null; unsubscribed_at: string }[])
      .map((r) => ({ source: 'unsubscribe' as const, email: r.email, detail: r.reason ?? null, at: r.unsubscribed_at })),
    ...((subRows.data ?? []) as { email: string; unsubscribed_at: string }[])
      .map((r) => ({ source: 'subscriber_unsub' as const, email: r.email, detail: null, at: r.unsubscribed_at })),
    ...((statusRows.data ?? []) as { email: string | null; email_status: string; created_at: string }[])
      .map((r) => ({ source: 'contact_status' as const, email: r.email ?? '', detail: r.email_status, at: r.created_at })),
    ...((optOutRows.data ?? []) as { email: string | null; created_at: string }[])
      .map((r) => ({ source: 'contact_opt_out' as const, email: r.email ?? '', detail: null, at: r.created_at })),
  ]

  const recent = entries
    .filter((e) => !!e.email && !!e.at)
    .sort((a, b) => (b.at as string).localeCompare(a.at as string))
    .slice(0, 50)

  return NextResponse.json({ summary, recent })
}
