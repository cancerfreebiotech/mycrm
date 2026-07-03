import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase'
import { CRON_EXPECTED_INTERVAL_MIN, getLatestRunsPerJob } from '@/lib/cronHeartbeat'

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

// GET — one row per expected cron job with its latest heartbeat + overdue flag.
export async function GET() {
  const denied = await requireSuperAdmin(); if (denied) return denied

  const service = createServiceClient()
  const latest = await getLatestRunsPerJob(service)
  const now = Date.now()

  const jobs = Object.entries(CRON_EXPECTED_INTERVAL_MIN).map(([job, expected]) => {
    const run = latest[job]
    const overdue = !!run?.finished_at &&
      now - new Date(run.finished_at).getTime() > expected * 3 * 60 * 1000
    return {
      job,
      last_status: run?.status ?? null,
      last_finished_at: run?.finished_at ?? null,
      duration_ms: run?.duration_ms ?? null,
      overdue,
      expected_interval_min: expected,
    }
  })

  return NextResponse.json({ jobs })
}
