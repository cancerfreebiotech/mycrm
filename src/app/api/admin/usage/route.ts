import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'
import { currentPeriod, previousPeriod } from '@/lib/usage'

// /api/admin/* is exempted from the auth middleware (src/middleware.ts), so every
// handler here MUST self-guard. Super-admin only. Returns a response on denial, else null.
async function requireSuperAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const service = createServiceClient()
  const { data: profile } = await service.from('users').select('role').eq('email', user.email).single()
  if (profile?.role !== 'super_admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return null
}

// GET — usage counters for the current period plus the previous one.
export async function GET() {
  const denied = await requireSuperAdmin(); if (denied) return denied
  const sb = createServiceClient()

  const period = currentPeriod()
  const prev = previousPeriod()

  const { data } = await sb
    .from('usage_counters')
    .select('period, metric, value')
    .in('period', [period, prev])

  const metrics: Record<string, number> = {}
  const previousMetrics: Record<string, number> = {}
  for (const row of data ?? []) {
    const target = row.period === period ? metrics : previousMetrics
    target[row.metric as string] = Number(row.value)
  }

  return NextResponse.json({
    period,
    metrics,
    previous: { period: prev, metrics: previousMetrics },
  })
}
