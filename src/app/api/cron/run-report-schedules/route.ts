import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

/**
 * Vercel Cron — hourly report-schedule runner.
 *
 * report_schedules had a UI + table + a deployed send-report Edge Function, but
 * nothing ever invoked it (prod pg_cron has no send-report job) — schedules were
 * silent no-ops. This route evaluates each active schedule's cron_expr against
 * the current time (Asia/Taipei) and POSTs the Edge Function per due schedule,
 * then stamps last_run_at / last_status so the admin UI can show outcomes.
 *
 * Auth: Vercel sends Authorization: Bearer {CRON_SECRET}.
 * vercel.json: { "path": "/api/cron/run-report-schedules", "schedule": "0 * * * *" }
 */

const TZ = 'Asia/Taipei'

interface ScheduleRow {
  id: string
  name: string
  cron_expr: string | null
  is_active: boolean
  last_run_at: string | null
}

// Matches one cron field (minute/hour/dom/month/dow) against a value.
// Supports: "*", plain numbers, comma lists, ranges "a-b", steps "*/n".
// The UI presets are simple ("0 9 * * 1", "0 9 1 * *"); this covers custom
// expressions of the same shape without pulling in a cron library.
function fieldMatches(field: string, value: number): boolean {
  return field.split(',').some((part) => {
    const step = part.match(/^\*\/(\d+)$/)
    if (step) return value % Number(step[1]) === 0
    if (part === '*') return true
    const range = part.match(/^(\d+)-(\d+)$/)
    if (range) return value >= Number(range[1]) && value <= Number(range[2])
    return Number(part) === value
  })
}

// Because this cron fires hourly at :00, the minute field is compared against 0.
function isDue(cronExpr: string, now: Date): boolean {
  const parts = cronExpr.trim().split(/\s+/)
  if (parts.length !== 5) return false
  const [min, hour, dom, month, dow] = parts
  const local = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hour: 'numeric', day: 'numeric', month: 'numeric', weekday: 'short', hour12: false,
  }).formatToParts(now)
  const get = (type: string) => local.find((p) => p.type === type)?.value ?? ''
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return (
    fieldMatches(min, 0) &&
    fieldMatches(hour, Number(get('hour')) % 24) &&
    fieldMatches(dom, Number(get('day'))) &&
    fieldMatches(month, Number(get('month'))) &&
    fieldMatches(dow, dowMap[get('weekday')] ?? -1)
  )
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !anonKey) {
    return NextResponse.json({ error: 'Supabase env not configured' }, { status: 500 })
  }

  const service = createServiceClient()
  const { data: schedules, error } = await service
    .from('report_schedules')
    .select('id, name, cron_expr, is_active, last_run_at')
    .eq('is_active', true)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const now = new Date()
  const due = ((schedules ?? []) as ScheduleRow[]).filter((s) => {
    if (!s.cron_expr || !isDue(s.cron_expr, now)) return false
    // Re-entry guard: skip if already run within the last 30 minutes
    if (s.last_run_at && now.getTime() - new Date(s.last_run_at).getTime() < 30 * 60 * 1000) return false
    return true
  })

  let sent = 0
  const failures: string[] = []
  for (const schedule of due) {
    let status = 'ok'
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/send-report`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduleId: schedule.id }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || body.error) {
        status = `error: ${body.error ?? `HTTP ${res.status}`}`.slice(0, 200)
        failures.push(schedule.name)
      } else {
        sent++
      }
    } catch (e) {
      status = `error: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200)
      failures.push(schedule.name)
    }
    await service
      .from('report_schedules')
      .update({ last_run_at: new Date().toISOString(), last_status: status })
      .eq('id', schedule.id)
  }

  if (failures.length > 0) {
    console.error('[run-report-schedules] failed schedules:', failures.join(', '))
  }
  return NextResponse.json({ ok: true, due: due.length, sent, failed: failures.length })
}

export const maxDuration = 300
