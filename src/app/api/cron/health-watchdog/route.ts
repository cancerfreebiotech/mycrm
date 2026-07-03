import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { sendTelegramMessage } from '@/lib/telegram'
import { runAllHealthChecks, type ServiceStatus } from '@/lib/healthChecks'
import {
  CRON_EXPECTED_INTERVAL_MIN,
  getLatestRunsPerJob,
  recordCronRun,
} from '@/lib/cronHeartbeat'

/**
 * Vercel Cron — every 10 minutes, run all service health checks and inspect the
 * cron_runs heartbeat table for overdue / failing jobs. Alerts the super admin
 * over Telegram, with debounce so an unchanged problem set is not re-sent.
 *
 * Auth: Vercel sends Authorization: Bearer {CRON_SECRET}.
 * vercel.json: { "path": "/api/cron/health-watchdog", "schedule": "*\/10 * * * *" }
 */

type ServiceClient = ReturnType<typeof createServiceClient>

const SUPER_ADMIN_EMAIL = 'pohan.chen@cancerfree.io'
const SELF_JOB = 'health-watchdog'

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function setsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const s = new Set(a)
  return b.every((x) => s.has(x))
}

// Look up the super admin's telegram_id (service client bypasses RLS) and send.
async function notifySuperAdmin(service: ServiceClient, text: string): Promise<void> {
  const { data } = await service
    .from('users')
    .select('telegram_id')
    .eq('email', SUPER_ADMIN_EMAIL)
    .single()
  const chatId = data?.telegram_id == null ? NaN : Number(data.telegram_id)
  if (!Number.isFinite(chatId) || chatId === 0) return
  await sendTelegramMessage(chatId, text)
}

function buildAlert(
  failedChecks: ServiceStatus[],
  overdueJobs: string[],
  failingJobs: string[],
): string {
  const lines: string[] = ['⚠️ <b>myCRM 監控警報</b>']
  if (failedChecks.length > 0) {
    lines.push('', '<b>服務異常：</b>')
    for (const s of failedChecks) {
      lines.push(`• ${esc(s.name)}${s.detail ? `：${esc(s.detail)}` : ''}`)
    }
  }
  if (overdueJobs.length > 0) {
    lines.push('', '<b>排程逾時（超過 3× 週期未執行）：</b>')
    for (const j of overdueJobs) lines.push(`• ${esc(j)}`)
  }
  if (failingJobs.length > 0) {
    lines.push('', '<b>排程最近一次執行失敗：</b>')
    for (const j of failingJobs) lines.push(`• ${esc(j)}`)
  }
  return lines.join('\n')
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startMs = Date.now()
  const service = createServiceClient()

  // a. Run every service health check.
  const services = await runAllHealthChecks()
  const failedChecks = services.filter((s) => s.status === 'error')

  // b. Inspect cron_runs freshness per expected job.
  const latest = await getLatestRunsPerJob(service)
  const overdueJobs: string[] = []
  const failingJobs: string[] = []
  for (const [job, expectedMin] of Object.entries(CRON_EXPECTED_INTERVAL_MIN)) {
    const run = latest[job]
    if (!run) continue
    // The watchdog excludes itself from the overdue check.
    if (job !== SELF_JOB && run.finished_at) {
      const ageMs = Date.now() - new Date(run.finished_at).getTime()
      if (ageMs > expectedMin * 3 * 60 * 1000) overdueJobs.push(job)
    }
    if (run.status === 'error') failingJobs.push(job)
  }

  // Canonical, sorted problem-key set for change detection.
  const problems: string[] = [
    ...failedChecks.map((s) => `check:${s.name}`),
    ...overdueJobs.map((j) => `overdue:${j}`),
    ...failingJobs.map((j) => `failing:${j}`),
  ].sort()

  // c. Debounce against the previous watchdog run's recorded problem set.
  const { data: prev } = await service
    .from('cron_runs')
    .select('detail')
    .eq('job', SELF_JOB)
    .order('finished_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const prevAlerted: string[] = Array.isArray(prev?.detail?.alerted) ? prev.detail.alerted : []

  let alertSent = false
  if (problems.length > 0) {
    // Only send when the problem set changed since the last alert.
    if (!setsEqual(prevAlerted, problems)) {
      await notifySuperAdmin(service, buildAlert(failedChecks, overdueJobs, failingJobs))
      alertSent = true
    }
  } else if (prevAlerted.length > 0) {
    // Everything is healthy again and we previously alerted → recovery notice.
    await notifySuperAdmin(service, '✅ <b>myCRM 監控</b>：所有服務與排程已恢復正常。')
    alertSent = true
  }

  // d. Heartbeat, persisting this run's problem set for the next debounce cycle.
  await recordCronRun(service, SELF_JOB, 'ok', { alerted: problems, alertSent }, Date.now() - startMs)

  return NextResponse.json({
    ok: problems.length === 0,
    problems,
    alertSent,
  })
}

export const maxDuration = 60
