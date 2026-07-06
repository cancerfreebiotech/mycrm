import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { sendTelegramMessage } from '@/lib/telegram'
import { runAllHealthChecks, type ServiceStatus } from '@/lib/healthChecks'
import {
  CRON_EXPECTED_INTERVAL_MIN,
  getLatestRunsPerJob,
  recordCronRun,
} from '@/lib/cronHeartbeat'
import { currentPeriod } from '@/lib/usage'
import { getOrgSettings } from '@/lib/orgSettings'

/**
 * Vercel Cron — every 10 minutes, run all service health checks and inspect the
 * cron_runs heartbeat table for overdue / failing jobs. Alerts the super admin
 * over Telegram, with debounce so an unchanged problem set is not re-sent.
 *
 * Auth: Vercel sends Authorization: Bearer {CRON_SECRET}.
 * vercel.json: { "path": "/api/cron/health-watchdog", "schedule": "*\/10 * * * *" }
 */

type ServiceClient = ReturnType<typeof createServiceClient>

const SELF_JOB = 'health-watchdog'

// ── Usage budget alerts ─────────────────────────────────────────────────────
// Any system_settings row keyed `usage_limit_<metric>` (value = monthly numeric
// cap, stored as text) arms a proactive budget alert for the matching
// usage_counters.metric. Nothing configured → no rows → no keys → zero change.
//
// Supported <metric> values mirror the recordUsage() call sites (src/lib/usage.ts):
//   usage_limit_ai_call         — AI (Gemini/Portkey) completions      (src/lib/gemini.ts)
//   usage_limit_ai_tokens_in    — AI prompt tokens                     (src/lib/gemini.ts)
//   usage_limit_ai_tokens_out   — AI completion tokens                 (src/lib/gemini.ts)
//   usage_limit_email_sent      — transactional emails sent            (src/app/api/email/send)
//   usage_limit_newsletter_sent — newsletter recipients sent           (src/lib/newsletter-send-worker.ts)
const USAGE_LIMIT_PREFIX = 'usage_limit_'

interface UsageAlert {
  key: string // debounce problem key: usage:<metric>:80 | usage:<metric>:100
  metric: string
  value: number
  cap: number
  pct: number
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function setsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const s = new Set(a)
  return b.every((x) => s.has(x))
}

// Look up the super admin's telegram_id (service client bypasses RLS) and send.
// Email fallback (independent of Telegram) — the alert often warns that Telegram
// itself is down, so a Telegram-only alert can never arrive. Sends directly via
// SendGrid; never throws (best-effort second channel).
async function sendEmailAlert(text: string, ownerEmail: string): Promise<void> {
  const sgKey = process.env.SENDGRID_API_KEY
  const fromEmail = process.env.SENDGRID_FROM_EMAIL
  if (!sgKey || !fromEmail) {
    console.error('[health-watchdog] email fallback unavailable: SendGrid not configured')
    return
  }
  try {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${sgKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: { email: fromEmail, name: 'myCRM 監控' },
        subject: '⚠️ myCRM 監控警報',
        content: [{ type: 'text/html', value: text.replace(/\n/g, '<br>') }],
        personalizations: [{ to: [{ email: ownerEmail }] }],
      }),
    })
    if (!res.ok) console.error('[health-watchdog] email fallback failed:', res.status, (await res.text()).slice(0, 200))
  } catch (e) {
    console.error('[health-watchdog] email fallback exception:', e)
  }
}

async function notifyOwner(service: ServiceClient, text: string, ownerEmail: string): Promise<void> {
  const { data } = await service
    .from('users')
    .select('telegram_id')
    .eq('email', ownerEmail)
    .single()
  const chatId = data?.telegram_id == null ? NaN : Number(data.telegram_id)
  let telegramDelivered = false
  if (Number.isFinite(chatId) && chatId !== 0) {
    try {
      await sendTelegramMessage(chatId, text)
      telegramDelivered = true
    } catch (e) {
      console.error('[health-watchdog] telegram alert failed, falling back to email:', e)
    }
  }
  // Fall back to email when Telegram is unconfigured or the send failed (e.g.
  // Telegram is the very service being reported as down).
  if (!telegramDelivered) await sendEmailAlert(text, ownerEmail)
}

// Read configured usage budgets and compare against this period's counters.
// Returns one entry per breached threshold (≥80% or ≥100%). Never throws hard on
// a missing/blank cap — non-numeric or ≤0 caps are ignored.
async function checkUsageBudgets(service: ServiceClient): Promise<UsageAlert[]> {
  const { data: settings } = await service
    .from('system_settings')
    .select('key, value')
    .like('key', `${USAGE_LIMIT_PREFIX}%`)
  const caps = new Map<string, number>()
  for (const row of settings ?? []) {
    const metric = String(row.key).slice(USAGE_LIMIT_PREFIX.length)
    const raw = row.value
    const cap = Number(typeof raw === 'string' ? raw.trim() : raw)
    if (metric && Number.isFinite(cap) && cap > 0) caps.set(metric, cap)
  }
  if (caps.size === 0) return []

  const { data: counters } = await service
    .from('usage_counters')
    .select('metric, value')
    .eq('period', currentPeriod())
    .in('metric', [...caps.keys()])
  const used = new Map<string, number>()
  for (const row of counters ?? []) used.set(String(row.metric), Number(row.value))

  const alerts: UsageAlert[] = []
  for (const [metric, cap] of caps) {
    const value = used.get(metric) ?? 0
    const pct = Math.floor((value / cap) * 100)
    if (value >= cap) alerts.push({ key: `usage:${metric}:100`, metric, value, cap, pct })
    else if (value >= cap * 0.8) alerts.push({ key: `usage:${metric}:80`, metric, value, cap, pct })
  }
  return alerts
}

function buildAlert(
  failedChecks: ServiceStatus[],
  overdueJobs: string[],
  failingJobs: string[],
  usageAlerts: UsageAlert[],
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
  if (usageAlerts.length > 0) {
    lines.push('', '<b>用量預算警告：</b>')
    for (const u of usageAlerts) {
      lines.push(`• 用量警告:${esc(u.metric)} 本月 ${u.value} / 上限 ${u.cap} (${u.pct}%)`)
    }
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
  const { owner_email: ownerEmail } = await getOrgSettings(service, ['owner_email'])

  // a. Run every service health check.
  const services = await runAllHealthChecks()
  const failedChecks = services.filter((s) => s.status === 'error')

  // b. Inspect cron_runs freshness per expected job.
  const latest = await getLatestRunsPerJob(service)
  const overdueJobs: string[] = []
  const failingJobs: string[] = []
  for (const [job, expectedMin] of Object.entries(CRON_EXPECTED_INTERVAL_MIN)) {
    const run = latest[job]
    if (!run) {
      // Dead-man's switch: a registered job with NO heartbeat EVER (bad path,
      // rotated CRON_SECRET, never deployed) was previously skipped and thus
      // invisible. Treat it as overdue so a silently-dead cron surfaces.
      if (job !== SELF_JOB) overdueJobs.push(`${job}（從未執行）`)
      continue
    }
    // The watchdog excludes itself from the overdue check.
    if (job !== SELF_JOB && run.finished_at) {
      const ageMs = Date.now() - new Date(run.finished_at).getTime()
      if (ageMs > expectedMin * 3 * 60 * 1000) overdueJobs.push(job)
    }
    if (run.status === 'error') failingJobs.push(job)
  }

  // b2. Proactive usage-budget thresholds (see USAGE_LIMIT_PREFIX docs above).
  const usageAlerts = await checkUsageBudgets(service)

  // Canonical, sorted problem-key set for change detection.
  const problems: string[] = [
    ...failedChecks.map((s) => `check:${s.name}`),
    ...overdueJobs.map((j) => `overdue:${j}`),
    ...failingJobs.map((j) => `failing:${j}`),
    ...usageAlerts.map((u) => u.key),
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
      await notifyOwner(service, buildAlert(failedChecks, overdueJobs, failingJobs, usageAlerts), ownerEmail)
      alertSent = true
    }
  } else if (prevAlerted.length > 0) {
    // Everything is healthy again and we previously alerted → recovery notice.
    await notifyOwner(service, '✅ <b>myCRM 監控</b>：所有服務與排程已恢復正常。', ownerEmail)
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
