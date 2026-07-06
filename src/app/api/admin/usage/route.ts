import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'
import { currentPeriod, previousPeriod } from '@/lib/usage'
import { logAdminAction } from '@/lib/adminAudit'
import { systemOrgContext, orgScopedClient } from '@/lib/orgContext'

// Metrics that can carry a monthly budget cap. Mirrors the recordUsage() call
// sites and the health-watchdog USAGE_LIMIT_PREFIX docs. Acts as a server-side
// allowlist so a PUT can never write an arbitrary system_settings key.
const BUDGET_METRICS = ['ai_call', 'ai_tokens_in', 'ai_tokens_out', 'email_sent', 'newsletter_sent'] as const
const LIMIT_PREFIX = 'usage_limit_'

// /api/admin/* is exempted from the auth middleware (src/middleware.ts), so every
// handler here MUST self-guard. Super-admin only. Returns { error } on denial,
// else the caller's service client + profile id + email (needed for the write path).
async function requireSuperAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const service = createServiceClient()
  const { data: profile } = await service.from('users').select('id, role').eq('email', user.email).single()
  if (profile?.role !== 'super_admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { service, profileId: profile.id as string, actorEmail: user.email }
}

// Parse the usage_limit_* system_settings rows into a metric → positive cap map.
// Non-numeric / ≤0 caps are dropped — same lenient rule as the health-watchdog.
function parseLimits(rows: { key: string; value: unknown }[] | null): Record<string, number> {
  const limits: Record<string, number> = {}
  for (const row of rows ?? []) {
    const metric = String(row.key).slice(LIMIT_PREFIX.length)
    const cap = Number(typeof row.value === 'string' ? row.value.trim() : row.value)
    if (metric && Number.isFinite(cap) && cap > 0) limits[metric] = cap
  }
  return limits
}

// GET — usage counters for the current period plus the previous one, and the
// configured monthly budget caps (usage_limit_<metric> in system_settings).
export async function GET() {
  const auth = await requireSuperAdmin(); if ('error' in auth) return auth.error
  const sb = auth.service

  const period = currentPeriod()
  const prev = previousPeriod()

  const [{ data: counters }, { data: limitRows }] = await Promise.all([
    sb.from('usage_counters').select('period, metric, value').in('period', [period, prev]),
    sb.from('system_settings').select('key, value').like('key', `${LIMIT_PREFIX}%`),
  ])

  const metrics: Record<string, number> = {}
  const previousMetrics: Record<string, number> = {}
  for (const row of counters ?? []) {
    const target = row.period === period ? metrics : previousMetrics
    target[row.metric as string] = Number(row.value)
  }

  return NextResponse.json({
    period,
    metrics,
    previous: { period: prev, metrics: previousMetrics },
    limits: parseLimits(limitRows as { key: string; value: unknown }[] | null),
  })
}

// PUT — set/clear monthly budget caps. Writes the SAME system_settings keys the
// health-watchdog reads (usage_limit_<metric>) so read and write stay in one
// place. A positive integer sets the cap; blank / 0 / invalid clears it (row
// deleted → watchdog treats the metric as having no limit).
export async function PUT(req: NextRequest) {
  const auth = await requireSuperAdmin(); if ('error' in auth) return auth.error

  let body: { limits?: Record<string, unknown> }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const input = body.limits ?? {}

  const now = new Date().toISOString()
  const toSet: { key: string; value: string; updated_at: string; updated_by: string }[] = []
  const toDelete: string[] = []
  const changed: Record<string, number | null> = {}

  for (const metric of BUDGET_METRICS) {
    if (!(metric in input)) continue
    const key = `${LIMIT_PREFIX}${metric}`
    const raw = input[metric]
    const num = Number(typeof raw === 'string' ? raw.trim() : raw)
    if (raw != null && (typeof raw !== 'string' || raw.trim() !== '') && Number.isFinite(num) && num > 0) {
      const cap = Math.floor(num)
      toSet.push({ key, value: String(cap), updated_at: now, updated_by: auth.profileId })
      changed[metric] = cap
    } else {
      // blank / null / 0 / negative / non-numeric → no limit for this metric.
      toDelete.push(key)
      changed[metric] = null
    }
  }

  if (toSet.length === 0 && toDelete.length === 0) {
    return NextResponse.json({ error: 'No valid metrics provided' }, { status: 400 })
  }

  if (toSet.length > 0) {
    const { error } = await auth.service.from('system_settings').upsert(toSet, { onConflict: 'key' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (toDelete.length > 0) {
    const { error } = await auth.service.from('system_settings').delete().in('key', toDelete)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await logAdminAction(orgScopedClient(systemOrgContext()), {
    actorEmail: auth.actorEmail,
    action: 'usage_budget_change',
    detail: { limits: changed },
  })

  return NextResponse.json({ ok: true, limits: changed })
}
